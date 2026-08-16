# แผน Motion Flow สำหรับ Stepper: ไม่มี Limit Switch vs มี Home Switch

> **สถานะ: แผนสำหรับประชุม/ตัดสินใจ (31 ก.ค. 69)** — ยังไม่ใช่ implementation doc
> ฝั่ง desktop/Pi ตอนนี้ยังตั้ง `useMockMotor: true` เพราะ Arduino + CNC Shield + stepper
> ยังไม่ต่อจริง

## บริบท

AERIS จะใช้ **Arduino + CNC Shield V3 + A4988 + 12V PSU** คุม stepper หลายแกน:

| Joint | หน้าที่ | CNC Shield Axis |
|---|---|---|
| `neck_yaw` | คอหันซ้าย/ขวา | X |
| `neck_pitch` | คอก้ม/เงย | Y |
| `left_arm_lift` | แขนซ้ายขึ้น/ลง | Z |
| `right_arm_lift` | แขนขวาขึ้น/ลง | A |

flow ที่ต้องการ:

1. คอ tracking คนด้วย `neck_yaw` / `neck_pitch` ภายในช่วงปลอดภัย
2. เจอ `no_mask`
3. แขนเล่น warning motion
4. แขนกลับ home
5. ช่วง cooldown ให้คอกลับ home แล้วอยู่นิ่ง
6. cooldown จบแล้วคอกลับไป tracking คนต่อ
7. ถ้าเจอคนใหม่หลัง cooldown ให้ทำ loop เดิมซ้ำได้

สิ่งสำคัญ: NEMA17 + A4988 เป็นระบบ **open-loop** ถ้าไม่มี sensor เพิ่ม ระบบรู้ตำแหน่งจาก
การนับ step ที่เคยสั่ง ไม่ได้รู้ตำแหน่งจริงจากมอเตอร์เอง

---

# แผนที่ 1: ไม่ใส่ Limit Switch

## แนวคิด

ใช้ **Manual Home + Software Limits + Always Return Home**:

- ผู้ใช้จัดหุ่นให้อยู่ท่า home เองตอนเปิดระบบ
- กด `Set Current as Home`
- ระบบนับ step จากจุดนั้น
- ทุกคำสั่ง move / tracking / sequence ถูก clamp ด้วย soft limit
- ทุก warning motion จบแล้วแขนกลับ home
- ช่วง cooldown คอกลับ home และนิ่ง

## Flow ตอนเปิดระบบ

```text
Power on
-> status = NOT_HOMED
-> ผู้ใช้จัดคอ/แขนให้อยู่ท่า home ด้วยมือ
-> กด Set Current as Home
-> positions ทุก joint = 0
-> status = HOMED + SOFT_LIMITS_ACTIVE + POSITION_ASSUMED
-> เปิด Jog / Tracking / Automation ได้
```

คำว่า `POSITION_ASSUMED` ควรแสดงใน UI หรือ status เพราะตำแหน่งเป็นค่าที่ระบบเชื่อจาก
step count ไม่ใช่ feedback จริง

## Flow ตอน Tracking + No Mask

```text
TRACKING_ACTIVE
-> no_mask detected
-> ถ้ายังไม่ cooldown และแขนไม่ busy:
   -> ARM_WARNING_PLAYING
   -> ARM_RETURN_HOME
   -> COOLDOWN_NECK_RETURN_HOME
   -> COOLDOWN_NECK_HOLD
-> cooldown done
-> TRACKING_ACTIVE
```

รายละเอียด:

- คอยัง tracking ได้ต่อเนื่องก่อนเกิด event แต่ต้องไม่เกิน soft limit
- ตอน cooldown คอควรกลับ home และหยุดนิ่ง เพื่อ reset ท่าทางก่อน tracking รอบถัดไป
- ถ้าเจอคนใหม่ระหว่าง cooldown ให้ ignore หรือ log event ไว้ แต่ไม่เล่น motion ซ้อน
- ถ้าแขนกำลังเล่น motion อยู่ ห้ามสั่ง sequence ซ้อน

## สิ่งที่ต้องทำใน Firmware / Pi

