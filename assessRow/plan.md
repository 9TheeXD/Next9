# Project Plan: Morning Assembly Disciplinary Tracking System
**File:** `plan.md`

## 1. Execution Constraints & Developer Rules
* **Token Efficiency & Verification:** Avoid unnecessary token consumption. DO NOT verify code frequently during the development phase. Code verification must ONLY occur at the very end of the plan execution.
* **Output Restrictions:** Avoid long descriptive text outputs. 
    * If an error is encountered during execution, output ONLY: `error: " [error details] "`
    * Upon complete and successful execution of the entire plan, output ONLY: `Finish all task and good verified`
* **Deviation:** Follow this plan strictly. Do not distort information or apply unsolicited analytical deviations to the requested features.

## 2. Technical Stack & Infrastructure
* **Framework:** Next.js (Full-stack: Frontend and Backend).
* **Database:** Local Database integration.
* **Deployment/Running:** Use `sudo docker` specifically for running the application (`sudo docker run ... next start`).
* **Port:** The frontend must be exposed on port `7076`.
* **Language:** The website's user interface must be strictly in Thai.
* **Assets:** NO emojis are allowed. Use Next.js native icons (or compatible icon libraries like `lucide-react` integrated as Next components) for all iconography.

## 3. UI/UX & Design System
* **Theme:** Minimalist and simple. No unnecessary animations or effects.
* **Colors:** * Background: White or very light gray.
    * Text: Dark solid black or dark solid red.
    * UI Elements (Buttons, Nav, etc.): Dark solid red.
* **Alerts & Modals:** * **STRICT RULE:** NEVER use native browser alerts, confirms, or prompts (`window.alert`, `window.confirm`, etc.).
    * Use custom high `z-index` popups/modals for all warnings, input requests, and notifications.
* **Responsiveness:** Perfect responsiveness is mandatory. The UI must function efficiently and flawlessly across all devices (Mobile phones, iPads/Tablets, Desktops).
* **Touch Targets:** Spacing between grid items and table cells must be generously sized to ensure they are easily clickable on touch devices. Do not make table cells too small.

## 4. Application Pages & Features
The application consists of two main pages: the Summary Page and the Evaluation Page.

### 4.1 Page 1: Summary Page (หน้าสรุป)
This page displays the overall evaluation data and trends.

**Part 1: Score Viewing (ปุ่มไปดูคะแนน)**
* **UI:** A button labeled `"ดูคะแนนของแต่ละสายชั้น >"`.
* **Action:** Clicking opens a high `z-index` popup.
* **Popup Features:**
    * **Date Filter (Top):** Date/Date-range picker (start-end). Default is set to the current day (Today).
    * **Calculation Logic:** Averages must be calculated based on the selected days. Do NOT count days where the data is `0`. Round decimal numbers to whole numbers.
    * **Hierarchy Level 1 (Grades):** Displays a vertical list of grades (ม.1 - ม.6).
    * **Hierarchy Level 2 (Rooms):** Clicking a grade reveals a list of average scores for each room in that grade. Format example: `[2/7 | 4 (ดี) > ]`.
    * **Hierarchy Level 3 (Details):** Clicking a specific room reveals the detailed score breakdown for each evaluation criterion for that specific room.

**Part 2: Trend Line Graph (กราฟเส้น)**
* **UI:** A grid layout displaying trend line graphs for all grades (ม.1 - ม.6). Rooms are combined at this view level.
* **Time Selector (Top of graphs):** Options for [1 เดือน (Default), 6 เดือน, 1 ปี, ตลอดปีการศึกษา].
* **Graph Specifications:** X-axis resolution does not need to be overly granular. The X-axis must be scrollable if data overflows.
* **Drill-down Feature:** Each grade graph has a header (e.g., `"ม.2        >"`). Clicking this header opens a popup showing detailed, room-separated graphs for that specific grade.

### 4.2 Page 2: Evaluation Page (หน้าสำหรับประเมิน)
This page is used by teachers/student council to input daily scores.

**Authentication (Strictly required for this page ONLY):**
* **System:** Must require a Student ID (รหัสประจำตัว) and Password (รหัสผ่าน).
* **Credentials:** * ID: `00000` (Temporary default ID)
    * Password: `next9_SDH69` (Universal password for all users)
* **Session Management:** Save session data to the local database and issue a cookie. The cookie must not require frequent logins and should expire in exactly 1 year.

**Selection Interface:**
* **UI:** A 2-column grid button layout.
* **Items:** Grades 1-6, divided into specific zones: "ฝั่งสระน้ำ" and "ฝั่งอาคาร 1".
    * *Example:* Button for "ม.4 ฝั่งสระน้ำ".

**Evaluation Popup Interface:**
* **Trigger:** Clicking a zone button opens the evaluation popup.
* **Default State:** All criteria default to `0` (Not evaluated).
* **Table Layout:** * Headers: `[ ข้อที่ | รายการประเมิน | x/1 | x/2 | ... | x/max ]` (x = grade level, /1, /2 = room number).
    * Table must allow horizontal scrolling (X-axis overflow) to accommodate all rooms.
    * Table cells/spacing must be wide and high enough for easy touch interaction.
* **Input Mechanism:** Clicking on a specific room's numerical cell (e.g., under `x/1`) triggers a sub-popup to select a score.
    * Score Mapping: `{1: 'ไม่ผ่าน', 2: 'ปรับปรุง', 3: 'พอใช้', 4: 'ดี', 5: 'ดีมาก'}`
    * Row Example: `[ 1 | ร้องเพลงเสียงดังฟังชัด | 4 | 4 | 0 | ... | 0 ]`

**Evaluation Criteria (รายการประเมิน - Exact Text):**
1. จัดระเบียบแถวเป็นระเบียบเรียบร้อย
2. ไม่พูดคุยขณะทำกิจกรรม
3. ร้องเพลงชาติ และเพลงสรรเสริญพระบารมีได้ถูกต้อง เสียงดังชัดเจน
4. ตั้งใจสวดมนต์ไหว้พระ แผ่เมตตา
5. การเดินแถวเข้าชั้นเรียนเป็นระเบียบ

**Scoring Rubric (เกณฑ์การให้คะแนน):**
* Must be displayed as a reference table at the bottom of the evaluation popup. Can be integrated to allow direct score selection if applicable.
* **Text & Values:**
    * นักเรียนปฏิบัติมากกว่าร้อยละ 90 - 5
    * นักเรียนปฏิบัติร้อยละ 70-89 - 4
    * นักเรียนปฏิบัติร้อยละ 50-69 - 3
    * นักเรียนปฏิบัติร้อยละ 20-49 - 2
    * นักเรียนปฏิบัติน้อยกว่าร้อยละ 20 - 1
