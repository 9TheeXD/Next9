// Settings that the council edits from the admin pages (/admin/) instead of the code.
//
// Every section is one JSON document in kv_store under "settings:<section>". A section that was never
// saved reads as its default below, which is exactly what the site showed before it had settings, so
// an empty database behaves like the old hard-coded site. Saving a section stores the whole document.
//
//   await getSettings("site")              // defaults merged with what was saved
//   await saveSettings("site", value)
//   await getPasswords()                   // { admin, editor, photos, toilet, pinkbook, viewforms }
//   await getSecret("line_channel_secret") // saved value, else the environment variable
//
// Passwords and integration keys live in their own documents ("passwords", "secrets") that only the
// admin API reads. The environment variables of the same name still work as the starting values, so
// a new deployment works before anyone opens the admin pages.
import crypto from "node:crypto"
import { kvGet, kvSet } from "./kv.mjs"
import { BUILDING_ROOMS, DUTY_MEMBERS, DUTY_STATIONS, DUTY_STATUSES } from "./settings-data.mjs"

const CACHE_MS = 10 * 1000

// Files in R2 are served through /api/file/<key> (a redirect to a signed R2 URL), so pages never
// depend on the bucket's own public domain.
export const fileUrl = (key) => (!key ? "" : /^(https?:)?\/\//.test(key) || key.startsWith("/") ? key : `/api/file/${key}`)

export const DEFAULTS = {
    // Name, logo and the texts every page shares.
    site: {
        name: "NEXT9",
        council: "สภานักเรียนโรงเรียนสิรินธร",
        school: "โรงเรียนสิรินธร",
        motto: "ทุกทางเพื่อสิรินธร ทุกทางเพื่อเกียรติกำจร",
        logo: "next9/logo01.webp",
        theme_color: "#b00909",
        problem_form_url: "https://forms.gle/6WjWZoyAdGDNJxcSA",
        nav: [
            { href: "/", label: "หน้าแรก" },
            { href: "/about/", label: "เกี่ยวกับ" },
            { href: "/policy/", label: "นโยบาย" },
            { href: "/member/", label: "สมาชิก" },
            { href: "/problem/", label: "แจ้งปัญหา" },
        ],
        social: [
            { href: "https://www.facebook.com/SirindhornStudentCouncil", label: "Facebook", icon: "fab fa-facebook-f" },
            { href: "https://www.instagram.com/sdh.studentcouncil", label: "Instagram", icon: "fab fa-instagram" },
        ],
    },
    home: {
        slides: [
            { image: "next9/411.webp", alt: "สมาชิกพรรค NEXT9" },
            { image: "next9/412.webp", alt: "โรงเรียนสิรินธร" },
        ],
        eyebrow: "สภานักเรียนโรงเรียนสิรินธร",
        title: "ก้าวใหม่ ก้าวต่อไป",
        title_highlight: "กับ NEXT9",
        quick: [
            { href: "/member/", icon: "fas fa-users", title: "สมาชิกสภา", text: "รู้จักทีม NEXT9 ทุกฝ่าย" },
            { href: "/member/grade/", icon: "fas fa-layer-group", title: "งานระดับชั้น", text: "ทีมประจำ ม.1 – ม.6" },
            { href: "/policy/", icon: "fas fa-list-check", title: "นโยบาย", text: "7 นโยบายที่ทำได้จริง" },
            { href: "/problem/", icon: "fas fa-comment-dots", title: "แจ้งปัญหา", text: "ส่งเรื่องถึงสภาได้ทันที" },
        ],
        policy_title: "นโยบายหลักของเรา",
        policy_text: "มุ่งเน้นความสะอาด สุขอนามัย และพื้นที่สร้างสรรค์เพื่อทุกคน",
        policy_count: 4,
        cta_title: "พบปัญหาในโรงเรียน?",
        cta_text: "บอกเราได้เลย ทุกเรื่องถูกส่งถึงทีม NEXT9 โดยตรง",
    },
    about: {
        eyebrow: "ขอขอบคุณสำหรับทุกคะแนนเสียง",
        title: "ก้าวใหม่ ก้าวต่อไป กับ",
        title_highlight: "NEXT9",
        lead: "พรรคสภานักเรียนโรงเรียนสิรินธร ที่พร้อมพัฒนาโรงเรียนในทุกด้าน เพื่อเพื่อน พี่ และน้องทุกคน",
        cards: [
            { href: "/member/", icon: "fas fa-users", title: "สมาชิกพรรค", action: "ดูรายชื่อ" },
            { href: "/policy/", icon: "fas fa-list-check", title: "นโยบาย", action: "ดูนโยบาย" },
            { href: "/problem/", icon: "fas fa-comment-dots", title: "แจ้งปัญหา", action: "ระบบแจ้งเรื่อง" },
        ],
        social_title: "ติดตามเราได้ที่",
        social_text: "อัปเดตความเคลื่อนไหวและนโยบายล่าสุด",
    },
    problem: {
        eyebrow: "เสียงของเพื่อน พี่ น้อง คือจุดเริ่มต้นของการเปลี่ยนแปลง",
        title: "ร่วมแจ้งปัญหา",
        lead: "หากพบปัญหา หรือมีข้อแนะนำที่ต้องการให้ทีม NEXT9 เร่งดำเนินการแก้ไข ส่งเรื่องผ่านระบบแจ้งออนไลน์ได้ทันที",
        button: "คลิกเพื่อแจ้งปัญหา",
        steps: [
            { icon: "fas fa-pen", title: "เล่าปัญหา", text: "กรอกแบบฟอร์มออนไลน์ บอกว่าเกิดอะไร ที่ไหน" },
            { icon: "fas fa-paper-plane", title: "ส่งถึงสภา", text: "เรื่องถูกส่งถึงทีม NEXT9 โดยตรง" },
            { icon: "fas fa-screwdriver-wrench", title: "ติดตามแก้ไข", text: "ทีมรับเรื่องประสานงานและเร่งแก้ไข" },
        ],
        note: "ปัญหาห้องน้ำ: สแกน QR Code ที่ติดอยู่หน้าห้องน้ำแต่ละห้อง เพื่อแจ้งได้ตรงจุดที่สุด",
    },
    policies: {
        eyebrow_suffix: "นโยบาย · ทำได้จริง",
        title: "นโยบายของเรา",
        lead: "ก้าวใหม่ก้าวต่อไปกับ NEXT9 — พัฒนาโรงเรียนเพื่อทุกคน",
        items: [
            {
                tag: "สุขาภิบาล", title: "The Bathroom Pieces", icon: "fas fa-toilet",
                summary: "ยกระดับห้องน้ำให้สะอาด มีก้านไม้หอม และ QR Code แจ้งซ่อม",
                text: "ยกระดับห้องน้ำโรงเรียนให้สะอาดและน่าใช้งาน",
                points: [
                    "กระดาษห่อผ้าอนามัย — ทำจุดรับบริจาคกระดาษจากนักเรียนและคณะคุณครู",
                    "ก้านไม้หอม — สำหรับดับกลิ่นในห้องน้ำ",
                    "QR Code ร้องเรียนปัญหา — สแกนแจ้งเมื่อมีสิ่งชำรุด เพิ่มความรวดเร็วในการแก้ไข มีการเก็บสถิติทุกเดือน",
                ],
                note: "",
            },
            {
                tag: "สื่อสาร", title: "ประชาสัมพันธ์ทันด่วน", icon: "fas fa-bullhorn",
                summary: "ช่องทาง TikTok/IG สำหรับประกาศข่าวสารและการศึกษาต่อ",
                text: "เพิ่มประสิทธิภาพช่องทาง TikTok และ Instagram โดยมีสภาเป็นผู้ดูแล ประกาศข่าวสารต่างๆ เช่น",
                points: ["เรื่องเวทีการแข่งขัน", "การสอบเข้าชั้น ม.1", "การสอบเข้าชั้น ม.4", "รายละเอียดการสอบของ ม.6 เพื่อศึกษาต่อระดับมหาวิทยาลัย", "แนะแนวแผนการเรียน"],
                note: "",
            },
            {
                tag: "สุขอนามัย", title: "Hands Clean", icon: "fas fa-hand-sparkles",
                summary: "จุดล้างมือพร้อมน้ำยาทำความสะอาดทั่วถึงทั้งโรงเรียน",
                text: "เตรียมน้ำยาล้างมือให้พร้อมสำหรับจุดล้างมือทุกจุดภายในโรงเรียน ดูแลสุขอนามัยของนักเรียนทุกคนอย่างทั่วถึง",
                points: [], note: "",
            },
            {
                tag: "กิจกรรม", title: "Stage of Us", icon: "fas fa-microphone",
                summary: "เวทีแสดงความสามารถ Folk Song และ Random Dance",
                text: "เวทีแสดงความสามารถของนักเรียน จัด 2 ครั้งต่อเดือน",
                points: ["Folk Song", "Random Dance / Cover Dance", "เกียรติบัตรสำหรับผู้เข้าร่วม"],
                note: "หากมีการเปลี่ยนแปลง ทางสภาจะแจ้งให้ทราบผ่านเพจสภานักเรียน",
            },
            {
                tag: "สิ่งอำนวยความสะดวก", title: "กดได้หายห่วง", icon: "fas fa-droplet",
                summary: "ทำความสะอาดตู้กดน้ำอย่างต่อเนื่อง",
                text: "ทำความสะอาดตู้กดน้ำของโรงเรียนอย่างต่อเนื่อง เพื่อให้นักเรียนมั่นใจในความสะอาดและปลอดภัยทุกครั้งที่ใช้งาน",
                points: [], note: "",
            },
            {
                tag: "สภาพแวดล้อม", title: "Beauty Classroom", icon: "fas fa-broom",
                summary: "ประเมินห้องเรียนสะอาดทุกเดือน",
                text: "จัดการประเมินทุกเดือนเพื่อจัดลำดับห้องเรียนสะอาดในแต่ละระดับชั้นต่อเทอม",
                points: ["อันดับ 1 — ได้รับเงินรางวัลสำหรับเป็นเงินห้อง", "อันดับถัดไป — ได้รับเกียรติบัตรห้อง"],
                note: "",
            },
            {
                tag: "กิจกรรมสร้างสรรค์", title: "ปกสมุดรุ่นใหม่", icon: "fas fa-book",
                summary: "ประกวดออกแบบปกสมุดโรงเรียน",
                text: "ประกวดปกสมุดโรงเรียน พร้อมเกียรติบัตรสำหรับผู้เข้าร่วม",
                points: ["เปิดโอกาสให้นักเรียนออกแบบปกสมุดด้วยตนเอง", "ห้ามใช้ AI ในการสร้างสรรค์ผลงาน — หากพบจะถูกตัดสิทธิ์ทันที"],
                note: "",
            },
        ],
    },
    // How the member pages group people. The people themselves are edited at /member/editor/.
    members: {
        eyebrow: "NEXT9 · สภานักเรียน",
        title: "สมาชิกสภานักเรียน",
        lead: "บุคลากรคุณภาพ พร้อมพัฒนาโรงเรียนในทุกด้าน",
        exec: [
            { unit: "president", caption: "ประธานสภานักเรียน" },
            { unit: "vp1", caption: "รองประธาน 1" },
            { unit: "vp2", caption: "รองประธาน 2" },
            { unit: "secretary", caption: "เลขานุการ" },
            { unit: "treasurer", caption: "เหรัญญิก" },
        ],
        depts: [
            {
                key: "academic", data_dept: "", name: "ฝ่ายบริหารวิชาการ", short: "วิชาการ", tagline: "ดูแลการเรียนรู้ ข้อมูล และระเบียบของสภานักเรียน",
                units: [
                    { key: "head", name: "หัวหน้าฝ่าย" }, { key: "evaluation", name: "งานรับการประเมิน/นิเทศ/ติดตาม" }, { key: "it", name: "งานวางแผนสารสนเทศ" },
                    { key: "attendance", name: "งานขอเวลาเรียน" }, { key: "charter", name: "งานจัดทำธรรมนูญ/คู่มือสภานักเรียน" },
                ],
            },
            {
                key: "affairs", data_dept: "", name: "ฝ่ายบริหารกิจการนักเรียน", short: "กิจการนักเรียน", tagline: "ดูแลกิจกรรม ระเบียบวินัย และนักเรียนทุกระดับชั้น",
                units: [
                    { key: "head", name: "หัวหน้าฝ่าย" }, { key: "grade", name: "งานระดับชั้น" }, { key: "discipline", name: "งานระเบียบวินัย" },
                    { key: "whiteclass", name: "งานห้องเรียนสีขาว" }, { key: "activity", name: "งานกิจกรรม" },
                ],
            },
            {
                key: "general", data_dept: "", name: "ฝ่ายบริหารทั่วไป", short: "บริหารทั่วไป", tagline: "ดูแลการสื่อสาร สถานที่ และการต้อนรับ",
                units: [
                    { key: "head", name: "หัวหน้าฝ่าย" }, { key: "pr", name: "งานประชาสัมพันธ์" }, { key: "building", name: "งานอาคารสถานที่และอนุรักษ์สิ่งแวดล้อม" },
                    { key: "reception", name: "งานปฏิคม" }, { key: "fieldtrip", name: "งานทัศนศึกษาดูงาน" },
                ],
            },
            { key: "secretary", data_dept: "executive", name: "ฝ่ายเลขานุการ", short: "เลขานุการ", tagline: "ดูแลเอกสาร บันทึกการประชุม และงานธุรการของสภานักเรียน", units: [{ key: "secretary", name: "เลขานุการ" }] },
            { key: "treasurer", data_dept: "executive", name: "ฝ่ายเหรัญญิก", short: "เหรัญญิก", tagline: "ดูแลการเงิน งบประมาณ และบัญชีของสภานักเรียน", units: [{ key: "treasurer", name: "เหรัญญิก" }] },
        ],
        grade_title: "งานระดับชั้น",
        grade_text: "ทีมดูแลนักเรียนแต่ละระดับชั้น ใกล้ชิดทุกห้องเรียน",
        grade_lead: "ทีมสภานักเรียนประจำแต่ละระดับชั้น ม.1 ถึง ม.6 เป็นตัวกลางระหว่างนักเรียนกับสภา รับฟังทุกเสียงอย่างใกล้ชิด",
        role_suggestions: [
            "ประธานสภา", "รองประธาน 1", "รองประธาน 2", "เลขานุการ", "เหรัญญิก",
            "หัวหน้าฝ่ายบริหารวิชาการ", "หัวหน้าฝ่ายบริหารกิจการนักเรียน", "หัวหน้าฝ่ายบริหารทั่วไป",
            "หัวหน้างานรับการประเมิน/นิเทศ/ติดตาม", "หัวหน้างานวางแผนสารสนเทศ", "หัวหน้างานขอเวลาเรียน",
            "หัวหน้างานจัดทำธรรมนูญ/คู่มือสภานักเรียน", "หัวหน้างานระดับชั้น", "หัวหน้างานระเบียบวินัย",
            "หัวหน้างานห้องเรียนสีขาว", "หัวหน้างานกิจกรรม", "หัวหน้างานประชาสัมพันธ์",
            "หัวหน้างานอาคารสถานที่และอนุรักษ์สิ่งแวดล้อม", "หัวหน้างานปฏิคม", "หัวหน้างานทัศนศึกษาดูงาน",
            "หัวหน้าระดับชั้นม.1", "หัวหน้าระดับชั้นม.2", "หัวหน้าระดับชั้นม.3", "หัวหน้าระดับชั้นม.4", "หัวหน้าระดับชั้นม.5", "หัวหน้าระดับชั้นม.6",
        ],
    },
    // The /links/ hub.
    links: {
        title: "ศูนย์รวมระบบภายใน",
        sections: [
            {
                key: "forms", title: "แบบฟอร์มงานสภานักเรียน", text: "บันทึกผลการตรวจประจำวันของสมาชิกสภา", icon: "fas fa-file-pen", restricted: false,
                items: [
                    { href: "/forms/building/", title: "ตรวจอาคาร", text: "บันทึกผลการตรวจความเรียบร้อยของอาคาร", icon: "fas fa-building", lock: "", external: false },
                    { href: "/forms/inert/", title: "ลงชื่อสาย - เฉื่อย", text: "บันทึกรายชื่อนักเรียนมาสายและเฉื่อย", icon: "fas fa-user-clock", lock: "", external: false },
                    { href: "/forms/submit_inert/", title: "รายงานส่งเล่มตรวจสาย - เฉื่อย", text: "บันทึกการส่งเล่มตรวจของแต่ละห้อง", icon: "fas fa-book", lock: "", external: false },
                    { href: "/forms/pinkbook/", title: "ตรวจเล่มชมพู", text: "บันทึกผลการตรวจเล่มชมพู", icon: "fas fa-book-bookmark", lock: "", external: false },
                    { href: "/duty/", title: "ลงเวรประจำวัน", text: "บันทึกการปฏิบัติหน้าที่เวรของสมาชิกสภา พร้อมรูปหลักฐาน", icon: "fas fa-calendar-check", lock: "", external: false },
                ],
            },
            {
                key: "summary", title: "สรุปผล", text: "ภาพรวมและผลลัพธ์จากแบบฟอร์มทั้งหมด", icon: "fas fa-chart-simple", restricted: false,
                items: [
                    { href: "/viewforms/building/", title: "สรุปผลการตรวจอาคาร", text: "ภาพรวมผลตรวจอาคาร", icon: "fas fa-chart-column", lock: "", external: false },
                    { href: "/viewforms/inert/", title: "สรุปรายชื่อสาย - เฉื่อย", text: "รายชื่อนักเรียนมาสายและเฉื่อย", icon: "fas fa-list-check", lock: "", external: false },
                    { href: "/viewforms/submit_inert/", title: "สรุปการส่งเล่มตรวจสาย - เฉื่อย", text: "สถานะการส่งเล่มของแต่ละห้อง", icon: "fas fa-clipboard-check", lock: "รหัสผ่าน", external: false },
                    { href: "/viewforms/pinkbook/", title: "สรุปผลการตรวจเล่มชมพู", text: "ภาพรวมผลตรวจเล่มชมพู", icon: "fas fa-chart-pie", lock: "รหัสผ่าน", external: false },
                    { href: "/duty/summary.html", title: "สรุปการลงเวร", text: "ตารางสรุปการมาปฏิบัติหน้าที่เวรของสมาชิก", icon: "fas fa-table-list", lock: "", external: false },
                ],
            },
            {
                key: "media", title: "คลังภาพ", text: "ภาพและวิดีโอจากทุกกิจกรรม", icon: "fas fa-images", restricted: false,
                items: [
                    { href: "/photos/", title: "อัลบั้มรูปกิจกรรม", text: "รูปภาพและวิดีโอกิจกรรมของพรรค อัปโหลด ดาวน์โหลด และจัดการอัลบั้มได้ในที่เดียว", icon: "fas fa-images", lock: "รหัสผ่าน", external: false },
                ],
            },
            {
                key: "projects", title: "โปรเจกต์ของ NEXT9", text: "ระบบและแอปที่สภานักเรียนพัฒนาขึ้นเอง", icon: "fas fa-rocket", restricted: false,
                items: [
                    { href: "https://next9-ciga-app.vercel.app/", title: "Next Breath", text: "แอปช่วยเลิกบุหรี่ สำหรับผู้สูบและครอบครัว มีมินิเกม SOS และติดตามสุขภาพ", icon: "fas fa-lungs", lock: "", external: true },
                    { href: "https://lin.ee/xwrSHNg", title: "Next Breath LINE Official", text: "เพิ่มเพื่อนเพื่อรับการแจ้งเตือนและกำลังใจ", icon: "fab fa-line", lock: "", external: true },
                    { href: "https://assess-row-sdh.vercel.app/", title: "ประเมินกิจกรรมหน้าเสาธง", text: "ติดตามและประเมินผลกิจกรรมหน้าเสาธงของแต่ละสายชั้น", icon: "fas fa-flag", lock: "เข้าสู่ระบบ", external: true },
                    { href: "https://assess-row-sdh.vercel.app/evaluate", title: "หน้าประเมินกิจกรรมหน้าเสาธง", text: "สำหรับผู้ประเมินกรอกคะแนนของแต่ละแถว", icon: "fas fa-pen-to-square", lock: "เข้าสู่ระบบ", external: true },
                ],
            },
            {
                key: "admin", title: "สำหรับผู้ดูแล", text: "ตั้งค่าและจัดการข้อมูลเบื้องหลังของทุกระบบ", icon: "fas fa-user-shield", restricted: true,
                items: [
                    { href: "/admin/", title: "หน้าจัดการระบบ", text: "ตั้งค่าเว็บไซต์ แบบฟอร์ม รหัสผ่าน และทุกระบบในที่เดียว", icon: "fas fa-gears", lock: "ผู้ดูแล", external: false },
                    { href: "/member/editor/", title: "จัดการข้อมูลสมาชิก", text: "แก้ไขข้อมูลและรูปโปรไฟล์สมาชิกบนเว็บไซต์", icon: "fas fa-id-card", lock: "รหัสผ่าน", external: false },
                    { href: "/forms/toilet/manage/", title: "จัดการแบบฟอร์มห้องน้ำ", text: "ดูและจัดการเรื่องที่แจ้งเข้ามา", icon: "fas fa-restroom", lock: "รหัสผ่าน", external: false },
                    { href: "/forms/toilet/admin/", title: "ตั้งค่าระบบห้องน้ำ", text: "จัดการห้องน้ำและ QR Code", icon: "fas fa-screwdriver-wrench", lock: "รหัสผ่าน", external: false },
                    { href: "/forms/inert/edit/", title: "ตั้งค่าแบบฟอร์มสาย - เฉื่อย", text: "แก้ไขหัวข้อในแบบฟอร์ม และ Google Sheet ของแต่ละภาคเรียน", icon: "fas fa-sliders", lock: "รหัสผ่าน", external: false },
                    { href: "https://next9-ciga-admin.vercel.app/", title: "Next Breath แดชบอร์ด", text: "วิเคราะห์ผลและข้อมูลผู้เข้าร่วมแบบไม่ระบุตัวตน", icon: "fas fa-gauge-high", lock: "ผู้ดูแล", external: true },
                    { href: "https://assess-row-sdh.vercel.app/admin", title: "จัดการระบบประเมินหน้าเสาธง", text: "เพิ่มหรือลบบัญชีผู้ประเมินที่เข้าใช้งานได้", icon: "fas fa-user-shield", lock: "ผู้ดูแล", external: true },
                    { href: "https://assess-row-sdh.vercel.app/admin/logs", title: "ประวัติการใช้งานระบบประเมิน", text: "ดูว่าใครแก้ไขอะไร เมื่อไหร่", icon: "fas fa-clock-rotate-left", lock: "ผู้ดูแล", external: true },
                ],
            },
        ],
    },
    // School terms: the one list every system uses (forms, summaries, the pinkbook's week count and
    // the assessment system). The current term follows the dates unless one is pinned.
    terms: {
        mode: "auto",
        pinned: "",
        list: [
            { semester: 2, year: 2569, start: "2026-10-26", end: "2027-03-31" },
            { semester: 1, year: 2569, start: "2026-05-16", end: "2026-10-10" },
        ],
    },
    building: {
        buildings: BUILDING_ROOMS,
        items_v2: ["หลังห้องเรียน", "หลังตู้ล็อกเกอร์(ถ้าห้องนั้นมี)", "หน้าห้องเรียน", "กระดานดำ", "โต๊ะนักเรียน", "การปิดเครื่องใช้ไฟฟ้า"],
        items_v1: ["เก็บขยะ กวาดพื้น ถูพื้น", "จัดโต๊ะ เก้าอี้หน้าห้อง", "จัดโต๊ะ เก้าอี้นักเรียน", "ลบกระดาน เก็บแปรงลบ และปากกา", "จัดโต๊ะครู อย่างเป็นระเบียบ เรียบร้อย"],
        scores: [
            { value: 3, label: "ดีมาก" }, { value: 2, label: "พอใช้" }, { value: 1, label: "ปรับปรุง" }, { value: 0, label: "ไม่ผ่าน" },
        ],
    },
    submit_inert: {
        places: ["ข้างอ.5", "หลังโดม"],
    },
    toilet_form: {
        roles: ["นักเรียน", "ครู", "บุคคลอื่น"],
    },
    // Google Sheets the site writes to. The inert form's sheets are per term, in its own settings
    // (/forms/inert/edit/).
    // Until saved here, the environment variables the site used before are shown (and used).
    sheets: {
        building_sheet_id: process.env.BUILDING_SHEET_ID || "1EKh6YRmxjBRY6Nw12selyNEJ4RQjY5D5BDZXBGemksw",
        students_sheet_id: process.env.STUDENTS_SHEET_ID || "",
    },
    // How the student list is read from its Google Sheet (server/students.mjs).
    students_import: {
        sheet_id: process.env.STUDENTS_SHEET_ID || "",
        tabs: [],
        mode: "header",
        header_pattern: "มัธยมศึกษาปีที่ {ชั้น}/{ห้อง} {สาย}",
        header_column: "A",
        col_number: "A",
        col_student_id: "C",
        col_prefix: "D",
        col_first_name: "E",
        col_last_name: "F",
        col_full_name: "",
        col_grade: "",
        col_room: "",
        col_track: "",
        min_id_length: 4,
    },
    // Duty check-in (/duty/, ShiftManager).
    duty: {
        script_url: "https://script.google.com/macros/s/AKfycbxszGjIM5-zYLRYaSJ6-O5Ulv2xsdf_x7pDJ0MAOMXgUNDt4Idm7YtL1p14yOcmxAp4Lw/exec",
        sheet_id: "1u3nuYSwHyJOigNMjcDUqYCk3xvsNWi9dQlNURRLve-U",
        sheet_gid: "1803925258",
        root_album: "เวรประจำวัน",
        max_photos: 20,
        members: DUTY_MEMBERS,
        stations: DUTY_STATIONS,
        statuses: DUTY_STATUSES,
    },
    // LINE bot (photo uploads by chat).
    line: {
        album_limit: 12,
    },
}

// Sections anyone may read (the pages need them). The others only through the admin API.
export const PUBLIC_SECTIONS = new Set(["site", "home", "about", "problem", "policies", "members", "links", "school", "terms", "building", "submit_inert", "toilet_form", "duty"])

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v)

