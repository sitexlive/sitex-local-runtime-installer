import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildComponentManifest, type RuntimeComponent } from './component-manifest.js';
import type { ReleaseChannel } from './release-layout.js';
import { createRuntimeArchive } from './runtime-archive.js';

export interface StageRuntimeReleaseInput {
  component: RuntimeComponent;
  version: string;
  channel: ReleaseChannel;
  sourceRoot: string;
  outputRoot: string;
  publishedAt?: string;
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

export async function stageRuntimeRelease(input: StageRuntimeReleaseInput) {
  const releasePrefix = `runtime/${input.component}/${input.channel}/${input.version}`;
  const releaseDirectory = path.join(input.outputRoot, releasePrefix);
  const fileName = `sitex-${input.component}-runtime-${input.version}.tgz`;
  const archivePath = path.join(releaseDirectory, fileName);
  await mkdir(releaseDirectory, { recursive: true });
  await createRuntimeArchive({ sourceRoot: input.sourceRoot, archivePath });

  const archiveStat = await stat(archivePath);
  const manifest = buildComponentManifest({
    component: input.component,
    version: input.version,
    channel: input.channel,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    fileName,
    sha256: await sha256File(archivePath),
    size: archiveStat.size,
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(releaseDirectory, 'manifest.json'), manifestText, 'utf8');

  const channelDirectory = path.join(input.outputRoot, 'runtime', input.component, input.channel);
  const channelManifestPath = path.join(channelDirectory, 'current.json');
  const pendingPath = `${channelManifestPath}.${randomUUID()}.tmp`;
  await writeFile(pendingPath, manifestText, 'utf8');
  await rename(pendingPath, channelManifestPath);

  return { archivePath, channelManifestPath, manifest, releasePrefix };
}
