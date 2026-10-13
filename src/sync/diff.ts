import type { LocalMilestone, LocalPlan, LocalStory } from "../types";
import type { MarkerKind } from "./markers";

import { readMarker, withMarker } from "./markers";

export type RemoteLabel = {
  id: string;
  name: string;
};

export type RemoteMilestone = {
  number: number;
  nodeId: string;
  title: string;
  description: string | null;
  dueOn: string | null;
  state: "open" | "closed";
};

export type RemoteIssue = {
  id: string;
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  milestoneId: string | null;
  labels: RemoteLabel[];
};

export type RemoteState = {
  milestones: RemoteMilestone[];
  issues: RemoteIssue[];
  labels: RemoteLabel[];
  projectIssueIds: Set<string>;
};

export type Action =
  | { type: "createLabel"; name: string }
  | { type: "createMilestone"; milestone: LocalMilestone }
  | { type: "updateMilestone"; number: number; milestone: LocalMilestone; changes: string[] }
  | { type: "closeMilestone"; number: number; title: string }
  // milestoneNodeId is null when the milestone is created in the same run
  | { type: "createIssue"; story: LocalStory; milestoneNodeId: string | null }
  | { type: "updateIssue"; issueId: string; number: number; story: LocalStory; milestoneNodeId: string | null; labels: string[]; changes: string[] }
  | { type: "addToProject"; issueId: string; number: number; title: string }
  | { type: "closeIssue"; issueId: string; number: number; title: string };

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").trim();
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Pairs each local item with a remote one: first by hidden marker, then (for remotes without
// a marker, e.g. created by an earlier version of this tool) by exact title.
function matchRemotes<R>(
  locals: Array<{ id: string; title: string }>,
  remotes: R[],
  kind: MarkerKind,
  getText: (remote: R) => string | null,
  getTitle: (remote: R) => string,
  isOpen: (remote: R) => boolean,
): { matches: Map<string, R>; orphans: R[] } {
  const localIds = new Set(locals.map(local => local.id));
  const matches = new Map<string, R>();
  const orphans: R[] = [];
  const unmarked: R[] = [];

  for (const remote of remotes) {
    const marker = readMarker(getText(remote));
    if (!marker || marker.kind !== kind) {
      unmarked.push(remote);
      continue;
    }
    if (!localIds.has(marker.id)) {
      orphans.push(remote);
      continue;
    }
    const existing = matches.get(marker.id);
    if (!existing || (!isOpen(existing) && isOpen(remote))) {
      matches.set(marker.id, remote);
    }
  }

  for (const local of locals) {
    if (matches.has(local.id)) {
      continue;
    }
    const index = unmarked.findIndex(remote => normalize(getTitle(remote)) === local.title);
    if (index !== -1) {
      matches.set(local.id, unmarked[index]);
      unmarked.splice(index, 1);
    }
  }

  return { matches, orphans };
}

export function milestoneDescription(milestone: LocalMilestone): string {
  return withMarker(milestone.description, "milestone", milestone.id);
}

export function storyBody(story: LocalStory): string {
  return withMarker(story.body, "story", story.id);
}

export function diff(local: LocalPlan, remote: RemoteState): Action[] {
  const labelActions: Action[] = [];
  const milestoneActions: Action[] = [];
  const issueActions: Action[] = [];
  const projectActions: Action[] = [];
  const closeActions: Action[] = [];

  // Labels
  const managedLabels = [...local.milestones.map(m => m.label), ...local.stories.map(s => s.label)];
  const knownLabels = remote.labels.map(label => label.name);
  for (const name of managedLabels) {
    if (!knownLabels.some(known => sameName(known, name))) {
      knownLabels.push(name);
      labelActions.push({ type: "createLabel", name });
    }
  }

  // Milestones
  const milestoneMatch = matchRemotes(
    local.milestones,
    remote.milestones,
    "milestone",
    m => m.description,
    m => m.title,
    m => m.state === "open",
  );

  for (const milestone of local.milestones) {
    const existing = milestoneMatch.matches.get(milestone.id);
    if (!existing) {
      milestoneActions.push({ type: "createMilestone", milestone });
      continue;
    }

    const changes: string[] = [];
    if (normalize(existing.title) !== milestone.title) {
      changes.push("title");
    }
    if (normalize(existing.description) !== normalize(milestoneDescription(milestone))) {
      changes.push("description");
    }
    if ((existing.dueOn?.slice(0, 10) ?? null) !== milestone.dueOn) {
      changes.push("due date");
    }
    if (existing.state !== "open") {
      changes.push("reopen");
    }
    if (changes.length > 0) {
      milestoneActions.push({ type: "updateMilestone", number: existing.number, milestone, changes });
    }
  }

  for (const orphan of milestoneMatch.orphans) {
    if (orphan.state === "open") {
      closeActions.push({ type: "closeMilestone", number: orphan.number, title: orphan.title });
    }
  }

  // Issues
  const milestoneNodeIds = new Map(
    [...milestoneMatch.matches].map(([id, milestone]) => [id, milestone.nodeId]),
  );

  const issueMatch = matchRemotes(
    local.stories,
    remote.issues,
    "story",
    issue => issue.body,
    issue => issue.title,
    issue => issue.state === "OPEN",
  );

  for (const story of local.stories) {
    const existing = issueMatch.matches.get(story.id);
    const milestoneNodeId = milestoneNodeIds.get(story.milestoneId) ?? null;
    if (!existing) {
      issueActions.push({ type: "createIssue", story, milestoneNodeId });
      continue;
    }

    const changes: string[] = [];
    if (normalize(existing.title) !== story.title) {
      changes.push("title");
    }
    if (normalize(existing.body) !== normalize(storyBody(story))) {
      changes.push("body");
    }
    if (!milestoneNodeId || existing.milestoneId !== milestoneNodeId) {
      changes.push("milestone");
    }

    // Keep labels this tool doesn't manage (e.g. "bug"), replace the managed ones with the story's label
    const labels = [
      ...existing.labels
        .map(label => label.name)
        .filter(name => !managedLabels.some(managed => sameName(managed, name))),
      story.label,
    ];
    const currentLabels = existing.labels.map(label => label.name.toLowerCase()).sort();
    if (currentLabels.join("\n") !== labels.map(label => label.toLowerCase()).sort().join("\n")) {
      changes.push("labels");
    }
    if (existing.state !== "OPEN") {
      changes.push("reopen");
    }

    if (changes.length > 0) {
      issueActions.push({ type: "updateIssue", issueId: existing.id, number: existing.number, story, milestoneNodeId, labels, changes });
    }
    if (!remote.projectIssueIds.has(existing.id)) {
      projectActions.push({ type: "addToProject", issueId: existing.id, number: existing.number, title: story.title });
    }
  }

  for (const orphan of issueMatch.orphans) {
    if (orphan.state === "OPEN") {
      closeActions.push({ type: "closeIssue", issueId: orphan.id, number: orphan.number, title: orphan.title });
    }
  }

  return [...labelActions, ...milestoneActions, ...issueActions, ...projectActions, ...closeActions];
}

export function describeAction(action: Action): string {
  switch (action.type) {
    case "createLabel":
      return `+ label "${action.name}"`;
    case "createMilestone":
      return `+ milestone ${action.milestone.id} "${action.milestone.title}"`;
    case "updateMilestone":
      return `~ milestone ${action.milestone.id} "${action.milestone.title}" (${action.changes.join(", ")})`;
    case "closeMilestone":
      return `- close milestone "${action.title}"`;
    case "createIssue":
      return `+ issue ${action.story.id} "${action.story.title}"`;
    case "updateIssue":
      return `~ issue #${action.number} ${action.story.id} "${action.story.title}" (${action.changes.join(", ")})`;
    case "addToProject":
      return `+ add issue #${action.number} "${action.title}" to project`;
    case "closeIssue":
      return `- close issue #${action.number} "${action.title}"`;
  }
}
