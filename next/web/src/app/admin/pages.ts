// What the admin pages edit. Each page lists the settings it covers as fields; AdminApp renders
// the forms from this file, so adding a setting is: a default in server/settings.mjs + a field here.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Field =
  | { type: "text" | "textarea" | "url" | "number" | "color" | "icon" | "date"; key: string; label: string; help?: string; placeholder?: string }
  | { type: "image"; key: string; label: string; help?: string }
  | { type: "bool"; key: string; label: string; help?: string }
  | { type: "lines"; key: string; label: string; help?: string; placeholder?: string }
  | { type: "select"; key: string; label: string; help?: string; options: { value: string; label: string }[] }
  // Shown as cards (or rows) you drag to reorder; a card opens its fields in a side panel. title and
  // subtitle name the keys shown on the card.
  | { type: "list"; key: string; label: string; help?: string; fields: Field[]; title?: string; subtitle?: string; layout?: "cards" | "rows"; itemName?: string; newItem: Record<string, any> };

export type Source = { kind: "settings"; name: string } | { kind: "doc"; name: string };

export type Part = {
  source: Source;
  title?: string;
  help?: string;
  fields: Field[];
  // For documents whose stored shape is awkward to edit (nested maps): convert to form values and
  // back. fromForm gets the stored value too, so keys the form does not show are kept.
  toForm?: (stored: any) => any;
  fromForm?: (form: any, stored: any) => any;
};

export type PageDef = {
  id: string;
  group: string;
  title: string;
  icon: string;
  intro?: string;
  parts?: Part[];
  custom?: "dashboard" | "passwords" | "secrets" | "classes" | "handover" | "terms" | "council" | "all_links" | "assess_lock" | "assess_time" | "assess_people" | "assess_accounts";
  // The page this one edits: shown live beside the editor on wide screens, reloaded after each save.
  preview?: string;
  links?: { href: string; label: string; icon?: string }[];
};

const S = (name: string): Source => ({ kind: "settings", name });
const D = (name: string): Source => ({ kind: "doc", name });

const COLS = "ABCDEFGHIJKLMNOP".split("").map((c) => ({ value: c, label: c }));
const COLS_OPT = [{ value: "", label: "ไม่มี" }, ...COLS];

const ICON_HELP = "ชื่อไอคอน Font Awesome เช่น fas fa-users (ค้นหาได้ที่ fontawesome.com/icons)";

const navItem: Field[] = [
  { type: "text", key: "label", label: "ชื่อเมนู" },
  { type: "text", key: "href", label: "ลิงก์", placeholder: "/about/" },
];

