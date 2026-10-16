import type { RemoteIssue, RemoteMilestone, RemoteState } from "../src/sync/diff";
import type { LocalPlan } from "../src/types";

import { milestoneDescription, storyBody } from "../src/sync/diff";

export const local: LocalPlan = {
  milestones: [
    { id: "001", title: "Setup", description: "Setup things", label: "Setup", dueOn: "2026-12-01", path: "001/milestone.md" },
    { id: "002", title: "UI", description: "", label: "UI", dueOn: null, path: "002/milestone.md" },
  ],
  stories: [
    { id: "001-001", milestoneId: "001", title: "Init", body: "Do init", label: "Setup", closed: false, path: "001-001.md" },
    { id: "002-001", milestoneId: "002", title: "Navbar", body: "Add navbar", label: "UI", closed: false, path: "002-001.md" },
  ],
};

function syncedMilestones(): RemoteMilestone[] {
  return local.milestones.map((milestone, index) => ({
    number: index + 1,
    nodeId: `M${index + 1}`,
    title: milestone.title,
    description: milestoneDescription(milestone),
    dueOn: milestone.dueOn ? `${milestone.dueOn}T08:00:00Z` : null,
    state: "open",
  }));
}

function syncedIssues(): RemoteIssue[] {
  return local.stories.map((story, index) => ({
    id: `I${index + 1}`,
    number: index + 10,
    title: story.title,
    body: storyBody(story),
    state: "OPEN",
    milestoneId: `M${Number(story.milestoneId)}`,
    labels: [{ id: `L-${story.label}`, name: story.label }],
  }));
}

export function synced(): RemoteState {
  return {
    labels: [{ id: "L-Setup", name: "Setup" }, { id: "L-UI", name: "UI" }],
    milestones: syncedMilestones(),
    issues: syncedIssues(),
    projectIssueIds: new Set(["I1", "I2"]),
  };
}
