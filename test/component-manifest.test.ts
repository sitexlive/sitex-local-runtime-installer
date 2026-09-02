import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComponentManifest } from '../src/component-manifest.js';

test('component manifest carries a verified dependency-free runtime release contract', () => {
  assert.deepEqual(buildComponentManifest({
    component: 'mcp',
    version: '0.2.0',
    channel: 'stable',
    publishedAt: '2026-09-02T02:00:00.000Z',
    fileName: 'sitex-mcp-runtime-0.2.0.tgz',
    sha256: 'a'.repeat(64),
    size: 12345,
  }), {
    schemaVersion: 1,
    component: 'mcp',
    version: '0.2.0',
    channel: 'stable',
    publishedAt: '2026-09-02T02:00:00.000Z',
    artifact: {
      fileName: 'sitex-mcp-runtime-0.2.0.tgz',
      sha256: 'a'.repeat(64),
      size: 12345,
    },
    runtime: {
      nodeMajor: 22,
      install: 'npm-ci',
      installRoots: ['.'],
      dependenciesIncluded: false,
    },
  });
});

test('component manifest rejects an invalid SHA-256 before publication', () => {
  assert.throws(
    () => buildComponentManifest({
      component: 'compute',
      version: '0.2.0',
      channel: 'stable',
      publishedAt: '2026-09-02T02:00:00.000Z',
      fileName: 'sitex-compute-runtime-0.2.0.tgz',
      sha256: 'not-a-digest',
      size: 12345,
    }),
    (error) => (error as NodeJS.ErrnoException).code === 'INVALID_ARTIFACT_SHA256',
  );
});

test('compute manifest installs its Codex Runner and Functions workspaces from the root lock', () => {
  const manifest = buildComponentManifest({
    component: 'compute',
    version: '0.2.1',
    channel: 'stable',
    publishedAt: '2026-09-02T04:00:00.000Z',
    fileName: 'sitex-compute-runtime-0.2.1.tgz',
    sha256: 'b'.repeat(64),
    size: 23456,
  });

  assert.deepEqual(manifest.runtime.installRoots, ['.']);
});
