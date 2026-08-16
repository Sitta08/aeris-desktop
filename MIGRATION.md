# ย้ายเครื่อง / ลง distro ใหม่ — คู่มือกู้โปรเจ็กกลับมา

> เป้าหมาย: ลง Linux ใหม่แล้ว **เอาโปรเจ็กกลับมารันได้เหมือนเดิม**
> เขียนไว้ 16 ส.ค. 2569

---

## 1. ก่อนล้างเครื่อง — เช็กลิสต์

- [ ] **push โปรเจ็กขึ้น GitHub (private)** — วิธีอยู่ในหัวข้อ 2
- [ ] **สร้างไฟล์ zip ของทั้ง Desktop** — วิธีอยู่ในหัวข้อ 3
- [ ] ก๊อป zip ออกไปไว้ที่อื่นด้วย (USB / Google Drive / ฮาร์ดดิสก์นอก)
      — **อย่าเก็บไว้แค่บนเครื่องที่กำลังจะล้าง**
- [ ] `git log` แล้วเห็น commit + `git status` ขึ้น clean
- [ ] เปิด GitHub ในเบราว์เซอร์แล้วเห็นไฟล์ครบจริง ๆ (ไม่ใช่เชื่อว่า push แล้ว)

> ℹ️ **Raspberry Pi ไม่ได้ถูกล้าง** — `server.py`, `aeris_data.db` (ผู้ใช้ + รหัสผ่าน),
> และ config ทั้งหมดอยู่บน Pi ไม่เกี่ยวกับการลง distro ใหม่บนคอม
> แต่ถ้าอยากปลอดภัยจริง ก็ควรสำรอง `aeris_data.db` จาก Pi แยกไว้ด้วย (`scp`)

---

## 2. ที่เก็บหลัก: GitHub (private repo)

repo ถูก `git init` + commit ครบแล้วในเครื่องนี้ เหลือแค่ต่อกับ GitHub

**บน github.com:** สร้าง repo ใหม่ ตั้งเป็น **Private** และ **อย่าติ๊ก**
"Add a README" (จะได้ไม่ชนกับ commit ที่มีอยู่)

**บนเครื่องนี้:**

```bash
cd ~/Desktop/"Aeris Desktop App"
git remote add origin https://github.com/<username>/aeris-desktop.git
git push -u origin main
```

GitHub จะถาม username + password — ช่อง password ต้องใส่ **Personal Access Token**
(Settings → Developer settings → Personal access tokens → Tokens (classic) →
ติ๊กสิทธิ์ `repo`) ไม่ใช่รหัสผ่านบัญชี

> ทำไมถึงแนะนำ GitHub: ได้ history ทุก commit, กู้คืนด้วย `git clone` คำสั่งเดียว,
> และรอดแม้ USB หายหรือดิสก์พัง

### ไฟล์ที่ git **ไม่** เก็บ (ตั้งใจ ไม่ใช่ตกหล่น)

`node_modules/`, `out/`, `dist/`, `__pycache__/`, `*.log`
— ทั้งหมดสร้างใหม่ได้ด้วย `npm install` + `npm run build` ไม่ต้องสำรอง

---

## 3. ที่เก็บสำรอง: ไฟล์ zip ของทั้ง Desktop

ครอบคลุมของที่ **ไม่ได้อยู่ใน git** ด้วย เช่นงาน Arduino, backup ธีม, avatar, PDF ตัวอย่าง

สร้างไฟล์ด้วยสคริปต์ที่เตรียมไว้ (รันซ้ำได้ ไฟล์จะตั้งชื่อตามวันที่):

```bash
~/Desktop/"Aeris Desktop App"/scripts/backup-desktop.sh
```

ได้ผลลัพธ์เป็น `~/aeris-backup-YYYY-MM-DD.zip` — **ก๊อปไฟล์นี้ออกนอกเครื่อง**

ข้างในมี:

