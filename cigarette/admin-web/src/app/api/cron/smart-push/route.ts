import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/firebase';

// Helper to calculate streak
function calculateStreak(logs: any[]) {
  if (!logs || logs.length === 0) return 0;
  logs.sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime());
  
  let streak = 0;
  const today = new Date();
  today.setUTCHours(today.getUTCHours() + 7);
  today.setUTCHours(0,0,0,0);
  
  let expectedDate = new Date(today);
  
  let firstLogDate = new Date(logs[0].logDate);
  firstLogDate.setUTCHours(firstLogDate.getUTCHours() + 7);
  firstLogDate.setUTCHours(0,0,0,0);
  
  if (firstLogDate.getTime() === expectedDate.getTime()) {
    // Logged today
  } else {
    expectedDate.setDate(expectedDate.getDate() - 1);
    if (firstLogDate.getTime() === expectedDate.getTime()) {
      // Logged yesterday
    } else {
      return 0;
    }
  }
  
  for (const log of logs) {
    let d = new Date(log.logDate);
    d.setUTCHours(d.getUTCHours() + 7);
    d.setUTCHours(0,0,0,0);
    if (d.getTime() === expectedDate.getTime()) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    }
  }
  return streak;
}

function getNotificationTime(cravingTimeStr: string | null | undefined) {
  if (!cravingTimeStr) return { hour: 14, minute: 0 };
  const s = cravingTimeStr.toLowerCase();
  if (s.includes('ตื่นนอน')) return { hour: 7, minute: 0 };
  if (s.includes('หลังอาหาร')) return { hour: 12, minute: 0 };
  if (s.includes('ก่อนนอน')) return { hour: 21, minute: 30 };
  if (s.includes('เช้า')) return { hour: 8, minute: 30 };
  if (s.includes('บ่าย')) return { hour: 13, minute: 30 };
  if (s.includes('เย็น')) return { hour: 17, minute: 30 };
  if (s.includes('ดึก')) return { hour: 21, minute: 30 };
  return { hour: 14, minute: 0 };
}

