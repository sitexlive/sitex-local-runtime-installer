import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVelopackPackCommand } from '../src/velopack-command.js';

test('Velopack command builds isolated Windows and Linux stable channels with deltas', () => {
  assert.deepEqual(buildVelopackPackCommand({
    platform: 'win32',
    arch: 'x64',
    channel: 'stable',
    version: '0.2.0',
    packDir: 'out/app-win32-x64',
    outputDir: 'out/releases/win-x64-stable',
  }), {
    command: 'vpk',
    args: [
      'pack',
      '--packId', 'Sitex.WorkerConsole',
      '--packVersion', '0.2.0',
      '--packDir', 'out/app-win32-x64',
      '--mainExe', 'sitex-worker-console.exe',
      '--runtime', 'win-x64',
      '--channel', 'win-x64-stable',
      '--outputDir', 'out/releases/win-x64-stable',
      '--packTitle', 'Sitex Worker Console',
      '--packAuthors', 'Sitex',
      '--delta', 'BestSize',
    ],
  });
});