// ---- School: terms + classes (computed, read-only) ----
// Grades, rooms and the ก/ข groups of each room come from the student list (admin → นักเรียนและห้องเรียน),
// so nothing about the classes is typed in twice. Until a list is imported, these are used.
const FALLBACK_ROOMS = { 1: 14, 2: 14, 3: 14, 4: 16, 5: 16, 6: 16 }

// [{ grade, rooms: [{ room, groups: ["ก","ข"], students }] }] from the student list.
export function computeClassStructure(students) {
    const byGrade = new Map()
    for (const s of students || []) {
        const g = Number(s.class), r = Number(s.room)
        if (!g || !r) continue
        if (!byGrade.has(g)) byGrade.set(g, new Map())
        const rooms = byGrade.get(g)
        if (!rooms.has(r)) rooms.set(r, { room: r, groups: new Set(), students: 0 })
        const room = rooms.get(r)
        room.students++
        if (s.classType) room.groups.add(String(s.classType).trim())
    }
    return [...byGrade.keys()].sort((a, b) => a - b).map((grade) => ({
        grade,
        rooms: [...byGrade.get(grade).values()].sort((a, b) => a.room - b.room)
            .map((r) => ({ room: r.room, groups: [...r.groups].filter(Boolean).sort((a, b) => a.localeCompare(b, "th")), students: r.students })),
    }))
}

