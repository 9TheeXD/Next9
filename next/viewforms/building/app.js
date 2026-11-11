// ===== View Forms Building Summary App =====

const API_URL = '/api/building/data_v2';
let rawData = [];
let allTopRooms = [];
let allBottomRooms = [];
let currentCalDate = new Date();
let calendarData = {};
let currentModalRooms = [];

// Lightbox state
let lbImgs = [];
let lbIndex = 0;
let lbZoom = 1;
let lbPanX = 0, lbPanY = 0;
let isPanning = false;
let startPanX = 0, startPanY = 0;
let initialDist = 0;
let isMousePanning = false;
let lbCurrentIssueId = null; 

function getFullImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return '/api/file/' + url;
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initEvents();
    fetchData();

    // Close modal on outside click
    const rankingModal = document.getElementById('ranking-modal');
    if (rankingModal) {
        rankingModal.addEventListener('click', (e) => {
            if (e.target.id === 'ranking-modal') closeRankingModal();
        });
    }

    const calModal = document.getElementById('calendar-modal');
    if (calModal) {
        calModal.addEventListener('click', (e) => {
            if (e.target.id === 'calendar-modal') closeCalendarModal();
        });
    }

    const sortSelect = document.getElementById('calendar-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            renderCalendarRoomList();
        });
    }

    document.getElementById('btn-prev-month').addEventListener('click', () => {
        currentCalDate.setMonth(currentCalDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('btn-next-month').addEventListener('click', () => {
        currentCalDate.setMonth(currentCalDate.getMonth() + 1);
        renderCalendar();
    });

    const calFilter = document.getElementById('calendar-filter-building');
    if (calFilter) {
        calFilter.addEventListener('change', () => {
            processCalendarData();
        });
    }

    initLightbox();
});

function initFilters() {
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(today.getMonth() - 1);
    
    document.getElementById('filter-date-end').valueAsDate = today;
    document.getElementById('filter-date-start').valueAsDate = lastMonth;
}

function initEvents() {
    document.getElementById('btn-search').addEventListener('click', () => {
        processDetailsData();
    });
    
    // Main tabs (Calendar / Details)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.dataset.target;
            document.getElementById(targetId).style.display = 'block';
        });
    });

    // Rank tabs (Top / Bottom rooms)
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.rank-tab-content').forEach(c => c.style.display = 'none');
            
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.dataset.target;
            document.getElementById(targetId).style.display = 'block';
        });
    });
}

function openRankingModal(type) {
    const modal = document.getElementById('ranking-modal');
    const title = document.getElementById('modal-title');
    
    if (type === 'top') {
        title.textContent = 'ห้องที่เรียบร้อยที่สุด (ทั้งหมด)';
        renderRoomList('modal-room-list', allTopRooms);
    } else {
        title.textContent = 'ห้องที่ต้องปรับปรุง (ทั้งหมด)';
        renderRoomList('modal-room-list', allBottomRooms);
    }
    
    modal.style.display = 'flex';
}

function closeRankingModal() {
    document.getElementById('ranking-modal').style.display = 'none';
}

async function fetchData() {
    showLoading(true);
    try {
        const res = await fetch(`${API_URL}?building=all&t=${Date.now()}`);
        const result = await res.json();
        
        if (result.success) {
            const mappedV1 = (result.v1Data || []).map(r => {
                return {
                    id: r.id,
                    date: r.date,
                    timestamp: r.timestamp || (r.date + 'T00:00:00Z'),
                    building: r.building,
                    room: r.room,
                    floor: r.floor,
                    inspector1: r.inspector1,
                    inspector2: r.inspector2,
                    inspector3: r.inspector3,
                    status: 'v1_legacy', 
                    score: r.total,
                    overall_image_url: r.image_url,
                    issues: []
                };
            });
            rawData = [...mappedV1, ...(result.v2Data || [])];
            processCalendarData();
            processDetailsData();
        } else {
            alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + result.message);
        }
    } catch (e) {
        console.error('Fetch error:', e);
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
    showLoading(false);
}

function getBuddhistShortDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year < 2500) year += 543;
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${String(year).slice(-2)}`;
    }
    return dateStr;
}

function processDetailsData() {
    const buildingFilter = document.getElementById('filter-building').value;
    const startDateRaw = document.getElementById('filter-date-start').value;
    const endDateRaw = document.getElementById('filter-date-end').value;
    
    let filteredData = rawData.filter(row => {
        if (buildingFilter !== 'all' && String(row.building) !== String(buildingFilter)) return false;
        if (!startDateRaw || !endDateRaw) return true;
        
        const parts = row.date.split('/');
        if (parts.length !== 3) return true;
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        
        const sd = new Date(startDateRaw);
        const ed = new Date(endDateRaw);
        ed.setHours(23, 59, 59);
        
        return d >= sd && d <= ed;
    });

    // 1. Process Overview Stats and Rankings
    const totalInspections = filteredData.length;
    let totalPerfectCount = 0;
    
    const buildingMapStat = new Map(); // building -> { count, perfectCount }
    const roomMapStat = new Map(); // "building-room" -> { building, room, count, perfectCount }

    filteredData.forEach(row => {
        let isPerfect = false;
        if (row.status === 'เรียบร้อย') isPerfect = true;
        else if (row.status === 'v1_legacy' && row.score === 15) isPerfect = true;

        if (isPerfect) totalPerfectCount++;

        // Building stats
        if (!buildingMapStat.has(row.building)) {
            buildingMapStat.set(row.building, { count: 0, perfectCount: 0 });
        }
        const bStat = buildingMapStat.get(row.building);
        bStat.count++;
        if (isPerfect) bStat.perfectCount++;

        // Room stats
        const roomKey = `${row.building}-${row.room}`;
        if (!roomMapStat.has(roomKey)) {
            roomMapStat.set(roomKey, { building: row.building, room: row.room, count: 0, perfectCount: 0 });
        }
        const rStat = roomMapStat.get(roomKey);
        rStat.count++;
        if (isPerfect) rStat.perfectCount++;
    });

    const avgOverall = totalInspections > 0 ? (totalPerfectCount / totalInspections) * 100 : 0;
    document.getElementById('stat-total-inspections').querySelector('.stat-value').textContent = totalInspections;
    document.getElementById('stat-avg-score').querySelector('.stat-value').textContent = `${avgOverall.toFixed(1)}%`;

    const buildings = Array.from(buildingMapStat.entries()).map(([name, stat]) => {
        const pct = stat.count > 0 ? (stat.perfectCount / stat.count) * 100 : 0;
        return { name, count: stat.count, pct };
    }).sort((a, b) => b.pct - a.pct);

    if (buildings.length > 0 && buildings[0].count > 0) {
        document.getElementById('stat-best-building').querySelector('.stat-value').textContent = `อาคาร ${buildings[0].name}`;
    } else {
        document.getElementById('stat-best-building').querySelector('.stat-value').textContent = '-';
    }

    renderBuildingTable(buildings);

    const rooms = Array.from(roomMapStat.values()).map(stat => {
        const pct = stat.count > 0 ? (stat.perfectCount / stat.count) * 100 : 0;
        return { ...stat, pct };
    });

    const threshold = 50; 
    const badRooms = rooms.filter(r => r.pct < threshold);
    document.getElementById('stat-worst-rooms').querySelector('.stat-value').textContent = badRooms.length;

    rooms.sort((a, b) => {
        if (b.pct !== a.pct) return b.pct - a.pct;
        return b.count - a.count; // Tie break: more inspections is better if perfect, worse if bad, but whatever
    });
    
    allTopRooms = rooms.filter(r => r.pct >= 80);
    allBottomRooms = rooms.filter(r => r.pct < 50).reverse();
    if(allTopRooms.length === 0) allTopRooms = rooms.slice(0, 5);
    if(allBottomRooms.length === 0) allBottomRooms = [...rooms].reverse().slice(0, 5);

    const topRooms = allTopRooms.slice(0, 5);
    const bottomRooms = allBottomRooms.slice(0, 5);

    renderRoomList('list-top-rooms', topRooms);
    renderRoomList('list-bottom-rooms', bottomRooms);


    // 2. Process Detailed Accordion View
    const roomAgg = new Map();
    filteredData.forEach(row => {
        const key = `${row.building}-${row.room}`;
        if (!roomAgg.has(key)) {
            roomAgg.set(key, {
                building: row.building,
                floor: row.floor,
                room: row.room,
                latestTimestamp: row.timestamp,
                latestDate: row.date,
                latestStatus: row.status,
                issueCounts: new Map()
            });
        }
        
        const agg = roomAgg.get(key);
        // Update latest
        if (new Date(row.timestamp) > new Date(agg.latestTimestamp)) {
            agg.latestTimestamp = row.timestamp;
            agg.latestDate = row.date;
            agg.latestStatus = row.status;
        }
        
        // Count issues
        if (row.issues && row.issues.length > 0) {
            row.issues.forEach(i => {
                // Ignore cancelled? User said "บอกว่าไม่เรียบร้อยไปกี่ครั้งบ้าง"
                // Assuming we count all or just not cancelled. Let's count all that are not cancelled.
                if (i.is_cancelled !== 1) {
                    agg.issueCounts.set(i.issue_name, (agg.issueCounts.get(i.issue_name) || 0) + 1);
                }
            });
        }
    });

    const buildingMap = new Map();
    Array.from(roomAgg.values()).forEach(agg => {
        if (!buildingMap.has(agg.building)) buildingMap.set(agg.building, []);
        buildingMap.get(agg.building).push(agg);
    });

    const container = document.getElementById('building-details-container');
    container.innerHTML = '';

    const sortedBuildings = Array.from(buildingMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
    
    sortedBuildings.forEach(bId => {
        const rooms = buildingMap.get(bId);
        
        // Group by floor
        const floorMap = new Map();
        rooms.forEach(r => {
            if (!floorMap.has(r.floor)) floorMap.set(r.floor, []);
            floorMap.get(r.floor).push(r);
        });
        
        let roomsHTML = '';
        const sortedFloors = Array.from(floorMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
        
        sortedFloors.forEach(f => {
            roomsHTML += `<div style="font-weight: 600; color: #5f6368; margin: 15px 0 8px 10px; font-size: 0.95rem;">ชั้น ${f}</div>`;
            roomsHTML += `<div class="room-grid">`;
            
            const floorRooms = floorMap.get(f).sort((a, b) => a.room.localeCompare(b.room));
            
            floorRooms.forEach(r => {
                const dateStr = getBuddhistShortDate(r.latestDate);
                let badgeClass = 'badge-none';
                let statusText = r.latestStatus;
                if (r.latestStatus === 'เรียบร้อย') badgeClass = 'badge-perfect';
                else if (r.latestStatus === 'ไม่เรียบร้อย') badgeClass = 'badge-bad';
                else if (r.latestStatus === 'v1_legacy') {
                    badgeClass = 'badge-none';
                    statusText = `ตรวจแล้ว`;
                }
                
                let issuesHtml = '';
                if (r.issueCounts.size > 0) {
                    issuesHtml = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; font-size: 0.85rem; color: #5f6368;">
                        <div style="font-weight: 500; margin-bottom: 4px;">จุดที่ไม่เรียบร้อย:</div>
                        <ul style="padding-left: 20px; margin: 0;">`;
                    for (const [iName, count] of r.issueCounts.entries()) {
                        issuesHtml += `<li>${iName} (${count} ครั้ง)</li>`;
                    }
                    issuesHtml += `</ul></div>`;
                }
                
                roomsHTML += `
                    <div class="room-card ${badgeClass === 'badge-bad' ? 'card-bad' : (badgeClass === 'badge-perfect' ? 'card-perfect' : '')}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: #202124;">ห้อง ${r.room}</div>
                            <span class="room-status-badge ${badgeClass}">${statusText}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #b00909; font-weight: 500; margin-bottom: 4px;">ตรวจล่าสุด ${dateStr}</div>
                        ${issuesHtml}
                        <div style="margin-top: 15px; text-align: right;">
                            <button onclick="openHistoryPopup('${r.building}', '${r.room}')" style="background:#fce8e8; color:#b00909; border:none; padding:6px 12px; border-radius:15px; font-family:'Prompt',sans-serif; font-size:0.85rem; cursor:pointer; font-weight:500;">
                                <i class="fas fa-history"></i> ประวัติ
                            </button>
                        </div>
                    </div>
                `;
            });
            
            roomsHTML += `</div>`;
        });
        
        container.innerHTML += `
            <div class="building-accordion">
                <button class="accordion-header" onclick="this.classList.toggle('active'); this.nextElementSibling.classList.toggle('active');">
                    <span>อาคาร ${bId} <span style="font-size:0.85rem; font-weight:400; color:#5f6368;">(${rooms.length} ห้อง)</span></span>
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content">
                    <div class="accordion-body">
                        ${roomsHTML}
                    </div>
                </div>
            </div>
        `;
    });

    if (sortedBuildings.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #5f6368;">ไม่พบข้อมูล</div>';
    }
}

