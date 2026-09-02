import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildComponentManifest } from '../src/component-manifest.js';
import { installRuntimeComponent } from '../src/runtime-installer.js';

test('runtime install activates a version only after dependency install and health check', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sitex-runtime-installer-'));
  const archivePath = path.join(tempRoot, 'sitex-mcp-runtime-0.2.0.tgz');
  const archive = Buffer.from('verified runtime archive');
  const events: string[] = [];
  try {
    await writeFile(archivePath, archive);
    const manifest = buildComponentManifest({
      component: 'mcp',
      version: '0.2.0',
      channel: 'stable',
      publishedAt: '2026-09-02T02:00:00.000Z',
      fileName: path.basename(archivePath),
      sha256: createHash('sha256').update(archive).digest('hex'),
      size: archive.length,
    });

    const result = await installRuntimeComponent({
      manifest,
      archivePath,
      dataRoot: path.join(tempRoot, 'data'),
      extract: async (_archiveFile, destination) => {
        events.push('extract');
        await mkdir(destination, { recursive: true });
        await writeFile(path.join(destination, 'package.json'), '{"name":"runtime"}');
        await writeFile(path.join(destination, 'package-lock.json'), '{"lockfileVersion":3}');
      },
      installDependencies: async (directory) => {
        events.push('npm-ci');
        await stat(path.join(directory, 'package-lock.json'));
      },
      healthCheck: async () => {
        events.push('health-check');
      },
    });

    assert.deepEqual(events, ['extract', 'npm-ci', 'health-check']);
    assert.equal(result.activeVersion, '0.2.0');
    assert.deepEqual(
      JSON.parse(await readFile(path.join(tempRoot, 'data/mcp/current.json'), 'utf8')),
      { version: '0.2.0' },
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('failed runtime health check preserves the previous active version', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sitex-runtime-rollback-'));
  const archivePath = path.join(tempRoot, 'sitex-compute-runtime-0.2.0.tgz');
  const archive = Buffer.from('compute runtime archive');
  const dataRoot = path.join(tempRoot, 'data');
  try {
    await writeFile(archivePath, archive);
    await mkdir(path.join(dataRoot, 'compute'), { recursive: true });
    await writeFile(path.join(dataRoot, 'compute/current.json'), '{"version":"0.1.9"}\n');
    const manifest = buildComponentManifest({
      component: 'compute',
      version: '0.2.0',
      channel: 'stable',
      publishedAt: '2026-09-02T02:00:00.000Z',
      fileName: path.basename(archivePath),
      sha256: createHash('sha256').update(archive).digest('hex'),
      size: archive.length,
    });

    await assert.rejects(
      installRuntimeComponent({
        manifest,
        archivePath,
        dataRoot,
        extract: async (_archiveFile, destination) => {
          await mkdir(path.join(destination, 'functions'), { recursive: true });
          await writeFile(path.join(destination, 'package-lock.json'), '{"lockfileVersion":3}');
          await writeFile(path.join(destination, 'functions/package-lock.json'), '{"lockfileVersion":3}');
        },
        installDependencies: async () => {},
        healthCheck: async () => { throw new Error('probe failed'); },
      }),
      (error) => (error as NodeJS.ErrnoException).code === 'RUNTIME_HEALTH_CHECK_FAILED',
    );

    assert.deepEqual(
      JSON.parse(await readFile(path.join(dataRoot, 'compute/current.json'), 'utf8')),
      { version: '0.1.9' },
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('compute runtime installs both worker and Cloud Function dependency locks', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sitex-compute-installer-'));
  const archivePath = path.join(tempRoot, 'sitex-compute-runtime-0.2.0.tgz');
  const archive = Buffer.from('compute runtime with two lockfiles');
  const installedRoots: string[] = [];
  try {
    await writeFile(archivePath, archive);
    const manifest = buildComponentManifest({
      component: 'compute',
      version: '0.2.0',
      channel: 'stable',
      publishedAt: '2026-09-02T02:00:00.000Z',
      fileName: path.basename(archivePath),
      sha256: createHash('sha256').update(archive).digest('hex'),
      size: archive.length,
    });

    await installRuntimeComponent({
      manifest,
      archivePath,
      dataRoot: path.join(tempRoot, 'data'),
      extract: async (_archiveFile, destination) => {
        await mkdir(path.join(destination, 'functions'), { recursive: true });
        await writeFile(path.join(destination, 'package-lock.json'), '{"lockfileVersion":3}');
        await writeFile(path.join(destination, 'functions/package-lock.json'), '{"lockfileVersion":3}');
      },
      installDependencies: async (directory) => { installedRoots.push(path.relative(tempRoot, directory)); },
      healthCheck: async () => {},
    });

    assert.equal(installedRoots.length, 2);
    assert.match(installedRoots[0]!, /\.installing-0\.2\.0-[^/]+$/);
    assert.match(installedRoots[1]!, /\.installing-0\.2\.0-[^/]+\/functions$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
