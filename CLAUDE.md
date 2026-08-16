# AERIS Desktop App

Electron + React + TypeScript desktop client for the **AERIS** robot (PM2.5 +
mask-wearing detection) running `server.py` on a Raspberry Pi 5.
Packaged with electron-vite + electron-builder.

## Commands

Node is installed **user-local** — it is not on PATH in a fresh non-login shell:

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # needed before any npm/node call

npm run dev            # electron-vite dev
npm run typecheck      # node + web projects (run this before claiming done)
npm run build          # compiles main / preload / renderer into out/
npm run build:linux    # AppImage + deb
npm run build:win      # NSIS installer + portable exe
```

Running the built app directly needs `ELECTRON_RUN_AS_NODE` unset, or Electron
boots as plain Node and `app` is undefined:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron . --no-sandbox
```

## Architecture

Four layers, deliberately separated:

| Layer | Location | Notes |
|---|---|---|
| 1. Connection (ESP32-S3 dongle) | `src/main/layers/connection` | mock only; real impl is a stub |
| 2. API client (server.py REST) | `src/main/layers/api` | mock + HTTP impls |
| 3. Session cache | `src/main/layers/cache` | in-memory, last snapshot |
| — Auth | `src/main/layers/auth` | mock + HTTP impls |
| — Tracking (ByteTrack) | `src/main/layers/tracking` | mock + HTTP impls; independent of Layer 2 |
| 4. UI | `src/renderer` | React |

**Layers 1–3 + auth live in the main process**, not the renderer: the real
dongle needs Node serial access, and HTTP from main avoids CORS. They reach the
UI through a typed `window.aeris` bridge (`src/preload/index.ts`).

Mock vs. real is chosen **only** in `src/main/config.ts` via `useMockConnection`
/ `useMockApi` / `useMockAuth`. Each layer's `index.ts` factory reads those
flags; nothing else in the app branches on "are we mocking?".

### Current state

- **Auth is REAL** — `aeris_auth.py` is merged into `server.py` on the Pi,
  users persist in `aeris_data.db`. `useMockAuth: false`.
- **API data is HYBRID** — `useMockApi: false`, so most Layer-2 calls hit the
  real Pi (`/api/status`, `/api/mask-stats`, `/api/system/info`,
  `/api/mask-history`). Two features stay mock via per-feature flags because
  their hardware isn't wired yet: **PM2.5** (`useMockPm: true` — sensor not
  connected; mocks pm25 value + `/api/pm-history`) and **stepper**
  (`useMockMotor: true` — Arduino not connected; mocks `/api/motor/*`).
  `HybridApiClient` composes real+mock per method; flip a flag to false once the
  hardware is connected. **Single source of truth: `docs/MOCK_STATUS.md`.**
- **The rest of the Tools endpoints are REAL** — diagnostics, event logs,
  automation rules, calibration, and tracking config are all merged on the Pi
  (`useMockDiagnostics` / `useMockEventLogs` / `useMockAutomation` /
  `useMockCalibration` / `useMockTracking` are all `false`). Two of them are
  only half-wired on the Pi side: calibration values aren't bound into
  `vision_node.py` yet, and tracking's `process_noise_pos` / `process_noise_vel`
  are accepted but don't affect the tracker.
- **Dongle is MOCK** — `useMockConnection: true`.
- **Signup captures first/last name** (wired through the whole chain). It is
  NOT editable in-app by design — the report's "ผู้จัดทำ" uses it, falling back
  to username. Persisting it needs the Pi change in `docs/pi-profile-name.md`.

### Pages (all live, none are placeholders)

Monitoring group: **Live viewer** (webview), **Dashboard** (PM2.5 + mask tiles),
**Graphs** (PM2.5 line + mask-compliance line/bar, hover crosshair, range 1h–30d,
**Export PDF** report). Tools group (admin-only): **Stepper Control** (jog +
teach/playback for Arduino CNC Shield/A4988), **Terminal & CMD** (interactive
SSH shell to the Pi via `services/sshTerminal.ts` + ssh2/xterm.js — added by
Codex), **Tracking Tuner** (ByteTrackConfig sliders; its own layer,
`src/main/layers/tracking`, independent of Layer 2 — real, 11-field contract,
see `docs/pi-tracking-config-endpoint.md`), **System Diagnostics**
(`/api/diagnostics`), **Event Logs** (`/api/event-logs`), **Automation Rules**
(`/api/automation/rules`), **Calibration CAM** (`/api/calibration`).
Bottom: **Settings** (account, avatar, read-only name, INFO Load & Temp card,
admin user-management dialog, logout).

Eleven pages in total — `pages/registry.tsx` is the list that decides.

## Renderer: shell + pages