export async function getClassStructure() {
    let saved = await kvGet("class_structure", null, { cacheMs: 30 * 1000 })
    if (!saved) {
        const students = await kvGet("students", [])
        if (Array.isArray(students) && students.length) {
            saved = { at: Date.now(), grades: computeClassStructure(students) }
            await kvSet("class_structure", saved)
        }
    }
    if (saved?.grades?.length) return { source: "students", grades: saved.grades }
    return {
        source: "fallback",
        grades: Object.entries(FALLBACK_ROOMS).map(([g, n]) => ({ grade: Number(g), rooms: Array.from({ length: n }, (_, i) => ({ room: i + 1, groups: [], students: 0 })) })),
    }
}

export function bangkokToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

// Monday of the week a date falls in (the pinkbook counts weeks from the term's first Monday).
export function mondayOf(iso) {
    const d = new Date(iso + "T00:00:00Z")
    if (isNaN(d)) return ""
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
}

// Everything the systems need to know about the school year, in one object (public section "school"):
//   current { id "2/2569", semester, year, start, end }, terms (ids newest first), termList,
//   year / term (of the current term), grades [{ grade, name "ม.1", rooms (count), roomList }].
export async function getSchool(today = bangkokToday()) {
    const t = await getSettings("terms")
    const termList = (Array.isArray(t.list) ? t.list : [])
        .filter((x) => x && Number(x.semester) && Number(x.year))
        .map((x) => ({ id: `${Number(x.semester)}/${Number(x.year)}`, semester: Number(x.semester), year: Number(x.year), start: x.start || "", end: x.end || "" }))
        .sort((a, b) => (b.start || "").localeCompare(a.start || "") || b.year - a.year || b.semester - a.semester)
    let current = t.mode === "pinned" ? termList.find((x) => x.id === t.pinned) : null
    let mode = current ? "pinned" : "auto"
    if (!current) current = termList.find((x) => x.start <= today && today <= x.end) || termList.find((x) => x.start && x.start <= today) || termList[termList.length - 1] || null
    const structure = await getClassStructure()
    const grades = structure.grades.map((g) => ({
        grade: g.grade,
        name: `ม.${g.grade}`,
        rooms: g.rooms.length ? Math.max(...g.rooms.map((r) => r.room)) : 0,
        roomList: g.rooms,
    }))
    return {
        today,
        mode,
        current: current ? { ...current, week1: mondayOf(current.start) } : null,
        year: current ? String(current.year) : "",
        term: current ? String(current.semester) : "",
        terms: termList.map((x) => x.id),
        termList,
        classesFrom: structure.source,
        grades,
    }
}

