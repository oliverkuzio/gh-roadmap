import { parse } from "yaml";

import type { MDStory, StoryFrontMatter } from "./types";

export function getMDStory(content: string): MDStory {
  const [,frontmatterText, description] = content.split("---");

  return {
    frontmatter: parse(frontmatterText) as StoryFrontMatter,
    description: description.trim(),
  };
}
