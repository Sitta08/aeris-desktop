# งาน: endpoint ปรับพารามิเตอร์ ByteTrack (Tracking Tuner) บน Raspberry Pi

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) อ่านเป็น reference ได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ
>
> ✅ **สถานะ: ทำบน Pi แล้ว + verified (30 ก.ค. 69)** — endpoint `/api/tracking/config`
> ใช้งานจริงแล้ว (contract **11 field**) แอปตั้ง `useMockTracking: false` และดึง/ส่งค่าจริง
> ผ่านหน้า **Tools → Tracking Tuner** เอกสารนี้อัปเดตให้ตรงกับ **contract จริงที่ implement ไปแล้ว**
> เก็บไว้เป็น reference — ไม่ใช่ TODO อีกต่อไป

## บริบท

- **AERIS** = หุ่นยนต์ตรวจ PM2.5 + การสวมหน้ากาก ใช้ **ByteTrack** ติดตามบุคคลข้ามเฟรม
- แอป desktop (Electron) มีหน้า **Tools → Tracking Tuner** ให้ปรับพารามิเตอร์นี้แบบ real-time
- แอปมี "ชั้นข้อมูล" แยกต่างหากสำหรับ tracking config (ไม่ปนกับ `/api/status` หรือ endpoint
  อื่น) — endpoint นี้เป็นอิสระ ไม่กระทบของเดิม
- **หมายเหตุประวัติ:** contract แรกที่แอปเดาไว้มี 3–6 field (`match_thresh`,
  `appearance_weight`, `recent_departures_timeout_sec`, …) — ตอน implement จริงพบว่า
  `recent_departures_timeout_sec` **ไม่มีในระบบ** ใช้ `track_buffer` (นับเป็นเฟรม) แทน และมี
  พารามิเตอร์จริงเพิ่มอีกหลายตัว รวมเป็น **11 field** ด้านล่างนี้คือของจริง

## Contract จริง (11 field — verified)

```
GET  /api/tracking/config          → คืนค่าปัจจุบัน
POST /api/tracking/config          → รับค่าใหม่ทั้งก้อน, apply, คืนค่าที่ apply + apply_status
POST /api/tracking/config/reset    → รีเซ็ตเป็น default, คืนค่าที่รีเซ็ตแล้ว
```

ทั้ง 3 endpoint คืน JSON รูปแบบเดียวกัน — **11 field หลัก** บวก key เสริม (`updated_at`,
`apply_status`) ที่เป็น additive:

```json
{
  "track_high_thresh": 0.5,
  "track_low_thresh": 0.1,
  "new_track_thresh": 0.6,
  "match_thresh": 0.8,
  "appearance_weight": 0.0,
  "center_distance_weight": 0.0,
  "track_buffer": 30,
  "min_hits_to_confirm": 3,
  "frame_rate": 10,
  "process_noise_pos": 0.05,
  "process_noise_vel": 0.00625,
  "updated_at": "2026-07-30T16:07:46.166057+00:00",
  "apply_status": {
    "ok": true,
    "applied": [
      "match_thresh", "track_high_thresh", "track_low_thresh", "new_track_thresh",
      "track_buffer", "min_hits_to_confirm", "frame_rate",
      "center_distance_weight", "appearance_weight"
    ],
    "pending": ["process_noise_pos", "process_noise_vel"],
    "message": "Tracking config applied",
    "detail": "9 field(s) bound live to ByteTracker; pending=['process_noise_pos', 'process_noise_vel']",
    "applied_at": "2026-07-30T16:07:46.166373+00:00"
  }
}
```

### ตารางพารามิเตอร์

