import type { Metadata } from "next";
import { GRADES, loadMembers, photoOf, seatsOf, shortName } from "@/lib/members";
import { Avatar } from "@/components/member/Avatar";
import { MemberRow, profileHref } from "@/components/member/MemberCard";
import { AppLink } from "@/components/AppLink";

export const metadata: Metadata = { title: "งานระดับชั้น" };

export default async function GradePage() {
  const members = await loadMembers();
  const lead = seatsOf(members, "affairs", "grade").find((s) => s.position.title === "หัวหน้า")?.member;
  const grades = GRADES.map((g) => {
    const seats = seatsOf(members, "grade", `m${g}`);
    return {
      g,
      head: seats.find((s) => s.position.title === "หัวหน้า")?.member,
      assistants: seats.filter((s) => s.position.title === "ผู้ช่วย").map((s) => s.member),
      secretaries: seats.filter((s) => s.position.title === "ผู้ช่วยและเลขานุการ").map((s) => s.member),
    };
  });

  return (
    <main className="g-page">
      <header className="g-hero">
        <div className="g-hero-inner">
          <AppLink href="/member/" className="m-back m-back-light"><i className="fas fa-arrow-left" aria-hidden /> สมาชิกทั้งหมด</AppLink>
          <p className="m-eyebrow m-eyebrow-light">ฝ่ายบริหารกิจการนักเรียน</p>
          <h1 className="g-hero-title">งานระดับชั้น</h1>
          <p className="g-hero-lead">ทีมสภานักเรียนประจำแต่ละระดับชั้น ม.1 ถึง ม.6 เป็นตัวกลางระหว่างนักเรียนกับสภา รับฟังทุกเสียงอย่างใกล้ชิด</p>
          {lead && (
            <AppLink href={profileHref(lead)} className="g-lead">
              <Avatar src={photoOf(lead)} nickname={lead.nickname} className="g-lead-photo" />
              <span>
                <small>หัวหน้างานระดับชั้น</small>
                <b>{lead.nickname}</b> <em>{shortName(lead)}</em>
              </span>
            </AppLink>
          )}
        </div>
        <nav className="g-jump" aria-label="เลือกระดับชั้น">
          {GRADES.map((g) => (
            <a key={g} href={`#m${g}`}>ม.{g}</a>
          ))}
        </nav>
      </header>

      <div className="g-list">
        {grades.map(({ g, head, assistants, secretaries }) => (
          <section key={g} id={`m${g}`} className={`g-card g-card-${g}`}>
            <div className="g-card-badge" aria-hidden>
              <span>ม.</span>
              {g}
            </div>
            <div className="g-card-main">
              <h2 className="g-card-title">มัธยมศึกษาปีที่ {g}</h2>
              {head && (
                <AppLink href={profileHref(head)} className="g-head">
                  <Avatar src={photoOf(head)} nickname={head.nickname} className="g-head-photo" />
                  <div>
                    <div className="g-head-role">หัวหน้าระดับชั้น ม.{g}</div>
                    <div className="g-head-nick">{head.nickname}</div>
                    <div className="g-head-name">{shortName(head)}</div>
                  </div>
                </AppLink>
              )}
              <div className="g-team">
                {assistants.length > 0 && (
                  <div>
                    <h3 className="g-team-title">ผู้ช่วย</h3>
                    {assistants.map((m) => <MemberRow key={m.slug} member={m} />)}
                  </div>
                )}
                {secretaries.length > 0 && (
                  <div>
                    <h3 className="g-team-title">ผู้ช่วยและเลขานุการ</h3>
                    {secretaries.map((m) => <MemberRow key={m.slug} member={m} />)}
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