- `src/renderer/src/shell/` — top bar + sidebar, mounted once, never reloads.
- `src/renderer/src/pages/` — one file per page, swapped in the content slot.
- **Adding a page = one entry in `pages/registry.tsx`.** It gets a sidebar
  button, routing, and its top-bar title automatically.

### Role visibility rules (registry.tsx)

`requiresRole` exists at **two levels** and a page is hidden if **either**
rejects the role (AND, fail-closed):

- on a **page** → hides just that page
- on a **group** (`PAGE_GROUPS`) → hides the whole section, heading included,
  and **every page in it inherits the restriction** — no need to repeat it

`pagesForRole(role)` is the single source of truth for both the sidebar and
routing, so a page can never be "hidden from the menu but still reachable".
Setting conflicting roles on a page and its group means nobody sees it — that's
intended (a config mistake should fail visibly, not leak).

Currently only the **Tools** group is restricted (`requiresRole: 'admin'`).

### Sidebar internals

The thin orange "rail" shown while the sidebar is hidden mirrors the panel's
structure with invisible spacers. Both size themselves from shared CSS
variables in `theme/theme.css` (`--aeris-sb-item-h`, `--aeris-sb-head-h`,
`--aeris-sb-row-gap`, `--aeris-sb-group-gap`). **Change spacing there, not in
`shell.css`,** or the rail will drift out of alignment with the icons.

## Conventions & gotchas

- **Wire format is snake_case** and mirrors server.py exactly (`pm25`, not
  `pm2_5`). Types live in `src/shared/types.ts`.
- **Never read `state.mask_on` / `state.mask_off`** from `/api/status` — they
  are hardcoded fakes stuck at 50/10. Use `mask_tally_on` / `mask_tally_off`.
  They are deliberately not modelled in `DeviceState` so they can't be used.
- **Do not break `GET /api/status`** — the Dashboard depends on its shape.
- The **JWT never enters the renderer**. It is stored encrypted via Electron
  `safeStorage` (`src/main/services/tokenStore.ts`) and attached to admin
  requests inside main. Hiding admin UI is convenience only; the real check is
  server-side on every call.
- Modals must render through a **portal to `<body>`** — several containers use
  `backdrop-filter`, which makes them the containing block for `position:
  fixed` children (`src/renderer/src/ui/Modal.tsx`).
- Theme tokens (colours, sizes, glass) all live in `theme/theme.css`.
- Top-bar centre text is editable in `shell/branding.ts`.
- **App theme is dark; PDF reports are light** (white, ink text, orange accent)
  — print-friendly, deliberately different from the app.
- **PDF report export**: `src/renderer/src/report/report.ts` builds a
  self-contained HTML string → `window.aeris.report.exportPdf` → main renders it
  in a hidden `BrowserWindow` and `printToPDF` (chosen over jsPDF so Thai text +
  layout come from real HTML/CSS). Save dialog picks the path.
- **Local-only per-user data** uses `safeStorage`/JSON keyed by username in
  main-process services: session (`tokenStore.ts`) and avatar (`avatarStore.ts`).
- The user sometimes runs **Codex in a parallel session** and leaves a summary
  in `update by codex.md` at the repo root — read it to see what changed, then
  typecheck/build to confirm it integrates.

## Pending work

Pi-side work still outstanding (each has a self-contained doc):

| Task | Doc |
|---|---|
| first/last name: signup + login + set owner's name | `docs/pi-profile-name.md` |
| Verify `AERIS_JWT_SECRET` survives reboot | `docs/pi-jwt-secret-check.md` |
| Restrict user management to one owner + password re-confirm | `docs/admin-access-hardening.md` |
| Move SSH off port 22 → 2222 (do near project end) | `docs/pi-ssh-port-hardening.md` |

The endpoint docs for `/api/system/info`, `/api/pm-history`, `/api/mask-history`,
`/api/motor/*`, `/api/diagnostics`, `/api/event-logs`, `/api/automation/rules`,
`/api/calibration`, and `/api/tracking/config` are **done and merged on the Pi**
— they stay in `docs/` as the contract reference, not as a to-do list.

Half-wired on the Pi: calibration values aren't bound into `vision_node.py`;
tracking's `process_noise_pos` / `process_noise_vel` are accepted but ignored by
the tracker; automation actions depend on the detection pipeline + Arduino.

Blocked on hardware only (code + endpoints ready, one flag each): PM2.5 sensor
(`useMockPm`), Arduino/CNC stepper (`useMockMotor`).

Other: real ESP32 dongle transport (`Esp32Connection` is a stub). Once it
exists, `docs/dongle-ssh-integration-plan.md` plans how the dongle powers the
Terminal page — auto-fill host, reachability gate, and a serial-console
"Rescue Terminal" that works even when the Pi's network is down.

Docs under `docs/` that target the Pi are written to be **self-contained** so
they can be copied to the Pi and handed to an agent there. Keep them that way —
no relative links back into this repo.
