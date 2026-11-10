// ===== Inert Form Application =====

let inspectorsData = [];
let boxCounter = 0;
let FORM_TYPES = [];
let FORM_VIOLATIONS = [];
let FORM_COLUMNS = [];

// ===== Data Loading =====
async function loadData() {
    try {
        const [inspectorsRes, configRes] = await Promise.all([
            fetch(`/inspectors.json?t=${new Date().getTime()}`),
            fetch(`/api/inert/config?t=${new Date().getTime()}`)
        ]);
        inspectorsData = await inspectorsRes.json();
        const configData = await configRes.json();
        
        if (configData.success) {
            FORM_TYPES = configData.config.TYPES;
            FORM_VIOLATIONS = configData.config.VIOLATIONS;
            FORM_COLUMNS = configData.config.COLUMNS || [
                { header: "ประทับเวลา", source: "timestamp" },
                { header: "วันที่", source: "dateFormatted" },
                { header: "ชื่อผู้ตรวจ", source: "inspector" },
                { header: "รหัสประจำตัวนักเรียน", source: "studentId" },
                { header: "ชื่อ - สกุล", source: "name" },
                { header: "ชั้น", source: "cls" },
                { header: "ห้อง", source: "room" },
                { header: "เลขที่", source: "number" },
                { header: "สาย - เฉื่อย", source: "typeVal" },
                { header: "รายการผิดระเบียบ", source: "violations" }
            ];
        }
        
        initInspectorSelect();
        addStudentBox();
    } catch (e) {
        showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
        console.error(e);
    }
}

// ===== Page Navigation =====
function goToPage(page) {
    if (page === 2 && !validatePage1()) return;
    document.querySelectorAll('.form-page').forEach(p => p.classList.remove('active'));
    document.getElementById('page' + page).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validatePage1() {
    let valid = true;
    const date = document.getElementById('form-date');
    const inspector = document.getElementById('inspector-input');
    const grpDate = document.getElementById('grp-date');
    const grpInsp = document.getElementById('grp-inspector');

    grpDate.classList.toggle('error', !date.value);
    grpInsp.classList.toggle('error', !inspector.value.trim());
    if (!date.value || !inspector.value.trim()) valid = false;
    return valid;
}

// ===== Inspector Searchable Select =====
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
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 200));
    dropdown.addEventListener('click', e => {
        const opt = e.target.closest('.select-option');
        if (opt) {
            input.value = opt.dataset.value;
            dropdown.classList.remove('open');
            document.getElementById('grp-inspector').classList.remove('error');
        }
    });
}

