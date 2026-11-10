import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const totalUsers = await prisma.user.count({
      where: { isDeleted: false, role: "SMOKER" }
    });

    // To compute avoided cigarettes and money saved, we need baseline and logs
    const users = await prisma.user.findMany({
      where: { isDeleted: false, role: "SMOKER" },
      select: {
        cigarettesPerDay: true,
        pricePerPack: true,
        cigarettesPerPack: true,
        dailyLogs: {
          select: {
            cigarettesSmoked: true,
          }
        }
      }
    });

    let totalCigarettesAvoided = 0;
    let totalMoneySaved = 0;

    for (const user of users) {
      const baseline = user.cigarettesPerDay || 0;
      if (baseline > 0) {
        for (const log of user.dailyLogs) {
          const avoided = Math.max(0, baseline - log.cigarettesSmoked);
          totalCigarettesAvoided += avoided;

          if (user.pricePerPack && user.cigarettesPerPack && user.cigarettesPerPack > 0) {
            const pricePerCigarette = user.pricePerPack / user.cigarettesPerPack;
            totalMoneySaved += avoided * pricePerCigarette;
          }
        }
      }
    }

    // Round total money saved to 2 decimal places if needed, but returning as number is fine
    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalCigarettesAvoided,
        totalMoneySaved: Math.round(totalMoneySaved * 100) / 100
      }
    }, { status: 200 });

  } catch (error) {
    console.error("Public stats error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
