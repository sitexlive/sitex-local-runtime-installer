import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ComponentManifest } from './component-manifest.js';

export interface RuntimeInstallInput {
  manifest: ComponentManifest;
  archivePath: string;
  dataRoot: string;
  extract: (archivePath: string, destination: string) => Promise<void>;
  installDependencies: (directory: string) => Promise<void>;
  healthCheck: (directory: string) => Promise<void>;
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export async function installRuntimeComponent(input: RuntimeInstallInput) {
  const archiveStat = await stat(input.archivePath);
  if (archiveStat.size !== input.manifest.artifact.size) {
    throw codedError('ARTIFACT_SIZE_MISMATCH', 'Runtime artifact size does not match its release manifest.');
  }
  const actualSha256 = await sha256File(input.archivePath);
  if (actualSha256 !== input.manifest.artifact.sha256.toLowerCase()) {
    throw codedError('ARTIFACT_SHA256_MISMATCH', 'Runtime artifact SHA-256 does not match its release manifest.');
  }

  const componentRoot = path.join(input.dataRoot, input.manifest.component);
  const versionsRoot = path.join(componentRoot, 'versions');
  const versionRoot = path.join(versionsRoot, input.manifest.version);
  const stagingRoot = path.join(versionsRoot, `.installing-${input.manifest.version}-${randomUUID()}`);
  await mkdir(versionsRoot, { recursive: true });

  try {
    await input.extract(input.archivePath, stagingRoot);
    for (const installRoot of input.manifest.runtime.installRoots) {
      const installDirectory = path.resolve(stagingRoot, installRoot);
      if (installDirectory !== stagingRoot && !installDirectory.startsWith(`${stagingRoot}${path.sep}`)) {
        throw codedError('INVALID_INSTALL_ROOT', 'Runtime dependency root escapes the staged release directory.');
      }
      await access(path.join(installDirectory, 'package-lock.json'));
      await input.installDependencies(installDirectory);
    }
    try {
      await input.healthCheck(stagingRoot);
    } catch (cause) {
      const error = codedError('RUNTIME_HEALTH_CHECK_FAILED', 'Runtime health check failed; the previous version remains active.');
      Object.assign(error, { cause });
      throw error;
    }
    await rename(stagingRoot, versionRoot);

    const pointerPath = path.join(componentRoot, 'current.json');
    const pendingPointerPath = `${pointerPath}.${randomUUID()}.tmp`;
    await writeFile(pendingPointerPath, `${JSON.stringify({ version: input.manifest.version })}\n`, 'utf8');
    await rename(pendingPointerPath, pointerPath);
    return { activeVersion: input.manifest.version, versionRoot };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
