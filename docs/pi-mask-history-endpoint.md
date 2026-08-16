# งาน: endpoint ประวัติการสวมหน้ากาก (รายช่วงเวลา) บน Raspberry Pi

> ✅ **สถานะ: ทำบน Pi แล้ว (28 ก.ค. 69)** — แอปดึงกราฟ mask compliance จริงผ่าน `useMockApi: false`

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย

## บริบท

- Pi รัน `server.py` (FastAPI) เป็น backend ของหุ่นยนต์ AERIS (ตรวจ PM2.5 + การสวมหน้ากาก)
- หน้า **Graphs** ในแอป desktop มีกราฟ **แนวโน้ม % การสวมหน้ากากตามเวลา** (1ชม. / 6ชม. /
  24ชม. / 7วัน / 30วัน) — ต้องการข้อมูลรายช่วง (bucket) ไม่ใช่ยอดรวมก้อนเดียว
- ตอนนี้กราฟกินข้อมูล **mock** (`useMockApi: true`)

## ต่างจาก `/api/mask-stats` ที่มีอยู่ยังไง

- `GET /api/mask-stats?hours=N` (มีอยู่แล้ว) → คืน **ยอดรวมก้อนเดียว** ของทั้งช่วง
- `GET /api/mask-history?hours=N` (อันนี้) → คืน **array แบ่งเป็นช่วงย่อย** เพื่อวาดเส้นแนวโน้ม

ถ้าโค้ดที่นับ mask/no_mask/improper อยู่แล้วบันทึกลง DB พร้อม timestamp เราแค่ query
แบ่งเป็นช่วงย่อยก็ได้ (ดูขั้นที่ 1)

## ⚠️ ขั้นที่ 1 — เช็คว่ามีข้อมูลดิบให้ bucket ไหม

```bash
sqlite3 aeris_data.db ".tables"
sqlite3 aeris_data.db ".schema"     # หาตารางที่ log การตรวจจับ + เวลา + ผล (mask/no_mask/improper)
```

- **มี log ราย event พร้อม timestamp** → group ตามช่วงเวลาแล้วนับ (ขั้นที่ 2)
- **มีแต่ counter รวม ไม่ได้ log ย้อนหลัง** → ต้องเริ่มบันทึกก่อน (เก็บ event ลงตาราง
  แล้วค่อยมีข้อมูลให้ bucket ในภายหลัง)

## สัญญาข้อมูล (ฝั่งแอปรออยู่แบบนี้)

```
GET /api/mask-history?hours=N
```

คืน **array เรียงเก่า → ใหม่** แต่ละตัวคือ 1 ช่วงเวลา:

```json
[
  { "t": "2026-07-27T09:00:00Z", "total": 40, "mask": 33, "no_mask": 5, "improper": 2 },
  { "t": "2026-07-27T11:00:00Z", "total": 38, "mask": 30, "no_mask": 6, "improper": 2 }
]
```

| ฟิลด์ | ชนิด | หมายเหตุ |
|---|---|---|
| `t` | string | ISO 8601 — เวลากลางช่วง (หรือต้นช่วงก็ได้ ขอให้สม่ำเสมอ) |
| `total` | number | = mask + no_mask + improper |
| `mask` | number | ใส่หน้ากากถูกต้อง |
| `no_mask` | number | ไม่ใส่ |
| `improper` | number | ใส่ไม่ถูกต้อง |

- เรียงเก่า→ใหม่
- จำนวน bucket ~60–100 ช่วงกำลังดี (แอปเลือกความถี่ให้เหมาะแต่ละช่วงอยู่แล้ว):
  1ชม.→ทุกนาที, 24ชม.→ทุก 15 นาที, 30วัน→ทุก ~8 ชม.
- bucket ที่ไม่มีการตรวจจับ ส่ง `total: 0` ได้ (แอปคิด compliance = 0 ให้ช่วงนั้น)
- array ว่าง `[]` ได้ — แอปจะขึ้น "ไม่มีข้อมูล"

## ขั้นที่ 2 — ตัวอย่าง endpoint

สมมติมีตาราง log ราย event: `mask_log(ts TEXT, result TEXT)` โดย `result ∈ {mask, no_mask, improper}`

```python
import sqlite3, datetime as dt
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api")

@router.get("/mask-history")
def mask_history(hours: float = Query(default=24, gt=0, le=720)):
    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(hours=hours)
    buckets = 96 if hours <= 24 else 90          # ~ให้พอดีกับที่แอปคาดหวัง
    step = (hours * 3600) / buckets              # วินาทีต่อ 1 ช่วง

    conn = sqlite3.connect("aeris_data.db")
    rows = conn.execute(
        "SELECT ts, result FROM mask_log WHERE ts >= ?", (since.isoformat(),)
    ).fetchall()
    conn.close()

    out = []
    for i in range(buckets):
        b_start = since + dt.timedelta(seconds=i * step)
        b_end = since + dt.timedelta(seconds=(i + 1) * step)
        seg = [r for ts, r in rows if b_start.isoformat() <= ts < b_end.isoformat()]
        out.append({
            "t": (b_start + (b_end - b_start) / 2).isoformat(),
            "total": len(seg),
            "mask": sum(1 for r in seg if r == "mask"),
            "no_mask": sum(1 for r in seg if r == "no_mask"),
            "improper": sum(1 for r in seg if r == "improper"),
        })
    return out
```

> ถ้าข้อมูลเยอะ ให้ group ใน SQL ด้วย `strftime`/bucket key จะเร็วกว่าลูปใน Python
> (ตัวอย่างข้างบนเน้นอ่านง่าย)

## ข้อห้าม

- **ห้ามแก้ `/api/status` และ `/api/mask-stats` ให้พัง** — Dashboard ใช้อยู่
- **ห้ามแตะ `state.mask_on` / `state.mask_off`** (ค่า hardcode ปลอม) — ใช้ผลจาก log จริง

## ทดสอบ

```bash
curl -s "http://localhost:8000/api/mask-history?hours=24" | python3 -m json.tool | head -40
```
- [ ] เป็น array `{t,total,mask,no_mask,improper}` เรียงเก่า→ใหม่
- [ ] `total == mask + no_mask + improper` ทุก bucket
- [ ] เปลี่ยน `hours` แล้วช่วงเวลาขยับตาม
- [ ] `/api/mask-stats` และ `/api/status` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ตั้ง `useMockApi: false` ใน `src/main/config.ts` แล้วเปิดหน้า Graphs — เส้นแนวโน้ม
compliance จะดึงค่าจริง (ดู endpoint คู่กันที่ [pi-pm-history-endpoint.md](pi-pm-history-endpoint.md))
