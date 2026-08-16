# งาน: ตรวจ (และตั้ง) `AERIS_JWT_SECRET` บน Raspberry Pi

> ✅ **สถานะ: ตรวจแล้ว (28 ก.ค. 69)** — เป็นคีย์สุ่มของจริง เรียบร้อย

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย
>
> **ลักษณะงาน: เช็คก่อน ถ้าตั้งไว้ถูกแล้วไม่ต้องทำอะไร** ถ้ายังไม่ได้ตั้งค่อยแก้

## บริบท

- Pi รัน `server.py` (FastAPI) โดยมีโมดูล `aeris_auth.py` merge เข้าไปแล้ว
  ทำหน้าที่ login / สมัครสมาชิก / อนุมัติผู้ใช้
- โมดูลนั้นเซ็น **JWT** ด้วยคีย์จาก environment variable `AERIS_JWT_SECRET`
- ในโค้ดมี fallback แบบนี้:

  ```python
  JWT_SECRET = os.environ.get("AERIS_JWT_SECRET", "dev-insecure-change-me")
  ```

- **ถ้า env ไม่ถูกตั้ง โปรแกรมจะใช้คีย์ `dev-insecure-change-me` ที่เขียนอยู่ในไฟล์**
  ใครที่เห็นซอร์ส (หรือเดาได้) สามารถ **ปลอม token เป็น admin ได้เลยโดยไม่ต้องรู้รหัสผ่าน**
  → ต้องแน่ใจว่าใช้คีย์สุ่มของจริง

---

## ขั้นที่ 1 — ตรวจก่อนว่าตั้งไว้หรือยัง

⚠️ ต้องเช็คที่ **process ที่รัน server.py อยู่จริง** ไม่ใช่แค่ shell ปัจจุบัน
(export ใน shell ไม่ได้แปลว่า service เห็นด้วย)

```bash
# 1) หา PID ของ server.py
pgrep -af "server.py"

# 2) อ่าน environment ของ process นั้น (แทน <PID> ด้วยเลขที่ได้)
sudo tr '\0' '\n' < /proc/<PID>/environ | grep AERIS_JWT_SECRET
```

**ตีความผลลัพธ์:**

| ผลลัพธ์ | แปลว่า | ต้องทำอะไร |
|---|---|---|
| เจอบรรทัด `AERIS_JWT_SECRET=` ตามด้วยสตริงสุ่มยาว ๆ | ✅ ตั้งไว้ถูกแล้ว | **จบ ไม่ต้องทำอะไรต่อ** |
| ไม่เจออะไรเลย | ❌ กำลังใช้คีย์ dev | ทำขั้นที่ 2–4 |
| เจอแต่ค่าเป็น `dev-insecure-change-me` หรือค่าสั้น ๆ เดาง่าย | ❌ ไม่ปลอดภัย | ทำขั้นที่ 2–4 |

ตรวจเพิ่มว่าโค้ดยังใช้ fallback ตัวนี้อยู่จริงไหม:

```bash
grep -rn "AERIS_JWT_SECRET" /path/to/aeris_auth.py
```

---

## ขั้นที่ 2 — สร้างคีย์สุ่ม

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```

เก็บค่าที่ได้ไว้ จะใช้ในขั้นถัดไป (**และควรสำรองไว้ที่ปลอดภัยด้วย** — ถ้าทำหาย
แล้วต้องตั้งใหม่ ผู้ใช้ทุกคนจะถูกเตะออกจากระบบอีกรอบ)

---

## ขั้นที่ 3 — ตั้งค่าให้อยู่ถาวร

ก่อนอื่นดูว่า `server.py` ถูกรันด้วยวิธีไหน:

```bash
systemctl list-units --type=service | grep -i aeris
ps aux | grep -i server.py
```

### กรณี A — รันด้วย systemd (พบมากสุด)

**อย่าใส่คีย์ตรง ๆ ใน unit file** เพราะไฟล์ใน `/etc/systemd/system/` ปกติอ่านได้ทุกคน
(`systemctl cat` ก็เห็น) → ให้แยกเป็นไฟล์ env ที่จำกัดสิทธิ์แทน:

```bash
sudo mkdir -p /etc/aeris
echo "AERIS_JWT_SECRET=<คีย์ที่ได้จากขั้นที่ 2>" | sudo tee /etc/aeris/aeris.env > /dev/null
sudo chmod 600 /etc/aeris/aeris.env
sudo chown root:root /etc/aeris/aeris.env
```

แล้วเพิ่มบรรทัดนี้ในส่วน `[Service]` ของ unit file:

```ini
[Service]
EnvironmentFile=/etc/aeris/aeris.env
```

จากนั้น:

```bash
sudo systemctl daemon-reload
sudo systemctl restart <ชื่อ-service>
```

### กรณี B — รันมือ / tmux / screen / สคริปต์ start

ใส่ในสคริปต์ที่ใช้สตาร์ท **ก่อน**บรรทัดที่เรียก python:

```bash
export AERIS_JWT_SECRET="<คีย์ที่ได้จากขั้นที่ 2>"
python3 server.py
```

> ระวัง: `export` ใน shell เฉย ๆ **หายเมื่อ reboot หรือปิด terminal**
> ต้องอยู่ในสคริปต์/unit ที่ใช้สตาร์ทจริงเท่านั้น

### กรณี C — Docker / docker compose

```yaml
services:
  aeris:
    environment:
      - AERIS_JWT_SECRET=${AERIS_JWT_SECRET}
```
แล้วเก็บค่าจริงไว้ในไฟล์ `.env` ข้าง compose (อย่า commit ขึ้น git)

---

## ขั้นที่ 4 — ยืนยันผล

```bash
# 1) process เห็นคีย์แล้วจริงไหม
pgrep -af "server.py"
sudo tr '\0' '\n' < /proc/<PID ใหม่>/environ | grep AERIS_JWT_SECRET

# 2) login ยังใช้งานได้ (ควรได้ token กลับมา)
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<ชื่อผู้ใช้>","password":"<รหัสผ่าน>"}'
```

Checklist:
- [ ] process เห็น `AERIS_JWT_SECRET` เป็นค่าสุ่ม ไม่ใช่ค่า dev
- [ ] `/api/auth/login` คืน `{"token": "...", "role": "..."}` ตามปกติ
- [ ] `/api/status` ยังทำงานเหมือนเดิม (ไม่กระทบของเดิม)
- [ ] ลอง reboot Pi แล้วเช็คซ้ำว่าคีย์ยังอยู่ (ข้อนี้สำคัญสุด)
- [ ] คีย์ถูกสำรองไว้ในที่ปลอดภัยแล้ว

---

## ⚠️ ผลข้างเคียงที่ต้องรู้ก่อนทำ

1. **ทุกคนจะถูกเตะออกจากระบบทันที** — token เก่าเซ็นด้วยคีย์เดิม พอเปลี่ยนคีย์แล้วจะ verify
   ไม่ผ่าน ทุกคนต้อง login ใหม่ 1 รอบ (ข้อมูลผู้ใช้/สิทธิ์ใน DB ไม่หาย)
   → **ยิ่งทำเร็วยิ่งดี ตอนที่ยังมีผู้ใช้น้อย**
2. **ตั้งแล้วห้ามเปลี่ยนไปมา** — เปลี่ยนทีไรทุกคนหลุดทุกที
3. **อย่า commit คีย์ขึ้น git** และอย่าวางไว้ในไฟล์ที่คนอื่นอ่านได้
