# AERIS Desktop App — ภาพรวมโปรเจ็ก

> เอกสารนี้ = "โปรเจ็กคืออะไร ทำงานยังไง ตอนนี้ถึงไหนแล้ว" อ่านไฟล์เดียวจบ
> เขียนไว้เผื่อกลับมาอ่านหลังย้ายเครื่อง / ส่งต่อให้คนอื่น / ให้ AI agent อ่านต่อ
>
> อัปเดตล่าสุด: **16 ส.ค. 2569** (สแนปช็อตก่อนย้าย Linux distro)
> วิธีกู้โปรเจ็กกลับมาบนเครื่องใหม่ → ดู [`MIGRATION.md`](MIGRATION.md)

---

## 1. โปรเจ็กนี้คืออะไร

แอปเดสก์ท็อปสำหรับ **มอนิเตอร์และควบคุมหุ่นยนต์ AERIS**

AERIS คือหุ่นยนต์ที่วัด **ค่าฝุ่น PM2.5** และ **ตรวจจับการใส่หน้ากากอนามัย**
(computer vision) โดยตัวสมองหลักคือ **Raspberry Pi 5 + Hailo-8L** ที่รัน
`server.py` เป็น REST API + dashboard เว็บอยู่บนบอร์ด

แอปนี้คือ **ฝั่ง client บนคอม** ที่ต่อเข้าไปดูข้อมูล / สั่งงาน / ปรับจูน Pi ตัวนั้น

| หัวข้อ | รายละเอียด |
|---|---|
| ชนิดแอป | Electron desktop app (Linux + Windows) |
| ภาษา / เฟรมเวิร์ก | TypeScript, React 18, Electron 32 |
| Build tool | electron-vite (dev + build), electron-builder (แพ็กเป็นตัวติดตั้ง) |
| ปลายทางที่คุยด้วย | `server.py` บน Raspberry Pi 5 — ปัจจุบัน `http://192.168.1.39:8000` |
| ธีม | ดำ-กระจก (glass) + ส้ม AERIS / แต่ **รายงาน PDF เป็นธีมสว่าง** (พิมพ์แล้วอ่านง่าย) |
| ภาษาใน UI | อังกฤษ + ไทย (รายงาน PDF เป็นไทย) |

---

## 2. สถาปัตยกรรม — 4 เลเยอร์

หัวใจของโปรเจ็กคือ **แยกเลเยอร์ให้ชัด** เพื่อสลับ "ของปลอม (mock) ↔ ของจริง"
ได้ทีละชั้นโดยไม่ต้องแก้ UI

| ชั้น | หน้าที่ | ที่อยู่ | สถานะตอนนี้ |
|---|---|---|---|
| **1. Connection** | คุยกับ dongle ESP32-S3 (หา Pi / handshake) | `src/main/layers/connection` | **MOCK** — `Esp32Connection` ยังเป็นโครงเปล่า |
| **2. API client** | เรียก REST ของ `server.py` | `src/main/layers/api` | **จริงเป็นหลัก** (Hybrid) |
| **3. Session cache** | เก็บ snapshot ล่าสุดในหน่วยความจำ | `src/main/layers/cache` | ใช้งานอยู่ |
| **— Auth** | login / signup / อนุมัติผู้ใช้ / JWT | `src/main/layers/auth` | **จริง** |
| **— Tracking** | ByteTrack config (แยกจาก Layer 2) | `src/main/layers/tracking` | **จริง** |
| **4. UI** | React shell + หน้าเพจ | `src/renderer` | — |

### ทำไมชั้น 1–3 ไม่ได้อยู่ในหน้าเว็บ (renderer)

ทั้งหมดอยู่ใน **main process** ของ Electron เพราะ:

- dongle ตัวจริงต้องใช้ Node serial port — renderer ทำไม่ได้
- ยิง HTTP จาก main **ไม่ติด CORS**
- **JWT ไม่เคยเข้า renderer เลย** — เก็บเข้ารหัสด้วย Electron `safeStorage`
  (`src/main/services/tokenStore.ts`) แล้วแนบ header ให้เองใน main
  (การซ่อนเมนู admin เป็นแค่ความสะดวก — ด่านจริงคือฝั่งเซิร์ฟเวอร์ทุกครั้ง)

