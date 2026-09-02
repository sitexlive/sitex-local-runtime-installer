import assert from 'node:assert/strict';
import test from 'node:test';

import { planLegacyArtifactCleanup } from '../src/legacy-cleanup.js';

test('legacy cleanup deletes old installer roots and preserves the new release tree', () => {
  assert.deepEqual(planLegacyArtifactCleanup({
    replacementVerified: true,
    objects: [
      'worker-console/downloads/0.1.16/Sitex-Worker-Console-0.1.16-Setup.exe',
      'worker-console/win32/x64/RELEASES',
      'worker-console/darwin/arm64/Sitex Worker Console-darwin-arm64-0.1.10.zip',
      'worker-console/releases/host/win-x64/stable/Sitex.WorkerConsole-0.2.0-Setup.exe',
      'unrelated/customer-backup.zip',
    ],
  }), {
    deleteObjects: [
      'worker-console/darwin/arm64/Sitex Worker Console-darwin-arm64-0.1.10.zip',
      'worker-console/downloads/0.1.16/Sitex-Worker-Console-0.1.16-Setup.exe',
      'worker-console/win32/x64/RELEASES',
    ],
    keepObjects: [
      'unrelated/customer-backup.zip',
      'worker-console/releases/host/win-x64/stable/Sitex.WorkerConsole-0.2.0-Setup.exe',
    ],
  });
});
