# Update by Codex

Date: 2026-07-27

## Summary

Added a new admin-only Tool page for controlling a stepper motor connected through:

- Raspberry Pi
- Arduino + CNC Shield
- A4988 stepper driver

The desktop app side is wired through the existing Electron architecture:

Renderer page -> preload `window.aeris.api` -> IPC -> main-process API client -> `server.py` REST endpoint on the Pi.

No existing Dashboard, Graphs, Settings, Auth, or Connection behavior was intentionally changed.

## Files changed

- `src/shared/types.ts`
  - Added stepper types:
    - `StepperAxis`
    - `StepperDirection`
    - `StepperMotorStatus`
    - `StepperMoveRequest`
    - `StepperHomeRequest`
  - Added IPC names:
    - `api:getStepperStatus`
    - `api:moveStepper`
    - `api:stopStepper`
    - `api:homeStepper`

- `src/main/layers/api/types.ts`
  - Added API client methods for stepper control.

- `src/main/layers/api/HttpApiClient.ts`
  - Added real HTTP calls to the Pi:
    - `GET /api/motor/status`
    - `POST /api/motor/move`
    - `POST /api/motor/stop`
    - `POST /api/motor/home`

- `src/main/layers/api/MockApiClient.ts`
  - Added mock stepper behavior so the UI can be tested while `useMockApi: true`.

- `src/main/ipc.ts`
  - Registered and disposed the new stepper IPC handlers.

- `src/preload/index.ts`
  - Exposed the new stepper methods under `window.aeris.api`.

- `src/renderer/src/pages/StepperControl.tsx`
  - New Tool page for axis, direction, steps, speed, Move, Home, Stop, and status.

- `src/renderer/src/pages/stepper.css`
  - Styling for the new page only.

- `src/renderer/src/pages/registry.tsx`
  - Registered `Stepper Control` in the existing `Tools` group.
  - The `Tools` group is already admin-only.

## Expected Pi server.py contract

The desktop app now expects these endpoints when `useMockApi: false`:

```http
GET /api/motor/status
POST /api/motor/move
POST /api/motor/stop
POST /api/motor/home
```

Suggested JSON response for all endpoints:

```json
{
  "connected": true,
  "axis": "x",
  "position_steps": 0,
  "moving": false,
  "last_command": "X cw 200 steps @ 400 sps",
  "updated_at": "2026-07-27T00:00:00.000Z"
}
```

`POST /api/motor/move` request:

```json
{
  "axis": "x",
  "direction": "cw",
  "steps": 200,
  "speed_sps": 400
}
```

`POST /api/motor/home` request:

```json
{
  "axis": "x",
  "speed_sps": 400
}
```

`POST /api/motor/stop` does not need a body.

## Notes for Arduino + CNC Shield + A4988

- The desktop app sends high-level commands only.
- `server.py` on the Pi should talk to the Arduino over USB serial.
- The Arduino firmware should translate commands into CNC Shield step/dir/en pins.
- Validate limits on the Pi and/or Arduino before moving:
  - max steps
  - max speed
  - allowed axis
  - limit switches, if installed
  - emergency stop behavior
- A4988 current limit and cooling matter. Start with conservative `speed_sps` and acceleration.

## Current defaults in the UI

- Axis: `x`
- Direction: `cw`
- Steps: `200`
- Speed: `400` steps/sec
- UI clamps:
  - steps: `1` to `200000`
  - speed: `1` to `4000`

## Important

This commit only adds the desktop app side and a mock implementation.

For real motor movement, implement the four `/api/motor/*` endpoints in `server.py` and connect them to the Arduino serial protocol.

---

# Update by Codex — Teach & Playback

Date: 2026-07-27

## Summary

Extended the Stepper Control tool with a simple teach/playback workflow:

1. Jog the robot to a safe pose.
2. Save the current position as a waypoint, for example `Point A`.
3. Jog to another pose.
4. Save it as `Point B`.
5. Play the sequence so the robot moves through the taught points.

This is meant for tuning warning gestures such as head shaking or arm waving before connecting them to the mask-detection automation.

