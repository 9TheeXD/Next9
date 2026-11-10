# 📋 ระบบบันทึกเวรประจำวัน — สภานักเรียน v3.0

## มีอะไรใหม่ใน v3

- หน้าลงเวรใหม่ ธีมเดียวกับ NEXT9: ฟอร์มเดียวใช้ได้ทั้งวันนี้และย้อนหลัง (แตะวันในปฏิทิน)
- จุดเวรเลือกได้ 1 จุด
- รูปหลักฐานใส่ได้หลายรูป มีปุ่ม "ถ่ายรูป" (กล้อง) กับ "เลือกจากอัลบั้ม" แยกกัน
- รูปถูกเก็บ 2 ที่: Google Drive (โฟลเดอร์ `เวรประจำวัน/dd-mm-yy`) และเว็บ /photos
  (อัลบั้ม `เวรประจำวัน › dd/mm/yy` ชื่อไฟล์ `{ชื่อ-นามสกุล}-{ตำแหน่ง}.นามสกุล`)
- ลงซ้ำวันเดิม = แก้แถวเดิมในชีท (รูปเก่าเก็บไว้ รูปใหม่ต่อท้าย)
- `photos.html` หน้าดูรูปเวรแบบไฟล์: ตาราง/รายการ, ขนาด S/M/L, ค้นหา, เรียง, ของฉัน
- ต้อง deploy `apps-script/Code.gs` ใหม่ (ดูคำแนะนำหัวไฟล์)

ระบบลงเวลาปฏิบัติงานสำหรับสภานักเรียน ผ่านเว็บแอป พร้อมปฏิทินสถานะและการลงเวลาย้อนหลัง

## 📁 โครงสร้างโปรเจค

```
Arrange-the-duty-schedule/
├── index.html              # หน้าเลือกชื่อเข้าสู่ระบบ
├── dashboard.html          # หน้ากดเข้างาน + ปฏิทิน
├── css/
│   └── styles.css          # Design system + สไตล์ทั้งหมด
├── js/
│   ├── config.js           # Google Apps Script URL + settings
│   ├── data.js             # รายชื่อสมาชิก + ตำแหน่ง + จุดเวร
│   ├── auth.js             # จัดการ session (localStorage)
│   ├── api.js              # ส่ง/ดึงข้อมูล Google Sheets
│   ├── calendar.js         # render ปฏิทิน + สถานะรายวัน
│   └── app.js              # logic หน้า dashboard
├── apps-script/
│   └── Code.gs             # Google Apps Script (doPost + doGet)
├── .env                    # Reference (OUTPUT_DIR)
├── .gitignore              # Git ignore rules
├── README.md               # ไฟล์นี้
└── archive/                # ไฟล์ Python เดิม
    ├── create_schedule.py
    ├── generate_markdown.py
    └── requirements.txt
```

## 🚀 วิธีใช้งาน

### 1. Deploy Google Apps Script

1. เปิด Google Sheets ที่ต้องการเก็บข้อมูล
2. ไปที่ **Extensions → Apps Script**
3. ลบโค้ดเดิม → copy โค้ดจาก `apps-script/Code.gs` วางแทน
4. กด **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy URL ที่ได้ → แก้ใน `js/config.js` ที่ `SCRIPT_URL`

### 2. Deploy เว็บ

**บน Netlify (เหมือนเดิม):**
- Push ไฟล์ทั้งหมดขึ้น GitHub
- Netlify จะ auto deploy

**หรือ local test:**
```bash
# ใช้ VS Code Live Server, หรือ
npx serve .
```

### 3. ใช้งาน

1. เปิดเว็บ → เลือกชื่อเข้าสู่ระบบ
2. กดเข้างาน → อัพรูป → เลือกจุดเวร → เลือกสถานะ → ลงเวลา
3. ดูปฏิทิน → สีต่าง ๆ แสดงสถานะ
4. กดวันในปฏิทิน → ลงเวลาย้อนหลังได้

## 📌 ฟีเจอร์หลัก

- ✅ **เลือกชื่อเข้าสู่ระบบ** — ไม่ต้องพิมพ์ ลดปัญหาข้อมูลเพี้ยน
- ✅ **ตำแหน่ง auto-fill** — ผูกกับชื่ออัตโนมัติ
- ✅ **ปฏิทินสถานะ** — แสดงสีตามสถานะแต่ละวัน
- ✅ **ลงเวลาย้อนหลัง** — กดวันในปฏิทิน → ลงย้อนหลังได้
- ✅ **Google Sheets sync** — ข้อมูลย้อนหลังแทรกตามลำดับวัน
- ✅ **Responsive** — ใช้งานได้ทั้ง mobile/desktop

## 🛠 Tech Stack

- **HTML5 + Vanilla CSS + JavaScript** — ไม่ต้อง build
- **Google Sheets** — เป็น database ผ่าน Apps Script
- **Netlify** — static hosting

## 👥 ผู้พัฒนา

สภานักเรียน — ระบบจัดตารางเวร v2.0
