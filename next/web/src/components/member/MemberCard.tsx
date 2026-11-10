import { photoOf, shortName, type Member } from "@/lib/members";
import { Avatar } from "./Avatar";
import { AppLink } from "@/components/AppLink";

export function profileHref(m: Member) {
  return `/member/profile/${m.slug}.html`;
}

// Photo card: used for heads and for the full member list.
export function MemberCard({ member, caption, size = "md" }: { member: Member; caption?: string; size?: "lg" | "md" }) {
  return (
    <AppLink href={profileHref(member)} className={`m-card m-card-${size}`}>
      <div className="m-card-photo">
        <Avatar src={photoOf(member)} nickname={member.nickname} />
      </div>
      <div className="m-card-body">
        {caption && <div className="m-card-caption">{caption}</div>}
        <div className="m-card-nick">{member.nickname}</div>
        <div className="m-card-name">{shortName(member)}</div>
      </div>
    </AppLink>
  );
}

// Compact row: assistants and secretaries.
export function MemberRow({ member, caption }: { member: Member; caption?: string }) {
  return (
    <AppLink href={profileHref(member)} className="m-row">
      <Avatar src={photoOf(member)} nickname={member.nickname} className="m-row-photo" />
      <div className="m-row-text">
        <div className="m-row-nick">
          {member.nickname}
          {member.room && <span className="m-row-room">{member.room}</span>}
        </div>
        <div className="m-row-name">{shortName(member)}</div>
        {caption && <div className="m-row-caption">{caption}</div>}
      </div>
      <i className="fas fa-chevron-right m-row-go" aria-hidden />
    </AppLink>
  );
}
