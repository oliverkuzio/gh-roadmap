import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LocalPlan } from "../types";
import type { RemoteIssue, RemoteState } from "./diff";

import { matchIssues, matchMilestones, milestoneDescription, normalize, storyBody } from "./diff";

// A fingerprint of each synced field, so a later sync can tell what changed on GitHub since
type Snapshot = Record<string, string>;

export type SyncState = {
  milestones: Record<string, Snapshot>;
  stories: Record<string, Snapshot>;
};

export type Overwrite = {
  kind: "issue" | "milestone";
  number: number;
  title: string;
  fields: string[];
  // True when no earlier sync was recorded, so the differences may be edits made on either side
  unknown: boolean;
};

const STATE_FILE = "sync-state.json";

function fingerprint(fields: Record<string, string>): Snapshot {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, createHash("sha1").update(value).digest("hex").slice(0, 12)]),
  );
}

function milestoneSnapshot(milestone: { title: string; description: string | null; dueOn: string | null; state: string }): Snapshot {
  return fingerprint({
    "title": normalize(milestone.title),
    "description": normalize(milestone.description),
    "due date": milestone.dueOn?.slice(0, 10) ?? "",
    "state": milestone.state,
  });
}

function issueSnapshot(issue: { title: string; body: string; closed: boolean; labels: string[]; milestoneId: string | null }): Snapshot {
  return fingerprint({
    title: normalize(issue.title),
    body: normalize(issue.body),
    state: issue.closed ? "closed" : "open",
    labels: issue.labels.map(label => label.toLowerCase()).sort().join("\n"),
    milestone: issue.milestoneId ?? "",
  });
}

function managedLabels(local: LocalPlan): Set<string> {
  return new Set([...local.milestones.map(m => m.label), ...local.stories.map(s => s.label)].map(label => label.toLowerCase()));
}

function remoteIssueSnapshot(issue: RemoteIssue, managed: Set<string>): Snapshot {
  return issueSnapshot({
    title: issue.title,
    body: issue.body,
    closed: issue.state === "CLOSED",
    labels: issue.labels.map(label => label.name).filter(name => managed.has(name.toLowerCase())),
    milestoneId: issue.milestoneId,
  });
}

// Records how every item that has a file looks on GitHub. Taken right after a sync, when both sides match.
export function snapshot(local: LocalPlan, remote: Pick<RemoteState, "milestones" | "issues">): SyncState {
  const managed = managedLabels(local);
  return {
    milestones: Object.fromEntries(
      [...matchMilestones(local, remote).matches].map(([id, milestone]) => [id, milestoneSnapshot(milestone)]),
    ),
    stories: Object.fromEntries(
      [...matchIssues(local, remote).matches].map(([id, issue]) => [id, remoteIssueSnapshot(issue, managed)]),
    ),
  };
}

function changedFields(previous: Snapshot | undefined, current: Snapshot, intended: Snapshot) {
  // A field is overwritten when sync up would change it and it changed on GitHub since the last sync.
  // Without a previous snapshot there's no telling who changed it, so every difference counts.
  const fields = Object.keys(current).filter(field =>
    current[field] !== intended[field] && (!previous || previous[field] !== current[field]),
  );
  return { fields, unknown: !previous };
}

// Lists edits made on GitHub since the last sync that sync up would overwrite
export function findOverwrites(local: LocalPlan, remote: RemoteState, previous: SyncState | null): Overwrite[] {
  const overwrites: Overwrite[] = [];
  const managed = managedLabels(local);

  const milestoneMatch = matchMilestones(local, remote);
  for (const milestone of local.milestones) {
    const existing = milestoneMatch.matches.get(milestone.id);
    if (!existing) {
      continue;
    }
    const intended = milestoneSnapshot({ ...milestone, description: milestoneDescription(milestone), state: "open" });
    const { fields, unknown } = changedFields(previous?.milestones[milestone.id], milestoneSnapshot(existing), intended);
    if (fields.length > 0) {
      overwrites.push({ kind: "milestone", number: existing.number, title: existing.title, fields, unknown });
    }
  }

  const milestoneNodeIds = new Map([...milestoneMatch.matches].map(([id, milestone]) => [id, milestone.nodeId]));
  const issueMatch = matchIssues(local, remote);
  for (const story of local.stories) {
    const existing = issueMatch.matches.get(story.id);
    if (!existing) {
      continue;
    }
    const intended = issueSnapshot({
      title: story.title,
      body: storyBody(story),
      closed: story.closed,
      labels: [story.label],
      milestoneId: milestoneNodeIds.get(story.milestoneId) ?? null,
    });
    const { fields, unknown } = changedFields(previous?.stories[story.id], remoteIssueSnapshot(existing, managed), intended);
    if (fields.length > 0) {
      overwrites.push({ kind: "issue", number: existing.number, title: existing.title, fields, unknown });
    }
  }

  return overwrites;
}

export function describeOverwrite(overwrite: Overwrite): string {
  const item = overwrite.kind === "issue" ? `issue #${overwrite.number}` : "milestone";
  return `${item} "${overwrite.title}" (${overwrite.fields.join(", ")})`;
}

export function readSyncState(dir: string): SyncState | null {
  const file = join(dir, STATE_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) as SyncState : null;
}

export function writeSyncState(dir: string, state: SyncState) {
  writeFileSync(join(dir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}