function renderBuildingTable(buildings) {
    const tbody = document.querySelector('#table-buildings tbody');
    tbody.innerHTML = '';
    
    if (buildings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#5f6368;">ไม่มีข้อมูล</td></tr>';
        return;
    }
    
    buildings.forEach(b => {
        let level = '';
        if (b.pct >= 80) level = '<span style="color:#1b7a3d;font-weight:500;">ดีมาก</span>';
        else if (b.pct >= 50) level = '<span style="color:#f9ab00;font-weight:500;">พอใช้</span>';
        else level = '<span style="color:#d93025;font-weight:500;">ต้องปรับปรุง</span>';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>อาคาร ${b.name}</strong></td>
                <td>${b.count} ครั้ง</td>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-weight:600;">${b.pct.toFixed(1)}%</span>
                        <div style="flex:1;height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden;min-width:60px;">
                            <div style="height:100%;width:${b.pct}%;background:${b.pct>=80?'#1b7a3d':(b.pct>=50?'#f9ab00':'#d93025')}"></div>
                        </div>
                    </div>
                </td>
                <td>${level}</td>
            </tr>
        `;
    });
}

function renderRoomList(containerId, rooms) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    if (rooms.length === 0) {
        container.innerHTML = '<li style="text-align:center;color:#5f6368;border:none;">ไม่มีข้อมูล</li>';
        return;
    }
    
    rooms.forEach((r, idx) => {
        let pctClass = 'score-mid';
        if (r.pct >= 80) pctClass = 'score-high';
        else if (r.pct < 50) pctClass = 'score-low';
        
        container.innerHTML += `
            <li>
                <div class="room-info">
                    <span class="room-rank">#${idx+1}</span>
                    <span class="room-name">ห้อง ${r.room} <small>(อาคาร ${r.building})</small></span>
                </div>
                <span class="room-score ${pctClass}">${r.pct.toFixed(1)}%</span>
            </li>
        `;
    });
}

// ===== Calendar =====
let calendarFilterTimeout = null;

function toggleCalendarFilter() {
    const type = document.querySelector('input[name="calendar-filter-type"]:checked').value;
    const bSelect = document.getElementById('calendar-filter-building');
    const rInput = document.getElementById('calendar-filter-room');
    if (type === 'building') {
        bSelect.style.display = 'inline-block';
        rInput.style.display = 'none';
    } else {
        bSelect.style.display = 'none';
        rInput.style.display = 'inline-block';
    }
    processCalendarData();
}

function debounceRenderCalendar() {
    if (calendarFilterTimeout) clearTimeout(calendarFilterTimeout);
    calendarFilterTimeout = setTimeout(() => {
        processCalendarData();
    }, 500);
}

function processCalendarData() {
    const type = document.querySelector('input[name="calendar-filter-type"]:checked').value;
    const bSelect = document.getElementById('calendar-filter-building').value;
    const rInput = document.getElementById('calendar-filter-room').value.trim().toLowerCase();

    calendarData = {};

    rawData.forEach(row => {
        if (type === 'building' && bSelect !== 'all' && String(row.building) !== String(bSelect)) return;
        if (type === 'room' && rInput && !String(row.room).toLowerCase().includes(rInput)) return;

        const parts = row.date.split('/');
        if (parts.length === 3) {
            let year = parseInt(parts[2]);
            if (year < 2500) year += 543;
            // Key is YYYY-MM-DD
            const iso = `${year - 543}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            if (!calendarData[iso]) {
                calendarData[iso] = { items: [] };
            }
            calendarData[iso].items.push(row);
        }
    });

    renderCalendar();
}

