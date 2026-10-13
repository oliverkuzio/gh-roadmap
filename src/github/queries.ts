const PROJECT_FIELDS = `
  id
  title
  number
  url
  views(first: 1) {
    nodes {
      layout
    }
  }
  fields(first: 50) {
    nodes {
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
`;

export const GET_REPO_QUERY = `
  query GetRepo($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      id
      owner {
        id
      }
    }
  }
`;

export const GET_PROJECTS_QUERY = `
  query GetProjects($owner: String!, $repo: String!, $title: String!) {
    repository(owner: $owner, name: $repo) {
      projectsV2(first: 100, query: $title) {
        nodes {
          ${PROJECT_FIELDS}
        }
      }
    }
  }
`;

export const LIST_LABELS_QUERY = `
  query ListLabels($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      labels(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
        }
      }
    }
  }
`;

export const LIST_ISSUES_QUERY = `
  query ListIssues($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, after: $after, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          number
          title
          body
          state
          milestone {
            id
          }
          labels(first: 50) {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export const LIST_PROJECT_ITEMS_QUERY = `
  query ListProjectItems($projectId: ID!, $after: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            content {
              ... on Issue {
                id
              }
            }
          }
        }
      }
    }
  }
`;

export { PROJECT_FIELDS };