### ข้อมูลไหลยังไง

```
React page (renderer)
   │  window.aeris.api.getStatus()          ← typed bridge
   ▼
preload (src/preload/index.ts)              ← contextBridge, ไม่มี Node ให้ renderer
   │  ipcRenderer.invoke('api:getStatus')
   ▼
main process (src/main/ipc.ts)              ← ลงทะเบียน handler ทุกตัว
   │
   ▼
Layer 2 ApiClient  ──HTTP──►  server.py บน Raspberry Pi 5
   │
   ▼
Layer 3 SessionCache (เก็บ snapshot ล่าสุด)
```

`window.aeris` แบ่งเป็น namespace: `connection` / `api` / `cache` / `tracking` /
`terminal` / `report` / `auth` / `avatar` / `admin`
(ดูของจริงที่ [`src/preload/index.ts`](src/preload/index.ts) และชนิดข้อมูลที่
[`src/shared/types.ts`](src/shared/types.ts))

### สวิตช์ mock ↔ real อยู่ที่เดียว

[`src/main/config.ts`](src/main/config.ts) — **ห้ามมีที่อื่นในแอป branch ว่า
"ตอนนี้ mock อยู่รึเปล่า"** โรงงาน (`index.ts` ของแต่ละเลเยอร์) อ่าน flag พวกนี้
แล้วคืน implementation ที่ถูกตัวให้เอง

`HybridApiClient` คือตัวที่ผสม "ของจริงบางเมธอด + mock บางเมธอด" ตาม flag ย่อย

---

## 3. หน้าจอในแอป (11 หน้า — ใช้งานได้จริงทุกหน้า ไม่มีหน้าเปล่า)

เพิ่มหน้าใหม่ = **เพิ่ม 1 entry ใน [`src/renderer/src/pages/registry.tsx`](src/renderer/src/pages/registry.tsx)**
แล้วมันจะได้ปุ่ม sidebar + routing + ชื่อบน top bar ให้อัตโนมัติ

### กลุ่ม Monitoring (ทุก role เห็น)

| หน้า | ทำอะไร |
|---|---|
| **Live viewer** | ฝัง dashboard ของ Pi ตรง ๆ ผ่าน `<webview>` |
| **Dashboard** | การ์ด PM2.5 + สถิติหน้ากาก (mask tally) + สถานะ node |
| **Graphs** | กราฟเส้น PM2.5 + กราฟ mask compliance (เส้น/แท่ง), crosshair ตอน hover, เลือกช่วง 1 ชม.–30 วัน, **Export PDF รายงานภาษาไทย** |

### กลุ่ม Tools (เห็นเฉพาะ role `admin`)

| หน้า | ทำอะไร |
|---|---|
| **Stepper Control** | jog มอเตอร์ + teach/playback สำหรับ Arduino CNC Shield + A4988 |
| **Terminal & CMD** | SSH shell สดเข้า Pi (ssh2 + xterm.js) — ไม่ผ่าน Layer 2 |
| **Tracking Tuner** | สไลเดอร์ปรับ ByteTrackConfig (11 ฟิลด์) |
| **System Diagnostics** | สถานะระบบ/บริการบน Pi |
| **Event Logs** | log เหตุการณ์จาก Pi |
| **Automation Rules** | กฎ ถ้า-แล้ว (trigger → action) เก็บบน Pi |
| **Calibration CAM** | ตั้งค่า threshold / ROI ของกล้อง |

### ล่างสุด

**Settings** — บัญชี, avatar, ชื่อ-นามสกุล (อ่านอย่างเดียว), การ์ด INFO Load & Temp,
dialog จัดการผู้ใช้ (admin), logout

### กฎการมองเห็นตาม role

