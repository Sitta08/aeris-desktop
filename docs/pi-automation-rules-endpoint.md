# งาน: endpoint Automation Rules บน Raspberry Pi

> ✅ **สถานะ: ทำบน Pi แล้ว + tested (30 ก.ค. 69)** — persist + in-memory config +
> runtime hook ใช้งานผ่าน `useMockAutomation: false`
>
> หมายเหตุ: rule trigger จริงยังขึ้นกับ detection pipeline และ Arduino/stepper ว่าพร้อมเรียกใช้งานแล้วหรือยัง

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## บริบท

- AERIS ตรวจ event เช่น `no_mask` และ `improper_mask` บน Pi
- แอป desktop มี Stepper Teach/Playback แล้ว จึงควรมี rule ที่ผูก detection event → action
- หน้า desktop เป็นแค่ control panel ส่วน logic จริงอยู่บน Pi เพื่อให้ทำงานต่อได้แม้ปิดแอป
- ตอนนี้ฝั่ง desktop ต่อ endpoint จริงแล้ว (`useMockAutomation: false`)

## สิ่งที่ต้องทำ

เพิ่ม endpoint 3 ตัว:

```http
GET  /api/automation/rules
PUT  /api/automation/rules
POST /api/automation/rules/reset
```

### ⚠️ ข้อห้าม

- **ห้ามให้ desktop เป็นตัวเฝ้า event หลัก** — rule runtime ต้องอยู่บน Pi
- **ห้ามสั่ง motor ซ้ำรัว ๆ** ต้องมี cooldown/debounce จริงบน Pi
- **ห้ามเล่น sequence ถ้ามอเตอร์ busy** ถ้า `skip_if_motor_busy: true`
- **ห้าม log หรือส่ง password/JWT/secret** ใน event log
- **ต้อง validate ซ้ำบน Pi** อย่าเชื่อค่าจาก desktop อย่างเดียว

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

```json
{
  "enabled": true,
  "updated_at": "2026-07-28T07:00:00Z",
  "apply_status": {
    "ok": true,
    "message": "Automation rules applied",
    "detail": "Runtime is now using the returned automation rules",
    "applied_at": "2026-07-28T07:00:02Z"
  },
  "rules": {
    "no_mask": {
      "enabled": true,
      "cooldown_sec": 10,
      "play_motor_sequence": true,
      "sequence_name": "Mask warning motion",
      "trigger_tts": true,
      "tts_message": "กรุณาสวมหน้ากากอนามัย",
      "skip_if_motor_busy": true
    },
    "improper_mask": {
      "enabled": false,
      "cooldown_sec": 15,
      "play_motor_sequence": false,
      "sequence_name": "Mask warning motion",
      "trigger_tts": true,
      "tts_message": "กรุณาสวมหน้ากากให้ถูกต้อง",
      "skip_if_motor_busy": true
    }
  }
}
```

TypeScript type ที่ฝั่งแอปใช้:

```ts
type AutomationTrigger = 'no_mask' | 'improper_mask'

interface AutomationRule {
  enabled: boolean
  cooldown_sec: number
  play_motor_sequence: boolean
  sequence_name: string
  trigger_tts: boolean
  tts_message: string
  skip_if_motor_busy: boolean
}

interface AutomationRulesConfig {
  enabled: boolean
  updated_at: string
  rules: Record<AutomationTrigger, AutomationRule>
  apply_status?: {
    ok: boolean
    message: string
    detail?: string
    applied_at: string
  }
}
```

`apply_status` เป็น optional แต่แนะนำให้ส่งกลับหลัง `PUT` และ `reset` เพื่อให้ desktop
แสดงหลักฐานว่า Pi apply rules เข้า runtime แล้วจริง ๆ

ชื่อ field ต้องตรงเป๊ะ: `cooldown_sec`, `play_motor_sequence`, `sequence_name`,
`trigger_tts`, `tts_message`, `skip_if_motor_busy`

## Runtime flow ที่ควรทำจริง

```text
detection pipeline emits no_mask
-> load current automation rules from memory
-> if global enabled and no_mask rule enabled
-> if cooldown already passed
-> if motor action enabled and motor not busy
-> play saved sequence_name
-> if TTS enabled, speak tts_message
-> write event log
```

สำคัญ: config ควรโหลดไว้ใน memory และ update ทันทีหลัง `PUT /api/automation/rules`
เพื่อให้ค่าใน app ใช้งานจริงทันที ไม่ต้อง restart server

## ตัวอย่าง FastAPI skeleton

