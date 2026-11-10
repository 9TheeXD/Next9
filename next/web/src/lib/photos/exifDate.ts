// Reads when a JPEG was taken (DateTimeOriginal, else DateTimeDigitized, else DateTime) plus the matching
// OffsetTime tag, straight from the file's EXIF block. Used before an upload is re-encoded on a canvas,
// which drops EXIF, so the server still learns the capture time. Mirrors exifTakenAt in server.js.
export async function readExifDate(file: Blob): Promise<{ date: string; offset: string } | null> {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.byteLength < 4 || buf.getUint16(0) !== 0xffd8) return null;
    // Walk the JPEG segments up to the APP1 "Exif\0\0" one.
    let at = 2;
    let tiff = -1;
    while (at + 4 <= buf.byteLength) {
      const marker = buf.getUint16(at);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      const len = buf.getUint16(at + 2);
      if (marker === 0xffe1 && at + 10 <= buf.byteLength && buf.getUint32(at + 4) === 0x45786966 && buf.getUint16(at + 8) === 0) {
        tiff = at + 10;
        break;
      }
      at += 2 + len;
    }
    if (tiff < 0 || tiff + 8 > buf.byteLength) return null;
    const le = buf.getUint16(tiff) === 0x4949;
    const u16 = (o: number) => buf.getUint16(o, le);
    const u32 = (o: number) => buf.getUint32(o, le);
    if (u16(tiff + 2) !== 42) return null;
    const found: Record<number, string> = {};
    const readIfd = (offset: number, depth: number) => {
      if (depth > 2) return;
      const ifd = tiff + offset;
      if (ifd + 2 > buf.byteLength) return;
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > buf.byteLength) return;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const n = u32(entry + 4);
        if (tag === 0x8769) {
          readIfd(u32(entry + 8), depth + 1);
          continue;
        }
        if (type !== 2 || n > 64 || ![0x9003, 0x9004, 0x0132, 0x9011, 0x9012, 0x9010].includes(tag)) continue;
        const valueAt = n <= 4 ? entry + 8 : tiff + u32(entry + 8);
        if (valueAt + n > buf.byteLength) continue;
        let s = "";
        for (let k = 0; k < n; k++) {
          const c = buf.getUint8(valueAt + k);
          if (!c) break;
          s += String.fromCharCode(c);
        }
        found[tag] = s.trim();
      }
    };
    readIfd(u32(tiff + 4), 0);
    const dateTag = found[0x9003] ? 0x9003 : found[0x9004] ? 0x9004 : 0x0132;
    const date = found[dateTag];
    if (!date || !/^\d{4}:\d{2}:\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(date)) return null;
    const offset = found[{ 0x9003: 0x9011, 0x9004: 0x9012, 0x0132: 0x9010 }[dateTag]!] || "";
    return { date: date.slice(0, 19), offset: /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "" };
  } catch {
    return null;
  }
}
