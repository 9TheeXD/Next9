// ─────────────────────────────────────────────
// config.js — ค่าตั้งต่าง ๆ ของระบบ
// ─────────────────────────────────────────────

const CONFIG = {
  // Google Apps Script Web App URL (สำหรับ POST ส่งข้อมูล)
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxszGjIM5-zYLRYaSJ6-O5Ulv2xsdf_x7pDJ0MAOMXgUNDt4Idm7YtL1p14yOcmxAp4Lw/exec",

  // Google Sheet ID (สำหรับ GET ดึงข้อมูลผ่าน CSV export)
  SHEET_ID: "1u3nuYSwHyJOigNMjcDUqYCk3xvsNWi9dQlNURRLve-U",

  // GID ของ tab "บันทึกเวรประจำวัน" (ใช้ใน CSV export URL)
  SHEET_GID: "1803925258",

  // เว็บ /photos (NEXT9) — รูปเวรจะถูกเก็บเข้าอัลบั้ม "เวรประจำวัน" ด้วย
  // เปิดจากเว็บ next9 เอง (/duty/) = ใช้ origin เดียวกัน; เปิดจากที่อื่น (GitHub Pages) = ยิงไป next9
  PHOTOS_ORIGIN: /(^|\.)next9\.yumistack\.net$|\.vercel\.app$|^localhost$|^127\./.test(location.hostname) ? "" : "https://next9-web.vercel.app",
  PHOTOS_ROOT_ALBUM: "เวรประจำวัน",

  // รูปที่ส่งเข้า Google Drive ถูกย่อก่อนส่ง (Apps Script รับ payload ได้จำกัด)
  // ส่วนเว็บ /photos ได้ไฟล์ต้นฉบับ
  MAX_PHOTOS: 20,
  MAX_IMAGE_DIM: 1600,
  IMAGE_QUALITY: 0.82,

  // Session key
  SESSION_KEY: "duty_current_user",

  APP_VERSION: "3.2.0",
};