export async function getSettings(section) {
    if (section === "school") return getSchool()
    const def = DEFAULTS[section]
    if (!def) throw new Error(`unknown settings section: ${section}`)
    const saved = await kvGet(`settings:${section}`, null, { cacheMs: CACHE_MS })
    if (!isPlainObject(saved)) return structuredClone(def)
    // Top-level keys only: a saved list replaces the default list as a whole.
    return { ...structuredClone(def), ...saved }
}

export async function getManySettings(sections) {
    const out = {}
    await Promise.all(sections.map(async (s) => { out[s] = await getSettings(s) }))
    return out
}

export async function saveSettings(section, value) {
    if (!DEFAULTS[section]) throw new Error(`unknown settings section: ${section}`)
    if (!isPlainObject(value)) throw new Error("settings must be an object")
    // Keys not sent keep their saved value, so a page that edits part of a section (one sheet ID)
    // does not reset the rest.
    const saved = await kvGet(`settings:${section}`, null)
    const clean = isPlainObject(saved) ? { ...saved } : {}
    for (const k of Object.keys(DEFAULTS[section])) if (k in value) clean[k] = value[k]
    await kvSet(`settings:${section}`, clean)
    return getSettings(section)
}

// ---- Passwords ----
// Kept readable (not hashed) on purpose: the admin pages show them, so a password is never lost when
// the people who set it leave. Only the admin API returns them.
export const PASSWORD_KINDS = {
    admin: { env: "ADMIN_PASSWORD", label: "หน้าจัดการระบบ (/admin/)" },
    editor: { env: "EDITOR_PASSWORD", fallback: "admin123", label: "แก้ไขข้อมูลสมาชิก และตั้งค่าแบบฟอร์มสาย-เฉื่อย" },
    photos: { env: "PHOTOS_PASSWORD", fallback: "next9", label: "คลังภาพ (อัปโหลด/จัดการอัลบั้ม)" },
    toilet: { env: "TOILET_PASSWORD", fallback: "next9", label: "ระบบห้องน้ำ (ดูเรื่องที่แจ้ง/ตั้งค่า)" },
    pinkbook: { env: "PINKBOOK_PASSWORD", fallback: "1", label: "หน้าสรุปผลเล่มชมพู" },
    viewforms: { env: "VIEWFORMS_PASSWORD", fallback: "next9", label: "หน้าสรุปการส่งเล่มตรวจสาย-เฉื่อย" },
}

