// Authentication Logic
const COOKIE_NAME = 'pinkbook_admin_auth';

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    document.getElementById('login-password').addEventListener('keyup', (e) => {
        if(e.key === 'Enter') attemptLogin();
    });

    // Radio change listener for Edit Modal
    document.querySelectorAll('input[name="edit_overall_status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            onEditStatusChange(e.target.value);
        });
    });
});

async function attemptLogin() {
    const pwd = document.getElementById('login-password').value;
    if(!pwd) return;
    try {
        const res = await fetch('/api/pinkbook/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({password: pwd})
        });
        const json = await res.json();
        if(json.success) {
            setCookie(COOKIE_NAME, 'true', 7);
            document.getElementById('login-modal').classList.remove('show');
            document.getElementById('main-content').style.display = 'flex';
            initDashboard();
        } else {
            showToast('รหัสผ่านไม่ถูกต้อง');
        }
    } catch(e) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
}

function checkAuth() {
    if(getCookie(COOKIE_NAME) === 'true') {
        document.getElementById('login-modal').classList.remove('show');
        document.getElementById('main-content').style.display = 'flex';
        initDashboard();
    }
}
window.logout = function() {
    setCookie(COOKIE_NAME, '', -1);
    location.reload();
}

window.toggleSidebar = function() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('show');
}

// Dashboard Logic
let currentTerm = '2/2569';
let currentWeek = null;
let currentData = [];
const GRADES = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
const classData = {
    "ม.1": 14, "ม.2": 14, "ม.3": 14,
    "ม.4": 16, "ม.5": 16, "ม.6": 16
};

function updateTermButtonStyles() {
    const isTerm2 = currentTerm === '2/2569' || currentTerm === '2';
    const b2 = document.getElementById('pb-btn-term-2');
    const b1 = document.getElementById('pb-btn-term-1');
    const s2 = document.getElementById('side-pb-term-2');
    const s1 = document.getElementById('side-pb-term-1');
    
    if (b2 && b1) {
        b2.style.background = isTerm2 ? 'var(--primary)' : 'transparent';
        b2.style.color = isTerm2 ? '#fff' : '#475569';
        b2.style.fontWeight = isTerm2 ? '600' : '500';
        b1.style.background = !isTerm2 ? 'var(--primary)' : 'transparent';
        b1.style.color = !isTerm2 ? '#fff' : '#475569';
        b1.style.fontWeight = !isTerm2 ? '600' : '500';
    }
    if (s2 && s1) {
        s2.style.background = isTerm2 ? 'var(--primary)' : '#fff';
        s2.style.color = isTerm2 ? '#fff' : 'var(--text-main)';
        s2.style.border = isTerm2 ? 'none' : '1px solid var(--border-color)';
        s2.style.fontWeight = isTerm2 ? '600' : '500';
        s1.style.background = !isTerm2 ? 'var(--primary)' : '#fff';
        s1.style.color = !isTerm2 ? '#fff' : 'var(--text-main)';
        s1.style.border = !isTerm2 ? 'none' : '1px solid var(--border-color)';
        s1.style.fontWeight = !isTerm2 ? '600' : '500';
    }
}

window.switchPbTerm = function(term) {
    currentTerm = term;
    updateTermButtonStyles();
    loadWeek(currentWeek || 1);
};

async function initDashboard() {
    const config = await PinkbookShared.loadConfig();
    if (config?.current_term) {
        currentTerm = config.current_term;
    }
    updateTermButtonStyles();

    const list = document.getElementById('week-list');
    list.innerHTML = '';
    for(let i=1; i<=22; i++) {
        const div = document.createElement('div');
        div.className = 'week-item';
        div.innerHTML = `<i class="fa-regular fa-calendar"></i> สัปดาห์ที่ ${i}`;
        div.onclick = () => loadWeek(i);
        list.appendChild(div);
    }
    if (currentWeek === null) {
        const autoWeek = PinkbookShared.calculateCurrentWeek(config?.week_1_start);
        loadWeek(autoWeek);
    }
}

