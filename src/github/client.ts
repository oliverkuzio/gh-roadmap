import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";

import type { RemoteIssue, RemoteLabel, RemoteMilestone } from "../sync/diff";
import type {
  AddToProjectMutationResponse,
  CreateIssueMutationResponse,
  CreateLabelMutationResponse,
  CreateProjectMutationResponse,
  GetProjectsQueryResponse,
  GetRepoQueryResponse,
  ListIssuesQueryResponse,
  ListLabelsQueryResponse,
  ListProjectItemsQueryResponse,
  PageInfo,
  ProjectInfo,
  ProjectNode,
  UpdateFieldOptionsMutationResponse,
} from "./types";

import {
  ADD_TO_PROJECT_MUTATION,
  CLOSE_ISSUE_MUTATION,
  CREATE_ISSUE_MUTATION,
  CREATE_LABEL_MUTATION,
  CREATE_PROJECT_MUTATION,
  UPDATE_FIELD_OPTIONS_MUTATION,
  UPDATE_ISSUE_MUTATION,
  UPDATE_ITEM_STATUS_MUTATION,
} from "./mutations";
import {
  GET_PROJECTS_QUERY,
  GET_REPO_QUERY,
  LIST_ISSUES_QUERY,
  LIST_LABELS_QUERY,
  LIST_PROJECT_ITEMS_QUERY,
} from "./queries";

const randomIssueLabelColors: string[] = [
  "0E8A16", // green
  "D73A4A", // red
  "0366D6", // blue
  "F9C513", // yellow
  "6A737D", // gray
  "B39DDB", // purple
  "E69F66", // orange
  "E0E0E0", // light gray
];

let colors = randomIssueLabelColors.slice();
function getNextRandomColor(): string {
  if (colors.length === 0) {
    colors = randomIssueLabelColors.slice();
  }
  return colors.shift()!;
}

let graphqlClient: typeof graphql | null = null;
let restClient: Octokit | null = null;

export function initClient(token: string) {
  graphqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });
  restClient = new Octokit({ auth: token });
}

function gql() {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }
  return graphqlClient;
}

function rest() {
  if (!restClient) {
    throw new Error("REST client not initialized");
  }
  return restClient;
}

async function paginate<T, R>(
  fetchPage: (after: string | null) => Promise<R>,
  getConnection: (response: R) => { pageInfo: PageInfo; nodes: T[] },
): Promise<T[]> {
  const results: T[] = [];
  let after: string | null = null;
  do {
    const connection = getConnection(await fetchPage(after));
    results.push(...connection.nodes);
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);
  return results;
}

export type RepoParams = {
  owner: string;
  repo: string;
};

export async function getRepository({ owner, repo }: RepoParams) {
  const response = await gql()<GetRepoQueryResponse>(GET_REPO_QUERY, { owner, repo });
  return {
    repositoryId: response.repository.id,
    ownerId: response.repository.owner.id,
  };
}

// Projects

export async function findProject({ owner, repo, title }: RepoParams & { title: string }): Promise<ProjectNode | undefined> {
  const response = await gql()<GetProjectsQueryResponse>(GET_PROJECTS_QUERY, { owner, repo, title });
  return response.repository.projectsV2.nodes.find(project => project.title === title);
}

export async function createProject({ ownerId, repositoryId, title }: {
  ownerId: string;
  repositoryId: string;
  title: string;
}): Promise<ProjectNode> {
  const response = await gql()<CreateProjectMutationResponse>(CREATE_PROJECT_MUTATION, {
    ownerId,
    repositoryId,
    title,
  });
  return response.createProjectV2.projectV2;
}

// Resolves the Status field and the option new issues are placed in. When `addMissingOption` is set
// (only safe for a freshly created project, since rewriting the options resets existing items' status),
// the option is added to the front of the Status field.
export async function getProjectInfo(project: ProjectNode, statusName: string, addMissingOption: boolean): Promise<ProjectInfo> {
  const layout = project.views.nodes[0]?.layout;
  if (layout !== "BOARD_LAYOUT") {
    console.warn(
      `Project "${project.title}" view is ${layout ?? "unknown"}. Switch it to a Board layout in the project's view settings: ${project.url}`,
    );
  }

  const statusField = project.fields.nodes.find(field => field.name === "Status");
  if (!statusField?.id || !statusField.options) {
    throw new Error(
      `No Status field found in project "${project.title}".
Please add a "Status" single select field to your project.`,
    );
  }

  let option = statusField.options.find(option => option.name === statusName);
  if (!option && addMissingOption) {
    console.log(`Adding "${statusName}" option to the Status field`);
    const response = await gql()<UpdateFieldOptionsMutationResponse>(UPDATE_FIELD_OPTIONS_MUTATION, {
      fieldId: statusField.id,
      options: [
        { name: statusName, color: "GRAY", description: "" },
        ...statusField.options.map(({ name, color, description }) => ({ name, color, description })),
      ],
    });
    option = response.updateProjectV2Field.projectV2Field.options.find(option => option.name === statusName);
  }

  if (!option) {
    throw new Error(
      `No "${statusName}" option found in Status field. Available options: ${statusField.options
        .map(o => o.name)
        .join(", ")}.
Please add a "${statusName}" option to your Status field, or set "status" in .github/roadmap/config.json.`,
    );
  }

  return {
    projectId: project.id,
    title: project.title,
    url: project.url,
    fieldId: statusField.id,
    optionId: option.id,
  };
}

