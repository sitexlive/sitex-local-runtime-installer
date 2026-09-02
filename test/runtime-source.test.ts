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
    await mkdir(path.join(workerRoot, 'src/shared'), { recursive: true });
    await mkdir(path.join(workerRoot, 'src/monitor'), { recursive: true });
    await mkdir(path.join(workerRoot, 'node_modules/never'), { recursive: true });
    await writeFile(path.join(workerRoot, 'src/mcp/stdio.cjs'), "require('../shared/transport.js');\n");
    await writeFile(path.join(workerRoot, 'src/shared/transport.js'), '// reachable transport');
    await writeFile(path.join(workerRoot, 'src/business-worker.js'), '// unrelated compute worker');
    await writeFile(path.join(workerRoot, 'src/mcp/workflowDraftSource.js'), '// retired workflow drafts');
    await writeFile(path.join(workerRoot, 'src/ai-session-worker.js'), '// retired sessions');
    await writeFile(path.join(workerRoot, 'src/workflow-execution-budget.js'), '// retired workflow');
    await writeFile(path.join(workerRoot, 'src/monitor/App.vue'), '<template>retired session monitor</template>');
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
    await access(path.join(destination, 'src/shared/transport.js'));
    await assert.rejects(access(path.join(destination, 'src/business-worker.js')));
    await assert.rejects(access(path.join(destination, 'src/mcp/workflowDraftSource.js')));
    await assert.rejects(access(path.join(destination, 'src/ai-session-worker.js')));
    await assert.rejects(access(path.join(destination, 'src/workflow-execution-budget.js')));
    await assert.rejects(access(path.join(destination, 'src/monitor')));
    await assert.rejects(access(path.join(destination, '.env')));
    await assert.rejects(access(path.join(destination, 'node_modules')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compute source stages Codex Runner and Business Worker without the retired AI Workflow system or MCP source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sitex-compute-source-'));
  const workerRoot = path.join(root, 'worker');
  const codexRunnerRoot = path.join(root, 'codex-runner');
  const functionsRoot = path.join(root, 'functions');
  const mcpCoreRoot = path.join(root, 'mcp-core');
  const mcpServerRoot = path.join(root, 'mcp-server');
  const destination = path.join(root, 'staged');
  try {
    await mkdir(path.join(workerRoot, 'src'), { recursive: true });
    await mkdir(path.join(workerRoot, 'bin'), { recursive: true });
    await writeFile(path.join(workerRoot, 'src/business-worker.js'), '// business worker');
    await writeFile(path.join(workerRoot, 'src/business-worker-runtime.js'), '// business runtime');
    await writeFile(path.join(workerRoot, 'src/functionsBridge.js'), '// functions bridge');
    await writeFile(path.join(workerRoot, 'src/ai-session-worker.js'), '// retired workflow worker');
    await writeFile(path.join(workerRoot, 'bin/sitex-business-worker.js'), '// business launcher');
    await writeFile(path.join(workerRoot, 'bin/sitex-ai-agent-worker.js'), '// retired workflow launcher');
    await writeFile(path.join(workerRoot, 'package.json'), '{"dependencies":{}}');
    await mkdir(path.join(codexRunnerRoot, 'src'), { recursive: true });
    await writeFile(path.join(codexRunnerRoot, 'src/cli.js'), '// codex runner');
    await writeFile(path.join(codexRunnerRoot, 'package.json'), JSON.stringify({
      name: '@sitex/codex-runner',
      dependencies: { '@openai/codex-sdk': '^0.149.1', firebase: '^12.18.0' },
    }));
    await mkdir(path.join(functionsRoot, 'node_modules/never'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'ai_sessions/workflow-drafts/OLD'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'firebase'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'local-compute'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'email'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'shared'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'shared/vendor/packages/storage-core/cjs'), { recursive: true });
    await mkdir(path.join(functionsRoot, 'recurring'), { recursive: true });
    await writeFile(path.join(functionsRoot, 'api.js'), [
      "require('firebase-admin');",
      "require('./shared/admin-helper.js');",
      '',
    ].join('\n'));
    await writeFile(path.join(functionsRoot, 'shared/admin-helper.js'), '// reachable helper');
    await writeFile(path.join(functionsRoot, 'firebase/email.smtp.js'), [
      "require('imapflow');",
      "try { require('re2'); } catch {}",
      "require('../shared/email-helper.js');",
      "require('../shared/vendor/packages/storage-core/cjs/path.cjs');",
      '',
    ].join('\n'));
    await writeFile(path.join(functionsRoot, 'shared/email-helper.js'), '// reachable helper');
    await writeFile(path.join(functionsRoot, 'shared/vendor/packages/storage-core/cjs/path.cjs'), [
      'const registry = [',
      "  { pattern: 'sites/{site}/ai_sessions/{id}', collection: 'ai_sessions' },",
      '];',
      'module.exports = registry;',
      '',
    ].join('\n'));
    await writeFile(path.join(functionsRoot, 'local-compute/jobQueue.js'), '// queue');
    await writeFile(path.join(functionsRoot, 'email/emailSyncJob.js'), "require('../local-compute/jobQueue.js');\n");
    await writeFile(path.join(functionsRoot, 'email/emailSyncFailureNotification.js'), '// failure notification');
    await writeFile(path.join(functionsRoot, 'recurring/aiSessionHandler.js'), '// retired unrelated worker');
    await writeFile(path.join(functionsRoot, 'index.js'), '// unrelated Cloud Functions entrypoint');
    await writeFile(path.join(functionsRoot, 'ai_sessions/workflow-drafts/OLD/index.js'), '// retired workflow');
    await writeFile(path.join(functionsRoot, 'package.json'), JSON.stringify({
      name: 'functions',
      dependencies: {
        'firebase-admin': '^12.0.0',
        imapflow: '^1.4.7',
        re2: '^1.26.1',
        'html-pdf': '^2.2.0',
        node: '^20.13.1',
      },
    }));
    await writeFile(path.join(functionsRoot, 'package-lock.json'), '{"lockfileVersion":3}');
    for (const packageRoot of [mcpCoreRoot, mcpServerRoot]) {
      await mkdir(packageRoot, { recursive: true });
      await writeFile(path.join(packageRoot, 'package.json'), '{"name":"local"}');
    }

    await prepareRuntimeSource({
      component: 'compute',
      version: '0.2.0',
      workerRoot,
      codexRunnerRoot,
      functionsRoot,
      mcpCoreRoot,
      mcpServerRoot,
      destination,
      writeLockfile: async (directory) => writeFile(path.join(directory, 'package-lock.json'), '{"lockfileVersion":3}\n'),
    });

    const packageJson = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
    const functionsPackage = JSON.parse(await readFile(path.join(destination, 'functions/package.json'), 'utf8'));
    assert.deepEqual(packageJson.workspaces, ['codex-runner', 'functions']);
    assert.deepEqual(functionsPackage.dependencies, {
      'firebase-admin': '^12.0.0',
      imapflow: '^1.4.7',
      re2: '^1.26.1',
    });
    await access(path.join(destination, 'codex-runner/src/cli.js'));
    await access(path.join(destination, 'bin/sitex-business-worker.js'));
    await access(path.join(destination, 'src/business-worker-runtime.js'));
    await access(path.join(destination, 'functions/api.js'));
    await access(path.join(destination, 'functions/shared/admin-helper.js'));
    await access(path.join(destination, 'functions/shared/email-helper.js'));
    await access(path.join(destination, 'functions/local-compute/jobQueue.js'));
    await access(path.join(destination, 'functions/email/emailSyncJob.js'));
    await access(path.join(destination, 'package-lock.json'));
    await assert.rejects(access(path.join(destination, 'functions/package-lock.json')));
    const stagedStoragePaths = await readFile(
      path.join(destination, 'functions/shared/vendor/packages/storage-core/cjs/path.cjs'),
      'utf8',
    );
    assert.doesNotMatch(stagedStoragePaths, /ai[_ -]?sessions?|ai[_ -]?workflow/i);
    await assert.rejects(access(path.join(destination, 'bin/sitex-ai-agent-worker.js')));
    await assert.rejects(access(path.join(destination, 'src/ai-session-worker.js')));
    await assert.rejects(access(path.join(destination, 'functions/ai_sessions')));
    await assert.rejects(access(path.join(destination, 'functions/recurring')));
    await assert.rejects(access(path.join(destination, 'functions/index.js')));
    await assert.rejects(access(path.join(destination, 'vendor/sitex-mcp-core')));
    await assert.rejects(access(path.join(destination, 'functions/node_modules')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