export async function getPasswords() {
    const saved = (await kvGet("passwords", null, { cacheMs: CACHE_MS })) || {}
    const out = {}
    for (const [kind, def] of Object.entries(PASSWORD_KINDS)) {
        out[kind] = (typeof saved[kind] === "string" && saved[kind]) || process.env[def.env] || def.fallback || ""
    }
    // Until an admin password is set, the member editor's password opens the admin pages.
    if (!out.admin) out.admin = out.editor
    return out
}

export async function savePasswords(values) {
    const saved = (await kvGet("passwords", null)) || {}
    for (const kind of Object.keys(PASSWORD_KINDS)) {
        if (typeof values[kind] !== "string") continue
        const v = values[kind].trim()
        if (v.length < 1) continue
        if (kind === "admin" && v.length < 6) throw new Error("รหัสผ่านผู้ดูแลต้องยาวอย่างน้อย 6 ตัวอักษร")
        saved[kind] = v
    }
    await kvSet("passwords", saved)
    return getPasswords()
}

// ---- Integration keys ----
// Saved values win over the environment variables, so a new team can switch the Google service
// account or the LINE channel from the admin pages.
export const SECRET_KINDS = {
    google_service_account_json: { env: "GOOGLE_SERVICE_ACCOUNT_JSON", label: "Google service account (ไฟล์ JSON ทั้งไฟล์)", json: true },
    line_channel_access_token: { env: "LINE_CHANNEL_ACCESS_TOKEN", label: "LINE Channel access token" },
    line_channel_secret: { env: "LINE_CHANNEL_SECRET", label: "LINE Channel secret" },
    dialogflow_credentials_json: { env: "DIALOGFLOW_CREDENTIALS_JSON", label: "Dialogflow service account (ไฟล์ JSON ทั้งไฟล์)", json: true },
    dialogflow_project_id: { env: "DIALOGFLOW_PROJECT_ID", label: "Dialogflow project ID" },
}

