# AERIS Desktop App

Desktop monitor for the **AERIS** robot (PM2.5 + mask-wearing detection) running
`server.py` on a Raspberry Pi 5. Built with **Electron + React + electron-vite**,
packaged with **electron-builder**.

## Architecture

Four clearly separated layers:

| Layer | Where | Now | Later |
|---|---|---|---|
| 1. Connection (ESP32-S3 dongle) | `src/main/layers/connection` | `MockConnection` | `Esp32Connection` (serial) |
| 2. API client (server.py REST) | `src/main/layers/api` | `MockApiClient` | `HttpApiClient` |
| 3. Session cache | `src/main/layers/cache` | `SessionCache` (in-memory) | persistent / history |
| 4. UI (React shell + pages) | `src/renderer` | — | — |

Layers 1–3 live in the **main process** (the real dongle needs Node `serialport`,
and HTTP from main avoids CORS). They're exposed to the UI as a typed
`window.aeris` bridge via the **preload** script. Flip mock ↔ real in one place:
[`src/main/config.ts`](src/main/config.ts).

### UI: shell + pages

- `src/renderer/src/shell/` — sidebar + top bar, loaded once, never reloads.
- `src/renderer/src/pages/` — one file per page, swapped in the content slot.
- **Add a page** = add one entry to
  [`src/renderer/src/pages/registry.tsx`](src/renderer/src/pages/registry.tsx).
  It gets a sidebar button, routing, and its top-bar title automatically.

## Develop

```bash
npm install
npm run dev
```

## Build installers

```bash
npm run build:win     # → dist/  (NSIS installer + portable .exe)
npm run build:linux   # → dist/  (AppImage + .deb)
```

## Configuration

Edit [`src/main/config.ts`](src/main/config.ts):

- `useMockConnection` / `useMockApi` — mock vs. real per layer.
- `piBaseUrl` — server.py base URL (used when `useMockApi: false`).
- `dashboardUrl` — the page the **Live viewer** embeds via `<webview>`.
