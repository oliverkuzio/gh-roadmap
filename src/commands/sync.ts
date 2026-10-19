import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { createInterface } from "node:readline/promises";

import type { ProjectInfo } from "../github/types";
import type { Action } from "../sync/diff";
import type { LocalPlan } from "../types";

import {
  addToProject,
  closeIssue,
  createIssue,
  createLabel,
  createMilestone,
  createProject,
  findProject,
  getProjectInfo,
  getRepository,
  initClient,
  listIssues,
  listLabels,
  listMilestones,
  listProjectIssueIds,
  updateIssue,
  updateMilestone,
} from "../github/client";
import { readConfig, readLocalPlan } from "../local";
import { resolveRepo } from "../repo";
import { describeAction, diff, milestoneDescription, storyBody } from "../sync/diff";
import { diffDown } from "../sync/down";
import { describeOverwrite, findOverwrites, readSyncState, snapshot, writeSyncState } from "../sync/state";

export type Direction = "up" | "down";

export async function sync({ dir, dryRun, direction, yes }: {
  dir: string;
  dryRun: boolean;
  direction: Direction;
  // Overwrite changes made on GitHub without asking
  yes: boolean;
}) {
  const config = readConfig(dir);
  const local = readLocalPlan(dir);

  const target = resolveRepo(config, process.cwd());
  if (!target) {
    throw new Error(`Could not determine the GitHub repository. Set "owner" and "repo" in ${dir}/config.json.`);
  }
  const { owner, repo } = target;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN must be set in the environment or .env");
  }
  initClient(token);

  console.log(`Syncing ${dir} ${direction === "up" ? "to" : "from"} ${owner}/${repo}${dryRun ? " (dry run)" : ""}`);

  if (direction === "down") {
    await syncDown({ dir, dryRun, owner, repo, projectTitle: config.project, local });
    return;
  }

  const { repositoryId, ownerId } = await getRepository({ owner, repo });

  let projectInfo: ProjectInfo | null = null;
  const project = await findProject({ owner, repo, title: config.project });
  if (project) {
    projectInfo = await getProjectInfo(project, config.status, false);
  }
  else if (dryRun) {
    console.log(`+ project "${config.project}"`);
  }
  else {
    console.log(`Creating project "${config.project}"`);
    const created = await createProject({ ownerId, repositoryId, title: config.project });
    projectInfo = await getProjectInfo(created, config.status, true);
  }

  const [labels, milestones, issues, projectIssueIds] = await Promise.all([
    listLabels({ owner, repo }),
    listMilestones({ owner, repo }),
    listIssues({ owner, repo }),
    projectInfo ? listProjectIssueIds(projectInfo.projectId) : Promise.resolve(new Set<string>()),
  ]);

  const remote = { labels, milestones, issues, projectIssueIds };
  const actions = diff(local, remote);

  if (actions.length === 0) {
    if (!dryRun) {
      writeSyncState(dir, snapshot(local, remote));
    }
    console.log("Everything is up to date.");
    return;
  }

  const overwrites = findOverwrites(local, remote, readSyncState(dir));
  if (overwrites.length > 0) {
    console.log(overwrites.some(overwrite => overwrite.unknown)
      ? "\nNo earlier sync is recorded, so these differences may be edits made on GitHub. Sync up will overwrite them:"
      : "\nThese were changed on GitHub since the last sync. Sync up will overwrite them:");
    overwrites.forEach(overwrite => console.log(`  ${describeOverwrite(overwrite)}`));
    console.log("");
  }

  if (dryRun) {
    actions.forEach(action => console.log(describeAction(action)));
    console.log(`\n${actions.length} change(s) would be made.`);
    return;
  }

  if (overwrites.length > 0 && !yes && !(await confirm("Overwrite the changes on GitHub?"))) {
    console.log("Nothing was changed. Run \"gh-roadmap sync down\" to pull the GitHub changes into .github/project first.");
    return;
  }

  await apply(actions, { owner, repo, repositoryId, projectInfo: projectInfo!, labels });

  // Re-read GitHub so the recorded state includes what was just created
  const [syncedMilestones, syncedIssues] = await Promise.all([listMilestones({ owner, repo }), listIssues({ owner, repo })]);
  writeSyncState(dir, snapshot(local, { milestones: syncedMilestones, issues: syncedIssues }));

  console.log(`\nApplied ${actions.length} change(s). Project: ${projectInfo!.url}`);
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error("Changes made on GitHub would be overwritten. Rerun with --yes to overwrite them, or run \"gh-roadmap sync down\" first.");
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`${question} [y/N] `);
    return /^y(?:es)?$/i.test(answer.trim());
  }
  finally {
    prompt.close();
  }
}

