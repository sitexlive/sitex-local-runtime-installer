import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as tar from 'tar';

export interface RuntimeArchiveInput {
  sourceRoot: string;
  archivePath: string;
}

const DENIED_SEGMENTS = new Set(['.git', 'coverage', 'dist', 'node_modules', 'out']);

function isDistributable(entryPath: string): boolean {
  const segments = entryPath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) return false;
  return !segments.some((segment) => segment === '.env' || segment.startsWith('.env.'));
}

export async function createRuntimeArchive({ sourceRoot, archivePath }: RuntimeArchiveInput): Promise<void> {
  const topLevelEntries = (await readdir(sourceRoot)).filter(isDistributable).sort();
  await mkdir(path.dirname(archivePath), { recursive: true });
  await tar.c({
    cwd: sourceRoot,
    file: archivePath,
    filter: isDistributable,
    gzip: true,
    noMtime: true,
    portable: true,
  }, topLevelEntries);
}