## Files changed

- `src/shared/types.ts`
  - Added optional multi-axis `positions` to `StepperMotorStatus`.
  - Added:
    - `StepperTeachPoint`
    - `StepperSequenceRequest`
  - Added IPC names:
    - `api:saveStepperTeachPoint`
    - `api:playStepperSequence`

- `src/main/layers/api/types.ts`
  - Added API client methods:
    - `saveStepperTeachPoint`
    - `playStepperSequence`

- `src/main/layers/api/HttpApiClient.ts`
  - Added real HTTP calls:
    - `POST /api/motor/teach-points`
    - `POST /api/motor/sequences/play`

- `src/main/layers/api/MockApiClient.ts`
  - Added mock multi-axis positions.
  - Added mock save/play behavior.

- `src/main/ipc.ts`
  - Registered and disposed new teach/playback IPC handlers.

- `src/preload/index.ts`
  - Exposed new methods under `window.aeris.api`.

- `src/renderer/src/pages/StepperControl.tsx`
  - Added Teach & Playback panel.
  - Added waypoint name, dwell, repeat, save point, remove point, and play sequence.
  - Status now shows X/Y/Z positions when available.

- `src/renderer/src/pages/stepper.css`
  - Added waypoint list styling.

- `docs/pi-stepper-teach-playback-endpoint.md`
  - New Pi-side implementation doc for Claude Code / server.py.

## New expected Pi server.py contract

In addition to the earlier motor endpoints:

```http
POST /api/motor/teach-points
POST /api/motor/sequences/play
```

`GET /api/motor/status` should preferably include `positions`:

```json
{
  "connected": true,
  "axis": "x",
  "position_steps": 0,
  "positions": { "x": 0, "y": 0, "z": 0 },
  "moving": false,
  "last_command": null,
  "updated_at": "2026-07-27T00:00:00.000Z"
}
```

Waypoint payload:

```json
{
  "id": "pt-a",
  "name": "Point A",
  "positions": { "x": 0, "y": 0, "z": 0 },
  "speed_sps": 300,
  "dwell_ms": 150
}
```

Sequence payload:

```json
{
  "name": "Mask warning motion",
  "repeat": 2,
  "points": []
}
```

## Notes

- The desktop currently keeps waypoints in page state for tuning during the session.
- Real persistence should live on the Pi, likely JSON or SQLite.
- Runtime automation for `no_mask` should live on the Pi detection pipeline, not in the desktop UI.
- Recommended runtime flow: detect `no_mask` -> cooldown/debounce -> play saved sequence -> stop/skip if already moving.

---

# Update by Codex — Motor Target Buttons + Docs Merge

Date: 2026-07-27

## Summary

Updated the Stepper Control page so the operator can click a real robot part instead of choosing a raw axis from a dropdown.

Current mapping:

- `คอ` -> `x`
- `แขนซ้าย` -> `y`
- `แขนขวา` -> `z`

This should make tuning safer and easier when only one mechanism should move.

## Files changed

- `src/renderer/src/pages/StepperControl.tsx`
  - Replaced the axis dropdown with motor target buttons.

- `src/renderer/src/pages/stepper.css`
  - Added styling for the motor target buttons.

- `docs/pi-stepper-motor-endpoint.md`
  - Merged the Teach & Playback instructions into this existing motor endpoint doc.
  - Added the motor target mapping table.

- `docs/pi-stepper-teach-playback-endpoint.md`
  - Removed because its content is now merged into `pi-stepper-motor-endpoint.md`.

## Note

If the real CNC Shield wiring maps motors differently, update the desktop mapping and Pi/Arduino mapping together so the UI labels always move the expected mechanism.

---

# Update by Codex — Topbar Brand Centering

Date: 28 ก.ค. 69

## Summary

Adjusted the topbar brand block (`A.E.R.I.S`) so it is pinned to the true horizontal center of the app topbar instead of being influenced by the left page label or right dongle status cluster.

## Files changed

- `src/renderer/src/shell/shell.css`
  - Made `.topbar` a positioning context.
  - Positioned `.topbar__brand` at `left: 50%` with `translateX(-50%)`.
  - Kept the left and right topbar groups in their existing grid columns.

