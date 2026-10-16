import { describe, expect, it } from "vitest";

import type { LocalPlan } from "../src/types";

import { diff } from "../src/sync/diff";
import { local, synced } from "./fixtures";

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
      { type: "closeIssue", issueId: "I2", reason: "NOT_PLANNED" },
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

  it("closes the issue of a story closed locally", () => {
    const plan: LocalPlan = { ...local, stories: [{ ...local.stories[0], closed: true }, local.stories[1]] };
    expect(diff(plan, synced())).toEqual([
      { type: "closeIssue", issueId: "I1", number: 10, title: "Init", reason: "COMPLETED" },
    ]);
  });

  it("overwrites title edits made on GitHub and reopens issues of open stories", () => {
    const remote = synced();
    remote.issues[0].state = "CLOSED";
    remote.issues[0].title = "Edited on GitHub";
    expect(diff(local, remote)).toMatchObject([
      { type: "updateIssue", issueId: "I1", changes: ["title", "reopen"] },
    ]);
  });

  it("leaves a story closed on both sides alone", () => {
    const plan: LocalPlan = { ...local, stories: [{ ...local.stories[0], closed: true }, local.stories[1]] };
    const remote = synced();
    remote.issues[0].state = "CLOSED";
    expect(diff(plan, remote)).toEqual([]);
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
