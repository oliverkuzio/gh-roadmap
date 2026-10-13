import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { Config } from "../types";

import { resolveRepo } from "../repo";

const templateDir = join(dirname(fileURLToPath(import.meta.url)), "../../template");

export function init({ dir, force }: { dir: string; force: boolean }) {
  if (existsSync(dir) && !force) {
    throw new Error(`${dir} already exists. Use --force to overwrite it with the sample files.`);
  }

  cpSync(templateDir, dir, {
    recursive: true,
    filter: source => !source.endsWith(".DS_Store"),
  });

  const configFile = join(dir, "config.json");
  const config = JSON.parse(readFileSync(configFile, "utf-8")) as Config;
  const repo = resolveRepo({}, process.cwd());
  if (repo) {
    config.project = repo.repo;
  }
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);

  const shown = relative(process.cwd(), dir) || dir;
  console.log(`Created ${shown} with sample milestones and stories.

Next steps:
  1. Edit the milestone folders and stories in ${shown}/milestones
  2. Set GITHUB_TOKEN (scopes: "repo" and "project") in your environment or .env
  3. Run "gh-roadmap sync --dry-run" to preview, then "gh-roadmap sync"`);
}
