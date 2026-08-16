# งาน: endpoint ควบคุม Stepper Motor ผ่าน Arduino + CNC Shield + A4988 บน Raspberry Pi

> ⏳ **สถานะ: endpoint ทำบน Pi แล้ว (28 ก.ค. 69) แต่ Arduino ยังไม่ต่อ**
> → แอปยังใช้ **mock** สำหรับหน้า Stepper Control (`useMockMotor: true`) พอต่อ Arduino แล้วสลับเป็น
> `useMockMotor: false` ได้เลย ไม่ต้องแก้ Pi เพิ่ม · ดู [MOCK_STATUS.md](MOCK_STATUS.md)

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## บริบท

- **AERIS** มีแอป desktop (Electron) ที่เพิ่มหน้า **Tools → Stepper Control** แล้ว
- มอเตอร์ไม่ได้ต่อ GPIO ของ Pi ตรง ๆ แต่ต่อผ่าน **Arduino + CNC Shield + A4988**
- ดังนั้นฝั่ง Pi ควรทำหน้าที่เป็น REST backend ใน `server.py` แล้วคุยกับ Arduino ผ่าน USB serial
- ตอนนี้ฝั่ง desktop มี mock แล้ว ถ้าจะขยับมอเตอร์จริงต้องเพิ่ม endpoint ใน `server.py`

## สิ่งที่ต้องทำ

เพิ่ม endpoint 4 ตัว:

```http
GET  /api/motor/status
POST /api/motor/move
POST /api/motor/stop
POST /api/motor/home
```

### ⚠️ ข้อห้าม

- **ห้ามแก้ `/api/status`, `/api/mask-stats`, `/api/auth/*`, `/api/admin/*` ให้พัง**
  เพราะ Dashboard/Auth ใช้อยู่
- **ห้ามให้ endpoint ค้างนาน** — คำสั่ง motor ควรส่งคำสั่งให้ Arduino แล้วตอบกลับเร็ว
- **ห้ามเดาค่า position ถ้า firmware ไม่รายงานจริง** ถ้ายังไม่มี position tracking ให้เริ่มที่ 0
  และระบุไว้ใน `last_command`
- **ต้อง validate ทุกคำสั่งซ้ำบน Pi/Arduino** อย่าพึ่ง validation จาก desktop อย่างเดียว
- ถ้ามี limit switch หรือ emergency stop ให้ฝั่ง Arduino/Pi เป็นคน enforce จริง

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

ทุก endpoint ให้คืนรูปแบบเดียวกัน:

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

TypeScript type ที่ฝั่งแอปใช้:

```ts
type StepperAxis = 'x' | 'y' | 'z'
type StepperDirection = 'cw' | 'ccw'

interface StepperMotorStatus {
  connected: boolean
  axis: StepperAxis
  position_steps: number
  moving: boolean
  last_command: string | null
  updated_at: string
  error?: string
}

interface StepperMoveRequest {
  axis: StepperAxis
  direction: StepperDirection
  steps: number
  speed_sps: number
}

interface StepperHomeRequest {
  axis: StepperAxis
  speed_sps: number
}
```

ชื่อ field ต้องตรงเป๊ะ: `position_steps`, `last_command`, `updated_at`, `speed_sps`

## Request payload

### `POST /api/motor/move`

```json
{
  "axis": "x",
  "direction": "cw",
  "steps": 200,
  "speed_sps": 400
}
```

### `POST /api/motor/home`

```json
{
  "axis": "x",
  "speed_sps": 400
}
```

### `POST /api/motor/stop`

ไม่ต้องมี body

## Arduino serial protocol ที่แนะนำ

เลือก protocol ให้เรียบง่าย อ่านง่าย และตอบกลับชัดเจน เช่น newline-delimited text:

```text
STATUS
MOVE X CW 200 400
HOME X 400
STOP
```

ให้ Arduino ตอบกลับเป็นบรรทัดเดียว เช่น:

```text
OK X POS 200 IDLE
ERR LIMIT_SWITCH
ERR BAD_COMMAND
```

ฝั่ง Pi แปลง response เหล่านี้เป็น JSON ตาม contract ด้านบน

