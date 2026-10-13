import { describe, expect, it } from "vitest";

import { readMarker, withMarker } from "../src/sync/markers";

describe("markers", () => {
  it("round-trips a story marker", () => {
    const body = withMarker("Some body", "story", "001-002");
    expect(body).toBe("Some body\n\n<!-- gh-roadmap:story:001-002 -->");
    expect(readMarker(body)).toEqual({ kind: "story", id: "001-002" });
  });

  it("handles empty text", () => {
    expect(withMarker("", "milestone", "001")).toBe("<!-- gh-roadmap:milestone:001 -->");
  });

  it("returns null without a marker", () => {
    expect(readMarker("plain body")).toBeNull();
    expect(readMarker(null)).toBeNull();
  });
});
