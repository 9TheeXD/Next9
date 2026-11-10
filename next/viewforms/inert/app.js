let allData = [];
let studentsData = {};
let currentTerm = '2';
let currentType = 'all';

document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    setupEventListeners();
    await loadData(currentType, currentTerm);
}

function setupEventListeners() {
    // Term Filters
    const termBtns = document.querySelectorAll('.term-btn');
    termBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            termBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTerm = e.target.dataset.term;
            await loadData(currentType, currentTerm);
        });
    });

    // Type Filters
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            typeBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentType = e.target.dataset.type;
            await loadData(currentType, currentTerm);
        });
    });

    // Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            await loadData(currentType, currentTerm);
        });
    }

    // Modal
    const modal = document.getElementById('export-modal');
    const btnExport = document.getElementById('btn-export-modal');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const exportForm = document.getElementById('export-form');

    btnExport.addEventListener('click', () => modal.classList.remove('hidden'));
    btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    btnCancel.addEventListener('click', () => modal.classList.add('hidden'));

    exportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleExport();
        modal.classList.add('hidden');
    });
}



async function loadData(type, term) {
    const tableBody = document.getElementById('table-body');
    const spinner = document.getElementById('loading-spinner');
    const btnExport = document.getElementById('btn-export-modal');
    
    const btnRefresh = document.getElementById('btn-refresh');
    
    tableBody.innerHTML = '';
    spinner.classList.remove('hidden');
    btnExport.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;

    const t = term || currentTerm || '2';
    try {
        const res = await fetch(`/api/inert/report?type=${type}&term=${encodeURIComponent(t)}`);
        const result = await res.json();
        if (result.success) {
            allData = result.data;
            renderTable(allData);
        } else {
            alert('Failed to load data: ' + result.message);
        }
    } catch (e) {
        console.error("Error loading data", e);
        alert('Error loading data');
    } finally {
        spinner.classList.add('hidden');
        if (btnRefresh) btnRefresh.disabled = false;
        if (allData.length > 0) {
            btnExport.disabled = false;
        } else {
            btnExport.disabled = true;
        }
    }
}



function renderTable(data) {
    const tableBody = document.getElementById('table-body');
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">ไม่มีข้อมูล</td></tr>';
        return;
    }

    let html = '';
    data.forEach(item => {
        const numberDisplay = item.number ? `${item.number}${item.classType}` : '';
        const classRoom = (item.cls && item.room) ? `${item.cls}/${item.room}` : item.cls;
        
        html += `
            <tr>
                <td>${escapeHtml(item.date)}</td>
                <td>${escapeHtml(item.studentId)}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(classRoom)}</td>
                <td>${escapeHtml(numberDisplay)}</td>
                <td>${escapeHtml(item.violations)}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