## Notes

- No React/component files were changed.
- No page, sidebar, IPC, API, or docs files were changed for this UI fix.

---

# Update by Codex — Topbar Brand Manual Offset

Date: 28 ก.ค. 69

## Summary

After visual checking, adjusted only the `A.E.R.I.S` brand text position in the topbar by nudging it slightly to the right.

## Files changed

- `src/renderer/src/shell/shell.css`
  - Changed `.topbar__brand` from `left: 50%` to `left: calc(50% + 28px)`.

## Notes

- This is a manual visual alignment tweak for the brand text only.
- No sidebar behavior, React components, page layout, IPC, API, or docs logic was changed.

---

# Update by Codex — Topbar Brand Fine Tune

Date: 28 ก.ค. 69

## Summary

Fine-tuned the topbar `A.E.R.I.S` brand position slightly farther to the right after another visual check.

## Files changed

- `src/renderer/src/shell/shell.css`
  - Changed `.topbar__brand` from `left: calc(50% + 28px)` to `left: calc(50% + 32px)`.

## Notes

- This only changes the brand text offset by 4px.

---

# Update by Codex — Topbar Brand Pixel Tweak

Date: 28 ก.ค. 69

## Summary

Moved the topbar `A.E.R.I.S` brand text 1px farther to the right for visual alignment.

## Files changed

- `src/renderer/src/shell/shell.css`
  - Changed `.topbar__brand` from `left: calc(50% + 32px)` to `left: calc(50% + 33px)`.

## Notes

- This is a 1px visual-only adjustment.

---

# Update by Codex — Diagnostics + Event Logs Tools

Date: 28 ก.ค. 69

## Summary

Added two new admin-only pages under the existing Tools group:

- **System Diagnostics** — health overview for Pi services, hardware, database, disk, PM sensor, Hailo, Arduino/stepper, and dongle status.
- **Event Logs** — recent operational/audit events with level and category filters.

Both pages are wired through the normal Electron architecture:

Renderer page -> preload `window.aeris.api` -> IPC -> main-process API client -> mock or Pi REST endpoint.

Because the Pi endpoints do not exist yet, both features are controlled by new mock flags and currently use mock data:

- `useMockDiagnostics: true`
- `useMockEventLogs: true`

## Files changed

- `src/shared/types.ts`
  - Added diagnostics types:
    - `DiagnosticState`
    - `DiagnosticCheck`
    - `SystemDiagnostics`
  - Added event log types:
    - `EventLogLevel`
    - `EventLogCategory`
    - `EventLogEntry`
  - Added IPC names:
    - `api:getDiagnostics`
    - `api:getEventLogs`

- `src/main/config.ts`
  - Added `useMockDiagnostics`
  - Added `useMockEventLogs`

- `src/main/layers/api/types.ts`
  - Added API client methods:
    - `getDiagnostics`
    - `getEventLogs`

- `src/main/layers/api/HttpApiClient.ts`
  - Added real HTTP calls:
    - `GET /api/diagnostics`
    - `GET /api/event-logs?limit=N`

- `src/main/layers/api/HybridApiClient.ts`
  - Routes diagnostics/event logs to mock or real based on the new flags.

- `src/main/layers/api/index.ts`
  - Passes the new mock flags into `HybridApiClient`.

- `src/main/layers/api/MockApiClient.ts`
  - Added mock diagnostics checks.
  - Added mock event log entries.

- `src/main/ipc.ts`
  - Registered and disposed the new diagnostics/event log IPC handlers.

- `src/preload/index.ts`
  - Exposed:
    - `window.aeris.api.getDiagnostics()`
    - `window.aeris.api.getEventLogs(limit)`

- `src/renderer/src/pages/SystemDiagnostics.tsx`
  - New Tools page for system health checks.

- `src/renderer/src/pages/diagnostics.css`
  - Styling for the System Diagnostics page.

- `src/renderer/src/pages/EventLogs.tsx`
  - New Tools page for recent logs with level/category filters.