export async function getSecret(name) {
    const def = SECRET_KINDS[name]
    if (!def) throw new Error(`unknown secret: ${name}`)
    const saved = (await kvGet("secrets", null, { cacheMs: CACHE_MS })) || {}
    return (typeof saved[name] === "string" && saved[name]) || process.env[def.env] || ""
}

// What the admin page shows: where each key comes from and a short hint, never the value.
export async function describeSecrets() {
    const saved = (await kvGet("secrets", null)) || {}
    const out = {}
    for (const [name, def] of Object.entries(SECRET_KINDS)) {
        const fromDb = typeof saved[name] === "string" && saved[name]
        const value = fromDb || process.env[def.env] || ""
        let hint = ""
        if (value && def.json) {
            try { const j = JSON.parse(value); hint = j.client_email || j.project_id || "" } catch { hint = "JSON ไม่ถูกต้อง" }
        } else if (value) hint = name.endsWith("_id") ? value : `…${value.slice(-4)}`
        out[name] = { label: def.label, source: fromDb ? "admin" : value ? "env" : "none", hint }
    }
    return out
}

export async function saveSecrets(values) {
    const saved = (await kvGet("secrets", null)) || {}
    for (const [name, def] of Object.entries(SECRET_KINDS)) {
        if (!(name in values)) continue
        const v = values[name]
        if (v === null || v === "") { delete saved[name]; continue }
        if (typeof v !== "string") continue
        if (def.json) {
            try { JSON.parse(v) } catch { throw new Error(`${def.label}: JSON ไม่ถูกต้อง`) }
        }
        saved[name] = v.trim()
    }
    await kvSet("secrets", saved)
    return describeSecrets()
}

export async function getServiceAccount() {
    const raw = await getSecret("google_service_account_json")
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
}

// ---- Admin sign-in ----
// A token is "<expiry>.<hmac>", signed with a key that includes the admin password, so changing the
// password signs everyone out.
const TOKEN_DAYS = 30
function tokenKey(adminPassword) {
    return crypto.createHash("sha256").update(`next9-admin:${process.env.ALBUM_TOKEN_SECRET || ""}:${adminPassword}`).digest()
}
export async function issueAdminToken() {
    const { admin } = await getPasswords()
    const exp = Date.now() + TOKEN_DAYS * 86400 * 1000
    const mac = crypto.createHmac("sha256", tokenKey(admin)).update(String(exp)).digest("base64url")
    return `${exp}.${mac}`
}
export async function verifyAdminToken(token) {
    if (typeof token !== "string") return false
    const [exp, mac] = token.split(".")
    if (!exp || !mac || Number(exp) < Date.now()) return false
    const { admin } = await getPasswords()
    const want = crypto.createHmac("sha256", tokenKey(admin)).update(exp).digest("base64url")
    return want.length === mac.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))
}
