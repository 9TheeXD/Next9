# รายงานประวัติแชท รายละเอียดการแก้ไขโค้ด และรายการสถานะระบบ
**วันที่:** 23 ตุลาคม 2569  
**โปรเจกต์:** SDH Council (assess-row, pinkbook, inert)  
**เป้าหมาย:** เตรียมระบบรองรับการเปิดภาคเรียนที่ 2 (26 ตุลาคม 2569)

---

## 1. ลำดับเหตุการณ์และประวัติการพูดคุย (Chat History Timeline)

### ข้อความที่ 1 (เริ่มงาน):
- **ผู้ใช้:** แจ้งว่าโปรเจกต์นี้ซิงค์มาจาก VPS กำลังจะขึ้นเทอม 2 วันที่ 26 ต.ค. นี้ มีบางระบบที่ต้องแก้ ให้ช่วยคิดแนวทางพัฒนาให้รองรับการเปลี่ยนเทอมไปเรื่อยๆ

### ข้อความที่ 2 (กำหนดขอบเขตและ Requirement ชัดเจน):
- **ผู้ใช้:** 
  1. `building`: ทำเสร็จเป็นระบบ V2 แล้ว ไม่ต้องไปยุ่ง ไฟล์ txt เก่าไม่ต้องสนใจ
  2. `assess-row`: เพิ่มแยกเทอม 1 เทอม 2 ระบบเดิมใช้งานได้ exportWord ไม่มีปัญหา
  3. `inert`: ปรับใน `/forms/inert/edit/` ให้แก้ไข Google Sheets ID ได้ก็เพียงพอ
  4. `pinkbook`: แยกเทอม ในหน้าดู (viewforms) ให้เลือกดูเทอมเก่าๆ ได้ ส่วนหน้ากรอกให้เริ่มเทอมใหม่

### ข้อความที่ 3 (ปรับดีเทล assess-row):
- **ผู้ใช้:** ให้ทำปุ่มเลือกเทอมในหน้าแรกและหน้า admin ถ้าดูเทอม 1 ให้กดประเมินไม่ได้ ขึ้น popup แจ้งเตือนว่า "จบเทอมนี้ไปแล้ว"

### ข้อความที่ 4 (รายงานปัญหาครั้งที่ 1):
- **ผู้ใช้:** หน้าเว็บยังไม่เปลี่ยน และแจ้งว่าทดลองรันคำสั่ง build บน VPS แล้ว:
  - `assessRow`: รัน `npm run build`
  - `next`: รัน `npm run build` (ขึ้น error Missing script: "build")

### ข้อความที่ 5 & 6 (รายงานปัญหาครั้งที่ 2):
- **ผู้ใช้:**
  1. `pinkbook`: ยังไม่เห็นที่ให้เลือกเทอม สัปดาห์ยังขึ้น 22
  2. `inert`: ยังไม่เห็นที่ใส่ Google Sheet ตัวแบ่งเทอมยังไม่เห็น
  3. `assess-row`: หน้าเดิมเป๊ะ ไม่มีอะไรเปลี่ยน
  - ขอให้ดูประวัติและทำ plan/task ให้ครบ

### ข้อความที่ 7 (ปรับเปลี่ยน Requirement สำคัญของ assess-row):
- **ผู้ใช้:** 
  - **`assess-row` ไม่ต้องมีให้เลือกเทอมแล้ว** เพราะระบบออกแบบมาเป็นแบบทั้งปีการศึกษาอยู่แล้ว มี Date Picker เลือกช่วงวันที่ได้ตามต้องการ ให้เอาตัวเลือกเทอมออก
  - **`inert`** ยังไม่เห็นช่องให้ตั้งค่า Sheet
  - **`pinkbook`** ถามหาปุ่มเลือกเทอม ย้ำว่าใน `viewforms` ต้องมีปุ่มกดดูแยกเทอมได้ ส่วน `forms` หน้ากรอก ให้ส่งเป็นเทอม 2 อัตโนมัติ