- `src/renderer/src/pages/event-logs.css`
  - Styling for the Event Logs page.

- `src/renderer/src/pages/registry.tsx`
  - Registered both pages in the existing admin-only Tools group.
  - Added sidebar icons for both pages.

- `docs/pi-diagnostics-endpoint.md`
  - New self-contained Pi-side implementation doc for `GET /api/diagnostics`.

- `docs/pi-event-logs-endpoint.md`
  - New self-contained Pi-side implementation doc for `GET /api/event-logs?limit=N`.

- `docs/MOCK_STATUS.md`
  - Added Diagnostics and Event Logs mock/real status rows.
  - Added flip instructions for `useMockDiagnostics` and `useMockEventLogs`.

## Expected Pi server.py contract

Diagnostics:

```http
GET /api/diagnostics
```

Returns:

```json
{
  "summary": {
    "state": "warn",
    "ok": 5,
    "warn": 2,
    "error": 0,
    "unknown": 1,
    "updated_at": "2026-07-28T07:00:00Z"
  },
  "checks": []
}
```

Event logs:

```http
GET /api/event-logs?limit=100
```

Returns latest-first array:

```json
[
  {
    "id": "evt-001",
    "t": "2026-07-28T07:00:00Z",
    "level": "info",
    "category": "system",
    "message": "Diagnostics snapshot completed",
    "detail": "8 checks collected"
  }
]
```

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

# Update by Codex — Tool Endpoint Test Notes

Date: 28 ก.ค. 69

## Summary

Recorded the practical testing status for the four newly enabled Pi-backed Tool pages so it is easy to remember what is fully live and what still needs runtime/hardware binding.

## Notes

- **System Diagnostics** and **Event Logs** can be tested against real Pi endpoints now.
- **Automation Rules** can read/write real Pi config now, and the Pi has runtime hook support, but real actions still depend on the detection pipeline and Arduino/stepper readiness.
- **Calibration CAM** can read/write real Pi config now, but threshold/ROI changes will not affect the model until those values are bound into `vision_node.py`.

## Files changed

- `docs/MOCK_STATUS.md`
  - Added a "ข้อควรรู้ตอนทดสอบ Tools รอบนี้" section with the above status.

- `update by codex.md`
  - Added this reminder entry.

# Update by Codex — Pi Docs Status Refresh

Date: 30 ก.ค. 69

## Summary

Updated the status banners in the four Pi-side docs that have already been implemented and tested on the Raspberry Pi.

## Files changed

- `docs/pi-diagnostics-endpoint.md`
  - Changed status to done/tested.
  - Noted that desktop now uses `useMockDiagnostics: false`.

- `docs/pi-event-logs-endpoint.md`
  - Changed status to done/tested.
  - Noted that endpoint + SQLite logging are active through `useMockEventLogs: false`.

- `docs/pi-automation-rules-endpoint.md`
  - Changed status to done/tested.
  - Noted persist + in-memory config + runtime hook support through `useMockAutomation: false`.
  - Kept the limitation that real triggers still depend on detection pipeline and Arduino/stepper readiness.

- `docs/pi-calibration-endpoint.md`
  - Changed status to done/tested.
  - Noted persist + in-memory config + validation through `useMockCalibration: false`.
  - Kept the limitation that threshold/ROI will not affect the model until bound into `vision_node.py`.

## Verification

Searched the four docs and confirmed the old `ยังไม่ทำบน Pi` status text is gone.

---

# Update by Codex — Enable Pi Tool Endpoints

Date: 28 ก.ค. 69

## Summary

After the Pi-side Claude Code report confirmed the four endpoint groups were implemented, switched the desktop app from mock to real Pi endpoints for:

- **System Diagnostics** (`/api/diagnostics`)
- **Event Logs** (`/api/event-logs`)
- **Automation Rules** (`/api/automation/rules`)
- **Calibration CAM** (`/api/calibration`)

## Files changed

- `src/main/config.ts`
  - Set `useMockDiagnostics: false`
  - Set `useMockEventLogs: false`
  - Set `useMockAutomation: false`
  - Set `useMockCalibration: false`
  - Noted that Calibration CAM is merged on Pi but vision runtime binding is still pending.

