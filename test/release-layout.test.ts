import assert from 'node:assert/strict';
import test from 'node:test';

import { createReleaseLayout } from '../src/release-layout.js';

test('release layout isolates the host, MCP, compute runtime, and legacy roots', () => {
  assert.deepEqual(createReleaseLayout({ version: '0.2.0', channel: 'stable' }), {
    host: {
      feed: 'worker-console/releases/host',
      windowsChannel: 'win-x64-stable',
      linuxChannel: 'linux-x64-stable',
    },
    runtime: {
      mcp: 'worker-console/releases/runtime/mcp/stable/0.2.0',
      compute: 'worker-console/releases/runtime/compute/stable/0.2.0',
    },
    legacyRoots: [
      'worker-console/darwin/',
      'worker-console/downloads/',
      'worker-console/win32/',
    ],
  });
});
