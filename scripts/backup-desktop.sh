#!/usr/bin/env bash
#
# สำรองทุกอย่างที่เกี่ยวกับ AERIS บนเครื่องนี้ เป็นไฟล์ zip ไฟล์เดียว
# รันซ้ำได้เรื่อย ๆ — ไฟล์ตั้งชื่อตามวันที่ แล้วเขียนทับของวันเดียวกัน
#
#   ~/Desktop/"Aeris Desktop App"/scripts/backup-desktop.sh
#   → ~/aeris-backup-YYYY-MM-DD.zip
#
# ตัดออก: node_modules/ out/ dist/ __pycache__/ (สร้างใหม่ได้ด้วย npm install)
# ดูรายละเอียดที่ MIGRATION.md

set -euo pipefail

DESKTOP="$HOME/Desktop"
PROJECT="$DESKTOP/Aeris Desktop App"
STAMP="$(date +%F)"
OUT="$HOME/aeris-backup-$STAMP.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> กำลังรวบรวมไฟล์..."

# 1. ทุกอย่างบน Desktop (รวมโปรเจ็กพร้อม .git) ยกเว้นของที่สร้างใหม่ได้
rsync -a \
  --exclude 'node_modules/' \
  --exclude 'out/' \
  --exclude 'dist/' \
  --exclude '__pycache__/' \
  --exclude '*.log' \
  "$DESKTOP/" "$STAGE/desktop/"

# 2. ข้อมูลผู้ใช้ของแอป (avatar + session)
#    aeris-session.bin เข้ารหัสผูกกับ keyring เครื่องนี้ — ก๊อปไปก็ใช้ไม่ได้
#    เก็บไว้เฉย ๆ ให้ครบ แต่บนเครื่องใหม่ให้ login ใหม่
if [ -d "$HOME/.config/aeris-desktop" ]; then
  mkdir -p "$STAGE/config-aeris-desktop"
  find "$HOME/.config/aeris-desktop" -maxdepth 1 -type f -name 'aeris-*' \
    -exec cp {} "$STAGE/config-aeris-desktop/" \;
fi

# 3. ความจำของ Claude Code สำหรับโปรเจ็กนี้
CLAUDE_MEM="$HOME/.claude/projects/-home-sittx-loq-Desktop-Aeris-Desktop-App/memory"
if [ -d "$CLAUDE_MEM" ]; then
  cp -r "$CLAUDE_MEM" "$STAGE/claude-memory"
fi

# 4. บันทึกสภาพแวดล้อมของเครื่องเก่าไว้อ้างอิง
{
  echo "AERIS backup — $(date)"
  echo
  echo "host:   $(uname -a)"
  echo "distro: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
  echo "node:   $("$HOME/.local/node/bin/node" -v 2>/dev/null || echo 'ไม่พบ')"
  echo "npm:    $("$HOME/.local/node/bin/npm" -v 2>/dev/null || echo 'ไม่พบ')"
  echo
  echo "--- git log ---"
  git -C "$PROJECT" log --oneline -20 2>/dev/null || echo 'ไม่ใช่ git repo'
  echo
  echo "--- git remote ---"
  git -C "$PROJECT" remote -v 2>/dev/null || true
  echo
  echo "--- git status ---"
  git -C "$PROJECT" status --short 2>/dev/null || true
} > "$STAGE/BACKUP-INFO.txt"

echo "==> กำลังบีบอัด..."
rm -f "$OUT"
( cd "$STAGE" && zip -rq "$OUT" . )

echo
echo "✅ เสร็จแล้ว: $OUT  ($(du -h "$OUT" | cut -f1))"
echo "   อย่าลืมก๊อปไฟล์นี้ออกนอกเครื่อง (USB / cloud) ก่อนล้างเครื่อง"