const TEMPLATES: Record<string, string[]> = {
  ACTIVE_REDUCING: [
    "เยี่ยมมาก! คุณลดการสูบได้ {reduced} มวนแล้ว ความพยายามของคุณกำลังเห็นผล",
    "ทำได้ดีมาก วันนี้คุณประหยัดเงินไปได้ {moneySaved} บาทแล้วนะ",
    "สุดยอด! คุณทำสถิติต่อเนื่องมา {streak} วันแล้ว รักษาระดับไว้นะ",
    "ระดับ {level} แล้ว! การลดจำนวนลงแสดงถึงความเข้มแข็งของคุณ",
    "ภูมิใจในตัวคุณจัง คุณลดการสูบได้ดีกว่าสัปดาห์ก่อนอย่างเห็นได้ชัด",
    "ร่างกายของคุณกำลังขอบคุณที่คุณลดจำนวนมวนลง สู้ต่อไปนะ",
    "การเปลี่ยนแปลงเล็กๆ นำไปสู่ผลลัพธ์ที่ยิ่งใหญ่ คุณกำลังมาถูกทางแล้ว",
    "คุณประหยัดเงินไปได้ {moneySaved} บาท เอาไปซื้อของอร่อยๆ ให้ตัวเองนะ",
    "ความตั้งใจของคุณแข็งแกร่งมาก ลดได้ {reduced} มวนไม่ใช่เรื่องง่ายเลย",
    "เราเห็นความพยายามของคุณนะ วันนี้คุณทำได้ดีมากๆ",
    "สถิติ {streak} วันของคุณเป็นเครื่องยืนยันว่าคุณทำได้!",
    "ทุกมวนที่ลดได้ คือก้าวสำคัญสู่สุขภาพที่ดีขึ้น",
    "เก่งมาก! คุณมีวินัยในการลดจำนวนมวนได้ดีเยี่ยม",
    "สู้ๆ นะ คุณกำลังเข้าใกล้เป้าหมายไปอีกก้าวแล้ว",
    "ความสำเร็จอยู่ไม่ไกล คุณลดการสูบลงได้เรื่อยๆ เลย"
  ],
  ACTIVE_STABLE: [
    "ลองตั้งเป้าหมายลดลงอีกสัก 1 มวนในวันนี้ดูไหม? คุณทำได้แน่นอน",
    "สถิติของคุณอยู่ที่ {average} มวนต่อวัน ลองท้าทายตัวเองลดลงอีกนิดนะ",
    "คุณบันทึกต่อเนื่องมา {streak} วันแล้ว ยอดเยี่ยมมาก! ลองลดจำนวนดูนะ",
    "รักษาระดับได้ดีมาก! ถ้าพร้อมแล้ว ลองค่อยๆ ลดจำนวนลงดูนะ",
    "เราเป็นกำลังใจให้นะ วันนี้ลองสูบน้อยลงกว่าเมื่อวานสักนิดดูไหม",
    "คุณมาไกลแล้วนะ ลองลดปริมาณลงทีละนิด ร่างกายจะดีขึ้นอีกเยอะ",
    "บันทึกข้อมูลได้สม่ำเสมอมาก! ลองตั้งเป้าหมายใหม่ลดลงอีกสักมวนนะ",
    "ความสม่ำเสมอของคุณเยี่ยมไปเลย ลองท้าทายตัวเองลดจำนวนลงอีกหน่อย",
    "วันนี้ลองหากิจกรรมใหม่ๆ ทำดู อาจจะช่วยให้สูบน้อยลงได้นะ",
    "ทุกความพยายามมีความหมาย ลองลดลงอีกนิด คุณทำได้!",
    "ก้าวต่อไปคือการค่อยๆ ลดปริมาณ เราเชื่อว่าคุณทำได้",
    "คุณเก่งมากที่จดบันทึกทุกวัน ลองลดปริมาณลงอีกสักนิดเพื่อสุขภาพนะ"
  ],
  ACTIVE_INCREASING: [
    "ช่วงนี้อาจจะเครียดไปบ้าง ไม่เป็นไรนะ ค่อยๆ เริ่มใหม่ได้เสมอ",
    "อย่าเพิ่งท้อนะ ถ้าวันนี้สูบเยอะไป พรุ่งนี้ค่อยตั้งเป้าหมายใหม่",
    "เรารู้ว่าการเลิกไม่ใช่เรื่องง่าย เป็นกำลังใจให้คุณเสมอ",
    "มีวันที่ยากลำบากบ้างเป็นเรื่องปกติ พรุ่งนี้เริ่มต้นใหม่ได้นะ",
    "ถ้าเครียด ลองหายใจเข้าลึกๆ หรือหาคนคุยด้วยดูนะ",
    "ไม่เป็นไรนะที่คุณสูบเพิ่มขึ้น ความพยายามที่ผ่านมาไม่ได้สูญเปล่า",
    "เราอยู่ตรงนี้เสมอ ถ้าต้องการความช่วยเหลือ เข้ามาในแอปได้นะ",
    "ความผิดพลาดคือส่วนหนึ่งของการเรียนรู้ สู้ต่อไปนะ",
    "ค่อยๆ ปรับตัวไปนะ ไม่ต้องกดดันตัวเองมากเกินไป",
    "ให้เวลาตัวเองหน่อยนะ พรุ่งนี้ค่อยพยายามใหม่",
    "เราเชื่อว่าคุณมีความเข้มแข็งพอที่จะกลับมาลดจำนวนลงได้",
    "อย่าเพิ่งหมดกำลังใจนะ ทุกคนมีวันที่สะดุดได้ทั้งนั้น"
  ],
  INACTIVE_SHORT: [
    "เราคิดถึงคุณนะ แวะมาบันทึกข้อมูลวันนี้สักหน่อยสิ",
    "คุณไม่ได้บันทึกข้อมูลมา {daysSinceLog} วันแล้ว อย่าลืมเข้ามาอัปเดตนะ",
    "สถิติ {streak} วันของคุณกำลังรอให้คุณมาสานต่ออยู่นะ",
    "วันนี้เป็นยังไงบ้าง? เข้ามาเล่าให้เราฟังหน่อยนะ",
    "แวะมาอัปเดตข้อมูลสักนิด เพื่อเป้าหมายของคุณเองนะ",
    "เรายังรอเป็นกำลังใจให้คุณอยู่เสมอ เข้ามาบันทึกข้อมูลกันเถอะ",
    "อย่าลืมเป้าหมายที่คุณตั้งไว้นะ แวะมาบันทึกข้อมูลกัน",
    "ใช้เวลาแค่แป๊บเดียว มาบันทึกข้อมูลวันนี้กันนะ",
    "ทุกการบันทึกคือความก้าวหน้า อย่าปล่อยให้ขาดตอนนะ",
    "เราพร้อมสนับสนุนคุณเสมอ แวะมาอัปเดตความคืบหน้าหน่อยนะ",
    "ยังจำความตั้งใจแรกได้ไหม? กลับมาบันทึกข้อมูลกันเถอะ",
    "ข้อมูลของคุณสำคัญนะ แวะมาอัปเดตให้เราฟังหน่อย"
  ],
  INACTIVE_LONG: [
    "ยินดีต้อนรับกลับมาเสมอ ไม่ว่าคุณจะหายไปนานแค่ไหน เรายังอยู่ที่นี่",
    "เริ่มต้นใหม่ได้เสมอ แวะมาอัปเดตเรื่องราวของคุณให้เราฟังหน่อยนะ",
    "เรายังเชื่อในตัวคุณนะ กลับมาพยายามด้วยกันอีกครั้งเถอะ",
    "ไม่ได้เจอกันนานเลย วันนี้พร้อมจะกลับมาเริ่มต้นใหม่หรือยัง?",
    "ไม่ว่าจะเกิดอะไรขึ้น คุณสามารถเริ่มต้นใหม่กับเราได้เสมอ",
    "หายไป {daysSinceLog} วัน ไม่เป็นไรนะ วันนี้กลับมาเริ่มต้นใหม่ได้",
    "ความตั้งใจของคุณยังคงอยู่ กลับมาสานต่อกันเถอะ",
    "เราเป็นกำลังใจให้คุณเสมอ ไม่ว่าคุณจะพร้อมเมื่อไหร่",
    "กลับมาคราวนี้ เราจะสู้ไปด้วยกันนะ",
    "ไม่มีคำว่าสายเกินไปสำหรับการเริ่มต้นใหม่ กลับมาบันทึกข้อมูลกัน"
  ],
  NEW_USER: [
    "ยินดีต้อนรับ! ขอบคุณที่ให้เราเป็นส่วนหนึ่งในการเดินทางของคุณ",
    "การตัดสินใจเลิกบุหรี่คือของขวัญที่ดีที่สุดที่คุณมอบให้ตัวเอง",
    "คุณเข้าร่วมมาได้ {daysSinceJoin} วันแล้ว สู้ๆ นะ!",
    "ลองสำรวจฟีเจอร์ต่างๆ ในแอปดูนะ มีตัวช่วยมากมายรอคุณอยู่",
    "การจดบันทึกทุกวันจะช่วยให้คุณเห็นความก้าวหน้าของตัวเองชัดเจนขึ้น",
    "มาร่วมสร้างสถิติใหม่ไปด้วยกันนะ เราพร้อมสนับสนุนคุณ",
    "ก้าวแรกสำคัญเสมอ คุณทำได้ดีมากที่ตัดสินใจเริ่มต้น",
    "ลองตั้งเป้าหมายเล็กๆ ในแต่ละวันดูนะ ค่อยๆ เป็น ค่อยๆ ไป",
    "หากิจกรรมอื่นทำเมื่อรู้สึกอยากสูบ ในแอปมีเกมและเสียงผ่อนคลายนะ",
    "เราภูมิใจที่คุณเลือกดูแลสุขภาพตัวเอง สู้ไปด้วยกันนะ"
  ],
  STREAK_MILESTONE: [
    "ยินดีด้วย! คุณทำสถิติต่อเนื่องมา {streak} วันแล้ว ยอดเยี่ยมมาก!",
    "ฉลองความสำเร็จ {streak} วัน! ความพยายามของคุณสุดยอดจริงๆ",
    "คุณพิสูจน์ให้เห็นแล้วว่าคุณทำได้! {streak} วันแล้ว สู้ต่อไปนะ",
    "ความมุ่งมั่นของคุณเกินร้อย! รักษาสถิติ {streak} วันนี้ไว้นะ",
    "คุณเก่งมากๆ ที่ผ่านช่วงเวลายากลำบากมาได้ถึง {streak} วัน",
    "เราภูมิใจในตัวคุณมาก สถิติ {streak} วันนี้มีความหมายมากนะ",
    "เป็น {streak} วันที่เต็มไปด้วยความพยายาม ขอให้ภูมิใจในตัวเองนะ",
    "ก้าวต่อไปด้วยความมั่นใจ คุณทำได้ดีมากแล้วในช่วง {streak} วันที่ผ่านมา"
  ],
  HEALTH_FACTS: [
    "รู้ไหม? หลังหยุดสูบ 20 นาที ชีพจรและความดันโลหิตจะเริ่มกลับสู่ปกติ",
    "หลังหยุดสูบ 12 ชั่วโมง ระดับคาร์บอนมอนอกไซด์ในเลือดจะกลับสู่ระดับปกติ",
    "หลังหยุดสูบ 48 ชั่วโมง ปลายประสาทรับรสและกลิ่นจะเริ่มฟื้นตัว",
    "หลังหยุดสูบ 2-12 สัปดาห์ การไหลเวียนเลือดจะดีขึ้น การเดินจะเหนื่อยน้อยลง",
    "หลังหยุดสูบ 1-9 เดือน อาการไอและเหนื่อยหอบจะลดลง ปอดทำงานได้ดีขึ้น",
    "หลังหยุดสูบ 1 ปี ความเสี่ยงโรคหัวใจจะลดลงครึ่งหนึ่งของคนสูบบุหรี่",
    "หลังหยุดสูบ 5 ปี ความเสี่ยงโรคหลอดเลือดสมองจะลดลงเท่ากับคนไม่สูบ",
    "หลังหยุดสูบ 10 ปี ความเสี่ยงมะเร็งปอดจะลดลงครึ่งหนึ่ง",
    "การเลิกบุหรี่ช่วยให้ผิวพรรณสดใสขึ้นและชะลอการเกิดริ้วรอยนะ",
    "ฟันของคุณจะขาวขึ้นและลมหายใจจะสดชื่นขึ้นเมื่อหยุดสูบ",
    "การเลิกบุหรี่ช่วยให้ระบบภูมิคุ้มกันของคุณแข็งแรงขึ้น",
    "ปอดของคุณกำลังทำความสะอาดตัวเองอย่างเต็มที่ สู้ต่อไปนะ",
    "หัวใจของคุณทำงานเบาลงและแข็งแรงขึ้นในทุกๆ วันที่หยุดสูบ",
    "การรับรู้รสชาติอาหารของคุณจะกลับมาอร่อยเหมือนเดิม",
    "การเลิกบุหรี่ไม่เพียงแต่ดีต่อคุณ แต่ยังดีต่อคนรอบข้างด้วย"
  ],
  MOTIVATION: [
    "ทุกความพยายามมีความหมาย แม้จะเป็นก้าวเล็กๆ ก็ตาม",
    "เชื่อมั่นในตัวเองนะ คุณมีความเข้มแข็งมากกว่าที่คุณคิด",
    "วันนี้อาจจะยาก แต่พรุ่งนี้จะง่ายขึ้น สู้ๆ นะ",
    "อย่ายอมแพ้ต่อความอยาก ความเข้มแข็งอยู่ในตัวคุณ",
    "เราเป็นกำลังใจให้คุณเสมอ ไม่ว่าคุณจะเผชิญกับอะไร",
    "คุณไม่ได้อยู่คนเดียว เราพร้อมสนับสนุนคุณในทุกก้าว",
    "ความสำเร็จไม่ได้มาในวันเดียว ค่อยๆ พยายามต่อไปนะ",
    "จงภูมิใจในทุกๆ วันที่คุณพยายามเป็นคนที่ดีขึ้น",
    "เมื่อรู้สึกท้อ ลองนึกถึงเหตุผลที่คุณเริ่มต้นดูนะ",
    "ความตั้งใจจริงของคุณจะนำพาคุณไปสู่ความสำเร็จ",
    "ไม่มีอะไรที่คุณทำไม่ได้ หากคุณตั้งใจจริง",
    "วันนี้เป็นอีกหนึ่งโอกาสในการดูแลตัวเอง ทำให้ดีที่สุดนะ",
    "ความสุขที่แท้จริงคือการมีสุขภาพที่แข็งแรง สู้ต่อไป",
    "ทุกวินาทีที่คุณไม่สูบ คือชัยชนะที่ยิ่งใหญ่",
    "เราชื่นชมในความพยายามของคุณ คุณเก่งมาก!"
  ]
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const force = searchParams.get('force') === 'true';

    if (key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const bkkHour = bkkNow.getUTCHours();
    const bkkMinute = bkkNow.getUTCMinutes();
    const bkkDateStr = bkkNow.toISOString().split('T')[0];

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const users = await prisma.user.findMany({
      where: { role: 'SMOKER', isDeleted: false, fcmToken: { not: null } },
      include: {
        surveyResponse: true,
        dailyLogs: {
          where: { logDate: { gte: fourteenDaysAgo } },
          orderBy: { logDate: 'desc' }
        }
      }
    });

    let sentCount = 0;
    const sentTo = [];
    const skipped = [];
    
    for (const user of users) {
      if (!user.fcmToken) {
        skipped.push({ id: user.displayId, reason: 'No FCM token' });
        continue;
      }
      
      const lastSentAt = user.lastNotificationSentAt;
      if (lastSentAt && !force) {
        const lastSentBkk = new Date(lastSentAt.getTime() + 7 * 60 * 60 * 1000);
        if (lastSentBkk.toISOString().split('T')[0] === bkkDateStr) {
          skipped.push({ id: user.displayId, reason: 'Already sent today' });
          continue;
        }
      }

      const notifTime = getNotificationTime(user.surveyResponse?.cravingTime);
      
      if (!force && (bkkHour !== notifTime.hour || bkkMinute !== notifTime.minute)) {
         skipped.push({ id: user.displayId, reason: `Not the time (target ${notifTime.hour}:${notifTime.minute}, now ${bkkHour}:${bkkMinute})` });
         continue;
      }

      const logs = user.dailyLogs || [];
      const streak = calculateStreak(logs);
      let category = 'MOTIVATION';
      let variables: any = {};
      
      const daysSinceJoin = Math.floor((bkkNow.getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      
      let daysSinceLog = 999;
      if (logs.length > 0) {
        const lastLogBkk = new Date(logs[0].logDate);
        lastLogBkk.setUTCHours(lastLogBkk.getUTCHours() + 7);
        lastLogBkk.setUTCHours(0,0,0,0);
        const todayBkk = new Date(bkkNow);
        todayBkk.setUTCHours(0,0,0,0);
        daysSinceLog = Math.floor((todayBkk.getTime() - lastLogBkk.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (daysSinceJoin <= 7) {
        category = 'NEW_USER';
        variables = { daysSinceJoin };
      } else if (daysSinceLog >= 4) {
        category = 'INACTIVE_LONG';
        variables = { daysSinceLog };
      } else if (daysSinceLog >= 1 && daysSinceLog <= 3) {
        category = 'INACTIVE_SHORT';
        variables = { daysSinceLog, streak };
      } else if ([3, 7, 14, 30, 60, 90].includes(streak)) {
        category = 'STREAK_MILESTONE';
        variables = { streak };
      } else if (logs.length >= 7) {
        const recentLogs = logs.slice(0, 7);
        const prevLogs = logs.slice(7, 14);
        
        const recentAvg = recentLogs.reduce((sum, log) => sum + log.cigarettesSmoked, 0) / recentLogs.length;
        const prevAvg = prevLogs.length > 0 ? prevLogs.reduce((sum, log) => sum + log.cigarettesSmoked, 0) / prevLogs.length : recentAvg;
        
        variables = { 
          streak, 
          average: recentAvg.toFixed(1),
          level: Math.floor(user.xp / 100) + 1 
        };

        if (recentAvg < prevAvg - 0.5) {
          category = 'ACTIVE_REDUCING';
          const reduced = prevAvg - recentAvg;
          const pricePerCig = (user.pricePerPack || 100) / (user.cigarettesPerPack || 20);
          variables.reduced = reduced.toFixed(1);
          variables.moneySaved = (reduced * pricePerCig).toFixed(0);
        } else if (recentAvg > prevAvg + 0.5) {
          category = 'ACTIVE_INCREASING';
        } else {
          category = 'ACTIVE_STABLE';
        }
      } else {
        category = Math.random() > 0.5 ? 'HEALTH_FACTS' : 'MOTIVATION';
      }

      if (daysSinceLog === 0 && Math.random() < 0.1) {
        category = 'HEALTH_FACTS';
      }

      const templates = TEMPLATES[category] || TEMPLATES.MOTIVATION;
      const rawMessage = templates[Math.floor(Math.random() * templates.length)];
      
      let finalMessage = rawMessage;
      for (const [key, value] of Object.entries(variables)) {
        finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), String(value));
      }
      
      try {
        await sendPushNotification([user.fcmToken], 'NextBreath เป็นกำลังใจให้คุณ', finalMessage);
        sentCount++;
        sentTo.push({ id: user.displayId, category, message: finalMessage });
          
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              lastNotificationSentAt: new Date(),
              notificationDayIndex: { increment: 1 }
            }
          });
      } catch (err: any) {
        console.error(`[CRON API] Failed to send push to ${user.displayId}:`, err);
        skipped.push({ id: user.displayId, reason: `Error: ${err.message}` });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sentCount} notifications.`,
      sentCount,
      sentTo,
      skippedCount: skipped.length,
      skipped,
    });

  } catch (err: any) {
    console.error('[CRON API] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
