import { graphql } from "@octokit/graphql";

import type {
  AddToProjectMutationResponse,
  AddToProjectParams,
  CheckProjectMembershipQueryResponse,
  CreateIssueMutationResponse,
  CreateIssueParams,
  CreateLabelMutationResponse,
  CreateLabelParams,
  GetLabelQueryResponse,
  GetProjectIdParams,
  GetProjectQueryResponse,
  GetRepositoryIdQueryResponse,
  SearchIssueQueryResponse,
} from "./types";

import {
  ADD_TO_PROJECT_MUTATION,
  CREATE_ISSUE_MUTATION,
  CREATE_LABEL_MUTATION,
  LINK_ISSUES_MUTATION,
  UPDATE_ITEM_STATUS_MUTATION,
} from "./mutations";
import {
  CHECK_PROJECT_MEMBERSHIP_QUERY,
  GET_LABEL_QUERY,
  GET_PROJECT_QUERY,
  GET_REPO_ID_QUERY,
  SEARCH_ISSUE_QUERY,
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

const projectItemsCache = new Map<string, Set<string>>();

export function initClient(token: string) {
  graphqlClient = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });
}

export async function getRepositoryId({
  owner,
  repo,
}: GetProjectIdParams): Promise<string> {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }

  const repoResponse = (await graphqlClient(GET_REPO_ID_QUERY, {
    owner,
    repo,
  })) as GetRepositoryIdQueryResponse;

  return repoResponse.repository.id;
}

export async function getProjectInfo({
  owner,
  repo,
}: GetProjectIdParams): Promise<
  | {
    projectId: string;
    projectNumber: number;
    fieldId: string;
    optionId: string;
  }
  | undefined
  > {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }
  try {
    const response = (await graphqlClient(GET_PROJECT_QUERY, {
      owner,
      repo,
    })) as GetProjectQueryResponse;

    const projects = response.repository.projectsV2.nodes;
    if (!projects || projects.length === 0) {
      throw new Error(
        `No projects found in repository ${owner}/${repo}. Please ensure:
1. The repository has at least one project (V2)
2. The project is accessible to the authenticated user
3. The GITHUB_TOKEN has the necessary permissions (project scope)`,
      );
    }

    const project = projects[0];
    const layout = project.views.nodes[0]?.layout;
    console.log(
      `Found project: ${project.title} (number: ${project.number}, layout: ${layout})`,
    );

    if (layout !== "BOARD_LAYOUT") {
      throw new Error(
        `Project "${project.title}" is not a board view project. It is currently in ${layout} view.
To fix this:
1. Go to the project settings
2. Click "Layout"
3. Select "Board" view
4. Add a "Backlog" column`,
      );
    }

    const statusField = project.fields.nodes.find(
      field => field.name === "Status",
    );
    if (!statusField) {
      throw new Error(
        `No Status field found in project "${project.title}".
Please add a "Status" field to your project.`,
      );
    }

    const backlogOption = statusField.options?.find(
      option => option.name === "Backlog",
    );
    if (!backlogOption) {
      throw new Error(
        `No "Backlog" option found in Status field. Available options: ${statusField.options
          ?.map(o => o.name)
          .join(", ")}.
Please add a "Backlog" option to your Status field.`,
      );
    }

    return {
      projectId: project.id,
      projectNumber: project.number,
      fieldId: statusField.id,
      optionId: backlogOption.id,
    };
  }
  catch (error) {
    if (error instanceof Error) {
      console.error(error);
      throw new TypeError(
        `Failed to get project information: ${error.message}`,
      );
    }
    throw error;
  }
}

export async function createLabelIfNotExists({
  label,
  repositoryId,
}: CreateLabelParams) {
  try {
    if (!graphqlClient) {
      throw new Error("GraphQL client not initialized");
    }

    const labelResponse = (await graphqlClient(GET_LABEL_QUERY, {
      repoId: repositoryId,
      name: label.name,
    })) as GetLabelQueryResponse;

    if (labelResponse.node.label) {
      console.log(`Label "${label.name}" already exists`);
      return labelResponse.node.label;
    }

    const color = label.color || getNextRandomColor();

    console.log("Creating label:", {
      name: label.name,
    });

    const createLabelResponse = (await graphqlClient(CREATE_LABEL_MUTATION, {
      repoId: repositoryId,
      name: label.name,
      color,
      description: label.description || "",
    })) as CreateLabelMutationResponse;

    return createLabelResponse.createLabel.label;
  }
  catch (error) {
    if (error instanceof Error) {
      console.error(error);
      throw new TypeError(
        `Failed to create label "${label.name}": ${error.message}`,
      );
    }
    throw error;
  }
}

