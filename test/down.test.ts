import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { LocalPlan } from "../src/types";

import { readLocalPlan } from "../src/local";
import { milestoneDescription, storyBody } from "../src/sync/diff";
import { diffDown, parseUserStory } from "../src/sync/down";
import { local, synced } from "./fixtures";

const files: Record<string, string> = {
  "001/milestone.md": "---\ntitle: Setup\ndue_on: 2026-12-01\n---\n\nSetup things\n",
  "002/milestone.md": "---\ntitle: UI\n---\n",
  "001-001.md": "---\ntitle: Init\nlabel: Setup # keep\nrole:\nstate: open\n---\n\nDo init\n",
  "002-001.md": "---\ntitle: Navbar\nstate: open\n---\n\nAdd navbar\n",
};

function down(plan: LocalPlan, remote = synced()) {
  return diffDown(plan, remote, path => files[path]);
}

describe("parseUserStory", () => {
  it("reverses the generated title and body", () => {
    expect(parseUserStory("As a guest, I want to log in", "As a guest, I want to log in so that I can see e.g. my posts.\n\n- [ ] AC"))
      .toEqual({ role: "guest", action: "log in", benefit: "I can see e.g. my posts", description: "- [ ] AC" });
    expect(parseUserStory("As a guest, I want to log in", "As a guest, I want to log in so that I can."))
      .toMatchObject({ benefit: "I can", description: "" });
  });

  it("returns null when the issue no longer follows the pattern", () => {
    expect(parseUserStory("Log in", "As a guest, I want to log in so that I can.")).toBeNull();
    expect(parseUserStory("As a guest, I want to log in", "Rewritten body")).toBeNull();
  });
});

describe("diffDown", () => {
  it("changes nothing when in sync", () => {
    expect(down(local)).toEqual({ files: [], warnings: [] });
  });

  it("round-trips the template stories unchanged", () => {
    const plan = readLocalPlan(join(import.meta.dirname, "../template"));
    const milestones = plan.milestones.map((milestone, index) => ({
      number: index + 1,
      nodeId: `M${milestone.id}`,
      title: milestone.title,
      description: milestoneDescription(milestone),
      dueOn: milestone.dueOn,
      state: "open" as const,
    }));
    const issues = plan.stories.map((story, index) => ({
      id: `I${index}`,
      number: index,
      title: story.title,
      body: storyBody(story),
      state: "OPEN" as const,
      milestoneId: `M${story.milestoneId}`,
      labels: [{ id: story.label, name: story.label }],
    }));
    const result = diffDown(plan, { milestones, issues, projectIssueIds: new Set() }, path => readFileSync(path, "utf-8"));
    expect(result).toEqual({ files: [], warnings: [] });
  });

  it("pulls state, title and body edits into the story file", () => {
    const remote = synced();
    remote.issues[0].state = "CLOSED";
    remote.issues[0].title = "Initialize: repo";
    remote.issues[0].body = "Done differently\n\n<!-- gh-roadmap:story:001-001 -->";
    expect(down(local, remote).files).toEqual([{
      path: "001-001.md",
      changes: ["title", "body", "state"],
      content: "---\ntitle: \"Initialize: repo\"\nlabel: Setup # keep\nrole:\nstate: closed\n---\n\nDone differently\n",
    }]);
  });

  it("adds a missing state line", () => {
    const plan: LocalPlan = { ...local, stories: [{ ...local.stories[0], path: "bare.md" }] };
    files["bare.md"] = "---\ntitle: Init\n---\n\nDo init\n";
    expect(down(plan).files).toMatchObject([{ changes: ["state"], content: "---\ntitle: Init\nstate: open\n---\n\nDo init\n" }]);
  });

  it("writes user stories back as role, action and benefit", () => {
    const remote = synced();
    remote.issues[1].title = "As a visitor, I want to navigate";
    remote.issues[1].body = "As a visitor, I want to navigate so that I find pages.\n\n- [ ] Links\n\n<!-- gh-roadmap:story:002-001 -->";
    expect(down(local, remote).files[0].content).toBe(
      "---\ntitle: Navbar\nstate: open\nrole: visitor\naction: navigate\nbenefit: I find pages\n---\n\n- [ ] Links\n",
    );
  });

  it("pulls a changed roadmap label and warns about ones it can't tell apart", () => {
    const remote = synced();
    remote.issues[0].labels = [{ id: "L-UI", name: "UI" }, { id: "L-bug", name: "bug" }];
    remote.issues[1].labels = [];
    const { files: changed, warnings } = down(local, remote);
    expect(changed).toMatchObject([{ path: "001-001.md", changes: ["label"] }]);
    expect(changed[0].content).toContain("label: UI # keep\n");
    expect(warnings).toEqual([expect.stringContaining("#11 \"Navbar\" has no roadmap label")]);
  });

  it("updates milestone files and pins the label when the title changes", () => {
    const remote = synced();
    remote.milestones[0].title = "Foundations";
    remote.milestones[0].dueOn = null;
    expect(down(local, remote).files).toEqual([{
      path: "001/milestone.md",
      changes: ["title", "due date"],
      content: "---\ntitle: Foundations\ndue_on:\nlabel: Setup\n---\n\nSetup things\n",
    }]);
  });

  it("warns about moved issues and issues without a file", () => {
    const remote = synced();
    remote.issues[0].milestoneId = "M2";
    remote.issues.push({ id: "X", number: 99, title: "Manual", body: "", state: "OPEN", milestoneId: null, labels: [] });
    remote.projectIssueIds.add("X");
    expect(down(local, remote).warnings).toEqual([
      expect.stringContaining("#10 \"Init\" was moved to milestone \"UI\""),
      expect.stringContaining("#99 \"Manual\" is on the project board but has no story file"),
    ]);
  });
});