export async function listProjectIssueIds(projectId: string): Promise<Set<string>> {
  const items = await paginate(
    after => gql()<ListProjectItemsQueryResponse>(LIST_PROJECT_ITEMS_QUERY, { projectId, after }),
    response => response.node.items,
  );
  return new Set(items.map(item => item.content?.id).filter((id): id is string => !!id));
}

export async function addToProject({ issueId, projectInfo }: {
  issueId: string;
  projectInfo: ProjectInfo;
}): Promise<void> {
  const addResponse = await gql()<AddToProjectMutationResponse>(ADD_TO_PROJECT_MUTATION, {
    projectId: projectInfo.projectId,
    contentId: issueId,
  });

  await gql()(UPDATE_ITEM_STATUS_MUTATION, {
    projectId: projectInfo.projectId,
    itemId: addResponse.addProjectV2ItemById.item.id,
    fieldId: projectInfo.fieldId,
    optionId: projectInfo.optionId,
  });
}

// Labels

export async function listLabels({ owner, repo }: RepoParams): Promise<RemoteLabel[]> {
  return paginate(
    after => gql()<ListLabelsQueryResponse>(LIST_LABELS_QUERY, { owner, repo, after }),
    response => response.repository.labels,
  );
}

export async function createLabel({ repositoryId, name }: {
  repositoryId: string;
  name: string;
}): Promise<RemoteLabel> {
  const response = await gql()<CreateLabelMutationResponse>(CREATE_LABEL_MUTATION, {
    repoId: repositoryId,
    name,
    color: getNextRandomColor(),
    description: "",
  });
  return response.createLabel.label;
}

// Milestones (no GraphQL mutations exist for milestones, so these use REST)

type MilestoneFields = {
  title: string;
  description: string;
  dueOn: string | null;
  state: "open" | "closed";
};

// GitHub stores due dates in US Pacific time; midday UTC keeps the intended calendar date.
function toDueOn(date: string | null) {
  return date ? `${date}T12:00:00Z` : null;
}

function toRemoteMilestone(milestone: {
  number: number;
  node_id: string;
  title: string;
  description: string | null;
  due_on: string | null;
  state: string;
}): RemoteMilestone {
  return {
    number: milestone.number,
    nodeId: milestone.node_id,
    title: milestone.title,
    description: milestone.description,
    dueOn: milestone.due_on,
    state: milestone.state === "closed" ? "closed" : "open",
  };
}

export async function listMilestones({ owner, repo }: RepoParams): Promise<RemoteMilestone[]> {
  const milestones = await rest().paginate(rest().issues.listMilestones, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });
  return milestones.map(toRemoteMilestone);
}

export async function createMilestone({ owner, repo, milestone }: RepoParams & {
  milestone: Omit<MilestoneFields, "state">;
}): Promise<RemoteMilestone> {
  const response = await rest().issues.createMilestone({
    owner,
    repo,
    title: milestone.title,
    description: milestone.description,
    ...(milestone.dueOn ? { due_on: toDueOn(milestone.dueOn)! } : {}),
  });
  return toRemoteMilestone(response.data);
}

export async function updateMilestone({ owner, repo, number, milestone }: RepoParams & {
  number: number;
  milestone: Partial<MilestoneFields>;
}): Promise<RemoteMilestone> {
  const response = await rest().request("PATCH /repos/{owner}/{repo}/milestones/{milestone_number}", {
    owner,
    repo,
    milestone_number: number,
    ...(milestone.title !== undefined ? { title: milestone.title } : {}),
    ...(milestone.description !== undefined ? { description: milestone.description } : {}),
    // The API accepts null to clear the due date, though the typings don't allow it
    ...(milestone.dueOn !== undefined ? { due_on: toDueOn(milestone.dueOn) as string } : {}),
    ...(milestone.state !== undefined ? { state: milestone.state } : {}),
  });
  return toRemoteMilestone(response.data);
}

// Issues

export async function listIssues({ owner, repo }: RepoParams): Promise<RemoteIssue[]> {
  const issues = await paginate(
    after => gql()<ListIssuesQueryResponse>(LIST_ISSUES_QUERY, { owner, repo, after }),
    response => response.repository.issues,
  );
  return issues.map(issue => ({
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    milestoneId: issue.milestone?.id ?? null,
    labels: issue.labels.nodes,
  }));
}

export type IssueFields = {
  title: string;
  body: string;
  labelIds: string[];
  milestoneId: string | null;
};

export async function createIssue({ repositoryId, issue }: {
  repositoryId: string;
  issue: IssueFields;
}) {
  const response = await gql()<CreateIssueMutationResponse>(CREATE_ISSUE_MUTATION, {
    repoId: repositoryId,
    ...issue,
  });
  return response.createIssue.issue;
}

// The state is left as is unless `reopen` is set
export async function updateIssue({ id, issue, reopen }: {
  id: string;
  issue: IssueFields;
  reopen: boolean;
}) {
  await gql()(UPDATE_ISSUE_MUTATION, {
    id,
    ...issue,
    ...(reopen ? { state: "OPEN" } : {}),
  });
}

export async function closeIssue(id: string, reason: "COMPLETED" | "NOT_PLANNED") {
  await gql()(CLOSE_ISSUE_MUTATION, { id, reason });
}
