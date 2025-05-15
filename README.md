# GitHub Project Creator

A tool to create labels, issues and project cards for a GitHub project.

## Setup

### Repo / Project Setup

1. Create a repo on GitHub
2. Add a project to the repo and choose the "Kanban" template

### Tool Setup

Create a `.env` file and update with your values.

You can create a github token with the "repo" and "project" scope [here](https://github.com/settings/tokens/new).

```sh
cp .env.example .env
```

Install dependencies:

```sh
pnpm install
```

## Add Epics

Add epics to [./data/epics/](./data/epics/).

* Each epic file name should start with a three digit number.

## Add Stories

Add stories to [./data/stories/](./data/stories/).

* Each story file name should start with the corresponding epic story number, followed by a hyphen, then an additional three digit number.

## Add Priority List

Generate a priority list:

```sh
pnpm prioritize
```
Adjust the priority order of stories by modifying the generated file at [./data/priority.json](./data/priority.json).

## Run

Run the tool to create the labels, issues and project cards.

* The code in [./src/index.ts](./src/index.ts) reads the markdown files in and creates the labels, issues and project cards accordingly.

```sh
pnpm start
```
