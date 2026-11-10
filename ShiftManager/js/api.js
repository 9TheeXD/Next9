// ─────────────────────────────────────────────
// api.js — สื่อสารกับ Google Sheets (Apps Script) และเว็บ /photos
// ─────────────────────────────────────────────

const Api = {
  // ────── Image Utilities ──────

  fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
      reader.readAsDataURL(file);
    });
  },

  // ย่อรูปเป็น JPEG ด้านยาวไม่เกิน MAX_IMAGE_DIM (ใช้กับไฟล์ที่ส่งเข้า Drive)
  resizeImage(file, maxDim, quality) {
    maxDim = maxDim || CONFIG.MAX_IMAGE_DIM;
    quality = quality || CONFIG.IMAGE_QUALITY;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { naturalWidth: width, naturalHeight: height } = img;
          if (!width || !height) return reject(new Error("อ่านขนาดรูปไม่ได้"));
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          c.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (err) { reject(err); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("เปิดไฟล์รูปไม่ได้")); };
      img.src = url;
    });
  },

  // คืน dataURL ที่พร้อมส่งเข้า Drive หรือ "" ถ้าเตรียมไม่ได้
  async preparePhoto(file) {
    try { return await this.resizeImage(file); }
    catch {
      try { return await this.fileToDataURL(file); }
      catch { return ""; }
    }
  },

  // ────── POST: บันทึกเวรลง Google Sheet + รูปลง Drive ──────

  async submitRecord(payload) {
    const body = JSON.stringify(payload);
    try {
      const res = await fetch(CONFIG.SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      });
      const text = await res.text();
      try { return JSON.parse(text); }
      catch { return { result: "unknown", message: text.slice(0, 300) }; }
    } catch {
      await fetch(CONFIG.SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      });
      return { result: "sent_no_cors", message: "ส่งแล้ว แต่ยืนยันผลไม่ได้" };
    }
  },

  // ลบรายการ (แถวในชีท + รูปใน Drive)
  deleteRecord({ workDate, fullName, rowTime }) {
    return this.submitRecord({ action: "delete", workDate, fullName, rowTime });
  },

  // version ของ Apps Script ที่ deploy อยู่ ("" ถ้าเก่ากว่า 3.1 หรือเช็กไม่ได้)
  async scriptVersion() {
    try {
      const res = await fetch(CONFIG.SCRIPT_URL, { cache: "no-store" });
      return (await res.json()).version || "";
    } catch { return ""; }
  },

  // ────── POST: ส่งรูปต้นฉบับเข้าอัลบั้ม /photos ──────
  // เก็บที่ "เวรประจำวัน" > "dd/mm/yy" ชื่อไฟล์ "{name}-{label}.นามสกุล" (เซิร์ฟเวอร์ตั้งให้)
  // label = "{จุดเวร}-{วว-ดด-ปป HH.mm}"

  // ส่งตรงเข้า storage ของเว็บ (R2) ทีละไฟล์ด้วย URL ที่เซิร์ฟเวอร์เซ็นให้ แล้วแจ้งเซิร์ฟเวอร์ว่าส่งครบ
  // (เว็บที่รันแบบ serverless รับไฟล์ผ่านตัวเองได้ไม่กี่ MB ต่อคำขอ) ถ้าเซิร์ฟเวอร์ยังเป็นรุ่นเก่า
  // ที่ไม่มี duty-upload-url จะส่งแบบเดิม (multipart ก้อนเดียว)
  async uploadToPhotos({ date, name, label, files }, onProgress) {
    const origin = CONFIG.PHOTOS_ORIGIN;
    let signRes;
    try {
      signRes = await fetch(`${origin}/api/photos/duty-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, name, position: label, files: files.map(f => ({ name: f.name || "photo.jpg", size: f.size, type: f.type })) }),
      });
    } catch { throw new Error("เชื่อมต่อเว็บรูปไม่ได้"); }
    if (signRes.status === 404) return this._uploadToPhotosMultipart({ date, name, label, files }, onProgress);
    let signed = {};
    try { signed = await signRes.json(); } catch {}
    if (!signRes.ok || !signed.success) throw new Error(signed.message || `HTTP ${signRes.status}`);

    const total = files.reduce((n, f) => n + (f.size || 0), 0) || 1;
    const sent = files.map(() => 0);
    const report = () => onProgress && onProgress(Math.min(1, sent.reduce((a, b) => a + b, 0) / total));
    const put = (url, file, type, i) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", type || file.type || "application/octet-stream");
      xhr.upload.onprogress = e => { if (e.lengthComputable) { sent[i] = e.loaded; report(); } };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("เชื่อมต่อเว็บรูปไม่ได้"));
      xhr.send(file);
    });
    await Promise.all(signed.uploads.map((u, i) => put(u.url, files[i], u.contentType, i)));

    const commitRes = await fetch(`${origin}/api/photos/duty-commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ album_id: signed.album.id, files: signed.uploads.map((u, i) => ({ id: u.id, key: u.key, name: u.name, size: files[i].size })) }),
    });
    let data = {};
    try { data = await commitRes.json(); } catch {}
    if (!commitRes.ok || !data.success) throw new Error(data.message || `HTTP ${commitRes.status}`);
    return data;
  },

  _uploadToPhotosMultipart({ date, name, label, files }, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("date", date);
      fd.append("name", name);
      fd.append("position", label);
      files.forEach(f => fd.append("files", f, f.name || "photo.jpg"));
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${CONFIG.PHOTOS_ORIGIN}/api/photos/duty-upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200 && data.success) resolve(data);
        else reject(new Error(data.message || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("เชื่อมต่อเว็บรูปไม่ได้"));
      xhr.send(fd);
    });
  },

  // ────── GET: ดึงข้อมูลจาก Google Sheet (CSV export) ──────

  // แปลง CSV ทั้งไฟล์ (รองรับช่องที่มีขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด)
  _parseCSV(text) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some(c => c.trim())) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some(c => c.trim())) rows.push(row);
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(cols => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = (cols[idx] || "").trim(); });
      return o;
    });
  },

  // "DD/MM/YYYY" หรือ "D/M/YYYY" หรือ "YYYY-MM-DD" → "YYYY-MM-DD"
  _normalizeDate(dateStr) {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      let [d, m, y] = parts;
      y = y.trim().slice(0, 4);
      if (parseInt(y) > 2500) y = String(parseInt(y) - 543);
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return dateStr;
  },

  // ทุกแถวในแท็บบันทึกเวร → [{ date, time, name, position, duty, status, note, photos[] }]
  async getAllRecords() {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${CONFIG.SHEET_GID}&_=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("ดึงข้อมูลไม่สำเร็จ");
    const out = [];
    for (const row of this._parseCSV(await res.text())) {
      const name = (row["ชื่อ-นามสกุล"] || "").trim();
      const rawDate = row["วันที่ปฏิบัติงาน"] || "";
      if (!name || !rawDate) continue;
      out.push({
        date: this._normalizeDate(rawDate),
        time: (row["เวลาที่บันทึก"] || "").trim(),
        name,
        position: (row["ตำแหน่งในสภานักเรียน"] || "").trim(),
        duty: (row["หน้าที่รับผิดชอบ"] || "").trim(),
        status: (row["สถานะการมา/ลา"] || "").trim(),
        note: (row["หมายเหตุ"] || "").trim(),
        photos: (row["รูปหลักฐาน"] || "").split(/\s+/).filter(s => /^https?:\/\//.test(s)),
      });
    }
    return out;
  },

  // ประวัติเวรของคนนี้ในเดือน yearMonth ("YYYY-MM")
  async getHistory(fullName, yearMonth) {
    try {
      const records = (await this.getAllRecords())
        .filter(r => r.name === fullName && r.date.startsWith(yearMonth))
        .map(({ date, time, status, duty, note, photos }) => ({ date, time, status, duty, note, photos }));
      return { result: "success", records };
    } catch (err) {
      console.warn("getHistory error:", err);
      return { result: "error", records: [] };
    }
  },

  // ────── GET: อ่านอัลบั้มเวรจาก /photos ──────

  async _getJSON(path) {
    const res = await fetch(CONFIG.PHOTOS_ORIGIN + path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async findDutyRoot() {
    const list = await this._getJSON("/api/photos/albums?parent=root");
    return list.find(a => a.name === CONFIG.PHOTOS_ROOT_ALBUM) || null;
  },

  listFolders(parentId) {
    return this._getJSON(`/api/photos/albums?parent=${encodeURIComponent(parentId)}`);
  },

  // รูปทั้งหมดในอัลบั้ม (ไล่ทุกหน้า)
  async listImages(albumId) {
    const all = [];
    let album = null;
    for (let page = 1; page < 50; page++) {
      const d = await this._getJSON(`/api/photos/albums/${encodeURIComponent(albumId)}/images?page=${page}&limit=100&sort=latest`);
      if (!album) album = d.album;
      if (d.locked) return { album, images: [], locked: true };
      all.push(...(d.images || []));
      if (!d.hasMore) break;
    }
    return { album, images: all, locked: false };
  },

  // รูปของคนนี้ในวันนั้นบน /photos ย้ายไปถังขยะ (กู้คืนได้ 30 วัน)
  // duty = เฉพาะไฟล์ของจุดนั้น, all = ทุกไฟล์ของคนนี้ในวันนั้น
  async deletePhotos({ date, name, duty, all }) {
    const res = await fetch(`${CONFIG.PHOTOS_ORIGIN}/api/photos/duty-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name, duty, all: all ? 1 : 0 }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) throw new Error(d.message || `HTTP ${res.status}`);
    return d;
  },

  // รูปย่อของไฟล์ Drive (ไฟล์ต้องแชร์แบบมีลิงก์) หรือ "" ถ้าไม่ใช่ลิงก์ Drive
  driveThumb(url, size) {
    const m = String(url).match(/\/d\/([-\w]{20,})/) || String(url).match(/[?&]id=([-\w]{20,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size || 200}` : "";
  },

  imageUrl(id, variant) {
    return `${CONFIG.PHOTOS_ORIGIN}/api/image/${encodeURIComponent(id)}/${variant}`;
  },
};
