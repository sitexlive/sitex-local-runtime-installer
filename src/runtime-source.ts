import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeComponent } from './component-manifest.js';

export interface PrepareRuntimeSourceInput {
  component: RuntimeComponent;
  version: string;
  workerRoot: string;
  mcpCoreRoot: string;
  mcpServerRoot: string;
  functionsRoot?: string;
  destination: string;
  writeLockfile?: (directory: string) => Promise<void>;
}

const DENIED_NAMES = new Set([
  '.git', '.codebase-memory', 'certificates', 'coverage', 'dist', 'docs', 'key', 'keys',
  'node_modules', 'out', 'test', 'tests', '__tests__',
]);

function safeSourcePath(sourceRoot: string, entryPath: string): boolean {
  const relative = path.relative(sourceRoot, entryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.some((segment) => DENIED_NAMES.has(segment))) return false;
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
  await copySafe(path.join(input.workerRoot, 'src'), path.join(input.destination, 'src'));
  if (input.component === 'compute') {
    if (!input.functionsRoot) throw new Error('Compute runtime staging requires the Cloud Functions source root.');
    await copySafe(path.join(input.workerRoot, 'bin'), path.join(input.destination, 'bin'));
    await copySafe(input.functionsRoot, path.join(input.destination, 'functions'));
  }
  await copySafe(input.mcpCoreRoot, path.join(input.destination, 'vendor', 'sitex-mcp-core'));
  await copySafe(input.mcpServerRoot, path.join(input.destination, 'vendor', 'sitex-mcp-server'));

  const workerPackage = JSON.parse(await readFile(path.join(input.workerRoot, 'package.json'), 'utf8'));
  const dependencies = { ...(workerPackage.dependencies || {}) };
  dependencies['@sitex/mcp-core'] = 'file:vendor/sitex-mcp-core';
  dependencies['@sitex/mcp-server'] = 'file:vendor/sitex-mcp-server';
  delete dependencies.velopack;
  delete dependencies.vue;
  await writeFile(path.join(input.destination, 'package.json'), `${JSON.stringify({
    name: `@sitex/${input.component}-runtime`,
    version: input.version,
    private: true,
    engines: { node: '22.x' },
    dependencies,
  }, null, 2)}\n`, 'utf8');
  await (input.writeLockfile ?? defaultWriteLockfile)(input.destination);
}
