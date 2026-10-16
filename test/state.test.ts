import { describe, expect, it } from "vitest";

import type { LocalPlan } from "../src/types";

import { findOverwrites, snapshot } from "../src/sync/state";
import { local, synced } from "./fixtures";

describe("findOverwrites", () => {
  const previous = snapshot(local, synced());

  it("finds nothing when GitHub is unchanged since the last sync", () => {
    const edited: LocalPlan = {
      milestones: [{ ...local.milestones[0], title: "Renamed locally" }, local.milestones[1]],
      stories: [{ ...local.stories[0], title: "Renamed locally", closed: true }, local.stories[1]],
    };
    expect(findOverwrites(edited, synced(), previous)).toEqual([]);
  });

  it("lists fields changed on GitHub that sync up would revert", () => {
    const remote = synced();
    remote.issues[0].title = "Edited on GitHub";
    remote.issues[0].state = "CLOSED";
    remote.issues[1].labels.push({ id: "L-bug", name: "bug" });
    remote.milestones[1].dueOn = "2027-01-01T08:00:00Z";
    expect(findOverwrites(local, remote, previous)).toEqual([
      { kind: "milestone", number: 2, title: "UI", fields: ["due date"], unknown: false },
      { kind: "issue", number: 10, title: "Edited on GitHub", fields: ["title", "state"], unknown: false },
    ]);
  });

  it("ignores GitHub changes the files already match", () => {
    const remote = synced();
    remote.issues[0].title = "Same on both sides";
    const plan: LocalPlan = { ...local, stories: [{ ...local.stories[0], title: "Same on both sides" }, local.stories[1]] };
    expect(findOverwrites(plan, remote, previous)).toEqual([]);
  });

  it("treats every difference as a possible overwrite when no sync was recorded", () => {
    const plan: LocalPlan = { ...local, stories: [{ ...local.stories[0], title: "Renamed locally" }, local.stories[1]] };
    expect(findOverwrites(plan, synced(), null)).toEqual([
      { kind: "issue", number: 10, title: "Init", fields: ["title"], unknown: true },
    ]);
  });
});
