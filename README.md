# gh-roadmap

Plan a project as markdown files in a `.github/roadmap` folder, then sync them to GitHub as native **milestones**, **issues** and a **project board**. Re-running the sync compares the files with GitHub and applies only the differences.

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
    "roadmap:sync": "gh-roadmap sync",
    "roadmap:sync:down": "gh-roadmap sync down"
  }
}
```

Create a GitHub token with the `repo` and `project` scopes [here](https://github.com/settings/tokens/new) and set it as `GITHUB_TOKEN` in your environment or in a `.env` file at the project root (`.env` is loaded automatically; keep it out of git).

## Scaffold

```sh
pnpm roadmap:init
```

This copies the sample milestones and stories into `.github/roadmap/`:

```
.github/roadmap/
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

You can commit `.github/roadmap/` so the plan lives with the code, or add it to `.gitignore`. To keep the plan somewhere else (e.g. if a `CODEOWNERS` rule requires reviews for changes under `.github/`), pass `--dir` to every command.

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
state: open
---
```

`label` is optional and defaults to the milestone's label.

`state` is `open` or `closed`. Set it to `closed` when a story is finished, and back to `open` to reopen it. A missing `state` counts as `open`.

### Order

Issues are created in order of their ids (`001-001`, `001-002`, …, `002-001`), so the folder and file numbers set the priority.

## Sync

A sync goes one way. Sync up (the default) makes GitHub match the `.github/roadmap` files. Sync down makes the files match GitHub. Pick the direction based on where the latest changes were made, and sync down before editing files if the board has been used since the last sync.

After every sync, a fingerprint of each synced item is saved in `.github/roadmap/sync-state.json`. Commit it with the rest of `.github/roadmap`. It lets sync up tell edits made on GitHub apart from edits made to the files.

### Sync up

```sh
pnpm roadmap:sync --dry-run   # preview changes
pnpm roadmap:sync             # apply them (same as `gh-roadmap sync up`)
```

On every run:

- Missing labels, milestones and issues are created. New issues are added to the project in the configured status.
- Changed titles, descriptions, due dates, labels and milestones are updated. Edits made on GitHub are overwritten.
- Issues are closed (as completed) or reopened to match each story's `state`.
- Labels that aren't managed by `.github/roadmap` (e.g. `bug`) are left on issues.
- Issues and milestones whose files were removed are closed. Issues are closed as "not planned". Restoring the file reopens them.

Before changing anything, sync up compares GitHub with the last recorded sync. If titles, bodies, states, roadmap labels, milestones or due dates were edited on GitHub since then, and sync up would overwrite them, it lists them and asks before going ahead. Answer no, then run sync down to pull those edits into the files. Use `--yes` to overwrite without asking; without a terminal to ask in (e.g. CI or an agent), sync up stops instead. If no sync has been recorded yet, every difference is listed, because there's no telling which side changed.

### Sync down

```sh
pnpm roadmap:sync:down --dry-run   # preview changes
pnpm roadmap:sync:down             # apply them
```

Nothing on GitHub is changed. For every story and milestone that already has a file:

- A story's `state`, title, body and label are updated from its issue. Titles and bodies that still read "As a …, I want to … so that …." are written back as `role`, `action` and `benefit`; otherwise the story gets a plain `title`.
- A milestone's title, description and due date are updated. If its title changes and it has no `label`, the old label is written in so its issues keep their label.
- Frontmatter keys that didn't change, comments and the order of keys are kept.

Some changes can't be written to the files, so they are printed as warnings instead: issues moved to another milestone, issues with no roadmap label (or more than one), and open issues on the project board that have no story file. Move or create those files by hand.

Each synced issue and milestone has a hidden marker in its description, such as `<!-- gh-roadmap:story:001-002 -->`. The sync uses these markers to match items, so titles can change freely. Items without a marker are never closed. An unmarked issue or milestone whose title exactly matches a local file is adopted, which lets you migrate items created by hand or by earlier versions of this tool.

The project's view layout can't be set through the API. If the sync warns that the project isn't a board, switch the view to **Board** in the project settings.

## Options

```
gh-roadmap init [--dir .github/roadmap] [--force]
gh-roadmap sync [up|down] [--dir .github/roadmap] [--dry-run] [--yes]
```

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:init --dir scratch/.github/roadmap
pnpm dev:sync --dir scratch/.github/roadmap --dry-run
```
