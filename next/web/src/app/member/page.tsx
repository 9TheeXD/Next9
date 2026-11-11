import { loadLayout, loadMembers, seatsOf, type DeptKey, type Member } from "@/lib/members";
import { MemberCard, MemberRow } from "@/components/member/MemberCard";
import { AppLink } from "@/components/AppLink";

// The member list is read on every request, so an edit in /member/editor/ shows on the next load.
export const dynamic = "force-dynamic";

function firstSeat(members: Member[], unit: string) {
  return seatsOf(members, "executive", unit)[0]?.member;
}

export default async function MembersPage() {
  const [members, layout] = await Promise.all([loadMembers(), loadLayout()]);
  const { depts: DEPTS, grades: GRADES } = layout;
  // Executive board and texts: admin → สมาชิก (โครงสร้าง).
  const [president, ...board] = (layout.exec.length ? layout.exec : [{ unit: "", caption: "" }]).map((e) => ({ ...e, member: firstSeat(members, e.unit) }));
  const roster = [...members].sort((a, b) => (a.room ?? "").localeCompare(b.room ?? "", "th", { numeric: true }));

  return (
    <main>
      <header className="m-hero">
        <div className="m-hero-inner">
          <p className="m-eyebrow">{layout.eyebrow}</p>
          <h1 className="m-hero-title">{layout.title}</h1>
          <p className="m-hero-lead">{layout.lead}</p>
          <div className="m-hero-stats">
            <div><b>{members.length}</b><span>สมาชิก</span></div>
            <div><b>{DEPTS.length}</b><span>ฝ่าย</span></div>
            <div><b>{GRADES.length}</b><span>ระดับชั้น</span></div>
          </div>
        </div>
      </header>

      <section className="m-section">
        <h2 className="m-section-title">คณะกรรมการบริหาร</h2>
        <div className="m-exec">
          {president.member && (
            <div className="m-exec-top">
              <MemberCard member={president.member} caption={president.caption} size="lg" />
            </div>
          )}
          <div className="m-exec-grid">
            {board.map((b) => b.member && <MemberCard key={b.unit} member={b.member} caption={b.caption} />)}
          </div>
        </div>
      </section>

      <section className="m-section">
        <h2 className="m-section-title">ฝ่ายและงาน</h2>
        <div className="m-tiles">
          {DEPTS.map((d) => {
            const dataDept = d.dataDept ?? (d.key as DeptKey);
            const solo = d.units.length === 1;
            const head = seatsOf(members, dataDept, solo ? d.units[0].key : "head")[0]?.member;
            const unitKeys = d.units.map((u) => u.key);
            const count = new Set(members.filter((m) => m.positions?.some((p) => p.dept === dataDept && unitKeys.includes(p.unit))).map((m) => m.slug)).size;
            return (
              <AppLink key={d.key} href={`/member/${d.key}/`} className={`m-tile m-tile-${d.key}`}>
                <span className="m-tile-kicker">{count} คน{solo ? "" : ` · ${d.units.length - 1} งาน`}</span>
                <span className="m-tile-name">{d.name}</span>
                <span className="m-tile-text">{d.tagline}</span>
                {head && <span className="m-tile-head">{solo ? d.units[0].name : "หัวหน้าฝ่าย"}: {head.nickname}</span>}
                <i className="fas fa-arrow-right m-tile-arrow" aria-hidden />
              </AppLink>
            );
          })}
          <AppLink href="/member/grade/" className="m-tile m-tile-grade">
            <span className="m-tile-kicker">{GRADES.length ? `ม.${GRADES[0]} – ม.${GRADES[GRADES.length - 1]}` : ""}</span>
            <span className="m-tile-name">{layout.grade_title}</span>
            <span className="m-tile-text">{layout.grade_text}</span>
            <i className="fas fa-arrow-right m-tile-arrow" aria-hidden />
          </AppLink>
        </div>
      </section>

      <section className="m-section">
        <h2 className="m-section-title">สมาชิกทั้งหมด</h2>
        <div className="m-roster">
          {roster.map((m) => (
            <MemberRow key={m.slug} member={m} caption={m.role} />
          ))}
        </div>
      </section>
    </main>
  );
}
