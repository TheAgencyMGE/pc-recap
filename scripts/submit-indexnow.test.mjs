import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/submit-indexnow.mjs');

test('submits the canonical page with its hosted ownership key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-recap-indexnow-'));
  await mkdir(join(root, 'website'), { recursive: true });
  await writeFile(join(root, 'website/indexnow-key.txt'), 'test-key-12345678\n');

  let submittedUrl;
  const server = createServer((request, response) => {
    submittedUrl = new URL(request.url, `http://${request.headers.host}`);
    response.writeHead(200).end();
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/indexnow`;

  try {
    const result = await new Promise((resolveProcess) => {
      const child = spawn(process.execPath, [
        script,
        '--root', root,
        '--url', 'https://pcrecap.online/',
        '--endpoint', endpoint,
      ], { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (status) => resolveProcess({ status, stdout, stderr }));
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(submittedUrl.searchParams.get('url'), 'https://pcrecap.online/');
    assert.equal(submittedUrl.searchParams.get('key'), 'test-key-12345678');
    assert.equal(submittedUrl.searchParams.get('keyLocation'), 'https://pcrecap.online/indexnow-key.txt');
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(root, { recursive: true, force: true });
  }
});