const card4: Field[] = [
  { type: "text", key: "title", label: "หัวข้อ" },
  { type: "text", key: "text", label: "คำอธิบาย" },
  { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
  { type: "text", key: "href", label: "ลิงก์", placeholder: "/member/" },
];

export const PAGES: PageDef[] = [
  { id: "dashboard", group: "ภาพรวม", title: "ภาพรวมและสถานะ", icon: "fas fa-gauge", custom: "dashboard" },
  { id: "all_links", group: "ภาพรวม", title: "ลิงก์ทุกระบบ", icon: "fas fa-link", custom: "all_links", intro: "ที่อยู่ของทุกหน้าในทุกระบบ (รวมหน้าที่ไม่ได้ลิงก์ไว้ในเว็บสาธารณะ) คัดลอกไปส่งให้คนที่ต้องใช้ได้" },
  { id: "handover", group: "ภาพรวม", title: "ส่งต่อรุ่นถัดไป", icon: "fas fa-people-arrows", custom: "handover" },

  // ---------------- Shared data (every system) ----------------
  {
    id: "terms",
    group: "ข้อมูลกลาง (ใช้ทุกระบบ)",
    title: "ภาคเรียน",
    icon: "fas fa-calendar-days",
    custom: "terms",
    intro:
      "ตั้งวันเปิด-ปิดภาคเรียนที่นี่ที่เดียว ทุกระบบใช้ร่วมกัน: แบบฟอร์มและหน้าสรุปทั้งหมด การนับสัปดาห์ของเล่มชมพู และระบบประเมินหน้าเสาธง ภาคเรียนปัจจุบันเปลี่ยนเองตามวันที่",
  },
  {
    id: "classes",
    group: "ข้อมูลกลาง (ใช้ทุกระบบ)",
    title: "นักเรียนและห้องเรียน",
    icon: "fas fa-user-graduate",
    custom: "classes",
    intro:
      "ระดับชั้น ห้อง และกลุ่ม ก/ข ของทุกระบบ นับจากรายชื่อนักเรียนใน Google Sheet อัตโนมัติ (ไม่ต้องพิมพ์เอง) ขึ้นปีการศึกษาใหม่: เปลี่ยน Sheet → ดูตัวอย่าง → ดึงรายชื่อใหม่",
    parts: [
      {
        source: S("students_import"),
        title: "ตั้งค่าวิธีอ่าน Sheet รายชื่อนักเรียน",
        help: "แชร์ไฟล์ให้อีเมล service account (หน้าคีย์เชื่อมต่อ) เป็น Viewer",
        fields: [
          { type: "text", key: "sheet_id", label: "Google Sheet รายชื่อนักเรียน (ID หรือลิงก์)" },
          { type: "lines", key: "tabs", label: "แท็บที่อ่าน (ว่าง = อ่านทุกแท็บ)", placeholder: "ชื่อแท็บ แล้วกด Enter" },
          {
            type: "select",
            key: "mode",
            label: "รูปแบบของ Sheet",
            options: [
              { value: "header", label: "มีแถวหัวห้อง แล้วตามด้วยรายชื่อ" },
              { value: "columns", label: "ทุกแถวมีคอลัมน์ชั้น/ห้อง" },
            ],
          },
          {
            type: "text",
            key: "header_pattern",
            label: "รูปแบบแถวหัวห้อง",
            help: "ใช้ {ชั้น} {ห้อง} {สาย} แทนส่วนที่เปลี่ยน เช่น มัธยมศึกษาปีที่ {ชั้น}/{ห้อง} {สาย} (สาย = กลุ่ม ก/ข)",
          },
          { type: "select", key: "header_column", label: "คอลัมน์ของแถวหัวห้อง", options: COLS },
          { type: "select", key: "col_number", label: "คอลัมน์เลขที่", options: COLS, help: "แถวที่คอลัมน์นี้ไม่ใช่ตัวเลขจะถูกข้าม" },
          { type: "select", key: "col_student_id", label: "คอลัมน์เลขประจำตัว", options: COLS },
          { type: "select", key: "col_prefix", label: "คอลัมน์คำนำหน้า", options: COLS_OPT },
          { type: "select", key: "col_first_name", label: "คอลัมน์ชื่อ", options: COLS_OPT },
          { type: "select", key: "col_last_name", label: "คอลัมน์นามสกุล", options: COLS_OPT },
          { type: "select", key: "col_full_name", label: "คอลัมน์ชื่อเต็ม (ถ้าชื่อ-สกุลอยู่ช่องเดียว)", options: COLS_OPT },
          { type: "select", key: "col_grade", label: "คอลัมน์ชั้น (แบบทุกแถวมีชั้น)", options: COLS_OPT },
          { type: "select", key: "col_room", label: "คอลัมน์ห้อง (แบบทุกแถวมีชั้น)", options: COLS_OPT },
          { type: "select", key: "col_track", label: "คอลัมน์กลุ่ม ก/ข (แบบทุกแถวมีชั้น)", options: COLS_OPT },
          { type: "number", key: "min_id_length", label: "เลขประจำตัวยาวอย่างน้อย (ตัวอักษร)" },
        ],
        fromForm: (f: any) => ({ ...f, sheet_id: sheetIdOf(f.sheet_id) }),
      },
    ],
  },
  {
    id: "council",
    group: "ข้อมูลกลาง (ใช้ทุกระบบ)",
    title: "สมาชิกสภา",
    icon: "fas fa-users",
    custom: "council",
    intro:
      "รายชื่อสมาชิกสภาชุดเดียวที่ทุกระบบใช้: หน้าสมาชิกบนเว็บ รายชื่อผู้ตรวจในแบบฟอร์มทุกตัว และคนลงเวร เพิ่ม ลบ เรียงลำดับ และแก้ข้อมูล/ตำแหน่งได้ที่นี่ ส่วนรูปโปรไฟล์ตั้งที่หน้าแก้ไขข้อมูลสมาชิก",
    links: [
      { href: "/member/editor/", label: "เปลี่ยนรูปโปรไฟล์ (หน้าแก้ไขข้อมูลสมาชิก)", icon: "fas fa-camera" },
      { href: "/member/", label: "เปิดหน้าสมาชิก" },
    ],
  },

  // ---------------- Website ----------------
  {
    id: "site",
    group: "เว็บไซต์",
    title: "ข้อมูลหลักของเว็บ",
    icon: "fas fa-globe",
    intro: "ชื่อพรรค/สภา โลโก้ สีหลัก เมนู และช่องทางติดต่อ ใช้ทุกหน้าของเว็บ",
    preview: "/",
    parts: [
      {
        source: S("site"),
        fields: [
          { type: "text", key: "name", label: "ชื่อพรรค / ทีม", help: "แสดงบนแถบชื่อเว็บ ท้ายเว็บ และหน้ารวมลิงก์ เช่น NEXT9" },
          { type: "text", key: "council", label: "ชื่อสภานักเรียน" },
          { type: "text", key: "school", label: "ชื่อโรงเรียน" },
          { type: "text", key: "motto", label: "คำขวัญ" },
          { type: "image", key: "logo", label: "โลโก้", help: "รูปสี่เหลี่ยมจัตุรัส พื้นใส (PNG/WebP) อย่างน้อย 256×256" },
          { type: "color", key: "theme_color", label: "สีหลักของเว็บ" },
          { type: "url", key: "problem_form_url", label: "ลิงก์ฟอร์มแจ้งปัญหา", help: "เช่น Google Form ที่ใช้รับเรื่อง" },
          { type: "list", key: "nav", label: "เมนูด้านบน", fields: navItem, title: "label", subtitle: "href", layout: "rows", newItem: { label: "", href: "/" } },
          {
            type: "list",
            key: "social",
            label: "ช่องทางโซเชียล",
            title: "label",
            subtitle: "href",
            newItem: { label: "", href: "", icon: "fab fa-facebook-f" },
            fields: [
              { type: "text", key: "label", label: "ชื่อ", placeholder: "Facebook" },
              { type: "url", key: "href", label: "ลิงก์" },
              { type: "icon", key: "icon", label: "ไอคอน", help: "เช่น fab fa-facebook-f, fab fa-instagram, fab fa-tiktok, fab fa-line" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "home",
    group: "เว็บไซต์",
    title: "หน้าแรก",
    icon: "fas fa-house",
    preview: "/",
    links: [{ href: "/", label: "เปิดหน้าแรก" }],
    parts: [
      {
        source: S("home"),
        fields: [
          {
            type: "list",
            key: "slides",
            label: "ภาพสไลด์ด้านบน",
            help: "ภาพแนวนอน (ประมาณ 16:9) ขนาดไม่เกิน 2 MB ต่อภาพ",
            title: "alt",
            newItem: { image: "", alt: "" },
            fields: [
              { type: "image", key: "image", label: "ภาพ" },
              { type: "text", key: "alt", label: "คำอธิบายภาพ" },
            ],
          },
          { type: "text", key: "eyebrow", label: "ข้อความเล็กเหนือหัวข้อ" },
          { type: "text", key: "title", label: "หัวข้อใหญ่" },
          { type: "text", key: "title_highlight", label: "ส่วนที่เน้นสีของหัวข้อ" },
          { type: "list", key: "quick", label: "การ์ดทางลัด", fields: card4, title: "title", subtitle: "text", newItem: { title: "", text: "", icon: "fas fa-star", href: "/" } },
          { type: "text", key: "policy_title", label: "หัวข้อส่วนนโยบาย" },
          { type: "text", key: "policy_text", label: "คำอธิบายส่วนนโยบาย" },
          { type: "number", key: "policy_count", label: "จำนวนนโยบายที่แสดงบนหน้าแรก" },
          { type: "text", key: "cta_title", label: "หัวข้อกล่องแจ้งปัญหา" },
          { type: "text", key: "cta_text", label: "ข้อความกล่องแจ้งปัญหา" },
        ],
      },
    ],
  },
  {
    id: "policies",
    group: "เว็บไซต์",
    title: "นโยบาย",
    icon: "fas fa-list-check",
    preview: "/policy/",
    links: [{ href: "/policy/", label: "เปิดหน้านโยบาย" }],
    parts: [
      {
        source: S("policies"),
        fields: [
          { type: "text", key: "title", label: "หัวข้อหน้า" },
          { type: "text", key: "lead", label: "คำอธิบายใต้หัวข้อ" },
          { type: "text", key: "eyebrow_suffix", label: "ข้อความหลังจำนวนนโยบาย", help: "แสดงเป็น \"7 นโยบาย · ทำได้จริง\"" },
          {
            type: "list",
            key: "items",
            label: "นโยบาย",
            title: "title",
            subtitle: "summary",
            itemName: "นโยบาย",
            newItem: { tag: "", title: "", icon: "fas fa-star", summary: "", text: "", points: [], note: "" },
            fields: [
              { type: "text", key: "title", label: "ชื่อนโยบาย" },
              { type: "text", key: "tag", label: "หมวด", placeholder: "เช่น สุขาภิบาล" },
              { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
              { type: "text", key: "summary", label: "สรุปสั้น (แสดงบนหน้าแรก)" },
              { type: "textarea", key: "text", label: "รายละเอียด" },
              { type: "lines", key: "points", label: "ข้อย่อย (บรรทัดละข้อ)" },
              { type: "text", key: "note", label: "หมายเหตุ" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "about",
    group: "เว็บไซต์",
    title: "หน้าเกี่ยวกับ",
    icon: "fas fa-circle-info",
    preview: "/about/",
    links: [{ href: "/about/", label: "เปิดหน้าเกี่ยวกับ" }],
    parts: [
      {
        source: S("about"),
        fields: [
          { type: "text", key: "eyebrow", label: "ข้อความเล็กเหนือหัวข้อ" },
          { type: "text", key: "title", label: "หัวข้อ" },
          { type: "text", key: "title_highlight", label: "คำที่เน้น (ตัวโปร่ง)" },
          { type: "textarea", key: "lead", label: "คำแนะนำพรรค/สภา" },
          {
            type: "list",
            key: "cards",
            label: "การ์ดลิงก์",
            title: "title",
            newItem: { title: "", action: "", icon: "fas fa-star", href: "/" },
            fields: [
              { type: "text", key: "title", label: "หัวข้อ" },
              { type: "text", key: "action", label: "ข้อความปุ่ม" },
              { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
              { type: "text", key: "href", label: "ลิงก์" },
            ],
          },
          { type: "text", key: "social_title", label: "หัวข้อส่วนโซเชียล" },
          { type: "text", key: "social_text", label: "คำอธิบายส่วนโซเชียล" },
        ],
      },
    ],
  },
  {
    id: "problem",
    group: "เว็บไซต์",
    title: "หน้าแจ้งปัญหา",
    icon: "fas fa-comment-dots",
    preview: "/problem/",
    intro: "ลิงก์ฟอร์มแจ้งปัญหาตั้งที่หน้า \"ข้อมูลหลักของเว็บ\"",
    links: [{ href: "/problem/", label: "เปิดหน้าแจ้งปัญหา" }],
    parts: [
      {
        source: S("problem"),
        fields: [
          { type: "text", key: "eyebrow", label: "ข้อความเล็กเหนือหัวข้อ" },
          { type: "text", key: "title", label: "หัวข้อ" },
          { type: "textarea", key: "lead", label: "คำอธิบาย" },
          { type: "text", key: "button", label: "ข้อความปุ่ม" },
          {
            type: "list",
            key: "steps",
            label: "ขั้นตอน",
            title: "title",
            subtitle: "text",
            newItem: { title: "", text: "", icon: "fas fa-check" },
            fields: [
              { type: "text", key: "title", label: "หัวข้อ" },
              { type: "text", key: "text", label: "คำอธิบาย" },
              { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
            ],
          },
          { type: "text", key: "note", label: "หมายเหตุท้ายหน้า" },
        ],
      },
    ],
  },
  {
    id: "members",
    group: "เว็บไซต์",
    title: "สมาชิก (โครงสร้าง)",
    icon: "fas fa-sitemap",
    preview: "/member/",
    intro:
      "ฝ่าย งาน และคณะกรรมการบริหาร ส่วนคนและตำแหน่งของแต่ละคนแก้ที่หน้าสมาชิกสภา (ข้อมูลกลาง) ตำแหน่งของสมาชิกอ้างถึงฝ่ายด้วย \"รหัส\" (key) จึงไม่ควรเปลี่ยนรหัสของฝ่ายหรืองานที่มีคนอยู่แล้ว",
    links: [
      { href: "/member/editor/", label: "แก้ไขข้อมูลสมาชิก", icon: "fas fa-id-card" },
      { href: "/member/", label: "เปิดหน้าสมาชิก" },
    ],
    parts: [
      {
        source: S("members"),
        fields: [
          { type: "text", key: "eyebrow", label: "ข้อความเล็กเหนือหัวข้อ" },
          { type: "text", key: "title", label: "หัวข้อหน้า" },
          { type: "text", key: "lead", label: "คำอธิบาย" },
          {
            type: "list",
            key: "exec",
            label: "คณะกรรมการบริหาร (คนแรกแสดงใหญ่ที่สุด)",
            title: "caption",
            subtitle: "unit",
            layout: "rows",
            newItem: { unit: "", caption: "" },
            fields: [
              { type: "text", key: "caption", label: "ชื่อตำแหน่งที่แสดง" },
              { type: "text", key: "unit", label: "รหัสตำแหน่ง (unit ในฝ่าย executive)", placeholder: "president" },
            ],
          },
          {
            type: "list",
            key: "depts",
            label: "ฝ่าย",
            title: "name",
            subtitle: "tagline",
            itemName: "ฝ่าย",
            newItem: { key: "", data_dept: "", name: "", short: "", tagline: "", units: [{ key: "head", name: "หัวหน้าฝ่าย" }] },
            fields: [
              { type: "text", key: "name", label: "ชื่อฝ่าย" },
              { type: "text", key: "short", label: "ชื่อย่อ" },
              { type: "text", key: "tagline", label: "คำอธิบาย" },
              { type: "text", key: "key", label: "รหัสฝ่าย (ภาษาอังกฤษ ใช้ในลิงก์ /member/<รหัส>/)" },
              { type: "text", key: "data_dept", label: "เก็บตำแหน่งไว้ใต้ฝ่าย (เว้นว่าง = รหัสเดียวกัน)", placeholder: "executive" },
              {
                type: "list",
                key: "units",
                label: "งานในฝ่าย",
                title: "name",
                layout: "rows",
                newItem: { key: "", name: "" },
                fields: [
                  { type: "text", key: "name", label: "ชื่องาน" },
                  { type: "text", key: "key", label: "รหัสงาน (ภาษาอังกฤษ)" },
                ],
              },
            ],
          },
          { type: "text", key: "grade_title", label: "ชื่อหน้างานระดับชั้น" },
          { type: "text", key: "grade_text", label: "คำอธิบายสั้น (การ์ดในหน้าสมาชิก)" },
          { type: "textarea", key: "grade_lead", label: "คำอธิบายหน้างานระดับชั้น" },
          { type: "lines", key: "role_suggestions", label: "ตำแหน่งที่เสนอให้เลือกในหน้าแก้ไขสมาชิก (บรรทัดละตำแหน่ง)" },
        ],
      },
    ],
  },
  {
    id: "links",
    group: "เว็บไซต์",
    title: "หน้ารวมลิงก์ (/links/)",
    icon: "fas fa-link",
    preview: "/links/",
    links: [{ href: "/links/", label: "เปิดหน้ารวมลิงก์" }],
    parts: [
      {
        source: S("links"),
        fields: [
          { type: "text", key: "title", label: "หัวข้อหน้า" },
          {
            type: "list",
            key: "sections",
            label: "หมวด",
            title: "title",
            subtitle: "text",
            newItem: { key: "", title: "", text: "", icon: "fas fa-folder", restricted: false, items: [] },
            fields: [
              { type: "text", key: "title", label: "ชื่อหมวด" },
              { type: "text", key: "text", label: "คำอธิบาย" },
              { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
              { type: "text", key: "key", label: "รหัสหมวด (ภาษาอังกฤษ)" },
              { type: "bool", key: "restricted", label: "หมวดสำหรับผู้ดูแล" },
              {
                type: "list",
                key: "items",
                label: "ลิงก์",
                title: "title",
                subtitle: "href",
                layout: "rows",
                newItem: { title: "", text: "", icon: "fas fa-link", href: "", lock: "", external: false },
                fields: [
                  { type: "text", key: "title", label: "ชื่อ" },
                  { type: "text", key: "text", label: "คำอธิบาย" },
                  { type: "text", key: "href", label: "ลิงก์", placeholder: "/forms/building/ หรือ https://..." },
                  { type: "icon", key: "icon", label: "ไอคอน", help: ICON_HELP },
                  { type: "text", key: "lock", label: "ป้ายกำกับการเข้าถึง", placeholder: "รหัสผ่าน / ผู้ดูแล / เข้าสู่ระบบ (เว้นว่างได้)" },
                  { type: "bool", key: "external", label: "เป็นเว็บภายนอก (เปิดแท็บใหม่)" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // ---------------- Forms ----------------
  {
    id: "building",
    group: "แบบฟอร์ม",
    title: "ตรวจอาคาร",
    icon: "fas fa-building",
    links: [
      { href: "/forms/building/", label: "เปิดแบบฟอร์ม" },
      { href: "/viewforms/building/", label: "เปิดหน้าสรุป" },
    ],
    parts: [
      {
        source: S("sheets"),
        title: "Google Sheet",
        help: "ผลตรวจถูกเขียนลงชีทชื่อ \"อาคาร <เลขอาคาร>\" ในไฟล์นี้ แชร์ไฟล์ให้อีเมล service account (หน้าคีย์เชื่อมต่อ) เป็น Editor",
        fields: [{ type: "text", key: "building_sheet_id", label: "Sheet ID หรือลิงก์ของไฟล์", placeholder: "https://docs.google.com/spreadsheets/d/..." }],
        fromForm: (f: any, stored: any) => ({ ...stored, building_sheet_id: sheetIdOf(f.building_sheet_id) }),
      },
      {
        source: S("building"),
        // Rooms used to be typed as "311, 312"; the editor keeps them as a list.
        toForm: (v: any) => ({
          ...v,
          buildings: (v.buildings || []).map((b: any) => ({
            ...b,
            floors: (b.floors || []).map((f: any) => ({ ...f, rooms: Array.isArray(f.rooms) ? f.rooms : String(f.rooms || "").split(/[,\s]+/).filter(Boolean) })),
          })),
        }),
        fields: [
          {
            type: "list",
            key: "buildings",
            label: "อาคารและห้อง",
            title: "number",
            subtitle: "floors",
            itemName: "อาคาร",
            newItem: { number: "", floors: [{ floor: "1", rooms: [] }] },
            fields: [
              { type: "text", key: "number", label: "เลขอาคาร" },
              {
                type: "list",
                key: "floors",
                label: "ชั้น",
                title: "floor",
                subtitle: "rooms",
                layout: "rows",
                itemName: "ชั้น",
                newItem: { floor: "", rooms: [] },
                fields: [
                  { type: "text", key: "floor", label: "ชั้นที่" },
                  { type: "lines", key: "rooms", label: "ห้อง", placeholder: "เลขห้อง แล้วกด Enter เช่น 311" },
                ],
              },
            ],
          },
          { type: "lines", key: "items_v2", label: "หัวข้อที่ตรวจ" },
          { type: "lines", key: "items_v1", label: "หัวข้อที่ตรวจ แบบฟอร์มรุ่นเก่า (classic)" },
          {
            type: "list",
            key: "scores",
            label: "ระดับคะแนน (แบบฟอร์มรุ่นเก่า)",
            title: "label",
            newItem: { value: 0, label: "" },
            fields: [
              { type: "number", key: "value", label: "คะแนน" },
              { type: "text", key: "label", label: "ชื่อระดับ" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "inert",
    group: "แบบฟอร์ม",
    title: "สาย - เฉื่อย",
    icon: "fas fa-user-clock",
    intro: "Google Sheet ของแต่ละภาคเรียนตั้งที่หน้าภาคเรียน ส่วนคอลัมน์ที่เขียนลงชีทแก้ได้ที่หน้าตั้งค่าแบบฟอร์มเดิม",
    links: [
      { href: "/forms/inert/", label: "เปิดแบบฟอร์ม" },
      { href: "/viewforms/inert/", label: "เปิดหน้าสรุป" },
      { href: "/forms/inert/edit/", label: "ตั้งค่าคอลัมน์ในชีท", icon: "fas fa-table-columns" },
    ],
    parts: [
      {
        source: D("inert"),
        fields: [
          { type: "lines", key: "TYPES", label: "ประเภท" },
          { type: "lines", key: "VIOLATIONS", label: "รายการผิดระเบียบ" },
          { type: "text", key: "junior", label: "ชื่อชีท ม.ต้น", placeholder: "ม.ต้น" },
          { type: "text", key: "high", label: "ชื่อชีท ม.ปลาย", placeholder: "ม.ปลาย" },
        ],
        toForm: (v: any) => ({
          TYPES: v?.TYPES || [],
          VIOLATIONS: v?.VIOLATIONS || [],
          junior: v?.SHEET_JUNIOR_RANGE || "ม.ต้น",
          high: v?.SHEET_HIGH_RANGE || "ม.ปลาย",
        }),
        fromForm: (f: any, stored: any) => {
          const terms = Object.fromEntries(Object.entries(stored?.terms || {}).map(([k, t]: [string, any]) => [k, { ...t, SHEET_JUNIOR_RANGE: f.junior || "ม.ต้น", SHEET_HIGH_RANGE: f.high || "ม.ปลาย" }]));
          return { ...(stored || {}), TYPES: f.TYPES, VIOLATIONS: f.VIOLATIONS, SHEET_JUNIOR_RANGE: f.junior || "ม.ต้น", SHEET_HIGH_RANGE: f.high || "ม.ปลาย", terms };
        },
      },
    ],
  },
  {
    id: "submit_inert",
    group: "แบบฟอร์ม",
    title: "ส่งเล่มตรวจสาย - เฉื่อย",
    icon: "fas fa-book",
    links: [
      { href: "/forms/submit_inert/", label: "เปิดแบบฟอร์ม" },
      { href: "/viewforms/submit_inert/", label: "เปิดหน้าสรุป" },
    ],
    parts: [
      {
        source: S("submit_inert"),
        fields: [{ type: "lines", key: "places", label: "จุดตรวจ", help: "ระดับชั้นมาจากหน้านักเรียนและห้องเรียน" }],
      },
    ],
  },
  {
    id: "pinkbook",
    group: "แบบฟอร์ม",
    title: "เล่มชมพู",
    icon: "fas fa-book-bookmark",
    intro: "ภาคเรียนและสัปดาห์ที่ 1 มาจากหน้าภาคเรียน (สัปดาห์ที่ 1 = สัปดาห์ของวันเปิดเทอม) ห้องและกลุ่ม ก/ข มาจากหน้านักเรียนและห้องเรียน",
    links: [
      { href: "/forms/pinkbook/", label: "เปิดแบบฟอร์ม" },
      { href: "/viewforms/pinkbook/", label: "เปิดหน้าสรุป" },
    ],
    parts: [
      {
        source: D("pinkbook"),
        fields: [
          {
            type: "list",
            key: "items",
            label: "หัวข้อตรวจ",
            title: "title",
            layout: "rows",
            itemName: "หัวข้อ",
            newItem: { title: "", allow_week: false },
            fields: [
              { type: "text", key: "title", label: "หัวข้อ" },
              { type: "bool", key: "allow_week", label: "ระบุสัปดาห์ที่ไม่ส่งได้" },
            ],
          },
        ],
        toForm: (v: any) => ({ items: (v?.items || []).map((it: any) => (typeof it === "string" ? { title: it, allow_week: false } : it)) }),
        fromForm: (f: any, stored: any) => ({ ...(stored || {}), items: f.items }),
      },
    ],
  },
  {
    id: "toilet",
    group: "แบบฟอร์ม",
    title: "ห้องน้ำ",
    icon: "fas fa-restroom",
    intro: "QR Code ของแต่ละห้องสร้าง/พิมพ์ได้ที่หน้าตั้งค่าระบบห้องน้ำ",
    links: [
      { href: "/forms/toilet/admin/", label: "QR Code และตั้งค่าห้องน้ำ", icon: "fas fa-qrcode" },
      { href: "/forms/toilet/manage/", label: "ดูเรื่องที่แจ้ง" },
    ],
    parts: [
      {
        source: D("toilet"),
        fields: [
          {
            type: "list",
            key: "rooms",
            label: "ห้องน้ำ",
            title: "name",
            subtitle: "id",
            layout: "rows",
            newItem: { id: "", name: "" },
            fields: [
              { type: "text", key: "id", label: "รหัสห้อง (ใช้ใน QR Code ห้ามซ้ำ)" },
              { type: "text", key: "name", label: "ชื่อห้อง" },
            ],
          },
          { type: "lines", key: "problems", label: "ปัญหาที่ให้เลือก" },
        ],
      },
      { source: S("toilet_form"), fields: [{ type: "lines", key: "roles", label: "ผู้แจ้ง" }] },
    ],
  },
  // ---------------- Other systems ----------------
  {
    id: "duty",
    group: "ระบบอื่น",
    title: "เวรประจำวัน",
    icon: "fas fa-calendar-check",
    intro:
      "ระบบลงเวร (/duty/) บันทึกลง Google Sheet ผ่าน Apps Script และเก็บรูปเข้าคลังภาพ คนที่ลงเวรได้มาจากหน้าสมาชิกสภา (เปิด \"ลงเวร\") ถ้าเปลี่ยน Sheet ต้องติดตั้ง Apps Script ในไฟล์ใหม่ด้วย (ดูหน้าส่งต่อรุ่นถัดไป)",
    links: [
      { href: "/duty/", label: "เปิดระบบลงเวร" },
      { href: "/duty/summary.html", label: "เปิดหน้าสรุป" },
    ],
    parts: [
      {
        source: S("duty"),
        fields: [
          { type: "url", key: "script_url", label: "Apps Script Web App URL (.../exec)" },
          { type: "text", key: "sheet_id", label: "Google Sheet ID", help: "ไฟล์ต้องแชร์แบบ \"ทุกคนที่มีลิงก์ดูได้\" หน้าสรุปจึงอ่านได้" },
          { type: "text", key: "sheet_gid", label: "GID ของแท็บบันทึกเวร", help: "ตัวเลขหลัง #gid= ในลิงก์ของแท็บ" },
          { type: "text", key: "root_album", label: "ชื่ออัลบั้มในคลังภาพที่เก็บรูปเวร" },
          { type: "number", key: "max_photos", label: "จำนวนรูปสูงสุดต่อครั้ง" },
          { type: "lines", key: "stations", label: "จุดเวร" },
          {
            type: "list",
            key: "statuses",
            label: "สถานะการมา/ลา",
            title: "value",
            layout: "rows",
            newItem: { value: "", key: "other", short: "", icon: "fa-circle" },
            fields: [
              { type: "text", key: "value", label: "ข้อความ" },
              { type: "text", key: "short", label: "ชื่อย่อ" },
              { type: "select", key: "key", label: "สี", options: ["present", "absent", "sick", "leave", "activity", "other"].map((v) => ({ value: v, label: v })) },
              { type: "text", key: "icon", label: "ไอคอน (เช่น fa-circle-check)" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "line",
    group: "ระบบอื่น",
    title: "LINE bot",
    icon: "fab fa-line",
    intro:
      "บอทรับรูปจากแชทเข้าคลังภาพ ตั้ง Webhook URL ใน LINE Developers เป็น <ที่อยู่เว็บ>/api/line/webhook และใส่ Channel secret / access token ที่หน้าคีย์เชื่อมต่อ",
    parts: [{ source: S("line"), fields: [{ type: "number", key: "album_limit", label: "จำนวนอัลบั้มล่าสุดที่ให้เลือก (สูงสุด 12)" }] }],
  },

  // ---------------- Assessment system (assessRow) ----------------
  {
    id: "assess_lock",
    group: "ระบบประเมินหน้าเสาธง",
    title: "เปิด/ปิดระบบ",
    icon: "fas fa-power-off",
    custom: "assess_lock",
    intro: "ปิดระบบประเมินชั่วคราว (เช่น ช่วงปรับปรุง) พร้อมข้อความที่ผู้ใช้จะเห็น",
    links: [{ href: "https://assess-row-sdh.vercel.app/", label: "เปิดระบบประเมิน" }],
  },
  {
    id: "assess_time",
    group: "ระบบประเมินหน้าเสาธง",
    title: "เวลาและวันประเมิน",
    icon: "fas fa-clock",
    custom: "assess_time",
    intro: "ช่วงเวลาที่กรอกคะแนนได้ วันในสัปดาห์ที่เปิด และวันหยุด/วันชดเชย ภาคเรียนตั้งที่หน้าภาคเรียน",
  },
  {
    id: "assess_people",
    group: "ระบบประเมินหน้าเสาธง",
    title: "ผู้ใช้และสิทธิ์",
    icon: "fas fa-user-lock",
    custom: "assess_people",
    intro: "ใครเข้าระบบประเมินได้ในบทบาทไหน: กำหนดเป็นรายคน หรือเป็นกฎตามรูปแบบอีเมล (เช่น อีเมลที่เป็นตัวเลข = นักเรียน)",
  },
  {
    id: "assess_accounts",
    group: "ระบบประเมินหน้าเสาธง",
    title: "บัญชีแอดมิน (ชื่อผู้ใช้/รหัสผ่าน)",
    icon: "fas fa-user-gear",
    custom: "assess_accounts",
    intro: "บัญชีสำหรับเข้าหน้า /admin ของระบบประเมินโดยไม่ใช้ Google",
    links: [{ href: "https://assess-row-sdh.vercel.app/admin/logs", label: "ประวัติการใช้งาน" }],
  },

  // ---------------- Security ----------------
  { id: "passwords", group: "ความปลอดภัย", title: "รหัสผ่าน", icon: "fas fa-key", custom: "passwords" },
  { id: "secrets", group: "ความปลอดภัย", title: "คีย์เชื่อมต่อ", icon: "fas fa-plug", custom: "secrets" },
];

export function sheetIdOf(v: string) {
  const s = String(v || "").trim();
  return s.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || s;
}
