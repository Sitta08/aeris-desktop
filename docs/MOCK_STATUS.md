# สถานะ Mock / Real ของข้อมูลในแอป

> **ไฟล์นี้ = กันลืม** ว่าตอนนี้ข้อมูลส่วนไหนเป็นของจริงจาก Pi ส่วนไหนยัง mock อยู่
> คุมทั้งหมดที่ [`src/main/config.ts`](../src/main/config.ts) — แก้ flag แล้วมาอัปเดตตารางนี้ด้วย

อัปเดตล่าสุด: 16 ส.ค. 69

## ภาพรวม

แอปใช้ **HybridApiClient** — ต่อ Pi จริงเป็นหลัก แต่ยัง mock เฉพาะฟีเจอร์ที่ฮาร์ดแวร์ยังไม่ต่อ

| ข้อมูล / หน้า | แหล่ง | สถานะ | flag ที่คุม |
|---|---|---|---|
| Login / สมัคร / อนุมัติ (auth) | **จริง** (Pi) | ✅ ต่อแล้ว | `useMockAuth: false` |
| Dashboard — mask tally, node status | **จริง** (Pi `/api/status`) | ✅ ต่อแล้ว | `useMockApi: false` |
| Dashboard — mask-stats (ช่วงเวลา) | **จริง** (`/api/mask-stats`) | ✅ ต่อแล้ว | `useMockApi: false` |
| Settings — INFO Load & Temp (CPU/RAM/Hailo) | **จริง** (`/api/system/info`) | ✅ ต่อแล้ว | `useMockApi: false` |
| Graphs — mask compliance trend | **จริง** (`/api/mask-history`) | ✅ ต่อแล้ว | `useMockApi: false` |
| **PM2.5 — ค่าปัจจุบัน + กราฟ history** | **MOCK** | ⏳ เซนเซอร์ PM ยังไม่ต่อ | `useMockPm: true` |
| **Stepper Control — motor + teach/play** | **MOCK** | ⏳ Arduino ยังไม่ต่อ | `useMockMotor: true` |
| **Tracking Tuner — ByteTrackConfig** | **จริง** (`/api/tracking/config`) | ✅ endpoint เสร็จ + verify แล้ว (11 ฟิลด์); `process_noise_pos/vel` ส่งได้แต่ tracker ยังไม่เอาไปใช้ | `useMockTracking: false` |
| **System Diagnostics** | **จริง** (`/api/diagnostics`) | ✅ endpoint merge แล้ว | `useMockDiagnostics: false` |
| **Event Logs** | **จริง** (`/api/event-logs`) | ✅ endpoint + logging merge แล้ว | `useMockEventLogs: false` |
| **Automation Rules** | **จริง** (`/api/automation/rules`) | ✅ persist + in-memory + runtime hook แล้ว; trigger รอกล้อง/Arduino ตามสถานะจริง | `useMockAutomation: false` |
| **Calibration CAM** | **จริง** (`/api/calibration`) | ✅ persist + in-memory แล้ว; binding เข้า `vision_node.py` ยังรอรอบถัดไป | `useMockCalibration: false` |
| Live viewer (webview) | Pi ตรง ๆ | — | (ใช้ `dashboardUrl`) |
| Terminal & CMD (SSH) | **จริง** (SSH ตรงไป Pi) | ✅ ใช้ได้เลย | ไม่มี flag — ต่อ SSH สด, ไม่ผ่าน Layer 2 |
| Dongle (ESP32-S3) | MOCK | ⏳ ยังไม่มี hardware | `useMockConnection: true` |

## วิธีเปิดของจริงเมื่อฮาร์ดแวร์ต่อเสร็จ

แก้ที่ [`src/main/config.ts`](../src/main/config.ts) แล้วมาอัปเดตตารางข้างบน:

- **ต่อเซนเซอร์ PM แล้ว** → ตั้ง `useMockPm: false`
  (ค่า PM2.5 ใน Dashboard + กราฟ PM ในหน้า Graphs จะดึงจาก Pi จริง)
- **ต่อ Arduino/CNC แล้ว** → ตั้ง `useMockMotor: false`
  (หน้า Stepper Control จะสั่งมอเตอร์จริงผ่าน `/api/motor/*`)
- **ต่อ dongle จริงแล้ว** → ทำ `Esp32Connection` ให้เสร็จ แล้ว `useMockConnection: false`
- **Tracking Tuner ทำเสร็จแล้ว** → ตั้ง `useMockTracking: false` อยู่ตอนนี้
  (เป็น flag แยกอิสระ ไม่ขึ้นกับ `useMockApi` เพราะ Tracking Tuner เป็นเลเยอร์ของตัวเอง
  ไม่ใช่ส่วนหนึ่งของ Layer 2 ApiClient — ดู `docs/pi-tracking-config-endpoint.md`)
- **Diagnostics / Event Logs / Automation / Calibration CAM ทำบน Pi แล้ว**
  → ตอนนี้ตั้ง `useMockDiagnostics/useMockEventLogs/useMockAutomation/useMockCalibration: false`
  ถ้าต้อง demo แบบไม่ต่อ Pi ค่อยสลับกลับเป็น `true`

## หมายเหตุ

- `useMockApi: true` = master switch ปิดทุกอย่างเป็น mock (โหมด dev ออฟไลน์) —
  flag `useMockPm` / `useMockMotor` จะมีผล**เฉพาะตอน `useMockApi: false`**
- อย่าลืมเช็ก `piBaseUrl` ใน config ให้ตรง IP ปัจจุบันของ Pi (`hostname -I` บน Pi)
- endpoint ฝั่ง Pi ของ PM (`/api/pm-history`) และ motor (`/api/motor/*`) **ทำไว้แล้ว**
  แค่ยังไม่มีฮาร์ดแวร์จริง — พอต่อแล้วสลับ flag ได้เลย ไม่ต้องแก้ Pi เพิ่ม

## ข้อควรรู้ตอนทดสอบ Tools รอบนี้

- **System Diagnostics / Event Logs**: ใช้ endpoint จริงบน Pi ได้เลย
- **Automation Rules**: อ่าน/บันทึก config จริงบน Pi ได้แล้ว และมี runtime hook แล้ว
  แต่ action จริงยังขึ้นกับ detection pipeline + Arduino/stepper ว่าพร้อมหรือยัง
- **Calibration CAM**: อ่าน/บันทึก config จริงบน Pi ได้แล้ว แต่ threshold/ROI ยังไม่ส่งผลกับ model
  จนกว่าจะ bind ค่าใน `calibration.json` / in-memory config เข้า `vision_node.py`
- **Tracking Tuner**: อ่าน/บันทึกค่าจริงบน Pi ได้แล้ว (11 ฟิลด์) แต่ `process_noise_pos` /
  `process_noise_vel` ฝั่ง Pi รับค่าไว้เฉย ๆ ตัว tracker ยังไม่เอาไปใช้จริง
