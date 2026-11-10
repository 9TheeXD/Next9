const defaultItems = [
    { title: "ไม่วงกลม กและข หน้าปก", allow_week: false },
    { title: "ไม่เขียนที่อยู่", allow_week: false },
    { title: "ไม่เขียนตารางเรียนนักเรียน", allow_week: false },
    { title: "ไม่เขียนตารางสอนครูที่ปรึกษา", allow_week: false },
    { title: "ไม่เขียนสัปดาห์", allow_week: true },
    { title: "ไม่เขียนวันที่/เดือน/ปี", allow_week: true },
    { title: "ไม่ได้เขียนยอดรวมขาด / ลา", allow_week: true },
    { title: "ไม่เขียนเรื่องที่อบรมแต่ละวัน", allow_week: true },
    { title: "ไม่มีลายเซ็นครูที่ปรึกษา", allow_week: true }
];

let items = [...defaultItems];
// Format for current room selection: { itemId: { weeks: [1,2,3], label: "...", allow_week: true/false } }
let selectedData = {};
let unsubmittedWeeks = [];

let roomsConfig = {};

function calculateCurrentWeek(week1DateStr) {
    const dateStr = (week1DateStr && week1DateStr >= '2026-10-01') ? week1DateStr : '2026-10-26';
    const target = new Date();
    const w1 = new Date(dateStr);
    
    // Get Sunday of the week containing w1
    const w1Sunday = new Date(w1);
    w1Sunday.setDate(w1.getDate() - w1.getDay());
    w1Sunday.setHours(0, 0, 0, 0);
    
    // Get Sunday of the week containing target
    const targetSunday = new Date(target);
    targetSunday.setDate(target.getDate() - target.getDay());
    targetSunday.setHours(0, 0, 0, 0);
    
    const diffMs = targetSunday.getTime() - w1Sunday.getTime();
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    const calculated = diffWeeks + 1;
    return Math.max(1, Math.min(22, calculated));
}

async function loadConfig() {
    try {
        const res = await fetch(`/api/pinkbook/config?t=${Date.now()}`);
        const json = await res.json();
        if (json.success && json.config) {
            if (Array.isArray(json.config.items)) items = json.config.items;
            if (json.config.rooms) roomsConfig = json.config.rooms;
            const autoWeek = calculateCurrentWeek(json.config.week_1_start);
            const weekSelect = document.getElementById('select-inspector-week');
            if (weekSelect && (!weekSelect.value || weekSelect.value === '22')) {
                weekSelect.value = autoWeek;
                saveCache();
            }
        } else {
            items = [...defaultItems];
        }
    } catch(e) {
        console.error("Failed to load pinkbook config:", e);
        items = [...defaultItems];
    }
    renderChecklist();
}

function isRoomSub(gradeStr, roomNum) {
    const g = String(gradeStr || '').replace(/\D/g, '');
    const r = String(roomNum);
    if (roomsConfig[g] && roomsConfig[g][r] !== undefined) {
        return !!roomsConfig[g][r].sub;
    }
    return true;
}

window.toggleForm = function() {
    document.querySelector('.left-pane').classList.toggle('open');
    document.querySelector('.form-overlay').classList.toggle('show');
}

let inspectorsData = [];
let addedRooms = []; 