// ===== Student Box Management =====
function addStudentBox() {
    boxCounter++;
    const id = boxCounter;
    const container = document.getElementById('student-boxes');
    const box = document.createElement('div');
    box.className = 'student-box';
    box.id = 'box-' + id;
    box.dataset.boxId = id;
    box.dataset.lastAutoFillId = '';
    box.innerHTML = buildBoxHTML(id);
    container.appendChild(box);
    initBoxEvents(id);
    // Scroll into view
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeStudentBox(id) {
    const boxes = document.querySelectorAll('.student-box');
    if (boxes.length <= 1) {
        showToast('ต้องมีอย่างน้อย 1 รายการ', 'error');
        return;
    }
    document.getElementById('box-' + id).remove();
    updateBoxNumbers();
}

function updateBoxNumbers() {
    document.querySelectorAll('.student-box').forEach((box, i) => {
        box.querySelector('.box-number').textContent = i + 1;
    });
}

function toggleBox(id) {
    const box = document.getElementById('box-' + id);
    const content = box.querySelector('.box-content');
    const toggle = box.querySelector('.box-toggle');
    const isCollapsed = content.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', isCollapsed);
    // Update preview name when collapsing
    if (isCollapsed) {
        const nameVal = box.querySelector('.field-name').value;
        const preview = box.querySelector('.preview-name');
        preview.textContent = nameVal ? `— ${nameVal}` : '';
    }
}

function buildBoxHTML(id) {
    return `
    <div class="box-header" onclick="toggleBox(${id})">
        <span class="box-number">${document.querySelectorAll('.student-box').length + 1}</span>
        <span class="box-title">นักเรียน <span class="preview-name"></span></span>
        <button class="box-toggle" title="ย่อ/ขยาย">▼</button>
        <button class="box-remove" onclick="event.stopPropagation();removeStudentBox(${id})" title="ลบ">✕</button>
    </div>
    <div class="box-content">
        <div class="form-group">
            <label>รหัสประจำตัวนักเรียน <span class="required">*</span></label>
            <input type="text" class="field-studentId" placeholder="เช่น 21067" inputmode="numeric" autocomplete="off">
            <div class="form-hint">กรอกเลข 5 หลัก</div>
            <div class="error-msg">กรุณากรอกรหัสประจำตัว</div>
        </div>

        <div class="form-group" style="position:relative">
            <label>ชื่อ - สกุล ผู้มาสาย <span class="required">*</span></label>
            <input type="text" class="field-name" placeholder="พิมพ์ชื่อเพื่อค้นหา..." autocomplete="off">
            <div class="name-suggestions"></div>
            <div class="error-msg">กรุณากรอกชื่อ - สกุล</div>
        </div>

        <div class="field-row">
            <div class="form-group">
                <label>ชั้น <span class="required">*</span></label>
                <select class="field-class">
                    <option value="">เลือก</option>
                    <option value="ม.1">ม.1</option><option value="ม.2">ม.2</option>
                    <option value="ม.3">ม.3</option><option value="ม.4">ม.4</option>
                    <option value="ม.5">ม.5</option><option value="ม.6">ม.6</option>
                </select>
                <div class="error-msg">เลือกชั้น</div>
            </div>
            <div class="form-group">
                <label>ห้อง <span class="required">*</span></label>
                <select class="field-room">
                    <option value="">เลือก</option>
                    ${Array.from({length:16},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
                </select>
                <div class="error-msg">เลือกห้อง</div>
            </div>
            <div class="form-group">
                <label>เลขที่ <span class="required">*</span></label>
                <select class="field-number">
                    <option value="">เลือก</option>
                    ${Array.from({length:45},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
                </select>
                <div class="error-msg">เลือกเลขที่</div>
            </div>
        </div>

        <div class="form-group">
            <label>สาย - เฉื่อย <span class="required">*</span></label>
            <div class="radio-group radio-type">
                ${FORM_TYPES.map(t => `<label class="radio-item"><input type="radio" name="type-${id}" value="${t}"> ${t}</label>`).join('')}
            </div>
            <input type="text" class="other-text type-other-text" placeholder="ระบุ อื่นๆ...">
            <input type="text" class="other-text no-assembly-text" placeholder="ระบุเหตุผลที่ไม่เข้าแถว (เช่น อยู่ในห้อง)...">
            <div class="error-msg">กรุณาเลือกประเภทหรือระบุเหตุผลให้ครบถ้วน</div>
        </div>

        <div class="form-group">
            <label>รายการผิดระเบียบ</label>
            <div class="checkbox-group violations-group">
                ${FORM_VIOLATIONS.map(v => `<label class="checkbox-item"><input type="checkbox" value="${v}"> ${v}</label>`).join('')}
            </div>
            <input type="text" class="other-text violations-other-text" placeholder="ระบุรายการผิดระเบียบ อื่นๆ...">
            <div class="error-msg">กรุณาระบุรายการผิดระเบียบอื่นๆ</div>
        </div>
    </div>`;
}

// ===== Box Event Initialization =====
function initBoxEvents(id) {
    const box = document.getElementById('box-' + id);

    // --- Student ID auto-fill ---
    const idField = box.querySelector('.field-studentId');
    idField.addEventListener('input', async () => {
        const val = idField.value.trim();
        if (!isAutoFillOn() || !val) return;
        try {
            const res = await fetch(`/api/students/search?q=${encodeURIComponent(val)}`);
            const json = await res.json();
            if (json.success && json.results.length > 0) {
                const student = json.results.find(s => s.studentId === val);
                if (student && box.dataset.lastAutoFillId !== val) {
                    applyAutoFill(box, student);
                }
            }
        } catch (e) { console.error('Auto-fill fetch error', e); }
    });

    // --- Name search & suggestions ---
    const nameField = box.querySelector('.field-name');
    const sugBox = box.querySelector('.name-suggestions');
    let sugTimeout = null;

    nameField.addEventListener('input', () => {
        clearTimeout(sugTimeout);
        const q = nameField.value.trim();
        if (q.length < 1) { sugBox.classList.remove('open'); sugBox.innerHTML = ''; return; }
        sugTimeout = setTimeout(() => renderNameSuggestions(box, q), 150);
    });
    nameField.addEventListener('focus', () => {
        const q = nameField.value.trim();
        if (q.length >= 1) renderNameSuggestions(box, q);
    });
    nameField.addEventListener('blur', () => {
        setTimeout(() => { sugBox.classList.remove('open'); }, 200);
    });
    sugBox.addEventListener('mousedown', async (e) => {
        // mousedown to fire before blur
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        const sid = item.dataset.studentId;
        try {
            const res = await fetch(`/api/students/search?q=${encodeURIComponent(sid)}`);
            const json = await res.json();
            if (json.success && json.results.length > 0) {
                const student = json.results.find(s => s.studentId === sid);
                if (student) {
                    applyAutoFill(box, student);
                }
            }
        } catch (e) { console.error('Suggestion click fetch error', e); }
        sugBox.classList.remove('open');
    });

    // --- Radio styling ---
    box.querySelectorAll('.radio-item input').forEach(radio => {
        radio.addEventListener('change', () => {
            box.querySelectorAll('.radio-item').forEach(r => r.classList.remove('selected'));
            radio.closest('.radio-item').classList.add('selected');
            const otherText = box.querySelector('.type-other-text');
            const noAssemblyText = box.querySelector('.no-assembly-text');
            otherText.classList.toggle('visible', radio.value === 'อื่นๆ');
            if (noAssemblyText) noAssemblyText.classList.toggle('visible', radio.value === 'ไม่เข้าแถวหน้าเสาธง');
        });
    });

    // --- Checkbox styling + "อื่นๆ" logic ---
    box.querySelectorAll('.violations-group input').forEach(cb => {
        cb.addEventListener('change', () => {
            cb.closest('.checkbox-item').classList.toggle('selected', cb.checked);
            const otherText = box.querySelector('.violations-other-text');
            const otherCb = box.querySelector('.violations-group input[value="อื่นๆ"]');
            otherText.classList.toggle('visible', otherCb && otherCb.checked);
        });
    });
}

async function renderNameSuggestions(box, query) {
    const sugBox = box.querySelector('.name-suggestions');
    const q = query.trim();
    if (!q) { sugBox.innerHTML = ''; sugBox.classList.remove('open'); return; }
    try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        const results = json.success ? json.results : [];
        if (results.length === 0) {
            sugBox.innerHTML = '<div style="padding:12px;color:#9aa0a6;font-size:0.85rem;">ไม่พบข้อมูล</div>';
        } else {
            sugBox.innerHTML = results.map(s =>
                `<div class="suggestion-item" data-student-id="${s.studentId}">
                    <span class="s-name">${esc(s.name)}</span>
                    <span class="s-meta">ม.${s.class}/${s.room} เลขที่${s.number} (${s.studentId})</span>
                </div>`
            ).join('');
        }
        sugBox.classList.add('open');
    } catch (e) {
        console.error('Search error', e);
    }
}

