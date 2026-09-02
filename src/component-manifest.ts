import type { ReleaseChannel } from './release-layout.js';

export type RuntimeComponent = 'mcp' | 'compute';

export interface ComponentManifestInput {
  component: RuntimeComponent;
  version: string;
  channel: ReleaseChannel;
  publishedAt: string;
  fileName: string;
  sha256: string;
  size: number;
}

export type ComponentManifest = ReturnType<typeof buildComponentManifest>;

export function buildComponentManifest(input: ComponentManifestInput) {
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
    const error = new Error('Component artifact SHA-256 must contain exactly 64 hexadecimal characters.');
    Object.assign(error, { code: 'INVALID_ARTIFACT_SHA256' });
    throw error;
  }
  return {
    schemaVersion: 1,
    component: input.component,
    version: input.version,
    channel: input.channel,
    publishedAt: input.publishedAt,
    artifact: {
      fileName: input.fileName,
      sha256: input.sha256,
      size: input.size,
    },
    runtime: {
      nodeMajor: 22,
      install: 'npm-ci',
      installRoots: ['.'],
      dependenciesIncluded: false,
    },
  } as const;
}
