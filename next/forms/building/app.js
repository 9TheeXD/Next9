// ===== Building Form Application v2 =====

let inspectorsData = [];
let selectedBuilding = "";
let roomData = null;
let roomFiles = {}; 
// roomFiles[room] = { overall: [...], issues: { "0": [...], "1": [...] } }
let currentPhotoRoom = null;
let currentPhotoTarget = null; // 'overall' or issue index '0', '1', etc.
let currentGridRoom = null;
let currentGridTarget = null;
let currentDeleteRoom = null;
let currentDeleteTarget = null;
let currentDeleteIndex = null;

let CHECKLIST_ITEMS = [];
let BUILDINGS = [];
let pendingUploads = 0;
let currentPage = 1;

// ===== Data Loading =====
async function loadData() {
    showLoading(true);
    try {
        const configRes = await fetch('/api/building/config_v2');
        const configData = await configRes.json();
        if (configData.success) {
            CHECKLIST_ITEMS = configData.config.ITEMS;
            BUILDINGS = configData.config.BUILDINGS;
        }

        const inspectorsRes = await fetch('/inspectors.json');
        inspectorsData = await inspectorsRes.json();
        initInspectorSelect();
        initBuildingRadios();
        initEvents();

        const stateStr = sessionStorage.getItem('buildingAutoUpdateState');
        if (stateStr) {
            try {
                const st = JSON.parse(stateStr);
                if (st.date) document.getElementById('form-date').value = st.date;
                if (st.inspector1) document.getElementById('inspector-input-1').value = st.inspector1;
                if (st.inspector2) document.getElementById('inspector-input-2').value = st.inspector2;
                if (st.building) {
                    const b = document.querySelector(`input[name="building"][value="${st.building}"]`);
                    if (b) b.checked = true;
                }
                if (st.intendedVersion) {
                    setTimeout(() => showToast('อัปเดทระบบเรียบร้อย!', 'success', true), 500);
                }
            } catch(e) {}
            sessionStorage.removeItem('buildingAutoUpdateState');
        }
    } catch (e) {
        showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
        console.error(e);
    }
    showLoading(false);
}

// ===== Page Navigation =====
async function goToPage(page) {
    if (page === 2) {
        if (!validatePage1()) return;
        selectedBuilding = document.querySelector('input[name="building"]:checked').value;
        const success = await loadRooms(selectedBuilding);
        if (!success) return;
    }
    document.querySelectorAll('.form-page').forEach(p => p.classList.remove('active'));
    document.getElementById('page' + page).classList.add('active');
    currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validatePage1() {
    let valid = true;
    const date = document.getElementById('form-date');
    const buildingChecked = document.querySelector('input[name="building"]:checked');
    const inspector1 = document.getElementById('inspector-input-1');
    const grpDate = document.getElementById('grp-date');
    const grpInsp1 = document.getElementById('grp-inspector1');
    const grpBldg = document.getElementById('grp-building');

    grpDate.classList.toggle('error', !date.value);
    grpInsp1.classList.toggle('error', !inspector1.value.trim());
    grpBldg.classList.toggle('error', !buildingChecked);

    if (!date.value || !inspector1.value.trim() || !buildingChecked) valid = false;
    return valid;
}

// ===== Inspector Searchable Select =====
function initInspectorSelect() {
    function setupDropdown(inputId, dropdownId, grpId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);

        function render(filter = '') {
            const q = filter.toLowerCase();
            const filtered = q
                ? inspectorsData.filter(n => n.toLowerCase().includes(q))
                : inspectorsData;
            dropdown.innerHTML = '';
            filtered.forEach(name => {
                const div = document.createElement('div');
                div.className = 'select-option';
                div.dataset.value = name;
                div.textContent = name;
                dropdown.appendChild(div);
            });
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
                if (grpId) document.getElementById(grpId).classList.remove('error');
            }
        });
    }

    setupDropdown('inspector-input-1', 'inspector-dropdown-1', 'grp-inspector1');
    setupDropdown('inspector-input-2', 'inspector-dropdown-2', null);
    setupDropdown('inspector-input-3', 'inspector-dropdown-3', null);
}

