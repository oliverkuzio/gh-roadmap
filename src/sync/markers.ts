export type MarkerKind = "milestone" | "story";

const MARKER = /<!-- gh-roadmap:(milestone|story):([\d-]+) -->/;

export function withMarker(text: string, kind: MarkerKind, id: string): string {
  const marker = `<!-- gh-roadmap:${kind}:${id} -->`;
  return text ? `${text}\n\n${marker}` : marker;
}

export function readMarker(text: string | null | undefined): { kind: MarkerKind; id: string } | null {
  const match = text?.match(MARKER);
  if (!match) {
    return null;
  }
  return { kind: match[1] as MarkerKind, id: match[2] };
}

export function stripMarker(text: string | null | undefined): string {
  return (text ?? "").replace(new RegExp(MARKER.source, "g"), "").replace(/\r\n/g, "\n").trim();
}
