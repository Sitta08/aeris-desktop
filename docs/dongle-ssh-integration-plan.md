# Plan — using the ESP32-S3 dongle to power the Terminal (SSH) page

**Status:** idea / on hold — waiting on the **real dongle hardware + transport**.
Today Layer 1 (`src/main/layers/connection`) is mock and `Esp32Connection` is a
stub, so none of this is buildable yet. This doc is the design to pick up once
the dongle arrives. Read top-to-bottom; phases are ordered by value ÷ effort.

## Context

The dongle is **Layer 1 — Connection**. Its job in the architecture is to
*find and reach the Pi*: CLAUDE.md already states `piBaseUrl` is meant to come
from the **dongle handshake** later. So the theme of every idea below is:

> Layer 1 feeds the Terminal page a transport (a route to the Pi) and metadata
> (host, port, reachability, maybe credentials). xterm just draws bytes — it
> does not care whether they came from SSH-over-TCP or serial-over-dongle.

The Terminal page ([Terminal.tsx](../src/renderer/src/pages/Terminal.tsx)) and
the SSH manager ([sshTerminal.ts](../src/main/services/sshTerminal.ts)) are the
two touch points on the app side.

---

## Phase 1 — Auto-fill Host from the dongle 🟢

Stop typing the Pi's IP by hand. The dongle knows where the Pi is (handshake),
so the Host field is prefilled from it and survives DHCP IP changes.

- **App:** Terminal reads the discovered host/port from Layer 1 instead of the
  hardcoded `192.168.1.39` default. The field becomes "shown, rarely edited."
- **Depends on:** dongle handshake exposing the Pi's current LAN address.
- **Buildable against the mock** — the mock connection can just report a host.

## Phase 2 — Reachability gate (no more 15s timeout) 🟢

Terminal already can call `window.aeris.connection.getStatus()`. If the dongle
reports the Pi offline, disable **Connect** and show "Pi ไม่ออนไลน์ (ผ่าน
dongle)" *immediately*, instead of firing an SSH attempt that hangs for the full
`readyTimeout` (15s).

- **App only**, small. Also buildable against the mock.
- Nice pairing: turn the connection pill into a live Pi-reachability indicator.

## Phase 3 — Serial console fallback ("Rescue Terminal") 🟡 ★ the standout

The reason a dongle beats plain SSH. If the Pi's **network dies, SSH dies with
it** — normally you'd have to plug a monitor+keyboard into the robot. But if the
ESP32-S3 is wired to the Pi's **UART (TX/RX)**, the dongle can expose the Pi's
**serial console** (a `getty` on `ttyAMA0`/`ttyS0`). The same xterm switches its
underlying transport from SSH to serial-over-dongle.

- Fits the layered design perfectly: Layer 1 delivers raw bytes; xterm is
  transport-agnostic. `sshTerminal.ts` gains a sibling (e.g. `serialConsole.ts`)
  and the page gets a "Rescue console" mode.
- **Depends on hardware:** ESP32 physically on the Pi UART pins, and the Pi
  configured to run a login console on that serial port.
- **Highest field value** for a headless robot — recover a bricked-network Pi
  without opening it up.

## Phase 4 — Dongle as a hardware presence key 🟡

Require the physical dongle to be present to open a shell (hardware 2FA for a
tool that is already admin-only). Pull the dongle → open sessions close. The
handshake could also hand over an **ephemeral SSH key** minted by the Pi, so the
Terminal needs no stored/typed password at all.

- **Depends on:** dongle handshake + a Pi-side ephemeral-key/token scheme.
- Security nicety, not required for the feature to work.

## Phase 5 — Full SSH tunnelled through the dongle 🔴 (probably skip)

Routing *all* SSH bytes app→dongle→Pi. The ESP32-S3 has limited RAM/throughput:
an interactive shell (low bandwidth) is borderline OK, but SCP of large files
would be painfully slow. **Recommendation:** let the dongle provide the *route
and IP* (Phase 1), not proxy every byte. Keep real SSH over the LAN.

---

## Suggested order & honest constraints

1. **Phase 1 + 2** — do first; buildable against the mock the moment Layer 1
   reports a host + reachability. Immediate UX win, no hardware needed to start.
2. **Phase 3** — the flagship, but needs the UART wiring + Pi serial-console
   setup. Schedule when the hardware is in hand.
3. **Phase 4** — layer on once handshake + key provisioning exist.
4. **Phase 5** — likely not worth it; documented so we don't rediscover the
   throughput problem later.

**Hard dependency for everything:** the real `Esp32Connection` transport
(currently a stub) has to exist first — this is already the standing "real
ESP32 dongle transport" item in CLAUDE.md's Pending work.