function initBuildingRadios() {
    const container = document.getElementById('building-radios');
    container.innerHTML = '';
    BUILDINGS.forEach(b => {
        const label = document.createElement('label');
        label.className = 'radio-item';
        
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'building';
        input.value = b;
        
        input.addEventListener('change', () => {
            document.querySelectorAll('#building-radios .radio-item').forEach(l => l.classList.remove('selected'));
            label.classList.add('selected');
            document.getElementById('grp-building').classList.remove('error');
        });
        
        label.appendChild(input);
        label.appendChild(document.createTextNode(` อาคาร ${b}`));
        container.appendChild(label);
    });
}

async function loadRooms(building) {
    showLoading(true);
    try {
        const res = await fetch(`rooms/${building}.json?t=${Date.now()}`);
        if (!res.ok) throw new Error('Failed to load rooms');
        roomData = await res.json();
        renderRooms();
        showLoading(false);
        return true;
    } catch (e) {
        showLoading(false);
        showToast(`ไม่พบข้อมูลห้องของอาคาร ${building}`, 'error');
        console.error(e);
        return false;
    }
}

function renderRooms() {
    const container = document.getElementById('room-cards');
    container.innerHTML = '';
    
    document.getElementById('building-info').textContent = `อาคาร ${selectedBuilding} - กรุณาประเมินความเรียบร้อย`;

    let firstRoom = true;
    for (const floor in roomData) {
        const floorHeader = document.createElement('div');
        floorHeader.className = 'floor-header';
        
        const floorText = document.createElement('div');
        floorText.className = 'floor-header-text';
        floorText.textContent = `ชั้น ${floor}`;
        
        floorHeader.appendChild(floorText);
        
        container.appendChild(floorHeader);

        roomData[floor].forEach(room => {
            if (!roomFiles[room]) roomFiles[room] = { overall: [], issues: {} };
            
            const box = document.createElement('div');
            box.className = 'room-box';
            box.dataset.room = room;
            box.dataset.floor = floor;
            box.id = `room-box-${room}`;
            
            const isCollapsed = !firstRoom;
            
            let checklistHTML = '';
            CHECKLIST_ITEMS.forEach((itemText, idx) => {
                checklistHTML += `
                    <div class="checklist-item-v2">
                        <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;">
                            <input type="checkbox" name="room-${room}-item-${idx}" value="${idx}" onchange="handleCheckboxChange('${room}')">
                            <span>${itemText}</span>
                        </label>
                        <button type="button" class="photo-upload-btn small-btn" id="btn-photo-${room}-${idx}" onclick="openPhotoModal('${room}', '${idx}')" style="display: none; padding: 6px; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; background: #f8f9fa;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            <span style="font-size: 0.8rem; margin-left:4px; color: #d32f2f;">ใส่รูป</span>
                        </button>
                    </div>
                    <div id="photo-preview-${room}-${idx}" style="display: none; gap: 8px; flex-wrap: wrap; margin-left: 28px; margin-bottom: 8px;"></div>
                `;
            });

            box.innerHTML = `
                <div class="room-header" onclick="toggleBox('${room}')">
                    <div class="room-number-badge">${room}</div>
                    <span class="room-title">ห้อง ${room}</span>
                    <span class="room-status-badge badge-none" id="status-badge-${room}">ไม่ได้ตรวจ</span>
                    <button class="room-toggle ${isCollapsed ? 'collapsed' : ''}" id="toggle-${room}">▼</button>
                </div>
                <div class="room-content ${isCollapsed ? 'collapsed' : ''}" id="content-${room}">
                    
                    <div class="main-action-area" style="margin-bottom: 16px;">
                        <button type="button" class="btn btn-perfect-toggle" id="btn-perfect-${room}" onclick="togglePerfect('${room}')">
                            <i class="fas fa-check-circle" style="margin-right: 6px;"></i> เรียบร้อย
                        </button>
                    </div>

                    <div class="checklist-container-v2" id="checklist-container-${room}">
                        <div style="font-size: 0.9rem; color: #5f6368; margin-bottom: 8px; font-weight: 500;">ระบุจุดที่ไม่เรียบร้อย (บังคับใส่รูปเมื่อติ๊ก)</div>
                        ${checklistHTML}
                    </div>
                    
                    <div class="form-group note-container" style="margin-top: 16px; border-top: 1px dashed #dadce0; padding-top: 16px;">
                        <label style="font-weight: 500; font-size: 1rem; color: #202124; display: flex; flex-direction: column;">
                            <span>ความสะอาดโดยรวม <span class="required">*</span></span>
                            <span style="font-size: 0.8rem; color: #5f6368; font-weight: 400; margin-top: 4px;">(บังคับถ่ายรูป 1 รูป หากมีการประเมินห้องนี้)</span>
                        </label>
                        <div style="display: flex; gap: 8px; align-items: flex-start; margin-top: 8px;">
                            <button type="button" class="photo-upload-btn btn-overall-photo" onclick="openPhotoModal('${room}', 'overall')" style="flex: 1; padding: 12px; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; background: #f8f9fa; display: flex; align-items: center; justify-content: center; gap: 8px; color: #1a73e8; font-weight: 500;">
                                <i class="fas fa-camera"></i> ถ่ายภาพ / อัปโหลด
                            </button>
                        </div>
                        <div id="photo-preview-${room}-overall" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;"></div>
                    </div>
                </div>
            `;
            
            container.appendChild(box);
            firstRoom = false;
        });
    }

    // Restore photo previews
    for (const room in roomFiles) {
        renderPhotoPreviews(room, 'overall');
        for (const idx in roomFiles[room].issues) {
            renderPhotoPreviews(room, idx);
        }
        updateRoomStatusUI(room);
    }
}

