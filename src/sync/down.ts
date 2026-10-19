import type { LocalPlan, MilestoneFrontMatter, StoryFrontMatter } from "../types";
import type { RemoteState } from "./diff";

import { parseMarkdown, updateMarkdown } from "../parse";
import { matchIssues, matchMilestones, normalize } from "./diff";
import { stripMarker } from "./markers";

export type FileChange = {
  path: string;
  content: string;
  changes: string[];
};

const USER_STORY_TITLE = /^As a (.+?), I want to (.+)$/;

// Reverses how a story with role/action/benefit is turned into an issue title and body.
// Returns null when the issue no longer follows that pattern.
export function parseUserStory(title: string, body: string) {
  const match = title.match(USER_STORY_TITLE);
  if (!match) {
    return null;
  }
  const [, role, action] = match;
  const prefix = `As a ${role}, I want to ${action} so that `;
  if (!body.startsWith(prefix)) {
    return null;
  }
  const rest = body.slice(prefix.length);
  const end = rest.search(/\.(?:\n\n|$)/);
  if (end === -1) {
    return null;
  }
  return { role, action, benefit: rest.slice(0, end), description: rest.slice(end + 1).trim() };
}

// Works out how the .github/roadmap files change to match GitHub. Only items that already have a file
// are updated; anything that can't be expressed in the files is returned as a warning.
export function diffDown(
  local: LocalPlan,
  remote: Omit<RemoteState, "labels">,
  readFile: (path: string) => string,
): { files: FileChange[]; warnings: string[] } {
  const files: FileChange[] = [];
  const warnings: string[] = [];

  // Milestones
  const milestoneMatch = matchMilestones(local, remote);

  for (const milestone of local.milestones) {
    const existing = milestoneMatch.matches.get(milestone.id);
    if (!existing) {
      continue;
    }

    const title = normalize(existing.title);
    const description = stripMarker(existing.description);
    const dueOn = existing.dueOn?.slice(0, 10) ?? null;

    const changes: string[] = [];
    if (title !== milestone.title) {
      changes.push("title");
    }
    if (description !== normalize(milestone.description)) {
      changes.push("description");
    }
    if (dueOn !== milestone.dueOn) {
      changes.push("due date");
    }
    if (changes.length === 0) {
      continue;
    }

    const content = readFile(milestone.path);
    const { frontmatter } = parseMarkdown<MilestoneFrontMatter>(content);
    const values: Record<string, string | null> = { title, due_on: dueOn };
    // The label defaults to the title, so pin it to keep the issues' labels when the title changes
    if (!frontmatter.label?.trim() && title !== milestone.title) {
      values.label = milestone.label;
    }
    files.push({ path: milestone.path, content: updateMarkdown(content, values, description), changes });
  }

  // Stories
  const milestoneNodeIds = new Map(
    [...milestoneMatch.matches].map(([id, milestone]) => [id, milestone.nodeId]),
  );
  const milestoneTitles = new Map(remote.milestones.map(milestone => [milestone.nodeId, milestone.title]));
  const managedLabels = [...local.milestones.map(m => m.label), ...local.stories.map(s => s.label)]
    .map(label => label.toLowerCase());

  const issueMatch = matchIssues(local, remote);

  for (const story of local.stories) {
    const existing = issueMatch.matches.get(story.id);
    if (!existing) {
      continue;
    }

    const title = normalize(existing.title);
    const body = stripMarker(existing.body);
    const closed = existing.state === "CLOSED";
    const content = readFile(story.path);
    const { frontmatter } = parseMarkdown<StoryFrontMatter>(content);

    const changes: string[] = [];
    if (title !== story.title) {
      changes.push("title");
    }
    if (body !== normalize(story.body)) {
      changes.push("body");
    }
    if (closed !== story.closed || !frontmatter.state) {
      changes.push("state");
    }

    const values: Record<string, string | null> = { state: closed ? "closed" : "open" };
    const userStory = parseUserStory(title, body);
    if (userStory) {
      values.role = userStory.role;
      values.action = userStory.action;
      values.benefit = userStory.benefit;
    }
    else {
      values.title = title;
      values.role = null;
      values.action = null;
      values.benefit = null;
    }

    const labels = existing.labels.filter(label => managedLabels.includes(label.name.toLowerCase()));
    if (labels.length === 1) {
      if (labels[0].name.toLowerCase() !== story.label.toLowerCase()) {
        values.label = labels[0].name;
        changes.push("label");
      }
    }
    else {
      warnings.push(`Issue #${existing.number} "${title}" has ${labels.length === 0 ? "no roadmap label" : "more than one roadmap label"}, so the label of story ${story.id} was left as is`);
    }

    const milestoneNodeId = milestoneNodeIds.get(story.milestoneId);
    if (milestoneNodeId && existing.milestoneId !== milestoneNodeId) {
      const moved = existing.milestoneId ? `moved to milestone "${milestoneTitles.get(existing.milestoneId)}"` : "removed from its milestone";
      warnings.push(`Issue #${existing.number} "${title}" was ${moved} on GitHub. Move ${story.path} by hand, or sync up will put it back`);
    }

    if (changes.length > 0) {
      files.push({ path: story.path, content: updateMarkdown(content, values, userStory?.description ?? body), changes });
    }
  }

  const matched = new Set([...issueMatch.matches.values()].map(issue => issue.id));
  for (const issue of remote.issues) {
    if (issue.state === "OPEN" && remote.projectIssueIds.has(issue.id) && !matched.has(issue.id)) {
      warnings.push(`Issue #${issue.number} "${issue.title}" is on the project board but has no story file`);
    }
  }

  return { files, warnings };
}
