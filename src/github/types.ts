export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ProjectInfo = {
  projectId: string;
  title: string;
  url: string;
  fieldId: string;
  optionId: string;
};

export type SingleSelectOption = {
  id: string;
  name: string;
  color: string;
  description: string;
};

export type ProjectNode = {
  id: string;
  title: string;
  number: number;
  url: string;
  views: {
    nodes: Array<{
      layout: string;
    }>;
  };
  fields: {
    nodes: Array<{
      id?: string;
      name?: string;
      options?: SingleSelectOption[];
    }>;
  };
};

export type GetRepoQueryResponse = {
  repository: {
    id: string;
    owner: {
      id: string;
    };
  };
};

export type GetProjectsQueryResponse = {
  repository: {
    projectsV2: {
      nodes: ProjectNode[];
    };
  };
};

export type CreateProjectMutationResponse = {
  createProjectV2: {
    projectV2: ProjectNode;
  };
};

export type UpdateFieldOptionsMutationResponse = {
  updateProjectV2Field: {
    projectV2Field: {
      id: string;
      name: string;
      options: SingleSelectOption[];
    };
  };
};

export type ListLabelsQueryResponse = {
  repository: {
    labels: {
      pageInfo: PageInfo;
      nodes: Array<{
        id: string;
        name: string;
      }>;
    };
  };
};

export type ListIssuesQueryResponse = {
  repository: {
    issues: {
      pageInfo: PageInfo;
      nodes: Array<{
        id: string;
        number: number;
        title: string;
        body: string;
        state: "OPEN" | "CLOSED";
        milestone: {
          id: string;
        } | null;
        labels: {
          nodes: Array<{
            id: string;
            name: string;
          }>;
        };
      }>;
    };
  };
};

export type ListProjectItemsQueryResponse = {
  node: {
    items: {
      pageInfo: PageInfo;
      nodes: Array<{
        content: {
          id?: string;
        } | null;
      }>;
    };
  };
};

export type CreateLabelMutationResponse = {
  createLabel: {
    label: {
      id: string;
      name: string;
    };
  };
};

export type CreateIssueMutationResponse = {
  createIssue: {
    issue: {
      id: string;
      number: number;
    };
  };
};

export type AddToProjectMutationResponse = {
  addProjectV2ItemById: {
    item: {
      id: string;
    };
  };
};