function renderCalendar() {
    const monthYearStr = currentCalDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    document.getElementById('calendar-month-year').textContent = monthYearStr;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    days.forEach(d => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = d;
        grid.appendChild(header);
    });

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-cell empty';
        grid.appendChild(empty);
    }

    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month);

    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        if (isCurrentMonth && today.getDate() === i) {
            cell.classList.add('today');
        }

        const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayData = calendarData[dateIso];

        const dateNum = document.createElement('div');
        dateNum.className = 'calendar-date-num';
        dateNum.textContent = i;
        cell.appendChild(dateNum);

        if (dayData && dayData.items.length > 0) {
            cell.classList.add('has-data');
            
            let perfect = 0;
            let bad = 0;
            dayData.items.forEach(r => {
                if (r.status === 'เรียบร้อย' || (r.status === 'v1_legacy' && r.score === 15)) {
                    perfect++;
                } else {
                    bad++;
                }
            });
            let missing = 117 - dayData.items.length;
            if (missing < 0) missing = 0;

            const dataIndicator = document.createElement('div');
            dataIndicator.style.fontSize = '0.75rem';
            dataIndicator.style.fontWeight = '500';
            dataIndicator.style.marginTop = '4px';
            dataIndicator.style.display = 'flex';
            dataIndicator.style.gap = '6px';
            dataIndicator.innerHTML = `
                <span style="color:#137333;">${perfect}</span>
                <span style="color:#b00909;">${bad}</span>
                <span style="color:#80868b;">${missing}</span>
            `;
            cell.appendChild(dataIndicator);

            cell.onclick = () => openCalendarModal(dateIso, dayData.items);
        }

        grid.appendChild(cell);
    }
}

