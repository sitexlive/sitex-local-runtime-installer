import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface GcsUploadPlanInput {
  sourceRoot: string;
  bucketRoot: string;
}

export interface GcsUploadStep {
  source: string;
  destination: string;
  publishLast: boolean;
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== '.staging') files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function isMutableReleasePointer(relative: string): boolean {
  const basename = path.posix.basename(relative);
  return basename === 'current.json' || /^releases\..+\.json$/.test(basename);
}

export async function buildGcsUploadPlan(input: GcsUploadPlanInput): Promise<GcsUploadStep[]> {
  const bucketRoot = input.bucketRoot.replace(/\/+$/, '');
  const files = await listFiles(input.sourceRoot);
  return files
    .map((source) => {
      const relative = path.relative(input.sourceRoot, source).split(path.sep).join('/');
      const publishLast = isMutableReleasePointer(relative);
      return { source, destination: `${bucketRoot}/${relative}`, publishLast };
    })
    .sort((left, right) => Number(left.publishLast) - Number(right.publishLast)
      || left.destination.localeCompare(right.destination));
}

export async function publishGcsUploadPlan(
  plan: GcsUploadStep[],
  runGcloud: (args: string[]) => Promise<void>,
): Promise<void> {
  for (const step of plan) {
    const cacheControl = step.publishLast
      ? 'no-store,max-age=0'
      : 'public,max-age=31536000,immutable';
    await runGcloud([
      'storage', 'cp', '--predefined-acl=publicRead',
      `--cache-control=${cacheControl}`,
      step.source, step.destination,
    ]);
  }
}