export async function createIssue({
  issue,
  labelId,
  repositoryId,
  owner,
  repo,
}: CreateIssueParams) {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }

  const searchQuery = `repo:${owner}/${repo} is:issue in:title "${issue.title.trim()}"`;
  const searchResponse = (await graphqlClient(SEARCH_ISSUE_QUERY, {
    searchQuery,
  })) as SearchIssueQueryResponse;

  const existingIssues = searchResponse.search.nodes;
  if (existingIssues.length > 0) {
    const existingIssue = existingIssues[0];
    console.log(
      `Found existing issue #${existingIssue.number} with title "${existingIssue.title}"`,
    );

    const hasLabel = existingIssue.labels.nodes.some(
      label => label.id === labelId,
    );
    if (!hasLabel) {
      console.log(`Adding label to existing issue #${existingIssue.number}`);
      await graphqlClient(CREATE_LABEL_MUTATION, {
        issueId: existingIssue.id,
        labelIds: [labelId],
      });
    }

    if (issue.parentIssueId) {
      console.log(`Checking parent issue link for #${existingIssue.number}`);
      const currentParentId = existingIssue.parent?.id;

      if (currentParentId !== issue.parentIssueId) {
        console.log(
          `Linking existing issue ${existingIssue.number} to parent issue ${issue.parentIssueId}`,
        );
        await graphqlClient(LINK_ISSUES_MUTATION, {
          issueId: existingIssue.id,
          parentId: issue.parentIssueId,
        });
        console.log(
          `Linked existing issue ${existingIssue.number} to parent issue ${issue.parentIssueId}`,
        );
      }
      else {
        console.log(
          `Issue #${existingIssue.number} is already linked to parent issue ${issue.parentIssueId}`,
        );
      }
    }

    return existingIssue.id;
  }

  console.log("Creating new issue:", {
    title: issue.title,
    parentIssueId: issue.parentIssueId,
  });

  const createResponse = (await graphqlClient(CREATE_ISSUE_MUTATION, {
    repoId: repositoryId,
    title: issue.title.trim(),
    body: issue.body,
    labelIds: [labelId],
  })) as CreateIssueMutationResponse;

  const newIssueId = createResponse.createIssue.issue.id;
  const newIssueNumber = createResponse.createIssue.issue.number;
  console.log(`Created issue #${newIssueNumber} with ID: ${newIssueId}`);

  if (issue.parentIssueId) {
    await graphqlClient(LINK_ISSUES_MUTATION, {
      issueId: newIssueId,
      parentId: issue.parentIssueId,
    });
    console.log(
      `Linked issue ${newIssueNumber} to parent issue ${issue.parentIssueId}`,
    );
  }

  return newIssueId;
}

async function getProjectItems(projectId: string): Promise<Set<string>> {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }

  const cachedItems = projectItemsCache.get(projectId);
  if (cachedItems) {
    return cachedItems;
  }

  const membershipResponse = (await graphqlClient(
    CHECK_PROJECT_MEMBERSHIP_QUERY,
    {
      projectId,
    },
  )) as CheckProjectMembershipQueryResponse;

  const items = new Set(
    membershipResponse.node.items.nodes
      .map(item => item.content?.id)
      .filter((id): id is string => id !== undefined),
  );

  projectItemsCache.set(projectId, items);
  return items;
}

export async function addToProject({
  issueId,
  projectInfo,
}: AddToProjectParams): Promise<void> {
  if (!graphqlClient) {
    throw new Error("GraphQL client not initialized");
  }
  try {
    const projectItems = await getProjectItems(projectInfo.projectId);

    if (projectItems.has(issueId)) {
      console.log(`Issue ${issueId} is already in the project`);
      return;
    }

    console.log(`Adding issue ${issueId} to project`);
    const addResponse = (await graphqlClient(ADD_TO_PROJECT_MUTATION, {
      projectId: projectInfo.projectId,
      contentId: issueId,
    })) as AddToProjectMutationResponse;

    projectItems.add(issueId);

    await graphqlClient(UPDATE_ITEM_STATUS_MUTATION, {
      projectId: projectInfo.projectId,
      itemId: addResponse.addProjectV2ItemById.item.id,
      fieldId: projectInfo.fieldId,
      optionId: projectInfo.optionId,
    });

    console.log(`Added issue ${issueId} to project and set status to Backlog`);
  }
  catch (error) {
    if (error instanceof Error) {
      console.error(error);
      throw new TypeError(`Failed to add issue to project: ${error.message}`);
    }
    throw error;
  }
}

export async function createIssueAddToProject({
  issue,
  labelId,
  projectInfo,
  repositoryId,
  owner,
  repo,
}: CreateIssueParams): Promise<string> {
  const issueId = await createIssue({
    issue,
    projectInfo,
    repositoryId,
    labelId,
    owner,
    repo,
  });
  await addToProject({ issueId, projectInfo });
  return issueId;
}
