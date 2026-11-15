import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUnifiedDiff, createGitHubPullRequest, isAllowedCodePath } from './change-proposals.mjs';

const original = 'const greeting = "hello";\nconsole.log(greeting);\n';
const diff = [
  '--- a/Octo-Industries/BehindTheScenes/hub/app.js',
  '+++ b/Octo-Industries/BehindTheScenes/hub/app.js',
  '@@ -1,2 +1,2 @@',
  '-const greeting = "hello";',
  '+const greeting = "Hi";',
  ' console.log(greeting);',
].join('\n');

test('code proposal paths are restricted to supported repository source files', () => {
  assert.equal(isAllowedCodePath('Octo-Industries/BehindTheScenes/hub/app.js'), true);
  assert.equal(isAllowedCodePath('Octo-Industries/BehindTheScenes/admin/server.mjs'), false);
  assert.equal(isAllowedCodePath('../package.json'), false);
  assert.equal(isAllowedCodePath('Octo-Industries/BehindTheScenes/admin/.env'), false);
  assert.equal(isAllowedCodePath('Octo-Industries/BehindTheScenes/admin/package.json'), false);
  assert.equal(isAllowedCodePath('Octo-Industries/BehindTheScenes/hub/app.min.js'), false);
});

test('unified diff applies only when the exact source context matches', () => {
  assert.deepEqual(applyUnifiedDiff(original, diff), {
    path: 'Octo-Industries/BehindTheScenes/hub/app.js',
    content: 'const greeting = "Hi";\nconsole.log(greeting);\n',
  });
  assert.throws(() => applyUnifiedDiff(original.replace('hello', 'goodbye'), diff), /context no longer matches/);
  assert.throws(() => applyUnifiedDiff(original, diff.replace('a/Octo-Industries', 'a/../Octo-Industries')), /unsafe/);
});

test('GitHub pull request is created from an approved proposal without merging', async () => {
  const requests = [];
  const fetchMock = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
    const pathname = new URL(url).pathname;
    let body = {};
    if (pathname.endsWith('/repos/nv24191/Personal')) body = { default_branch: 'main' };
    else if (pathname.endsWith('/git/ref/heads/main')) body = { object: { sha: 'base-commit' } };
    else if (pathname.endsWith('/git/commits/base-commit')) body = { tree: { sha: 'base-tree' } };
    else if (pathname.includes('/contents/Octo-Industries/BehindTheScenes/hub/app.js')) {
      body = { type: 'file', content: Buffer.from(original).toString('base64') };
    } else if (pathname.endsWith('/git/refs')) body = { object: { sha: 'base-commit' } };
    else if (pathname.endsWith('/git/blobs')) body = { sha: 'new-blob' };
    else if (pathname.endsWith('/git/trees')) body = { sha: 'new-tree' };
    else if (pathname.endsWith('/git/commits')) body = { sha: 'new-commit' };
    else if (pathname.includes('/git/refs/heads/')) body = { ref: 'updated' };
    else if (pathname.endsWith('/pulls')) body = { html_url: 'https://github.com/nv24191/Personal/pull/17', number: 17 };
    else return new Response(JSON.stringify({ message: `Unexpected request: ${pathname}` }), { status: 500 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await createGitHubPullRequest({
    proposal: {
      id: '0123456789abcdef0123',
      kind: 'code',
      title: 'Fix greeting',
      summary: 'Correct the greeting shown by this page.',
      diff,
    },
    token: 'test-token',
    fetchImpl: fetchMock,
  });

  assert.deepEqual(result, {
    url: 'https://github.com/nv24191/Personal/pull/17',
    number: 17,
    branch: 'octo-ai/0123456789abcdef0123',
  });
  assert.equal(requests.find((request) => request.url.endsWith('/git/trees')).body.base_tree, 'base-tree');
  assert.equal(requests.find((request) => request.url.endsWith('/git/commits')).body.parents[0], 'base-commit');
  assert.equal(requests.at(-1).url.endsWith('/pulls'), true);
  assert.equal(requests.some((request) => request.method === 'PUT' || request.url.includes('/merge')), false);
});

test('GitHub API is not contacted without explicit PR credentials', async () => {
  let requestCount = 0;
  await assert.rejects(
    createGitHubPullRequest({ proposal: {}, token: '', fetchImpl: async () => { requestCount += 1; } }),
    /GITHUB_TOKEN/,
  );
  assert.equal(requestCount, 0);
});