function openCalendarModal(dateIso, items) {
    const parts = dateIso.split('-');
    const yearTh = parseInt(parts[0]) + 543;
    const dateStr = `${parts[2]}/${parts[1]}/${yearTh}`;
    
    document.getElementById('calendar-modal-title').textContent = `ข้อมูลการตรวจวันที่ ${dateStr}`;
    currentModalRooms = items;
    
    document.getElementById('calendar-modal').style.display = 'flex';
    document.getElementById('calendar-sort-select').value = 'building';
    renderCalendarRoomList();
}

function closeCalendarModal() {
    document.getElementById('calendar-modal').style.display = 'none';
}

function renderCalendarRoomList() {
    const container = document.getElementById('calendar-room-list');
    container.innerHTML = '';
    
    const sortBy = document.getElementById('calendar-sort-select').value;
    let list = [...currentModalRooms];
    
    if (sortBy === 'building') {
        list.sort((a, b) => {
            if (a.building !== b.building) return parseInt(a.building) - parseInt(b.building);
            return a.room.localeCompare(b.room);
        });
    } else if (sortBy === 'room') {
        list.sort((a, b) => a.room.localeCompare(b.room));
    }
    
    list.forEach(r => {
        const dateStr = getBuddhistShortDate(r.date);
        let inspectors = [r.inspector1, r.inspector2, r.inspector3].filter(Boolean).join(', ');
        
        let imagesHtml = '';
        
        if (r.overall_image_url) {
            let fullOverallUrl = getFullImageUrl(r.overall_image_url);
            let imgDataStr = encodeURIComponent(JSON.stringify([{url: fullOverallUrl, type: 'overall', date: r.date, inspectors: inspectors}]));
            imagesHtml += `
                <div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:#eee;" onclick="openPhotos('${imgDataStr}', 0)">
                    <img src="${fullOverallUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                    <div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.6);color:white;padding:4px;text-align:center;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">ความสะอาดโดยรวม</div>
                </div>
            `;
        }
        
        if (r.issues && r.issues.length > 0) {
            r.issues.forEach(i => {
                let fullIssueUrl = getFullImageUrl(i.image_url);
                let imgDataStr = encodeURIComponent(JSON.stringify([{url: fullIssueUrl, type: 'issue', date: r.date, inspectors: inspectors, id: i.id}]));
                let isCancelled = i.is_cancelled === 1;
                imagesHtml += `
                    <div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:#eee;${isCancelled ? 'filter:grayscale(100%);' : ''}" onclick="openPhotos('${imgDataStr}', 0)">
                        <img src="${fullIssueUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                        <div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.6);color:${isCancelled ? '#ccc' : 'white'};padding:4px;text-align:center;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isCancelled ? 'text-decoration:line-through;' : ''}">${i.issue_name}</div>
                    </div>
                `;
            });
        }
        
        if (imagesHtml !== '') {
            container.innerHTML += `
                <div style="margin-bottom:20px;">
                    <div style="font-size:1.1rem;font-weight:600;color:#202124;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">
                        ห้อง ${r.room} <span style="font-size:0.85rem;color:#5f6368;font-weight:400;">(อาคาร ${r.building} ชั้น ${r.floor})</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr));gap:10px;">
                        ${imagesHtml}
                    </div>
                </div>
            `;
        }
    });
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// ===== Lightbox =====
function openPhotos(dataStr, index) {
    try {
        lbImgs = JSON.parse(decodeURIComponent(dataStr));
    } catch (e) {
        lbImgs = [];
    }
    if (lbImgs.length === 0) return;
    
    lbIndex = index;
    const lb = document.getElementById('lb');
    lb.classList.add('active');
    updateLBImg();
}

function updateLBImg() {
    const lb = document.getElementById('lb');
    const lbImg = document.getElementById('lbImg');
    const lbHeader = document.getElementById('lbHeader');
    const lbCancelBtn = document.getElementById('lbCancelDeductionBtn');
    
    lb.classList.add('loading');
    resetZoom();

    const data = lbImgs[lbIndex];
    lbImg.src = data.url;
    
    let dateStr = getBuddhistShortDate(data.date);
    lbHeader.innerHTML = `<i class="far fa-calendar-alt"></i> ${dateStr}<br><span style="font-size:0.8rem;opacity:0.9;">ผู้ตรวจ: ${data.inspectors}</span>`;
    
    lbImg.onload = () => {
        lb.classList.remove('loading');
    };
    
    if (data.type === 'issue' && data.id) {
        lbCurrentIssueId = data.id;
        lbCancelBtn.style.display = 'block';
        lbCancelBtn.onclick = () => confirmCancelDeduction(data.id);
    } else {
        lbCurrentIssueId = null;
        lbCancelBtn.style.display = 'none';
    }
}

async function confirmCancelDeduction(issueId) {
    if (!confirm('ยืนยันยกเลิกการหักคะแนน/สถานะไม่เรียบร้อยของจุดนี้?')) return;
    
    try {
        const res = await fetch('/api/building/cancel_deduction', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ issue_id: issueId, is_cancelled: true })
        });
        const result = await res.json();
        if (result.success) {
            alert('ยกเลิกสำเร็จ');
            closeLB();
            fetchData(); // Reload data
        } else {
            alert('เกิดข้อผิดพลาด: ' + result.message);
        }
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

