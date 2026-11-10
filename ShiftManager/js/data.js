// ─────────────────────────────────────────────
// data.js — ข้อมูลสมาชิก ตำแหน่ง จุดเวร สถานะ
// แก้ไขที่ไฟล์นี้ไฟล์เดียวเมื่อต้องการเปลี่ยนข้อมูล
// ─────────────────────────────────────────────

// cls = ชั้น, no = เลขที่ (จากทะเบียนนักเรียนของเว็บ next9) — ใช้ในหน้าสรุป
const MEMBERS = [
  { id: 1,  nickname: "แบงค์",    fullName: "นายณัฐพงษ์ พงษ์นุเคราะห์ศิริ",     position: "ประชาสัมพันธ์", cls: "5/2", no: "32" },
  { id: 2,  nickname: "ธีร์",      fullName: "นายธิติวุฒิ โสวภาค",               position: "หัวหน้าอาคารสถานที่", cls: "5/2", no: "22" },
  { id: 3,  nickname: "ตองหนึ่ง",  fullName: "นางสาวเจียระไน สุนทรารักษ์",       position: "ฝ่ายระดับชั้น ม.5", cls: "5/2", no: "25" },
  { id: 4,  nickname: "มุกดา",     fullName: "นางสาวญาตาวี แสงธนู",              position: "หัวหน้าฝ่ายบริหารวิชาการ", cls: "5/3", no: "9" },
  { id: 5,  nickname: "เมย์",      fullName: "นางสาวชนากานต์ บัวหลวง",           position: "รองประธาน 2", cls: "5/5", no: "28" },
  { id: 6,  nickname: "เกต",       fullName: "นางสาวธนัฐพร สายกระสุน",           position: "เลขานุการ", cls: "5/5", no: "12" },
  { id: 7,  nickname: "ฟ้า/5",     fullName: "นางสาวกัญญารัตน์ สุขยานุดิษฐ",     position: "เหรัญญิก", cls: "5/5", no: "18" },
  { id: 8,  nickname: "มาวิน",     fullName: "นายพลพจน์ ไพรทูลย์",               position: "ประชาสัมพันธ์", cls: "5/5", no: "24" },
  { id: 9,  nickname: "เกรซ",      fullName: "นางสาวณหทัย สุภิมารส",             position: "หัวหน้าทัศนศึกษา", cls: "5/5", no: "1" },
  { id: 10, nickname: "กระต่าย",   fullName: "นางสาวพิรญา แจ่มใส",              position: "รองหัวหน้าระดับชั้น ม.1", cls: "5/5", no: "36" },
  { id: 11, nickname: "แคมปัส",    fullName: "นายธีรภัทร ผลพูน",                 position: "หัวหน้าฝ่ายสารสนเทศ", cls: "5/5", no: "38" },
  { id: 12, nickname: "ตังค์",     fullName: "นายเพชรกร สกุลสุรินทร์",           position: "ผู้ช่วยระดับชั้น ม.5", cls: "5/5", no: "5" },
  { id: 13, nickname: "ข้าวหอม",   fullName: "นางสาวฐานันตร์ พะนิรัมย์",         position: "ประชาสัมพันธ์", cls: "5/5", no: "26" },
  { id: 14, nickname: "พีค",       fullName: "นางสาวรตีภัทร ทองศรี",             position: "ฝ่ายแผนงานและสารสนเทศ", cls: "5/6", no: "21" },
  { id: 15, nickname: "ยีนส์",     fullName: "นางสาวกานกวิญจน์ ต่อยอด",          position: "หัวหน้าฝ่ายประเมินนิเทศติดตาม", cls: "5/6", no: "11" },
  { id: 16, nickname: "ไตเติ้ล",   fullName: "นายกรกฎ พรมสีใหม่",                position: "ฝ่ายอาคารสถานที่", cls: "5/6", no: "24" },
  { id: 17, nickname: "ปลื้ม",     fullName: "นายธัญพิสิษฐ์ ทองนำ",              position: "ผู้ช่วยหัวหน้าฝ่ายระเบียบวินัย", cls: "5/6", no: "40" },
  { id: 18, nickname: "ซานต้า",    fullName: "นางสาวอรุณวรรณ ไสยลา",             position: "เลขาฝ่ายวิชาการ", cls: "5/6", no: "16" },
  { id: 19, nickname: "กาลาแม",    fullName: "นางสาวเพลงพรรษ ทองเปลว",           position: "รองฝ่ายงานกิจกรรม", cls: "5/6", no: "26" },
  { id: 20, nickname: "เปียโน",    fullName: "นางสาวสุปรียา จันดา",              position: "ฝ่ายปฏิคม - ผู้ช่วยปฏิคม", cls: "5/7", no: "13" },
  { id: 21, nickname: "เอย",       fullName: "นางสาวกัญญาภัค อินทรเสาร์",        position: "ผู้ช่วยประชาสัมพันธ์", cls: "5/7", no: "8" },
  { id: 22, nickname: "โฮป",       fullName: "นางสาวพอเพียง ตุ้มนาค",            position: "หัวหน้ากิจการ", cls: "5/7", no: "1" },
  { id: 23, nickname: "ปูน",       fullName: "นางสาวกานต์พิชชา ลายทอง",          position: "หัวหน้าระเบียบวินัย", cls: "5/8", no: "1" },
  { id: 24, nickname: "วุ้นเส้น",  fullName: "นางสาวณิชกุล กิ่งแก้ว",            position: "สมาชิกสภานักเรียน", cls: "5/8", no: "13" },
  { id: 25, nickname: "ฟ้า/8",     fullName: "นางสาวบวรลักษณ์ เสียวน้อย",         position: "สมาชิกสภานักเรียน", cls: "5/8", no: "29" },
  { id: 26, nickname: "เดียร์",    fullName: "นางสาวภิญญาพัชญ์ อินทร์สอน",       position: "ผู้ช่วยเลขานุการ", cls: "5/9", no: "4" },
  { id: 27, nickname: "หมิว",      fullName: "นางสาวธนพร เหมือนคิด",             position: "ฝ่ายอาคารสถานที่ - ผู้ช่วยและเลขานุการ", cls: "5/11", no: "3" },
  { id: 28, nickname: "ลีอัน",     fullName: "นางสาวลีอัน กาวาร์",               position: "หัวหน้าปฏิคม", cls: "5/12", no: "29" },
  { id: 29, nickname: "อาร์ต",     fullName: "นางสาวภัทรวดี ทัพทวี",             position: "ฝ่ายกิจกรรม - หัวหน้างานกิจกรรม", cls: "5/12", no: "15" },
  { id: 30, nickname: "ลันเต",     fullName: "นางสาวปาริณลดา แสงทับทิม",          position: "ประชาสัมพันธ์ - หัวหน้า", cls: "5/12", no: "19" },
  { id: 31, nickname: "ไจ๋",       fullName: "นางสาวกัญญาณัฐ อัมหะธร",           position: "รองฝ่ายประชาสัมพันธ์", cls: "5/12", no: "21" },
  { id: 32, nickname: "ออกัส",     fullName: "นางสาวศศิกานต์ ทวดอาจ",            position: "ผู้ช่วยปฏิคม", cls: "5/12", no: "20" },
  { id: 33, nickname: "ชมพู่",     fullName: "นางสาวนิรมล ทุนาบูรณ์",            position: "หัวหน้าบริหารทั่วไป", cls: "5/13", no: "6" },
  { id: 34, nickname: "พิ้งกี้",   fullName: "นางสาวปวีณ์ธิดา บุญนอง",           position: "ประธานสภานักเรียน", cls: "5/16", no: "10" },
  { id: 35, nickname: "ทอฝัน",     fullName: "นางสาวชุดาณัฏฐ์ สุขอุ้ม",           position: "รองประธาน", cls: "5/16", no: "8" },
  { id: 37, nickname: "ม่อน",      fullName: "นางสาวภัทรานิษฐ์ นภาคเวช",         position: "หัวหน้าขอเวลาเรียน", cls: "5/16", no: "29" },
  { id: 38, nickname: "ใบหม่อน",   fullName: "นางสาวจิรัชญา ศรีผุย",             position: "หัวหน้าระดับ ม.3", cls: "5/16", no: "19" },
  { id: 39, nickname: "น้ำหนึ่ง",  fullName: "นางสาวอรวิภา บุญหมั้น",            position: "หัวหน้าระดับชั้น", cls: "5/16", no: "32" },
];