async function loadWeek(week) {
    currentWeek = week;
    document.querySelectorAll('.week-item').forEach((el, idx) => {
        el.classList.toggle('active', idx + 1 === week);
    });
    document.getElementById('current-week-title').textContent = `สรุปผลสัปดาห์ที่ ${week} (ภาคเรียน ${currentTerm})`;
    document.getElementById('report-content').innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted)">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem;"></i>
        </div>`;
    try {
        const res = await fetch(`/api/pinkbook/reports?week=${week}&term=${encodeURIComponent(currentTerm)}`);
        const json = await res.json();
        if(json.success) {
            currentData = json.data;
            renderReport();
            if(window.innerWidth <= 768) {
                document.querySelector('.sidebar').classList.remove('open');
                document.querySelector('.sidebar-overlay').classList.remove('show');
            }
        } else {
            showToast('ดึงข้อมูลล้มเหลว');
        }
    } catch(e) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

function renderReport() {
    const container = document.getElementById('report-content');
    container.innerHTML = '';

    GRADES.forEach(grade => {
        const accordion = document.createElement('div');
        accordion.className = 'accordion';

        let tableRows = '';
        const gNum = grade.replace(/\D/g, '');
        const configuredRooms = PinkbookShared.roomsConfig[gNum] ? Object.keys(PinkbookShared.roomsConfig[gNum]).map(Number).sort((a,b)=>a-b) : null;
        const maxRooms = configuredRooms ? configuredRooms[configuredRooms.length - 1] : classData[grade];
        const roomList = configuredRooms || Array.from({length: maxRooms}, (_, i) => i + 1);

        let submittedCount = 0;
        let totalExpected = 0;

        roomList.forEach(rNum => {
            const hasSub = PinkbookShared.isRoomSub(grade, rNum);
            const groups = hasSub ? ['ก', 'ข'] : ['-'];

            groups.forEach(grp => {
                totalExpected++;
                const r = currentData.find(d =>
                    d.grade === grade &&
                    parseInt(d.room) === rNum &&
                    (d.group_name === grp || (!hasSub && (d.group_name === 'ก' || d.group_name === '' || d.group_name === '-')))
                );

                const escGrade = grade.replace(/'/g, "\\'");
                const escGrp = grp.replace(/'/g, "\\'");

                if (r) {
                    submittedCount++;
                    let status = (r.issues && r.issues !== '-') ? "ไม่เรียบร้อย" : "เรียบร้อย";
                    let statusClass = status === "เรียบร้อย" ? "text-success" : "text-warning";
                    const displayGroup = hasSub ? r.group_name : '-';
                    tableRows += `
                        <tr>
                            <td><b>${r.grade}/${r.room}</b></td>
                            <td>${displayGroup}</td>
                            <td class="${statusClass}">${status}</td>
                            <td>${r.issues || '-'}</td>
                            <td>${PinkbookShared.formatWeekRanges(r.unsubmitted_weeks)}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn-icon btn-edit" title="แก้ไขข้อมูล" onclick="openEditRoom('${escGrade}', ${r.room}, '${escGrp}', ${r.id})"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn-icon btn-log" title="ดูประวัติ" onclick="openLogs('${escGrade}', ${r.room}, '${escGrp}')"><i class="fa-regular fa-file-lines"></i></button>
                                    <button class="btn-icon btn-delete" title="ลบข้อมูล" onclick="deleteRecord(${r.id})"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    tableRows += `
                        <tr>
                            <td><b>${grade}/${rNum}</b></td>
                            <td>${grp}</td>
                            <td class="text-danger">ยังไม่ส่ง</td>
                            <td style="color: #9ca3af;">-</td>
                            <td style="color: #9ca3af;">-</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn-icon btn-edit" title="บันทึกข้อมูล" onclick="openEditRoom('${escGrade}', ${rNum}, '${escGrp}', null)"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn-icon btn-log" title="ดูประวัติ" onclick="openLogs('${escGrade}', ${rNum}, '${escGrp}')"><i class="fa-regular fa-file-lines"></i></button>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });
        });

        const escGradeAcc = grade.replace(/'/g, "\\'");
        accordion.innerHTML = `
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                <div class="accordion-title">${grade} <span style="font-size:0.9rem; color:#6b7280; font-weight:normal; margin-left:8px;">(ส่งแล้ว ${submittedCount}/${totalExpected})</span></div>
                <div class="accordion-actions">
                    <button class="btn-copy" onclick="copyGradeText('${escGradeAcc}', event)">
                        <i class="fa-regular fa-copy"></i> คัดลอก
                    </button>
                    <i class="fa-solid fa-chevron-down" style="color:#9ca3af;"></i>
                </div>
            </div>
            <div class="accordion-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th width="12%">ห้องเรียน</th>
                            <th width="10%">กลุ่ม</th>
                            <th width="12%">สถานะ</th>
                            <th width="30%">รายการที่ต้องแก้ไข</th>
                            <th width="16%">สัปดาห์ที่ขาดส่ง</th>
                            <th width="20%">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;
        container.appendChild(accordion);
    });
}

