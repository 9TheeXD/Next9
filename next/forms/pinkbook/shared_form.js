/**
 * Pinkbook Shared Logic & Components
 * Used by forms/pinkbook and viewforms/pinkbook
 */
const PinkbookShared = {
    defaultItems: [
        { title: "ไม่วงกลม กและข หน้าปก", allow_week: false },
        { title: "ไม่เขียนที่อยู่", allow_week: false },
        { title: "ไม่เขียนตารางเรียนนักเรียน", allow_week: false },
        { title: "ไม่เขียนตารางสอนครูที่ปรึกษา", allow_week: false },
        { title: "ไม่เขียนสัปดาห์", allow_week: true },
        { title: "ไม่เขียนวันที่/เดือน/ปี", allow_week: true },
        { title: "ไม่ได้เขียนยอดรวมขาด / ลา", allow_week: true },
        { title: "ไม่เขียนเรื่องที่อบรมแต่ละวัน", allow_week: true },
        { title: "ไม่มีลายเซ็นครูที่ปรึกษา", allow_week: true }
    ],
    items: [],
    roomsConfig: {},
    week1Start: '2026-10-26',

    async loadConfig() {
        try {
            const res = await fetch(`/api/pinkbook/config?t=${Date.now()}`);
            const json = await res.json();
            if (json.success && json.config) {
                if (Array.isArray(json.config.items)) this.items = json.config.items;
                if (json.config.rooms) this.roomsConfig = json.config.rooms;
                if (json.config.week_1_start) this.week1Start = json.config.week_1_start;
                return json.config;
            }
        } catch(e) {
            console.error("Failed to load pinkbook config:", e);
        }
        this.items = [...this.defaultItems];
        return null;
    },

    calculateCurrentWeek(week1DateStr) {
        const dateStr = week1DateStr || this.week1Start;
        if (!dateStr) return 1;
        const target = new Date();
        const w1 = new Date(dateStr);
        
        const w1Sunday = new Date(w1);
        w1Sunday.setDate(w1.getDate() - w1.getDay());
        w1Sunday.setHours(0, 0, 0, 0);
        
        const targetSunday = new Date(target);
        targetSunday.setDate(target.getDate() - target.getDay());
        targetSunday.setHours(0, 0, 0, 0);
        
        const diffMs = targetSunday.getTime() - w1Sunday.getTime();
        const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
        const calculated = diffWeeks + 1;
        return Math.max(1, Math.min(22, calculated));
    },

    isRoomSub(gradeStr, roomNum) {
        const g = String(gradeStr || '').replace(/\D/g, '');
        const r = String(roomNum);
        if (this.roomsConfig[g] && this.roomsConfig[g][r] !== undefined) {
            return !!this.roomsConfig[g][r].sub;
        }
        return true;
    },

    formatWeekRanges(weeks) {
        if (!weeks) return '-';
        let parsed = weeks;
        if (typeof weeks === 'string') {
            try { parsed = JSON.parse(weeks); } catch(e) { return weeks; }
        }
        if (!Array.isArray(parsed) || parsed.length === 0) return '-';
        let sorted = [...parsed].map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
        if (sorted.length === 0) return '-';
        
        let ranges = [];
        let start = sorted[0];
        let end = sorted[0];
        for(let i=1; i<sorted.length; i++) {
            if(sorted[i] === end + 1) {
                end = sorted[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = sorted[i];
                end = sorted[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    },

    formatIssuesList(selectedData) {
        if (!selectedData || typeof selectedData !== 'object') return '-';
        const keys = Object.keys(selectedData);
        if (keys.length === 0) return '-';
        
        let formatted = [];
        keys.forEach(k => {
            const item = selectedData[k];
            const title = item.label || item.title || '';
            const allowWeek = item.allow_week !== false;
            const weeks = item.weeks || [];
            if (allowWeek && weeks.length > 0) {
                formatted.push(`${title} สัปดาห์ที่ ${this.formatWeekRanges(weeks)}`);
            } else {
                formatted.push(title);
            }
        });
        return formatted.join(',<br>');
    },

    esc(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;');
    },

    openWeekModal(title, selectedWeeks, onSave) {
        const modal = document.createElement('div');
        modal.className = 'week-modal show';
        modal.id = 'shared-week-modal';
        
        const weeksArr = [...(selectedWeeks || [])];

        let gridHTML = '<div class="week-grid">';
        for(let i=1; i<=22; i++) {
            const isSel = weeksArr.includes(i) ? 'selected' : '';
            gridHTML += `<button type="button" class="week-btn ${isSel}" data-week="${i}">${i}</button>`;
        }
        gridHTML += '</div>';

        modal.innerHTML = `
            <div class="week-modal-content">
                <h3><i class="fa-regular fa-calendar-check"></i> เลือกสัปดาห์</h3>
                <p style="font-size:0.85rem; color:#6b7280; margin-bottom:16px;">${this.esc(title)}</p>
                ${gridHTML}
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                    <button type="button" class="btn btn-secondary" id="btn-week-cancel">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" id="btn-week-ok">ตกลง</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.week-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const num = parseInt(btn.dataset.week);
                const idx = weeksArr.indexOf(num);
                if (idx > -1) {
                    weeksArr.splice(idx, 1);
                    btn.classList.remove('selected');
                } else {
                    weeksArr.push(num);
                    btn.classList.add('selected');
                }
            });
        });

        function close() {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        }

        modal.querySelector('#btn-week-cancel').onclick = close;
        modal.querySelector('#btn-week-ok').onclick = () => {
            if (onSave) onSave(weeksArr.sort((a,b)=>a-b));
            close();
        };
    },

    openCustomItemModal(onAdd) {
        const modal = document.createElement('div');
        modal.className = 'custom-modal-overlay show';
        modal.innerHTML = `
            <div class="custom-modal-content">
                <h3><i class="fa-solid fa-plus-circle"></i> เพิ่มรายการใหม่</h3>
                <input type="text" id="shared-custom-input" placeholder="ชื่อรายการ..." autocomplete="off">
                <div class="custom-modal-actions">
                    <button type="button" class="btn btn-secondary" id="btn-custom-cancel">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" id="btn-custom-add">เพิ่ม</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#shared-custom-input');
        setTimeout(() => input?.focus(), 100);

        function close() {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        }

        modal.querySelector('#btn-custom-cancel').onclick = close;
        const doAdd = () => {
            const val = input.value.trim();
            if (val) {
                if (onAdd) onAdd(val);
                close();
            }
        };
        modal.querySelector('#btn-custom-add').onclick = doAdd;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
        });
    }
};

window.PinkbookShared = PinkbookShared;