document.addEventListener('DOMContentLoaded', async () => {
    populateWeekSelects();
    loadInspectors();
    loadCache();
    await loadConfig();
    setupDropdowns();
    await Draft.restore();
    Draft.start();

    // Anything not yet submitted: the browser asks before the tab is closed or navigated away.
    // (The draft is also on the server by then — see Draft — so even "Leave" loses nothing.)
    window.addEventListener('beforeunload', (e) => {
        if (Draft.hasUnsaved()) {
            Draft.flush();
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

// Cache Logic
function saveCache() {
    const insp = document.getElementById('inspector-input').value;
    const week = document.getElementById('select-inspector-week').value;
    localStorage.setItem('pinkbook_inspector', insp);
    localStorage.setItem('pinkbook_week', week);
}
function loadCache() {
    if (localStorage.getItem('pinkbook_term_v2') !== '2/2569') {
        localStorage.removeItem('pinkbook_week');
        localStorage.setItem('pinkbook_term_v2', '2/2569');
    }
    const insp = localStorage.getItem('pinkbook_inspector');
    const week = localStorage.getItem('pinkbook_week');
    if(insp) document.getElementById('inspector-input').value = insp;
    if(week && week !== '22') document.getElementById('select-inspector-week').value = week;
    
    document.getElementById('inspector-input').addEventListener('input', saveCache);
    document.getElementById('select-inspector-week').addEventListener('change', saveCache);
}

function populateWeekSelects() {
    const weekSel = document.getElementById('select-inspector-week');
    for(let i=1; i<=22; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `สัปดาห์ที่ ${i}`;
        weekSel.appendChild(opt);
    }
}

// Inspector Searchable Select
async function loadInspectors() {
    try {
        const res = await fetch('/inspectors.json');
        inspectorsData = await res.json();
        initInspectorSelect();
    } catch(e) {
        console.error("Failed to load inspectors", e);
    }
}

function escapeRegex(string) {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
function esc(str) {
    return str.replace(/"/g, '&quot;');
}

function initInspectorSelect() {
    const input = document.getElementById('inspector-input');
    const dropdown = document.getElementById('inspector-dropdown');

    function render(filter = '') {
        const q = filter.toLowerCase();
        const filtered = q
            ? inspectorsData.filter(n => n.toLowerCase().includes(q))
            : inspectorsData;
        dropdown.innerHTML = filtered.map(name => {
            const highlighted = q ? name.replace(new RegExp(`(${escapeRegex(q)})`, 'gi'), '<mark>$1</mark>') : name;
            return `<div class="select-option" data-value="${esc(name)}">${highlighted}</div>`;
        }).join('');
        dropdown.classList.toggle('open', filtered.length > 0);
    }

    input.addEventListener('focus', () => render(input.value));
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('open'), 200);
        saveCache();
    });
    dropdown.addEventListener('click', e => {
        const opt = e.target.closest('.select-option');
        if (opt) {
            input.value = opt.dataset.value;
            dropdown.classList.remove('open');
            saveCache();
        }
    });
}

// Toast
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Dropdowns Logic (Room)
function setupDropdowns() {
    const gradeSelect = document.getElementById('select-grade');
    const roomSelect = document.getElementById('select-room');
    const groupRadios = document.querySelectorAll('input[name="group"]');
    const groupWrapper = document.getElementById('group-wrapper');

    function disableGroupRadios(disabled) {
        groupRadios.forEach(rb => {
            rb.disabled = disabled;
            if (disabled) rb.checked = false;
        });
    }
    
    // Initially disable group
    disableGroupRadios(true);

    gradeSelect.addEventListener('change', () => {
        const grade = gradeSelect.value;
        roomSelect.innerHTML = '<option value="" disabled selected>-- เลือกห้อง --</option>';
        if (groupWrapper) groupWrapper.style.display = 'block';

        if(!grade) {
            roomSelect.disabled = true;
            disableGroupRadios(true);
            disableSections();
            return;
        }
        roomSelect.disabled = false;
        disableGroupRadios(true);
        disableSections();
        
        const gNum = grade.replace(/\D/g, '');
        const configuredRooms = roomsConfig[gNum] ? Object.keys(roomsConfig[gNum]).map(Number).sort((a,b)=>a-b) : null;
        let maxRooms = configuredRooms ? configuredRooms[configuredRooms.length - 1] : ((grade === 'ม.1' || grade === 'ม.2' || grade === 'ม.3') ? 14 : 16);
        const roomList = configuredRooms || Array.from({length: maxRooms}, (_, i) => i + 1);

        roomList.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            roomSelect.appendChild(opt);
        });
    });
    
    roomSelect.addEventListener('change', () => {
        // Force uncheck when room changes
        groupRadios.forEach(rb => rb.checked = false);
        const grade = gradeSelect.value;
        const room = roomSelect.value;
        
        if(grade && room) {
            const hasSub = isRoomSub(grade, room);
            if (hasSub) {
                if (groupWrapper) groupWrapper.style.display = 'block';
                disableGroupRadios(false);
                disableSections(); // wait for group selection
            } else {
                // Room has no sub (single group)
                if (groupWrapper) groupWrapper.style.display = 'none';
                disableGroupRadios(true);
                enableSections();
                fetchLatestRoomData(grade, room, '-');
            }
        } else {
            if (groupWrapper) groupWrapper.style.display = 'block';
            disableGroupRadios(true);
            disableSections();
        }
    });
    
    groupRadios.forEach(rb => {
        rb.addEventListener('change', () => {
            if(rb.checked && gradeSelect.value && roomSelect.value) {
                enableSections();
                fetchLatestRoomData(gradeSelect.value, roomSelect.value, rb.value);
            }
        });
    });

    const statusRadios = document.querySelectorAll('input[name="overall_status"]');
    statusRadios.forEach(rb => {
        rb.addEventListener('change', () => {
            if(rb.value === 'ไม่เรียบร้อย') {
                document.getElementById('section3-card').style.display = 'block';
            } else {
                document.getElementById('section3-card').style.display = 'none';
                selectedData = {};
                renderChecklist();
            }
        });
    });
}

function disableSections() {
    const statusCard = document.getElementById('status-card');
    if (statusCard) statusCard.classList.add('section-disabled');
    document.getElementById('section3-card').classList.add('section-disabled');
    document.getElementById('section4-card').classList.add('section-disabled');
    
    const statusSubtitle = document.querySelector('#status-card .subtitle');
    if (statusSubtitle) statusSubtitle.textContent = '* เลือกระดับชั้น ห้องเรียน และกลุ่มก่อน';
    
    document.querySelector('#section3-card .subtitle').textContent = '* เลือกระดับชั้น ห้องเรียน และกลุ่มก่อน';
    document.querySelector('#section4-card .subtitle').textContent = '* เลือกระดับชั้น ห้องเรียน และกลุ่มก่อน';
    
    document.querySelectorAll('input[name="overall_status"]').forEach(r => r.disabled = true);
}
function enableSections() {
    const statusCard = document.getElementById('status-card');
    if (statusCard) statusCard.classList.remove('section-disabled');
    document.getElementById('section3-card').classList.remove('section-disabled');
    document.getElementById('section4-card').classList.remove('section-disabled');
    
    const statusSubtitle = document.querySelector('#status-card .subtitle');
    if (statusSubtitle) statusSubtitle.textContent = '* เลือกสถานะการตรวจ';
    
    document.querySelector('#section3-card .subtitle').textContent = '* แตะเพื่อเลือกรายการ (เลือกได้หลายข้อ)';
    document.querySelector('#section4-card .subtitle').textContent = '* แตะปุ่มด้านล่างเพื่อเลือกสัปดาห์ที่ยังไม่ส่ง';
    
    document.querySelectorAll('input[name="overall_status"]').forEach(r => r.disabled = false);
}

function setSectionsLoading(isLoading) {
    const cards = [document.getElementById('section3-card'), document.getElementById('section4-card')];
    cards.forEach(card => {
        if(isLoading) {
            card.style.position = 'relative';
            if(!card.querySelector('.card-loading-overlay')) {
                const overlay = document.createElement('div');
                overlay.className = 'card-loading-overlay';
                overlay.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
                card.appendChild(overlay);
            }
        } else {
            const overlay = card.querySelector('.card-loading-overlay');
            if(overlay) overlay.remove();
        }
    });
}

async function fetchLatestRoomData(grade, room, group) {
    setSectionsLoading(true);
    try {
        const res = await fetch(`/api/pinkbook/latest?grade=${encodeURIComponent(grade)}&room=${encodeURIComponent(room)}&group=${encodeURIComponent(group)}`);
        const json = await res.json();
        
        // Reset local form
        selectedData = {};
        unsubmittedWeeks = [];
        items = [...defaultItems];
        
        
        if(json.success && json.data) {
            const data = json.data;
            
            try {
                // Restore checklist issues
                if (data.raw_issues) {
                    const parsedRaw = JSON.parse(data.raw_issues);
                    selectedData = parsedRaw || {};
                    // Ensure all items in selectedData exist in items array (for custom items if any)
                    Object.keys(selectedData).forEach(k => {
                        const lbl = selectedData[k].label;
                        const allowWeek = selectedData[k].allow_week !== false;
                        const exists = items.some(it => (typeof it === 'string' ? it : it.title) === lbl);
                        if (!exists) {
                            items.push({ title: lbl, allow_week: allowWeek });
                        }
                    });
                }
            } catch(e){}
            
            try {
                const parsedUnsub = JSON.parse(data.unsubmitted_weeks);
                if(Array.isArray(parsedUnsub)) {
                    unsubmittedWeeks = parsedUnsub;
                }
            } catch(e){}
        }
        
        // Auto-check status based on previous data
        if (Object.keys(selectedData).length > 0) {
            const messyBtn = document.querySelector('input[name="overall_status"][value="ไม่เรียบร้อย"]');
            if(messyBtn) messyBtn.checked = true;
            document.getElementById('section3-card').style.display = 'block';
        } else if (json.success && json.data && json.data.status === 'เรียบร้อย') {
            const neatBtn = document.querySelector('input[name="overall_status"][value="เรียบร้อย"]');
            if(neatBtn) neatBtn.checked = true;
            document.getElementById('section3-card').style.display = 'none';
        } else {
            // Default reset
            document.querySelectorAll('input[name="overall_status"]').forEach(r => r.checked = false);
            document.getElementById('section3-card').style.display = 'none';
        }
        
        renderChecklist();
        updateUnsubmittedBadge();
    } catch(err) {
        console.error(err);
        showToast('เกิดข้อผิดพลาดในการโหลดข้อมูลเก่า');
    } finally {
        setSectionsLoading(false);
    }
}

// Checklist Logic
function renderChecklist() {
    if (typeof Draft !== 'undefined') Draft.schedule();
    const container = document.getElementById('checklist-container');
    container.innerHTML = '';
    
    items.forEach((itemObj, index) => {
        const title = typeof itemObj === 'string' ? itemObj : (itemObj.title || '');
        const allowWeek = typeof itemObj === 'object' ? itemObj.allow_week !== false : true;
        const id = `chk-${index}`;
        const isChecked = !!selectedData[id];
        const weeks = isChecked ? (selectedData[id].weeks || []) : [];
        const btnText = weeks.length > 0 ? `แก้ ${weeks.length} สัปดาห์` : `<i class="fa-solid fa-plus"></i> เลือกสัปดาห์`;
        
        const el = document.createElement('div');
        el.className = `check-item ${isChecked ? 'active' : ''}`;
        
        let weekBtnHTML = '';
        if (allowWeek) {
            weekBtnHTML = `
            <div class="week-btn-container ${isChecked ? 'bg-active' : ''}">
                <button class="btn-week-select" onclick="openWeekModal('${id}', '${esc(title)}', event)">
                    ${btnText}
                </button>
            </div>`;
        }

        el.innerHTML = `
            <input type="checkbox" id="input-${id}" ${isChecked ? 'checked' : ''}>
            <div class="check-item-text">${title}</div>
            ${weekBtnHTML}
        `;
        
        el.addEventListener('click', (e) => {
            if(e.target.closest('.btn-week-select')) return;
            toggleItem(id, title, allowWeek);
        });
        
        container.appendChild(el);
    });
}

function toggleItem(id, itemStr, allowWeek = true) {
    if(selectedData[id]) {
        delete selectedData[id];
    } else {
        selectedData[id] = { label: itemStr, weeks: [], allow_week: allowWeek };
    }
    renderChecklist();
}

// Custom Modal for adding item
function openModal() {
    document.getElementById('modal-input').value = '';
    document.getElementById('modal-allow-week').checked = false;
    document.getElementById('modal-save-permanent').checked = false;
    document.getElementById('custom-modal').classList.add('show');
    setTimeout(() => document.getElementById('modal-input').focus(), 100);
}
function closeModal() {
    document.getElementById('custom-modal').classList.remove('show');
}
async function confirmModal() {
    const val = document.getElementById('modal-input').value.trim();
    const allowWeek = document.getElementById('modal-allow-week').checked;
    const savePermanent = document.getElementById('modal-save-permanent').checked;
    if (!val) { showToast('กรุณาพิมพ์ชื่อรายการ'); return; }

    if (savePermanent) {
        // Save to server permanently
        try {
            const res = await fetch('/api/pinkbook/add-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: val, allow_week: allowWeek })
            });
            const data = await res.json();
            if (data.success) {
                items.push({ title: val, allow_week: allowWeek });
                renderChecklist();
                closeModal();
                showToast('เพิ่มรายการถาวรสำเร็จ ทุกคนจะเห็นหัวข้อนี้');
            } else {
                showToast(data.message || 'เกิดข้อผิดพลาด');
            }
        } catch(e) {
            showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
        }
    } else {
        // Temporary — local only
        items.push({ title: val, allow_week: allowWeek });
        renderChecklist();
        closeModal();
        showToast('เพิ่มรายการสำเร็จ (ชั่วคราว)');
    }
}

// Confirm Clear Form Modal
window.requestClearForm = function() {
    document.getElementById('confirm-modal').classList.add('show');
}
window.closeConfirmModal = function() {
    document.getElementById('confirm-modal').classList.remove('show');
}
window.executeClearForm = function() {
    setEditing(null);
    clearFormSection2();
    closeConfirmModal();
    showToast('ล้างข้อมูลเรียบร้อย');
}

// Unsubmitted Week Modal
window.openUnsubmittedModal = function() {
    openWeekModal('unsubmitted', 'สัปดาห์ที่ยังไม่ส่ง', null, true);
}
function updateUnsubmittedBadge() {
    if (typeof Draft !== 'undefined') Draft.schedule();
    const badge = document.getElementById('unsub-badge');
    if(unsubmittedWeeks.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = unsubmittedWeeks.length;
    } else {
        badge.style.display = 'none';
    }
}

// Week Modal (Reusable for both checklist and unsubmitted)
let currentWeekModalId = null;
let isUnsubmittedMode = false;

function openWeekModal(id, label, event, isUnsub = false) {
    if(event) event.stopPropagation();
    currentWeekModalId = id;
    isUnsubmittedMode = isUnsub;
    const selectedWeeks = isUnsub ? unsubmittedWeeks : selectedData[id].weeks;
    
    const modal = document.createElement('div');
    modal.className = 'week-modal show';
    modal.id = 'week-modal';
    
    let gridHTML = '<div class="week-grid">';
    for(let i=1; i<=22; i++) {
        const isSel = selectedWeeks.includes(i) ? 'selected' : '';
        gridHTML += `<button class="week-btn ${isSel}" onclick="toggleWeek(${i}, this)">${i}</button>`;
    }
    gridHTML += '</div>';
    
    modal.innerHTML = `
        <div class="week-modal-content">
            <h3><i class="fa-solid fa-calendar-week"></i> เลือกสัปดาห์</h3>
            <p style="font-size:0.85rem; color:#6b7280; margin-bottom:16px;">${label}</p>
            ${gridHTML}
            <div style="display:flex; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="closeWeekModal()">ตกลง</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}
window.toggleWeek = function(num, btn) {
    const weeksArr = isUnsubmittedMode ? unsubmittedWeeks : selectedData[currentWeekModalId].weeks;
    const idx = weeksArr.indexOf(num);
    if(idx > -1) {
        weeksArr.splice(idx, 1);
        btn.classList.remove('selected');
    } else {
        weeksArr.push(num);
        btn.classList.add('selected');
    }
}
window.closeWeekModal = function() {
    const m = document.getElementById('week-modal');
    if(m) {
        m.classList.remove('show');
        setTimeout(() => m.remove(), 200);
    }
    if(isUnsubmittedMode) {
        updateUnsubmittedBadge();
    } else {
        renderChecklist();
    }
}

function formatWeekRanges(weeks) {
    if(!weeks || weeks.length === 0) return '-';
    let sorted = [...weeks].sort((a,b) => a-b);
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
}

// Logic: Add to Right Pane Table
window.addToTable = function() {
    const grade = document.getElementById('select-grade').value;
    const room = document.getElementById('select-room').value;
    
    if(!grade || !room) {
        showToast('กรุณาเลือกระดับชั้นและห้องเรียน (ส่วนที่ 2)');
        return;
    }

    const hasSub = isRoomSub(grade, room);
    const groupEl = document.querySelector('input[name="group"]:checked');
    let group = hasSub ? (groupEl ? groupEl.value : null) : '-';
    
    if(hasSub && !group) {
        showToast('กรุณาเลือกกลุ่ม ก หรือ ข (ส่วนที่ 2)');
        return;
    }
    
    const keys = Object.keys(selectedData);
    
    let formattedIssuesList = [];
    keys.forEach(k => {
        const itemText = selectedData[k].label;
        const weeks = selectedData[k].weeks;
        const allowWeek = selectedData[k].allow_week !== false;
        if(allowWeek && weeks && weeks.length > 0) {
            formattedIssuesList.push(`${itemText} สัปดาห์ที่ ${formatWeekRanges(weeks)}`);
        } else {
            formattedIssuesList.push(itemText);
        }
    });
    
    const overallStatusEl = document.querySelector('input[name="overall_status"]:checked');
    if(!overallStatusEl) {
        showToast('กรุณาเลือกสถานะการตรวจ (ส่วนที่ 3)');
        return;
    }
    const statusText = overallStatusEl.value;
    if (statusText === 'ไม่เรียบร้อย') {
        if (keys.length === 0) {
            showToast('กรุณาเลือกรายการที่ไม่เรียบร้อยอย่างน้อย 1 รายการ (ส่วนที่ 4)');
            return;
        }
        
        // บังคับเลือกสัปดาห์เฉพาะรายการที่ allow_week !== false
        for (const k of keys) {
            const item = selectedData[k];
            if (item.allow_week !== false && (!item.weeks || item.weeks.length === 0)) {
                showToast(`กรุณาระบุสัปดาห์ที่ไม่เรียบร้อยสำหรับ "${item.label}"`);
                return;
            }
        }
    }
    
    const record = {
        id: Date.now().toString(),
        grade: grade,
        room: room,
        group_name: group,
        status: statusText,
        issues: formattedIssuesList.length > 0 ? formattedIssuesList.join(',<br>') : '-',
        raw_issues: selectedData,
        unsubmitted_weeks: [...unsubmittedWeeks]
    };
    
    record.updatedAt = Date.now();
    const wasEditing = editingId && addedRooms.some(r => r.id === editingId);
    if (wasEditing) {
        record.id = editingId;
        addedRooms = addedRooms.map(r => (r.id === editingId ? record : r));
    } else {
        addedRooms.push(record);
    }
    setEditing(null);
    renderSummaryTable();
    clearFormSection2();
    
    // Auto close form on mobile after adding
    if(window.innerWidth <= 900) {
        document.querySelector('.left-pane').classList.remove('open');
        document.querySelector('.form-overlay').classList.remove('show');
    }
    const groupMsg = hasSub ? ` กลุ่ม ${group}` : '';
    showToast(wasEditing ? `แก้ไขข้อมูล ${grade}/${room}${groupMsg} แล้ว` : `เพิ่มข้อมูล ${grade}/${room}${groupMsg} ลงตารางแล้ว`);
}

function renderSummaryTable() {
    if (typeof Draft !== 'undefined') Draft.schedule();
    // Newest first: most recently added or edited at the top.
    addedRooms.sort((a, b) => roomTime(b) - roomTime(a));

    const tbody = document.getElementById('summary-tbody');
    const emptyState = document.getElementById('empty-state');
    
    tbody.innerHTML = '';
    document.getElementById('summary-badge').textContent = `${addedRooms.length} ห้อง`;
    
    if(addedRooms.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        
        addedRooms.forEach(r => {
            const statusClass = r.status === "เรียบร้อย" ? "text-success" : "text-warning";
            const tr = document.createElement('tr');
            if (r.id === editingId) tr.className = 'is-editing';
            tr.innerHTML = `
                <td data-label="ห้องเรียน"><b>${r.grade}/${r.room}</b></td>
                <td data-label="กลุ่ม">${r.group_name}</td>
                <td data-label="สถานะ" class="${statusClass}"><b>${r.status}</b></td>
                <td data-label="รายการที่ต้องแก้ไข">${r.issues || '-'}</td>
                <td data-label="สัปดาห์ที่ยังไม่ส่ง">${formatWeekRanges(r.unsubmitted_weeks) || '-'}</td>
                <td class="td-time"><time datetime="${new Date(roomTime(r)).toISOString()}">${formatRoomTime(roomTime(r))}</time></td>
                <td class="td-actions">
                    <button class="btn-edit-text" type="button" title="แก้ไข" aria-label="แก้ไข" onclick="editRoomRecord('${r.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-danger-text" type="button" title="ลบ" aria-label="ลบ" onclick="removeRoomRecord('${r.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

window.removeRoomRecord = function(id) {
    addedRooms = addedRooms.filter(r => r.id !== id);
    if (editingId === id) setEditing(null);
    renderSummaryTable();
}

window.clearFormSection2 = function() {
    document.getElementById('select-grade').value = '';
    const roomSelect = document.getElementById('select-room');
    roomSelect.innerHTML = '<option value="" disabled selected>-- เลือกห้อง --</option>';
    roomSelect.disabled = true;
    
    const groupWrapper = document.getElementById('group-wrapper');
    if (groupWrapper) groupWrapper.style.display = 'block';
    
    document.querySelectorAll('input[name="group"]').forEach(rb => {
        rb.checked = false;
        rb.disabled = true;
    });
    
    document.querySelectorAll('input[name="overall_status"]').forEach(rb => {
        rb.checked = false;
        rb.disabled = true;
    });
    document.getElementById('section3-card').style.display = 'none';
    
    selectedData = {};
    unsubmittedWeeks = [];
    updateUnsubmittedBadge();
    disableSections();
    renderChecklist();
}

window.submitToDatabase = async function() {
    const inspectorName = document.getElementById('inspector-input').value.trim();
    const inspectorWeek = document.getElementById('select-inspector-week').value;
    
    if(!inspectorName) {
        showToast('กรุณากรอกชื่อผู้ตรวจ (ส่วนที่ 1)');
        return;
    }
    if(!inspectorWeek) {
        showToast('กรุณาเลือกสัปดาห์ที่ตรวจ (ส่วนที่ 1)');
        return;
    }
    
    if(addedRooms.length === 0) {
        showToast('ยังไม่มีข้อมูลในตารางฝั่งขวา กรุณากด "เพิ่มลงตาราง" ก่อน');
        return;
    }
    
    const payload = {
        inspector_name: inspectorName,
        inspected_week: parseInt(inspectorWeek),
        term: '2/2569',
        records: addedRooms
    };
    
    const btn = document.querySelector('.dashboard-footer .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึกข้อมูล...';
    btn.disabled = true;
    
    // ฟังก์ชันยิงส่งข้อมูล
    async function sendSubmit() {
        const res = await fetch('/api/pinkbook/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.json();
    }

    // ฟังก์ชันตรวจสอบความถูกต้องใน DB
    async function verifyDatabase() {
        const res = await fetch('/api/pinkbook/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        return json.success && json.verified;
    }

    try {
        // รอบที่ 1: ส่งข้อมูล
        let submitSuccess = false;
        try {
            const data = await sendSubmit();
            if (data.success) {
                // ตรวจสอบว่าบันทึกลง DB จริงหรือไม่
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังตรวจสอบฐานข้อมูล...';
                const isVerified = await verifyDatabase();
                if (isVerified) {
                    submitSuccess = true;
                }
            }
        } catch (e1) {
            console.warn('Pinkbook submit attempt 1 failed:', e1);
        }

        // รอบที่ 2 (Retry): ถ้ารอบแรกไม่ผ่าน รอ 2 วินาทีแล้วลองส่งใหม่
        if (!submitSuccess) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังลองส่งใหม่อีกครั้ง...';
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const data2 = await sendSubmit();
                if (data2.success) {
                    const isVerified2 = await verifyDatabase();
                    if (isVerified2) {
                        submitSuccess = true;
                    }
                }
            } catch (e2) {
                console.error('Pinkbook submit attempt 2 failed:', e2);
            }
        }

        // ประเมินผลลัพธ์สุดท้าย
        if (submitSuccess) {
            document.getElementById('success-modal').classList.add('show');
            addedRooms = [];
            renderSummaryTable();
            Draft.afterSubmit();
        } else {
            // เกิดข้อผิดพลาด -> แจ้งเตือน และคงข้อมูลเดิมไว้ในตาราง ไม่เคลียร์ทิ้ง
            showToast('ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วกดส่งใหม่อีกครั้ง');
        }
    } catch(err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.closeSuccessModal = function() {
    document.getElementById('success-modal').classList.remove('show');
}

// ===== Auto Refresh on Return / Focus =====
let pageBlurredTime = 0;
let isRefreshing = false;

function isFormClean() {
    const grade = document.getElementById('select-grade')?.value;
    const room = document.getElementById('select-room')?.value;
    const activeTag = document.activeElement?.tagName;
    const isInputActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
    const hasOpenModal = !!document.querySelector('.week-modal.show, #custom-modal.show, #confirm-modal.show, #success-modal.show');
    const hasData = addedRooms.length > 0 || !!grade || !!room || Object.keys(selectedData).length > 0 || unsubmittedWeeks.length > 0;
    return !hasData && !isInputActive && !hasOpenModal;
}

function triggerSafePageRefresh() {
    if (isRefreshing) return;
    // With the history drawer open, a full page reload would close it under the user. Refresh just
    // the history it is showing instead (keeping the chosen name and the scroll position).
    const drawer = document.getElementById('history-drawer');
    if (drawer && drawer.classList.contains('open')) {
        refreshHistoryInPlace();
        return;
    }
    if (!isFormClean()) return;
    
    isRefreshing = true;
    
    let overlay = document.getElementById('page-refresh-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'page-refresh-overlay';
        overlay.className = 'fullscreen-refresh-overlay';
        overlay.innerHTML = `
            <div class="refresh-spinner-box">
                <i class="fa-solid fa-arrows-rotate fa-spin"></i>
                <p>กำลังอัปเดตข้อมูลล่าสุด...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    
    // Safety timeout: If reload does not happen within 3.5 seconds, remove overlay to prevent hanging
    const safetyTimer = setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        isRefreshing = false;
    }, 3500);

    setTimeout(() => {
        try {
            window.location.reload();
        } catch(e) {
            clearTimeout(safetyTimer);
            if (overlay) overlay.style.display = 'none';
            isRefreshing = false;
        }
    }, 300);
}

window.addEventListener('blur', () => {
    pageBlurredTime = Date.now();
});

window.addEventListener('focus', () => {
    if (pageBlurredTime > 0 && Date.now() - pageBlurredTime >= 3000) {
        triggerSafePageRefresh();
    }
    pageBlurredTime = 0;
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        pageBlurredTime = Date.now();
    } else if (document.visibilityState === 'visible') {
        if (pageBlurredTime > 0 && Date.now() - pageBlurredTime >= 3000) {
            triggerSafePageRefresh();
        }
        pageBlurredTime = 0;
    }
});


// ===== Unsaved-draft protection =====================================================
// Everything on the form that has not been submitted — inspector, week, the room being filled in,
// its checklist and weeks, and every room already added to the table — is saved as a draft while
// the user works: to localStorage at once, and to the server (/api/pinkbook/draft) a moment later,
// keyed by a random ID this browser keeps for good. Closing the tab, the browser crashing or the
// phone killing the page loses nothing; the next visit puts the form back exactly as it was.
const Draft = (() => {
    const ID_KEY = 'pinkbook_draft_id';
    const LOCAL_KEY = 'pinkbook_draft';
    const COOKIE = 'pb_draft';
    let restoring = false;
    let timer = null;
    let lastSentJson = '';

    // The identifier. localStorage has no expiry; a cookie is kept alongside it (and re-written on
    // every visit, so its maximum lifetime keeps moving forward) in case one of the two is cleared.
    function readCookie() {
        const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }
    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    const ok = (v) => /^[A-Za-z0-9_-]{16,64}$/.test(v || '');
    let id = '';
    try { id = localStorage.getItem(ID_KEY) || ''; } catch (e) {}
    if (!ok(id)) id = readCookie();
    if (!ok(id)) id = newId();
    try { localStorage.setItem(ID_KEY, id); } catch (e) {}
    document.cookie = `${COOKIE}=${encodeURIComponent(id)}; Max-Age=${400 * 24 * 3600}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;

    const $ = (sel) => document.querySelector(sel);

    function collect() {
        const group = $('input[name="group"]:checked');
        const status = $('input[name="overall_status"]:checked');
        return {
            v: 1,
            inspector: $('#inspector-input').value,
            week: $('#select-inspector-week').value,
            grade: $('#select-grade').value,
            room: $('#select-room').value,
            group: group ? group.value : '',
            status: status ? status.value : '',
            selectedData,
            unsubmittedWeeks,
            addedRooms,
            editingId,
        };
    }
    // "Unsaved" = something that submitting would send, or a room part-way through being filled in.
    // Inspector and week alone are remembered but are not worth a warning.
    function isEmpty(d) {
        return !d.addedRooms.length && !d.grade && !d.room && !Object.keys(d.selectedData || {}).length && !(d.unsubmittedWeeks || []).length;
    }

    function saveLocal(d) {
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) {}
    }
    async function push(d, beacon) {
        const body = JSON.stringify({ id, draft: isEmpty(d) ? null : d });
        if (body === lastSentJson) return;
        lastSentJson = body;
        if (beacon && navigator.sendBeacon) {
            navigator.sendBeacon('/api/pinkbook/draft', new Blob([body], { type: 'text/plain' }));
            return;
        }
        try {
            await fetch('/api/pinkbook/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        } catch (e) {
            lastSentJson = ''; // offline: the local copy has it; try again on the next change
        }
    }
    function snapshot() {
        const d = collect();
        d.savedAt = Date.now();
        saveLocal(d);
        return d;
    }

    function schedule() {
        if (restoring) return;
        clearTimeout(timer);
        timer = setTimeout(() => push(snapshot()), 700);
    }
    function flush() {
        if (restoring) return;
        clearTimeout(timer);
        push(snapshot(), true);
    }

    async function fetchServer() {
        try {
            const res = await fetch(`/api/pinkbook/draft?id=${encodeURIComponent(id)}&t=${Date.now()}`);
            const j = await res.json();
            return j.success ? j.draft : null;
        } catch (e) {
            return null;
        }
    }

    function setRadio(name, value) {
        const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (el) { el.disabled = false; el.checked = true; }
    }

    // Puts a draft back on the form without triggering the "load this room's last record" fetch,
    // which would replace the restored checklist with what is in the database.
    function apply(d) {
        if (d.inspector) $('#inspector-input').value = d.inspector;
        if (d.week) $('#select-inspector-week').value = d.week;
        if (typeof saveCache === 'function') saveCache();

        if (Array.isArray(d.addedRooms)) addedRooms = d.addedRooms;
        loadRoom(d, true);
        if (d.editingId && addedRooms.some((r) => r.id === d.editingId)) setEditing(d.editingId);
        renderSummaryTable();
    }

    // Puts one room's answers on the form (used by restore and by the table's pencil button).
    function loadRoom(d, quiet) {
        selectedData = d.selectedData && typeof d.selectedData === 'object' ? d.selectedData : {};
        unsubmittedWeeks = Array.isArray(d.unsubmittedWeeks) ? d.unsubmittedWeeks : [];
        Object.values(selectedData).forEach((it) => {
            if (!it || !it.label) return;
            if (!items.some((x) => (typeof x === 'string' ? x : x.title) === it.label)) items.push({ title: it.label, allow_week: it.allow_week !== false });
        });
        const gradeSel = $('#select-grade');
        const roomSel = $('#select-room');
        if (d.grade) {
            gradeSel.value = d.grade;
            gradeSel.dispatchEvent(new Event('change')); // fills the room list
            if (d.room) {
                roomSel.value = d.room;
                const hasSub = isRoomSub(d.grade, d.room);
                const wrapper = document.getElementById('group-wrapper');
                if (hasSub) {
                    if (wrapper) wrapper.style.display = 'block';
                    document.querySelectorAll('input[name="group"]').forEach((rb) => (rb.disabled = false));
                    if (d.group) { setRadio('group', d.group); enableSections(); }
                } else {
                    if (wrapper) wrapper.style.display = 'none';
                    enableSections();
                }
            }
        }
        document.querySelectorAll('input[name="overall_status"]').forEach((r) => (r.checked = false));
        if (d.status) {
            setRadio('overall_status', d.status);
            document.getElementById('section3-card').style.display = d.status === 'ไม่เรียบร้อย' ? 'block' : 'none';
        }
        renderChecklist();
        updateUnsubmittedBadge();
        if (!quiet) schedule();
    }

    async function restore() {
        let local = null;
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) {}
        const server = await fetchServer();
        // Whichever copy was written last wins: the local one can be newer than the server's (a
        // change made offline), the server's newer than the local one (storage cleared, or the same
        // ID restored from the cookie).
        const pick = [local, server].filter((d) => d && d.v === 1).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
        if (!pick || isEmpty(pick)) return;
        restoring = true;
        try {
            apply(pick);
        } finally {
            restoring = false;
        }
        saveLocal(pick);
        lastSentJson = '';
        push(pick); // make sure the server has the copy that won
        const n = pick.addedRooms ? pick.addedRooms.length : 0;
        showToast(n ? `กู้คืนข้อมูลที่ยังไม่ได้บันทึกแล้ว (${n} ห้องในตาราง)` : 'กู้คืนข้อมูลที่ยังไม่ได้บันทึกแล้ว');
    }

    function start() {
        // Typing and picking anywhere on the form. The functions that change the in-memory state
        // (checklist, weeks, table) call schedule() themselves.
        document.addEventListener('input', schedule, true);
        document.addEventListener('change', schedule, true);
        // Week toggles and similar change arrays in memory without an input event.
        document.addEventListener('click', schedule, true);
        // The last change made just before the page goes away goes out with sendBeacon, which the
        // browser delivers even as the page is being closed.
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }

    function hasUnsaved() {
        return !isEmpty(collect());
    }

    function afterSubmit() {
        // The table has gone to the database. Whatever is still on the form (usually nothing) stays
        // as the draft; an empty form deletes it.
        clearTimeout(timer);
        lastSentJson = '';
        push(snapshot());
    }

    return { schedule, flush, restore, start, hasUnsaved, afterSubmit, loadRoom, get id() { return id; } };
})();


// ===== Edit a room that is already in the table =====================================
// The pencil puts that room back on the form. The row stays in the table (marked as being edited)
// until the form is added again, which replaces it — so backing out of an edit loses nothing.
let editingId = null;
function setEditing(id) {
    editingId = id;
    const btn = document.querySelector('.form-nav .btn-primary');
    if (btn) {
        btn.innerHTML = id
            ? '<i class="fa-solid fa-check"></i> บันทึกการแก้ไข'
            : '<i class="fa-solid fa-plus"></i> เพิ่มลงตาราง <i class="fa-solid fa-arrow-right"></i>';
    }
    document.querySelector('.left-pane')?.classList.toggle('is-editing', !!id);
}
window.editRoomRecord = function(id) {
    const r = addedRooms.find(x => x.id === id);
    if (!r) return;
    Draft.loadRoom({
        grade: r.grade,
        room: r.room,
        group: r.group_name === '-' ? '' : r.group_name,
        status: r.status,
        selectedData: JSON.parse(JSON.stringify(r.raw_issues || {})),
        unsubmittedWeeks: [...(r.unsubmitted_weeks || [])],
    });
    setEditing(id);
    renderSummaryTable();
    if (window.innerWidth <= 900 && !document.querySelector('.left-pane').classList.contains('open')) toggleForm();
    document.querySelector('.left-pane').scrollTo({ top: 0, behavior: 'smooth' });
    const g = r.group_name && r.group_name !== '-' ? ` กลุ่ม ${r.group_name}` : '';
    showToast(`กำลังแก้ไข ${r.grade}/${r.room}${g}`);
};

// ===== Submission history drawer =====================================================
const ACTION_META = {
    submit: { label: 'ส่งผลการตรวจ', icon: 'fa-paper-plane', cls: 'tl-submit' },
    edit: { label: 'แก้ไขข้อมูล', icon: 'fa-pen', cls: 'tl-edit' },
    delete: { label: 'ลบข้อมูล', icon: 'fa-trash', cls: 'tl-delete' },
    revert: { label: 'ย้อนกลับ', icon: 'fa-rotate-left', cls: 'tl-revert' },
};
let historyLoadedOnce = false;

// created_at is SQLite's CURRENT_TIMESTAMP: UTC, without a zone marker.
function parseLogTime(s) {
    return new Date(String(s || '').replace(' ', 'T') + 'Z');
}
function thaiDay(d) {
    const today = new Date();
    const y = new Date(today); y.setDate(today.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, today)) return 'วันนี้';
    if (same(d, y)) return 'เมื่อวาน';
    return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function timeHM(d) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

async function loadHistory(quiet) {
    const body = document.getElementById('history-body');
    const sel = document.getElementById('history-name');
    const name = sel.value;
    document.getElementById('history-clear').hidden = !name;
    const scrollTop = body.scrollTop;
    if (quiet !== true) body.innerHTML = '<div class="tl-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> กำลังโหลดประวัติ…</div>';
    try {
        const res = await fetch(`/api/pinkbook/history?name=${encodeURIComponent(name)}&t=${Date.now()}`);
        const j = await res.json();
        if (!j.success) throw new Error(j.error || 'failed');

        // Names for the filter (kept as the user left it).
        const keep = sel.value;
        sel.innerHTML = '<option value="">ทุกคน</option>' + j.names.map(n => `<option value="${esc(n.name)}">${esc(n.name)} (${n.n})</option>`).join('');
        sel.value = keep;

        const rows = j.data || [];
        document.getElementById('history-count').textContent = rows.length ? `${rows.length} รายการล่าสุด${name ? ' · ' + name : ''}` : 'ไม่มีประวัติ';
        if (!rows.length) {
            body.innerHTML = '<div class="tl-empty"><i class="fa-regular fa-calendar-xmark"></i><p>ยังไม่มีประวัติการส่ง</p></div>';
            return;
        }
        let html = '';
        let lastDay = '';
        rows.forEach(r => {
            const d = parseLogTime(r.created_at);
            const day = thaiDay(d);
            if (day !== lastDay) {
                if (lastDay) html += '</ol>';
                html += `<h4 class="tl-day">${day}</h4><ol class="timeline">`;
                lastDay = day;
            }
            const m = ACTION_META[r.action] || { label: r.action, icon: 'fa-circle', cls: 'tl-other' };
            const grp = r.group_name && r.group_name !== '-' ? ` กลุ่ม ${esc(r.group_name)}` : '';
            const statusCls = r.status === 'เรียบร้อย' ? 'ok' : 'warn';
            const issues = r.issues && r.issues !== '-' ? `<div class="tl-issues">${String(r.issues).replace(/,<br>/g, ' · ')}</div>` : '';
            let unsub = '';
            try {
                const w = JSON.parse(r.unsubmitted_weeks || '[]');
                if (Array.isArray(w) && w.length) unsub = `<div class="tl-meta"><i class="fa-regular fa-calendar-xmark"></i> ยังไม่ส่งสัปดาห์ ${formatWeekRanges(w)}</div>`;
            } catch (e) {}
            html += `
                <li class="tl-item ${m.cls}">
                    <span class="tl-dot"><i class="fa-solid ${m.icon}"></i></span>
                    <div class="tl-card">
                        <div class="tl-top">
                            <span class="tl-action">${m.label}</span>
                            <time datetime="${d.toISOString()}">${timeHM(d)} น.</time>
                        </div>
                        <div class="tl-room">
                            <b>${esc(r.grade)}/${esc(r.room)}${grp}</b>
                            <span class="tl-week">สัปดาห์ ${r.inspected_week}</span>
                            ${r.status ? `<span class="tl-status ${statusCls}">${esc(r.status)}</span>` : ''}
                        </div>
                        ${issues}
                        ${unsub}
                        <div class="tl-by"><i class="fa-solid fa-user"></i> ${esc(r.action_by)}${r.diff_summary && r.action !== 'submit' ? ` · ${esc(r.diff_summary)}` : ''}</div>
                    </div>
                </li>`;
        });
        html += '</ol>';
        body.innerHTML = html;
        if (quiet === true) body.scrollTop = scrollTop;
    } catch (e) {
        console.error(e);
        if (quiet === true) return; // a background refresh that fails leaves what is shown alone
        body.innerHTML = '<div class="tl-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>โหลดประวัติไม่สำเร็จ</p><button class="btn btn-secondary" onclick="loadHistory()">ลองใหม่</button></div>';
    }
}

window.openHistory = function() {
    const sel = document.getElementById('history-name');
    if (!historyLoadedOnce) {
        // First open: show this inspector's own history if they have typed their name.
        historyLoadedOnce = true;
        const me = document.getElementById('inspector-input').value.trim();
        if (me) {
            sel.innerHTML = `<option value="">ทุกคน</option><option value="${esc(me)}">${esc(me)}</option>`;
            sel.value = me;
        }
    }
    document.getElementById('history-drawer').classList.add('open');
    document.getElementById('history-drawer').setAttribute('aria-hidden', 'false');
    document.getElementById('history-overlay').classList.add('show');
    document.body.classList.add('drawer-open');
    loadHistory();
};
window.closeHistory = function() {
    document.getElementById('history-drawer').classList.remove('open');
    document.getElementById('history-drawer').setAttribute('aria-hidden', 'true');
    document.getElementById('history-overlay').classList.remove('show');
    document.body.classList.remove('drawer-open');
};
window.clearHistoryFilter = function() {
    document.getElementById('history-name').value = '';
    loadHistory();
};
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('history-name').addEventListener('change', loadHistory);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('history-drawer').classList.contains('open')) closeHistory();
    });
});


// When a room was added to the table or last edited. Rows from before this was recorded fall back to
// their id, which is the time they were added.
function roomTime(r) {
    return Number(r.updatedAt) || Number(r.id) || 0;
}
// Today: "17:31". Earlier: "1/11/69 17:31" (day/month/two-digit Buddhist year).
function formatRoomTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === new Date().toDateString()) return hm;
    const by = String((d.getFullYear() + 543) % 100).padStart(2, '0');
    return `${d.getDate()}/${d.getMonth() + 1}/${by} ${hm}`;
}

// Background refresh of the open history drawer: no spinner, no reload, nothing moves.
function refreshHistoryInPlace() {
    loadHistory(true);
}
