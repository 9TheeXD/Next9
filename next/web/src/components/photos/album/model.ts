// Types, constants and small stores for the album page (native port of legacy photos/album/index.html).

export type Photo = {
  id: string;
  album_id?: string;
  original_name?: string;
  name?: string;
  file_type?: "image" | "video" | string;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  preview_b64?: string | null;
  processing_status?: string | null;
  last_error?: string | null;
  created_at: number;
  date_ref?: number | null;
  day_key?: string | null;
  // Capture time (EXIF, video header or file name); null when unknown.
  taken_at?: number | null;
};

export type AlbumInfo = {
  id: string | null;
  name: string;
  custom_cover_id?: string | null;
  event_date?: number | null;
  created_at?: number | null;
  is_locked?: boolean | number;
};

export type Crumb = { id: string; name: string };

export type Mode = { kind: "album"; id: string } | { kind: "all" } | { kind: "share"; token: string; albumId: string };

export type ShareInfo = {
  kind: "album" | "image";
  allow_download?: boolean | number;
  // 'editor' links may also upload, delete to trash, rename and add folders inside what they share.
  role?: "viewer" | "editor";
  include_subfolders?: boolean;
  expires_at?: number | null;
  album?: { id: string; name: string };
  image?: Photo & { name?: string };
};

// Per-item values many tiles read (selection, sharper viewed tier): each tile subscribes to its own
// id only, so changing one item re-renders one tile, not the whole grid.
export class KeyedStore<V> {
  private map = new Map<string, V>();
  private listeners = new Map<string, Set<() => void>>();
  private all = new Set<() => void>();
  get(id: string) {
    return this.map.get(id);
  }
  has(id: string) {
    return this.map.has(id);
  }
  get size() {
    return this.map.size;
  }
  keys() {
    return [...this.map.keys()];
  }
  set(id: string, v: V) {
    if (this.map.get(id) === v) return;
    this.map.set(id, v);
    this.emit(id);
  }
  delete(id: string) {
    if (!this.map.has(id)) return;
    this.map.delete(id);
    this.emit(id);
  }
  clear() {
    const ids = [...this.map.keys()];
    this.map.clear();
    ids.forEach((id) => this.emit(id, true));
    this.all.forEach((l) => l());
  }
  private emit(id: string, skipAll?: boolean) {
    this.listeners.get(id)?.forEach((l) => l());
    if (!skipAll) this.all.forEach((l) => l());
  }
  subscribe(id: string, l: () => void) {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(l);
    return () => {
      set!.delete(l);
    };
  }
  subscribeAll(l: () => void) {
    this.all.add(l);
    return () => {
      this.all.delete(l);
    };
  }
}

export const THAI_DAY_MS = 7 * 3600000;
// Days are Thai days (UTC+7) on both sides: the server groups its totals the same way.
export const thaiDate = (ts: number) => new Date(ts + THAI_DAY_MS);
export const dayKeyOf = (ts: number) => thaiDate(ts).toISOString().slice(0, 10);
export const imageDate = (img: Photo) => img.date_ref || img.created_at;
export const imageDayKey = (img: Photo) => img.day_key || dayKeyOf(imageDate(img));
const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function dayHeadLabel(ts: number) {
  const d = thaiDate(ts);
  const base = d.getUTCDate() + " " + TH_MONTHS_SHORT[d.getUTCMonth()] + " " + (d.getUTCFullYear() + 543);
  const key = dayKeyOf(ts);
  if (key === dayKeyOf(Date.now())) return "วันนี้ · " + base;
  if (key === dayKeyOf(Date.now() - 86400000)) return "เมื่อวาน · " + base;
  return base;
}

export const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export const MEDIA_EXT_RE = /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|m4v|webm)$/i;
export const isMediaFile = (f: File) => !!f && !/^\./.test(f.name || "") && (/^(image|video)\//.test(f.type || "") || MEDIA_EXT_RE.test(f.name || ""));
export const isVideoFile = (f: File) => (f.type || "").startsWith("video/");

// __slotKey ties a picked file to its tile in the grid, so a file appended to a running upload patches
// its own tile instead of whatever now sits at its old index. __quality/__format are the answers given
// for the batch this file arrived in: a batch dropped mid-upload joins the queue with its own settings.
export type UploadFile = File & { __targetAlbumId?: string; __slotKey?: string; __quality?: string; __format?: string; __order?: UploadOrder };

// Where an uploaded photo sits in the grid. block: one per upload block on screen (a new one each time
// the upload tiles start from empty), higher = newer, shown first. seq: the file's position in the
// order the visitor picked, never reused for the life of the page; higher = picked later = shown first,
// matching the newest-first grid. Both are fixed when the tile is
// created, so nothing that happens later (failures dropping out, later drops, refreshes) can move it.
export type UploadOrder = { block: number; seq: number };
