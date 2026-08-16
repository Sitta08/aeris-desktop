# งาน: เพิ่มชื่อ-นามสกุลผู้ใช้ใน server.py (บน Raspberry Pi)

> ✅ **สถานะ: ทำบน Pi แล้ว (28 ก.ค. 69)** — signup/login รองรับชื่อ + เติมชื่อบัญชีเจ้าของแล้ว

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย

## บริบท

- Pi รัน `server.py` (FastAPI) มีโมดูล `aeris_auth.py` (merge แล้ว) จัดการ login/สมัคร/อนุมัติ
  เก็บผู้ใช้ในตาราง `users` ใน `aeris_data.db`
- แอป desktop เพิ่มฟีเจอร์ **ชื่อ-นามสกุล**: กรอก**ตอนสมัครครั้งเดียว** แล้วเอาไปแสดงเป็น
  "ผู้จัดทำ" ในรายงาน PDF (ไม่มีการแก้ชื่อในแอป — ตั้งใจให้เรียบง่าย)
- **ฝั่งแอปทำเสร็จแล้ว** ส่ง/รอรับ field พวกนี้อยู่ — รอฝั่ง Pi รองรับ

## สิ่งที่ต้องทำ (3 จุด)

### 1. เพิ่มคอลัมน์ใน `users`

```sql
ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_name  TEXT NOT NULL DEFAULT '';
```

บัญชีเดิมจะได้ค่าว่าง `''` (ไม่ต้องลบ/สมัครใหม่) — ดูขั้นที่ 3 เรื่องการเติมชื่อให้บัญชีเจ้าของ

> ถ้า `init_auth()` สร้างตารางด้วย `CREATE TABLE IF NOT EXISTS` อยู่ ให้เพิ่ม 2 คอลัมน์นี้
> ใน schema ด้วย และรัน ALTER ข้างบนกับ DB ตัวที่มีข้อมูลแล้ว

### 2. รับ + คืน ชื่อ (2 endpoint) — ฟิลด์ wire เป็น snake_case

**`POST /api/auth/signup`** — รับเพิ่ม `first_name`, `last_name` แล้วบันทึกลง DB

```python
class Credentials(BaseModel):
    username: str
    password: str
    first_name: str = ""      # เพิ่ม
    last_name: str = ""       # เพิ่ม

# ตอน INSERT ผู้ใช้ใหม่ ให้บันทึก body.first_name / body.last_name ด้วย
```

**`POST /api/auth/login`** — response เพิ่ม `first_name`, `last_name`

```python
# เดิม: { "token": ..., "role": ... }
return {
    "token": token,
    "role": user["role"],
    "first_name": user["first_name"],   # เพิ่ม
    "last_name": user["last_name"],     # เพิ่ม
}
```

> ไม่ต้องทำ endpoint แก้ชื่อ — แอปไม่มีปุ่มแก้ชื่อแล้ว

### 3. เติมชื่อให้บัญชีเจ้าของโปรเจกต์ (ทำครั้งเดียว)

บัญชี admin/เจ้าของถูกสร้างไว้ก่อนมีฟิลด์ชื่อ ตอนนี้ชื่อจึงว่าง ให้เติมให้ด้วย:

**เจ้าของโปรเจกต์: ชื่อ `นายสิทธา` นามสกุล `นรานุต`** (บัญชี username ขึ้นต้นด้วย `Sittx`)

```sql
-- 1) ยืนยันก่อนว่าเป็นบัญชีไหน (ดู username ให้ชัด — ในแอปแสดงเป็น "Sittx-")
SELECT id, username, role FROM users ORDER BY id;

-- 2) เติมชื่อ — แก้ค่า username ให้ตรงกับที่เห็นในขั้นที่ 1
UPDATE users
   SET first_name = 'นายสิทธา', last_name = 'นรานุต'
 WHERE username = 'ใส่_username_ที่เห็น';
```

> ถ้าไม่แน่ใจ username แต่มั่นใจว่าเป็นบัญชี admin แรกสุด ใช้แบบนี้แทนได้:
> ```sql
> UPDATE users SET first_name = 'นายสิทธา', last_name = 'นรานุต'
>  WHERE id = (SELECT MIN(id) FROM users WHERE role = 'admin');
> ```
> ตรวจว่าโดน 1 แถวด้วย `SELECT changes();` (ควรได้ 1)

## ข้อห้าม

- **ห้ามทำ `/api/auth/login` เดิมพัง** — แค่ **เพิ่ม** field (ของเดิมอยู่ครบ)
- อย่าไปยุ่ง role ของบัญชีเจ้าของตอนเติมชื่อ (แก้แค่ first_name/last_name)

## ทดสอบ

```bash
# สมัครพร้อมชื่อ
curl -s -X POST http://localhost:8000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"test1","password":"secret123","first_name":"สมชาย","last_name":"ใจดี"}'

# login → ต้องเห็น first_name/last_name กลับมา
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test1","password":"secret123"}'
```

Checklist:
- [ ] `users` มีคอลัมน์ `first_name`, `last_name`
- [ ] signup บันทึกชื่อ, login คืนชื่อ
- [ ] บัญชีเจ้าของ (Sittx…) มีชื่อ `นายสิทธา นรานุต` แล้ว
- [ ] บัญชีเดิมอื่น ๆ login ได้ปกติ (ชื่อว่างได้ ไม่พัง)

## ฝั่ง desktop — ไม่ต้องทำอะไรเพิ่ม

หน้าสมัครมีช่องชื่อ/นามสกุลแล้ว, หน้า Settings โชว์ชื่อแบบอ่านอย่างเดียว, รายงาน PDF ใช้ชื่อนี้
เป็น "ผู้จัดทำ" (ถ้าชื่อว่าง fallback เป็น username)
