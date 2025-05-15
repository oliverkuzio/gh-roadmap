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
        color
        description
      }
    }
  }
`;

export const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($repoId: ID!, $title: String!, $body: String!, $labelIds: [ID!]!) {
    createIssue(input: {
      repositoryId: $repoId,
      title: $title,
      body: $body,
      labelIds: $labelIds
    }) {
      issue {
        id
        number
      }
    }
  }
`;

export const LINK_ISSUES_MUTATION = `
  mutation LinkIssues($issueId: ID!, $parentId: ID!) {
    addSubIssue(input: {
      issueId: $parentId,
      subIssueId: $issueId
    }) {
      issue {
        id
        number
      }
      subIssue {
        id
        number
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
