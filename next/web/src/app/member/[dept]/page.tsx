import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadLayout, loadMembers, seatsOf, type DeptKey } from "@/lib/members";
import { MemberCard, MemberRow } from "@/components/member/MemberCard";
import { AppLink } from "@/components/AppLink";

async function deptOf(key: string) {
  return (await loadLayout()).depts.find((d) => d.key === key);
}

export async function generateMetadata(props: PageProps<"/member/[dept]">): Promise<Metadata> {
  const dept = await deptOf((await props.params).dept);
  return { title: dept?.name ?? "สมาชิก" };
}

export default async function DeptPage(props: PageProps<"/member/[dept]">) {
  const dept = await deptOf((await props.params).dept);
  if (!dept) notFound();
  const members = await loadMembers();

  return (
    <main>
      <header className={`m-hero m-hero-compact m-hero-${dept.key}`}>
        <div className="m-hero-inner">
          <AppLink href="/member/" className="m-back"><i className="fas fa-arrow-left" aria-hidden /> สมาชิกทั้งหมด</AppLink>
          <h1 className="m-hero-title">{dept.name}</h1>
          <p className="m-hero-lead">{dept.tagline}</p>
        </div>
      </header>

      <div className="m-units">
        {dept.units.map((u) => {
          const seats = seatsOf(members, dept.dataDept ?? (dept.key as DeptKey), u.key);
          if (!seats.length) return null;
          const heads = seats.filter((s) => s.position.title !== "ผู้ช่วย" && s.position.title !== "ผู้ช่วยและเลขานุการ");
          const helpers = seats.filter((s) => !heads.includes(s));
          return (
            <section key={u.key} className="m-unit">
              <h2 className="m-unit-title">{u.key === "head" || dept.units.length === 1 ? dept.name : u.name}</h2>
              <div className="m-unit-body">
                <div className="m-unit-heads">
                  {heads.map((s) => (
                    <MemberCard key={s.member.slug} member={s.member} caption={s.position.title === "หัวหน้า" ? `หัวหน้า${u.name}` : s.position.title} />
                  ))}
                </div>
                {helpers.length > 0 && (
                  <div className="m-unit-helpers">
                    {helpers.map((s) => (
                      <MemberRow key={s.member.slug} member={s.member} caption={s.position.title} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