`requiresRole` มี **2 ระดับ** และซ่อนหน้าถ้า **ระดับใดระดับหนึ่งไม่ผ่าน** (AND, fail-closed)

- ใส่ที่ **page** → ซ่อนเฉพาะหน้านั้น
- ใส่ที่ **group** (`PAGE_GROUPS`) → ซ่อนทั้งหมวดรวมหัวข้อ และ**ทุกหน้าในหมวดสืบทอดไปด้วย**

`pagesForRole(role)` เป็นแหล่งความจริงเดียวของทั้ง sidebar และ routing →
เป็นไปไม่ได้ที่หน้าจะ "หายจากเมนูแต่ยังเข้าถึงได้"

ตอนนี้จำกัดแค่กลุ่ม **Tools** (`requiresRole: 'admin'`)

---

## 4. ตอนนี้ทำถึงไหนแล้ว

### ✅ เสร็จและใช้งานจริงแล้ว

- **ระบบ Auth เต็มรูปแบบ** — `aeris_auth.py` ถูก merge เข้า `server.py` บน Pi แล้ว
  ผู้ใช้ persist ใน `aeris_data.db`, สมัคร/อนุมัติ/role admin, JWT เก็บเข้ารหัสฝั่ง main
- **Dashboard / Graphs ดึงข้อมูลจริงจาก Pi** — `/api/status`, `/api/mask-stats`,
  `/api/mask-history`, `/api/system/info`
- **Export PDF รายงาน** — สร้าง HTML แล้วให้ main เรนเดอร์ใน BrowserWindow ซ่อน
  แล้ว `printToPDF` (เลือกวิธีนี้แทน jsPDF เพราะภาษาไทย + layout ต้องมาจาก HTML/CSS จริง)
- **Terminal & CMD (SSH)** — ต่อ Pi ได้เลย (งานที่ Codex ทำ)
- **Tracking Tuner** — `/api/tracking/config` บน Pi ทำเสร็จ + verify แล้ว (11 ฟิลด์)
- **System Diagnostics / Event Logs / Automation Rules / Calibration CAM** —
  endpoint ฝั่ง Pi merge แล้วทั้งหมด อ่าน/เขียนค่าจริงได้
- **Stepper Control (UI + endpoint)** — หน้าจอและ `/api/motor/*` ฝั่ง Pi พร้อมแล้ว
- โครง shell + sidebar + ธีม glass/ส้ม, avatar ต่อผู้ใช้, จัดการผู้ใช้ฝั่ง admin

### ⏳ ยัง mock อยู่ — เพราะ **ฮาร์ดแวร์ยังไม่ได้ต่อ** (ไม่ใช่เพราะโค้ดไม่เสร็จ)

| เรื่อง | flag | ติดอะไร |
|---|---|---|
| **PM2.5** (ค่าปัจจุบัน + กราฟ history) | `useMockPm: true` | เซนเซอร์ PM ยังไม่ต่อ (endpoint `/api/pm-history` บน Pi ทำไว้แล้ว) |
| **Stepper motor** | `useMockMotor: true` | Arduino/CNC Shield ยังไม่ต่อ (endpoint ทำไว้แล้ว) |
| **Dongle ESP32-S3** | `useMockConnection: true` | ยังไม่มีตัวฮาร์ดแวร์ + `Esp32Connection` ยังเป็น stub |

พอต่อฮาร์ดแวร์เสร็จ → **แก้ flag ใน `config.ts` เป็น `false` อย่างเดียว** ไม่ต้องแก้อย่างอื่น

### ⚠️ ค้าง / ต้องทำต่อ

**ฝั่ง Pi** (แต่ละงานมีเอกสารของตัวเองใน `docs/` เขียนแบบ self-contained ก๊อปไปวางบน Pi ได้เลย)