function applyAutoFill(box, student) {
    box.dataset.lastAutoFillId = student.studentId;
    box.querySelector('.field-studentId').value = student.studentId;
    box.querySelector('.field-name').value = student.name;
    box.querySelector('.field-class').value = 'ม.' + student.class;
    box.querySelector('.field-room').value = student.room;
    box.querySelector('.field-number').value = student.number;
    // Update preview
    box.querySelector('.preview-name').textContent = `— ${student.name}`;
    // Clear errors
    box.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
}

function isAutoFillOn() {
    return document.getElementById('autofill-toggle').checked;
}

// ===== Form Submission =====
async function submitForm() {
    if (!validatePage1()) { goToPage(1); return; }
    const boxes = document.querySelectorAll('.student-box');
    if (boxes.length === 0) { showToast('กรุณาเพิ่มนักเรียนอย่างน้อย 1 คน', 'error'); return; }

    // Validate all boxes
    let allValid = true;
    let firstErrorBox = null;
    boxes.forEach(box => {
        if (!validateBox(box)) {
            allValid = false;
            if (!firstErrorBox) firstErrorBox = box;
            // Expand collapsed box
            const content = box.querySelector('.box-content');
            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                box.querySelector('.box-toggle').classList.remove('collapsed');
            }
        }
    });
    if (!allValid) {
        firstErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        return;
    }

    // Build rows
    const dateRaw = document.getElementById('form-date').value;
    const dateParts = dateRaw.split('-');
    // Convert CE year to Buddhist Era (+543), prefix ' so Sheets treats as text
    const beYear = parseInt(dateParts[0]) + 543;
    const dateFormatted = `'${parseInt(dateParts[2])}/${parseInt(dateParts[1])}/${beYear}`;
    const inspector = document.getElementById('inspector-input').value.trim();

    const headers = FORM_COLUMNS.map(c => c.header);
    const rows = [];
    // Force Bangkok timezone (server may not be in Thailand)
    // Use พ.ศ. year, prefix ' so Sheets won't parse 2569 as AD date serial
    const now = new Date();
    const bangkokStr = now.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false });
    // bangkokStr = "DD/MM/YYYY, HH:MM:SS"
    const [datePart, timePart] = bangkokStr.split(', ');
    const [dd, mm, yyyy] = datePart.split('/');
    const beTimestampYear = parseInt(yyyy) + 543;
    const timestamp = `'${dd}/${mm}/${beTimestampYear} ${timePart}`;

    boxes.forEach(box => {
        const studentId = box.querySelector('.field-studentId').value.trim();
        const name = box.querySelector('.field-name').value.trim();
        const cls = box.querySelector('.field-class').value;
        const room = box.querySelector('.field-room').value;
        const number = box.querySelector('.field-number').value;

        const typeRadio = box.querySelector('.radio-type input:checked');
        let typeVal = typeRadio ? typeRadio.value : '';
        if (typeVal === 'อื่นๆ') typeVal = box.querySelector('.type-other-text').value.trim() || 'อื่นๆ';

        const checkedViolations = [];
        box.querySelectorAll('.violations-group input:checked').forEach(cb => {
            if (cb.value === 'อื่นๆ') {
                const otherVal = box.querySelector('.violations-other-text').value.trim();
                checkedViolations.push(otherVal || 'อื่นๆ');
            } else {
                checkedViolations.push(cb.value);
            }
        });
        
        if (typeVal === 'ไม่เข้าแถวหน้าเสาธง') {
            const reason = box.querySelector('.no-assembly-text').value.trim();
            typeVal = 'อื่นๆ';
            checkedViolations.unshift(`ไม่เข้าแถวหน้าเสาธง (${reason})`);
        }

        const violations = checkedViolations.join(', ');

        const dataMap = { timestamp, dateFormatted, inspector, studentId, name, cls, room, number, typeVal, violations };
        const row = FORM_COLUMNS.map(c => dataMap[c.source] !== undefined ? dataMap[c.source] : '');
        rows.push(row);
    });

    // Submit
    showLoading(true);
    try {
        const sources = FORM_COLUMNS.map(c => c.source);
        const res = await fetch('/api/inert/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers, sources, rows })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✓ ส่งข้อมูลสำเร็จ ${data.count} รายการ`, 'success');
            // Reset page 2 boxes only (keep page 1 date + inspector)
            document.getElementById('student-boxes').innerHTML = '';
            boxCounter = 0;
            addStudentBox();
            // Go back to page 1
            goToPage(1);
        } else {
            showToast('เกิดข้อผิดพลาด: ' + (data.message || ''), 'error');
        }
    } catch (e) {
        showToast('ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่', 'error');
        console.error(e);
    }
    showLoading(false);
}

