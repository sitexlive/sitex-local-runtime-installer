import type { ReleaseChannel } from './release-layout.js';

export interface VelopackPackInput {
  platform: 'win32' | 'linux';
  arch: 'x64' | 'arm64';
  channel: ReleaseChannel;
  version: string;
  packDir: string;
  outputDir: string;
}

export function buildVelopackPackCommand(input: VelopackPackInput) {
  const osName = input.platform === 'win32' ? 'win' : 'linux';
  const runtime = `${osName}-${input.arch}`;
  const mainExe = input.platform === 'win32' ? 'sitex-worker-console.exe' : 'sitex-worker-console';
  return {
    command: 'vpk',
    args: [
      'pack',
      '--packId', 'Sitex.WorkerConsole',
      '--packVersion', input.version,
      '--packDir', input.packDir,
      '--mainExe', mainExe,
      '--runtime', runtime,
      '--channel', `${runtime}-${input.channel}`,
      '--outputDir', input.outputDir,
      '--packTitle', 'Sitex Worker Console',
      '--packAuthors', 'Sitex',
      '--delta', 'BestSize',
    ],
  };
}
