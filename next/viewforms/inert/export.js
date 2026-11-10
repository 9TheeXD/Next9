function parseThaiDate(dateStr) {
    if (!dateStr) return 0;
    const s = String(dateStr).trim();
    const parts = s.split('/');
    if (parts.length >= 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
    }
    // Fallback: Google Sheets serial date number (days since 1899-12-30)
    const num = Number(s);
    if (!isNaN(num) && num > 1000 && num < 999999) {
        return Math.round((num - 25569) * 86400 * 1000);
    }
    return 0;
}

function handleExport() {
    const monthStart = document.getElementById('export-month-start').value;
    const monthEnd = document.getElementById('export-month-end').value;
    const semester = document.getElementById('export-semester').value;
    const year = document.getElementById('export-year').value;

    // Filter data by month range if not 'all'
    let filteredData = allData;
    if (monthStart !== 'all' && monthEnd !== 'all') {
        const start = parseInt(monthStart, 10);
        const end = parseInt(monthEnd, 10);
        
        filteredData = allData.filter(item => {
            const dateStr = String(item.date || '').trim();
            const parts = dateStr.split('/');
            if (parts.length >= 2) {
                const itemMonth = parseInt(parts[1], 10);
                return itemMonth >= start && itemMonth <= end;
            }
            // Fallback: serial date number
            const num = Number(dateStr);
            if (!isNaN(num) && num > 1000 && num < 999999) {
                const d = new Date(Math.round((num - 25569) * 86400 * 1000));
                if (!isNaN(d.getTime())) {
                    const itemMonth = d.getMonth() + 1;
                    return itemMonth >= start && itemMonth <= end;
                }
            }
            return true;
        });
    }

    if (filteredData.length === 0) {
        alert("ไม่มีข้อมูลสำหรับส่งออกในช่วงเวลานี้");
        return;
    }

    // Group by class number
    const grouped = groupByClass(filteredData);

    // สร้างไฟล์ Word แบบ Fullpage Loader พร้อม Backdrop
    document.getElementById('fullpage-loader').classList.remove('hidden');
    document.getElementById('fullpage-loader-title').innerText = "กำลังสร้างไฟล์เอกสาร...";
    document.getElementById('fullpage-loader-desc').innerText = "โปรดรอสักครู่ ระบบกำลังจัดเตรียมข้อมูลลงในไฟล์ Word";

    // เรียกฟังก์ชันสร้างไฟล์ Word (ซึ่งจะแสดง/ซ่อน loader ภายในด้วยตัวเอง)
    exportWord(grouped, semester, year, false);
}

function groupByClass(data) {
    const groups = {};
    data.forEach(item => {
        const c = item.classNum || 0;
        if (!groups[c]) groups[c] = [];
        groups[c].push(item);
    });

    // Sort within groups
    for (const c in groups) {
        groups[c].sort((a, b) => {
            const timeA = parseThaiDate(a.date);
            const timeB = parseThaiDate(b.date);
            if (timeA !== timeB) return timeA - timeB;
            if (a.roomNum !== b.roomNum) return a.roomNum - b.roomNum;
            return (parseInt(a.number)||0) - (parseInt(b.number)||0);
        });
    }

    // Return sorted keys and groups
    const sortedKeys = Object.keys(groups).map(Number).sort((a,b)=>a-b);
    return { sortedKeys, groups };
}


function exportWord(groupedData, semester, year, asPdf = false) {
    if (!window.docx) {
        alert("กำลังโหลดไลบรารีสร้างไฟล์เอกสาร กรุณารอสักครู่แล้วลองใหม่");
        return;
    }
    const { sortedKeys, groups } = groupedData;
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak, VerticalAlign } = window.docx;

    const sections = [];

    sortedKeys.forEach((classNum, index) => {
        const classData = groups[classNum];
        const dateCounts = {};
        classData.forEach(item => {
            dateCounts[item.date] = (dateCounts[item.date] || 0) + 1;
        });

        const separatorChildren = [];
        
        // Push the title down roughly to the center of the page
        for (let i = 0; i < 12; i++) {
            separatorChildren.push(new Paragraph({ text: "" }));
        }

        separatorChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: `ชั้นมัธยมศึกษาปีที่ ${classNum}`,
                    bold: true,
                    size: 96, // 48pt
                })
            ]
        }));
        
        separatorChildren.push(new Paragraph({
            children: [new PageBreak()]
        }));

        // Data Page
        separatorChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
                new TextRun({
                    text: `สรุปรายชื่อสาย - เฉื่อย ชั้นมัธยมศึกษาปีที่ ${classNum} ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`,
                    bold: true,
                    size: 30, // 15pt
                })
            ]
        }));

        const tableRows = [];
        
        // Header Row
        tableRows.push(new TableRow({
            children: [
                new TableCell({ width: { size: 1247, type: WidthType.DXA }, children: [new Paragraph({ text: "วัน/เดือน/ปี", alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 1417, type: WidthType.DXA }, children: [new Paragraph({ text: "รหัสประจำตัว", alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 2835, type: WidthType.DXA }, children: [new Paragraph({ text: "ชื่อ-สกุล", alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 850, type: WidthType.DXA }, children: [new Paragraph({ text: "ชั้น", alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 680, type: WidthType.DXA }, children: [new Paragraph({ text: "เลขที่", alignment: AlignmentType.CENTER })] }),
                new TableCell({ width: { size: 4592, type: WidthType.DXA }, children: [new Paragraph({ text: "รายการผิดระเบียบ", alignment: AlignmentType.CENTER })] }),
            ]
        }));

        let currentDates = {};

        classData.forEach((item, idx) => {
            const classRoom = (item.cls && item.room) ? `${item.cls}/${item.room}` : item.cls;
            const numberDisplay = item.number ? `${item.number}${item.classType}` : '';
            
            const rowChildren = [];
            
            if (!currentDates[item.date]) {
                rowChildren.push(new TableCell({
                    rowSpan: dateCounts[item.date],
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ text: item.date, alignment: AlignmentType.CENTER })]
                }));
                currentDates[item.date] = true;
            }

            rowChildren.push(new TableCell({ children: [new Paragraph({ text: item.studentId, alignment: AlignmentType.CENTER })] }));
            rowChildren.push(new TableCell({ children: [new Paragraph({ text: item.name })] }));
            rowChildren.push(new TableCell({ children: [new Paragraph({ text: classRoom, alignment: AlignmentType.CENTER })] }));
            rowChildren.push(new TableCell({ children: [new Paragraph({ text: numberDisplay, alignment: AlignmentType.CENTER })] }));
            rowChildren.push(new TableCell({ children: [new Paragraph({ text: item.violations })] }));

            tableRows.push(new TableRow({ children: rowChildren }));
        });

        const table = new Table({
            columnWidths: [1247, 1417, 2835, 850, 680, 4592],
            width: { size: 11621, type: WidthType.DXA },
            layout: "fixed",
            rows: tableRows
        });

        separatorChildren.push(table);
        
        sections.push({
            properties: {
                page: {
                    margin: {
                        top: 720,
                        right: 142,
                        bottom: 720,
                        left: 142,
                    },
                },
            },
            children: separatorChildren
        });
    });

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        size: 18, // 9pt
                        font: "Sarabun"
                    },
                    paragraph: {
                        spacing: {
                            before: 40, // 2pt
                            after: 40   // 2pt
                        }
                    }
                }
            }
        },
        sections: sections
    });

    Packer.toBlob(doc).then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `สรุปสาย-เฉื่อย_${year}_เทอม${semester}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        document.getElementById('fullpage-loader').classList.add('hidden');
    });
}