function validateBox(box) {
    let valid = true;
    const fields = [
        { sel: '.field-studentId', grp: true },
        { sel: '.field-name', grp: true },
        { sel: '.field-class', grp: true },
        { sel: '.field-room', grp: true },
        { sel: '.field-number', grp: true },
    ];
    fields.forEach(f => {
        const el = box.querySelector(f.sel);
        const grp = el.closest('.form-group');
        const empty = !el.value.trim();
        grp.classList.toggle('error', empty);
        if (empty) valid = false;
    });
    // Radio (type)
    const typeChecked = box.querySelector('.radio-type input:checked');
    const typeGrp = box.querySelector('.radio-type').closest('.form-group');
    typeGrp.classList.toggle('error', !typeChecked);
    if (!typeChecked) valid = false;
    if (typeChecked && typeChecked.value === 'อื่นๆ') {
        const otherVal = box.querySelector('.type-other-text').value.trim();
        if (!otherVal) { typeGrp.classList.add('error'); valid = false; }
    }
    if (typeChecked && typeChecked.value === 'ไม่เข้าแถวหน้าเสาธง') {
        const noAssemblyVal = box.querySelector('.no-assembly-text').value.trim();
        if (!noAssemblyVal) { typeGrp.classList.add('error'); valid = false; }
    }
    // Violations (Optional now)
    const violGrp = box.querySelector('.violations-group').closest('.form-group');
    violGrp.classList.remove('error');
    if (box.querySelector('.violations-group input[value="อื่นๆ"]')?.checked) {
        const otherVal = box.querySelector('.violations-other-text').value.trim();
        if (!otherVal) { violGrp.classList.add('error'); valid = false; }
    }
    return valid;
}

// ===== Utilities =====
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('show', show);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Set today's date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('form-date').value = `${yyyy}-${mm}-${dd}`;

    loadData();
});
