// ─────────────────────────────────────────────
// photos.js — หน้าดูรูปเวร (อ่านจากอัลบั้ม "เวรประจำวัน" บนเว็บ /photos)
// ดูแบบไฟล์ในคอม: ตาราง/รายการ, ขนาดเล็ก/กลาง/ใหญ่, ค้นหา, เรียง
// ─────────────────────────────────────────────

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const user = Auth.getCurrentUser();
  if (!user) { $("backLink").href = "index.html"; $("backLink").innerHTML = `<i class="fas fa-arrow-left"></i> หน้าแรก`; }

  // ────── การตั้งค่าที่จำไว้ในเครื่อง ──────
  const PREF_KEY = "duty_files_view";
  const pref = { view: "grid", size: "m", sort: "new", mine: false };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch {}
  const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch {} };

  let root = null;       // อัลบั้ม "เวรประจำวัน"
  let folders = [];      // วันที่ (โฟลเดอร์ย่อย)
  let folder = null;     // โฟลเดอร์ที่เปิดอยู่
  let images = [];       // รูปในโฟลเดอร์ที่เปิดอยู่
  let shown = [];        // รูปหลังกรอง/เรียง (ใช้กับ lightbox)

  const fmtDate = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });
  const fmtSize = b => !b ? "" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

  // ────── แถบเครื่องมือ ──────
  function syncTools() {
    document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("is-on", b.dataset.view === pref.view));
    document.querySelectorAll("[data-size]").forEach(b => b.classList.toggle("is-on", b.dataset.size === pref.size));
    document.querySelectorAll("[data-sort]").forEach(b => b.classList.toggle("is-on", b.dataset.sort === pref.sort));
    $("mineBtn").classList.toggle("is-on", pref.mine);
    $("mineBtn").hidden = !user || !folder;
    $("files").className = `file-view v-${pref.view} sz-${pref.size}`;
  }
  document.querySelectorAll("[data-view],[data-size],[data-sort]").forEach(b => {
    b.onclick = () => {
      if (b.dataset.view) pref.view = b.dataset.view;
      if (b.dataset.size) pref.size = b.dataset.size;
      if (b.dataset.sort) pref.sort = b.dataset.sort;
      savePref(); syncTools(); draw();
    };
  });
  $("mineBtn").onclick = () => { pref.mine = !pref.mine; savePref(); syncTools(); draw(); };
  $("q").oninput = () => draw();

  // ────── แสดงผล ──────
  function crumbs() {
    const parts = [`<button type="button" data-go="">${esc(CONFIG.PHOTOS_ROOT_ALBUM)}</button>`];
    if (folder) parts.push(`<i class="fas fa-chevron-right"></i><span>${esc(folder.name)}</span>`);
    $("crumbs").innerHTML = `<i class="fas fa-folder-open"></i>` + parts.join("");
    const target = folder ? folder.id : root && root.id;
    $("openWeb").href = target ? `${CONFIG.PHOTOS_ORIGIN}/photos/album/?id=${encodeURIComponent(target)}` : `${CONFIG.PHOTOS_ORIGIN}/photos/`;
  }
  $("crumbs").onclick = e => { if (e.target.closest("[data-go]")) location.hash = ""; };

  function sorted(list, nameOf, timeOf) {
    const out = list.slice();
    if (pref.sort === "name") out.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "th"));
    else out.sort((a, b) => pref.sort === "old" ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a));
    return out;
  }

  function draw() {
    crumbs();
    const q = $("q").value.trim().toLowerCase();
    const box = $("files");

    if (!folder) {
      const list = sorted(folders.filter(f => !q || f.name.toLowerCase().includes(q)), f => f.name, f => f.event_date || f.created_at);
      $("info").textContent = list.length ? `${list.length} วัน` : "";
      if (!list.length) return empty(q ? "ไม่พบวันที่ค้นหา" : "ยังไม่มีรูปเวร");
      box.innerHTML = list.map(f => {
        const n = f.total_photos ?? f.photo_count ?? 0;
        const cover = f.cover_image_id && f.has_access !== false
          ? `<img loading="lazy" src="${Api.imageUrl(f.cover_image_id, "thumb")}" alt="">` : "";
        return `
        <a class="fi is-folder" href="#${encodeURIComponent(f.id)}">
          <span class="fi-thumb">${cover}<i class="fas fa-folder"></i></span>
          <span class="fi-name">${esc(f.name)}</span>
          <span class="fi-meta">${n} รูป</span>
          <span class="fi-date">${f.updated_at ? "อัปเดต " + fmtDate.format(f.updated_at) : ""}</span>
        </a>`;
      }).join("");
      return;
    }

    let list = images;
    if (pref.mine && user) list = list.filter(i => (i.original_name || "").startsWith(user.fullName));
    if (q) list = list.filter(i => (i.original_name || "").toLowerCase().includes(q));
    shown = sorted(list, i => i.original_name || "", i => i.created_at);
    $("info").textContent = images.length ? `${shown.length} จาก ${images.length} รูป` : "";
    if (!shown.length) return empty(images.length ? "ไม่พบรูปที่ค้นหา" : "โฟลเดอร์นี้ยังไม่มีรูป");
    box.innerHTML = shown.map((img, i) => {
      const name = img.original_name || "";
      const dot = name.lastIndexOf(".");
      const [person, ...rest] = (dot > 0 ? name.slice(0, dot) : name).split("-");
      const ready = img.processing_status === "done" || !img.processing_status;
      return `
      <button type="button" class="fi is-file" data-i="${i}" title="${esc(name)}">
        <span class="fi-thumb">
          ${img.preview_b64 ? `<img class="fi-blur" src="${img.preview_b64}" alt="">` : ""}
          ${ready ? `<img loading="lazy" src="${Api.imageUrl(img.id, pref.size === "l" ? "sd" : "thumb")}" alt="" onload="this.classList.add('is-in')">` : `<i class="fas fa-gear fa-spin"></i>`}
        </span>
        <span class="fi-name">${esc(person)}</span>
        <span class="fi-meta">${esc(rest.join("-"))}</span>
        <span class="fi-date">${fmtTime.format(img.created_at)} น. · ${fmtSize(img.size_bytes)}${img.width ? ` · ${img.width}×${img.height}` : ""}</span>
      </button>`;
    }).join("");
  }

  function empty(text) {
    $("files").innerHTML = `<div class="empty"><i class="far fa-folder-open"></i>${esc(text)}</div>`;
  }

  function loading() {
    $("info").textContent = "";
    $("files").innerHTML = Array.from({ length: 12 }, () => `<div class="fi is-skel"><span class="fi-thumb"></span><span class="fi-name"></span></div>`).join("");
  }

  $("files").onclick = e => {
    const b = e.target.closest(".is-file");
    if (b) openLb(Number(b.dataset.i));
  };

  // ────── โหลดข้อมูลตาม #hash (ว่าง = รายการวัน, มี id = เปิดโฟลเดอร์นั้น) ──────
  async function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    syncTools();
    loading();
    try {
      if (!root) {
        root = await Api.findDutyRoot();
        if (root) folders = await Api.listFolders(root.id);
      }
      if (!root) { folder = null; crumbs(); return empty("ยังไม่มีอัลบั้มเวร — จะสร้างให้เองเมื่อมีคนส่งรูปครั้งแรก"); }
      if (!id || id === root.id) {
        folder = null;
        images = [];
        folders = await Api.listFolders(root.id);
      } else {
        const d = await Api.listImages(id);
        folder = d.album || { id, name: "" };
        images = d.images;
        if (d.locked) { syncTools(); crumbs(); return empty("โฟลเดอร์นี้ถูกล็อก เปิดดูได้ที่เว็บ /photos"); }
      }
      syncTools();
      draw();
    } catch (err) {
      console.error(err);
      crumbs();
      empty("โหลดรูปไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    }
  }
  window.addEventListener("hashchange", () => { $("q").value = ""; route(); });

  // ────── Lightbox ──────
  let lbIdx = 0;
  function openLb(i) {
    lbIdx = i;
    $("lb").hidden = false;
    document.body.classList.add("no-scroll");
    showLb();
  }
  function showLb() {
    const img = shown[lbIdx];
    if (!img) return;
    $("lbImg").src = Api.imageUrl(img.id, "medium");
    $("lbName").textContent = img.original_name || "";
    $("lbDl").href = Api.imageUrl(img.id, "original") + "?download=1";
    $("lbCount").textContent = `${lbIdx + 1} / ${shown.length}`;
    $("lbPrev").hidden = lbIdx === 0;
    $("lbNext").hidden = lbIdx === shown.length - 1;
  }
  function step(d) {
    const n = lbIdx + d;
    if (n >= 0 && n < shown.length) { lbIdx = n; showLb(); }
  }
  function closeLb() {
    $("lb").hidden = true;
    $("lbImg").removeAttribute("src");
    document.body.classList.remove("no-scroll");
  }
  $("lbPrev").onclick = () => step(-1);
  $("lbNext").onclick = () => step(1);
  $("lbClose").onclick = closeLb;
  $("lb").onclick = e => { if (e.target.id === "lb") closeLb(); };
  document.addEventListener("keydown", e => {
    if ($("lb").hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  let touchX = null;
  $("lb").addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
  $("lb").addEventListener("touchend", e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx > 0 ? -1 : 1);
    touchX = null;
  });

  route();
})();
