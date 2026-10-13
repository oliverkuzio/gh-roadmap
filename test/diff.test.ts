import { describe, expect, it } from "vitest";

import type { RemoteIssue, RemoteMilestone, RemoteState } from "../src/sync/diff";
import type { LocalPlan } from "../src/types";

import { diff, milestoneDescription, storyBody } from "../src/sync/diff";

const local: LocalPlan = {
  milestones: [
    { id: "001", title: "Setup", description: "Setup things", label: "Setup", dueOn: "2026-12-01" },
    { id: "002", title: "UI", description: "", label: "UI", dueOn: null },
  ],
  stories: [
    { id: "001-001", milestoneId: "001", title: "Init", body: "Do init", label: "Setup" },
    { id: "002-001", milestoneId: "002", title: "Navbar", body: "Add navbar", label: "UI" },
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

function synced(): RemoteState {
  return {
    labels: [{ id: "L-Setup", name: "Setup" }, { id: "L-UI", name: "UI" }],
    milestones: syncedMilestones(),
    issues: syncedIssues(),
    projectIssueIds: new Set(["I1", "I2"]),
  };
}

describe("diff", () => {
  it("creates everything for an empty repository", () => {
    const actions = diff(local, { labels: [], milestones: [], issues: [], projectIssueIds: new Set() });
    expect(actions.map(a => a.type)).toEqual([
      "createLabel",
      "createLabel",
      "createMilestone",
      "createMilestone",
      "createIssue",
      "createIssue",
    ]);
  });

  it("does nothing when in sync", () => {
    expect(diff(local, synced())).toEqual([]);
  });

  it("treats label names case-insensitively", () => {
    const remote = synced();
    remote.labels = [{ id: "L-Setup", name: "setup" }, { id: "L-UI", name: "ui" }];
    remote.issues.forEach(issue => issue.labels.forEach(label => (label.name = label.name.toLowerCase())));
    expect(diff(local, remote)).toEqual([]);
  });

  it("updates a changed title and milestone", () => {
    const remote = synced();
    remote.issues[0].title = "Old title";
    remote.issues[0].milestoneId = "M2";
    const actions = diff(local, remote);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "updateIssue", issueId: "I1", milestoneNodeId: "M1", changes: ["title", "milestone"] });
  });

  it("updates milestone fields and reopens closed milestones", () => {
    const remote = synced();
    remote.milestones[0].dueOn = null;
    remote.milestones[1].state = "closed";
    const actions = diff(local, remote);
    expect(actions).toMatchObject([
      { type: "updateMilestone", number: 1, changes: ["due date"] },
      { type: "updateMilestone", number: 2, changes: ["reopen"] },
    ]);
  });

  it("closes issues and milestones whose files were removed", () => {
    const plan: LocalPlan = { milestones: [local.milestones[0]], stories: [local.stories[0]] };
    const actions = diff(plan, synced());
    expect(actions).toMatchObject([
      { type: "closeMilestone", number: 2 },
      { type: "closeIssue", issueId: "I2" },
    ]);
  });

  it("does not close already-closed or unmarked items", () => {
    const remote = synced();
    remote.issues[1].state = "CLOSED";
    remote.issues.push({ id: "X", number: 99, title: "Manual", body: "", state: "OPEN", milestoneId: null, labels: [] });
    const plan: LocalPlan = { milestones: local.milestones, stories: [local.stories[0]] };
    expect(diff(plan, remote)).toEqual([]);
  });

  it("reopens an issue when its file is restored", () => {
    const remote = synced();
    remote.issues[1].state = "CLOSED";
    expect(diff(local, remote)).toMatchObject([{ type: "updateIssue", issueId: "I2", changes: ["reopen"] }]);
  });

  it("adopts unmarked issues by title and keeps unmanaged labels", () => {
    const remote = synced();
    remote.issues[0].body = "legacy body";
    remote.issues[0].labels.push({ id: "L-bug", name: "bug" });
    const actions = diff(local, remote);
    expect(actions).toMatchObject([
      { type: "updateIssue", issueId: "I1", changes: ["body"] },
    ]);
  });

  it("replaces a managed label when a story changes label", () => {
    const remote = synced();
    remote.issues[0].labels = [{ id: "L-UI", name: "UI" }, { id: "L-bug", name: "bug" }];
    expect(diff(local, remote)).toMatchObject([
      { type: "updateIssue", issueId: "I1", labels: ["bug", "Setup"], changes: ["labels"] },
    ]);
  });

  it("leaves the milestone unresolved when it is created in the same run", () => {
    const remote = synced();
    remote.milestones = [remote.milestones[0]];
    const actions = diff(local, remote);
    expect(actions).toMatchObject([
      { type: "createMilestone" },
      { type: "updateIssue", issueId: "I2", milestoneNodeId: null, changes: ["milestone"] },
    ]);
  });

  it("adds existing issues missing from the project", () => {
    const remote = synced();
    remote.projectIssueIds = new Set(["I1"]);
    expect(diff(local, remote)).toMatchObject([{ type: "addToProject", issueId: "I2" }]);
  });
});
