# gh-roadmap

Plan a project as markdown files in a `.project` folder, then sync them to GitHub as native **milestones**, **issues** and a **project board**. Re-running the sync compares the files with GitHub and applies only the differences.

## Install

Add it as a dev dependency of the project you want to plan:

```sh
pnpm add -D @oliverkuzio/gh-roadmap
```

Add scripts to that project's `package.json`:

```json
{
  "scripts": {
    "roadmap:init": "gh-roadmap init",
    "roadmap:sync": "gh-roadmap sync"
  }
}
```

Create a GitHub token with the `repo` and `project` scopes [here](https://github.com/settings/tokens/new) and set it as `GITHUB_TOKEN` in your environment or in a `.env` file at the project root (`.env` is loaded automatically; keep it out of git).

## Scaffold

```sh
pnpm roadmap:init
```

This copies the sample milestones and stories into `.project/`:

```
.project/
  config.json
  milestones/
    001-project-setup/
      milestone.md
      001-initialization.md
      002-linting-editor.md
    002-user-interface/
      milestone.md
      001-landing-page.md
```

You can commit `.project/` so the plan lives with the code, or add it to `.gitignore`.

### config.json

```json
{
  "project": "My App",
  "status": "Backlog"
}
```

- `project` is the title of the GitHub Project. It's created and linked to the repository if it doesn't exist yet.
- `status` is the Status column new issues are placed in.
- `owner` and `repo` are optional. They default to `GITHUB_OWNER`/`GITHUB_REPO`, then to the git `origin` remote.

### Milestones

Each folder in `milestones/` becomes a GitHub milestone. Folder names start with a three-digit number. The milestone's details go in a `milestone.md` file inside the folder:

```md
---
title: Project Setup
label: Project Setup
due_on: 2026-12-01
---

Optional description.
```

`label` (defaults to the title) is applied to the milestone's issues. `due_on` is optional.

### Stories

Every other markdown file in a milestone folder becomes an issue attached to that milestone. File names start with a three-digit story number. The story's id combines the two numbers, so `001-project-setup/002-linting-editor.md` has the id `001-002`.

Use either a plain title:

```md
---
title: eslint / editor setup
---

- [ ] Acceptance criteria
```

or a user story, which produces the title "As a guest, I want to log in" and a body starting "As a guest, I want to log in so that ...":

```md
---
role: guest
action: log in
benefit: I can access my content
---
```

`label` is optional and defaults to the milestone's label.

### Order

Issues are created in order of their ids (`001-001`, `001-002`, …, `002-001`), so the folder and file numbers set the priority.

## Sync

```sh
pnpm roadmap:sync --dry-run   # preview changes
pnpm roadmap:sync             # apply them
```

On every run:

- Missing labels, milestones and issues are created. New issues are added to the project in the configured status.
- Changed titles, descriptions, due dates, labels and milestones are updated. The files are the source of truth, so edits made on GitHub are overwritten.
- Labels that aren't managed by `.project` (e.g. `bug`) are left on issues.
- Issues and milestones whose files were removed are closed. Issues are closed as "not planned". Restoring the file reopens them.

Each synced issue and milestone has a hidden marker in its description, such as `<!-- gh-roadmap:story:001-002 -->`. The sync uses these markers to match items, so titles can change freely. Items without a marker are never closed. An unmarked issue or milestone whose title exactly matches a local file is adopted, which lets you migrate items created by hand or by earlier versions of this tool.

The project's view layout can't be set through the API. If the sync warns that the project isn't a board, switch the view to **Board** in the project settings.

## Options

```
gh-roadmap init [--dir .project] [--force]
gh-roadmap sync [--dir .project] [--dry-run]
```

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:init --dir scratch/.project
pnpm dev:sync --dir scratch/.project --dry-run
```
