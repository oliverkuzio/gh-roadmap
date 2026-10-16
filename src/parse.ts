import { parse, parseDocument } from "yaml";

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

// Sets frontmatter values (null empties a key that exists) and, when `description` is given,
// replaces the body. Comments, key order and anything unchanged are kept as written.
export function updateMarkdown(content: string, values: Record<string, string | null>, description?: string): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const match = content.match(FRONTMATTER);
  const doc = parseDocument(match?.[1] ?? "");

  let frontmatterChanged = false;
  for (const [key, value] of Object.entries(values)) {
    const current = doc.get(key) ?? null;
    if (value === null ? current === null || current === "" : String(current) === value) {
      continue;
    }
    if (value === null && !doc.has(key)) {
      continue;
    }
    doc.set(key, value);
    frontmatterChanged = true;
  }

  const rest = match ? content.slice(match[0].length) : `${newline}${content}`;
  const bodyChanged = description !== undefined && description.trim() !== rest.trim();
  if (!frontmatterChanged && !bodyChanged) {
    return content;
  }

  const frontmatter = frontmatterChanged || !match
    ? `---${newline}${doc.toString({ nullStr: "" }).replace(/\r?\n/g, newline)}---${newline}`
    : match[0];
  const body = bodyChanged
    ? (description.trim() ? `${newline}${description.trim().replace(/\r?\n/g, newline)}${newline}` : "")
    : rest;
  return frontmatter + body;
}