| งาน | เอกสาร |
|---|---|
| เก็บชื่อ-นามสกุล ตอน signup + login + ตั้งชื่อเจ้าของ | `docs/pi-profile-name.md` |
| เช็กว่า `AERIS_JWT_SECRET` รอดหลังรีบูต | `docs/pi-jwt-secret-check.md` |
| จำกัดการจัดการผู้ใช้ให้เหลือ owner คนเดียว + ยืนยันรหัสผ่านซ้ำ | `docs/admin-access-hardening.md` |
| ย้าย SSH จากพอร์ต 22 → 2222 (ทำช่วงท้ายโปรเจ็ก) | `docs/pi-ssh-port-hardening.md` |

**งานที่เสร็จครึ่งทาง**

- **Calibration CAM** — บันทึกค่าลง Pi ได้แล้ว แต่ยังไม่ผูกเข้า `vision_node.py`
  → ปรับ threshold/ROI แล้วยังไม่มีผลกับโมเดลจริง
- **Tracking Tuner** — `process_noise_pos` / `process_noise_vel` ส่งได้ แต่ตัว tracker ยังไม่เอาไปใช้
- **Automation Rules** — มี runtime hook แล้ว แต่ action จริงต้องรอ detection pipeline + Arduino
- **ESP32 dongle transport** — ยังไม่มี เมื่อมีแล้วมีแผนต่อยอดใน
  `docs/dongle-ssh-integration-plan.md` (auto-fill host, เช็กว่าถึงตัวไหม, และ
  "Rescue Terminal" ผ่าน serial ที่ใช้ได้แม้เน็ตของ Pi ล่ม)
- **ชื่อ-นามสกุล** ตอนนี้แก้ในแอปไม่ได้ **โดยตั้งใจ** — รายงาน PDF ช่อง "ผู้จัดทำ" ใช้ค่านี้
  ถ้าไม่มีจะ fallback เป็น username

> ⚠️ **หมายเหตุความไม่ตรงกันของเอกสาร (เจอตอนทำสแนปช็อตนี้):**
> `CLAUDE.md` และ `docs/MOCK_STATUS.md` ยังเขียนว่า Tracking Tuner เป็น mock
> (`useMockTracking: true`) แต่ **`config.ts` ตั้งเป็น `false` แล้ว** (คือใช้ของจริง)
> ให้ยึด **`config.ts` เป็นแหล่งความจริง** แล้วค่อยตามไปอัปเดตสองไฟล์นั้น

---

## 5. กฎเหล็ก / จุดที่เคยพลาด (อ่านก่อนแก้โค้ด)

- **Wire format เป็น snake_case** ตาม `server.py` เป๊ะ ๆ (`pm25` ไม่ใช่ `pm2_5`)
  ชนิดข้อมูลอยู่ที่ `src/shared/types.ts`
- **ห้ามอ่าน `state.mask_on` / `state.mask_off`** จาก `/api/status` — เป็นค่าปลอม
  ค้างที่ 50/10 ให้ใช้ `mask_tally_on` / `mask_tally_off` แทน
  (จงใจไม่ใส่สองตัวแรกใน `DeviceState` เพื่อไม่ให้ใครเผลอใช้)
- **ห้ามทำ `GET /api/status` พัง** — Dashboard พึ่งรูปร่างของมัน
- **Modal ต้องเรนเดอร์ผ่าน portal ไป `<body>`** — หลาย container ใช้ `backdrop-filter`
  ซึ่งทำให้มันกลายเป็น containing block ของลูกที่ `position: fixed`
  (`src/renderer/src/ui/Modal.tsx`)
- **Token ธีมทั้งหมด** (สี, ขนาด, กระจก) อยู่ที่ `src/renderer/src/theme/theme.css`
- **ระยะห่างของ sidebar** ต้องแก้ที่ตัวแปร CSS ใน `theme.css`
  (`--aeris-sb-item-h`, `--aeris-sb-head-h`, `--aeris-sb-row-gap`, `--aeris-sb-group-gap`)
  **ไม่ใช่ที่ `shell.css`** ไม่งั้นแถบ "rail" สีส้มจะเลื่อนไม่ตรงกับไอคอน
