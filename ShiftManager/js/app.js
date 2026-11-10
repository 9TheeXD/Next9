// ─────────────────────────────────────────────
// app.js — หน้าลงเวร (dashboard)
// ─────────────────────────────────────────────

(function () {
  const user = Auth.requireAuth();
  if (!user) return;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  $("heroName").textContent = user.nickname;
  $("heroPos").textContent = `${user.fullName} · ${user.position}`;
  $("logoutBtn").onclick = () => { Auth.logout(); location.href = "index.html"; };

  // ────── Toast ──────
  let toastTimer = 0;
  function toast(text, type) {
    const el = $("toast");
    el.innerHTML = `<i class="fas ${type === "err" ? "fa-circle-exclamation" : type === "warn" ? "fa-triangle-exclamation" : "fa-circle-check"}"></i> ${esc(text)}`;
    el.className = `toast show is-${type || "ok"}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  // ────── จุดเวร (เลือกได้ 1 จุด) ──────
  $("dutyGrid").onchange = () => syncSubmitLabel();
  $("dutyGrid").innerHTML = DUTY_STATIONS.map((s, i) => `
    <label class="opt">
      <input type="radio" name="duty" value="${esc(s)}" id="duty_${i}">
      <span class="opt-dot"></span><span class="opt-text">${esc(s)}</span>
    </label>`).join("");

  // ────── สถานะ ──────
  $("statusGrid").innerHTML = STATUSES.map((s, i) => `
    <label class="opt opt-status is-${s.key}">
      <input type="radio" name="status" value="${esc(s.value)}" ${i === 0 ? "checked" : ""}>
      <i class="fas ${s.icon}"></i><span class="opt-text">${esc(s.value)}</span>
    </label>`).join("");

  // ────── รูป (หลายรูป จากกล้องหรืออัลบั้ม) ──────
  let photos = []; // { key, file, url }
  let keySeq = 0;

  function addFiles(list) {
    const files = Array.from(list || []).filter(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    const room = CONFIG.MAX_PHOTOS - photos.length;
    if (files.length > room) toast(`ใส่ได้สูงสุด ${CONFIG.MAX_PHOTOS} รูป`, "warn");
    files.slice(0, Math.max(0, room)).forEach(file => photos.push({ key: ++keySeq, file, url: URL.createObjectURL(file) }));
    renderThumbs();
  }

  function renderThumbs() {
    $("thumbs").innerHTML = photos.map(p => `
      <div class="thumb">
        <img src="${p.url}" alt="" onerror="this.parentNode.classList.add('no-preview')">
        <span class="thumb-name">${esc(p.file.name)}</span>
        <button type="button" class="thumb-x" data-key="${p.key}" aria-label="เอารูปนี้ออก"><i class="fas fa-xmark"></i></button>
      </div>`).join("");
    $("photoCount").textContent = photos.length ? `${photos.length} รูป` : "ไม่บังคับ · ใส่ได้หลายรูป";
    $("photoCount").classList.toggle("is-on", photos.length > 0);
  }

  $("thumbs").onclick = e => {
    const b = e.target.closest(".thumb-x");
    if (!b) return;
    const i = photos.findIndex(p => p.key === Number(b.dataset.key));
    if (i >= 0) { URL.revokeObjectURL(photos[i].url); photos.splice(i, 1); renderThumbs(); }
  };
  ["camIn", "albumIn"].forEach(id => {
    $(id).onchange = e => { addFiles(e.target.files); e.target.value = ""; };
  });

  // ────── วันที่ที่จะลง ──────
  let workDate = Calendar.todayStr();
  Calendar.selectedDate = workDate;

  function setDate(ds) {
    workDate = ds;
    Calendar.selectedDate = ds;
    const isToday = ds === Calendar.todayStr();
    $("dateLabel").textContent = isToday ? "วันนี้" : "ลงย้อนหลัง";
    $("dateText").textContent = Calendar.thaiDate(ds);
    $("dateBar").classList.toggle("is-retro", !isToday);
    $("dateReset").hidden = isToday;
    showExisting();
    Calendar.render("calendar", onDayClick);
  }

  // ────── รายการที่ลงไว้แล้วของวันนั้น (แก้ ✎ / ลบ 🗑) ──────
  let editing = null;   // แถวที่กำลังแก้ (record) หรือ null
  let canDelete = false; // Apps Script ต้อง 3.1 ขึ้นไปถึงจะลบได้
  let canAdd = false;    // Apps Script ต้อง 3.2 ขึ้นไป ไม่งั้นส่งเพิ่มจะไปทับแถวล่าสุดของวันนั้น
  Api.scriptVersion().then(v => { canDelete = parseFloat(v) >= 3.1; canAdd = parseFloat(v) >= 3.2; showExisting(); });

  function picsHtml(rec, idx) {
    const list = rec.photos;
    if (!list.length) return "";
    return `<span class="rec-pics">` + list.slice(0, 2).map((u, i) => {
      const t = Api.driveThumb(u, 160);
      const more = i === 1 && list.length > 2 ? `<span class="rec-more">+${list.length - 2}</span>` : "";
      return `<a class="rec-pic" href="${esc(u)}" target="_blank" rel="noopener" data-i="${idx}">
        ${t ? `<img src="${esc(t)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="fas fa-image"></i>${more}</a>`;
    }).join("") + `</span>`;
  }

  function showExisting() {
    const recs = Calendar.getRecords(workDate);
    const n = $("existNotice");
    if (editing && !recs.includes(editing)) editing = null;
    syncSubmitLabel(recs);
    if (!recs.length) { n.hidden = true; n.innerHTML = ""; return; }
    n.innerHTML = `
      <div class="rec-head"><i class="fas fa-circle-check"></i> ${workDate === Calendar.todayStr() ? "วันนี้" : "วันนั้น"}ลงไว้แล้ว ${recs.length > 1 ? recs.length + " รายการ" : ""}</div>
      <ul class="rec-list">${recs.map((r, i) => `
        <li class="rec${r === editing ? " is-editing" : ""}">
          <div class="rec-text">
            <b>ลงเวร ${esc(r.duty || "-")} แล้ว</b>
            <small>${esc(r.status || "-")}${r.note ? ` · ${esc(r.note)}` : ""}${r.photos.length ? ` · ${r.photos.length} รูป` : ""}</small>
          </div>
          ${picsHtml(r, i)}
          <span class="rec-btns">
            <button type="button" class="rec-btn" data-edit="${i}" title="แก้ไข" aria-label="แก้ไข"><i class="fas fa-pen"></i></button>
            ${canDelete ? `<button type="button" class="rec-btn is-danger" data-del="${i}" title="ลบ" aria-label="ลบ"><i class="fas fa-trash"></i></button>` : ""}
          </span>
        </li>`).join("")}
      </ul>
      ${editing ? `<div class="rec-editing"><i class="fas fa-pen"></i> กำลังแก้รายการ "${esc(editing.duty || "-")}" · รูปเดิมยังอยู่ รูปใหม่จะเพิ่มเข้าไป <button type="button" class="link-btn" data-cancel>ยกเลิกแก้ไข</button></div>` : ""}`;
    n.hidden = false;
  }

  // แถวที่จะถูกแก้: กดดินสอ หรือเลือกจุดเวรเดิมที่ลงไว้แล้วในวันนั้น (จุดใหม่ = เพิ่มแถว)
  function targetRec(recs, duty) {
    if (editing) return editing;
    if (!duty) return null;
    return recs.find(r => (r.duty || "").split(/\s*,\s*/).includes(duty)) || null;
  }

  function syncSubmitLabel(recs) {
    recs = recs || Calendar.getRecords(workDate);
    const label = $("submitBtn").querySelector("span");
    const duty = document.querySelector('input[name="duty"]:checked')?.value;
    label.textContent = targetRec(recs, duty) ? "บันทึกการแก้ไข"
      : recs.length ? "ส่งเพิ่มอีกจุด"
      : workDate === Calendar.todayStr() ? "ส่งเวรวันนี้" : "ส่งเวรย้อนหลัง";
  }

  function startEdit(rec) {
    editing = rec;
    // รายการเก่า (v2) อาจมีหลายจุด "A, B" → เลือกจุดแรก
    const first = (rec.duty || "").split(/\s*,\s*/)[0];
    document.querySelectorAll('input[name="duty"]').forEach(el => { el.checked = el.value === rec.duty || el.value === first; });
    const st = document.querySelector(`input[name="status"][value="${CSS.escape(rec.status)}"]`);
    if (st) st.checked = true;
    $("note").value = rec.note || "";
    showExisting();
    $("dutyGrid").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function cancelEdit() {
    editing = null;
    $("dutyForm").reset();
    showExisting();
  }

  $("existNotice").onclick = async e => {
    const recs = Calendar.getRecords(workDate);
    const ed = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (e.target.closest("[data-cancel]")) return cancelEdit();
    if (ed) return startEdit(recs[+ed.dataset.edit]);
    if (del) return deleteRec(recs[+del.dataset.del], recs.length);
  };

  async function deleteRec(rec, countThatDay) {
    if (!rec) return;
    const ok = await ask({
      title: "ลบรายการนี้?",
      text: `ลงเวร ${rec.duty || "-"} · ${Calendar.thaiDate(rec.date)}` + (rec.photos.length ? `\nรูป ${rec.photos.length} รูปจะย้ายไปถังขยะ` : ""),
      ok: "ลบ",
    });
    if (!ok) return;
    openSheet("กำลังลบ...");
    const st = {
      sheet: { title: "ลบออกจากชีท", sub: rec.photos.length ? "และย้ายรูปใน Drive ไปถังขยะ" : "", state: "run" },
      photos: { title: "ลบรูปในอัลบั้มเว็บ", sub: "ย้ายไปถังขยะ กู้คืนได้ 30 วัน", state: "run" },
    };
    const draw = () => setSteps([st.sheet, st.photos]);
    draw();
    const sheetJob = Api.deleteRecord({ workDate: rec.date, fullName: user.fullName, rowTime: rec.time }).then(r => {
      if (r?.result === "error") throw new Error(r.message || "ลบไม่สำเร็จ");
      st.sheet.state = r?.result === "success" ? "ok" : "warn";
      if (st.sheet.state === "warn") st.sheet.sub = "ส่งแล้ว แต่ยืนยันผลไม่ได้ ตรวจในปฏิทินอีกครั้ง";
    }).catch(err => { st.sheet.state = "err"; st.sheet.sub = err.message || "ลบไม่สำเร็จ"; }).finally(draw);
    const photoJob = Api.deletePhotos({ date: rec.date, name: user.fullName, duty: rec.duty, all: countThatDay === 1 }).then(r => {
      st.photos.state = "ok";
      st.photos.sub = r.deleted ? `${r.deleted} รูปย้ายไปถังขยะ` : "ไม่มีรูปในอัลบั้มเว็บ";
    }).catch(err => { st.photos.state = "err"; st.photos.sub = err.message || "ลบไม่สำเร็จ"; }).finally(draw);
    await Promise.all([sheetJob, photoJob]);
    const ok2 = st.sheet.state !== "err";
    finishSheet(ok2 && st.photos.state !== "err" ? "ok" : ok2 ? "warn" : "err",
      ok2 && st.photos.state !== "err" ? "ลบเรียบร้อย" : ok2 ? "ลบจากชีทแล้ว แต่รูปในเว็บยังไม่ถูกลบ" : "ลบไม่สำเร็จ");
    $("sendPhotosLink").hidden = true;
    if (ok2) {
      if (editing === rec) editing = null;
      await Calendar.refresh("calendar", onDayClick);
      showExisting();
    }
  }

  // กล่องยืนยัน (แทน confirm() ของเบราว์เซอร์)
  function ask({ title, text, ok }) {
    return new Promise(resolve => {
      const w = $("askSheet");
      $("askTitle").textContent = title;
      $("askText").textContent = text || "";
      $("askOk").textContent = ok || "ตกลง";
      w.hidden = false;
      document.body.classList.add("no-scroll");
      const done = v => {
        w.hidden = true;
        document.body.classList.remove("no-scroll");
        $("askOk").onclick = $("askCancel").onclick = w.querySelector(".sheet-backdrop").onclick = null;
        resolve(v);
      };
      $("askOk").onclick = () => done(true);
      $("askCancel").onclick = () => done(false);
      w.querySelector(".sheet-backdrop").onclick = () => done(false);
    });
  }

  function onDayClick(ds) {
    if (ds !== workDate) editing = null;
    setDate(ds);
    $("dutyForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("dateReset").onclick = () => { editing = null; setDate(Calendar.todayStr()); };
  $("datePick").onclick = () => $("calCard").scrollIntoView({ behavior: "smooth", block: "start" });

  // ────── ส่ง ──────
  const sheet = $("sendSheet");
  function setSteps(steps) {
    $("sendSteps").innerHTML = steps.map(s => `
      <li class="is-${s.state}">
        ${s.state === "run" ? `<span class="spin"></span>` : `<i class="fas ${{ ok: "fa-circle-check", err: "fa-circle-xmark", warn: "fa-triangle-exclamation", wait: "fa-circle" }[s.state]}"></i>`}
        <div><b>${esc(s.title)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</div>
      </li>`).join("");
  }
  function openSheet(title) {
    $("sendIcon").className = "sheet-icon";
    $("sendIcon").innerHTML = `<span class="spin spin-lg"></span>`;
    $("sendTitle").textContent = title || "กำลังส่ง...";
    $("sendActions").hidden = true;
    sheet.hidden = false;
    document.body.classList.add("no-scroll");
  }
  function finishSheet(state, title) {
    $("sendIcon").className = `sheet-icon is-${state}`;
    $("sendIcon").innerHTML = `<i class="fas ${{ ok: "fa-check", warn: "fa-exclamation", err: "fa-xmark" }[state]}"></i>`;
    $("sendTitle").textContent = title;
    $("sendActions").hidden = false;
    $("sendClose").textContent = state === "err" ? "ปิด" : "เสร็จสิ้น";
  }
  function closeSheet() {
    sheet.hidden = true;
    document.body.classList.remove("no-scroll");
  }
  $("sendClose").onclick = closeSheet;

  $("dutyForm").onsubmit = async e => {
    e.preventDefault();
    const duty = document.querySelector('input[name="duty"]:checked')?.value;
    if (!duty) {
      toast("เลือกจุดเวรก่อน", "warn");
      $("dutyGrid").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const target = targetRec(Calendar.getRecords(workDate), duty);
    if (!target && !canAdd && Calendar.getRecords(workDate).length) {
      toast("ระบบหลังบ้านยังไม่อัปเดต ส่งเพิ่มจุดไม่ได้ ถ้าจะแก้รายการเดิมให้กดรูปดินสอ", "warn");
      return;
    }
    const status = document.querySelector('input[name="status"]:checked')?.value || STATUSES[0].value;
    const note = $("note").value.trim();
    const files = photos.map(p => p.file);
    const date = workDate;
    // ชื่อไฟล์รูป: {ชื่อ}-{จุดเวร}-{วว-ดด-ปป HH.mm} (เวลาที่กดส่ง ปี พ.ศ.)
    const now = new Date(), p2 = n => String(n).padStart(2, "0");
    const stamp = `${p2(now.getDate())}-${p2(now.getMonth() + 1)}-${String(now.getFullYear() + 543).slice(-2)} ${p2(now.getHours())}.${p2(now.getMinutes())}`;
    const label = `${duty}-${stamp}`;
    const rowTime = target ? target.time : "";

    $("submitBtn").disabled = true;
    openSheet();
    const st = {
      sheet: { title: "บันทึกลงชีท", sub: files.length ? `และเก็บ ${files.length} รูปลง Google Drive` : "", state: "run" },
      photos: { title: "เก็บรูปเข้าอัลบั้มเว็บ", sub: "เวรประจำวัน › " + date.slice(8, 10) + "/" + date.slice(5, 7) + "/" + String(+date.slice(0, 4) + 543).slice(-2), state: files.length ? "run" : "wait" },
    };
    const draw = () => setSteps(files.length ? [st.sheet, st.photos] : [st.sheet]);
    if (files.length) st.sheet.sub = "กำลังเตรียมรูป...";
    draw();

    // รูปย่อสำหรับ Drive
    const drivePhotos = [];
    for (let i = 0; i < files.length; i++) {
      const data = await Api.preparePhoto(files[i]);
      if (data) drivePhotos.push({ data });
    }
    st.sheet.sub = files.length ? `และเก็บ ${drivePhotos.length} รูปลง Google Drive` : "";
    draw();

    const sheetJob = Api.submitRecord({
      workDate: date,
      fullName: user.fullName,
      position: user.position,
      duty, status, note,
      photos: drivePhotos,
      fileBase: `${user.fullName}-${label}`,
      rowTime,
      isRetroactive: date !== Calendar.todayStr(),
    }).then(r => {
      if (r?.result === "error") throw new Error(r.message || "บันทึกไม่สำเร็จ");
      st.sheet.state = "ok";
      if (r?.result === "sent_no_cors" || r?.result === "unknown") { st.sheet.state = "warn"; st.sheet.sub = "ส่งแล้ว แต่ยืนยันผลไม่ได้ ตรวจในปฏิทินอีกครั้ง"; }
    }).catch(err => {
      st.sheet.state = "err"; st.sheet.sub = err.message || "ส่งไม่สำเร็จ";
    }).finally(draw);

    const photoJob = !files.length ? Promise.resolve() : Api.uploadToPhotos(
      { date, name: user.fullName, label, files },
      p => { st.photos.sub = `กำลังอัปโหลด ${Math.round(p * 100)}%`; draw(); },
    ).then(r => {
      st.photos.state = "ok";
      st.photos.sub = `${r.uploaded} รูป · เวรประจำวัน › ${r.album.name}`;
      $("sendPhotosLink").href = `photos.html#${encodeURIComponent(r.album.id)}`;
    }).catch(err => {
      st.photos.state = "err"; st.photos.sub = err.message || "อัปโหลดไม่สำเร็จ";
    }).finally(draw);

    await Promise.all([sheetJob, photoJob]);

    const sheetOk = st.sheet.state !== "err";
    const allOk = sheetOk && st.photos.state !== "err";
    finishSheet(allOk ? "ok" : sheetOk ? "warn" : "err",
      allOk ? "ส่งเวรเรียบร้อย" : sheetOk ? "บันทึกแล้ว แต่รูปเข้าอัลบั้มไม่ครบ" : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
    $("sendPhotosLink").hidden = !files.length || st.photos.state !== "ok";
    $("submitBtn").disabled = false;

    if (sheetOk) {
      editing = null;
      $("dutyForm").reset();
      photos.forEach(p => URL.revokeObjectURL(p.url));
      photos = [];
      renderThumbs();
      await Calendar.refresh("calendar", onDayClick);
      setDate(Calendar.todayStr());
    }
  };

  // ────── เริ่ม ──────
  renderThumbs();
  setDate(workDate);
  Calendar.refresh("calendar", onDayClick).then(showExisting);
})();