// Copy to Clipboard
window.copyGradeText = function(grade, event) {
    event.stopPropagation();
    let text = `สรุปการตรวจเล่มชมพู ระดับชั้น ${grade} (สัปดาห์ที่ ${currentWeek})\n\n`;
    const gNum = grade.replace(/\D/g, '');
    const configuredRooms = PinkbookShared.roomsConfig[gNum] ? Object.keys(PinkbookShared.roomsConfig[gNum]).map(Number).sort((a,b)=>a-b) : null;
    const maxRooms = configuredRooms ? configuredRooms[configuredRooms.length - 1] : classData[grade];
    const roomList = configuredRooms || Array.from({length: maxRooms}, (_, i) => i + 1);

    roomList.forEach(rNum => {
        const hasSub = PinkbookShared.isRoomSub(grade, rNum);
        const groups = hasSub ? ['ก', 'ข'] : ['-'];
        groups.forEach(grp => {
            const r = currentData.find(d =>
                d.grade === grade &&
                d.room == rNum &&
                (d.group_name === grp || (!hasSub && (d.group_name === 'ก' || d.group_name === '' || d.group_name === '-')))
            );
            const grpLabel = hasSub ? ` (${grp})` : '';
            if (r) {
                let status = (r.issues && r.issues !== '-') ? "ไม่เรียบร้อย" : "เรียบร้อย";
                if (status === "ไม่เรียบร้อย") {
                    let cleanIssues = r.issues.replace(/<br\s*\/?>/gi, " ").replace(/^"|"$/g, '');
                    text += `- ${grade}/${rNum}${grpLabel}: ${status} (${cleanIssues})\n`;
                } else {
                    text += `- ${grade}/${rNum}${grpLabel}: ${status}\n`;
                }
            } else {
                text += `- ${grade}/${rNum}${grpLabel}: ยังไม่ส่ง\n`;
            }
        });
    });
    navigator.clipboard.writeText(text).then(() => {
        showToast(`คัดลอกข้อมูลชั้น ${grade} เรียบร้อยแล้ว`);
    }).catch(() => {
        showToast('ไม่สามารถคัดลอกข้อความได้');
    });
}

// ===== Rich Edit Modal Logic =====
let currentEditGrade = '';
let currentEditRoom = '';
let currentEditGroup = '';
let currentEditRecordId = null;
let editItems = [];
let editSelectedData = {};
let editUnsubmittedWeeks = [];

