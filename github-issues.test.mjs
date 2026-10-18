import test from 'node:test';
import assert from 'node:assert/strict';
import { githubIssueSource, listFoIssues, parseAllowedRepository } from './github-issues.mjs';

test('GitHub sync accepts only open fo issues and omits pull requests', async () => {
  const repository = parseAllowedRepository('BlackBeanEagles/fo');
  assert.deepEqual(repository, { owner: 'BlackBeanEagles', repo: 'fo' });
  assert.equal(parseAllowedRepository('https://github.com/other/repo'), null);
  const issue = { number: 21, title: 'Print a poster', body: 'Collect it by noon', state: 'open', labels: [{ name: 'Fo' }] };
  assert.equal(githubIssueSource(issue, repository).source.url, 'https://github.com/BlackBeanEagles/fo/issues/21');
  let called;
  const result = await listFoIssues(repository, '', async (url, options) => {
    called = { url: String(url), options };
    return { ok: true, json: async () => [issue, { ...issue, number: 22, pull_request: {} }, { ...issue, number: 23, state: 'closed' }, { ...issue, number: 24, labels: [] }] };
  });
  assert.deepEqual(result.map(item => item.source.issue), [21]);
  assert.match(called.url, /labels=fo/);
  assert.equal(called.options.headers.Authorization, undefined);
});
