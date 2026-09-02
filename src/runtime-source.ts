import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

import type { RuntimeComponent } from './component-manifest.js';

export interface PrepareRuntimeSourceInput {
  component: RuntimeComponent;
  version: string;
  workerRoot: string;
  mcpCoreRoot: string;
  mcpServerRoot: string;
  codexRunnerRoot?: string;
  functionsRoot?: string;
  destination: string;
  writeLockfile?: (directory: string) => Promise<void>;
}

const DENIED_NAMES = new Set([
  '.git', '.codebase-memory', 'certificates', 'coverage', 'dist', 'docs', 'key', 'keys',
  'node_modules', 'out', 'test', 'tests', '__tests__', 'ai_sessions', 'monitor', 'workflow-drafts',
]);

const RETIRED_SOURCE_FILE_NAMES = new Set([
  'agent-heartbeat.js',
  'agent-server.js',
  'agent-worker-runtime.js',
  'ai-session-worker.js',
  'run-ai-agent-workers.js',
  'runner-ai-session-watch.js',
  'runner-machine.js',
  'runner-monitor-server.js',
  'runner-site-registry.js',
  'runner-status.js',
  'workflowDraftSource.js',
  'workflow-execution-budget.js',
  'workflow-node-checkpoints.js',
  'workflow-runtime-ai-port.js',
]);

function safeSourcePath(sourceRoot: string, entryPath: string): boolean {
  const relative = path.relative(sourceRoot, entryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.some((segment) => DENIED_NAMES.has(segment))) return false;
  if (segments.some((segment) => RETIRED_SOURCE_FILE_NAMES.has(segment))) return false;
  return !segments.some((segment) => segment === '.env' || segment.startsWith('.env.')
    || /(?:service-account|firebase-adminsdk).+\.json$/i.test(segment)
    || /\.(?:p12|pem|key)$/i.test(segment));
}

async function copySafe(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (entry) => safeSourcePath(source, entry),
  });
}

async function copySelected(sourceRoot: string, destinationRoot: string, entries: string[]): Promise<void> {
  for (const entry of entries) {
    const destination = path.join(destinationRoot, entry);
    await mkdir(path.dirname(destination), { recursive: true });
    await copySafe(path.join(sourceRoot, entry), destination);
  }
}

const COMPUTE_FUNCTION_ENTRYPOINTS = [
  'api.js',
  'firebase/email.smtp.js',
  'local-compute/jobQueue.js',
  'email/emailSyncJob.js',
  'email/emailSyncFailureNotification.js',
];

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function resolveLocalModule(importer: string, specifier: string): Promise<string | null> {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.cjs'),
    path.join(base, 'index.mjs'),
  ];
  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

function moduleSpecifiers(source: string): string[] {
  const results = new Set<string>();
  const patterns = [
    /require\(\s*(['"])([^'"]+)\1\s*\)/g,
    /import\(\s*(['"])([^'"]+)\1\s*\)/g,
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?(['"])([^'"]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[2]) results.add(match[2]);
    }
  }
  return [...results];
}

function dependencyPackageName(specifier: string): string {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0] || specifier;
}

async function copyLocalModuleClosure(
  sourceRoot: string,
  destinationRoot: string,
  entrypoints: string[],
): Promise<Set<string>> {
  const pending = entrypoints.map((entry) => path.resolve(sourceRoot, entry));
  const visited = new Set<string>();
  const dependencies = new Set<string>();

  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (!sourcePath || visited.has(sourcePath)) continue;
    visited.add(sourcePath);
    if (!safeSourcePath(sourceRoot, sourcePath) || !(await isFile(sourcePath))) {
      throw new Error(`Required compute Functions source is missing or blocked: ${path.relative(sourceRoot, sourcePath)}`);
    }

    const relative = path.relative(sourceRoot, sourcePath);
    const destination = path.join(destinationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copySafe(sourcePath, destination);

    if (!/\.(?:c|m)?js$/i.test(sourcePath)) continue;
    const source = await readFile(sourcePath, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        if (!path.isAbsolute(specifier) && !NODE_BUILTINS.has(specifier)) {
          dependencies.add(dependencyPackageName(specifier));
        }
        continue;
      }
      const resolved = await resolveLocalModule(sourcePath, specifier);
      // Some legacy Functions modules contain lazy, unreachable requires whose
      // targets no longer exist in the source tree. They do not fail in Cloud
      // unless that retired method is invoked, so they must not prevent staging
      // the explicit email-sync runtime closure.
      if (resolved) pending.push(resolved);
    }
  }
  return dependencies;
}

async function writeMinimalFunctionsPackage(
  sourceRoot: string,
  destinationRoot: string,
  usedPackages: Set<string>,
): Promise<void> {
  const sourcePackage = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
  const available = {
    ...(sourcePackage.dependencies || {}),
    ...(sourcePackage.optionalDependencies || {}),
  } as Record<string, string>;
  const dependencies: Record<string, string> = {};
  for (const name of [...usedPackages].sort()) {
    const version = available[name];
    if (!version) throw new Error(`Functions runtime imports ${name}, but it is not declared in package.json.`);
    dependencies[name] = version;
  }
  await writeFile(path.join(destinationRoot, 'package.json'), `${JSON.stringify({
    name: '@sitex/email-sync-functions-runtime',
    version: String(sourcePackage.version || '0.0.0'),
    private: true,
    engines: { node: '22.x' },
    scripts: {},
    dependencies,
  }, null, 2)}\n`, 'utf8');
}

async function rewriteIfPresent(
  root: string,
  relativePath: string,
  rewrite: (source: string) => string,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  if (!(await isFile(filePath))) return;
  const source = await readFile(filePath, 'utf8');
  await writeFile(filePath, rewrite(source), 'utf8');
}

async function scrubRetiredFunctionsCompatibility(functionsRoot: string): Promise<void> {
  await rewriteIfPresent(functionsRoot, 'firebase/firestore.functions.js', (source) => source.replace(
    /} else if \(collection == "ai_sessions"\) \{[\s\S]*?\n\s*} else \{/,
    '} else {',
  ));
  await rewriteIfPresent(
    functionsRoot,
    'shared/vendor/packages/storage-core/cjs/path.cjs',
    (source) => source
      .split('\n')
      .filter((line) => !/ai[_ -]?sessions?/i.test(line))
      .join('\n'),
  );
  await rewriteIfPresent(
    functionsRoot,
    'shared/vendor/packages/storage-core/cjs/structure.cjs',
    (source) => source
      .split('\n')
      .filter((line) => !/ai[_ -]?sessions?/i.test(line))
      .join('\n'),
  );
  await rewriteIfPresent(
    functionsRoot,
    'shared/vendor/packages/notifications-core/cjs/types.cjs',
    (source) => source.replace(/OUTSIDE an ai_session/gi, 'outside an active task'),
  );
}

const RETIRED_CONTENT_PATTERN = /ai[_ -]?sessions?|ai[_ -]?workflow/i;

async function assertNoRetiredRuntimeSource(root: string): Promise<void> {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!/\.(?:c|m)?js$|\.json$/i.test(entry.name) || entry.name === 'package-lock.json') continue;
      if (RETIRED_CONTENT_PATTERN.test(await readFile(entryPath, 'utf8'))) {
        throw new Error(`Retired AI Session/Workflow source reached the ${path.relative(root, entryPath)} runtime file.`);
      }
    }
  }
}

function defaultWriteLockfile(directory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
    ], { cwd: directory, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`Could not generate runtime lockfile: ${String(stderr || error.message).trim()}`));
      else resolve();
    });
  });
}