window.openEditRoom = async function(grade, room, group, recordId) {
    currentEditGrade = grade;
    currentEditRoom = room;
    currentEditGroup = group;
    currentEditRecordId = recordId;

    const grpText = group && group !== '-' ? ` (กลุ่ม ${group})` : '';
    document.getElementById('edit-modal-room').textContent = `${grade}/${room}${grpText} - สัปดาห์ที่ ${currentWeek}`;

    editItems = [...PinkbookShared.items];
    editSelectedData = {};
    editUnsubmittedWeeks = [];

    const record = recordId ? currentData.find(d => d.id === recordId) : null;
    let initStatus = 'ยังไม่ส่ง';

    if (record) {
        if (record.issues && record.issues !== '-') {
            initStatus = 'ไม่เรียบร้อย';
            try {
                const raw = JSON.parse(record.raw_issues || '{}');
                if (typeof raw === 'object' && Object.keys(raw).length > 0) {
                    editSelectedData = raw;
                    Object.values(raw).forEach(item => {
                        const title = item.label || item.title;
                        if (title && !editItems.some(it => it.title === title)) {
                            editItems.push({ title: title, allow_week: item.allow_week !== false });
                        }
                    });
                }
            } catch(e){}
        } else {
            initStatus = 'เรียบร้อย';
        }
        try {
            editUnsubmittedWeeks = JSON.parse(record.unsubmitted_weeks) || [];
            if (!Array.isArray(editUnsubmittedWeeks)) editUnsubmittedWeeks = [];
        } catch(e) { editUnsubmittedWeeks = []; }
    } else {
        // ดึงข้อมูลล่าสุดจากสัปดาห์ก่อนหน้ามาใส่ให้อัตโนมัติ
        try {
            const res = await fetch(`/api/pinkbook/latest?grade=${encodeURIComponent(grade)}&room=${room}&group=${encodeURIComponent(group || '-')}&term=${encodeURIComponent(currentTerm)}`);
            const json = await res.json();
            if (json.success && json.data) {
                const latest = json.data;
                if (latest.raw_issues) {
                    try {
                        const raw = JSON.parse(latest.raw_issues || '{}');
                        if (typeof raw === 'object' && Object.keys(raw).length > 0) {
                            editSelectedData = raw;
                            Object.values(raw).forEach(item => {
                                const title = item.label || item.title;
                                if (title && !editItems.some(it => it.title === title)) {
                                    editItems.push({ title: title, allow_week: item.allow_week !== false });
                                }
                            });
                        }
                    } catch(e){}
                }
                if (latest.unsubmitted_weeks) {
                    try {
                        const unsub = JSON.parse(latest.unsubmitted_weeks);
                        if (Array.isArray(unsub)) {
                            editUnsubmittedWeeks = unsub;
                        }
                    } catch(e){}
                }

                if (Object.keys(editSelectedData).length > 0 || (latest.issues && latest.issues !== '-')) {
                    initStatus = 'ไม่เรียบร้อย';
                } else if (latest.status === 'เรียบร้อย' || latest.issues === '-') {
                    initStatus = 'เรียบร้อย';
                } else {
                    initStatus = 'ไม่เรียบร้อย';
                }
            }
        } catch(e) {
            console.error("Failed to fetch latest room data for edit:", e);
        }
    }

    const radio = document.querySelector(`input[name="edit_overall_status"][value="${initStatus}"]`);
    if (radio) radio.checked = true;

    onEditStatusChange(initStatus);
    document.getElementById('edit-modal').classList.add('show');
}

function onEditStatusChange(status) {
    const sec4 = document.getElementById('edit-section4-card');
    const sec5 = document.getElementById('edit-section5-card');

    if (status === 'ไม่เรียบร้อย') {
        if (sec4) sec4.style.display = 'block';
        if (sec5) sec5.style.display = 'block';
        renderEditChecklist();
    } else if (status === 'เรียบร้อย') {
        if (sec4) sec4.style.display = 'none';
        if (sec5) sec5.style.display = 'block';
        editSelectedData = {};
    } else {
        if (sec4) sec4.style.display = 'none';
        if (sec5) sec5.style.display = 'none';
        editSelectedData = {};
        editUnsubmittedWeeks = [];
    }
    updateEditUnsubBadge();
}

function updateEditUnsubBadge() {
    const badge = document.getElementById('edit-unsub-badge');
    if (!badge) return;
    if (editUnsubmittedWeeks.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = `สัปดาห์ที่ ${PinkbookShared.formatWeekRanges(editUnsubmittedWeeks)}`;
    } else {
        badge.style.display = 'none';
    }
}

