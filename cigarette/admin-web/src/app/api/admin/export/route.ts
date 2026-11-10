import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return new NextResponse("Authentication required", { status: 401 });
  }

  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });

    if (!adminUser || adminUser.role !== "ADMIN") {
      return new NextResponse("Forbidden. Admin privileges required.", {
        status: 403,
      });
    }

    const format = request.nextUrl.searchParams.get("format") || "csv";
    const roleFilter = request.nextUrl.searchParams.get("role") || "SMOKER";
    const validRoles = ["SMOKER", "FAMILY"];
    const role = validRoles.includes(roleFilter) ? roleFilter : "SMOKER";

    const users = await prisma.user.findMany({
      where: { role: role as "SMOKER" | "FAMILY" },
      include: {
        dailyLogs: { orderBy: { logDate: "asc" } },
        followedSmokers: role === "FAMILY" ? { select: { displayName: true, phoneNumber: true } } : false,
      },
      orderBy: { createdAt: "asc" },
    });

    // Prepare Data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exportData: any[] = [];

    for (const u of users) {
      if (role === "SMOKER") {
        const baseline = u.cigarettesPerDay ?? 0;
        const totalLogs = u.dailyLogs.length;
        const totalSmoked = u.dailyLogs.reduce((sum, l) => sum + l.cigarettesSmoked, 0);
        const moneySaved = u.dailyLogs.reduce((sum, l) => {
          const avoided = Math.max(0, baseline - l.cigarettesSmoked);
          const valPerCig = (u.pricePerPack ?? 0) / (u.cigarettesPerPack ?? 20);
          return sum + avoided * valPerCig;
        }, 0);
        
        const totalGamesPlayed = u.dailyLogs.reduce((sum, l) => sum + (l.gamesPlayed || 0), 0);
        const totalArticlesRead = u.dailyLogs.reduce((sum, l) => sum + (l.articlesRead || 0), 0);
        const totalSoundsListened = u.dailyLogs.reduce((sum, l) => sum + (l.soundsListened || 0), 0);

        exportData.push({
          "Name": u.displayName,
          "Phone": u.phoneNumber,
          "Join Date": u.createdAt.toISOString().split("T")[0],
          "Type": u.smokingType,
          "Baseline/Day": baseline,
          "Total Logs": totalLogs,
          "Total Smoked": totalSmoked,
          "Money Saved (THB)": moneySaved.toFixed(2),
          "Games Played": totalGamesPlayed,
          "Articles Read": totalArticlesRead,
          "Sounds Listened": totalSoundsListened,
          "XP": u.xp,
        });
      } else {
        // FAMILY
        exportData.push({
          "Name": u.displayName,
          "Phone": u.phoneNumber,
          "Join Date": u.createdAt.toISOString().split("T")[0],
          "Linked Smoker Name": (u as any).followedSmokers?.[0]?.displayName || "-",
          "Linked Smoker Phone": (u as any).followedSmokers?.[0]?.phoneNumber || "-",
          "XP": u.xp,
        });
      }
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const roleLabel = role === "FAMILY" ? "family" : "smokers";
    const filename = `nextbreath_${roleLabel}_${dateStr}`;

    if (format === "json") {
      return NextResponse.json(exportData, { status: 200 });
    }

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      // jsPDF does not support Thai characters without custom fonts. 
      // We will export English headers and try our best with data.
      const doc = new jsPDF("landscape");
      
      // Add a simple Header / Logo
      doc.setFontSize(22);
      doc.setTextColor(108, 99, 255); // #6c63ff (Accent color)
      doc.text("Next Breath", 14, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Data Export - ${role} Report`, 14, 28);
      doc.text(`Generated: ${dateStr}`, 14, 34);

      const columns = exportData.length > 0 ? Object.keys(exportData[0]) : [];
      const rows = exportData.map(obj => columns.map(col => String(obj[col])));

      autoTable(doc, {
        head: [columns],
        body: rows,
        startY: 40,
        styles: { font: "helvetica", fontSize: 10 },
        headStyles: { fillColor: [108, 99, 255] },
      });

      const pdfBuf = doc.output("arraybuffer");
      return new NextResponse(pdfBuf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        },
      });
    }

    // Default: CSV
    let csvStr = "";
    if (exportData.length > 0) {
      const headers = Object.keys(exportData[0]);
      csvStr += headers.join(",") + "\n";
      for (const row of exportData) {
        csvStr += headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(",") + "\n";
      }
    }

    // Add UTF-8 BOM for Excel compatibility
    const bom = "\uFEFF";
    return new NextResponse(bom + csvStr, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", (error as Error).message);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
