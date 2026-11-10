import type { Album } from "./types";
import { fmt } from "./util";

// Folder tree helpers over the flat album list (ported from folders.js).
export const tree = {
  children: (list: Album[], parentId: string | null) => list.filter((a) => (a.parent_id || null) === (parentId || null)),
  path(list: Album[], id: string) {
    const byId = new Map(list.map((a) => [a.id, a]));
    const out: Album[] = [];
    const seen = new Set<string>();
    let cur = byId.get(id);
    while (cur && !seen.has(cur.id)) {
      out.unshift(cur);
      seen.add(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  },
  descendants(list: Album[], id: string) {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of list)
        if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
          ids.add(a.id);
          grew = true;
        }
    }
    return ids;
  },
  totals(list: Album[], id: string) {
    const ids = tree.descendants(list, id);
    let photos = 0,
      videos = 0;
    for (const a of list)
      if (ids.has(a.id)) {
        photos += a.photo_count || 0;
        videos += a.video_count || 0;
      }
    return { folders: ids.size - 1, photos, videos };
  },
};

export const sortAlbums = (list: Album[]) =>
  list
    .slice()
    .sort((a, b) => (b.event_date || b.created_at || 0) - (a.event_date || a.created_at || 0) || (b.updated_at || 0) - (a.updated_at || 0));

export const pinnedFirst = (list: Album[]) => {
  const sorted = sortAlbums(list);
  return sorted
    .filter((a) => a.pinned_at)
    .sort((a, b) => (b.pinned_at || 0) - (a.pinned_at || 0))
    .concat(sorted.filter((a) => !a.pinned_at));
};

// Folder, photo and video counts including everything in sub-folders; older payloads only carry this level.
export const countsOf = (a: Pick<Album, "child_count" | "photo_count" | "video_count" | "total_folders" | "total_photos" | "total_videos">) => ({
  folders: a.total_folders ?? a.child_count ?? 0,
  photos: a.total_photos ?? a.photo_count ?? 0,
  videos: a.total_videos ?? a.video_count ?? 0,
});

export function metaText(a: Pick<Album, "child_count" | "photo_count" | "video_count" | "total_folders" | "total_photos" | "total_videos">) {
  const c = countsOf(a);
  const parts: string[] = [];
  if (c.folders) parts.push(fmt(c.folders) + " โฟลเดอร์");
  if (c.photos) parts.push(fmt(c.photos) + " รูป");
  if (c.videos) parts.push(fmt(c.videos) + " วิดีโอ");
  return parts.length ? parts.join(" · ") : "ว่าง";
}

export const albumUrl = (id: string) => "/photos/album/?id=" + encodeURIComponent(id);
export const shareUrl = (id: string) => location.origin + "/s/?t=" + encodeURIComponent(id);
