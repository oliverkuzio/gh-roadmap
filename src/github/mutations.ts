import { PROJECT_FIELDS } from "./queries";

export const CREATE_LABEL_MUTATION = `
  mutation CreateLabel($repoId: ID!, $name: String!, $color: String!, $description: String) {
    createLabel(input: {
      repositoryId: $repoId,
      name: $name,
      color: $color,
      description: $description
    }) {
      label {
        id
        name
      }
    }
  }
`;

export const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($repoId: ID!, $title: String!, $body: String!, $labelIds: [ID!]!, $milestoneId: ID) {
    createIssue(input: {
      repositoryId: $repoId,
      title: $title,
      body: $body,
      labelIds: $labelIds,
      milestoneId: $milestoneId
    }) {
      issue {
        id
        number
      }
    }
  }
`;

export const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: ID!, $title: String!, $body: String!, $labelIds: [ID!]!, $milestoneId: ID, $state: IssueState!) {
    updateIssue(input: {
      id: $id,
      title: $title,
      body: $body,
      labelIds: $labelIds,
      milestoneId: $milestoneId,
      state: $state
    }) {
      issue {
        id
      }
    }
  }
`;

export const CLOSE_ISSUE_MUTATION = `
  mutation CloseIssue($id: ID!) {
    closeIssue(input: {
      issueId: $id,
      stateReason: NOT_PLANNED
    }) {
      issue {
        id
      }
    }
  }
`;

export const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($ownerId: ID!, $repositoryId: ID!, $title: String!) {
    createProjectV2(input: {
      ownerId: $ownerId,
      repositoryId: $repositoryId,
      title: $title
    }) {
      projectV2 {
        ${PROJECT_FIELDS}
      }
    }
  }
`;

export const UPDATE_FIELD_OPTIONS_MUTATION = `
  mutation UpdateFieldOptions($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
    updateProjectV2Field(input: {
      fieldId: $fieldId,
      singleSelectOptions: $options
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
          name
          options {
            id
            name
            color
            description
          }
        }
      }
    }
  }
`;

export const ADD_TO_PROJECT_MUTATION = `
  mutation AddToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {
      projectId: $projectId,
      contentId: $contentId
    }) {
      item {
        id
      }
    }
  }
`;

export const UPDATE_ITEM_STATUS_MUTATION = `
  mutation UpdateItemStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId,
      itemId: $itemId,
      fieldId: $fieldId,
      value: {
        singleSelectOptionId: $optionId
      }
    }) {
      projectV2Item {
        id
      }
    }
  }
`;
