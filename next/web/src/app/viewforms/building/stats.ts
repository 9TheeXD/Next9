// Building inspection summary: the same calculations as the old viewforms/building/app.js.

export type Issue = { id: number; issue_name: string; image_url: string; is_cancelled?: number };
export type Row = {
  id: number;
  date: string; // d/m/yyyy
  timestamp: string;
  building: string | number;
  room: string;
  floor: string | number;
  inspector1?: string;
  inspector2?: string;
  inspector3?: string;
  status: string;
  score?: number;
  overall_image_url?: string;
  issues: Issue[];
};

// Photos are stored as R2 keys and served through /api/file/ (a redirect to R2); old records that kept
// the bucket's public URL are mapped the same way.
export const fullImageUrl = (url?: string) =>
  !url ? "" : url.startsWith("https://cdn.yumistack.net/") ? "/api/file/" + url.slice(26) : url.startsWith("http") ? url : "/api/file/" + url;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mergeData(result: any): Row[] {
  const v1 = (result.v1Data || []).map((r: any) => ({
    id: r.id,
    date: r.date,
    timestamp: r.timestamp || r.date + "T00:00:00Z",
    building: r.building,
    room: r.room,
    floor: r.floor,
    inspector1: r.inspector1,
    inspector2: r.inspector2,
    inspector3: r.inspector3,
    status: "v1_legacy",
    score: r.total,
    overall_image_url: r.image_url,
    issues: [],
  }));
  return [...v1, ...(result.v2Data || [])];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function buddhistShort(dateStr: string) {
  if (!dateStr) return "";
  const p = dateStr.split("/");
  if (p.length === 3) {
    let y = parseInt(p[2]);
    if (y < 2500) y += 543;
    return `${p[0].padStart(2, "0")}/${p[1].padStart(2, "0")}/${String(y).slice(-2)}`;
  }
  return dateStr;
}

export const isPerfect = (r: Row) => r.status === "เรียบร้อย" || (r.status === "v1_legacy" && r.score === 15);

export function filterRows(raw: Row[], building: string, start: string, end: string) {
  return raw.filter((row) => {
    if (building !== "all" && String(row.building) !== String(building)) return false;
    if (!start || !end) return true;
    const p = row.date.split("/");
    if (p.length !== 3) return true;
    const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    const sd = new Date(start);
    const ed = new Date(end);
    ed.setHours(23, 59, 59);
    return d >= sd && d <= ed;
  });
}

export type RoomStat = { building: string | number; room: string; count: number; perfectCount: number; pct: number };

export function overview(rows: Row[]) {
  let perfect = 0;
  const bMap = new Map<string | number, { count: number; perfectCount: number }>();
  const rMap = new Map<string, { building: string | number; room: string; count: number; perfectCount: number }>();
  rows.forEach((row) => {
    const ok = isPerfect(row);
    if (ok) perfect++;
    if (!bMap.has(row.building)) bMap.set(row.building, { count: 0, perfectCount: 0 });
    const b = bMap.get(row.building)!;
    b.count++;
    if (ok) b.perfectCount++;
    const key = `${row.building}-${row.room}`;
    if (!rMap.has(key)) rMap.set(key, { building: row.building, room: row.room, count: 0, perfectCount: 0 });
    const r = rMap.get(key)!;
    r.count++;
    if (ok) r.perfectCount++;
  });
  const total = rows.length;
  const avg = total > 0 ? (perfect / total) * 100 : 0;
  const buildings = Array.from(bMap.entries())
    .map(([name, s]) => ({ name, count: s.count, pct: s.count > 0 ? (s.perfectCount / s.count) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const rooms: RoomStat[] = Array.from(rMap.values()).map((s) => ({ ...s, pct: s.count > 0 ? (s.perfectCount / s.count) * 100 : 0 }));
  const badCount = rooms.filter((r) => r.pct < 50).length;
  rooms.sort((a, b) => (b.pct !== a.pct ? b.pct - a.pct : b.count - a.count));
  let top = rooms.filter((r) => r.pct >= 80);
  let bottom = rooms.filter((r) => r.pct < 50).reverse();
  if (top.length === 0) top = rooms.slice(0, 5);
  if (bottom.length === 0) bottom = [...rooms].reverse().slice(0, 5);
  return {
    total,
    avg,
    best: buildings.length > 0 && buildings[0].count > 0 ? `อาคาร ${buildings[0].name}` : "-",
    buildings,
    badCount,
    top,
    bottom,
  };
}

export type RoomAgg = { building: string | number; floor: string | number; room: string; latestTimestamp: string; latestDate: string; latestStatus: string; issueCounts: [string, number][] };

export function details(rows: Row[]) {
  const agg = new Map<string, { building: string | number; floor: string | number; room: string; latestTimestamp: string; latestDate: string; latestStatus: string; issueCounts: Map<string, number> }>();
  rows.forEach((row) => {
    const key = `${row.building}-${row.room}`;
    if (!agg.has(key))
      agg.set(key, { building: row.building, floor: row.floor, room: row.room, latestTimestamp: row.timestamp, latestDate: row.date, latestStatus: row.status, issueCounts: new Map() });
    const a = agg.get(key)!;
    if (new Date(row.timestamp) > new Date(a.latestTimestamp)) {
      a.latestTimestamp = row.timestamp;
      a.latestDate = row.date;
      a.latestStatus = row.status;
    }
    (row.issues || []).forEach((i) => {
      if (i.is_cancelled !== 1) a.issueCounts.set(i.issue_name, (a.issueCounts.get(i.issue_name) || 0) + 1);
    });
  });
  const byBuilding = new Map<string | number, RoomAgg[]>();
  agg.forEach((a) => {
    if (!byBuilding.has(a.building)) byBuilding.set(a.building, []);
    byBuilding.get(a.building)!.push({ ...a, issueCounts: Array.from(a.issueCounts.entries()) });
  });
  return Array.from(byBuilding.keys())
    .sort((a, b) => parseInt(String(a)) - parseInt(String(b)))
    .map((b) => {
      const rooms = byBuilding.get(b)!;
      const floors = new Map<string | number, RoomAgg[]>();
      rooms.forEach((r) => {
        if (!floors.has(r.floor)) floors.set(r.floor, []);
        floors.get(r.floor)!.push(r);
      });
      return {
        building: b,
        count: rooms.length,
        floors: Array.from(floors.keys())
          .sort((x, y) => parseInt(String(x)) - parseInt(String(y)))
          .map((f) => ({ floor: f, rooms: floors.get(f)!.sort((x, y) => x.room.localeCompare(y.room)) })),
      };
    });
}

export function calendarIndex(raw: Row[], type: "building" | "room", building: string, roomQuery: string) {
  const q = roomQuery.trim().toLowerCase();
  const out: Record<string, Row[]> = {};
  raw.forEach((row) => {
    if (type === "building" && building !== "all" && String(row.building) !== String(building)) return;
    if (type === "room" && q && !String(row.room).toLowerCase().includes(q)) return;
    const p = row.date.split("/");
    if (p.length === 3) {
      let y = parseInt(p[2]);
      if (y < 2500) y += 543;
      const iso = `${y - 543}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
      (out[iso] ??= []).push(row);
    }
  });
  return out;
}

export function monthYear(dateStr: string) {
  const p = dateStr.split("/");
  if (p.length !== 3) return "";
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return `${months[parseInt(p[1], 10) - 1]} ${p[2]}`;
}

export function historyFor(raw: Row[], building: string | number, room: string, sort: string) {
  const list = raw.filter((r) => String(r.building) === String(building) && String(r.room) === String(room));
  const t = (r: Row) => new Date(r.timestamp).getTime();
  list.sort((a, b) => {
    if (sort === "latest") return t(b) - t(a);
    if (sort === "oldest") return t(a) - t(b);
    const ai = a.issues ? a.issues.length : 0;
    const bi = b.issues ? b.issues.length : 0;
    if (sort === "most_issues") return bi !== ai ? bi - ai : t(b) - t(a);
    return ai !== bi ? ai - bi : t(b) - t(a);
  });
  const months = new Map<string, Row[]>();
  list.forEach((r) => {
    const m = monthYear(r.date);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(r);
  });
  return Array.from(months.entries());
}
