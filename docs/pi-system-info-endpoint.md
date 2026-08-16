# งาน: เพิ่ม endpoint `/api/system/info` ใน server.py (บน Raspberry Pi 5)

> ✅ **สถานะ: ทำบน Pi แล้ว (28 ก.ค. 69)** — แอปดึงค่าจริง (CPU/RAM/Hailo) ผ่าน `useMockApi: false`

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## บริบท

- **AERIS** = หุ่นยนต์ตรวจ PM2.5 + การสวมหน้ากาก ทำงานบน Raspberry Pi 5 มี `server.py`
  (FastAPI) เป็น backend และมี **AI HAT+ (Hailo-8L)** ต่ออยู่
- มีแอป desktop (Electron) เรียก API ตัวนี้ ตอนนี้แอปมีการ์ด **"INFO Load & Temp"**
  ที่รอข้อมูลจาก endpoint นี้อยู่ — **ฝั่งแอปเขียนเสร็จแล้ว รอแค่ฝั่ง Pi**
- ระหว่างที่ยังไม่มี endpoint นี้ แอปใช้ข้อมูลปลอม (mock) ไปก่อน

## สิ่งที่ต้องทำ

เพิ่ม endpoint เดียว: **`GET /api/system/info`** ที่คืน JSON ตามสัญญาด้านล่าง

### ⚠️ ข้อห้าม

- **ห้ามแก้หรือทำ `GET /api/status` พัง** — แอปหน้า Dashboard ใช้อยู่ และ schema ของมันคือ
  top-level keys: `official_stats, state, history, mode, screen, pm_trend, nodes_status`
- **ห้ามแตะ `state.mask_on` / `state.mask_off`** (เป็นค่า hardcode ปลอมค้างที่ 50/10)
- endpoint นี้**ถูก poll ทุก 5 วินาที** → อย่าใส่งานหนักหรือ blocking call นาน ๆ

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

```
GET /api/system/info
```

```json
{
  "cpu_temp_c": 52.4,
  "cpu_usage_pct": 24,

  "mem_usage_pct": 32,
  "mem_used_mb": 2600,
  "mem_total_mb": 8192,

  "hailo_present": true,
  "hailo_temp_c": 47.0,
  "hailo_usage_pct": 35,

  "ambient_temp_c": null,
  "humidity_pct": null
}
```

TypeScript type ที่ฝั่งแอปใช้ (ยกมาให้ดูเป็นสัญญาอ้างอิง — **ชื่อฟิลด์ต้องตรงเป๊ะ**):

```ts
interface SystemInfo {
  cpu_temp_c: number          // อุณหภูมิ SoC (°C)
  cpu_usage_pct: number       // 0–100

  mem_usage_pct: number       // 0–100
  mem_used_mb: number
  mem_total_mb: number

  hailo_present: boolean      // ตรวจไม่พบการ์ด → false
  hailo_temp_c: number | null // อ่านไม่ได้ → null
  hailo_usage_pct: number | null // 0–100, อ่านไม่ได้ → null

  ambient_temp_c: number | null  // ยังไม่มีเซนเซอร์ → null
  humidity_pct: number | null    // ยังไม่มีเซนเซอร์ → null
}
```

**ฟิลด์ที่เป็น `| null` ส่ง `null` มาได้เลยถ้าอ่านไม่ได้** — แอปจะโชว์ `—` ให้เองโดยไม่พัง
ห้ามส่ง `0` แทน null (มันจะดูเหมือนค่าจริง)

> สถานะปัจจุบันของฮาร์ดแวร์: **ยังไม่มีเซนเซอร์วัดอุณหภูมิ/ความชื้นต่ออยู่**
> → `ambient_temp_c` กับ `humidity_pct` ให้ส่ง `null` ไปก่อนได้เลย

## ส่วนที่ทำได้แน่นอน: CPU + RAM

```bash
pip install psutil
```

```python
import psutil
from fastapi import APIRouter

router = APIRouter(prefix="/api/system")

def _cpu_temp_c() -> float:
    # ค่าที่อ่านได้เป็นหน่วยพันเท่า เช่น 52413 = 52.413 °C
    with open("/sys/class/thermal/thermal_zone0/temp") as f:
        return round(int(f.read().strip()) / 1000, 1)

@router.get("/info")
def system_info() -> dict:
    mem = psutil.virtual_memory()
    hailo = _read_hailo()          # ดูหัวข้อถัดไป
    return {
        "cpu_temp_c": _cpu_temp_c(),
        "cpu_usage_pct": round(psutil.cpu_percent(interval=0.1)),

        "mem_usage_pct": round(mem.percent),
        "mem_used_mb": round(mem.used / 1024 / 1024),
        "mem_total_mb": round(mem.total / 1024 / 1024),

        "hailo_present": hailo["present"],
        "hailo_temp_c": hailo["temp_c"],
        "hailo_usage_pct": hailo["usage_pct"],

        # ยังไม่มีเซนเซอร์ต่ออยู่
        "ambient_temp_c": None,
        "humidity_pct": None,
    }
```