> ถ้า Arduino firmware มี protocol อยู่แล้ว ใช้ของเดิมได้ แต่ Pi ต้องแปลงให้ endpoint
> ตอบ JSON ตามสัญญาเดิมเสมอ

## ตัวอย่าง FastAPI router ฝั่ง Pi

ติดตั้ง dependency:

```bash
pip install pyserial
```

ตัวอย่างนี้เป็น skeleton สำหรับ `server.py` หรือแยกเป็นไฟล์ router แล้ว `include_router()`:

```python
import datetime as dt
import threading
import serial
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/motor")

SERIAL_PORT = "/dev/ttyACM0"  # เช็คจริงด้วย ls /dev/ttyACM* /dev/ttyUSB*
BAUD = 115200

_lock = threading.Lock()
_ser = None
_position_steps = 0
_axis = "x"
_moving = False
_last_command = None
_last_error = None

class MoveRequest(BaseModel):
    axis: str = Field(pattern="^(x|y|z)$")
    direction: str = Field(pattern="^(cw|ccw)$")
    steps: int = Field(gt=0, le=200000)
    speed_sps: int = Field(gt=0, le=4000)

class HomeRequest(BaseModel):
    axis: str = Field(pattern="^(x|y|z)$")
    speed_sps: int = Field(gt=0, le=4000)

def _now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def _connect():
    global _ser
    if _ser and _ser.is_open:
        return _ser
    _ser = serial.Serial(SERIAL_PORT, BAUD, timeout=1, write_timeout=1)
    return _ser

def _send(line: str) -> str:
    ser = _connect()
    ser.write((line + "\n").encode("utf-8"))
    ser.flush()
    reply = ser.readline().decode("utf-8", errors="replace").strip()
    if not reply:
        raise RuntimeError("Arduino did not reply")
    if reply.startswith("ERR"):
        raise RuntimeError(reply)
    return reply

def _status():
    connected = bool(_ser and _ser.is_open)
    out = {
        "connected": connected,
        "axis": _axis,
        "position_steps": _position_steps,
        "moving": _moving,
        "last_command": _last_command,
        "updated_at": _now_iso(),
    }
    if _last_error:
        out["error"] = _last_error
    return out

@router.get("/status")
def motor_status():
    try:
        _connect()
    except Exception:
        pass
    return _status()

@router.post("/move")
def motor_move(req: MoveRequest):
    global _position_steps, _axis, _moving, _last_command, _last_error
    cmd = f"MOVE {req.axis.upper()} {req.direction.upper()} {req.steps} {req.speed_sps}"
    with _lock:
        try:
            _moving = True
            _axis = req.axis
            _send(cmd)
            _position_steps += req.steps if req.direction == "cw" else -req.steps
            _last_command = f"{req.axis.upper()} {req.direction} {req.steps} steps @ {req.speed_sps} sps"
            _last_error = None
            return _status()
        except Exception as e:
            _last_error = str(e)
            raise HTTPException(status_code=503, detail=_last_error)
        finally:
            _moving = False

@router.post("/stop")
def motor_stop():
    global _moving, _last_command, _last_error
    with _lock:
        try:
            _send("STOP")
            _moving = False
            _last_command = "STOP"
            _last_error = None
            return _status()
        except Exception as e:
            _last_error = str(e)
            raise HTTPException(status_code=503, detail=_last_error)

@router.post("/home")
def motor_home(req: HomeRequest):
    global _position_steps, _axis, _moving, _last_command, _last_error
    cmd = f"HOME {req.axis.upper()} {req.speed_sps}"
    with _lock:
        try:
            _moving = True
            _axis = req.axis
            _send(cmd)
            _position_steps = 0
            _last_command = f"{req.axis.upper()} HOME @ {req.speed_sps} sps"
            _last_error = None
            return _status()
        except Exception as e:
            _last_error = str(e)
            raise HTTPException(status_code=503, detail=_last_error)
        finally:
            _moving = False
```

แล้วผูกเข้ากับ FastAPI app ที่มีอยู่:

```python
app.include_router(router)
```

## หมายเหตุสำคัญเรื่อง motion จริง

ตัวอย่างด้านบนถือว่า Arduino ทำงานแบบ blocking แล้วตอบ `OK` เมื่อ move เสร็จ