function closeLB() {
    document.getElementById('lb').classList.remove('active');
    lbImgs = [];
    lbCurrentIssueId = null;
}

function resetZoom() {
    lbZoom = 1; lbPanX = 0; lbPanY = 0;
    updateZoom();
    const btn = document.getElementById('lbZoomBtn');
    if(btn) btn.innerHTML = '<i class="fas fa-search-plus"></i>';
    document.getElementById('lbImg').style.cursor = '';
}

function updateZoom(animate = true) {
    const img = document.getElementById('lbImg');
    if(animate) img.style.transition = 'transform 0.2s ease-out, opacity 0.3s ease';
    else img.style.transition = 'opacity 0.3s ease';
    img.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
    if (!isMousePanning) img.style.cursor = lbZoom > 1 ? 'grab' : '';
}

function toggleZoom() {
    const btn = document.getElementById('lbZoomBtn');
    if (lbZoom > 1) {
        resetZoom();
    } else {
        lbZoom = 2;
        updateZoom();
        if(btn) btn.innerHTML = '<i class="fas fa-search-minus"></i>';
    }
}

function initLightbox() {
    const lbImg = document.getElementById('lbImg');
    const lb = document.getElementById('lb');
    if (!lbImg) return;
    
    // Mouse Pan
    lbImg.addEventListener('mousedown', e => {
        if (lbZoom > 1) {
            isMousePanning = true;
            startPanX = e.clientX - lbPanX;
            startPanY = e.clientY - lbPanY;
            lbImg.style.transition = 'none';
            lbImg.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', e => {
        if (isMousePanning) {
            lbPanX = e.clientX - startPanX;
            lbPanY = e.clientY - startPanY;
            updateZoom(false);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isMousePanning) {
            isMousePanning = false;
            lbImg.style.transition = 'transform 0.2s ease-out, opacity 0.3s ease';
            lbImg.style.cursor = 'grab';
        }
    });
    
    lb.addEventListener('click', e => {
        if(e.target === e.currentTarget || e.target.classList.contains('photos-lightbox-close')) closeLB();
    });

    // Touch / Pinch to zoom
    lbImg.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        } else if (e.touches.length === 1 && lbZoom > 1) {
            isPanning = true;
            startPanX = e.touches[0].clientX - lbPanX;
            startPanY = e.touches[0].clientY - lbPanY;
        }
    }, {passive: false});

    lbImg.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const scale = dist / initialDist;
            let newZoom = lbZoom * scale;
            newZoom = Math.max(1, Math.min(newZoom, 4));
            if(newZoom !== lbZoom) {
                lbZoom = newZoom;
                updateZoom(false);
                const btn = document.getElementById('lbZoomBtn');
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

    lbImg.addEventListener('touchend', e => {
        isPanning = false;
        if (lbZoom <= 1) {
            resetZoom();
        }
    });

    // Mouse Wheel Zoom
    lbImg.addEventListener('wheel', e => {
        if (lbZoom <= 1 && e.deltaY > 0) return;
        e.preventDefault();

        const zoomStep = 0.2;
        const direction = e.deltaY > 0 ? -1 : 1;
        let newZoom = lbZoom + (direction * zoomStep * lbZoom);
        newZoom = Math.max(1, Math.min(newZoom, 5));

        if (newZoom !== lbZoom) {
            const rect = lbImg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const zoomRatio = newZoom / lbZoom;

            lbPanX = lbPanX - (x - rect.width/2) * (zoomRatio - 1);
            lbPanY = lbPanY - (y - rect.height/2) * (zoomRatio - 1);

            lbZoom = newZoom;
            updateZoom(false);
            const btn = document.getElementById('lbZoomBtn');
            if(btn) btn.innerHTML = lbZoom > 1 ? '<i class="fas fa-search-minus"></i>' : '<i class="fas fa-search-plus"></i>';
        }
    }, {passive: false});
}