```python
import datetime as dt
import json
import threading
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/automation")
CONFIG_PATH = Path("automation_rules.json")
_lock = threading.Lock()
_rules = None
_last_trigger_at = {"no_mask": 0.0, "improper_mask": 0.0}

class Rule(BaseModel):
    enabled: bool = True
    cooldown_sec: int = Field(default=10, ge=1, le=300)
    play_motor_sequence: bool = True
    sequence_name: str = "Mask warning motion"
    trigger_tts: bool = True
    tts_message: str = ""
    skip_if_motor_busy: bool = True

class RulesConfig(BaseModel):
    enabled: bool = True
    updated_at: str | None = None
    rules: dict[str, Rule]

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def defaults():
    return {
        "enabled": True,
        "updated_at": now_iso(),
        "rules": {
            "no_mask": {
                "enabled": True,
                "cooldown_sec": 10,
                "play_motor_sequence": True,
                "sequence_name": "Mask warning motion",
                "trigger_tts": True,
                "tts_message": "กรุณาสวมหน้ากากอนามัย",
                "skip_if_motor_busy": True,
            },
            "improper_mask": {
                "enabled": False,
                "cooldown_sec": 15,
                "play_motor_sequence": False,
                "sequence_name": "Mask warning motion",
                "trigger_tts": True,
                "tts_message": "กรุณาสวมหน้ากากให้ถูกต้อง",
                "skip_if_motor_busy": True,
            },
        },
    }

def load_rules():
    global _rules
    if CONFIG_PATH.exists():
        _rules = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    else:
        _rules = defaults()
        save_rules(_rules)
    return _rules

def save_rules(next_rules):
    next_rules["updated_at"] = now_iso()
    CONFIG_PATH.write_text(json.dumps(next_rules, ensure_ascii=False, indent=2), encoding="utf-8")
    return next_rules

def applied_status(message, detail):
    return {
        "ok": True,
        "message": message,
        "detail": detail,
        "applied_at": now_iso(),
    }

@router.get("/rules")
def get_rules():
    with _lock:
        return _rules or load_rules()

@router.put("/rules")
def put_rules(payload: RulesConfig):
    with _lock:
        next_rules = payload.model_dump()
        # validate trigger keys explicitly
        next_rules["rules"] = {
            "no_mask": next_rules["rules"].get("no_mask", defaults()["rules"]["no_mask"]),
            "improper_mask": next_rules["rules"].get("improper_mask", defaults()["rules"]["improper_mask"]),
        }
        global _rules
        _rules = save_rules(next_rules)
        _rules["apply_status"] = applied_status(
            "Automation rules applied",
            "Runtime is now using the returned automation rules",
        )
        return _rules

@router.post("/rules/reset")
def reset_rules():
    with _lock:
        global _rules
        _rules = save_rules(defaults())
        _rules["apply_status"] = applied_status(
            "Automation rules reset",
            "Runtime restored default automation rules",
        )
        return _rules
```

แล้วผูกเข้ากับ app:

```python
app.include_router(router)
load_rules()
```

## จุดที่ต้องผูกกับ detection pipeline

ในจุดที่รู้ผล detection จริง ให้เรียก helper เช่น:

```python
def on_mask_event(kind: str):
    # kind = "no_mask" หรือ "improper_mask"
    rules = _rules or load_rules()
    # เช็ค enabled/cooldown/motor busy/TTS แล้วค่อยสั่ง action
```

ถ้ามี `log_event()` จาก `docs/pi-event-logs-endpoint.md` แล้ว ให้ log action ทุกครั้ง เช่น:

```python
log_event("info", "mask", "Automation triggered", f"kind={kind}")
```

## ทดสอบ

```bash
curl -s http://localhost:8000/api/automation/rules | python3 -m json.tool
curl -s -X PUT http://localhost:8000/api/automation/rules \
  -H "Content-Type: application/json" \
  --data @automation_rules.json | python3 -m json.tool
curl -s -X POST http://localhost:8000/api/automation/rules/reset | python3 -m json.tool
```

เช็คว่า:
- [ ] GET/PUT/reset คืน schema ตรงตามสัญญา
- [ ] หลัง PUT/reset มี `apply_status.ok: true` และข้อความบอกว่า runtime ใช้ rules ใหม่แล้ว
- [ ] ค่าใหม่ถูก persist หลัง restart server
- [ ] ค่าใหม่ถูกใช้ทันทีใน detection runtime โดยไม่ต้อง restart
- [ ] cooldown กันการ trigger ซ้ำจริง
- [ ] motor busy guard ทำงานจริง
- [ ] endpoint เดิม `/api/status`, `/api/motor/*`, `/api/auth/*` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ใน `src/main/config.ts` ตั้ง:

```ts
useMockAutomation: false
```

แล้วอัปเดต `docs/MOCK_STATUS.md` ให้ตรงกับสถานะจริง
