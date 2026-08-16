# AERIS Desktop App

Desktop monitor for the **AERIS** robot (PM2.5 + mask-wearing detection) running
`server.py` on a Raspberry Pi 5. Built with **Electron + React + electron-vite**,
packaged with **electron-builder**.

> **New here?** [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) (ภาษาไทย) is the full
> picture — what the app does, how the layers fit, every page, and what is done
> vs. still pending. Moving the project to another machine?
> [`MIGRATION.md`](MIGRATION.md).

## Architecture

Four clearly separated layers:

| Layer | Where | Now | Later |
|---|---|---|---|
| 1. Connection (ESP32-S3 dongle) | `src/main/layers/connection` | `MockConnection` — no hardware yet | `Esp32Connection` (serial) |
| 2. API client (server.py REST) | `src/main/layers/api` | `HybridApiClient` — real Pi, except PM2.5 + stepper | all-real `HttpApiClient` |
| 3. Session cache | `src/main/layers/cache` | `SessionCache` (in-memory) | persistent / history |
| — Auth (login, signup, admin) | `src/main/layers/auth` | `HttpAuthClient` — real Pi | — |
| — Tracking (ByteTrack config) | `src/main/layers/tracking` | `HttpTrackingConfigClient` — real Pi | — |
| 4. UI (React shell + pages) | `src/renderer` | — | — |

Layers 1–3 live in the **main process** (the real dongle needs Node `serialport`,
and HTTP from main avoids CORS). They're exposed to the UI as a typed
`window.aeris` bridge via the **preload** script. Flip mock ↔ real in one place:
[`src/main/config.ts`](src/main/config.ts).

Only three things are still mock, and only because the **hardware isn't wired
yet** — the Pi endpoints already exist, so each is a one-flag change:
**PM2.5** (`useMockPm`), **stepper motor** (`useMockMotor`), and the **ESP32
dongle** (`useMockConnection`). Full table:
[`docs/MOCK_STATUS.md`](docs/MOCK_STATUS.md).

The JWT never reaches the renderer — it is stored encrypted via Electron
`safeStorage` and attached to requests inside main.

### UI: shell + pages

- `src/renderer/src/shell/` — sidebar + top bar, loaded once, never reloads.
- `src/renderer/src/pages/` — one file per page, swapped in the content slot.
- **Add a page** = add one entry to
  [`src/renderer/src/pages/registry.tsx`](src/renderer/src/pages/registry.tsx).
  It gets a sidebar button, routing, and its top-bar title automatically.

Eleven pages, all live: **Monitoring** — Live viewer, Dashboard, Graphs (with
Thai PDF export). **Tools** (admin only) — Stepper Control, Terminal & CMD
(SSH), Tracking Tuner, System Diagnostics, Event Logs, Automation Rules,
Calibration CAM. Plus **Settings**, pinned to the bottom.

## Develop

Node is installed **user-local** and is not on PATH in a fresh shell:

```bash
export PATH="$HOME/.local/node/bin:$PATH"

npm install
npm run dev
npm run typecheck   # node + web — run before claiming done
```

## Build installers

```bash
npm run build:win     # → dist/  (NSIS installer + portable .exe)
npm run build:linux   # → dist/  (AppImage + .deb)
```

## Configuration

Edit [`src/main/config.ts`](src/main/config.ts) — the **only** place in the app
that decides mock vs. real:

- `useMockConnection` / `useMockApi` — master switch per layer.
- `useMockPm` / `useMockMotor` — per-feature overrides, applied only when
  `useMockApi` is false. Both are `true` today because the sensor and the
  Arduino aren't connected.
- `useMockAuth` / `useMockTracking` / `useMockDiagnostics` / `useMockEventLogs` /
  `useMockAutomation` / `useMockCalibration` — all `false`; these hit the Pi.
- `piBaseUrl` — server.py base URL. Check it against `hostname -I` on the Pi
  when the app can't connect.
- `dashboardUrl` — the page the **Live viewer** embeds via `<webview>`.

Keep [`docs/MOCK_STATUS.md`](docs/MOCK_STATUS.md) in sync when you flip a flag.