function togglePerfect(room) {
    const btn = document.getElementById(`btn-perfect-${room}`);
    const checklistContainer = document.getElementById(`checklist-container-${room}`);
    const checkboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
    
    // Check if any checkbox is currently ticked. If yes, we can't click perfect.
    const hasTicked = Array.from(checkboxes).some(cb => cb.checked);
    if (hasTicked) return;

    btn.classList.toggle('active');
    const isPerfect = btn.classList.contains('active');
    
    if (isPerfect) {
        // Disable checkboxes
        checkboxes.forEach(cb => {
            cb.disabled = true;
            cb.closest('.checklist-item-v2').style.opacity = '0.5';
        });
    } else {
        // Enable checkboxes
        checkboxes.forEach(cb => {
            cb.disabled = false;
            cb.closest('.checklist-item-v2').style.opacity = '1';
        });
    }
    
    updateRoomStatusUI(room);
}

function handleCheckboxChange(room) {
    const btn = document.getElementById(`btn-perfect-${room}`);
    const checklistContainer = document.getElementById(`checklist-container-${room}`);
    const checkboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
    
    const hasTicked = Array.from(checkboxes).some(cb => cb.checked);
    
    if (hasTicked) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
    
    // Toggle photo buttons for each checkbox
    checkboxes.forEach((cb) => {
        const idx = cb.value;
        const photoBtn = document.getElementById(`btn-photo-${room}-${idx}`);
        const previewDiv = document.getElementById(`photo-preview-${room}-${idx}`);
        if (cb.checked) {
            photoBtn.style.display = 'flex';
            previewDiv.style.display = 'flex';
        } else {
            photoBtn.style.display = 'none';
            previewDiv.style.display = 'none';
        }
    });

    updateRoomStatusUI(room);
}

function updateRoomStatusUI(room) {
    const btnPerfect = document.getElementById(`btn-perfect-${room}`);
    const checklistContainer = document.getElementById(`checklist-container-${room}`);
    const checkboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
    const badge = document.getElementById(`status-badge-${room}`);
    
    if(!badge) return;

    const isPerfect = btnPerfect.classList.contains('active');
    const hasTicked = Array.from(checkboxes).some(cb => cb.checked);
    
    if (isPerfect) {
        badge.textContent = "เรียบร้อย";
        badge.className = "room-status-badge badge-perfect";
    } else if (hasTicked) {
        badge.textContent = "ไม่เรียบร้อย";
        badge.className = "room-status-badge badge-bad";
    } else {
        badge.textContent = "ไม่ได้ตรวจ";
        badge.className = "room-status-badge badge-none";
    }
}