- `docs/MOCK_STATUS.md`
  - Updated the four feature rows from MOCK to real Pi endpoints.
  - Captured the current limitations from the Pi report:
    - Automation persists and has runtime hook support, but real triggers wait for camera/Arduino readiness.
    - Calibration persists and is held in memory, but binding into `vision_node.py` is still a next step.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Calibration CAM Rename

Date: 28 ก.ค. 69

## Summary

Renamed **Calibration** to **Calibration CAM** and changed its sidebar icon to a camera-style symbol with a small tuning marker.

## Files changed

- `src/renderer/src/pages/registry.tsx`
  - Changed the page label from `Calibration` to `Calibration CAM`.
  - Replaced the generic slider icon with a camera/tuning icon.

- `src/renderer/src/pages/Calibration.tsx`
  - Changed the page title to `Calibration CAM`.

- `docs/MOCK_STATUS.md`
  - Updated the feature name and flip note to `Calibration CAM`.

- `docs/pi-calibration-endpoint.md`
  - Updated the page reference to `Tools → Calibration CAM`.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Calibration Scope Trim

Date: 28 ก.ค. 69

## Summary

Removed the **Sensor / Camera** calibration controls from the Calibration page after confirming the project uses **reCamera 2002w** and the camera has already been tested around **10fps**.

Also removed PM2.5 offset from the calibration contract for now. PM offset means adding/subtracting a compensation value when a PM sensor reads consistently high/low, but it is not needed in the current UI.

## Files changed

- `src/shared/types.ts`
  - Removed `pm25_offset` and `camera_fps` from `CalibrationConfig`.

- `src/main/layers/api/MockApiClient.ts`
  - Removed mock calibration defaults/normalization for `pm25_offset` and `camera_fps`.

- `src/renderer/src/pages/Calibration.tsx`
  - Removed the **Sensor / Camera** panel.
  - Updated the subtitle to focus on thresholds and ROI.

- `src/renderer/src/pages/calibration.css`
  - Removed unused `.cal__pair` styling.

- `docs/pi-calibration-endpoint.md`
  - Removed `pm25_offset` and `camera_fps` from the Pi-side contract and skeleton.
  - Added a note that reCamera 2002w is the camera source and FPS is currently handled by the camera/source or Pi pipeline, not desktop calibration.

- `docs/MOCK_STATUS.md`
  - Updated the Calibration flip note to mention threshold/ROI only.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Apply Receipt Circle + Width

Date: 28 ก.ค. 69

## Summary

Fixed the Apply receipt marker issue where the green status dot stretched into a long pill. The cause was the generic receipt `span` selector also matching the dot element.

## Files changed

- `src/renderer/src/pages/automation-rules.css`
  - Scoped receipt text styling to `span:not(.auto-receipt__dot)`.
  - Limited the receipt width so it appears as a shorter inline strip.

- `src/renderer/src/pages/calibration.css`
  - Scoped receipt text styling to `span:not(.cal-receipt__dot)`.
  - Limited the receipt width so it appears as a shorter inline strip.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Apply Receipt Dot Fix

Date: 28 ก.ค. 69

## Summary

Fixed the Apply receipt status marker so it renders as a small circle instead of stretching horizontally, and shortened the receipt label.

## Files changed

- `src/renderer/src/pages/Calibration.tsx`
  - Changed receipt label to `Apply Confirmed` / `Waiting for Pi`.

- `src/renderer/src/pages/calibration.css`
  - Locked the receipt status marker to an 8px circle with fixed flex sizing.

- `src/renderer/src/pages/AutomationRules.tsx`
  - Changed receipt label to `Apply Confirmed` / `Waiting for Pi`.

- `src/renderer/src/pages/automation-rules.css`
  - Locked the receipt status marker to an 8px circle with fixed flex sizing.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Inline Apply Receipt Layout

Date: 28 ก.ค. 69

## Summary

