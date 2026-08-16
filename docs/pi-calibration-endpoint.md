# งาน: endpoint Calibration บน Raspberry Pi

> ✅ **สถานะ: ทำบน Pi แล้ว + tested (30 ก.ค. 69)** — persist + in-memory config +
> validation ใช้งานผ่าน `useMockCalibration: false`
>
> หมายเหตุ: threshold/ROI ยังไม่ส่งผลกับ model จริงจนกว่าจะ bind config เข้า `vision_node.py`

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## ตอบข้อสงสัยสำคัญก่อน

ทำได้จริง: ถ้าเดิมใน Pi ตั้ง threshold ไว้ `0.65` แล้วแก้ใน app เป็น `0.8`
แอปจะส่ง `PUT /api/calibration` ไปที่ Pi จากนั้น `server.py` ต้อง:

1. validate ค่า
2. บันทึกลงไฟล์ JSON หรือ SQLite
3. update config ใน memory
4. สั่ง detection/tracker pipeline ใช้ค่าใหม่ทันที หรือ reload แบบปลอดภัย

ดังนั้น app ไม่ได้แก้ไฟล์บน Pi เองโดยตรง แต่สั่ง backend บน Pi ให้แก้ config และ apply ค่า

## สิ่งที่ต้องทำ

เพิ่ม endpoint 3 ตัว:

```http
GET  /api/calibration
PUT  /api/calibration
POST /api/calibration/reset
```

### ⚠️ ข้อห้าม

- **ห้ามแก้ `/api/status`, `/api/mask-stats`, `/api/auth/*`, `/api/admin/*` ให้พัง**
- **ห้ามรับค่า threshold นอกช่วง** เช่น < 0 หรือ > 1
- **ห้ามบันทึกค่าแล้วไม่ apply** เพราะผู้ใช้คาดหวังว่า app เปลี่ยนแล้ว runtime ใช้จริง
- ถ้า pipeline ยัง reload runtime ไม่ได้ ให้คืนค่าได้ แต่ต้อง log/ระบุชัดว่า “pending restart”

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

```json
{
  "detection_confidence": 0.65,
  "mask_confidence": 0.65,
  "tracker_match_threshold": 0.8,
  "roi": {
    "x_pct": 10,
    "y_pct": 8,
    "w_pct": 80,
    "h_pct": 82
  },
  "updated_at": "2026-07-28T07:00:00Z",
  "apply_status": {
    "ok": true,
    "message": "Calibration applied",
    "detail": "Detector runtime is now using detection_confidence=0.8",
    "applied_at": "2026-07-28T07:00:02Z"
  }
}
```

TypeScript type ที่ฝั่งแอปใช้:

```ts
interface DetectionRoi {
  x_pct: number
  y_pct: number
  w_pct: number
  h_pct: number
}

interface CalibrationConfig {
  detection_confidence: number
  mask_confidence: number
  tracker_match_threshold: number
  roi: DetectionRoi
  updated_at: string
  apply_status?: {
    ok: boolean
    message: string
    detail?: string
    applied_at: string
  }
}
```

`apply_status` เป็น optional แต่แนะนำให้ส่งกลับหลัง `PUT` และ `reset` เพื่อให้ desktop
แสดงหลักฐานว่า Pi apply ค่าเข้า runtime แล้วจริง ๆ ไม่ใช่แค่รับ request สำเร็จ

## ความหมายของค่า

| field | ช่วงแนะนำ | ความหมาย |
|---|---:|---|
| `detection_confidence` | 0.05–0.99 | confidence ขั้นต่ำของ object/person detection |
| `mask_confidence` | 0.05–0.99 | confidence ขั้นต่ำของ mask/no-mask classifier |
| `tracker_match_threshold` | 0.05–0.99 | threshold สำหรับ matching track |
| `roi.x_pct/y_pct/w_pct/h_pct` | 0–100 | พื้นที่ตรวจจับเป็นเปอร์เซ็นต์ของ frame |

หมายเหตุ: ใช้ **reCamera 2002w** เป็น camera source และเทสได้ประมาณ **10fps** แล้ว
ตอนนี้ยังไม่ต้องมี field สำหรับปรับ FPS จาก desktop ให้ถือว่า FPS เป็นค่าฝั่ง camera/source
หรือ pipeline บน Pi จัดการเอง

## ตัวอย่าง FastAPI skeleton

