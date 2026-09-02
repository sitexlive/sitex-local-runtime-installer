import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as tar from 'tar';

import { createRuntimeArchive } from '../src/runtime-archive.js';

test('runtime archive contains source and lockfile but never dependencies or secrets', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sitex-runtime-archive-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const archivePath = path.join(tempRoot, 'runtime.tgz');
  try {
    await mkdir(path.join(sourceRoot, 'src'), { recursive: true });
    await mkdir(path.join(sourceRoot, 'node_modules/example'), { recursive: true });
    await writeFile(path.join(sourceRoot, 'package.json'), '{"name":"runtime"}');
    await writeFile(path.join(sourceRoot, 'package-lock.json'), '{"lockfileVersion":3}');
    await writeFile(path.join(sourceRoot, 'src/index.js'), 'export {};');
    await writeFile(path.join(sourceRoot, 'node_modules/example/index.js'), 'secret dependency');
    await writeFile(path.join(sourceRoot, '.env'), 'SECRET=value');

    await createRuntimeArchive({ sourceRoot, archivePath });
    const entries: string[] = [];
    await tar.t({ file: archivePath, onentry: (entry) => entries.push(entry.path) });

    assert.equal(entries.includes('package.json'), true);
    assert.equal(entries.includes('package-lock.json'), true);
    assert.equal(entries.includes('src/index.js'), true);
    assert.equal(entries.some((entry) => entry.includes('node_modules')), false);
    assert.equal(entries.some((entry) => entry.endsWith('.env')), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