ถ้า move ยาวมาก แนะนำให้ปรับเป็น non-blocking:

- Pi ส่งคำสั่งให้ Arduino แล้วตอบ `moving: true` ทันที
- `GET /api/motor/status` ถาม Arduino ว่ายังขยับอยู่ไหม
- `POST /api/motor/stop` ต้อง interrupt motion ได้ทันที

ฝั่ง desktop รองรับ `moving` ใน status อยู่แล้ว

## Motor target mapping ในหน้า desktop

หน้า **Tools → Stepper Control** แสดงปุ่มเลือก motor เป็นภาษาคน:

| ปุ่มในแอป | axis ที่ส่งไป Pi | ความหมายที่ตั้งไว้ตอนนี้ |
|---|---|---|
| `คอ` | `x` | motor คอ / หัว |
| `แขนซ้าย` | `y` | motor แขนซ้าย |
| `แขนขวา` | `z` | motor แขนขวา |

ถ้า wiring จริงของ CNC Shield ไม่ตรง mapping นี้ ให้แก้ mapping ให้ตรงกันทั้งฝั่ง desktop
และ firmware/ฝั่ง Pi อย่าสลับแค่ฝั่งเดียว

## Teach & Playback สำหรับท่าเตือน

เป้าหมายคือจูนท่าทางแบบ teach pendant:

1. Jog เฉพาะ motor ที่ต้องการ เช่น `คอ`
2. ขยับไปจุดปลอดภัย A แล้วกด save
3. ขยับไปจุดปลอดภัย B แล้วกด save
4. กด play sequence เพื่อให้หุ่นวิ่งตาม waypoint ที่เซฟไว้
5. ตอน automation เจอคนไม่ใส่แมส ให้ Pi เล่น sequence ที่จูนไว้ ไม่ต้อง hardcode ท่าทางใน desktop

เพิ่ม endpoint อีก 2 ตัวใน `server.py`:

```http
POST /api/motor/teach-points
POST /api/motor/sequences/play
```

และแนะนำให้ `GET /api/motor/status` ส่ง `positions` หลายแกนเพิ่มด้วย:

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

`position_steps` ยังมีไว้เพื่อ compatibility แต่ของใหม่ให้ใช้ `positions`

### สัญญาข้อมูล waypoint

```json
{
  "id": "pt-a",
  "name": "Point A",
  "positions": { "x": 0, "y": 1200, "z": -300 },
  "speed_sps": 400,
  "dwell_ms": 300
}
```

TypeScript type อ้างอิง:

```ts
interface StepperTeachPoint {
  id: string
  name: string
  positions: { x: number; y: number; z: number }
  speed_sps: number
  dwell_ms: number
}

interface StepperSequenceRequest {
  name: string
  points: StepperTeachPoint[]
  repeat: number
}
```

### `POST /api/motor/teach-points`

request:

```json
{
  "id": "pt-a",
  "name": "Point A",
  "positions": { "x": 0, "y": 1200, "z": -300 },
  "speed_sps": 400,
  "dwell_ms": 300
}
```

response: คืน waypoint ที่บันทึกแล้วรูปแบบเดิม

แนะนำให้ persist ลง SQLite หรือ JSON file เช่น `aeris_motion.json` เพื่อ reboot แล้วไม่หาย

### `POST /api/motor/sequences/play`

request:

```json
{
  "name": "Mask warning motion",
  "repeat": 2,
  "points": [
    {
      "id": "pt-a",
      "name": "Point A",
      "positions": { "x": 0, "y": 0, "z": 0 },
      "speed_sps": 300,
      "dwell_ms": 150
    },
    {
      "id": "pt-b",
      "name": "Point B",
      "positions": { "x": 500, "y": 0, "z": 0 },
      "speed_sps": 300,
      "dwell_ms": 150
    }
  ]
}
```

response: คืน `StepperMotorStatus` ตาม contract เดิม โดย `positions` ควรตรงกับจุดสุดท้ายหลังเล่นจบ

### วิธีคิด motion ระหว่างจุด

สำหรับ teach/playback แนะนำใช้ **absolute position**:

