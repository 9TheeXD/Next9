// ─────────────────────────────────────────────
// summary.js — หน้าสรุปเวร: ตารางคน × วัน ของเดือนที่เลือก
// กดหัวคอลัมน์เพื่อเรียง, กดช่องเพื่อดูรายละเอียด (เวลา, รูปจาก /photos และ Google Drive)
// ─────────────────────────────────────────────

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const coll = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
  const p2 = n => String(n).padStart(2, "0");
  const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  const user = Auth.getCurrentUser();
  if (!user) { $("backLink").href = "index.html"; $("backLink").innerHTML = `<i class="fas fa-arrow-left"></i> หน้าแรก`; }

  // ────── สถานะ ──────
  const PREF_KEY = "duty_summary_view";
  const pref = { days: "logged", sort: "cls", dir: 1 };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch {}
  const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch {} };

  let all = [];                        // ทุกแถวในชีท
  const now = new Date();
  let ym = { y: now.getFullYear(), m: now.getMonth() }; // เดือนที่ดู (m = 0-11)
  let rows = [], days = [];            // ข้อมูลของเดือนที่ดู
  let sel = null;                      // { name, date } ช่องที่เลือก (date = "" คือกดชื่อ)

  const ymStr = () => `${ym.y}-${p2(ym.m + 1)}`;
  const statusOf = v => STATUSES.find(s => s.value === v) || null;
  const shortDuty = d => String(d || "").split(/\s*,\s*/).map(x => x.replace(/^เวร(?=\S)/, "")).join(", ");
  const stripTitle = n => n.replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, "");
  const thaiDate = ds => { const [y, m, d] = ds.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y + 543}`; };
  const folderName = ds => `${ds.slice(8, 10)}/${ds.slice(5, 7)}/${String(+ds.slice(0, 4) + 543).slice(-2)}`;

  // ข้อความในช่อง: จุดเวร (ตัด "เวร" นำหน้า) หรือสถานะถ้าไม่ได้มาปฏิบัติงาน
  function cellText(recs) {
    if (!recs || !recs.length) return "";
    const r = recs[recs.length - 1];
    const st = statusOf(r.status);
    const main = !st || st.key === "present" ? shortDuty(r.duty) || "มา" : st.short;
    return main + (recs.length > 1 ? ` +${recs.length - 1}` : "");
  }
  // สีช่อง: เขียว = มาทำ ลงวันนั้น, เหลือง = มาทำ แต่ลงย้อนหลัง, แดง = ไม่ได้ปฏิบัติหน้าที่,
  // เทา = ลา/ป่วย/กิจกรรม/อื่นๆ
  function cellKey(recs) {
    if (!recs || !recs.length) return "";
    const r = recs[recs.length - 1];
    const st = statusOf(r.status);
    if (st && st.key === "absent") return "absent";
    if (st && st.key !== "present") return "off";
    return isLate(r) ? "late" : "ok";
  }
  // "เวลาที่บันทึก" (d/M/yyyy, H:mm:ss) เป็นวันหลังวันปฏิบัติงาน = ลงย้อนหลัง
  function isLate(r) {
    const m = String(r.time).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return false;
    let y = +m[3];
    if (y > 2500) y -= 543;
    return `${y}-${p2(m[2])}-${p2(m[1])}` > r.date;
  }

  // ────── สร้างแถว/คอลัมน์ของเดือน ──────
  function build() {
    const inMonth = all.filter(r => r.date.startsWith(ymStr()));
    const byName = new Map();
    MEMBERS.forEach(m => byName.set(m.fullName, { name: m.fullName, nick: m.nickname, cls: m.cls || "", no: m.no || "", position: m.position, cells: {} }));
    inMonth.forEach(r => {
      if (!byName.has(r.name)) byName.set(r.name, { name: r.name, nick: "", cls: "", no: "", position: r.position, cells: {}, extra: true });
      const p = byName.get(r.name);
      (p.cells[r.date] = p.cells[r.date] || []).push(r);
    });
    rows = [...byName.values()];
    rows.forEach(p => { p.total = Object.keys(p.cells).length; });

    if (pref.days === "all") {
      const last = new Date(ym.y, ym.m + 1, 0).getDate();
      days = Array.from({ length: last }, (_, i) => `${ymStr()}-${p2(i + 1)}`);
    } else {
      days = [...new Set(inMonth.map(r => r.date))].sort();
    }
  }

  // ────── เรียง ──────
  const clsKey = c => { const m = String(c).match(/(\d+)\s*\/\s*(\d+)/); return m ? +m[1] * 100 + +m[2] : null; };
  const numKey = n => { const v = parseInt(n, 10); return isNaN(v) ? null : v; };
  function compare(a, b) {
    const k = pref.sort;
    let va, vb, cmp;
    if (k === "name") { va = stripTitle(a.name); vb = stripTitle(b.name); }
    else if (k === "nick") { va = a.nick; vb = b.nick; }
    else if (k === "cls") { va = clsKey(a.cls); vb = clsKey(b.cls); }
    else if (k === "no") { va = numKey(a.no); vb = numKey(b.no); }
    else if (k === "total") { va = a.total; vb = b.total; }
    else { va = cellText(a.cells[k]); vb = cellText(b.cells[k]); }
    const ea = va === null || va === "", eb = vb === null || vb === "";
    if (ea || eb) cmp = ea && eb ? 0 : ea ? 1 : -1; // ช่องว่างไว้ท้ายเสมอ
    else cmp = (typeof va === "number" ? va - vb : coll.compare(va, vb)) * pref.dir;
    if (!cmp && k === "cls") cmp = (numKey(a.no) ?? 999) - (numKey(b.no) ?? 999); // ชั้นเดียวกัน เรียงเลขที่
    return cmp || coll.compare(stripTitle(a.name), stripTitle(b.name));
  }

  // จุดเวรที่ค้น (เช่น "ประตู") — คนที่เคยลงจุดนั้นในเดือนนี้ผ่านการค้น
  const dutyHit = (p, q) => Object.values(p.cells).some(recs => recs.some(r => String(r.duty || "").toLowerCase().includes(q)));

  // ────── วาดตาราง ──────
  function draw() {
    $("mLabel").textContent = `${MONTHS[ym.m]} ${ym.y + 543}`;
    $("mNext").disabled = ym.y > now.getFullYear() || (ym.y === now.getFullYear() && ym.m >= now.getMonth());
    document.querySelectorAll("[data-days]").forEach(b => b.classList.toggle("is-on", b.dataset.days === pref.days));
    if (pref.sort.includes("-") && !days.includes(pref.sort)) { pref.sort = "cls"; pref.dir = 1; }

    const q = $("q").value.trim().toLowerCase();
    const list = rows
      .filter(p => !q || [p.name, p.nick, p.cls, p.position].some(v => String(v).toLowerCase().includes(q)) || dutyHit(p, q))
      .filter(p => !p.extra || p.total)
      .sort(compare);
    const logged = rows.filter(p => p.total).length;
    $("info").textContent = days.length
      ? `${list.length} คน · ${days.length} วัน · ลงเวรแล้ว ${logged} คน`
      : "เดือนนี้ยังไม่มีใครลงเวร";

    const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
    const th = (key, label, cls) => {
      const on = pref.sort === key;
      return `<th class="${cls || ""}${on ? " is-sorted" : ""}" data-sort="${key}" aria-sort="${on ? (pref.dir > 0 ? "ascending" : "descending") : "none"}">
        <button type="button">${label}<i class="fas ${on ? (pref.dir > 0 ? "fa-caret-up" : "fa-caret-down") : "fa-sort"}"></i></button></th>`;
    };
    const head = `<thead><tr>
      ${th("name", "ชื่อ-สกุล", "c-name")}
      ${th("nick", "ชื่อเล่น", "c-nick")}
      ${th("cls", "ชั้น", "c-cls")}
      ${th("no", "เลขที่", "c-no")}
      ${days.map(d => {
        const dt = new Date(d + "T00:00:00");
        return th(d, `<span class="d-wd">${WD[dt.getDay()]}</span>${d.slice(8, 10)}/${d.slice(5, 7)}/${String(+d.slice(0, 4) + 543).slice(-2)}`, "c-day" + (d === today ? " is-today" : "") + (dt.getDay() % 6 === 0 ? " is-weekend" : ""));
      }).join("")}
      ${th("total", "รวม", "c-total")}
    </tr></thead>`;

    const body = list.map(p => `<tr class="${sel && sel.name === p.name ? "is-row-sel" : ""}">
      <th class="c-name" scope="row"><button type="button" class="sum-name${sel && sel.name === p.name && !sel.date ? " is-sel" : ""}" data-name="${esc(p.name)}">${esc(p.name)}</button></th>
      <td class="c-nick">${esc(p.nick || "–")}</td>
      <td class="c-cls">${esc(p.cls || "–")}</td>
      <td class="c-no">${esc(p.no || "–")}</td>
      ${days.map(d => {
        const recs = p.cells[d];
        const t = cellText(recs);
        const pics = recs ? recs.reduce((n, r) => n + r.photos.length, 0) : 0;
        const isSel = sel && sel.name === p.name && sel.date === d;
        return `<td class="c-day"><button type="button" class="cell is-${cellKey(recs) || "none"}${isSel ? " is-sel" : ""}" data-name="${esc(p.name)}" data-date="${d}" title="${esc(recs ? recs.map(r => `${r.duty} · ${r.status}`).join("\n") : "ไม่ได้ลง")}">
          ${t ? `<span>${esc(t)}</span>${pics ? `<i class="fas fa-image"></i>` : ""}` : ""}</button></td>`;
      }).join("")}
      <td class="c-total">${p.total || ""}</td>
    </tr>`).join("");

    $("table").innerHTML = head + `<tbody>${body || `<tr><td colspan="${days.length + 5}" class="empty">ไม่พบรายชื่อ</td></tr>`}</tbody>`;
  }

  // ────── เหตุการณ์ในตาราง ──────
  $("table").onclick = e => {
    const h = e.target.closest("th[data-sort]");
    if (h && h.closest("thead")) {
      const k = h.dataset.sort;
      if (pref.sort === k) pref.dir = -pref.dir;
      else { pref.sort = k; pref.dir = k === "total" ? -1 : 1; }
      savePref(); draw();
      return;
    }
    const c = e.target.closest("[data-name]");
    if (c) select(c.dataset.name, c.dataset.date || "");
  };

  $("mPrev").onclick = () => { ym = ym.m ? { y: ym.y, m: ym.m - 1 } : { y: ym.y - 1, m: 11 }; closeDetail(); build(); draw(); };
  $("mNext").onclick = () => { ym = ym.m < 11 ? { y: ym.y, m: ym.m + 1 } : { y: ym.y + 1, m: 0 }; closeDetail(); build(); draw(); };
  $("q").oninput = draw;
  document.querySelectorAll("[data-days]").forEach(b => {
    b.onclick = () => { pref.days = b.dataset.days; savePref(); build(); draw(); };
  });

  // ────── รายละเอียดด้านขวา ──────
  const isPhone = () => matchMedia("(max-width: 900px)").matches;

  function select(name, date) {
    sel = { name, date };
    draw();
    const p = rows.find(r => r.name === name);
    if (!p) return;
    $("detail").hidden = false;
    $("sumLayout").classList.add("has-detail");
    if (isPhone()) { $("dBackdrop").hidden = false; document.body.classList.add("no-scroll"); }
    $("dName").textContent = p.nick ? `${p.name} (${p.nick})` : p.name;
    if (!date) return personDetail(p);
    $("dSub").textContent = thaiDate(date);
    dayDetail(p, date);
  }

  function closeDetail() {
    sel = null;
    $("detail").hidden = true;
    $("dBackdrop").hidden = true;
    $("sumLayout").classList.remove("has-detail");
    document.body.classList.remove("no-scroll");
  }
  $("dClose").onclick = () => { closeDetail(); draw(); };
  $("dBackdrop").onclick = () => { closeDetail(); draw(); };

  // กดชื่อ: เวรทั้งเดือนของคนนี้
  function personDetail(p) {
    const ds = Object.keys(p.cells).sort();
    $("dSub").textContent = `${[p.cls && "ชั้น " + p.cls, p.no && "เลขที่ " + p.no, p.position].filter(Boolean).join(" · ")}`;
    $("dBody").innerHTML = `
      <div class="d-stat"><b>${ds.length}</b> วันที่ลงใน${MONTHS[ym.m]}</div>
      ${ds.length ? `<ul class="d-days">${ds.map(d => `
        <li><button type="button" data-goto="${d}">
          <span class="d-date">${thaiDate(d)}</span>
          <span class="cell is-${cellKey(p.cells[d])}"><span>${esc(cellText(p.cells[d]))}</span></span>
        </button></li>`).join("")}</ul>` : `<div class="d-none"><i class="far fa-calendar-xmark"></i> เดือนนี้ยังไม่ได้ลงเวร</div>`}`;
    $("dBody").querySelectorAll("[data-goto]").forEach(b => { b.onclick = () => select(p.name, b.dataset.goto); });
  }

  // กดช่องวัน: ทุกรายการของวันนั้น + รูปจาก /photos และ Drive
  function dayDetail(p, date) {
    const recs = p.cells[date] || [];
    if (!recs.length) {
      $("dBody").innerHTML = `<div class="d-none"><i class="far fa-calendar-xmark"></i> วันนี้ไม่ได้ลงเวร</div>`;
      return;
    }
    const drive = recs.flatMap(r => r.photos);
    $("dBody").innerHTML = recs.map(r => {
      const st = statusOf(r.status);
      return `<div class="d-rec">
        <div class="d-row"><i class="fas fa-location-dot"></i><div><small>จุดเวร</small><b>${esc(r.duty || "–")}</b></div></div>
        <div class="d-row"><i class="fas ${st ? st.icon : "fa-circle-question"} st-${st ? st.key : "other"}"></i><div><small>สถานะ</small><b>${esc(r.status || "–")}</b></div></div>
        <div class="d-row"><i class="far fa-clock"></i><div><small>ลงเวรเมื่อ</small><b>${esc(r.time || "–")}${isLate(r) ? ` <span class="d-late">ลงย้อนหลัง</span>` : ""}</b></div></div>
        ${r.note ? `<div class="d-row"><i class="far fa-note-sticky"></i><div><small>หมายเหตุ</small><b>${esc(r.note)}</b></div></div>` : ""}
      </div>`;
    }).join("") + `
      <div class="d-sec">
        <div class="d-sec-head"><i class="fas fa-images"></i> รูปในเว็บ /photos <a id="dWeb" target="_blank" rel="noopener" hidden>เปิดอัลบั้ม <i class="fas fa-arrow-up-right-from-square"></i></a></div>
        <div class="d-grid" id="dPhotos"><div class="d-load"><span class="spin"></span> กำลังโหลด...</div></div>
      </div>
      <div class="d-sec">
        <div class="d-sec-head"><i class="fab fa-google-drive"></i> Google Drive</div>
        ${drive.length ? `<ul class="d-drive">${drive.map((u, i) => {
          const t = Api.driveThumb(u, 120);
          return `<li><a href="${esc(u)}" target="_blank" rel="noopener">
            <span class="d-dthumb">${t ? `<img src="${esc(t)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="fas fa-image"></i></span>
            <span>รูปที่ ${i + 1}<small>เปิดใน Google Drive</small></span>
            <i class="fas fa-arrow-up-right-from-square"></i></a></li>`;
        }).join("")}</ul>` : `<div class="d-none sm">ไม่มีรูปใน Drive</div>`}
      </div>`;
    loadWebPhotos(p.name, date);
  }

  // ────── รูปจาก /photos (เวรประจำวัน › dd/mm/yy › ชื่อไฟล์ขึ้นต้นด้วยชื่อคน) ──────
  let rootP = null;
  const folderP = new Map();
  function dayImages(date) {
    if (!rootP) rootP = Api.findDutyRoot().then(r => r ? Api.listFolders(r.id) : []);
    const key = folderName(date);
    if (!folderP.has(key)) {
      folderP.set(key, rootP.then(folders => {
        const f = folders.find(x => x.name === key);
        return f ? Api.listImages(f.id).then(d => ({ folder: f, images: d.images })) : { folder: null, images: [] };
      }));
    }
    return folderP.get(key);
  }
  let lbList = [];
  async function loadWebPhotos(name, date) {
    try {
      const { folder, images } = await dayImages(date);
      if (!sel || sel.name !== name || sel.date !== date) return; // เปลี่ยนช่องไปแล้ว
      const mine = images.filter(i => (i.original_name || "").startsWith(name + "-"));
      if (folder) { $("dWeb").hidden = false; $("dWeb").href = `${CONFIG.PHOTOS_ORIGIN}/photos/album/?id=${encodeURIComponent(folder.id)}`; }
      lbList = mine;
      $("dPhotos").innerHTML = mine.length ? mine.map((img, i) => `
        <button type="button" class="d-ph" data-i="${i}" title="${esc(img.original_name)}">
          ${img.preview_b64 ? `<img class="d-blur" src="${img.preview_b64}" alt="">` : ""}
          <img src="${Api.imageUrl(img.id, "thumb")}" alt="" loading="lazy" onload="this.classList.add('is-in')">
        </button>`).join("") : `<div class="d-none sm">ไม่มีรูปในเว็บ /photos</div>`;
      $("dPhotos").querySelectorAll("[data-i]").forEach(b => { b.onclick = () => openLb(+b.dataset.i); });
    } catch (err) {
      console.warn(err);
      if ($("dPhotos")) $("dPhotos").innerHTML = `<div class="d-none sm">โหลดรูปจาก /photos ไม่สำเร็จ</div>`;
    }
  }

  // ────── Lightbox ──────
  let lbIdx = 0;
  function openLb(i) { lbIdx = i; $("lb").hidden = false; showLb(); }
  function showLb() {
    const img = lbList[lbIdx];
    if (!img) return;
    $("lbImg").src = Api.imageUrl(img.id, "medium");
    $("lbName").textContent = img.original_name || "";
    $("lbDl").href = Api.imageUrl(img.id, "original") + "?download=1";
    $("lbCount").textContent = `${lbIdx + 1} / ${lbList.length}`;
    $("lbPrev").hidden = lbIdx === 0;
    $("lbNext").hidden = lbIdx === lbList.length - 1;
  }
  const step = d => { const n = lbIdx + d; if (n >= 0 && n < lbList.length) { lbIdx = n; showLb(); } };
  const closeLb = () => { $("lb").hidden = true; $("lbImg").removeAttribute("src"); };
  $("lbPrev").onclick = () => step(-1);
  $("lbNext").onclick = () => step(1);
  $("lbClose").onclick = closeLb;
  $("lb").onclick = e => { if (e.target.id === "lb") closeLb(); };
  document.addEventListener("keydown", e => {
    if (!$("lb").hidden) {
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    } else if (e.key === "Escape" && !$("detail").hidden) { closeDetail(); draw(); }
  });

  // ────── คำอธิบายสี ──────
  $("legend").innerHTML = [["ok", "มาทำ (ลงวันนั้น)"], ["late", "มาทำ (ลงย้อนหลัง)"], ["absent", "ไม่ได้ปฏิบัติหน้าที่"], ["off", "ลา / ป่วย / กิจกรรม / อื่นๆ"]]
    .map(([k, t]) => `<span><i class="cell-dot is-${k}"></i>${t}</span>`).join("")
    + `<span class="muted">กดหัวคอลัมน์เพื่อเรียง · กดช่องเพื่อดูรายละเอียด</span>`;

  // ────── เริ่ม ──────
  (async () => {
    $("table").innerHTML = `<tbody><tr><td class="empty"><span class="spin spin-lg"></span></td></tr></tbody>`;
    try {
      all = await Api.getAllRecords();
      build(); draw();
    } catch (err) {
      console.error(err);
      $("table").innerHTML = `<tbody><tr><td class="empty">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</td></tr></tbody>`;
    }
  })();
})();
