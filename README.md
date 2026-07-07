# 🏛️ STeP CMU Blueprint Portal
**ระบบบริการตรวจสอบและคัดลอกแบบแปลนอาคารสถานที่**  
**อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU)**

---

## 🌟 ภาพรวมระบบ (System Overview)
ระบบบริการรับเรื่อง ตรวจสอบ วิเคราะห์ และคัดลอกแบบแปลนอาคารสถานที่สำหรับประชาชน ผู้ประกอบการ และหน่วยงานภายในมหาวิทยาลัยเชียงใหม่ ขับเคลื่อนด้วยสถาปัตยกรรมคลาวด์ไร้เซิร์ฟเวอร์ (Serverless Cloud Architecture) และระบบปัญญาประดิษฐ์ **AI Blueprint Studio (Google Gemini 2.5 Flash)** ช่วยลดระยะเวลาพิจารณาเอกสารจากหลักสัปดาห์เหลือเพียง **~18 นาที**

- **🌐 หน้าเว็บไซต์บริการ (Live Portal):** [https://step-blueprint-portal-e2b08.web.app](https://step-blueprint-portal-e2b08.web.app)
- **☁️ ระบบคลาวด์หลังบ้าน (Render Cloud API):** [https://step-blueprint-portal-backend.onrender.com](https://step-blueprint-portal-backend.onrender.com)
- **📊 ฐานข้อมูลระบบ (Google Sheets):** [เปิดดูตารางฐานข้อมูล](https://docs.google.com/spreadsheets/d/1YsJIR2ri0DlzwjkPg6T3t_bftvtDkESG9Agubo4KaAM/edit)
- **📑 คู่มือการปฏิบัติงานฉบับสมบูรณ์:** [อ่านคู่มือระบบและข้อกำหนดทั้งหมด (google_links.md)](file:///Users/aa/Desktop/nick_project/google_links.md)

---

## 🚀 ฟังก์ชันเด่นของระบบ (Key Features)

### 👥 1. สำหรับประชาชนและผู้ประกอบการ (Public Portal)
- **ยื่นคำร้องออนไลน์ 24 ชม.:** รองรับการยื่นขอตรวจสอบและขอคัดลอกแบบแปลน อัปโหลดไฟล์ PDF เชื่อมต่อ Google Drive อัตโนมัติ
- **ระบบติดตามสถานะ (Real-time Tracking):** ตรวจสอบสถานะการตรวจสอบ ความเห็นทางเทคนิค และอีเมลเจ้าหน้าที่ผู้รับผิดชอบงานได้ทันทีด้วยรหัส `REQ-XXXX`
- **อัตลักษณ์องค์กร (Premium Dark Theme):** ดีไซน์มินิมอล หรูหรา ในโทนสีดำ-ทอง-ส้ม ตามมาตรฐานอุทยานวิทยาศาสตร์ฯ

### 🛡️ 2. สำหรับเจ้าหน้าที่ผู้ดูแลระบบ (Admin Dashboard & AI Studio)
- **ระบบเข้าสู่ระบบไร้รหัสผ่าน (Passwordless Magic Link):** ปลอดภัยสูงสุดด้วยระบบ JWT Token ส่งลิงก์ยืนยันตัวตนทางอีเมล
- **🤖 AI Blueprint Studio:** ระบบผู้ช่วยอัจฉริยะวิเคราะห์แบบแปลนและโครงสร้างอาคารเทียบกับกฎกระทรวง พ.ศ. 2566 และ พ.ร.บ. อาคาร พร้อมระบบ **AI Autofill** ช่วยร่างจดหมายตอบกลับทางการ
- **📜 ระบบตรวจสอบประวัติจดหมาย (Official Letter Proof):** ทุกคำร้องสามารถเปิดดูจดหมายตอบกลับทางการฉบับเต็ม พร้อมระบุชื่ออีเมลเจ้าหน้าที่ผู้พิจารณา เพื่อใช้เป็นหลักฐานและทบทวนงานร่วมกัน (Peer Review)
- **🗑️ ระบบลบคำร้องปลอดภัย (Delete with Confirmation):** ป้องกันการลบข้อมูลผิดพลาดด้วยกล่องยืนยัน 2 ชั้น ซิงค์ข้อมูลกับ Google Sheets ทันที
- **📊 แผงควบคุมสถิติภาพรวม (Analytics & KPI Dashboard):**
  - แสดงจำนวนคำร้อง สัดส่วนอนุมัติ และความเร็วการทำงาน
  - **แยกสถิติจำนวนหน่วยงาน / คนไม่สังกัดหน่วยงานแบบไม่นับซ้ำ (Zero Double-Counting)**
  - **🏆 ตารางจัดอันดับผลงานผู้ดูแลระบบ (Leaderboard Rank Show):** จัดอันดับและมอบเหรียญรางวัล (🥇 ทอง, 🥈 เงิน, 🥉 ทองแดง) ตามปริมาณงานที่รับผิดชอบ
- **📨 ระบบแจ้งเตือนผู้บริหารทันที:** ส่งอีเมลแจ้งเตือน `vachiravut@step.cmu.ac.th` ทันทีเมื่อมีประชาชนยื่นคำร้องใหม่

---

## 🛠️ สถาปัตยกรรมระบบ (Zero-Cost Architecture)
ระบบถูกออกแบบให้ทำงานฟรี 100% ภายใต้ Free Tier ตามข้อสั่งการ:
1. **Frontend:** Firebase Hosting (Spark Plan Free Tier)
2. **Backend:** Render.com Cloud Web Service (Free Tier) + Node.js Express API
3. **Database & Storage:** Google Sheets API + Google Drive API + Gmail API (OAuth 2.0 Refresh Token)
4. **AI Engine:** Google Generative AI (Gemini 2.5 Flash Free Quota)

---
*พัฒนาโดยทีมวิศวกรและนวัตกรรม อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU)*  
*© 2026 Science and Technology Park, Chiang Mai University*