| field | ชนิด | default | ช่วง slider (แอป) | หมายเหตุ |
|---|---|---|---|---|
| `track_high_thresh` | float | 0.5 | 0–1 | conf ขั้นต่ำที่ถือว่า "มั่นใจสูง" ใช้เริ่ม/ต่อ track โดยตรง |
| `track_low_thresh` | float | 0.1 | 0–1 | conf ต่ำสุดที่ยังใช้ช่วยจับคู่ในรอบสองของ ByteTrack |
| `new_track_thresh` | float | 0.6 | 0–1 | conf ขั้นต่ำสำหรับสร้าง track ใหม่ |
| `match_thresh` | float | 0.8 | 0–1 | IoU ขั้นต่ำจับคู่ detection เข้ากับ track เดิม |
| `appearance_weight` | float | 0.0 | 0–1 | น้ำหนัก re-ID (0 = ปิด) |
| `center_distance_weight` | float | 0.0 | 0–1 | น้ำหนักระยะห่างจุดกึ่งกลางกรอบ (0 = ปิด) |
| `track_buffer` | **int (เฟรม)** | 30 | 1–300 | เก็บ track ที่หายไปกี่ **เฟรม** ก่อนลบ (ไม่ใช่วินาที) |
| `min_hits_to_confirm` | **int** | 3 | 1–30 | เจอ track ติดกันกี่ครั้งก่อนยืนยันว่าเป็นคนจริง |
| `frame_rate` | **int (fps)** | 10 | 1–60 | เฟรมเรตที่ tracker ใช้คำนวณ (ควรตรงกล้องจริง ~10) |
| `process_noise_pos` | float | 0.05 | 0–0.5 | Kalman noise ตำแหน่ง — ⏳ **pending** (ดูด้านล่าง) |
| `process_noise_vel` | float | 0.00625 | 0–0.1 | Kalman noise ความเร็ว — ⏳ **pending** (ดูด้านล่าง) |

> ช่วง slider ในตารางคือ clamp ฝั่ง **desktop** — Pi ต้อง validate ช่วงของตัวเองอีกชั้นด้วย
> (ดูหัวข้อ validation) ถ้าช่วงจริงของ tracker ต่างจากนี้ ให้แจ้งฝั่ง desktop มาแก้
> `BYTETRACK_PARAM_SPECS` ใน `src/shared/types.ts` ให้ตรงกัน

### `apply_status` (key เสริม — additive)

หลัง apply/reset Pi แนบ `apply_status` กลับมาบอกว่าฟิลด์ไหน "มีผลจริงกับ tracker แล้ว"
(`applied[]`) และฟิลด์ไหน "รับค่าไว้แต่ยังไม่มีผล" (`pending[]`) ฝั่งแอป **ไม่ต้องพึ่ง key นี้
ในการทำงานหลัก** — อ่านแค่ 11 field ตามชื่อพอ แต่ badge ⏳ ในหน้า Tracking Tuner อิงข้อเท็จจริง
ว่า `process_noise_*` อยู่ใน `pending` เสมอ

### ⏳ process_noise_pos / process_noise_vel — pending

สองตัวนี้ Pi **รับค่าและ echo กลับ** แต่ ByteTracker **ยังไม่นำไปใช้จริง** (`apply_status.pending`
ลิสต์ทั้งคู่ไว้) หน้า Tracking Tuner จึงติด badge **⏳ รอ implement** ที่ 2 slider นี้ เพื่อให้คนใช้
รู้ว่าปรับได้แต่ยังไม่มีผล งานต่อไปฝั่ง Pi คือ bind ค่านี้เข้ากับ Kalman filter ของ tracker จริง

TypeScript type ที่ฝั่งแอปใช้ (จาก `src/shared/types.ts`) — **ชื่อ field ต้องตรงเป๊ะ (snake_case)**:

```ts
interface ByteTrackConfig {
  track_high_thresh: number       // 0–1, default 0.5
  track_low_thresh: number        // 0–1, default 0.1
  new_track_thresh: number        // 0–1, default 0.6
  match_thresh: number            // 0–1, default 0.8
  appearance_weight: number       // 0–1, default 0.0 (0 = ปิด)
  center_distance_weight: number  // 0–1, default 0.0 (0 = ปิด)
  track_buffer: number            // int เฟรม, default 30
  min_hits_to_confirm: number     // int, default 3
  frame_rate: number              // int fps, default 10
  process_noise_pos: number       // default 0.05  ⏳ pending (ยังไม่มีผลจริง)
  process_noise_vel: number       // default 0.00625  ⏳ pending
}
```