// ===== Image Compression =====
function compressImage(file, maxRes = 1080) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxRes) {
                    height *= maxRes / width;
                    width = maxRes;
                }
            } else {
                if (height > maxRes) {
                    width *= maxRes / height;
                    height = maxRes;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Canvas toBlob failed"));
                    return;
                }
                const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                    type: "image/jpeg",
                    lastModified: Date.now()
                });
                resolve(newFile);
            }, "image/jpeg", 0.8);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// ===== Photo Upload Logic =====
function openPhotoModal(room, target) {
    currentPhotoRoom = room;
    currentPhotoTarget = target;
    document.getElementById('photo-options-modal').style.display = 'flex';
}

function closePhotoModal() {
    document.getElementById('photo-options-modal').style.display = 'none';
}

function triggerCamera() {
    document.getElementById('global-camera-input').click();
    closePhotoModal();
}

function triggerGallery() {
    document.getElementById('global-gallery-input').click();
    closePhotoModal();
}

async function handleGlobalPhotoSelect(input) {
    if (currentPhotoRoom && currentPhotoTarget) {
        const room = currentPhotoRoom;
        const target = currentPhotoTarget;
        
        for (let i = 0; i < input.files.length; i++) {
            const originalFile = input.files[i];
            
            let processedFile = originalFile;
            if (originalFile.type.startsWith('image/')) {
                try {
                    processedFile = await compressImage(originalFile, 1080);
                } catch(e) {
                    console.error("Compression failed, using original", e);
                }
            }
            
            const fileObj = {
                id: Date.now() + Math.random().toString(),
                file: processedFile,
                url: null,
                status: "uploading"
            };
            
            if (target === 'overall') {
                roomFiles[room].overall.push(fileObj);
            } else {
                if (!roomFiles[room].issues[target]) roomFiles[room].issues[target] = [];
                roomFiles[room].issues[target].push(fileObj);
            }
            
            uploadFileObj(room, target, fileObj);
        }
        
        input.value = '';
        renderPhotoPreviews(room, target);
    }
}

function removePhoto(room, target, index) {
    let list = target === 'overall' ? roomFiles[room].overall : roomFiles[room].issues[target];
    if (list && list[index]) {
        const fileObj = list[index];
        list.splice(index, 1);
        renderPhotoPreviews(room, target);
        
        if (fileObj.status === "done" && fileObj.url) {
            fetch("/api/building/delete_image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: fileObj.url })
            }).catch(e => console.error("delete error", e));
        } else if (fileObj.status === "uploading") {
            fileObj.status = "cancelled";
        }
        
        showToast("ลบรูปภาพเรียบร้อย", "success");
    }
}

