import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildGcsUploadPlan, publishGcsUploadPlan } from '../src/gcs-publish.js';

test('Google Cloud upload publishes immutable artifacts before current manifests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sitex-gcs-publish-'));
  try {
    await mkdir(path.join(root, 'runtime/mcp/stable/0.2.0'), { recursive: true });
    await mkdir(path.join(root, 'host'), { recursive: true });
    await mkdir(path.join(root, '.staging/mcp'), { recursive: true });
    await writeFile(path.join(root, 'runtime/mcp/stable/0.2.0/archive.tgz'), 'archive');
    await writeFile(path.join(root, 'runtime/mcp/stable/0.2.0/manifest.json'), '{}');
    await writeFile(path.join(root, 'runtime/mcp/stable/current.json'), '{}');
    await writeFile(path.join(root, 'host/releases.win-x64-stable.json'), '{}');
    await writeFile(path.join(root, '.staging/mcp/package.json'), '{}');

    const plan = await buildGcsUploadPlan({
      sourceRoot: root,
      bucketRoot: 'gs://sitexpos.appspot.com/worker-console/releases',
    });

    assert.deepEqual(plan.map((step) => step.destination), [
      'gs://sitexpos.appspot.com/worker-console/releases/runtime/mcp/stable/0.2.0/archive.tgz',
      'gs://sitexpos.appspot.com/worker-console/releases/runtime/mcp/stable/0.2.0/manifest.json',
      'gs://sitexpos.appspot.com/worker-console/releases/host/releases.win-x64-stable.json',
      'gs://sitexpos.appspot.com/worker-console/releases/runtime/mcp/stable/current.json',
    ]);
    assert.equal(plan.at(-2)?.publishLast, true, 'Velopack release indexes are mutable channel pointers');
    assert.equal(plan.at(-1)?.publishLast, true);
    assert.equal(plan.some((step) => step.destination.includes('/.staging/')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Google Cloud publisher gives current manifests no-cache headers', async () => {
  const calls: string[][] = [];
  await publishGcsUploadPlan([
    { source: '/out/archive.tgz', destination: 'gs://bucket/archive.tgz', publishLast: false },
    { source: '/out/current.json', destination: 'gs://bucket/current.json', publishLast: true },
  ], async (args) => { calls.push(args); });

  assert.deepEqual(calls, [
    ['storage', 'cp', '--predefined-acl=publicRead', '--cache-control=public,max-age=31536000,immutable', '/out/archive.tgz', 'gs://bucket/archive.tgz'],
    ['storage', 'cp', '--predefined-acl=publicRead', '--cache-control=no-store,max-age=0', '/out/current.json', 'gs://bucket/current.json'],
  ]);
});
