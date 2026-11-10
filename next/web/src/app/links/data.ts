// Every internal system of the council, as the /links/ hub lists them.
export type LinkItem = { href: string; title: string; text: string; icon: string; lock?: string; external?: boolean };
export type LinkSection = { key: string; title: string; text: string; icon: string; items: LinkItem[]; restricted?: boolean };

const ASSESS = "https://assess-row-next9.yumistack.net";

export const SECTIONS: LinkSection[] = [
  {
    key: "forms",
    title: "แบบฟอร์มงานสภานักเรียน",
    text: "บันทึกผลการตรวจประจำวันของสมาชิกสภา",
    icon: "fas fa-file-pen",
    items: [
      { href: "/forms/building/", title: "ตรวจอาคาร", text: "บันทึกผลการตรวจความเรียบร้อยของอาคาร", icon: "fas fa-building" },
      { href: "/forms/inert/", title: "ลงชื่อสาย - เฉื่อย", text: "บันทึกรายชื่อนักเรียนมาสายและเฉื่อย", icon: "fas fa-user-clock" },
      { href: "/forms/submit_inert/", title: "รายงานส่งเล่มตรวจสาย - เฉื่อย", text: "บันทึกการส่งเล่มตรวจของแต่ละห้อง", icon: "fas fa-book" },
      { href: "/forms/pinkbook/", title: "ตรวจเล่มชมพู", text: "บันทึกผลการตรวจเล่มชมพู", icon: "fas fa-book-bookmark" },
    ],
  },
  {
    key: "summary",
    title: "สรุปผล",
    text: "ภาพรวมและผลลัพธ์จากแบบฟอร์มทั้งหมด",
    icon: "fas fa-chart-simple",
    items: [
      { href: "/viewforms/building/", title: "สรุปผลการตรวจอาคาร", text: "ภาพรวมผลตรวจอาคาร", icon: "fas fa-chart-column" },
      { href: "/viewforms/inert/", title: "สรุปรายชื่อสาย - เฉื่อย", text: "รายชื่อนักเรียนมาสายและเฉื่อย", icon: "fas fa-list-check" },
      { href: "/viewforms/submit_inert/", title: "สรุปการส่งเล่มตรวจสาย - เฉื่อย", text: "สถานะการส่งเล่มของแต่ละห้อง", icon: "fas fa-clipboard-check", lock: "รหัสผ่าน" },
      { href: "/viewforms/pinkbook/", title: "สรุปผลการตรวจเล่มชมพู", text: "ภาพรวมผลตรวจเล่มชมพู", icon: "fas fa-chart-pie", lock: "รหัสผ่าน" },
    ],
  },
  {
    key: "media",
    title: "คลังภาพ",
    text: "ภาพและวิดีโอจากทุกกิจกรรม",
    icon: "fas fa-images",
    items: [
      { href: "/photos/", title: "อัลบั้มรูปกิจกรรม", text: "รูปภาพและวิดีโอกิจกรรมของพรรค อัปโหลด ดาวน์โหลด และจัดการอัลบั้มได้ในที่เดียว", icon: "fas fa-images", lock: "รหัสผ่าน" },
    ],
  },
  {
    key: "projects",
    title: "โปรเจกต์ของ NEXT9",
    text: "ระบบและแอปที่สภานักเรียนพัฒนาขึ้นเอง",
    icon: "fas fa-rocket",
    items: [
      { href: "https://app-ciga-next9.yumistack.net/", title: "Next Breath", text: "แอปช่วยเลิกบุหรี่ สำหรับผู้สูบและครอบครัว มีมินิเกม SOS และติดตามสุขภาพ", icon: "fas fa-lungs", external: true },
      { href: "https://lin.ee/xwrSHNg", title: "Next Breath LINE Official", text: "เพิ่มเพื่อนเพื่อรับการแจ้งเตือนและกำลังใจ", icon: "fab fa-line", external: true },
      { href: `${ASSESS}/`, title: "ประเมินกิจกรรมหน้าเสาธง", text: "ติดตามและประเมินผลกิจกรรมหน้าเสาธงของแต่ละสายชั้น", icon: "fas fa-flag", lock: "เข้าสู่ระบบ", external: true },
      { href: `${ASSESS}/evaluate`, title: "หน้าประเมินกิจกรรมหน้าเสาธง", text: "สำหรับผู้ประเมินกรอกคะแนนของแต่ละแถว", icon: "fas fa-pen-to-square", lock: "เข้าสู่ระบบ", external: true },
    ],
  },
  {
    key: "admin",
    title: "สำหรับผู้ดูแล",
    text: "ตั้งค่าและจัดการข้อมูลเบื้องหลังของทุกระบบ",
    icon: "fas fa-user-shield",
    restricted: true,
    items: [
      { href: "/member/editor/", title: "จัดการข้อมูลสมาชิก", text: "แก้ไขข้อมูลและรูปโปรไฟล์สมาชิกบนเว็บไซต์", icon: "fas fa-id-card", lock: "รหัสผ่าน" },
      { href: "/forms/toilet/manage/", title: "จัดการแบบฟอร์มห้องน้ำ", text: "ดูและจัดการเรื่องที่แจ้งเข้ามา", icon: "fas fa-restroom", lock: "รหัสผ่าน" },
      { href: "/forms/toilet/admin/", title: "ตั้งค่าระบบห้องน้ำ", text: "จัดการห้องน้ำและ QR Code", icon: "fas fa-screwdriver-wrench", lock: "รหัสผ่าน" },
      { href: "/forms/inert/edit/", title: "ตั้งค่าฟิลด์แบบฟอร์มสาย - เฉื่อย", text: "แก้ไขหัวข้อในแบบฟอร์ม", icon: "fas fa-sliders", lock: "รหัสผ่าน" },
      { href: "https://ciga-next9.yumistack.net/", title: "Next Breath แดชบอร์ด", text: "วิเคราะห์ผลและข้อมูลผู้เข้าร่วมแบบไม่ระบุตัวตน", icon: "fas fa-gauge-high", lock: "ผู้ดูแล", external: true },
      { href: `${ASSESS}/admin`, title: "จัดการระบบประเมินหน้าเสาธง", text: "เพิ่มหรือลบบัญชีผู้ประเมินที่เข้าใช้งานได้", icon: "fas fa-user-shield", lock: "ผู้ดูแล", external: true },
      { href: `${ASSESS}/admin/logs`, title: "ประวัติการใช้งานระบบประเมิน", text: "ดูว่าใครแก้ไขอะไร เมื่อไหร่", icon: "fas fa-clock-rotate-left", lock: "ผู้ดูแล", external: true },
    ],
  },
];
