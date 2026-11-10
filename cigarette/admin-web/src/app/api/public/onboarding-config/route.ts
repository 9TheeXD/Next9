import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/onboarding-config
 *
 * Returns the onboarding form structure (questions, options, scoring).
 * Fetched by the mobile-app onboarding wizard so questions aren't hardcoded in the TSX.
 * This makes it easy to update questions without rebuilding the PWA.
 */
export async function GET() {
  const config = {
    success: true,
    data: {
      // Page 1: Basic Info
      basicInfo: {
        title: "ข้อมูลพื้นฐาน",
        fields: [
          {
            key: "ageGroup",
            label: "ช่วงอายุของคุณ",
            required: true,
            type: "radio",
            options: [
              "ต่ำกว่า 13",
              "13-18",
              "19-30",
              "31-45",
              "46-60",
              "60+",
            ],
          },
          {
            key: "gender",
            label: "เพศ",
            required: true,
            type: "radio",
            options: ["ผู้หญิง", "ผู้ชาย", "ไม่ระบุ"],
          },
        ],
      },

      // Page 2: Smoking Behavior
      smokingBehavior: {
        title: "พฤติกรรมการสูบ",
        roleQuestion: {
          key: "isSmokerStr",
          label: "คุณสูบบุหรี่หรือไม่",
          required: true,
          type: "radio",
          options: [
            "สูบอยู่ปัจจุบัน",
            "เคยสูบแต่เลิกแล้ว",
            "ไม่เคยสูบเลย",
          ],
          smokerValues: ["สูบอยู่ปัจจุบัน", "เคยสูบแต่เลิกแล้ว"],
        },
        smokerFields: [
          {
            key: "smokingType",
            label: "สูบบุหรี่ชนิดใด",
            required: true,
            type: "radio",
            options: ["บุหรี่ธรรมดา", "บุหรี่ไฟฟ้า(พอต)", "ทั้งสองอย่าง"],
          },
          {
            key: "smokingDuration",
            label: "สูบมานานแค่ไหน",
            required: true,
            type: "radio",
            options: [
              "น้อยกว่า 1 เดือน",
              "1-6 เดือน",
              "6 เดือน - 2 ปี",
              "มากกว่า 2 ปี",
            ],
          },
          {
            key: "cravingTime",
            label: "ช่วงเวลาที่อยากสูบมากที่สุด",
            required: false,
            type: "checkbox",
            options: [
              "เช้า(06-10)",
              "สาย(10-14)",
              "บ่าย(14-18)",
              "เย็น-ค่ำ(18-22)",
              "ดึก(22-06)",
            ],
          },
        ],
      },

      // Page 3: FTND Test (Smokers)
      ftndTest: {
        title: "แบบประเมินระดับการติดนิโคติน (Fagerstrom Test)",
        subtitle:
          "แบบทดสอบนี้ใช้ในทางการแพทย์เพื่อประเมินระดับการติดนิโคตินของคุณ",
        reference:
          "*อ้างอิง: Fagerstrom Test for Nicotine Dependence (FTND) - แบบทดสอบมาตรฐานที่ใช้ในทางการแพทย์ทั่วโลก",
        questions: [
          {
            key: "ftnd1",
            label: "ปกติคุณสูบมวนแรกภายในกี่นาทีหลังตื่นนอน",
            required: true,
            options: [
              { text: "ภายใน 5 นาที", score: 3 },
              { text: "6-30 นาที", score: 2 },
              { text: "31-60 นาที", score: 1 },
              { text: "มากกว่า 60 นาที", score: 0 },
            ],
          },
          {
            key: "ftnd2",
            label:
              "คุณรู้สึกลำบากที่จะอดสูบในสถานที่ห้ามสูบหรือไม่",
            required: true,
            options: [
              { text: "ใช่", score: 1 },
              { text: "ไม่", score: 0 },
            ],
          },
          {
            key: "ftnd3",
            label: "บุหรี่มวนไหนที่คุณเลิกยากที่สุด",
            required: true,
            options: [
              { text: "มวนแรกตอนเช้า", score: 1 },
              { text: "มวนอื่นๆ", score: 0 },
            ],
          },
          {
            key: "ftnd4",
            label: "คุณสูบวันละกี่มวน",
            required: true,
            options: [
              { text: "10 มวนหรือน้อยกว่า", score: 0 },
              { text: "11-20 มวน", score: 1 },
              { text: "21-30 มวน", score: 2 },
              { text: "มากกว่า 30 มวน", score: 3 },
            ],
          },
          {
            key: "ftnd5",
            label:
              "คุณสูบบ่อยขึ้นในช่วงชั่วโมงแรกหลังตื่นนอนหรือไม่",
            required: true,
            options: [
              { text: "ใช่", score: 1 },
              { text: "ไม่", score: 0 },
            ],
          },
          {
            key: "ftnd6",
            label:
              "คุณยังสูบแม้ป่วยจนต้องนอนพักทั้งวันหรือไม่",
            required: true,
            options: [
              { text: "ใช่", score: 1 },
              { text: "ไม่", score: 0 },
            ],
          },
        ],
        supplementary: [
          {
            key: "q7",
            label: "เมื่ออยากสูบบุหรี่ ปกติคุณจัดการอย่างไร",
            required: false,
            type: "radio",
            options: [
              "สูบทันที",
              "พยายามอดทน",
              "หากิจกรรมอื่นทำ",
              "โทรหาคนใกล้ชิด",
            ],
          },
        ],
      },

      // Page 3B: Follower Questions
      followerQuestions: {
        title: "ข้อมูลผู้ติดตาม",
        fields: [
          {
            key: "hasSmoker",
            label: "มีคนใกล้ตัวที่สูบบุหรี่หรือไม่",
            required: true,
            type: "radio",
            options: ["มี", "ไม่มี"],
            conditionalValue: "มี",
          },
          {
            key: "relationship",
            label: "คุณเป็นอะไรกับผู้สูบ",
            required: true,
            type: "radio",
            conditional: "hasSmoker",
            options: [
              "พ่อแม่/ผู้ปกครอง",
              "พี่น้อง",
              "คู่สมรส/แฟน",
              "เพื่อน",
              "ลูก/หลาน",
              "อื่นๆ",
            ],
          },
          {
            key: "frequencyView",
            label: "ในมุมมองของคุณ เขาสูบบ่อยแค่ไหน",
            required: true,
            type: "radio",
            conditional: "hasSmoker",
            options: [
              "สูบทุกวัน",
              "สูบเป็นบางวัน",
              "สูบเฉพาะเวลาเครียด",
              "ไม่แน่ใจ",
            ],
          },
          {
            key: "concern",
            label: "คุณกังวลเรื่องอะไรมากที่สุด",
            required: true,
            type: "radio",
            conditional: "hasSmoker",
            hasOther: true,
            options: [
              "สุขภาพของผู้สูบ",
              "ควันบุหรี่มือสอง",
              "ค่าใช้จ่าย",
            ],
          },
          {
            key: "helpMethod",
            label: "คุณอยากช่วยเขาด้วยวิธีไหน",
            required: true,
            type: "radio",
            conditional: "hasSmoker",
            options: [
              "ให้กำลังใจผ่านข้อความ/แอป",
              "ชวนทำกิจกรรมเบี่ยงเบน",
              "จัดการสภาพแวดล้อม",
              "ให้รางวัลเมื่อสำเร็จ",
              "อื่นๆ",
            ],
          },
          {
            key: "gift",
            label:
              "ถ้าเขาเลิกบุหรี่สำเร็จ อยากให้ของขวัญอะไร",
            required: false,
            type: "text",
            conditional: "hasSmoker",
            placeholder: "โปรดระบุ",
          },
        ],
      },

      // Page 4: Motivation (Smokers)
      motivation: {
        title: "แรงจูงใจ",
        fields: [
          {
            key: "wantToQuit",
            label: "ตอนนี้คุณอยากเลิกสูบบุหรี่หรือไม่",
            required: true,
            type: "radio",
            options: [
              "อยากเลิกมาก",
              "อยากลองลด",
              "ยังไม่แน่ใจ",
              "ไม่อยากเลิก",
            ],
            conditionalShowKeys: ["reasonToQuit"],
            conditionalShowValues: ["อยากเลิกมาก", "อยากลองลด"],
          },
          {
            key: "reasonToQuit",
            label: "เหตุผลหลักที่อยากเลิก",
            required: false,
            type: "radio",
            options: [
              "สุขภาพ",
              "ค่าใช้จ่าย",
              "ครอบครัว/คนรอบข้าง",
              "การเรียน/งาน",
              "อื่นๆ",
            ],
          },
          {
            key: "previousMethods",
            label:
              "เคยลองเลิกด้วยวิธีไหนมาก่อนบ้าง",
            required: false,
            type: "text",
            placeholder: "โปรดระบุ",
          },
          {
            key: "longestQuit",
            label: "เลิกนานที่สุดได้แค่ไหน",
            required: false,
            type: "text",
            placeholder: "โปรดระบุ",
          },
          {
            key: "interestedHelp",
            label: "สนใจให้แอปช่วยเรื่องอะไร",
            required: false,
            type: "text",
            placeholder: "โปรดระบุ",
          },
        ],
      },

      // Page 5: Risk Assessment Result (computed client-side from FTND scores & scientific models)
      riskAssessment: {
        levels: [
          {
            range: [0, 2],
            level: "LOW",
            name: "ติดนิโคตินระดับต่ำมาก (Very Low Physical Dependence)",
            color: "#10b981",
            description:
              "ผลประเมินตามเกณฑ์ Fagerström (FTND) บ่งชี้ว่าร่างกายยังไม่มีการพึ่งพานิโคตินทางกายภาพในระดับสูง ตัวรับนิโคตินในสมอง (Nicotinic Receptors) ยังไม่เปลี่ยนแปลงมาก ถือเป็นช่วงเวลาทองที่คุณมีโอกาสเลิกสำเร็จด้วยตนเองสูงที่สุด",
            tips: [
              "หลีกเลี่ยงปัจจัยกระตุ้นทางพฤติกรรม (เช่น การดื่มกาแฟ/แอลกอฮอล์ หรือการสูบหลังมื้ออาหาร)",
              "ปรับเปลี่ยนกิจวัตรประจำวันและดื่มน้ำเปล่าให้เพียงพอเมื่อรู้สึกอยาก",
              "ใช้แอปบันทึกความก้าวหน้าเพื่อสร้างแรงจูงใจต่อเนื่อง",
            ],
          },
          {
            range: [3, 4],
            level: "LOW_MODERATE",
            name: "ติดนิโคตินระดับต่ำถึงปานกลาง (Low to Moderate Dependence)",
            color: "#84cc16",
            description:
              "เริ่มมีการพึ่งพานิโคตินทางกายภาพ สมองเริ่มปรับตัวต่อการได้รับสารนิโคตินเป็นประจำ เมื่อหยุดสูบอาจมีอาการถอนนิโคติน (Withdrawal Symptoms) เล็กน้อย เช่น หงุดหงิด วิตกกังวล หรือกระวนกระวายในช่วง 1-3 วันแรก",
            tips: [
              "ฝึกเทคนิคการหายใจช้าๆ (Deep Breathing) เมื่อเกิดอาการอยากสูบ (Craving)",
              "ใช้ฟังก์ชันมินิเกมหรือฟังเสียงบำบัดในแอปเพื่อเบี่ยงเบนความสนใจ 3-5 นาที",
              "เตรียมผลไม้รสเปรี้ยวหรือของว่างแคลอรี่ต่ำไว้เคี้ยวทดแทน",
            ],
          },
          {
            range: [5, 7],
            level: "MODERATE",
            name: "ติดนิโคตินระดับปานกลาง (Moderate Dependence)",
            color: "#f59e0b",
            description:
              "มีความต้องการนิโคตินสม่ำเสมอในกระแสเลือด ตัวรับนิโคตินในสมองมีความไวสูง การหยุดสูบทันทีอาจส่งผลให้อาการถอนชัดเจน เช่น อารมณ์แปรปรวน สมาธิสั้น อยากอาหารเพิ่มขึ้น หรือนอนไม่หลับ",
            tips: [
              "วางแผนลดปริมาณอย่างเป็นระบบควบคู่กับการใช้เครื่องมือติดตามในแอป",
              "ปรึกษาบุคลากรทางการแพทย์หรือเภสัชกรเกี่ยวกับการใช้นิโคตินทดแทน (NRT เช่น หมากฝรั่งหรือแผ่นแปะ)",
              "โทรปรึกษาสายด่วนเลิกบุหรี่ 1600 เพื่อรับคำแนะนำเชิงพฤติกรรมบำบัดฟรี",
            ],
          },
          {
            range: [8, 10],
            level: "HIGH",
            name: "ติดนิโคตินระดับสูงมาก (High Dependence)",
            color: "#ef4444",
            description:
              "ร่างกายและสมองมีความเคยชินและพึ่งพานิโคตินในระดับสูงมาก จำเป็นต้องได้รับสารนิโคตินอย่างต่อเนื่องเพื่อควบคุมระดับสารสื่อประสาท การเลิกสูบควรได้รับการสนับสนุนทางการแพทย์และการปรับพฤติกรรมอย่างใกล้ชิด",
            tips: [
              "แนะนำอย่างยิ่งให้พบแพทย์เพื่อพิจารณาการรักษาด้วยยาช่วยเลิกบุหรี่ (Pharmacotherapy)",
              "โทรสายด่วน 1600 ทันทีเพื่อวางแผนการรักษาเฉพาะบุคคลตลอด 24 ชั่วโมง",
              "แจ้งคนในครอบครัวและเพื่อนสนิทเพื่อสร้างเครือข่ายกำลังใจอย่างเข้มแข็ง",
            ],
          },
        ],
        diseaseRisks: [
          {
            id: "cardiovascular",
            title: "โรคหลอดเลือดหัวใจและสมอง",
            subtitle: "Coronary Artery Disease & Stroke",
            riskFactorText: "เสี่ยงสูงกว่าคนไม่สูบ 2 - 4 เท่า",
            source: "WHO & CDC Cardiovascular Facts",
            color: "#ef4444",
            icon: "activity",
            details:
              "สารนิโคตินเร่งอัตราการเต้นของหัวใจและความดันโลหิต ขณะที่ก๊าซคาร์บอนมอนอกไซด์ (CO) เข้าแย่งจับฮีโมโกลบินในเม็ดเลือดแดง ทำให้เนื้อเยื่อขาดออกซิเจน และทำให้เยื่อบุผนังหลอดเลือด (Endothelium) อักเสบ เกิดคราบไขมันอุดตัน (Atherosclerosis) นำไปสู่ภาวะหัวใจวายเฉียบพลันและอัมพฤกษ์",
          },
          {
            id: "respiratory",
            title: "โรคปอดอุดกั้นเรื้อรังและถุงลมโป่งพอง",
            subtitle: "COPD & Chronic Bronchitis",
            riskFactorText: "การสูบบุหรี่เป็นสาเหตุมากกว่า 70% ของผู้ป่วยทั่วโลก",
            source: "WHO Global Chronic Respiratory Diseases Report",
            color: "#f97316",
            icon: "wind",
            details:
              "สารเคมีในควันบุหรี่ทำลายขนกวัด (Cilia) ซึ่งทำหน้าที่ดักจับสิ่งแปลกปลอมในหลอดลม และทำลายผนังถุงลมปอด (Alveoli) อย่างถาวร ส่งผลให้ปอดสูญเสียความยืดหยุ่นในการแลกเปลี่ยนก๊าซ เกิดอาการไอเรื้อรัง มีเสมหะเหนียวข้น และเหนื่อยหอบอย่างรุนแรง",
          },
          {
            id: "cancer",
            title: "โรคมะเร็งปอดและระบบทางเดินหายใจ",
            subtitle: "Lung & Upper Respiratory Cancers",
            riskFactorText: "เสี่ยงสูงกว่าคนไม่สูบถึง 15 - 22 เท่า",
            source: "IARC / World Health Organization",
            color: "#8b5cf6",
            icon: "alert-triangle",
            details:
              "ควันบุหรี่ประกอบด้วยสารก่อมะเร็งที่ได้รับการยืนยัน (Group 1 Carcinogens) มากกว่า 70 ชนิด เช่น Benzene, Nitrosamines, และ PAHs ซึ่งเข้าจับและทำลาย DNA ของเซลล์เยื่อบุปอดโดยตรง ขัดขวางยีนควบคุมเนื้องอก ทำให้เซลล์กลายพันธุ์เป็นมะเร็ง",
          },
        ],
        recoveryTimeline: [
          {
            time: "20 นาที",
            benefit: "อัตราการเต้นของหัวใจและความดันโลหิตเริ่มลดลงสู่ระดับปกติ",
          },
          {
            time: "12 ชั่วโมง",
            benefit: "ระดับก๊าซคาร์บอนมอนอกไซด์ในเลือดลดลงสู่ระดับปกติ ระดับออกซิเจนในเลือดเพิ่มขึ้น",
          },
          {
            time: "2 สัปดาห์ - 3 เดือน",
            benefit: "ระบบไหลเวียนโลหิตดีขึ้น สมรรถภาพปอดเริ่มฟื้นตัวเพิ่มขึ้นสูงสุด 30%",
          },
          {
            time: "1 - 9 เดือน",
            benefit: "อาการไอ เสมหะเรื้อรัง และอาการเหนื่อยหอบลดลงอย่างชัดเจน ขนกวัดในปอดเริ่มฟื้นตัว",
          },
          {
            time: "1 ปี",
            benefit: "ความเสี่ยงโรคหลอดเลือดหัวใจลดลง 50% เมื่อเทียบกับผู้ที่ยังสูบอยู่",
          },
          {
            time: "5 ปี",
            benefit: "ความเสี่ยงโรคหลอดเลือดสมอง (Stroke) ลดลงจนเทียบเท่ากับคนที่ไม่เคยสูบบุหรี่",
          },
          {
            time: "10 ปี",
            benefit: "อัตราการเสียชีวิตจากมะเร็งปอดลดลง 50% และความเสี่ยงมะเร็งอวัยวะอื่นๆ ลดลงอย่างมาก",
          },
          {
            time: "15 ปี",
            benefit: "ความเสี่ยงต่อโรคหลอดเลือดหัวใจลดลงจนเทียบเท่ากับผู้ที่ไม่เคยสูบบุหรี่ตลอดชีวิต",
          },
        ],
        hotlineNumber: "1600",
        hotlineThreshold: 5,
        lineOaUrl: "https://lin.ee/xwrSHNg",
      },
    },
  };

  return NextResponse.json(config);
}