function renderPhotoPreviews(room, target) {
    const previewContainer = document.getElementById(`photo-preview-${room}-${target}`);
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    
    let list = target === 'overall' ? (roomFiles[room]?.overall || []) : (roomFiles[room]?.issues[target] || []);
    
    if (list.length > 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.style.width = '100%';
        btn.style.padding = '8px';
        btn.style.background = '#f8f9fa';
        btn.style.border = '1px solid #dadce0';
        btn.style.borderRadius = '6px';
        btn.style.fontFamily = "'Prompt', sans-serif";
        btn.style.color = '#202124';
        btn.style.cursor = 'pointer';
        
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> ดูภาพที่อัปโหลด (${list.length} รูป)`;
        btn.onclick = () => openPhotoGridModal(room, target);
        previewContainer.appendChild(btn);
    }
}

function openPhotoGridModal(room, target) {
    currentGridRoom = room;
    currentGridTarget = target;
    const container = document.getElementById('photo-grid-container');
    container.innerHTML = '';
    
    let list = target === 'overall' ? (roomFiles[room]?.overall || []) : (roomFiles[room]?.issues[target] || []);
    
    if (list && list.length > 0) {
        list.forEach((fileObj, index) => {
            const wrap = document.createElement('div');
            wrap.style.position = 'relative';
            wrap.style.width = '100%';
            wrap.style.paddingTop = '100%';
            wrap.style.borderRadius = '8px';
            wrap.style.border = '1px solid #dadce0';
            wrap.style.overflow = 'hidden';
            wrap.style.background = '#000';
            
            const img = document.createElement('img');
            img.src = URL.createObjectURL(fileObj.file);
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.cursor = 'pointer';
            img.onclick = () => {
                imgs = list.map(fObj => URL.createObjectURL(fObj.file));
                openLB(index);
            };
            
            const btn = document.createElement('button');
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>';
            btn.style.position = 'absolute';
            btn.style.top = '4px';
            btn.style.right = '4px';
            btn.style.background = 'rgba(255,255,255,0.9)';
            btn.style.color = '#d32f2f';
            btn.style.border = '1px solid #dadce0';
            btn.style.borderRadius = '4px';
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            btn.onclick = (e) => {
                e.stopPropagation();
                confirmDeletePhoto(room, target, index);
            };
            
            wrap.appendChild(img);
            wrap.appendChild(btn);
            container.appendChild(wrap);
        });
    } else {
        container.innerHTML = '<div style="color: #5f6368; text-align: center; grid-column: 1 / -1; padding: 20px;">ไม่มีรูปภาพ</div>';
    }
    
    document.getElementById('photo-grid-modal').style.display = 'flex';
}

function closePhotoGridModal() {
    currentGridRoom = null;
    currentGridTarget = null;
    document.getElementById('photo-grid-modal').style.display = 'none';
}

function confirmDeletePhoto(room, target, index) {
    currentDeleteRoom = room;
    currentDeleteTarget = target;
    currentDeleteIndex = index;
    document.getElementById('confirm-delete-modal').style.display = 'flex';
    document.getElementById('btn-confirm-delete').onclick = () => {
        const r = currentDeleteRoom;
        const t = currentDeleteTarget;
        removePhoto(r, t, currentDeleteIndex);
        closeConfirmDeleteModal();
        openPhotoGridModal(r, t);
    };
}

function closeConfirmDeleteModal() {
    currentDeleteRoom = null;
    currentDeleteTarget = null;
    currentDeleteIndex = null;
    document.getElementById('confirm-delete-modal').style.display = 'none';
}

async function uploadFileObj(room, target, fileObj) {
    pendingUploads++;
    updateUploadOverlay();
    
    try {
        const fd = new FormData();
        const ext = fileObj.file.name.split('.').pop() || "jpg";
        const filename = `img_b${selectedBuilding}_r${room}_t${target}_${fileObj.id}.${ext}`;
        fd.append("image", fileObj.file, filename);
        
        const res = await fetch("/api/building/upload_image", {
            method: "POST",
            body: fd
        });
        const data = await res.json();
        
        if (fileObj.status === "cancelled") {
            if (data.success) {
                fetch("/api/building/delete_image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: data.url })
                }).catch(e => console.error(e));
            }
        } else if(data.success) {
            fileObj.url = data.url;
            fileObj.status = "done";
        } else {
            console.error("Upload failed", data.message);
            fileObj.status = "failed";
            showToast("อัปโหลดรูปไม่สำเร็จ", "error");
        }
    } catch(e) {
        console.error("Upload error", e);
        if (fileObj.status !== "cancelled") fileObj.status = "failed";
        showToast("เกิดข้อผิดพลาดในการอัปโหลด", "error");
    } finally {
        pendingUploads--;
        updateUploadOverlay();
    }
}

let pendingUploadToastHide = null;

function updateUploadOverlay() {
    const overlay = document.getElementById("uploadOverlay");
    const statusText = document.getElementById("uploadStatusText");
    const spinner = overlay ? overlay.querySelector(".spinner") : null;
    if (!overlay || !statusText) return;
    
    if (pendingUploads > 0) {
        overlay.style.display = "flex";
        document.body.classList.add('has-upload-overlay');
        statusText.textContent = `กำลังอัปโหลดภาพ (${pendingUploads})`;
        if (spinner) spinner.style.display = "inline-block";
    } else {
        if (overlay.style.display === "flex") {
            statusText.textContent = "อัปโหลดภาพเรียบร้อย";
            if (spinner) spinner.style.display = "none";
            setTimeout(() => {
                if (pendingUploads === 0) {
                    overlay.style.display = "none";
                    document.body.classList.remove('has-upload-overlay');
                    if (pendingUploadToastHide) {
                        pendingUploadToastHide();
                        pendingUploadToastHide = null;
                    }
                }
            }, 2000);
        }
    }
}

function toggleBox(room) {
    const content = document.getElementById(`content-${room}`);
    const toggle = document.getElementById(`toggle-${room}`);
    const isCollapsed = content.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', isCollapsed);
}

function initEvents() {
    document.getElementById('btn-next').addEventListener('click', () => goToPage(2));
    document.getElementById('btn-back').addEventListener('click', () => {
        document.getElementById('confirm-back-modal').style.display = 'flex';
    });
    document.getElementById('btn-confirm-back').addEventListener('click', () => {
        document.getElementById('confirm-back-modal').style.display = 'none';
        
        for (const room in roomFiles) {
            (roomFiles[room].overall || []).forEach(f => {
                if (f.status === 'done' && f.url) {
                    fetch("/api/building/delete_image", {
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: f.url })
                    }).catch(e => {});
                }
            });
            for (const idx in roomFiles[room].issues) {
                (roomFiles[room].issues[idx] || []).forEach(f => {
                    if (f.status === 'done' && f.url) {
                        fetch("/api/building/delete_image", {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: f.url })
                        }).catch(e => {});
                    }
                });
            }
        }
        
        roomFiles = {};
        document.getElementById('room-cards').innerHTML = '';
        goToPage(1);
    });
    document.getElementById('btn-submit').addEventListener('click', submitForm);
}

async function submitForm() {
    if (pendingUploads > 0) {
        if (!pendingUploadToastHide) {
            pendingUploadToastHide = showToast('กำลังอัปโหลดรูปภาพ กรุณารอสักครู่...', 'warning', { autoClose: false, showCloseBtn: false });
        }
        return;
    }

    const date = document.getElementById('form-date').value;
    const dateParts = date.split('-');
    const dateFormatted = `${parseInt(dateParts[2])}/${parseInt(dateParts[1])}/${dateParts[0]}`;
    
    const ins1 = document.getElementById('inspector-input-1').value.trim();
    const ins2 = document.getElementById('inspector-input-2').value.trim();
    const ins3 = document.getElementById('inspector-input-3').value.trim();
    
    const roomsPayload = [];
    const boxes = document.querySelectorAll('.room-box');
    
    let hasError = false;
    let errorRoomId = null;

    boxes.forEach(box => {
        const room = box.dataset.room;
        const floor = box.dataset.floor;
        const isPerfect = document.getElementById(`btn-perfect-${room}`).classList.contains('active');
        
        const checklistContainer = document.getElementById(`checklist-container-${room}`);
        const checkboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
        const tickedItems = Array.from(checkboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));
        
        let status = 'ไม่ได้ตรวจ';
        if (isPerfect) status = 'เรียบร้อย';
        else if (tickedItems.length > 0) status = 'ไม่เรียบร้อย';

        if (status === 'ไม่ได้ตรวจ') return;

        const overallFiles = roomFiles[room]?.overall || [];
        const validOverall = overallFiles.filter(f => f.status === 'done' && f.url).map(f => f.url);

        if (validOverall.length === 0) {
            hasError = true;
            if(!errorRoomId) errorRoomId = room;
            showToast(`ห้อง ${room}: บังคับต้องมีรูปความสะอาดโดยรวม`, 'error');
        }

        const issuesPayload = [];
        tickedItems.forEach(idx => {
            const issueFiles = roomFiles[room]?.issues[idx] || [];
            const validIssuePhotos = issueFiles.filter(f => f.status === 'done' && f.url).map(f => f.url);
            if (validIssuePhotos.length === 0) {
                hasError = true;
                if(!errorRoomId) errorRoomId = room;
                showToast(`ห้อง ${room}: ลืมอัปโหลดรูปสำหรับจุดที่ไม่เรียบร้อย "${CHECKLIST_ITEMS[idx]}"`, 'error');
            } else {
                issuesPayload.push({
                    name: CHECKLIST_ITEMS[idx],
                    image_url: validIssuePhotos[0]
                });
            }
        });

        roomsPayload.push({ 
            room, 
            floor,
            status,
            overall_image_url: validOverall.length > 0 ? validOverall[0] : "",
            issues: issuesPayload
        });
    });
    
    if (hasError) {
        if (errorRoomId) {
            const el = document.getElementById(`room-box-${errorRoomId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                document.getElementById(`toggle-${errorRoomId}`).classList.remove('collapsed');
                document.getElementById(`content-${errorRoomId}`).classList.remove('collapsed');
                el.style.border = '2px solid #d32f2f';
                setTimeout(() => el.style.border = '', 3000);
            }
        }
        return;
    }
    
    if (roomsPayload.length === 0) {
        showToast('กรุณาประเมินอย่างน้อย 1 ห้องก่อนส่ง', 'error');
        return;
    }

    const payload = {
        date: dateFormatted,
        inspector1: ins1,
        inspector2: ins2,
        inspector3: ins3,
        building: selectedBuilding,
        rooms: roomsPayload
    };
    
    showLoading(true);
    try {
        const res = await fetch('/api/building/submit_v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`บันทึกข้อมูลสำเร็จ ${data.count} ห้อง`, 'success');
            roomFiles = {}; 
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

// ===== Utilities =====
function showToast(msg, type = '', optionsOrHasCloseBtn = true) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    let autoClose = true;
    let showCloseBtn = true;
    let duration = 5000;

    if (typeof optionsOrHasCloseBtn === 'object') {
        if (optionsOrHasCloseBtn.autoClose !== undefined) autoClose = optionsOrHasCloseBtn.autoClose;
        if (optionsOrHasCloseBtn.showCloseBtn !== undefined) showCloseBtn = optionsOrHasCloseBtn.showCloseBtn;
        if (optionsOrHasCloseBtn.duration !== undefined) duration = optionsOrHasCloseBtn.duration;
    } else {
        showCloseBtn = !!optionsOrHasCloseBtn;
    }

    if (type === 'error') {
        autoClose = false;
    }

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = msg;
    t.appendChild(textSpan);

    let timer;
    const hideToast = () => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    };

    if (showCloseBtn) {
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontSize = '1.8rem';
        closeBtn.style.lineHeight = '0.8';
        closeBtn.style.padding = '12px 16px';
        closeBtn.style.margin = '-12px -16px -12px 8px';
        closeBtn.style.opacity = '0.8';
        closeBtn.onclick = () => {
            clearTimeout(timer);
            hideToast();
        };
        t.appendChild(closeBtn);
    }

    container.prepend(t);
    
    void t.offsetWidth;
    t.classList.add('show');

    if (autoClose) {
        timer = setTimeout(hideToast, duration);
    }
    
    return hideToast;
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('show', show);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('form-date').value = `${yyyy}-${mm}-${dd}`;
    
    window.addEventListener('beforeunload', (e) => {
        if (currentPage === 2) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadData();
});


// --- Lightbox Logic (Exact from album) ---
let imgs = [];
let lbIdx = -1;
let lbZoom = 1;
let isPanning = false, startPanX = 0, startPanY = 0, lbPanX = 0, lbPanY = 0, initialDist = 0;

function $(id) { return document.getElementById(id); }

window.openLB = function(i, slideDir = 0) {
    if (!imgs[i]) return;
    lbIdx = i;
    $('lb').classList.add('active');
    document.body.style.overflow = 'hidden';

    lbZoom = 1; lbPanX = 0; lbPanY = 0;
    const btn = $('lbZoomBtn');
    if(btn) btn.innerHTML = '<i class="fas fa-search-plus"></i>';
    
    const img = $('lbImg');
    
    if (slideDir !== 0) {
        img.style.transition = 'none';
        img.style.transform = `translate(${slideDir * 100}vw, 0)`;
        img.style.opacity = '0';
        void img.offsetWidth;
        img.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease';
        img.style.transform = `translate(0, 0)`;
        img.style.opacity = '1';
    } else {
        updateZoom(false);
        img.style.opacity = '1';
    }

    img.src = imgs[i]; 
    $('lbCnt').textContent = (i+1)+' / '+imgs.length; 
    $('lb').classList.add('loading');
    
    // Remove loading state once image loads
    img.onload = () => $('lb').classList.remove('loading');
};

window.closeLB = function(){ 
    $('lb').classList.remove('active','loading'); 
    document.body.style.overflow = ''; 
    lbIdx = -1; 
    $('lbImg').style.opacity = '0';
    resetZoom();
};

window.navLB = function(d){ 
    if (imgs.length <= 1) return;
    let n = lbIdx + d; 
    if(n < 0) n = imgs.length - 1; 
    if(n >= imgs.length) n = 0;
    
    const img = $('lbImg');
    img.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 1, 1), opacity 0.3s ease';
    img.style.transform = `translate(${d * -50}vw, 0)`;
    img.style.opacity = '0';
    
    setTimeout(() => {
        openLB(n, d);
    }, 250);
};