## ⚠️ ข้อห้าม (ยังคงมีผลเวลาปรับแก้ endpoint นี้ต่อ)

- **ห้ามแก้ `/api/status`, `/api/mask-stats`, `/api/auth/*`, `/api/admin/*`,
  `/api/system/info`, `/api/pm-history`, `/api/mask-history`, `/api/motor/*`,
  `/api/diagnostics`, `/api/event-logs`, `/api/automation/*`, `/api/calibration` ให้พัง**
  endpoint พวกนี้แอปใช้งานอยู่แล้ว
- **ต้อง validate ค่าที่รับมาซ้ำบน Pi** — อย่าเชื่อว่า desktop ส่งค่าที่ถูกช่วงมาเสมอ
  (ฝั่งแอป clamp ไว้ชั้นหนึ่งแล้ว แต่ Pi ต้องกันเองอีกชั้น เผื่อมีใครยิง API ตรง ๆ)
- **การ apply ค่าใหม่ต้องไม่ทำให้ tracker process ค้างหรือ crash** — ถ้าต้อง restart
  thread/process ของ tracker ให้ทำแบบ graceful

## FastAPI router (reference — ที่ implement ไปแล้ว)

โครงตัวอย่างที่สะท้อน contract จริง (ตัวเลข default = ค่าจริงจาก tracker):

```python
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tracking")

DEFAULTS = {
    "track_high_thresh": 0.5,
    "track_low_thresh": 0.1,
    "new_track_thresh": 0.6,
    "match_thresh": 0.8,
    "appearance_weight": 0.0,
    "center_distance_weight": 0.0,
    "track_buffer": 30,          # int, หน่วยเป็นเฟรม
    "min_hits_to_confirm": 3,    # int
    "frame_rate": 10,            # int, fps
    "process_noise_pos": 0.05,   # ⏳ pending — ยังไม่ผูกเข้า Kalman จริง
    "process_noise_vel": 0.00625 # ⏳ pending
}

# ฟิลด์ที่ผูกเข้ากับ tracker จริงแล้ว vs ที่ยังรอ implement
PENDING_FIELDS = {"process_noise_pos", "process_noise_vel"}

class TrackingConfig(BaseModel):
    # ช่วงเหล่านี้ mirror กับ clamp ฝั่ง desktop — ปรับตามข้อจำกัดจริงของ tracker ได้
    track_high_thresh: float = Field(ge=0.0, le=1.0)
    track_low_thresh: float = Field(ge=0.0, le=1.0)
    new_track_thresh: float = Field(ge=0.0, le=1.0)
    match_thresh: float = Field(ge=0.0, le=1.0)
    appearance_weight: float = Field(ge=0.0, le=1.0)
    center_distance_weight: float = Field(ge=0.0, le=1.0)
    track_buffer: int = Field(ge=1, le=300)
    min_hits_to_confirm: int = Field(ge=1, le=30)
    frame_rate: int = Field(ge=1, le=60)
    process_noise_pos: float = Field(ge=0.0, le=0.5)
    process_noise_vel: float = Field(ge=0.0, le=0.1)

_current = dict(DEFAULTS)

def _apply_to_tracker(cfg: dict) -> list[str]:
    """ผูกค่าเข้ากับ instance ByteTracker ที่รันอยู่จริง
    คืน list ของ field ที่ 'มีผลจริง' (ตัวใน PENDING_FIELDS ยังไม่ผูก)"""
    applied = [k for k in cfg if k not in PENDING_FIELDS]
    # TODO: bind process_noise_pos/vel เข้ากับ Kalman filter แล้วย้ายออกจาก PENDING_FIELDS
    return applied

def _with_status(cfg: dict, applied: list[str]) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    pending = [k for k in cfg if k in PENDING_FIELDS]
    return {
        **cfg,
        "updated_at": now,
        "apply_status": {
            "ok": True,
            "applied": applied,
            "pending": pending,
            "message": "Tracking config applied",
            "detail": f"{len(applied)} field(s) bound live to ByteTracker; pending={pending}",
            "applied_at": now,
        },
    }

@router.get("/config")
def get_config():
    return _with_status(_current, [k for k in _current if k not in PENDING_FIELDS])

@router.post("/config")
def apply_config(body: TrackingConfig):
    global _current
    try:
        applied = _apply_to_tracker(body.model_dump())
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    _current = body.model_dump()
    return _with_status(_current, applied)

@router.post("/config/reset")
def reset_config():
    global _current
    _current = dict(DEFAULTS)
    applied = _apply_to_tracker(_current)
    return _with_status(_current, applied)
```

