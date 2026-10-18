const apiBase = 'https://api.github.com';

export function parseAllowedRepository(value) {
  const match = String(value || '').trim().match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function githubIssueSource(issue, repository) {
  if (!issue || issue.pull_request || issue.state !== 'open' || !Number.isInteger(issue.number) ||
      !issue.labels?.some(label => String(label.name || '').toLowerCase() === 'fo')) return null;
  return {
    title: String(issue.title || '').slice(0, 160),
    description: String(issue.body || '').slice(0, 2000),
    source: {
      type: 'github', owner: repository.owner, repo: repository.repo,
      issue: issue.number,
      url: `https://github.com/${repository.owner}/${repository.repo}/issues/${issue.number}`
    }
  };
}

export async function listFoIssues(repository, token, request = fetch) {
  const url = new URL(`/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/issues`, apiBase);
  url.searchParams.set('state', 'open');
  url.searchParams.set('labels', 'fo');
  url.searchParams.set('per_page', '100');
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'proof-of-done-hackathon' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await request(url, { headers });
  if (!response.ok) throw new Error(`GitHub issue sync failed (${response.status}).`);
  const issues = await response.json();
  if (!Array.isArray(issues)) throw new Error('GitHub returned an invalid issue list.');
  return issues.map(issue => githubIssueSource(issue, repository)).filter(Boolean);
}
