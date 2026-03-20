// ── lib/useGithubData.ts ───────────────────────────────────────────────────────
// Hook that fetches repository metadata, releases, and the CHANGELOG from the
// GitHub API / raw-content CDN for this app's own repository.
// All requests are unauthenticated (public repo, 60 req/h rate limit is fine).

import { useEffect, useState } from "react";
import {
  GITHUB_API_COMMITS_URL,
  GITHUB_API_RELEASES_URL,
  GITHUB_API_REPO_URL,
  GITHUB_RAW_CHANGELOG_URL,
} from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GithubRelease = {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
};

export type GithubCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
};

export type GithubRepoMeta = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count: number;
  updated_at: string;
  description: string | null;
};

export type GithubData = {
  meta: GithubRepoMeta | null;
  releases: GithubRelease[];
  commits: GithubCommit[];
  changelog: string | null;
  loading: boolean;
  error: string | null;
};

const FETCH_TIMEOUT_MS = 12_000;
const COMMITS_LIMIT = 10;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function safeText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGithubData(): GithubData {
  const [meta, setMeta] = useState<GithubRepoMeta | null>(null);
  const [releases, setReleases] = useState<GithubRelease[]>([]);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [metaData, releasesData, commitsData, changelogText] =
          await Promise.all([
            safeJson<GithubRepoMeta>(GITHUB_API_REPO_URL),
            safeJson<GithubRelease[]>(GITHUB_API_RELEASES_URL),
            safeJson<GithubCommit[]>(
              `${GITHUB_API_COMMITS_URL}?per_page=${COMMITS_LIMIT}`
            ),
            safeText(GITHUB_RAW_CHANGELOG_URL),
          ]);

        if (cancelled) return;

        setMeta(metaData);
        setReleases(releasesData ?? []);
        setCommits(commitsData ?? []);
        setChangelog(changelogText);
      } catch {
        if (!cancelled) setError("fetch_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  return { meta, releases, commits, changelog, loading, error };
}