- มี config ต่อ joint:
  - `position_steps`
  - `soft_min_steps`
  - `soft_max_steps`
  - `homed`
  - `position_confidence: "assumed"`
- เพิ่มคำสั่ง:
  - `SET_HOME joint`
  - `SET_LIMIT_MIN joint`
  - `SET_LIMIT_MAX joint`
  - `RETURN_HOME joint`
- ทุก move ต้อง reject ถ้า:
  - ยังไม่ได้ `SET_HOME`
  - คำสั่งจะเกิน `soft_min_steps` / `soft_max_steps`
  - joint กำลัง busy
- `STOP` ต้อง interrupt motion ได้เสมอ
- Automation ต้องไม่ทำงานถ้ายัง `NOT_HOMED`

## ข้อดี

- ไม่ต้องแก้ชิ้นที่ปริ้นไปแล้ว
- เริ่มทดลองเร็ว
- wiring ง่ายที่สุด
- เหมาะกับ prototype/demo ที่มีคนคุมอยู่ตลอด

## ข้อเสีย / ความเสี่ยง

- ถ้ามีคนหมุนด้วยมือตอนปิดไฟ ระบบไม่รู้
- ถ้ามอเตอร์ skip step ระบบไม่รู้
- ถ้าสายพานลื่น ระบบไม่รู้
- ถ้าเปิดเครื่องแล้วไม่ได้จัด home ให้ถูก soft limit จะเพี้ยน
- ไม่เหมาะกับ unattended operation หรือ motion ใกล้คนแบบจริงจัง

## Acceptance Criteria

- เปิดระบบแล้วต้องขึ้น `NOT_HOMED`
- ก่อน `Set Current as Home` ห้าม automation / play sequence
- หลัง set home แล้ว soft limit กันคำสั่งเกินช่วงได้จริง
- warning motion เล่นจบแล้วแขนกลับ home
- cooldown ทำให้คอกลับ home และนิ่ง
- tracking resume หลัง cooldown ได้

---

# แผนที่ 2: มี Home Switch ทุกแกน

## แนวคิด

ใช้ **Home Switch 1 ตัวต่อแกน + Software Limits**:

- แต่ละ joint มี mechanical NC home switch
- ตอนเปิดระบบ กด `Home All` หรือ home ทีละแกน
- Arduino ขยับไปหา switch เพื่อรู้ตำแหน่ง home จริง
- หลังเจอ home แล้ว set position = 0
- move/tracking/sequence ยังใช้ soft limit เหมือนเดิม
- ช่วง cooldown คอกลับ home และสามารถ confirm home ด้วย switch ได้

นี่ไม่ใช่ min/max switch สองฝั่ง แต่เป็น switch สำหรับ re-zero ตำแหน่งจริง ซึ่งเหมาะกับคอที่
ปริ้นไปแล้วมากกว่า

## Flow ตอนเปิดระบบ

```text
Power on
-> status = NOT_HOMED
-> กด Home All
-> Arduino home neck_yaw / neck_pitch / left_arm_lift / right_arm_lift
-> switch triggered
-> back off + approach slowly
-> positions ทุก joint = 0
-> status = HOMED + SOFT_LIMITS_ACTIVE + POSITION_REFERENCED
-> เปิด Jog / Tracking / Automation ได้
```

## Flow ตอน Tracking + No Mask

```text
TRACKING_ACTIVE
-> no_mask detected
-> ถ้ายังไม่ cooldown และแขนไม่ busy:
   -> ARM_WARNING_PLAYING
   -> ARM_RETURN_HOME
   -> optionally confirm arm home
   -> COOLDOWN_NECK_RETURN_HOME
   -> optionally confirm neck home
   -> COOLDOWN_NECK_HOLD
-> cooldown done
-> TRACKING_ACTIVE
```

รายละเอียด:

- คอ tracking ต่อเนื่องได้ในช่วง soft limit
- ตอน cooldown คอกลับ home เพื่อ re-center และลด drift
- ถ้ามีการเพี้ยนสะสมจาก step loss, การกลับ home จะช่วย re-zero ได้
- ถ้ากลับ home แล้ว switch ไม่ trigger ต้องเข้าสถานะ error/fault ไม่ resume tracking

