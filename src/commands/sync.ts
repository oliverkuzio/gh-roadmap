import type { ProjectInfo } from "../github/types";
import type { Action } from "../sync/diff";

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

export async function sync({ dir, dryRun }: { dir: string; dryRun: boolean }) {
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

  console.log(`Syncing ${dir} to ${owner}/${repo}${dryRun ? " (dry run)" : ""}`);

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

  const actions = diff(local, { labels, milestones, issues, projectIssueIds });

  if (actions.length === 0) {
    console.log("Everything is up to date.");
    return;
  }

  if (dryRun) {
    actions.forEach(action => console.log(describeAction(action)));
    console.log(`\n${actions.length} change(s) would be made.`);
    return;
  }

  await apply(actions, { owner, repo, repositoryId, projectInfo: projectInfo!, labels });

  console.log(`\nApplied ${actions.length} change(s). Project: ${projectInfo!.url}`);
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
        });
        break;
      case "addToProject":
        await addToProject({ issueId: action.issueId, projectInfo });
        break;
      case "closeIssue":
        await closeIssue(action.issueId);
        break;
    }
  }
}