// จุดเวรทั้งหมด
const DUTY_STATIONS = [
  "สายเฉื่อยหลังโดม",
  "สายเฉื่อยอาคาร 5",
  "พิธีกร",
  "ร้องเพลง",
  "เชิญธง",
  "เวรประตู 1",
  "เวรประตู 2",
  "เวรประตู 4",
  "สายเฉื่อยบริเวณมุมรักสิรินธร",
  "สายเฉื่อยบริเวณโรงรถ",
  "ห้องน้ำสนามบาส",
  "สายเฉื่อยหน้าอาคาร 9",
  "ตรวจแถวในโดม",
  "เวรห้องน้ำอาคาร 10",
  "บริหาร",
];

// สถานะการมา/ลา  (key ใช้กับสีใน CSS, icon เป็นชื่อไอคอน Font Awesome)
const STATUSES = [
  { value: "มาปฏิบัติงาน",        key: "present",  short: "มา",      icon: "fa-circle-check" },
  { value: "ไม่ได้ปฏิบัติหน้าที่",  key: "absent",   short: "ไม่ได้ปฏิบัติ", icon: "fa-circle-xmark" },
  { value: "ลาป่วย",             key: "sick",     short: "ป่วย",    icon: "fa-temperature-half" },
  { value: "ลากิจ",              key: "leave",    short: "ลากิจ",   icon: "fa-file-lines" },
  { value: "ไปทำกิจกรรมโรงเรียน", key: "activity", short: "กิจกรรม", icon: "fa-school" },
  { value: "อื่นๆ",              key: "other",    short: "อื่นๆ",   icon: "fa-circle-plus" },
];

// Helper: หา member จาก id
function getMemberById(id) {
  return MEMBERS.find(m => m.id === id) || null;
}

// Helper: หา member จากชื่อเต็ม
function getMemberByFullName(fullName) {
  return MEMBERS.find(m => m.fullName === fullName) || null;
}
