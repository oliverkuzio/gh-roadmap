import { execFileSync } from "node:child_process";

import type { Config } from "./types";

const GITHUB_REMOTE = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/;

function gitRemote(cwd: string): { owner: string; repo: string } | null {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const match = url.match(GITHUB_REMOTE);
    return match ? { owner: match[1], repo: match[2] } : null;
  }
  catch {
    return null;
  }
}

// Owner/repo come from .project/config.json, then GITHUB_OWNER/GITHUB_REPO, then the git "origin" remote.
export function resolveRepo(config: Partial<Config>, cwd: string): { owner: string; repo: string } | null {
  const remote = gitRemote(cwd);
  const owner = config.owner || process.env.GITHUB_OWNER || remote?.owner;
  const repo = config.repo || process.env.GITHUB_REPO || remote?.repo;
  return owner && repo ? { owner, repo } : null;
}
