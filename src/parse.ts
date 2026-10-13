import { parse } from "yaml";

import type { MDFile } from "./types";

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function parseMarkdown<T>(content: string): MDFile<T> {
  const match = content.match(FRONTMATTER);
  if (!match) {
    return { frontmatter: {} as T, description: content.trim() };
  }

  return {
    frontmatter: (parse(match[1] ?? "") ?? {}) as T,
    description: content.slice(match[0].length).trim(),
  };
}