| อยู่ในนั้น | คืออะไร |
|---|---|
| `Aeris Desktop App/` | ซอร์สโค้ดทั้งหมด **รวม `.git`** (ตัด `node_modules`, `out`, `dist` ออก) |
| `aeris-theme-backup/` | backup ธีมที่เก็บไว้บน Desktop |
| `aeris_pan_tilt_FIXED.ino`, `sketch_aug4a/`, `Test_01/`, `last/` | งาน Arduino / sketch |
| `aeris-report-*.pdf` | รายงาน PDF ตัวอย่างที่ export ไว้ |
| `ช่วงของ สีตา และ ช่วงของ pm .png` | รูปประกอบ |
| `config-aeris-desktop/` | ข้อมูลผู้ใช้ของแอป (avatar + session) จาก `~/.config/aeris-desktop` |
| `claude-memory/` | ความจำของ Claude Code สำหรับโปรเจ็กนี้ |

---

## 4. บนเครื่องใหม่ — ลงของที่ต้องมี

### 4.1 ของจากตัวจัดการแพ็กเกจ

```bash
# Debian / Ubuntu / Mint
sudo apt install git zip unzip build-essential \
  libgtk-3-0 libnotify4 libnss3 libxss1 libasound2 libgbm1 \
  libsecret-1-0 gnome-keyring
```

```bash
# Fedora
sudo dnf install git zip unzip @development-tools \
  gtk3 libnotify nss libXScrnSaver alsa-lib mesa-libgbm \
  libsecret gnome-keyring
```

```bash
# Arch / CachyOS / EndeavourOS
sudo pacman -S git zip unzip base-devel \
  gtk3 libnotify nss libxss alsa-lib libsecret gnome-keyring
```

> **`gnome-keyring` / `libsecret` สำคัญกว่าที่คิด** — Electron `safeStorage`
> ใช้มันเข้ารหัส JWT ถ้าไม่มี keyring ทำงานอยู่ token จะถูกเก็บแบบไม่ปลอดภัย
> (ถ้าใช้ KDE ให้ใช้ `kwallet` แทนได้)

### 4.2 Node.js (ติดตั้งแบบ user-local เหมือนเดิม)

เครื่องเก่าใช้ **Node v20.17.0 / npm 10.8.2** ติดตั้งไว้ที่ `~/.local/node`
(ไม่ได้ลงผ่าน apt) — ทำแบบเดิมบนเครื่องใหม่:

```bash
mkdir -p ~/.local
curl -fLO https://nodejs.org/dist/v20.17.0/node-v20.17.0-linux-x64.tar.xz
tar -xJf node-v20.17.0-linux-x64.tar.xz
mv node-v20.17.0-linux-x64 ~/.local/node
rm node-v20.17.0-linux-x64.tar.xz
```

ทำให้ shell ใหม่เจอ node เอง (ใส่ครั้งเดียวจบ):

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zshrc
```

เช็ก: `node -v` ต้องได้ `v20.17.0`

---

## 5. บนเครื่องใหม่ — กู้โปรเจ็ก

```bash
# วางไว้ที่เดิม เพื่อให้ path ตรงกับของเก่า
cd ~/Desktop
git clone https://github.com/<username>/aeris-desktop.git "Aeris Desktop App"
cd "Aeris Desktop App"

export PATH="$HOME/.local/node/bin:$PATH"
npm install          # ~2-5 นาที ดาวน์โหลด Electron ด้วย
npm run typecheck    # ต้องผ่านทั้ง node และ web ไม่มี error
npm run dev          # แอปควรเปิดขึ้นมา
```

> ถ้าไม่ได้ push ขึ้น GitHub ให้แตก zip แทน — โฟลเดอร์ใน zip มี `.git` ติดไปด้วย
> เพราะฉะนั้นเปิดมาแล้วประวัติ commit ยังอยู่ครบ

### กู้ข้อมูลผู้ใช้ของแอป (ไม่บังคับ)

```bash
mkdir -p ~/.config/aeris-desktop
cp <ที่แตก zip>/config-aeris-desktop/aeris-avatars.json ~/.config/aeris-desktop/
```

- **`aeris-avatars.json`** — รูป avatar ย้ายตามมาได้ปกติ
- **`aeris-session.bin`** — **ก๊อปมาก็ใช้ไม่ได้** เพราะเข้ารหัสผูกกับ keyring
  ของเครื่องเก่า ทิ้งไปเลย แล้ว **login ใหม่หนึ่งครั้ง** จบ (บัญชีอยู่บน Pi ไม่หาย)

### กู้ความจำของ Claude Code (ไม่บังคับ)

```bash
cp -r <ที่แตก zip>/claude-memory \
  ~/.claude/projects/-home-sittx-loq-Desktop-Aeris-Desktop-App/memory
