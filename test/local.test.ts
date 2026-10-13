import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { readLocalPlan } from "../src/local";
import { parseMarkdown } from "../src/parse";

const templateDir = join(import.meta.dirname, "../template");

describe("parseMarkdown", () => {
  it("keeps horizontal rules in the body", () => {
    const { frontmatter, description } = parseMarkdown<{ title: string }>("---\ntitle: A\n---\n\nOne\n\n---\n\nTwo\n");
    expect(frontmatter.title).toBe("A");
    expect(description).toBe("One\n\n---\n\nTwo");
  });

  it("handles empty frontmatter and no frontmatter", () => {
    expect(parseMarkdown("---\n---\nBody")).toEqual({ frontmatter: {}, description: "Body" });
    expect(parseMarkdown("Body")).toEqual({ frontmatter: {}, description: "Body" });
  });
});

describe("readLocalPlan", () => {
  const plan = readLocalPlan(templateDir);

  it("reads the template milestones", () => {
    expect(plan.milestones.map(m => [m.id, m.title, m.label])).toEqual([
      ["001", "Project Setup", "Project Setup"],
      ["002", "User Interface", "User Interface"],
      ["003", "Authentication", "Authentication"],
      ["999", "Release", "Release"],
    ]);
  });

  it("reads every template story, ordered by id", () => {
    const ids = plan.stories.map(s => s.id);
    expect(ids).toHaveLength(14);
    expect(ids).toEqual(ids.toSorted());
    expect(ids[0]).toBe("001-001");
    expect(ids.at(-1)).toBe("999-001");
  });

  it("builds user story titles and bodies", () => {
    const story = plan.stories.find(s => s.id === "003-003")!;
    expect(story.milestoneId).toBe("003");
    expect(story.title).toBe("As a user, I want to log out of the application");
    expect(story.body).toMatch(/^As a user, I want to log out of the application so that I can secure my account on shared devices\.\n\n- \[ \]/);
  });
});

describe("milestone folders", () => {
  function planDir(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "gh-roadmap-"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  }

  it("combines the folder and file numbers into the story id", () => {
    const dir = planDir({
      "milestones/002-ui/milestone.md": "---\ntitle: UI\n---\n",
      "milestones/002-ui/005-navbar.md": "---\ntitle: Navbar\n---\n",
    });
    expect(readLocalPlan(dir).stories).toMatchObject([{ id: "002-005", milestoneId: "002", label: "UI" }]);
  });

  it("requires milestone.md", () => {
    const dir = planDir({ "milestones/001-setup/001-init.md": "---\ntitle: Init\n---\n" });
    expect(() => readLocalPlan(dir)).toThrow("missing milestone.md");
  });

  it("rejects unnumbered folders and stories", () => {
    expect(() => readLocalPlan(planDir({ "milestones/setup/milestone.md": "---\ntitle: A\n---\n" })))
      .toThrow("must start with a three digit number");
    expect(() => readLocalPlan(planDir({
      "milestones/001-setup/milestone.md": "---\ntitle: A\n---\n",
      "milestones/001-setup/init.md": "---\ntitle: Init\n---\n",
    }))).toThrow("must start with a three digit number");
  });

  it("rejects duplicate numbers", () => {
    expect(() => readLocalPlan(planDir({
      "milestones/001-a/milestone.md": "---\ntitle: A\n---\n",
      "milestones/001-b/milestone.md": "---\ntitle: B\n---\n",
    }))).toThrow("Duplicate milestone number 001");
    expect(() => readLocalPlan(planDir({
      "milestones/001-a/milestone.md": "---\ntitle: A\n---\n",
      "milestones/001-a/001-x.md": "---\ntitle: X\n---\n",
      "milestones/001-a/001-y.md": "---\ntitle: Y\n---\n",
    }))).toThrow("Duplicate story number 001 in 001-a");
  });
});