## Wiring / Hardware

- ใช้ mechanical limit switch แบบ **NC (Normally Closed)** ทุกแกน
- ต่อแบบ `GND -> switch -> input pin` และใช้ `INPUT_PULLUP`
- ถ้าสายหลุด/ขาด firmware ต้องถือว่า fault หรือไม่ safe
- Mapping แนะนำ:

| Joint | CNC Axis | Home Switch Input |
|---|---|---|
| `neck_yaw` | X | X limit |
| `neck_pitch` | Y | Y limit |
| `left_arm_lift` | Z | Z limit |
| `right_arm_lift` | A | spare input เช่น `A0` |

หมายเหตุ: CNC Shield V3 มักมี endstop header หลักสำหรับ X/Y/Z ส่วนแกน A อาจต้องใช้ input
ว่างและ custom firmware

## สิ่งที่ต้องทำใน Firmware / Pi

- มี config ต่อ joint:
  - `home_pin`
  - `home_direction`
  - `home_speed_sps`
  - `home_backoff_steps`
  - `soft_min_steps`
  - `soft_max_steps`
  - `homed`
  - `limit_state`
- เพิ่มคำสั่ง:
  - `HOME joint`
  - `HOME_ALL`
  - `RETURN_HOME joint`
  - `STATUS`
- ทุก move ต้อง reject ถ้า:
  - ยังไม่ homed
  - จะเกิน soft limit
  - limit/home switch อยู่ใน fault state
  - joint กำลัง busy
- `STOP` ต้อง interrupt motion ได้เสมอ

## ข้อดี

- เปิดเครื่องแล้วหา home จริงได้ ไม่ต้องจัดด้วยมือทุกครั้ง
- ลดความเสี่ยงจาก step loss / belt slip / มีคนขยับตอนปิดไฟ
- ทำให้ `return home` น่าเชื่อถือกว่า
- เหมาะกับ demo ที่ต้องทำซ้ำและประชุมกับทีมง่ายกว่า
- ปลอดภัยกว่าแผนไม่มี switch

## ข้อเสีย / ต้นทุน

- ต้องเพิ่มขายึด switch ในกลไก
- ต้องเดินสายเพิ่มทุกแกน
- ต้องเขียน firmware homing/fault handling เพิ่ม
- สำหรับคอที่ปริ้นไปแล้ว ต้องทำเป็น bracket เสริม หรือหาจุดยึดที่ไม่ต้องรื้อชิ้นหลัก

## Acceptance Criteria

- `Home All` ทำงานครบ 4 joint
- ถอดสาย switch แล้วระบบไม่ถือว่า safe
- homing แล้ว position = 0 ถูกต้อง
- move เกิน soft limit โดน reject
- warning motion เล่นจบแล้วแขนกลับ home ได้
- cooldown ทำให้คอกลับ home และ confirm ได้
- ถ้า home switch ไม่ trigger ระบบเข้า fault และไม่ resume tracking

---

# ข้อเสนอแนะสำหรับทีม

ถ้าต้องเริ่มเร็วมากและมีคนคุมตลอด: ใช้ **แผนที่ 1** ก่อน แต่ต้องมี UI/status ชัดเจนว่า
`Position Assumed` และต้อง set home ทุกครั้ง

ถ้าต้องการลดปัญหาระหว่าง demo และให้ระบบน่าเชื่อถือขึ้น: เลือก **แผนที่ 2** เพราะ home switch
ช่วยให้หุ่นกลับมารู้ตำแหน่งอ้างอิงจริงได้เรื่อย ๆ โดยไม่ต้องรู้มุมต่อเนื่องแบบ encoder

แผนที่แนะนำตอนนี้: **ทำแผนที่ 1 เป็น fallback logic ใน software แต่เตรียม mechanical/wiring
สำหรับแผนที่ 2 ตั้งแต่เนิ่น ๆ** โดยเฉพาะแขนที่ยังไม่ได้ปริ้น และทำ bracket เสริมสำหรับคอที่ปริ้นแล้ว
