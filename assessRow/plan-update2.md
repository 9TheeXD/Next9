# Update Plan: Trend Graph Header & Detail View Modifications

This document outlines the specific updates to the graph display and popup interfaces.

## 1. Main Page Graph Headers (Outside Popup)
* On the main Summary Page, the header for each grade's trend graph (ม.1 - ม.6) must now display the calculated average score and the text rating based on the currently selected timeframe.
* **UI Format Example:** `"ม.1 (เฉลี่ย 3 - ปานกลาง)                >"`
* **Note:** The `>` symbol acts as the clickable indicator to open the detailed popup.

## 2. Detailed Popup Main Header (Inside Popup)
* When the detailed popup for a specific grade is opened, the main header at the very top must display the grade level aligned to the extreme left, and the average score with rating aligned to the extreme right.
* **UI Format Example:** `"ม.1                        เฉลี่ย 3 - ปานกลาง"`
* **Constraint:** Do NOT include the `>` symbol in this header.

## 3. Room-Level Graph Headers (Inside Popup)
* Inside the detailed popup, individual trend line graphs must be displayed for each room belonging to that grade.
* The header for each individual room's graph must display the room number along with its specific average score and rating.
* **UI Format Example:** `"ห้อง 1/1         3 - ปานกลาง"`