// ===== History Popup =====
let currentHistoryBuilding = '';
let currentHistoryRoom = '';

function getMonthYearStr(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return '';
    const m = parseInt(parts[1], 10);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${months[m-1]} ${parts[2]}`;
}

function openHistoryPopup(building, room) {
    currentHistoryBuilding = building;
    currentHistoryRoom = room;
    
    let modal = document.getElementById('historyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'historyModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:3000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;';
        modal.innerHTML = `
            <div style="background:#fff; width:90%; max-width:800px; height:85vh; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                <div style="padding:16px 20px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:1.2rem; font-weight:600; color:#b00909;">
                        ประวัติห้อง <span id="histRoomName"></span> <span style="font-size:0.9rem;color:#5f6368;font-weight:400;" id="histBuildingName"></span>
                    </div>
                    <button onclick="closeHistoryPopup()" style="background:none;border:none;font-size:1.5rem;color:#5f6368;cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding:10px 20px; background:#fafafa; border-bottom:1px solid #eee; display:flex; align-items:center; gap:10px;">
                    <span style="font-size:0.9rem;color:#5f6368;">เรียงลำดับ:</span>
                    <select id="histSortSelect" onchange="renderHistoryContent()" style="padding:6px; border:1px solid #ddd; border-radius:6px; font-family:'Prompt',sans-serif;">
                        <option value="latest">ล่าสุด</option>
                        <option value="oldest">เก่าสุด</option>
                        <option value="most_issues">ไม่เรียบร้อยสุด</option>
                        <option value="least_issues">เรียบร้อยสุด</option>
                    </select>
                </div>
                <div id="histContent" style="flex:1; overflow-y:auto; padding:20px;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if(e.target === modal) closeHistoryPopup(); });
    }
    
    document.getElementById('histRoomName').textContent = room;
    document.getElementById('histBuildingName').textContent = `(อาคาร ${building})`;
    
    document.getElementById('histSortSelect').value = 'latest';
    
    // Animate in
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.style.opacity = '1');
    document.body.style.overflow = 'hidden';
    
    renderHistoryContent();
}

