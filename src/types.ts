export type StoryFrontMatter = {
  label: string;
  title?: string;
  role?: string;
  action?: string;
  benefit?: string;
};

export type MDStory = {
  frontmatter: StoryFrontMatter;
  description: string;
};