Adjusted the Apply receipt layout on **Calibration** and **Automation Rules** so it sits on the same horizontal row as the Apply/Reset buttons and the "อัปเดตล่าสุด" timestamp, instead of appearing as a taller separate box on the right.

## Files changed

- `src/renderer/src/pages/Calibration.tsx`
  - Moved the Apply receipt into the same footer flow as the buttons and timestamp.

- `src/renderer/src/pages/calibration.css`
  - Changed the receipt into a 38px-tall inline strip.
  - The strip now expands into remaining row space and truncates long details cleanly.

- `src/renderer/src/pages/AutomationRules.tsx`
  - Moved the Apply receipt into the same footer flow as the buttons and timestamp.

- `src/renderer/src/pages/automation-rules.css`
  - Changed the receipt into a 38px-tall inline strip.
  - The strip now expands into remaining row space and wraps cleanly on smaller widths.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

## Notes

- The new pages are admin-only because they live under the existing Tools group.
- The UI is intentionally mock-backed until Claude Code or another Pi-side agent adds the endpoints from the docs.
- After the Pi endpoints are merged, flip `useMockDiagnostics: false` and/or `useMockEventLogs: false` in `src/main/config.ts`, then update `docs/MOCK_STATUS.md`.

---

# Update by Codex — Automation Rules + Calibration Tools

Date: 28 ก.ค. 69

## Summary

Added two more admin-only pages under the existing Tools group:

- **Automation Rules** — configures detection-event actions, such as `no_mask` -> play a motor sequence, trigger TTS, and enforce cooldown.
- **Calibration** — configures runtime thresholds and tuning values, such as detection confidence, mask confidence, tracker match threshold, ROI, PM2.5 offset, and camera FPS.

Both pages are mock-backed for now because the Pi endpoints do not exist yet:

- `useMockAutomation: true`
- `useMockCalibration: true`

Important behavior note: changing a value in the desktop app does not directly edit a Pi file from the renderer. The real implementation should expose REST endpoints on `server.py`; those endpoints validate the values, persist them on the Pi (JSON or SQLite), update in-memory runtime config, and apply/reload the detector/tracker pipeline.

## Files changed

- `src/shared/types.ts`
  - Added automation types:
    - `AutomationTrigger`
    - `AutomationRule`
    - `AutomationRulesConfig`
  - Added calibration types:
    - `DetectionRoi`
    - `CalibrationConfig`
  - Added IPC names for automation and calibration get/apply/reset calls.

- `src/main/config.ts`
  - Added `useMockAutomation`
  - Added `useMockCalibration`

- `src/main/layers/api/types.ts`
  - Added API client methods:
    - `getAutomationRules`
    - `applyAutomationRules`
    - `resetAutomationRules`
    - `getCalibration`
    - `applyCalibration`
    - `resetCalibration`

- `src/main/layers/api/HttpApiClient.ts`
  - Added real HTTP calls:
    - `GET /api/automation/rules`
    - `PUT /api/automation/rules`
    - `POST /api/automation/rules/reset`
    - `GET /api/calibration`
    - `PUT /api/calibration`
    - `POST /api/calibration/reset`

- `src/main/layers/api/HybridApiClient.ts`
  - Routes automation/calibration to mock or real based on the new flags.

- `src/main/layers/api/index.ts`
  - Passes the new flags into `HybridApiClient`.

- `src/main/layers/api/MockApiClient.ts`
  - Added in-memory mock automation config.
  - Added in-memory mock calibration config.

- `src/main/ipc.ts`
  - Registered and disposed automation/calibration IPC handlers.

- `src/preload/index.ts`
  - Exposed automation/calibration APIs under `window.aeris.api`.

- `src/renderer/src/pages/AutomationRules.tsx`
  - New Tools page for no-mask/improper-mask automation rules.

- `src/renderer/src/pages/automation-rules.css`
  - Styling for the Automation Rules page.

- `src/renderer/src/pages/Calibration.tsx`
  - New Tools page for threshold/ROI/sensor/camera calibration.
  - ROI preview clamps x/y/width/height so the selection stays inside the frame.

