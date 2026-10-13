import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  Config,
  LocalMilestone,
  LocalPlan,
  LocalStory,
  MilestoneFrontMatter,
  StoryFrontMatter,
} from "./types";

import { parseMarkdown } from "./parse";

const MILESTONE_FOLDER = /^(\d{3})-/;
const MILESTONE_FILE = "milestone.md";
const STORY_FILE = /^(\d{3})-.*\.md$/;

function storyFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(file => file.endsWith(".md") && file !== MILESTONE_FILE)
    .sort();
}

function normalizeDate(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new Error(`Invalid due_on "${date}", expected YYYY-MM-DD`);
  }
  return date.slice(0, 10);
}

export function readConfig(dir: string): Config {
  const file = join(dir, "config.json");
  const config = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf-8")) as Partial<Config>
    : {};

  return {
    ...config,
    project: config.project || "Roadmap",
    status: config.status || "Backlog",
  };
}

function readMilestone(folderPath: string, folder: string, id: string): LocalMilestone {
  const file = join(folderPath, MILESTONE_FILE);
  if (!existsSync(file)) {
    throw new Error(`Milestone folder "${folder}" is missing ${MILESTONE_FILE}`);
  }

  const { frontmatter, description } = parseMarkdown<MilestoneFrontMatter>(readFileSync(file, "utf-8"));
  if (!frontmatter.title) {
    throw new Error(`Title not set in ${folder}/${MILESTONE_FILE}`);
  }

  return {
    id,
    title: frontmatter.title.trim(),
    description,
    label: frontmatter.label?.trim() || frontmatter.title.trim(),
    dueOn: normalizeDate(frontmatter.due_on),
  };
}

function readStory(folderPath: string, folder: string, file: string, milestone: LocalMilestone): LocalStory {
  const match = file.match(STORY_FILE);
  if (!match) {
    throw new Error(`Story file "${folder}/${file}" must start with a three digit number, e.g. 001-name.md`);
  }

  const { frontmatter, description } = parseMarkdown<StoryFrontMatter>(
    readFileSync(join(folderPath, file), "utf-8"),
  );

  const title = frontmatter.role
    ? `As a ${frontmatter.role}, I want to ${frontmatter.action}`
    : frontmatter.title;
  if (!title) {
    throw new Error(`Title not set for story ${folder}/${file}`);
  }

  let body = frontmatter.role
    ? `As a ${frontmatter.role}, I want to ${frontmatter.action} so that ${frontmatter.benefit}.\n\n`
    : "";
  body += description;

  return {
    id: `${milestone.id}-${match[1]}`,
    milestoneId: milestone.id,
    title: title.trim(),
    body: body.trim(),
    label: frontmatter.label?.trim() || milestone.label,
  };
}

// Each folder in milestones/ is a milestone (e.g. 001-project-setup/) holding a milestone.md
// and its stories (e.g. 002-linting-editor.md, whose id becomes 001-002).
export function readMilestones(dir: string): LocalPlan {
  const milestonesDir = join(dir, "milestones");
  const milestones: LocalMilestone[] = [];
  const stories: LocalStory[] = [];

  const folders = existsSync(milestonesDir)
    ? readdirSync(milestonesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
    : [];

  for (const folder of folders) {
    const match = folder.match(MILESTONE_FOLDER);
    if (!match) {
      throw new Error(`Milestone folder "${folder}" must start with a three digit number, e.g. 001-name`);
    }
    if (milestones.some(milestone => milestone.id === match[1])) {
      throw new Error(`Duplicate milestone number ${match[1]} (${folder})`);
    }

    const folderPath = join(milestonesDir, folder);
    const milestone = readMilestone(folderPath, folder, match[1]);
    milestones.push(milestone);

    for (const file of storyFiles(folderPath)) {
      const story = readStory(folderPath, folder, file, milestone);
      if (stories.some(existing => existing.id === story.id)) {
        throw new Error(`Duplicate story number ${file.slice(0, 3)} in ${folder}`);
      }
      stories.push(story);
    }
  }

  return { milestones, stories };
}

export function readLocalPlan(dir: string): LocalPlan {
  if (!existsSync(dir)) {
    throw new Error(`${dir} not found. Run "gh-roadmap init" first.`);
  }

  const { milestones, stories } = readMilestones(dir);

  return {
    milestones,
    // Story ids double as the priority order, e.g. 001-002 is created before 002-001
    stories: stories.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
