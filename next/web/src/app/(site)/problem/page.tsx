import type { Metadata } from "next";
import { PROBLEM_FORM } from "../policies";

export const metadata: Metadata = { title: "แจ้งปัญหา", icons: { icon: "/assets/icons/problem.svg" } };

const STEPS = [
  { icon: "fas fa-pen", title: "เล่าปัญหา", text: "กรอกแบบฟอร์มออนไลน์ บอกว่าเกิดอะไร ที่ไหน" },
  { icon: "fas fa-paper-plane", title: "ส่งถึงสภา", text: "เรื่องถูกส่งถึงทีม NEXT9 โดยตรง" },
  { icon: "fas fa-screwdriver-wrench", title: "ติดตามแก้ไข", text: "ทีมรับเรื่องประสานงานและเร่งแก้ไข" },
];

export default function ProblemPage() {
  return (
    <main>
      <section className="s-page-hero">
        <p className="s-eyebrow">เสียงของเพื่อน พี่ น้อง คือจุดเริ่มต้นของการเปลี่ยนแปลง</p>
        <h1>ร่วมแจ้งปัญหา</h1>
        <p className="s-lead">
          หากพบปัญหา หรือมีข้อแนะนำที่ต้องการให้ทีม NEXT9 เร่งดำเนินการแก้ไข ส่งเรื่องผ่านระบบแจ้งออนไลน์ได้ทันที
        </p>
        <a href={PROBLEM_FORM} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-lg">
          <i className="fas fa-bullhorn" aria-hidden /> คลิกเพื่อแจ้งปัญหา
        </a>
      </section>

      <section className="s-section">
        <div className="s-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="s-step">
              <span className="s-step-n">{i + 1}</span>
              <i className={s.icon} aria-hidden />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <p className="s-note">
          <i className="fas fa-restroom" aria-hidden /> ปัญหาห้องน้ำ: สแกน QR Code ที่ติดอยู่หน้าห้องน้ำแต่ละห้อง เพื่อแจ้งได้ตรงจุดที่สุด
        </p>
      </section>
    </main>
  );
}