function renderEditChecklist() {
    const container = document.getElementById('edit-checklist-container');
    if (!container) return;
    container.innerHTML = '';

    editItems.forEach((item, index) => {
        const id = index;
        const isChecked = !!editSelectedData[id];
        const itemWeeks = isChecked && editSelectedData[id].weeks ? editSelectedData[id].weeks : [];
        const allowWeek = item.allow_week !== false;

        const div = document.createElement('div');
        div.className = `check-item ${isChecked ? 'active' : ''}`;

        let weekBtnHTML = '';
        if (allowWeek) {
            const hasWeeks = itemWeeks.length > 0;
            const weekBtnText = hasWeeks ? `สัปดาห์ที่ ${PinkbookShared.formatWeekRanges(itemWeeks)}` : 'เลือกสัปดาห์';
            weekBtnHTML = `
                <div class="week-btn-container bg-active">
                    <button type="button" class="btn-week-select" data-edit-week-id="${id}">
                        <i class="fa-regular fa-calendar-check"></i>
                        <span class="btn-week-text">${weekBtnText}</span>
                    </button>
                </div>
            `;
        }

        div.innerHTML = `
            <input type="checkbox" id="edit-chk-${id}" ${isChecked ? 'checked' : ''}>
            <span class="check-item-text">${item.title}</span>
            ${weekBtnHTML}
        `;

        div.onclick = (e) => {
            if (e.target.closest('.week-btn-container')) return;
            toggleEditCheckItem(id, item.title, allowWeek);
        };

        const weekBtn = div.querySelector(`[data-edit-week-id="${id}"]`);
        if (weekBtn) {
            weekBtn.onclick = (e) => {
                e.stopPropagation();
                openEditWeekModal(id, item.title);
            };
        }

        container.appendChild(div);
    });
}

function toggleEditCheckItem(id, title, allowWeek) {
    if (editSelectedData[id]) {
        delete editSelectedData[id];
    } else {
        editSelectedData[id] = { label: title, weeks: [], allow_week: allowWeek };
    }
    renderEditChecklist();
}

function openEditWeekModal(id, title) {
    const currentWeeks = editSelectedData[id] ? editSelectedData[id].weeks || [] : [];
    PinkbookShared.openWeekModal(title, currentWeeks, (selectedWeeks) => {
        if (!editSelectedData[id]) {
            const item = editItems[id];
            editSelectedData[id] = { label: title, weeks: selectedWeeks, allow_week: item ? item.allow_week !== false : true };
        } else {
            editSelectedData[id].weeks = selectedWeeks;
        }
        renderEditChecklist();
    });
}

window.openEditCustomModal = function() {
    PinkbookShared.openCustomItemModal((newTitle) => {
        const newItem = { title: newTitle, allow_week: true };
        editItems.push(newItem);
        const newId = editItems.length - 1;
        editSelectedData[newId] = { label: newTitle, weeks: [], allow_week: true };
        renderEditChecklist();
    });
}

window.openEditUnsubModal = function() {
    PinkbookShared.openWeekModal('เลือกสัปดาห์ที่ขาดส่ง', editUnsubmittedWeeks, (selectedWeeks) => {
        editUnsubmittedWeeks = selectedWeeks;
        updateEditUnsubBadge();
    });
}

window.closeEditModal = function() {
    document.getElementById('edit-modal').classList.remove('show');
}

window.saveEdit = async function() {
    const statusRadio = document.querySelector('input[name="edit_overall_status"]:checked');
    const status = statusRadio ? statusRadio.value : 'ยังไม่ส่ง';

    let issues = '-';
    if (status === 'ไม่เรียบร้อย') {
        const keys = Object.keys(editSelectedData);
        if (keys.length === 0) {
            showToast('กรุณาเลือกรายการที่ไม่เรียบร้อยอย่างน้อย 1 รายการ');
            return;
        }
        for (const k of keys) {
            const item = editSelectedData[k];
            if (item.allow_week !== false && (!item.weeks || item.weeks.length === 0)) {
                showToast(`กรุณาเลือกสัปดาห์สำหรับ: ${item.label}`);
                return;
            }
        }
        issues = PinkbookShared.formatIssuesList(editSelectedData);
    } else if (status === 'เรียบร้อย') {
        issues = '-';
        editSelectedData = {};
    } else {
        issues = '-';
        editSelectedData = {};
        editUnsubmittedWeeks = [];
    }

    try {
        const res = await fetch('/api/pinkbook/reports/admin_save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                term: currentTerm,
                week: currentWeek,
                grade: currentEditGrade,
                room: currentEditRoom,
                group_name: currentEditGroup,
                status: status,
                issues: issues,
                unsubmitted_weeks: editUnsubmittedWeeks,
                raw_issues: editSelectedData,
                action_by: 'แอดมิน',
                diff_summary: `บันทึกผลการตรวจเป็น ${status}`
            })
        });
        const json = await res.json();
        if (json.success) {
            showToast('บันทึกข้อมูลสำเร็จ');
            closeEditModal();
            loadWeek(currentWeek);
        } else {
            showToast('บันทึกข้อมูลไม่สำเร็จ: ' + (json.error || ''));
        }
    } catch(e) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// ===== Logs Modal Logic =====
function formatThaiDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
        if (isNaN(d.getTime())) return dateStr;
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const day = d.getDate();
        const month = months[d.getMonth()];
        const year = d.getFullYear() + 543;
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return `${day} ${month} ${year} ${hours}:${mins}:${secs}`;
    } catch(e) { return dateStr; }
}

window.openLogs = async function(grade, room, group) {
    const grpText = group && group !== '-' ? ` (กลุ่ม ${group})` : '';
    document.getElementById('logs-modal-room').textContent = `${grade}/${room}${grpText} - สัปดาห์ที่ ${currentWeek}`;

    const container = document.getElementById('logs-timeline-container');
    container.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted);">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.8rem;"></i>
            <p style="margin-top:8px; font-size:0.9rem;">กำลังโหลดประวัติ...</p>
        </div>
    `;
    document.getElementById('logs-modal').classList.add('show');

    try {
        const res = await fetch(`/api/pinkbook/logs?week=${currentWeek}&grade=${encodeURIComponent(grade)}&room=${room}&group=${encodeURIComponent(group || '-')}&term=${encodeURIComponent(currentTerm)}`);
        const json = await res.json();

        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            let html = '';
            json.data.forEach(log => {
                let badgeClass = 'badge-edit';
                let actionText = 'แก้ไข';
                let iconClass = 'fa-solid fa-pen-to-square';

                if (log.action === 'submit') {
                    badgeClass = 'badge-submit'; actionText = 'ส่งข้อมูล'; iconClass = 'fa-solid fa-cloud-arrow-up';
                } else if (log.action === 'delete') {
                    badgeClass = 'badge-delete'; actionText = 'ลบข้อมูล'; iconClass = 'fa-solid fa-trash-can';
                } else if (log.action === 'revert') {
                    badgeClass = 'badge-revert'; actionText = 'ย้อนกลับ'; iconClass = 'fa-solid fa-rotate-left';
                }

                let statusClass = 'text-warning';
                let statusText = log.status || 'ไม่ระบุ';
                if (statusText === 'เรียบร้อย') statusClass = 'text-success';
                else if (statusText === 'ยังไม่ส่ง') statusClass = 'text-danger';

                const issuesHTML = log.issues && log.issues !== '-' ? `<div class="timeline-issues"><b>รายการที่ไม่เรียบร้อย:</b><br>${log.issues}</div>` : '';
                const unsubHTML = log.unsubmitted_weeks && log.unsubmitted_weeks !== '[]' && log.unsubmitted_weeks !== '-' ? `
                    <div style="font-size:0.85rem; color:#4b5563; margin-bottom:8px;">
                        <i class="fa-regular fa-calendar-xmark" style="color:var(--danger);"></i> สัปดาห์ที่ขาดส่ง: <b>${PinkbookShared.formatWeekRanges(log.unsubmitted_weeks)}</b>
                    </div>
                ` : '';

                html += `
                    <div class="timeline-item action-${log.action}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-card">
                            <div class="timeline-header">
                                <div>
                                    <span class="timeline-badge ${badgeClass}"><i class="${iconClass}"></i> ${actionText}</span>
                                    <span class="timeline-status ${statusClass}" style="margin-left:8px;">${statusText}</span>
                                </div>
                                <span class="timeline-time"><i class="fa-regular fa-clock"></i> ${formatThaiDateTime(log.created_at)}</span>
                            </div>
                            <div class="timeline-meta">
                                <span><i class="fa-regular fa-user"></i> ผู้ทำรายการ: <b>${log.action_by || 'แอดมิน'}</b></span>
                            </div>
                            ${log.diff_summary ? `<div class="timeline-diff"><i class="fa-solid fa-circle-info"></i> ${log.diff_summary}</div>` : ''}
                            ${issuesHTML}
                            ${unsubHTML}
                            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                                <button type="button" class="btn-revert" data-revert-log="${log.id}">
                                    <i class="fa-solid fa-rotate-left"></i> ย้อนกลับไปสถานะนี้
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;

            // Attach revert handlers
            container.querySelectorAll('[data-revert-log]').forEach(btn => {
                btn.onclick = () => revertToLog(parseInt(btn.dataset.revertLog));
            });
        } else {
            container.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="fa-regular fa-folder-open" style="font-size:2.5rem; margin-bottom:12px; opacity:0.6;"></i>
                    <p style="font-size:0.95rem;">ยังไม่มีประวัติการบันทึกข้อมูลสำหรับห้องนี้</p>
                </div>
            `;
        }
    } catch(e) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--danger);">
                <p>ไม่สามารถดึงข้อมูลประวัติได้</p>
            </div>
        `;
    }
}

