export type ReleaseChannel = 'stable' | 'beta';

export interface ReleaseLayoutInput {
  version: string;
  channel: ReleaseChannel;
}

export const LEGACY_RELEASE_ROOTS = Object.freeze([
  'worker-console/darwin/',
  'worker-console/downloads/',
  'worker-console/win32/',
]);

export function createReleaseLayout({ version, channel }: ReleaseLayoutInput) {
  const releaseRoot = 'worker-console/releases';
  return {
    host: {
      feed: `${releaseRoot}/host`,
      windowsChannel: `win-x64-${channel}`,
      linuxChannel: `linux-x64-${channel}`,
    },
    runtime: {
      mcp: `${releaseRoot}/runtime/mcp/${channel}/${version}`,
      compute: `${releaseRoot}/runtime/compute/${channel}/${version}`,
    },
    legacyRoots: [...LEGACY_RELEASE_ROOTS],
  };
}
