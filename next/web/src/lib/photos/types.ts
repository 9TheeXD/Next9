// Shape of one album card as returned by GET /api/photos/albums (serializeAlbums in server.js).
export type CoverImage = {
  id: string;
  preview_b64?: string | null;
};

export type Album = {
  id: string;
  name: string;
  parent_id: string | null;
  child_count: number;
  has_access: boolean;
  is_locked: boolean | number;
  lock_gate_id?: string | null;
  pinned_at: number | null;
  custom_cover_id?: string | null;
  // Sub-folder rows (album page) carry a single cover instead of cover_images.
  cover_image_id?: string | null;
  cover_preview?: string | null;
  cover_images?: CoverImage[];
  photo_count: number;
  video_count: number;
  // Same counts summed over every sub-folder below this one (server.js serializeAlbums).
  total_folders?: number;
  total_photos?: number;
  total_videos?: number;
  event_date?: number | null;
  created_at: number;
  updated_at: number;
};

export type SortKey =
  | "default"
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc"
  | "count_desc"
  | "count_asc"
  | "name_asc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "ค่าเริ่มต้น" },
  { value: "updated_desc", label: "แก้ไขล่าสุด" },
  { value: "updated_asc", label: "แก้ไขเก่าสุด" },
  { value: "created_desc", label: "สร้างล่าสุด" },
  { value: "created_asc", label: "สร้างเก่าสุด" },
  { value: "count_desc", label: "จำนวนรูปมากสุด" },
  { value: "count_asc", label: "จำนวนรูปน้อยสุด" },
  { value: "name_asc", label: "ชื่อ ก-ฮ" },
];
