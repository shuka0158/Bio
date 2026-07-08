#!/usr/bin/env node
// Builds data.json from the live GitHub API.
// Runs in CI (GitHub Actions) and locally. No dependencies — Node 18+ (global fetch).
// Optional env: GITHUB_TOKEN (higher rate limit), GH_USER (defaults to shuka0158).

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const USER = process.env.GH_USER || 'shuka0158';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.json');

const headers = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': `${USER}-bio-bot`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function allRepos() {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/users/${USER}/repos?per_page=100&type=owner&sort=updated&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork && !r.archived);
}

async function main() {
  const user = await gh(`/users/${USER}`);
  const repos = await allRepos();

  const stars = {};
  let topStars = 0;
  for (const r of repos) {
    stars[r.name] = r.stargazers_count;
    if (r.stargazers_count > topStars) topStars = r.stargazers_count;
  }

  const data = {
    generated_at: new Date().toISOString(),
    login: user.login,
    public_repos: user.public_repos,
    followers: user.followers,
    following: user.following,
    joined_year: new Date(user.created_at).getUTCFullYear(),
    top_stars: topStars,
    total_stars: Object.values(stars).reduce((a, b) => a + b, 0),
    stars, // { "repo-name": starCount }
  };

  await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
  console.log(`  repos=${data.public_repos} followers=${data.followers} top_stars=${data.top_stars} total_stars=${data.total_stars}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