function closeHistoryPopup() {
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    }
}

function renderHistoryContent() {
    const sortType = document.getElementById('histSortSelect').value;
    
    let histData = rawData.filter(r => String(r.building) === String(currentHistoryBuilding) && String(r.room) === String(currentHistoryRoom));
    
    histData.sort((a, b) => {
        if (sortType === 'latest') return new Date(b.timestamp) - new Date(a.timestamp);
        if (sortType === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
        
        const aIssues = a.issues ? a.issues.length : 0;
        const bIssues = b.issues ? b.issues.length : 0;
        if (sortType === 'most_issues') {
            if (bIssues !== aIssues) return bIssues - aIssues;
            return new Date(b.timestamp) - new Date(a.timestamp);
        }
        if (sortType === 'least_issues') {
            if (aIssues !== bIssues) return aIssues - bIssues;
            return new Date(b.timestamp) - new Date(a.timestamp);
        }
    });
    
    // Group by month
    const monthMap = new Map();
    histData.forEach(r => {
        const mStr = getMonthYearStr(r.date);
        if (!monthMap.has(mStr)) monthMap.set(mStr, []);
        monthMap.get(mStr).push(r);
    });
    
    const container = document.getElementById('histContent');
    container.innerHTML = '';
    
    if (monthMap.size === 0) {
        container.innerHTML = '<div style="text-align:center; color:#5f6368; margin-top:20px;">ไม่มีข้อมูลประวัติ</div>';
        return;
    }
    
    for (const [mStr, records] of monthMap.entries()) {
        let monthHtml = `<div style="font-size:1.1rem; font-weight:600; color:#202124; margin: 20px 0 10px 0; border-bottom:2px solid #b00909; padding-bottom:4px; display:inline-block;">${mStr}</div>`;
        
        records.forEach(r => {
            let inspectors = [r.inspector1, r.inspector2, r.inspector3].filter(Boolean).join(', ');
            let imagesHtml = '';
            
            if (r.overall_image_url) {
                let fullOverallUrl = getFullImageUrl(r.overall_image_url);
                let imgDataStr = encodeURIComponent(JSON.stringify([{url: fullOverallUrl, type: 'overall', date: r.date, inspectors: inspectors}]));
                imagesHtml += `
                    <div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:#eee;" onclick="openPhotos('${imgDataStr}', 0)">
                        <img src="${fullOverallUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                        <div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.6);color:white;padding:4px;text-align:center;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">ความสะอาดโดยรวม</div>
                    </div>
                `;
            }
            
            if (r.issues && r.issues.length > 0) {
                r.issues.forEach(i => {
                    let fullIssueUrl = getFullImageUrl(i.image_url);
                    let imgDataStr = encodeURIComponent(JSON.stringify([{url: fullIssueUrl, type: 'issue', date: r.date, inspectors: inspectors, id: i.id}]));
                    let isCancelled = i.is_cancelled === 1;
                    imagesHtml += `
                        <div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:#eee;${isCancelled ? 'filter:grayscale(100%);' : ''}" onclick="openPhotos('${imgDataStr}', 0)">
                            <img src="${fullIssueUrl}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                            <div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.6);color:${isCancelled ? '#ccc' : 'white'};padding:4px;text-align:center;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isCancelled ? 'text-decoration:line-through;' : ''}">${i.issue_name}</div>
                        </div>
                    `;
                });
            }
            
            if (imagesHtml !== '') {
                monthHtml += `
                    <div style="margin-bottom:16px; background:#fff; border:1px solid #eee; border-radius:8px; padding:12px;">
                        <div style="font-size:0.9rem; font-weight:600; color:#5f6368; margin-bottom:8px; display:flex; justify-content:space-between;">
                            <span>วันที่ ${r.date.split('/')[0]} (${r.status})</span>
                            <span style="font-weight:400; font-size:0.8rem;">${inspectors}</span>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:8px;">
                            ${imagesHtml}
                        </div>
                    </div>
                `;
            }
        });
        
        container.innerHTML += monthHtml;
    }
}