// Updates the .github/project files from GitHub. Nothing on GitHub is changed.
async function syncDown({ dir, dryRun, owner, repo, projectTitle, local }: {
  dir: string;
  dryRun: boolean;
  owner: string;
  repo: string;
  projectTitle: string;
  local: LocalPlan;
}) {
  const project = await findProject({ owner, repo, title: projectTitle });
  const [milestones, issues, projectIssueIds] = await Promise.all([
    listMilestones({ owner, repo }),
    listIssues({ owner, repo }),
    project ? listProjectIssueIds(project.id) : Promise.resolve(new Set<string>()),
  ]);

  const { files, warnings } = diffDown(local, { milestones, issues, projectIssueIds }, path => readFileSync(path, "utf-8"));

  for (const file of files) {
    console.log(`< ${relative(dir, file.path)} (${file.changes.join(", ")})`);
    if (!dryRun) {
      writeFileSync(file.path, file.content);
    }
  }
  if (!dryRun) {
    writeSyncState(dir, snapshot(local, { milestones, issues }));
  }
  for (const warning of warnings) {
    console.warn(`! ${warning}`);
  }

  if (files.length === 0) {
    console.log("Everything is up to date.");
  }
  else {
    console.log(`\n${files.length} file(s) ${dryRun ? "would be updated" : "updated"}.`);
  }
}

async function apply(actions: Action[], context: {
  owner: string;
  repo: string;
  repositoryId: string;
  projectInfo: ProjectInfo;
  labels: Array<{ id: string; name: string }>;
}) {
  const { owner, repo, repositoryId, projectInfo } = context;

  const labelIds = new Map(context.labels.map(label => [label.name.toLowerCase(), label.id]));
  const labelId = (name: string) => {
    const id = labelIds.get(name.toLowerCase());
    if (!id) {
      throw new Error(`Label "${name}" not found`);
    }
    return id;
  };

  // Node ids of milestones created during this run, keyed by local milestone id
  const createdMilestones = new Map<string, string>();
  const milestoneId = (action: { milestoneNodeId: string | null; story: { milestoneId: string } }) =>
    action.milestoneNodeId ?? createdMilestones.get(action.story.milestoneId) ?? null;

  for (const action of actions) {
    console.log(describeAction(action));

    switch (action.type) {
      case "createLabel": {
        const label = await createLabel({ repositoryId, name: action.name });
        labelIds.set(label.name.toLowerCase(), label.id);
        break;
      }
      case "createMilestone": {
        const milestone = await createMilestone({
          owner,
          repo,
          milestone: {
            title: action.milestone.title,
            description: milestoneDescription(action.milestone),
            dueOn: action.milestone.dueOn,
          },
        });
        createdMilestones.set(action.milestone.id, milestone.nodeId);
        break;
      }
      case "updateMilestone":
        await updateMilestone({
          owner,
          repo,
          number: action.number,
          milestone: {
            title: action.milestone.title,
            description: milestoneDescription(action.milestone),
            dueOn: action.milestone.dueOn,
            state: "open",
          },
        });
        break;
      case "closeMilestone":
        await updateMilestone({ owner, repo, number: action.number, milestone: { state: "closed" } });
        break;
      case "createIssue": {
        const issue = await createIssue({
          repositoryId,
          issue: {
            title: action.story.title,
            body: storyBody(action.story),
            labelIds: [labelId(action.story.label)],
            milestoneId: milestoneId(action),
          },
        });
        await addToProject({ issueId: issue.id, projectInfo });
        if (action.story.closed) {
          await closeIssue(issue.id, "COMPLETED");
        }
        break;
      }
      case "updateIssue":
        await updateIssue({
          id: action.issueId,
          issue: {
            title: action.story.title,
            body: storyBody(action.story),
            labelIds: action.labels.map(labelId),
            milestoneId: milestoneId(action),
          },
          reopen: action.changes.includes("reopen"),
        });
        break;
      case "addToProject":
        await addToProject({ issueId: action.issueId, projectInfo });
        break;
      case "closeIssue":
        await closeIssue(action.issueId, action.reason);
        break;
    }
  }
}
