#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

import type { RuntimeComponent } from './component-manifest.js';
import { buildGcsUploadPlan, publishGcsUploadPlan } from './gcs-publish.js';
import type { ReleaseChannel } from './release-layout.js';
import { stageRuntimeRelease } from './runtime-release.js';
import { prepareRuntimeSource } from './runtime-source.js';
import { buildVelopackPackCommand } from './velopack-command.js';

function optionMap(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const [name, inline] = token.slice(2).split('=', 2);
    if (!name) continue;
    const value = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
    result[name] = value ?? '';
  }
  return result;
}

function required(options: Record<string, string>, name: string): string {
  const value = String(options[name] || '').trim();
  if (!value) throw new Error(`Missing required option --${name}.`);
  return path.resolve(value);
}

function textOption(options: Record<string, string>, name: string): string {
  const value = String(options[name] || '').trim();
  if (!value) throw new Error(`Missing required option --${name}.`);
  return value;
}

function windowsCommandArg(value: string): string {
  return /[\s"&|<>^,;=()]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * On Windows `gcloud` and `npm` are .cmd shims. Node 22 refuses to spawn those
 * directly (EINVAL) and a bare name is not found at all (ENOENT), so route the
 * call through cmd.exe with each argument quoted — `--cache-control` values
 * carry spaces and commas.
 */
function spawnPlan(command: string, args: string[]): { command: string; args: string[]; verbatim: boolean } {
  if (process.platform !== 'win32') return { command, args, verbatim: false };
  const executable = /\.(?:exe|cmd|bat)$/i.test(command) || command.includes(path.sep) || command.includes('/')
    ? command
    : `${command}.cmd`;
  const commandLine = [executable, ...args].map(windowsCommandArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${commandLine}"`], verbatim: true };
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const plan = spawnPlan(command, args);
    const child = spawn(plan.command, plan.args, { stdio: 'inherit', windowsVerbatimArguments: plan.verbatim });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal || code}).`));
    });
  });
}

async function runtimeCommand(options: Record<string, string>) {
  const component = textOption(options, 'component') as RuntimeComponent;
  if (!['mcp', 'compute'].includes(component)) throw new Error('--component must be mcp or compute.');
  const version = textOption(options, 'version');
  const channel = (options.channel || 'stable') as ReleaseChannel;
  if (!['stable', 'beta'].includes(channel)) throw new Error('--channel must be stable or beta.');
  const outputRoot = required(options, 'output-root');
  const sourceRoot = path.join(outputRoot, '.staging', component);
  await prepareRuntimeSource({
    component,
    version,
    workerRoot: required(options, 'worker-root'),
    mcpCoreRoot: required(options, 'mcp-core-root'),
    mcpServerRoot: required(options, 'mcp-server-root'),
    ...(component === 'compute' ? {
      codexRunnerRoot: required(options, 'codex-runner-root'),
      functionsRoot: required(options, 'functions-root'),
    } : {}),
    destination: sourceRoot,
  });
  const result = await stageRuntimeRelease({ component, version, channel, sourceRoot, outputRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function hostCommand(options: Record<string, string>) {
  const command = buildVelopackPackCommand({
    platform: textOption(options, 'platform') as 'win32' | 'linux',
    arch: (options.arch || 'x64') as 'x64' | 'arm64',
    channel: (options.channel || 'stable') as ReleaseChannel,
    version: textOption(options, 'version'),
    packDir: required(options, 'pack-dir'),
    outputDir: required(options, 'output-dir'),
  });
  await run(options.vpk || command.command, command.args);
}

async function publishCommand(options: Record<string, string>) {
  const plan = await buildGcsUploadPlan({
    sourceRoot: required(options, 'source-root'),
    bucketRoot: textOption(options, 'bucket-root'),
  });
  await publishGcsUploadPlan(plan, (args) => run(options.gcloud || 'gcloud', args));
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const options = optionMap(argv);
  if (command === 'runtime') return runtimeCommand(options);
  if (command === 'host') return hostCommand(options);
  if (command === 'publish') return publishCommand(options);
  throw new Error('Usage: sitex-release <runtime|host|publish> [options]');
}

main().catch((error) => {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
});