- `src/renderer/src/pages/calibration.css`
  - Styling for the Calibration page.

- `src/renderer/src/pages/registry.tsx`
  - Registered both pages in the existing admin-only Tools group.
  - Added sidebar icons for both pages.

- `docs/pi-automation-rules-endpoint.md`
  - New self-contained Pi-side implementation doc for automation rule endpoints.

- `docs/pi-calibration-endpoint.md`
  - New self-contained Pi-side implementation doc for calibration endpoints.

- `docs/MOCK_STATUS.md`
  - Added Automation Rules and Calibration mock/real status rows.
  - Added flip instructions for `useMockAutomation` and `useMockCalibration`.

## Expected Pi server.py contract

Automation:

```http
GET  /api/automation/rules
PUT  /api/automation/rules
POST /api/automation/rules/reset
```

Calibration:

```http
GET  /api/calibration
PUT  /api/calibration
POST /api/calibration/reset
```

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

## Notes

- These pages are first-pass UI/control surfaces. They are intentionally broad so unused controls can be removed or merged later after real robot tuning.
- Once the Pi endpoints are merged, flip `useMockAutomation: false` and/or `useMockCalibration: false` in `src/main/config.ts`, then update `docs/MOCK_STATUS.md`.

---

# Update by Codex — Apply Receipt Feedback

Date: 28 ก.ค. 69

## Summary

Added a small apply-status receipt on the right side of the Apply/Reset footer area for:

- **Calibration**
- **Automation Rules**

The receipt is meant to show the difference between "the button was clicked" and "the Pi backend accepted the config and applied it to the runtime."

## Files changed

- `src/shared/types.ts`
  - Added optional `ApplyStatus`.
  - Added optional `apply_status` to:
    - `AutomationRulesConfig`
    - `CalibrationConfig`

- `src/main/layers/api/MockApiClient.ts`
  - Mock apply/reset calls now return `apply_status` receipts.
  - Calibration mock says the returned thresholds/ROI are active in the mock runtime.
  - Automation mock says the returned rules are active in the mock runtime.

- `src/renderer/src/pages/Calibration.tsx`
  - Added right-side Apply receipt in the footer.
  - Shows backend message/detail/applied time when returned.

- `src/renderer/src/pages/calibration.css`
  - Styled the Apply receipt and adjusted footer layout so buttons stay left and receipt uses the right-side space.

- `src/renderer/src/pages/AutomationRules.tsx`
  - Added matching right-side Apply receipt in the footer.

- `src/renderer/src/pages/automation-rules.css`
  - Styled the Automation Apply receipt and adjusted footer layout.

- `docs/pi-calibration-endpoint.md`
  - Documented optional `apply_status` response after PUT/reset.
  - Added skeleton helper showing how Pi should report runtime apply success.

- `docs/pi-automation-rules-endpoint.md`
  - Documented optional `apply_status` response after PUT/reset.
  - Added skeleton helper showing how Pi should report runtime apply success.

## Verification

Ran successfully:

```bash
npm run typecheck
```

Both node and web TypeScript projects passed.

---

# Update by Codex — Stepper Motion Flow Options Doc

Date: 31 ก.ค. 69

## Summary

Added a meeting-friendly planning document for the AERIS stepper motion flow, comparing two implementation paths:

- **No limit switch**: manual home + software limits + return-home flow
- **With home switches**: one NC home switch per joint + software limits

The document follows the requested no-mask flow:

1. Neck tracks within soft limits.
2. No-mask event triggers arm warning motion.
3. Arms return home after the warning motion.
4. During cooldown, neck returns home and stays still.
5. After cooldown, neck resumes tracking.

## Files changed

- `docs/stepper-motion-flow-options.md`
  - New planning doc for team discussion.
  - Includes hardware assumptions, flow diagrams, firmware/Pi requirements, pros/cons, and acceptance criteria for both options.

- `update by codex.md`
  - Added this entry.

## Notes

- This is a planning document only; no app code or endpoint contract was changed.
- Recommended direction in the doc: keep software-limit fallback logic, but prepare for home switches if the team can fit them mechanically.