- **ข้อความกลาง top bar** แก้ที่ `src/renderer/src/shell/branding.ts`
- **ข้อมูลเฉพาะเครื่อง/เฉพาะผู้ใช้** เก็บด้วย `safeStorage`/JSON แยกตาม username
  ใน main process: session (`tokenStore.ts`), avatar (`avatarStore.ts`)
- เอกสารใน `docs/` ที่เขียนสำหรับ Pi ต้อง **self-contained** — ห้ามลิงก์กลับมาที่ repo นี้

---

## 6. มีไฟล์อะไรบ้าง

```
Aeris Desktop App/
├── CLAUDE.md                 คู่มือสำหรับ AI agent ที่มาทำงานต่อในโปรเจ็กนี้
├── README.md                 อ่านสั้น ๆ ฉบับอังกฤษ
├── PROJECT_OVERVIEW.md       ← ไฟล์นี้
├── MIGRATION.md              วิธีย้าย/กู้โปรเจ็กบนเครื่องใหม่
├── update by codex.md        สรุปงานที่ Codex ทำในเซสชันคู่ขนาน
├── package.json / package-lock.json
├── electron.vite.config.ts   คอนฟิก build 3 ส่วน (main / preload / renderer)
├── electron-builder.yml      แพ็กเป็น AppImage + deb + NSIS + portable exe
├── tsconfig*.json            แยก node / web
│
├── src/
│   ├── main/                 main process
│   │   ├── config.ts         ★ สวิตช์ mock↔real + piBaseUrl ทั้งหมดอยู่ที่นี่
│   │   ├── index.ts          สร้างหน้าต่าง + lifecycle
│   │   ├── ipc.ts            ลงทะเบียน IPC handler ทุกตัว
│   │   ├── layers/           connection / api / cache / auth / tracking
│   │   └── services/         tokenStore, avatarStore, sshTerminal
│   ├── preload/              typed bridge `window.aeris`
│   ├── renderer/             React UI
│   │   ├── src/shell/        top bar + sidebar (mount ครั้งเดียว ไม่ reload)
│   │   ├── src/pages/        1 ไฟล์ = 1 หน้า + registry.tsx
│   │   ├── src/state/        AuthProvider, ConnectionProvider
│   │   ├── src/theme/        theme.css — token ทั้งหมด
│   │   ├── src/ui/           Modal
│   │   ├── src/auth/         หน้า login / signup
│   │   └── src/report/       report.ts — สร้าง HTML ของรายงาน PDF
│   └── shared/types.ts       ชนิดข้อมูลที่ใช้ร่วมกัน (ตรงกับ wire format)
│
├── server/
│   ├── aeris_auth.py         โมดูล auth (merge เข้า server.py บน Pi แล้ว)
│   └── README_AUTH.md
│
└── docs/                     งานฝั่ง Pi + สถานะ mock
    ├── MOCK_STATUS.md        ★ ตารางว่าอะไรจริง/อะไร mock
    ├── pi-*.md               สเปก endpoint ฝั่ง Pi (self-contained)
    ├── admin-access-hardening.md
    ├── dongle-ssh-integration-plan.md
    └── stepper-motion-flow-options.md
```

---

## 7. คำสั่งที่ใช้

Node ติดตั้งแบบ **user-local** ไม่ได้อยู่ใน PATH ของ shell ใหม่:

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # ต้องรันก่อนใช้ npm/node ทุกครั้ง

npm install            # ครั้งแรก / หลังย้ายเครื่อง
npm run dev            # เปิด dev
npm run typecheck      # node + web — รันก่อนบอกว่าเสร็จเสมอ
npm run build          # คอมไพล์ main/preload/renderer ลง out/
npm run build:linux    # AppImage + deb  → dist/
npm run build:win      # NSIS installer + portable exe → dist/
```

รันตัวที่ build แล้วโดยตรง ต้องปิด `ELECTRON_RUN_AS_NODE` ไม่งั้น Electron จะบูตเป็น
Node ธรรมดาแล้ว `app` เป็น undefined:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron . --no-sandbox
```