export async function prepareRuntimeSource(input: PrepareRuntimeSourceInput): Promise<void> {
  await rm(input.destination, { recursive: true, force: true });
  await mkdir(input.destination, { recursive: true });
  if (input.component === 'compute') {
    if (!input.functionsRoot) throw new Error('Compute runtime staging requires the Cloud Functions source root.');
    if (!input.codexRunnerRoot) throw new Error('Compute runtime staging requires the Codex Runner source root.');
    await copySelected(input.workerRoot, input.destination, [
      'bin/sitex-business-worker.js',
      'src/business-worker.js',
      'src/business-worker-runtime.js',
      'src/functionsBridge.js',
    ]);
    await copySafe(path.join(input.codexRunnerRoot, 'src'), path.join(input.destination, 'codex-runner', 'src'));
    await copySafe(path.join(input.codexRunnerRoot, 'package.json'), path.join(input.destination, 'codex-runner', 'package.json'));
    const functionsDependencies = await copyLocalModuleClosure(
      input.functionsRoot,
      path.join(input.destination, 'functions'),
      COMPUTE_FUNCTION_ENTRYPOINTS,
    );
    await writeMinimalFunctionsPackage(
      input.functionsRoot,
      path.join(input.destination, 'functions'),
      functionsDependencies,
    );
    await scrubRetiredFunctionsCompatibility(path.join(input.destination, 'functions'));
  } else {
    await copyLocalModuleClosure(input.workerRoot, input.destination, ['src/mcp/stdio.cjs']);
    await copySafe(input.mcpCoreRoot, path.join(input.destination, 'vendor', 'sitex-mcp-core'));
    await copySafe(input.mcpServerRoot, path.join(input.destination, 'vendor', 'sitex-mcp-server'));
  }

  const workerPackage = JSON.parse(await readFile(path.join(input.workerRoot, 'package.json'), 'utf8'));
  const dependencies = input.component === 'mcp' ? { ...(workerPackage.dependencies || {}) } : {};
  if (input.component === 'mcp') {
    dependencies['@sitex/mcp-core'] = 'file:vendor/sitex-mcp-core';
    dependencies['@sitex/mcp-server'] = 'file:vendor/sitex-mcp-server';
    delete dependencies.velopack;
    delete dependencies.vue;
  }
  await writeFile(path.join(input.destination, 'package.json'), `${JSON.stringify({
    name: `@sitex/${input.component}-runtime`,
    version: input.version,
    private: true,
    engines: { node: '22.x' },
    ...(input.component === 'compute' ? { workspaces: ['codex-runner', 'functions'] } : {}),
    dependencies,
  }, null, 2)}\n`, 'utf8');
  await assertNoRetiredRuntimeSource(input.destination);
  await (input.writeLockfile ?? defaultWriteLockfile)(input.destination);
}