ผูกเข้ากับ FastAPI app ที่มีอยู่: `app.include_router(router)`

## ทดสอบ

```bash
curl -s http://localhost:8000/api/tracking/config | python3 -m json.tool

curl -s -X POST http://localhost:8000/api/tracking/config \
  -H "Content-Type: application/json" \
  -d '{"track_high_thresh":0.5,"track_low_thresh":0.1,"new_track_thresh":0.6,"match_thresh":0.75,"appearance_weight":0.0,"center_distance_weight":0.0,"track_buffer":30,"min_hits_to_confirm":3,"frame_rate":10,"process_noise_pos":0.05,"process_noise_vel":0.00625}' \
  | python3 -m json.tool

curl -s -X POST http://localhost:8000/api/tracking/config/reset | python3 -m json.tool

# ค่านอกช่วงต้องโดนปฏิเสธ (422) ไม่ใช่ crash
curl -s -X POST http://localhost:8000/api/tracking/config \
  -H "Content-Type: application/json" \
  -d '{"track_high_thresh":5,"track_low_thresh":-1,"new_track_thresh":9,"match_thresh":5,"appearance_weight":-1,"center_distance_weight":2,"track_buffer":0,"min_hits_to_confirm":0,"frame_rate":0,"process_noise_pos":-5,"process_noise_vel":99}'
```

Checklist:
- [x] ยืนยันชื่อ field/ค่า default/ช่วงจริงจาก config ของ tracker แล้ว (11 field)
- [x] `GET/POST /api/tracking/config` และ `POST /api/tracking/config/reset` คืน JSON ครบ
- [x] ส่งค่านอกช่วง → ไม่ crash (validate/reject)
- [x] apply ค่าใหม่แล้ว 9 field มีผลจริงกับ tracker (`apply_status.applied`)
- [ ] **งานต่อไป:** bind `process_noise_pos` / `process_noise_vel` เข้ากับ Kalman filter จริง
      แล้วเอาออกจาก `PENDING_FIELDS` (ตอนนี้อยู่ใน `apply_status.pending`)
- [x] endpoint อื่น (`/api/status`, `/api/mask-stats`, ฯลฯ) ยังทำงานปกติ

## ฝั่ง desktop (ทำแล้ว)

- `src/main/config.ts` ตั้ง `useMockTracking: false` แล้ว → หน้า Tools → Tracking Tuner ยิงไป Pi จริง
- `BYTETRACK_PARAM_SPECS` ใน `src/shared/types.ts` = 11 field ตรงกับ contract นี้
- 2 slider `process_noise_*` ติด badge **⏳ รอ implement** ตาม `apply_status.pending`
- ถ้าฝั่ง Pi เปลี่ยนชื่อ field / ช่วง / default ในอนาคต ให้แจ้งมาแก้ `BYTETRACK_PARAM_SPECS`
  ให้ตรงกัน (ไฟล์เดียวคุมทั้งฟอร์ม UI และการ clamp) และเมื่อ bind `process_noise_*` เสร็จ
  ให้เอา `pending: true` ออกจาก 2 spec นั้นเพื่อลบ badge