แล้วผูกเข้ากับ app ที่มีอยู่:

```python
app.include_router(router)
```

## ส่วนที่ต้องสำรวจเองบนเครื่อง: AI HAT+ (Hailo-8L) ⚠️

**อันนี้ยังไม่ได้ยืนยันกับเครื่องจริง** — คำสั่งของ HailoRT ต่างกันตามเวอร์ชันที่ติดตั้ง
ให้ไล่เช็คก่อนแล้วค่อยเลือกวิธี:

```bash
# 1) การ์ดอยู่บน PCIe จริงไหม
lspci | grep -i hailo

# 2) HailoRT CLI มีคำสั่งอะไรบ้างในเวอร์ชันนี้
hailortcli --help
hailortcli fw-control identify        # ปกติใช้ยืนยันว่าเจอ device

# 3) มี hwmon node ของ Hailo โผล่มาไหม (อ่านอุณหภูมิได้ตรง ๆ ถ้ามี)
for d in /sys/class/hwmon/hwmon*; do echo "$d: $(cat $d/name 2>/dev/null)"; done

# 4) driver โหลดอยู่ไหม
lsmod | grep -i hailo
dmesg | grep -i hailo | tail -20
```

เป้าหมายคือเขียนฟังก์ชันนี้ให้ได้:

```python
def _read_hailo() -> dict:
    """คืน {"present": bool, "temp_c": float|None, "usage_pct": int|None}"""
    ...
```

แนวทาง:
- **`present`** — ง่ายสุดคือเช็ค `lspci` เจอ Hailo หรือ `hailortcli fw-control identify`
  คืน exit code 0
- **`temp_c`** — ถ้ามี hwmon node ให้อ่านจาก `/sys/class/hwmon/hwmonX/temp1_input`
  (หน่วยพันเท่าเหมือน CPU) ถ้าไม่มีลองหาใน `hailortcli`
- **`usage_pct`** — บาง HailoRT มี `hailortcli monitor` ถ้าหาไม่เจอ **ส่ง `None` ไปก่อน
  ได้เลย** อย่าฝืนเดา

**สำคัญ:** ถ้าเรียก CLI ด้วย `subprocess` ต้องใส่ `timeout` และ `try/except` ครอบเสมอ
เพราะ endpoint นี้ถูก poll ทุก 5 วินาที — ห้ามค้าง และห้าม throw ออกไปทั้ง endpoint
(ค่าอ่านไม่ได้ = ส่ง `None` ไม่ใช่ error 500)

## ทดสอบ

```bash
curl -s http://localhost:8000/api/system/info | python3 -m json.tool
```

เช็คว่า:
- [ ] มีครบทุกฟิลด์ ชื่อตรงเป๊ะตามสัญญาด้านบน
- [ ] ตัวเลข CPU/RAM ขยับจริงเมื่อโหลดเครื่อง (ลอง `stress-ng` หรือเปิดงานหนัก ๆ)
- [ ] ตอบกลับเร็ว (< 1 วินาที) เพราะโดน poll ทุก 5 วิ
- [ ] เรียกรัว ๆ 20 ครั้งแล้วไม่มี error / ไม่ค้าง
- [ ] **`GET /api/status` ยังทำงานปกติเหมือนเดิม**

## หลังทำเสร็จ (ฝั่ง desktop — ไม่ต้องทำบน Pi)

ในโปรเจกต์แอป desktop เปิดไฟล์ `src/main/config.ts` แล้วตั้ง `useMockApi: false`
พร้อมเช็คว่า `piBaseUrl` ชี้มาที่ IP ของ Pi ถูกต้อง (ดูด้วย `hostname -I` บน Pi)

## เผื่อขยายทีหลัง

ค่าที่น่าเพิ่ม: disk usage, uptime, สถานะ throttling (`vcgencmd get_throttled`),
อุณหภูมิ NVMe — เพิ่มฟิลด์ใน JSON แล้วบอกฝั่ง desktop ให้เพิ่ม `<Metric>` ในการ์ด