window.closeLogsModal = function() {
    document.getElementById('logs-modal').classList.remove('show');
}

async function revertToLog(logId) {
    if(!confirm("คุณต้องการย้อนกลับข้อมูลห้องนี้ไปเป็นข้อมูล ณ จุดนี้ใช่หรือไม่?\n(ระบบจะบันทึกประวัติรายการใหม่โดยไม่ลบประวัติเดิม)")) return;
    try {
        const res = await fetch('/api/pinkbook/logs/revert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ log_id: logId, action_by: 'แอดมิน' })
        });
        const json = await res.json();
        if(json.success) {
            showToast('ย้อนกลับข้อมูลสำเร็จ');
            closeLogsModal();
            loadWeek(currentWeek);
        } else {
            showToast('ย้อนกลับไม่สำเร็จ: ' + (json.error || ''));
        }
    } catch(e) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

window.deleteRecord = async function(id) {
    if(!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลผลการตรวจห้องนี้?\n(สถานะจะเปลี่ยนเป็น 'ยังไม่ส่ง' และถูกบันทึกลงใน Logs)")) return;
    try {
        const res = await fetch(`/api/pinkbook/reports/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if(json.success) {
            showToast('ลบข้อมูลสำเร็จ');
            loadWeek(currentWeek);
        } else {
            showToast('ลบข้อมูลไม่สำเร็จ');
        }
    } catch(e) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Auto Refresh on Return / Focus =====
let pageBlurredTime = 0;
let isRefreshing = false;

function isViewformsClean() {
    const hasOpenModal = !!document.querySelector('#edit-modal.show, #login-modal.show, #logs-modal.show, .week-modal.show');
    const activeTag = document.activeElement?.tagName;
    const isInputActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
    return !hasOpenModal && !isInputActive;
}

function triggerSafePageRefresh() {
    if (isRefreshing) return;
    if (!isViewformsClean()) return;
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
    const safetyTimer = setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        isRefreshing = false;
    }, 3500);
    setTimeout(() => {
        try { window.location.reload(); } catch(e) {
            clearTimeout(safetyTimer);
            if (overlay) overlay.style.display = 'none';
            isRefreshing = false;
        }
    }, 300);
}

window.addEventListener('blur', () => { pageBlurredTime = Date.now(); });
window.addEventListener('focus', () => {
    if (pageBlurredTime > 0 && Date.now() - pageBlurredTime >= 3000) triggerSafePageRefresh();
    pageBlurredTime = 0;
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        pageBlurredTime = Date.now();
    } else if (document.visibilityState === 'visible') {
        if (pageBlurredTime > 0 && Date.now() - pageBlurredTime >= 3000) triggerSafePageRefresh();
        pageBlurredTime = 0;
    }
});