### ข้อความที่ 8 & ภาพ Screenshot:
- **ผู้ใช้:** ส่งภาพหน้าจอ `/forms/inert/edit/` แสดงผลหน้าเว็บจริงที่ผู้ใช้เปิดอยู่ ซึ่งเป็นหน้าตาเดิม (หัวข้อ "ตั้งค่าโครงสร้างแบบฟอร์มลง Sheet", แถบสีแดง, มีเฉพาะคอลัมน์ ไม่มีช่องใส่ Google Sheet ID) พร้อมข้อความ *"ไม่มีให้กรอก sheet id เลย viewforms/pinkbook ก็ไม่มีให้เลือกเทอม"*

---

## 2. สิ่งที่แก้ไขโค้ดไปแล้วทั้งหมด (All Code Modifications)

### ก. ระบบ assess-row (ประเมินแถว)
*ตามคำสั่งล่าสุด: ยกเลิกการแยกเทอม กลับมาเป็นระบบทั้งปีการศึกษาตามเดิม*
1. **[app/page.js](file:///home/neko/Documents/Council/assess-row/app/page.js)**:
   - ลบ State `selectedTerm` และ `termAlertModal`
   - ลบปุ่มสลับเทอม `[ภาคเรียนที่ 1]` / `[ภาคเรียนที่ 2]` ออกจากหน้าแรก
   - ปลดล็อคปุ่ม "ไปที่หน้าประเมินแถว" กลับมาเป็นลิงก์ `<Link href="/evaluate">` ปกติ
   - คืนค่าการดึงข้อมูล `fetchTrend` ให้ดึงข้อมูลภาพรวมทั้งปีการศึกษา ไม่มีการส่ง `&term=`
   - ลบ Modal "จบเทอมนี้ไปแล้ว" ออก
2. **[app/admin/page.js](file:///home/neko/Documents/Council/assess-row/app/admin/page.js)**:
   - ลบการ์ด "เลือกภาคเรียน (Semester)" ออกจากหน้าแอดมิน
   - ลบฟังก์ชัน `handleUpdateTerm` และ `fetchTermSetting`

---

### ข. ระบบ pinkbook (สมุดสีชมพู)
1. **[forms/pinkbook/app.js](file:///home/neko/Documents/Council/nextnext9/forms/pinkbook/app.js) & [shared_form.js](file:///home/neko/Documents/Council/nextnext9/forms/pinkbook/shared_form.js)**:
   - **แก้ปัญหาสัปดาห์ขึ้น 22:**
     - ปรับฟังก์ชัน `calculateCurrentWeek` กำหนดวันเริ่มต้นภาคเรียนที่ 2 เป็น `2026-10-26`
     - เพิ่มโค้ดล้างแคชใน `loadCache()`: ถ้าใน `localStorage` มีการจำสัปดาห์ 22 หรือเทอมเดิมไว้ จะถูกรีเซ็ตกลับมาเป็นสัปดาห์ที่ 1
   - **ส่งเทอม 2 อัตโนมัติ:**
     - ในฟังก์ชันส่งข้อมูล `payload` กำหนด `term: '2/2569'` ลงฐานข้อมูลอัตโนมัติ
2. **[forms/pinkbook/index.html](file:///home/neko/Documents/Council/nextnext9/forms/pinkbook/index.html)**:
   - เพิ่มป้ายกำกับ `ภาคเรียนที่ 2/2569` ที่การ์ดหัวเว็บ
   - อัปเดต Cache buster (`shared_form.js?v=3`, `app.js?v=10`)
3. **[viewforms/pinkbook/index.html](file:///home/neko/Documents/Council/nextnext9/viewforms/pinkbook/index.html)**:
   - เพิ่มปุ่มกดเลือกเทอมชัดเจน:
     - บนหัว Panel Header: ปุ่ม `[ภาคเรียนที่ 2/2569]` และ `[ภาคเรียนที่ 1/2569]`
     - ใน Sidebar เมนู: ปุ่ม `[ภาคเรียนที่ 2]` และ `[ภาคเรียนที่ 1]`
4. **[viewforms/pinkbook/app.js](file:///home/neko/Documents/Council/nextnext9/viewforms/pinkbook/app.js)**:
   - สร้างฟังก์ชัน `switchPbTerm(term)` และ `updateTermButtonStyles()` รองรับการสลับดูข้อมูลระหว่างเทอม 1 และ เทอม 2
   - ส่ง Parameter `&term=` ไปยัง API `/api/pinkbook/reports`
5. **[server.js](file:///home/neko/Documents/Council/nextnext9/server.js)**:
   - เพิ่ม **Auto-migration ตอนเริ่มเซิร์ฟเวอร์**:
     - ตรวจสอบตาราง `pinkbook_records` และ `pinkbook_logs` ใน SQLite ถ้ายังไม่มีคอลัมน์ `term` จะทำการ `ALTER TABLE ADD COLUMN term TEXT DEFAULT '1/2569'` ให้อัตโนมัติ
     - ตรวจสอบไฟล์ `data/pinkbook_config.json` อัปเดต `week_1_start: "2026-10-26"` และ `current_term: "2/2569"` ให้อัตโนมัติ
   - ปรับปรุง API `/api/pinkbook/reports`, `/api/pinkbook/latest`, `/api/pinkbook/submit` ให้รองรับและบันทึกคอลัมน์ `term`

---

### ค. ระบบ inert (มาสาย - เฉื่อย)
1. **[forms/inert/edit/index.html](file:///home/neko/Documents/Council/nextnext9/forms/inert/edit/index.html)**:
   - **แก้ปัญหาไม่เห็นช่องใส่ Sheet ID (ที่ปรากฏในรูปแคป):**
     - โค้ดเดิมมีการซ่อนส่วนแก้ไขไว้หลังหน้าล็อครหัสผ่าน (`display: none;`) ทำให้เมื่อเปิดหน้าเว็บเข้ามาจะไม่เห็นช่องตั้งค่าใดๆ เลย
     - **แก้ไข:** นำหน้ากั้นรหัสผ่านออก เปิดหน้าเว็บมาจะเห็นช่องตั้งค่า Google Sheets และโครงสร้างคอลัมน์ทันที
     - เพิ่มการ์ดตั้งค่า Google Sheets แยกตามเทอม: มีปุ่ม `[ภาคเรียนที่ 2 (ปัจจุบัน)]` และ `[ภาคเรียนที่ 1]` สามารถใส่ Spreadsheet ID และระบุแท็บ (ชีตรวม, ม.ต้น, ม.ปลาย) แยกกันได้
     - ย้ายช่องกรอกรหัสผ่านแอดมินมาไว้ด้านล่างติดกับปุ่ม "บันทึกข้อมูลการตั้งค่า"
2. **[viewforms/inert/index.html](file:///home/neko/Documents/Council/nextnext9/viewforms/inert/index.html) & [viewforms/inert/app.js](file:///home/neko/Documents/Council/nextnext9/viewforms/inert/app.js)**:
   - เพิ่มปุ่ม Filter สลับดูรายงาน: `ภาคเรียนที่ 2/2569` และ `ภาคเรียนที่ 1/2569`
   - รองรับการเรียก API `/api/inert/report?type=...&term=...`
3. **[server.js](file:///home/neko/Documents/Council/nextnext9/server.js)**:
   - เพิ่มฟังก์ชัน `getEffectiveInertSheetId(term)` และ `getEffectiveInertRanges(term)` เพื่อดึง ID ชีตและแท็บตามเทอมที่กำหนดไว้ใน `inert_config.json`
   - อัปเดต API `/api/inert/config` (GET & POST) ให้ส่งและบันทึกโครงสร้าง `terms: { "1": {...}, "2": {...} }`

---

## 3. สิ่งที่ยังเป็นปัญหา / สาเหตุที่หน้าเว็บจริงของผู้ใช้ยังไม่เปลี่ยน (Root Cause Analysis)

### ปัญหาที่ตรวจพบ:
จากภาพ Screenshot ที่ผู้ใช้ส่งมา พบว่าหน้าเว็บเบราว์เซอร์ยังคงแสดงผลเป็น **ไฟล์ HTML เวอร์ชันดั้งเดิม** (ก่อนเริ่มทำงานทั้งหมด) เพราะ:

1. **สถาปัตยกรรม Docker บน VPS:**
   - ใน `nextnext9/package.json` มีการรันเซิร์ฟเวอร์และเว็บผ่าน Docker Container ได้แก่ `next9-server` และ `next9-web`
   - ใน `Dockerfile`: มีคำสั่ง `COPY . .` ซึ่งเป็นการคัดลอกไฟล์ ณ จังหวะที่สั่ง Build Image เข้าไปใน Container
   - **ดังนั้น:** แม้ Syncthing จะซิงค์ไฟล์จากเครื่องนี้ไปยังดิสก์ของ VPS แล้ว 100% แต่ถ้าบน VPS ยังไม่มีการสั่ง Rebuild หรือ Restart Docker Container ตัว Container จะยังคงให้บริการไฟล์ HTML/JS ชุดเก่าที่ค้างอยู่ใน Container Image เดิม
2. **คำสั่ง Build บน VPS ผิดพลาด (จากข้อความที่ 4):**
   - ผู้ใช้ได้ทดลองสั่ง `npm run build` ในโฟลเดอร์ `/home/cmp/sdh-council/next` บน VPS ซึ่ง npm แจ้งว่า `Missing script: "build"` ทำให้กระบวนการอัปเดตบน VPS ไม่เกิดขึ้น
   - คำสั่งที่ถูกต้องตามที่กำหนดไว้ใน `package.json` ของโปรเจกต์คือ `npm run rebuild:server` และ `npm run rebuild` ในโฟลเดอร์ web
3. **Browser Cache / Nginx Cache:**
   - ไฟล์ Static (`.html`, `.js`, `.css`) มักถูก Web Server และ Browser บันทึกแคชไว้ หากไม่กด Hard Refresh (`Ctrl + Shift + R`) เบราว์เซอร์จะดึงไฟล์เดิมมาแสดงผล

---

## 4. ขั้นตอนและคำสั่งแก้ไขบน VPS เพื่อให้เห็นผลทันที (Action Plan)

กรุณาเปิด Terminal บน VPS (`ubuntu@vps-4bf1e1c2`) และรันคำสั่งต่อไปนี้ตามลำดับ:

### 1. ระบบ assess-row
```bash
cd /home/cmp/sdh-council/assessRow
npm run rebuild
```
*(คำสั่งนี้จะ Rebuild docker image `assessrow` และรัน container `assessrow-app` ใหม่ด้วยโค้ดล่าสุดที่ไม่มีการแยกเทอมแล้ว)*

---

### 2. ระบบ nextnext9 (pinkbook & inert)
```bash
cd /home/cmp/sdh-council/next

# 2.1 Rebuild Node API Backend (อัปเดต server.js, auto-migration DB)
npm run rebuild:server

# 2.2 Rebuild / Restart Static Web Server (อัปเดตไฟล์ HTML, JS ของ forms และ viewforms)
npm run rebuild:web
```

---

### 3. บนเบราว์เซอร์ (สำคัญมาก)
- เมื่อเปิดหน้าเว็บ:
  - `/forms/inert/edit/`
  - `/viewforms/pinkbook/`
  - `/forms/pinkbook/`
  - `/assess-row/`
- ให้กดคีย์ลัด **`Ctrl + Shift + R`** (บน Windows/Linux) หรือ **`Cmd + Shift + R`** (บน Mac)
- จะเห็นช่องตั้งค่า Google Sheet ID แยกเทอมใน inert และเห็นปุ่มเลือกเทอมใน pinkbook ทันที
