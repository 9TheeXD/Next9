import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEPTS, bySlug, loadMembers, photoOf } from "@/lib/members";
import { Avatar } from "@/components/member/Avatar";
import { AppLink } from "@/components/AppLink";

// Profile links have always been /member/profile/<slug>.html (shared around, bookmarked).
const slugOf = (file: string) => decodeURIComponent(file).replace(/\.html$/, "");

const DEPT_LINK: Record<string, string> = Object.fromEntries([
  ...DEPTS.filter((d) => !d.dataDept).map((d) => [d.key, `/member/${d.key}/`]),
  ["grade", "/member/grade/"],
  ["executive", "/member/"],
]);

export async function generateMetadata(props: PageProps<"/member/profile/[file]">): Promise<Metadata> {
  const m = bySlug(await loadMembers(), slugOf((await props.params).file));
  if (!m) return { title: "สมาชิก" };
  return {
    title: `${m.nickname} · ${m.role}`,
    description: `${m.name} (${m.nickname}) ${m.roles?.join(" · ") ?? m.role}`,
    openGraph: { images: [photoOf(m)] },
  };
}

export default async function ProfilePage(props: PageProps<"/member/profile/[file]">) {
  const m = bySlug(await loadMembers(), slugOf((await props.params).file));
  if (!m) notFound();
  const c = m.contacts ?? {};
  const shown = (v?: string) => !!v && v.trim() !== "" && v.trim() !== "—";
  const positions = m.positions?.length ? m.positions : [{ label: m.role, dept: "executive" as const }];

  return (
    <main className="p-page">
      <section className="p-wrap">
        <div className="p-photo">
          <Avatar src={photoOf(m)} nickname={m.nickname} />
        </div>
        <div className="p-text">
          <h1 className="p-role">{m.role}</h1>
          <p className="p-name">
            {m.name} <span>({m.nickname})</span>
          </p>
          {m.room && <p className="p-room">ห้อง {m.room}</p>}

          {positions.length > 1 && (
            <ul className="p-positions">
              {positions.slice(1).map((p) => (
                <li key={p.label}>
                  <AppLink href={("unit" in p && (p.unit === "secretary" || p.unit === "treasurer") ? `/member/${p.unit}/` : DEPT_LINK[p.dept]) ?? "/member/"}>{p.label}</AppLink>
                </li>
              ))}
            </ul>
          )}

          <div className="p-contacts">
            {shown(c.ig) && (
              <a href={`https://instagram.com/${c.ig!.trim()}`} target="_blank" rel="noreferrer" className="p-contact">
                <i className="fab fa-instagram" aria-hidden /> {c.ig!.trim()}
              </a>
            )}
            {shown(c.line) && (
              <a href={`https://line.me/ti/p/~${c.line!.trim()}`} target="_blank" rel="noreferrer" className="p-contact">
                <i className="fab fa-line" aria-hidden /> {c.line!.trim()}
              </a>
            )}
            {shown(c.call) && (
              <a href={`tel:${c.call!.replace(/[^\d+]/g, "")}`} className="p-contact">
                <i className="fas fa-phone" aria-hidden /> {c.call}
              </a>
            )}
          </div>

          {m.bio && (
            <div className="p-bio">
              {m.bio.split("\n").filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
          <AppLink href="/member/" className="m-back"><i className="fas fa-arrow-left" aria-hidden /> สมาชิกทั้งหมด</AppLink>
        </div>
      </section>
    </main>
  );
}
