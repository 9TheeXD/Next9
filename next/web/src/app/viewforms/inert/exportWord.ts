/* eslint-disable @typescript-eslint/no-explicit-any */
// The Word report of the inert summary, built exactly as the old viewforms/inert/export.js did, with
// docx@8.5.0 loaded from the CDN as window.docx (see page.tsx).

export type InertRow = {
  date: string;
  studentId: string;
  name: string;
  cls: string;
  room: string;
  number: string;
  classType: string;
  violations: string;
  classNum?: number;
  roomNum?: number;
};

export function parseThaiDate(dateStr: string) {
  if (!dateStr) return 0;
  const s = String(dateStr).trim();
  const parts = s.split("/");
  if (parts.length >= 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
  const num = Number(s);
  if (!isNaN(num) && num > 1000 && num < 999999) return Math.round((num - 25569) * 86400 * 1000);
  return 0;
}

export function filterByMonths(all: InertRow[], monthStart: string, monthEnd: string) {
  if (monthStart === "all" || monthEnd === "all") return all;
  const start = parseInt(monthStart, 10);
  const end = parseInt(monthEnd, 10);
  return all.filter((item) => {
    const dateStr = String(item.date || "").trim();
    const parts = dateStr.split("/");
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      return m >= start && m <= end;
    }
    const num = Number(dateStr);
    if (!isNaN(num) && num > 1000 && num < 999999) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const m = d.getMonth() + 1;
        return m >= start && m <= end;
      }
    }
    return true;
  });
}

export function groupByClass(data: InertRow[]) {
  const groups: Record<number, InertRow[]> = {};
  data.forEach((item) => {
    const c = item.classNum || 0;
    (groups[c] ??= []).push(item);
  });
  for (const c in groups) {
    groups[c].sort((a, b) => {
      const ta = parseThaiDate(a.date);
      const tb = parseThaiDate(b.date);
      if (ta !== tb) return ta - tb;
      if (a.roomNum !== b.roomNum) return (a.roomNum ?? 0) - (b.roomNum ?? 0);
      return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
    });
  }
  const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
  return { sortedKeys, groups };
}

export async function exportWord(grouped: ReturnType<typeof groupByClass>, semester: string, year: string) {
  const docx = (window as any).docx;
  if (!docx) throw new Error("docx-not-loaded");
  const { sortedKeys, groups } = grouped;
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak, VerticalAlign } = docx;
  const sections: any[] = [];

  sortedKeys.forEach((classNum) => {
    const classData = groups[classNum];
    const dateCounts: Record<string, number> = {};
    classData.forEach((item) => (dateCounts[item.date] = (dateCounts[item.date] || 0) + 1));
    const children: any[] = [];
    for (let i = 0; i < 12; i++) children.push(new Paragraph({ text: "" }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `ชั้นมัธยมศึกษาปีที่ ${classNum}`, bold: true, size: 96 })] }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: `สรุปรายชื่อสาย - เฉื่อย ชั้นมัธยมศึกษาปีที่ ${classNum} ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`, bold: true, size: 30 })],
      }),
    );
    const head = (text: string, size: number) => new TableCell({ width: { size, type: WidthType.DXA }, children: [new Paragraph({ text, alignment: AlignmentType.CENTER })] });
    const rows: any[] = [
      new TableRow({ children: [head("วัน/เดือน/ปี", 1247), head("รหัสประจำตัว", 1417), head("ชื่อ-สกุล", 2835), head("ชั้น", 850), head("เลขที่", 680), head("รายการผิดระเบียบ", 4592)] }),
    ];
    const seen: Record<string, boolean> = {};
    classData.forEach((item) => {
      const classRoom = item.cls && item.room ? `${item.cls}/${item.room}` : item.cls;
      const numberDisplay = item.number ? `${item.number}${item.classType}` : "";
      const cells: any[] = [];
      if (!seen[item.date]) {
        cells.push(new TableCell({ rowSpan: dateCounts[item.date], verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: item.date, alignment: AlignmentType.CENTER })] }));
        seen[item.date] = true;
      }
      cells.push(new TableCell({ children: [new Paragraph({ text: item.studentId, alignment: AlignmentType.CENTER })] }));
      cells.push(new TableCell({ children: [new Paragraph({ text: item.name })] }));
      cells.push(new TableCell({ children: [new Paragraph({ text: classRoom, alignment: AlignmentType.CENTER })] }));
      cells.push(new TableCell({ children: [new Paragraph({ text: numberDisplay, alignment: AlignmentType.CENTER })] }));
      cells.push(new TableCell({ children: [new Paragraph({ text: item.violations })] }));
      rows.push(new TableRow({ children: cells }));
    });
    children.push(new Table({ columnWidths: [1247, 1417, 2835, 850, 680, 4592], width: { size: 11621, type: WidthType.DXA }, layout: "fixed", rows }));
    sections.push({ properties: { page: { margin: { top: 720, right: 142, bottom: 720, left: 142 } } }, children });
  });

  const doc = new Document({
    styles: { default: { document: { run: { size: 18, font: "Sarabun" }, paragraph: { spacing: { before: 40, after: 40 } } } } },
    sections,
  });
  const blob: Blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `สรุปสาย-เฉื่อย_${year}_เทอม${semester}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
