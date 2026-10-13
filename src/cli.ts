import dotenv from "dotenv";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { init } from "./commands/init";
import { sync } from "./commands/sync";

const USAGE = `Usage: gh-roadmap <command> [options]

Commands:
  init     Scaffold a .project folder with sample milestones and stories
  sync     Create or update the GitHub project, milestones and issues from .project

Options:
  --dir <path>   Project folder (default: .project)
  --dry-run      sync: show the changes without applying them
  --force        init: overwrite an existing folder
  -h, --help     Show this help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dir": { type: "string", default: ".project" },
    "dry-run": { type: "boolean", default: false },
    "force": { type: "boolean", default: false },
    "help": { type: "boolean", short: "h", default: false },
  },
});

const [command] = positionals;
const dir = resolve(process.cwd(), values.dir);

dotenv.config({ path: resolve(process.cwd(), ".env") });

try {
  if (command === "init" && !values.help) {
    init({ dir, force: values.force });
  }
  else if (command === "sync" && !values.help) {
    await sync({ dir, dryRun: values["dry-run"] });
  }
  else {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
  }
}
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