```

> ชื่อโฟลเดอร์นี้ถอดมาจาก path ของโปรเจ็ก ถ้าวางโปรเจ็กไว้ที่อื่นหรือ
> ชื่อผู้ใช้เครื่องใหม่ไม่ใช่ `sittx-loq` ชื่อโฟลเดอร์จะเปลี่ยนตาม
> **ทางง่ายที่สุดคือใช้ชื่อผู้ใช้เดิมและวางโปรเจ็กที่ `~/Desktop/Aeris Desktop App` เหมือนเดิม**

---

## 6. เช็กว่ากลับมาครบจริง

- [ ] `npm run typecheck` ผ่าน ไม่มี error
- [ ] `npm run dev` เปิดแอปได้ และหน้า login ขึ้น
- [ ] login เข้าได้ (ต่อ Pi จริง — เช็กว่าคอมกับ Pi อยู่วงเน็ตเดียวกัน)
- [ ] Dashboard ขึ้นค่าจริง ไม่ค้าง — ถ้าไม่ขึ้น ให้เช็ก IP ของ Pi ก่อน:
      ssh เข้า Pi แล้วรัน `hostname -I` ถ้า IP เปลี่ยน ต้องแก้ `piBaseUrl`
      **และ** `dashboardUrl` ใน [`src/main/config.ts`](src/main/config.ts)
- [ ] เข้า role admin แล้วเห็นกลุ่ม Tools ครบ 7 หน้า
- [ ] หน้า Graphs กด Export PDF แล้วได้ไฟล์ (ทดสอบ printToPDF ทำงาน)
- [ ] หน้า Terminal ต่อ SSH เข้า Pi ได้
- [ ] `npm run build:linux` สร้าง AppImage + deb ใน `dist/` ได้

---

## 7. ปัญหาที่น่าจะเจอบนเครื่องใหม่

| อาการ | สาเหตุ / ทางแก้ |
|---|---|
| `npm: command not found` | ยังไม่ได้ `export PATH="$HOME/.local/node/bin:$PATH"` หรือยังไม่ได้เปิด shell ใหม่ |
| แอปเปิดแล้วจอขาว / crash ตอน start | ไลบรารีระบบไม่ครบ — ลง `libgtk-3-0 libnss3 libgbm1 libasound2` ตามหัวข้อ 4.1 |
| `app is undefined` ตอนรัน electron ตรง ๆ | ต้องรันแบบ `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron . --no-sandbox` |
| Electron ไม่ยอมเปิดเพราะ sandbox | ใส่ `--no-sandbox` หรือตั้ง `sudo sysctl -w kernel.unprivileged_userns_clone=1` |
| login แล้วเด้งออกทุกครั้งที่ปิดแอป | ไม่มี keyring ทำงาน — ลง/เปิด `gnome-keyring` (หรือ `kwallet` บน KDE) |
| Dashboard ขึ้น connection error | IP ของ Pi เปลี่ยน → แก้ `piBaseUrl` + `dashboardUrl` ใน `config.ts` |
| `npm install` ดาวน์โหลด Electron ช้า/ค้าง | ปกติ ไฟล์ ~100MB ปล่อยให้จบ ถ้าล้มค่อยรันซ้ำ |

---

## 8. ขนาดโดยประมาณ

| สิ่งของ | ขนาด |
|---|---|
| ซอร์สโค้ด + docs + `.git` (สิ่งที่ต้องสำรองจริง ๆ) | **~2 MB** |
| zip ทั้ง Desktop | **~3 MB** |
| `node_modules/` (ไม่ต้องสำรอง สร้างใหม่ได้) | 629 MB |

เล็กมาก — เก็บได้ทุกที่ ไม่มีข้ออ้างว่าไม่มีที่เก็บ