document.addEventListener('keydown', e => { 
    if(lbIdx === -1) return; 
    if(e.key === 'Escape') closeLB(); 
    if(e.key === 'ArrowLeft') navLB(-1); 
    if(e.key === 'ArrowRight') navLB(1); 
});

if ($('lb')) {
    $('lb').addEventListener('click', e => { 
        if(e.target === e.currentTarget || e.target.classList.contains('photos-lightbox-close')) closeLB(); 
    });
}

window.toggleZoom = function() {
    if(lbZoom > 1) {
        resetZoom();
    } else {
        lbZoom = 2;
        $('lbZoomBtn').innerHTML = '<i class="fas fa-search-minus"></i>';
    }
    updateZoom(true);
};

function resetZoom() {
    lbZoom = 1; lbPanX = 0; lbPanY = 0;
    const btn = $('lbZoomBtn');
    if(btn) btn.innerHTML = '<i class="fas fa-search-plus"></i>';
    updateZoom(false);
}

function updateZoom(animate) {
    const img = $('lbImg');
    if(img) {
        img.style.transition = animate ? 'transform 0.3s cubic-bezier(0.4, 0, 1, 1)' : 'none';
        img.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
    }
}

// Pinch to zoom & Pan on Image only
const lbImgEl = $('lbImg');
if(lbImgEl) {
    lbImgEl.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        } else if (e.touches.length === 1 && lbZoom > 1) {
            isPanning = true;
            startPanX = e.touches[0].clientX - lbPanX;
            startPanY = e.touches[0].clientY - lbPanY;
        }
    }, {passive: false});

    lbImgEl.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const scale = dist / initialDist;
            let newZoom = lbZoom * scale;
            newZoom = Math.max(1, Math.min(newZoom, 4));
            if(newZoom !== lbZoom) {
                lbZoom = newZoom;
                updateZoom(false);
                const btn = $('lbZoomBtn');
                if(btn) btn.innerHTML = lbZoom > 1 ? '<i class="fas fa-search-minus"></i>' : '<i class="fas fa-search-plus"></i>';
            }
            initialDist = dist;
        } else if (e.touches.length === 1 && isPanning && lbZoom > 1) {
            e.preventDefault();
            lbPanX = e.touches[0].clientX - startPanX;
            lbPanY = e.touches[0].clientY - startPanY;
            updateZoom(false);
        }
    }, {passive: false});

    lbImgEl.addEventListener('touchend', e => {
        isPanning = false;
        if (lbZoom <= 1) resetZoom();
    });

    // Mouse Pan
    lbImgEl.addEventListener('mousedown', e => {
        if(lbZoom > 1) {
            e.preventDefault();
            isPanning = true;
            startPanX = e.clientX - lbPanX;
            startPanY = e.clientY - lbPanY;
        }
    });
    window.addEventListener('mousemove', e => {
        if(isPanning) {
            lbPanX = e.clientX - startPanX;
            lbPanY = e.clientY - startPanY;
            updateZoom(false);
        }
    });
    window.addEventListener('mouseup', () => isPanning = false);
}

// ===== Auto Update Checker =====
let currentAppVersion = null;
async function checkAppUpdate() {
    try {
        const res = await fetch(`/server_start_time.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (currentAppVersion === null) {
            currentAppVersion = data.version;
            return;
        }

        if (data.version !== currentAppVersion) {
            if (currentPage === 1) {
                const state = {
                    date: document.getElementById('form-date').value,
                    inspector1: document.getElementById('inspector-input-1').value,
                    inspector2: document.getElementById('inspector-input-2').value,
                    building: document.querySelector('input[name="building"]:checked')?.value,
                    intendedVersion: data.version
                };
                sessionStorage.setItem('buildingAutoUpdateState', JSON.stringify(state));
                window.location.reload(true);
            }
        }
    } catch (e) {}
}
checkAppUpdate();
setInterval(checkAppUpdate, 5000);
