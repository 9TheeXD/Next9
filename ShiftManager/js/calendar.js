// ─────────────────────────────────────────────
// calendar.js — ปฏิทินแสดงสถานะรายวัน
// ─────────────────────────────────────────────

const Calendar = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  records: [],
  selectedDate: "",

  dayNames: ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"],

  monthNames: [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ],

  statusClass(status) {
    const s = STATUSES.find(x => x.value === status);
    return s ? s.key : "none";
  },

  ymd(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  },

  todayStr() {
    const t = new Date();
    return this.ymd(t.getFullYear(), t.getMonth(), t.getDate());
  },

  // "2026-11-06" → "6 พฤศจิกายน 2569"
  thaiDate(ds) {
    const [y, m, d] = ds.split("-").map(Number);
    return `${d} ${this.monthNames[m - 1]} ${y + 543}`;
  },

  getYearMonth() {
    return `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, "0")}`;
  },

  async loadRecords(fullName) {
    const res = await Api.getHistory(fullName, this.getYearMonth());
    this.records = (res && res.records) ? res.records : [];
  },

  // ทุกแถวของวันนั้น (เก่าไปใหม่)
  getRecords(ds) {
    return this.records.filter(r => r.date === ds);
  },

  // แถวล่าสุดของวันนั้น (ถ้าลงซ้ำ)
  getRecord(ds) {
    const m = this.records.filter(r => r.date === ds);
    return m.length ? m[m.length - 1] : null;
  },

  render(containerId, onDayClick) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const yr = this.currentYear, mo = this.currentMonth;
    const today = this.todayStr();
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    let firstIdx = new Date(yr, mo, 1).getDay() - 1;
    if (firstIdx < 0) firstIdx = 6;

    const done = this.records.length ? new Set(this.records.map(r => r.date)).size : 0;
    let h = `
      <div class="cal-header">
        <button type="button" class="icon-btn" id="calPrev" aria-label="เดือนก่อน"><i class="fas fa-chevron-left"></i></button>
        <div class="cal-title">${this.monthNames[mo]} ${yr + 543}<small>ลงแล้ว ${done} วัน</small></div>
        <button type="button" class="icon-btn" id="calNext" aria-label="เดือนถัดไป"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="cal-grid">
    `;
    this.dayNames.forEach(d => { h += `<div class="cal-dow">${d}</div>`; });
    for (let i = 0; i < firstIdx; i++) h += `<div></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = this.ymd(yr, mo, d);
      const dow = new Date(yr, mo, d).getDay();
      const weekend = dow === 0 || dow === 6;
      const rec = this.getRecord(ds);
      const sc = this.statusClass(rec ? rec.status : null);
      const future = ds > today;
      const cls = ["cal-cell", `is-${sc}`];
      if (ds === today) cls.push("is-today");
      if (ds === this.selectedDate) cls.push("is-selected");
      if (weekend) cls.push("is-weekend");
      if (future) cls.push("is-future");
      h += `<button type="button" class="${cls.join(" ")}" data-date="${ds}" ${future ? "disabled" : ""}>
        <span>${d}</span>${rec && rec.photos.length ? `<i class="fas fa-image cal-pic"></i>` : ""}
      </button>`;
    }
    h += `</div>
      <div class="cal-legend">
        ${STATUSES.map(s => `<span><i class="dot is-${s.key}"></i>${s.short}</span>`).join("")}
      </div>`;
    el.innerHTML = h;

    el.querySelector("#calPrev").onclick = () => {
      if (--this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
      this.refresh(containerId, onDayClick);
    };
    el.querySelector("#calNext").onclick = () => {
      if (++this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
      this.refresh(containerId, onDayClick);
    };
    el.querySelectorAll(".cal-cell:not([disabled])").forEach(cell => {
      cell.onclick = () => onDayClick(cell.dataset.date, this.getRecord(cell.dataset.date));
    });
  },

  async refresh(containerId, onDayClick) {
    const el = document.getElementById(containerId);
    if (el) el.classList.add("is-loading");
    const user = Auth.getCurrentUser();
    if (user) await this.loadRecords(user.fullName);
    this.render(containerId, onDayClick);
    if (el) el.classList.remove("is-loading");
  },
};
