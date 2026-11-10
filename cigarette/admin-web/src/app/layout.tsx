import type { Metadata } from "next";
import { Geist, Geist_Mono, Kanit, Prompt, Sarabun } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const kanit = Kanit({
  weight: ["400", "700", "900"],
  variable: "--font-kanit",
  subsets: ["thai"],
});

const prompt = Prompt({
  weight: ["400", "600"],
  variable: "--font-prompt",
  subsets: ["thai"],
});

const sarabun = Sarabun({
  weight: ["400", "500"],
  variable: "--font-sarabun",
  subsets: ["thai"],
});

import { AlertProvider } from "@/components/ui/AlertProvider";

export const metadata: Metadata = {
  title: "Next Breath",
  description:
    "แดชบอร์ดผู้ดูแลระบบสำหรับโปรแกรมเลิกสูบบุหรี่ Next Breath ดูการวิเคราะห์ผลกระทบ อัตราความสำเร็จ และข้อมูลผู้เข้าร่วมแบบไม่ระบุตัวตน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} ${kanit.variable} ${prompt.variable} ${sarabun.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AlertProvider>
          {children}
        </AlertProvider>
      </body>
    </html>
  );
}
