import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stageRuntimeRelease } from '../src/runtime-release.js';

test('runtime release stages a versioned archive plus an atomic channel manifest', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sitex-runtime-release-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const outputRoot = path.join(tempRoot, 'release');
  try {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(sourceRoot, { recursive: true }));
    await writeFile(path.join(sourceRoot, 'package.json'), '{"name":"sitex-mcp-runtime"}\n');
    await writeFile(path.join(sourceRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
    await writeFile(path.join(sourceRoot, 'index.cjs'), 'process.stdout.write("ok")\n');

    const result = await stageRuntimeRelease({
      component: 'mcp',
      version: '0.2.0',
      channel: 'stable',
      sourceRoot,
      outputRoot,
      publishedAt: '2026-09-02T02:00:00.000Z',
    });

    assert.equal(result.releasePrefix, 'runtime/mcp/stable/0.2.0');
    assert.equal(result.channelManifestPath, path.join(outputRoot, 'runtime/mcp/stable/current.json'));
    assert.equal((await stat(result.archivePath)).size, result.manifest.artifact.size);
    assert.equal(result.manifest.artifact.fileName, 'sitex-mcp-runtime-0.2.0.tgz');
    assert.deepEqual(
      JSON.parse(await readFile(result.channelManifestPath, 'utf8')),
      result.manifest,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