```python
import datetime as dt
import json
import threading
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

router = APIRouter(prefix="/api")
CONFIG_PATH = Path("calibration.json")
_lock = threading.Lock()
_calibration = None

class Roi(BaseModel):
    x_pct: float = Field(ge=0, le=95)
    y_pct: float = Field(ge=0, le=95)
    w_pct: float = Field(ge=5, le=100)
    h_pct: float = Field(ge=5, le=100)

    @model_validator(mode="after")
    def roi_must_fit(self):
        if self.x_pct + self.w_pct > 100:
            raise ValueError("ROI x_pct + w_pct must be <= 100")
        if self.y_pct + self.h_pct > 100:
            raise ValueError("ROI y_pct + h_pct must be <= 100")
        return self

class Calibration(BaseModel):
    detection_confidence: float = Field(ge=0.05, le=0.99)
    mask_confidence: float = Field(ge=0.05, le=0.99)
    tracker_match_threshold: float = Field(ge=0.05, le=0.99)
    roi: Roi
    updated_at: str | None = None

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def defaults():
    return {
        "detection_confidence": 0.65,
        "mask_confidence": 0.65,
        "tracker_match_threshold": 0.8,
        "roi": {"x_pct": 10, "y_pct": 8, "w_pct": 80, "h_pct": 82},
        "updated_at": now_iso(),
    }

def load_calibration():
    global _calibration
    if CONFIG_PATH.exists():
        _calibration = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    else:
        _calibration = save_calibration(defaults())
    apply_calibration_to_runtime(_calibration)
    return _calibration

def save_calibration(next_cfg):
    next_cfg["updated_at"] = now_iso()
    CONFIG_PATH.write_text(json.dumps(next_cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return next_cfg

def apply_calibration_to_runtime(cfg):
    """
    TODO: ผูกกับตัวแปร/object จริงของ detection pipeline
    เช่น detector.conf = cfg["detection_confidence"]
         mask_model.conf = cfg["mask_confidence"]
         tracker.match_thresh = cfg["tracker_match_threshold"]
         roi_filter.set_percent_rect(cfg["roi"])
    """
    pass

def applied_status(message, detail):
    return {
        "ok": True,
        "message": message,
        "detail": detail,
        "applied_at": now_iso(),
    }

@router.get("/calibration")
def get_calibration():
    with _lock:
        return _calibration or load_calibration()

@router.put("/calibration")
def put_calibration(payload: Calibration):
    with _lock:
        global _calibration
        _calibration = save_calibration(payload.model_dump())
        apply_calibration_to_runtime(_calibration)
        _calibration["apply_status"] = applied_status(
            "Calibration applied",
            f"Detector runtime is now using detection_confidence={_calibration['detection_confidence']}",
        )
        return _calibration

@router.post("/calibration/reset")
def reset_calibration():
    with _lock:
        global _calibration
        _calibration = save_calibration(defaults())
        apply_calibration_to_runtime(_calibration)
        _calibration["apply_status"] = applied_status(
            "Calibration reset",
            "Runtime restored default calibration",
        )
        return _calibration
```

แล้วผูกเข้ากับ app:

```python
app.include_router(router)
load_calibration()
```

## จุดที่ต้องผูกกับ pipeline จริง

- `detection_confidence` ต้องถูกใช้ก่อนยอมรับ detection
- `mask_confidence` ต้องถูกใช้ก่อนตัดสิน mask/no-mask/improper
- `tracker_match_threshold` ต้องถูกใช้กับ tracker object จริง
- `roi` ต้อง crop/filter detection ให้อยู่ในพื้นที่ที่กำหนด

ถ้าบางค่า runtime update ไม่ได้ ให้บันทึกไว้ก่อนและ log event ว่าต้อง restart แต่ค่าที่ update ได้
ควร apply ทันที

## ทดสอบ

```bash
curl -s http://localhost:8000/api/calibration | python3 -m json.tool
curl -s -X PUT http://localhost:8000/api/calibration \
  -H "Content-Type: application/json" \
  --data @calibration.json | python3 -m json.tool
curl -s -X POST http://localhost:8000/api/calibration/reset | python3 -m json.tool
```

เช็คว่า:
- [ ] GET/PUT/reset คืน schema ตรงตามสัญญา
- [ ] ส่ง `detection_confidence: 0.8` แล้ว pipeline ใช้ 0.8 จริง
- [ ] หลัง PUT/reset มี `apply_status.ok: true` และข้อความบอกว่า runtime ใช้ค่าใหม่แล้ว
- [ ] ค่า persist หลัง restart server
- [ ] ROI ที่เกิน frame ถูก reject ด้วย 422
- [ ] ค่า PM2.5 หลัง offset ถูกใช้ใน endpoint/status ที่เกี่ยวข้อง
- [ ] endpoint เดิม `/api/status`, `/api/system/info`, `/api/mask-history` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ใน `src/main/config.ts` ตั้ง:

```ts
useMockCalibration: false
```

แล้วอัปเดต `docs/MOCK_STATUS.md` ให้ตรงกับสถานะจริง
