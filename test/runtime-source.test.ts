import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareRuntimeSource } from '../src/runtime-source.js';

test('MCP source staging vendors local packages and excludes dependencies and secrets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sitex-mcp-source-'));
  const workerRoot = path.join(root, 'worker');
  const mcpCoreRoot = path.join(root, 'mcp-core');
  const mcpServerRoot = path.join(root, 'mcp-server');
  const destination = path.join(root, 'staged');
  try {
    await mkdir(path.join(workerRoot, 'src/mcp'), { recursive: true });
    await mkdir(path.join(workerRoot, 'node_modules/never'), { recursive: true });
    await writeFile(path.join(workerRoot, 'src/mcp/stdio.cjs'), '// local stdio');
    await writeFile(path.join(workerRoot, '.env'), 'SECRET=never');
    await writeFile(path.join(workerRoot, 'package.json'), JSON.stringify({
      dependencies: {
        '@sitex/mcp-core': 'file:../sitex-mcp-core',
        '@sitex/mcp-server': 'file:../sitex-mcp-server',
        firebase: '^12.0.0',
        velopack: '1.2.0',
      },
    }));
    for (const [packageRoot, name] of [[mcpCoreRoot, 'mcp-core'], [mcpServerRoot, 'mcp-server']] as const) {
      await mkdir(path.join(packageRoot, 'src'), { recursive: true });
      await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name }));
      await writeFile(path.join(packageRoot, 'src/index.js'), '// package');
    }

    await prepareRuntimeSource({
      component: 'mcp',
      version: '0.2.0',
      workerRoot,
      mcpCoreRoot,
      mcpServerRoot,
      destination,
      writeLockfile: async (directory) => writeFile(path.join(directory, 'package-lock.json'), '{"lockfileVersion":3}\n'),
    });

    const packageJson = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
    assert.equal(packageJson.dependencies['@sitex/mcp-core'], 'file:vendor/sitex-mcp-core');
    assert.equal(packageJson.dependencies['@sitex/mcp-server'], 'file:vendor/sitex-mcp-server');
    assert.equal(packageJson.dependencies.velopack, undefined);
    await access(path.join(destination, 'vendor/sitex-mcp-core/src/index.js'));
    await access(path.join(destination, 'src/mcp/stdio.cjs'));
    await assert.rejects(access(path.join(destination, '.env')));
    await assert.rejects(access(path.join(destination, 'node_modules')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compute source stages AI Agent and Cloud Function code without their node_modules', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sitex-compute-source-'));
  const workerRoot = path.join(root, 'worker');
  const functionsRoot = path.join(root, 'functions');
  const mcpCoreRoot = path.join(root, 'mcp-core');
  const mcpServerRoot = path.join(root, 'mcp-server');
  const destination = path.join(root, 'staged');
  try {
    await mkdir(path.join(workerRoot, 'src'), { recursive: true });
    await mkdir(path.join(workerRoot, 'bin'), { recursive: true });
    await writeFile(path.join(workerRoot, 'src/agent-server.js'), '// agent');
    await writeFile(path.join(workerRoot, 'bin/sitex-ai-agent-worker.js'), '// launcher');
    await writeFile(path.join(workerRoot, 'package.json'), '{"dependencies":{}}');
    await mkdir(path.join(functionsRoot, 'node_modules/never'), { recursive: true });
    await writeFile(path.join(functionsRoot, 'api.js'), '// functions');
    await writeFile(path.join(functionsRoot, 'package.json'), '{"name":"functions"}');
    await writeFile(path.join(functionsRoot, 'package-lock.json'), '{"lockfileVersion":3}');
    for (const packageRoot of [mcpCoreRoot, mcpServerRoot]) {
      await mkdir(packageRoot, { recursive: true });
      await writeFile(path.join(packageRoot, 'package.json'), '{"name":"local"}');
    }

    await prepareRuntimeSource({
      component: 'compute',
      version: '0.2.0',
      workerRoot,
      functionsRoot,
      mcpCoreRoot,
      mcpServerRoot,
      destination,
      writeLockfile: async (directory) => writeFile(path.join(directory, 'package-lock.json'), '{"lockfileVersion":3}\n'),
    });

    await access(path.join(destination, 'bin/sitex-ai-agent-worker.js'));
    await access(path.join(destination, 'functions/api.js'));
    await access(path.join(destination, 'functions/package-lock.json'));
    await assert.rejects(access(path.join(destination, 'functions/node_modules')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