- Home ก่อนเริ่มใช้งานเพื่อกำหนดศูนย์
- Jog ไปตำแหน่งที่ปลอดภัย
- Save waypoint เป็น `{x,y,z}`
- Playback ไปตามตำแหน่ง absolute

ตัวอย่าง serial protocol ที่ Arduino firmware อาจรับ:

```text
GOTO 500 0 0 300
WAIT 150
GOTO 0 0 0 300
WAIT 150
```

Pi เป็นคนแปลง waypoint เป็นคำสั่ง serial ให้ Arduino

### ตัวอย่าง FastAPI model สำหรับ teach/playback

```python
from typing import Literal
from pydantic import BaseModel, Field

Axis = Literal["x", "y", "z"]

class Positions(BaseModel):
    x: int
    y: int
    z: int

class TeachPoint(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    positions: Positions
    speed_sps: int = Field(gt=0, le=4000)
    dwell_ms: int = Field(ge=0, le=10000)

class SequenceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    points: list[TeachPoint] = Field(min_length=2, max_length=50)
    repeat: int = Field(ge=1, le=20)
```

### Automation ตอนเจอคนไม่ใส่แมส

แนะนำให้ runtime automation อยู่ฝั่ง Pi:

1. detection pipeline เจอ `no_mask`
2. debounce/cooldown เช่น ไม่เล่นซ้ำถี่กว่า 5 วินาที
3. เรียก sequence ที่เซฟไว้ เช่น `Mask warning motion`
4. ถ้า motor กำลัง moving อยู่ ให้ skip หรือ queue ตามที่เลือก

```python
last_warning_at = 0

def on_mask_detection(result: str):
    global last_warning_at
    if result != "no_mask":
        return
    now = time.monotonic()
    if now - last_warning_at < 5:
        return
    last_warning_at = now
    play_saved_sequence("Mask warning motion")
```

## เช็ค serial port บน Pi

```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
dmesg | grep -E "ttyACM|ttyUSB" | tail -20
```

ถ้า permission denied:

```bash
sudo usermod -aG dialout $USER
sudo reboot
```

## ทดสอบ endpoint

```bash
curl -s http://localhost:8000/api/motor/status | python3 -m json.tool
```

```bash
curl -s -X POST http://localhost:8000/api/motor/move \
  -H "Content-Type: application/json" \
  -d '{"axis":"x","direction":"cw","steps":200,"speed_sps":400}' \
  | python3 -m json.tool
```

```bash
curl -s -X POST http://localhost:8000/api/motor/home \
  -H "Content-Type: application/json" \
  -d '{"axis":"x","speed_sps":400}' \
  | python3 -m json.tool
```

```bash
curl -s -X POST http://localhost:8000/api/motor/stop | python3 -m json.tool
```

เช็คว่า:

- [ ] ทุก endpoint คืน JSON ตาม contract ครบทุกฟิลด์
- [ ] `axis` เป็น `x`, `y`, หรือ `z` เท่านั้น
- [ ] `direction` เป็น `cw` หรือ `ccw` เท่านั้น
- [ ] ค่าผิด เช่น `steps: 0`, `speed_sps: 999999` โดน reject
- [ ] ถอด Arduino แล้ว endpoint ไม่ทำให้ server ล่ม
- [ ] `POST /api/motor/stop` หยุดมอเตอร์ได้จริง
- [ ] `/api/status`, `/api/mask-stats`, `/api/auth/login` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ในโปรเจกต์แอป desktop เปิด `src/main/config.ts`:

```ts
useMockApi: false
piBaseUrl: 'http://<IP-ของ-Pi>:8000'
```

จากนั้น login เป็น admin แล้วเปิด **Tools → Stepper Control**

## ความปลอดภัยของ A4988 / CNC Shield

- ตั้ง current limit ของ A4988 ก่อนทดสอบจริง
- เริ่ม speed ต่ำ ๆ เช่น `200–400 speed_sps`
- ถ้ามอเตอร์สั่น ไม่หมุน หรือ driver ร้อน ให้หยุดและเช็ค wiring/current/microstep
- ควรมี emergency stop หรืออย่างน้อย `STOP` command ที่ firmware รับได้ตลอด
- ถ้ามี limit switch ให้ Arduino enforce เอง อย่ารอให้ desktop เป็นคนตัดสินใจ
