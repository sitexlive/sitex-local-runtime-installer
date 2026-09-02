# Sitex Local Runtime Installer

Open-source release tooling for a small, continuously running Sitex Host on Windows and Linux.

The release is deliberately split into three independently versioned parts:

| Part | Contains | Update mechanism |
| --- | --- | --- |
| Host | Electron console, service supervisor, updater | Velopack stable/beta channel |
| MCP Runtime | Local stdio MCP server and shared MCP packages | Signed manifest, SHA-256 verification, atomic activation |
| Compute Runtime | AI Agent workers, Business Worker and Cloud Function server source | Signed manifest, SHA-256 verification, local `npm ci`, atomic activation |

Node.js dependencies are not embedded in the Host or runtime archives. The installed Host downloads the pinned Node 22 runtime and runs `npm ci` against published lockfiles on the target computer. This keeps Host and MCP updates small while allowing MCP and compute to be released separately.

## Supported targets

- Windows x64: Velopack Setup executable and delta updates
- Linux x64: Velopack installer/package and delta updates
- Release channels: `stable` and `beta`

macOS is intentionally outside this project's release contract.

## Development

Requires Node.js 22.

```bash
npm ci
npm run check
npm run build
```

## Stage an independent MCP release

```bash
npm run release -- runtime \
  --component mcp \
  --version 0.2.0 \
  --channel stable \
  --worker-root ../sitex-ai-worker \
  --mcp-core-root ../sitex-mcp-core \
  --mcp-server-root ../sitex-mcp-server \
  --output-root out/releases
```

## Stage an independent compute release

```bash
npm run release -- runtime \
  --component compute \
  --version 0.2.0 \
  --channel stable \
  --worker-root ../sitex-ai-worker \
  --mcp-core-root ../sitex-mcp-core \
  --mcp-server-root ../sitex-mcp-server \
  --functions-root ../Sitex-Firestore-Api/functions \
  --output-root out/releases
```

The output contains immutable version directories plus a mutable `current.json` channel pointer. A target machine downloads the archive, verifies its exact size and SHA-256, installs dependencies into a version directory, runs the component health check, and only then switches `current.json`. A failed release leaves the previous version active.

## Package a Host with Velopack

First create the unpacked Electron application on its target operating system. Then run:

```bash
npm run release -- host \
  --platform win32 \
  --arch x64 \
  --version 0.2.0 \
  --channel stable \
  --pack-dir '../sitex-ai-worker/out/Sitex Worker Console-win32-x64' \
  --output-dir out/releases/host
```

Use `--platform linux` on Linux. Velopack writes `releases.<channel>.json` beside the immutable packages; the Host updater points to that containing directory and selects its platform channel.

## Publish to Google Cloud Storage

```bash
npm run release -- publish \
  --source-root out/releases \
  --bucket-root gs://YOUR_BUCKET/worker-console/releases
```

Immutable installers and archives are uploaded first with a one-year immutable cache policy. `current.json` and Velopack `releases.*.json` are uploaded last with caching disabled.

## Release tree

```text
worker-console/releases/
├── host/
│   ├── releases.win-x64-stable.json
│   ├── releases.linux-x64-stable.json
│   └── immutable Velopack packages/installers
└── runtime/
    ├── mcp/stable/<version>/...
    └── compute/stable/<version>/...
```

Legacy Squirrel/download roots are intentionally outside this tree. The cleanup planner refuses to remove them until the caller explicitly records that the replacement has been verified.

## License

MIT
