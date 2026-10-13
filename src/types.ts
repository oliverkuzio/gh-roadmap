export type StoryFrontMatter = {
  label?: string;
  title?: string;
  role?: string;
  action?: string;
  benefit?: string;
};

export type MilestoneFrontMatter = {
  title?: string;
  label?: string;
  due_on?: string | null;
};

export type MDFile<T> = {
  frontmatter: T;
  description: string;
};

export type Config = {
  owner?: string;
  repo?: string;
  project: string;
  status: string;
};

export type LocalMilestone = {
  id: string;
  title: string;
  description: string;
  label: string;
  dueOn: string | null;
};

export type LocalStory = {
  id: string;
  milestoneId: string;
  title: string;
  body: string;
  label: string;
};

export type LocalPlan = {
  milestones: LocalMilestone[];
  // Sorted by id, which is the priority order
  stories: LocalStory[];
};
