import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType, VerticalAlign, PageBreak, TableLayoutType } from 'docx';
import { getScoreLabel } from './scoreUtils';

const FONT = 'TH Sarabun New';
const GRADES = [
    { grade: 1, name: 'ม.1' },
    { grade: 2, name: 'ม.2' },
    { grade: 3, name: 'ม.3' },
    { grade: 4, name: 'ม.4' },
    { grade: 5, name: 'ม.5' },
    { grade: 6, name: 'ม.6' },
];

const MARGIN = { top: 1134, bottom: 1134, left: 850, right: 850 };
const HEAD_SHADE = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const BORDER_ALL = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
};

function getLevel(score) {
    if (score === null || score === undefined || score <= 0 || isNaN(score)) return '-';
    return getScoreLabel(score);
}

function fmt(score) {
    if (score === null || score === undefined || score <= 0 || isNaN(score)) return '-';
    return Number(score).toFixed(2);
}

function cell(text, opts = {}) {
    const { bold = false, header = false } = opts;
    const props = {
        verticalAlign: VerticalAlign.CENTER,
        borders: BORDER_ALL,
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
                children: [
                    new TextRun({
                        text: String(text),
                        font: FONT,
                        size: 28,
                        bold: bold || header,
                    })
                ]
            })
        ],
    };
    if (header) props.shading = HEAD_SHADE;
    return new TableCell(props);
}

export function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const thaiMonths = [
        '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    return `${parseInt(day, 10)} ${thaiMonths[parseInt(month, 10)]} ${parseInt(year, 10) + 543}`;
}

export async function generateWordDocumentBlob(startDate, endDate, summaryData) {
    const dateText = (startDate && endDate) 
        ? `ช่วงวันที่ ${formatThaiDate(startDate)} ถึง ${formatThaiDate(endDate)}`
        : `ประจำปีการศึกษา`;

    // Process data
    const roomAvgs = summaryData.roomAverages || [];
    const mockData = {};
    
    GRADES.forEach(g => {
        mockData[g.grade] = {
            name: g.name,
            totalAvg: 0,
            teacherAvg: 0,
            councilAvg: 0,
            rooms: []
        };
    });

    roomAvgs.forEach(row => {
        if (!mockData[row.grade]) return;
        
        if (Number(row.room) === 0) {
            mockData[row.grade].totalAvg = row.avg_score;
            mockData[row.grade].teacherAvg = row.teacher_avg;
            mockData[row.grade].councilAvg = row.council_avg;
        } else {
            mockData[row.grade].rooms.push({
                room: row.room,
                totalAvg: row.avg_score,
                teacherAvg: row.teacher_avg,
                councilAvg: row.council_avg
            });
        }
    });

    const tableConfig = {
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [1690, 1690, 2400, 2400, 2026], // 10206 total width
    };

    const overviewTable = new Table({
        ...tableConfig,
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    cell("ระดับชั้น", { header: true }),
                    cell("ครู", { header: true }),
                    cell("สภานักเรียน", { header: true }),
                    cell("คะแนนเฉลี่ย", { header: true }),
                    cell("ระดับ", { header: true }),
                ]
            }),
            ...GRADES.map(g => {
                const d = mockData[g.grade];
                return new TableRow({
                    children: [
                        cell(d.name, { bold: true }),
                        cell(fmt(d.teacherAvg)),
                        cell(fmt(d.councilAvg)),
                        cell(fmt(d.totalAvg), { bold: true }),
                        cell(getLevel(d.totalAvg)),
                    ]
                });
            })
        ]
    });

    const gradePages = GRADES.flatMap(g => {
        const d = mockData[g.grade];
        const rooms = d.rooms.sort((a, b) => a.room - b.room);
        
        const roomTable = new Table({
            ...tableConfig,
            rows: [
                new TableRow({
                    tableHeader: true,
                    children: [
                        cell("ห้อง", { header: true }),
                        cell("ครู", { header: true }),
                        cell("สภานักเรียน", { header: true }),
                        cell("เฉลี่ย", { header: true }),
                        cell("ระดับ", { header: true }),
                    ]
                }),
                ...rooms.map(r => new TableRow({
                    children: [
                        cell(g.name + '/' + r.room),
                        cell(fmt(r.teacherAvg)),
                        cell(fmt(r.councilAvg)),
                        cell(fmt(r.totalAvg), { bold: true }),
                        cell(getLevel(r.totalAvg)),
                    ]
                }))
            ]
        });
        
        const pageParts = [
            new Paragraph({ children: [new PageBreak()] })
        ];

        if (g.grade === 1) {
            pageParts.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
                children: [new TextRun({ text: 'ผลการประเมินแต่ละห้องเรียน', font: FONT, size: 36, bold: true })]
            }));
        }

        pageParts.push(new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: g.grade === 1 ? 100 : 300, after: 150 },
            children: [new TextRun({ text: 'ชั้นมัธยมศึกษาปีที่ ' + g.grade, font: FONT, size: 36, bold: true })]
        }));
        
        pageParts.push(roomTable);
        return pageParts;
    });

    const doc = new Document({
        styles: { default: { document: { run: { font: FONT, size: 28 } } } },
        sections: [{
            properties: { page: { margin: MARGIN } },
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: "รายงานผลการประเมินระเบียบแถว", font: FONT, size: 48, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [new TextRun({ text: dateText, font: FONT, size: 36, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 200 },
                    children: [new TextRun({ text: "ผลการประเมินภาพรวมระดับชั้น", font: FONT, size: 36, bold: true })]
                }),
                overviewTable,
                ...gradePages,
            ]
        }]
    });

    return await Packer.toBlob(doc);
}
