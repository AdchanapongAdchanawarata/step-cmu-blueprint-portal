const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  const envConfig = fs.readFileSync(dotenvPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const {
  getAllRequests,
  getRequestByCode,
  createRequestRecord,
  updateRequestDecision,
  uploadToDrive,
  getKnowledgeList,
  addKnowledgeRecord,
  verifyAdminEmail
} = require('./google_services');

const {
  sendConfirmationEmail,
  sendThreadedReply,
  sendAdminMagicLink
} = require('./email_service');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const JWT_SECRET = "STeP_CMU_SUPER_SECRET_KEY_2026_AI_PORTAL";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";


// Load default KB
let defaultKB = {};
try {
  defaultKB = JSON.parse(fs.readFileSync(path.join(__dirname, 'kb_default.json'), 'utf8'));
} catch (e) {
  console.warn("Could not load kb_default.json", e.message);
}

/**
 * Helper: Call Gemini 2.5 Flash via REST API
 */
async function callGemini(prompt, systemInstruction = "") {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("quota") || errText.includes("limit")) {
        throw new Error("⏳ โควต้าการใช้งาน AI ฟรีของ Gemini (Free Tier) หมดลงแล้วหรือใช้งานถี่เกินไป! ระบบจะรีเซ็ตโควต้าใหม่เวลา 14:00 น. ของทุกวัน (เที่ยงคืนเวลาแปซิฟิก) หรือรอประมาณ 1 นาทีสำหรับโควต้ารายนาที (🚫 ห้ามเปิดใช้งานแบบเสียเงินโดยเด็ดขาดตามข้อสั่งการ)");
      }
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "ไม่สามารถสร้างข้อความได้ในขณะนี้";
    return text;
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw err;
  }
}

/**
 * Middleware: Verify Admin Token
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  
  if (!token) {
    return res.status(401).json({ success: false, error: "กรุณาเข้าสู่ระบบ (Missing Token)" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "เซสชันหมดอายุหรือไม่ถูกต้อง กรุณา Login ใหม่" });
  }
}

// ==========================================
// 1. PUBLIC ENDPOINTS (Citizen Portal)
// ==========================================

/**
 * Submit Request (Citizen) - No AI, triggers Confirmation Email
 */
app.post('/api/request', async (req, res) => {
  try {
    const { applicantName, email, phone, organization, buildingType, fileData, fileName } = req.body;

    if (!applicantName || !email || !buildingType) {
      return res.status(400).json({ success: false, error: "กรุณากรอกข้อมูลสำคัญให้ครบถ้วน" });
    }

    // 1. Upload Blueprint to Google Drive
    let fileLink = "";
    if (fileData && fileName) {
      console.log(`📤 Uploading submission file for ${applicantName}...`);
      fileLink = await uploadToDrive(fileData, fileName, 'application/pdf', false);
    }

    // 2. Pre-create record to get Request ID
    const tempRecord = await createRequestRecord({
      applicantName, email, phone, organization, buildingType, fileLink,
      threadId: '', messageId: ''
    });
    const reqId = tempRecord.requestID;

    // 3. Send Confirmation Email (New Thread)
    console.log(`📧 Sending confirmation email for ${reqId} to ${email}...`);
    const emailMeta = await sendConfirmationEmail(email, applicantName, reqId);

    // 4. Update row with Thread ID and Message ID
    if (emailMeta.threadId) {
      await updateRequestDecision(reqId, 'รอดำเนินการ', '', '', emailMeta.threadId, emailMeta.messageId);
    }

    res.json({
      success: true,
      requestID: reqId,
      timestamp: tempRecord.timestamp,
      message: "ยื่นคำร้องและส่งอีเมลยืนยันเรียบร้อยแล้ว"
    });
  } catch (err) {
    console.error("Error submitting request:", err);
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการยื่นคำร้อง: " + err.message });
  }
});

/**
 * Check Status (Citizen) - Search by REQ-XXXX
 */
app.get('/api/status', async (req, res) => {
  try {
    const code = req.query.code || '';
    if (!code) {
      return res.status(400).json({ success: false, error: "กรุณาระบุรหัสคำร้อง (เช่น REQ-1001)" });
    }

    const request = await getRequestByCode(code);
    if (!request) {
      return res.status(404).json({ success: false, error: `ไม่พบข้อมูลคำร้องรหัส ${code} ในระบบ` });
    }

    res.json({ success: true, data: request });
  } catch (err) {
    console.error("Error checking status:", err);
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการตรวจสอบสถานะ" });
  }
});

// ==========================================
// 2. AUTHENTICATION (Admin Magic Link)
// ==========================================

/**
 * Request Magic Link
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, baseUrl } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "กรุณาระบุอีเมล" });
    }

    const isAdmin = await verifyAdminEmail(email);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "อีเมลของคุณไม่มีสิทธิ์เข้าสู่ระบบหลังบ้าน" });
    }

    // Generate Magic Link Token (24 hours expiry)
    const token = jwt.sign({ email: email.trim().toLowerCase(), role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

    // Send via Gmail API
    await sendAdminMagicLink(email.trim().toLowerCase(), token, baseUrl);

    res.json({ success: true, message: "ระบบได้ส่งลิงก์เข้าสู่ระบบ (Magic Link) ไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบอีเมล" });
  } catch (err) {
    console.error("Error sending magic link:", err);
    res.status(500).json({ success: false, error: "ไม่สามารถส่งอีเมล Magic Link ได้: " + err.message });
  }
});

/**
 * Verify Magic Link Token
 */
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "ไม่พบรหัส Token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, email: decoded.email, token: token });
  } catch (err) {
    res.status(401).json({ success: false, error: "ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่" });
  }
});

// ==========================================
// 3. ADMIN DASHBOARD & AI REVIEW/AUTOFILL
// ==========================================

/**
 * Get All Requests (Admin Only)
 */
app.get('/api/admin/requests', requireAdmin, async (req, res) => {
  try {
    const requests = await getAllRequests();
    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลคำร้องได้" });
  }
});

/**
 * AI Review - Analyze blueprint against 3 Ministerial Regulations & Building Control Act
 */
app.post('/api/admin/ai-review', requireAdmin, async (req, res) => {
  try {
    const { code, buildingType, organization, fileLink, notes } = req.body;

    const kbList = await getKnowledgeList();
    const dynamicKbText = kbList.map(k => `- [${k.category}] ${k.fileName}: ${k.summary}`).join('\n');

    const systemInstruction = `คุณคือ AI ผู้ช่วยวิศวกรและผู้ทรงคุณวุฒิในการตรวจสอบแบบแปลนอาคารสถานที่ประจำอุทยานวิทยาศาสตร์ฯ (STeP CMU)
คุณมีหน้าที่วิเคราะห์ข้อมูลคำร้องและแบบแปลน โดยเทียบกับกฎหมายและมาตรฐานอาคารในฐานความรู้อย่างเข้มงวด:
${JSON.stringify(defaultKB.regulations, null, 2)}

รายการเอกสารเพิ่มเติมใน Google Drive:
${dynamicKbText}
`;

    const prompt = `กรุณาวิเคราะห์คำร้องขอตรวจสอบแบบแปลนรหัส: ${code}
ประเภทงาน/อาคาร: ${buildingType}
หน่วยงาน: ${organization}
ลิงก์ไฟล์แปลน: ${fileLink || 'ไม่ได้แนบลิงก์ (ตรวจสอบจากข้อมูล)'}
บันทึกเบื้องต้น: ${notes || 'ไม่มี'}

โปรดให้ผลการวิเคราะห์ในรูปแบบโครงสร้างดังนี้:
1. **🔍 สรุปภาพรวมโครงการ**: วิเคราะห์ลักษณะงานว่าเข้าข่ายอาคารควบคุมการใช้หรือการต่อเติมรูปแบบใด
2. **🛡️ การตรวจสอบตามกฎหมายและกฎกระทรวง (3 ฉบับ)**:
   - **ด้านวัสดุก่อสร้างและอัตราทนไฟ**: (ผ่าน / ต้องตรวจสอบเพิ่ม / มีความเสี่ยง พร้อมระบุเหตุผลและข้อกฎหมาย)
   - **ด้านฐานรากและพื้นดินรองรับ**: (ผ่าน / ต้องตรวจสอบเพิ่ม / มีความเสี่ยง พร้อมระบุเหตุผลและข้อกฎหมาย)
   - **ด้านโครงสร้างและน้ำหนักบรรทุก**: (ผ่าน / ต้องตรวจสอบเพิ่ม / มีความเสี่ยง พร้อมระบุเหตุผลและข้อกฎหมาย)
3. **💡 ข้อแนะนำสำหรับวิศวกรผู้ตรวจ**: ประเด็นสำคัญที่เจ้าหน้าที่ควรเน้นย้ำหรือขอเอกสารคำนวณเพิ่มเติมก่อนอนุมัติ`;

    console.log(`🤖 [AI Review] Analyzing request ${code} for admin ${req.adminEmail}...`);
    const aiAnalysis = await callGemini(prompt, systemInstruction);

    res.json({ success: true, analysis: aiAnalysis });
  } catch (err) {
    console.error("AI Review Error:", err);
    res.status(500).json({ success: false, error: "AI Review เกิดข้อผิดพลาด: " + err.message });
  }
});

/**
 * AI Autofill - Generate official Thai reply email draft based on decision
 */
app.post('/api/admin/ai-autofill', requireAdmin, async (req, res) => {
  try {
    const { code, applicantName, buildingType, decision, adminNotes, engineerNotes } = req.body;

    const systemInstruction = `คุณคือผู้ช่วยร่างจดหมายและอีเมลทางการของศูนย์นวัตกรรมและการจัดการพื้นที่ (STeP CMU)
คุณมีหน้าที่ร่างข้อความอีเมลตอบกลับผู้ยื่นคำร้องด้วยภาษาไทยที่เป็นทางการ สุภาพ ชัดเจน และเป็นมืออาชีพ`;

    const prompt = `กรุณาร่างข้อความตอบกลับผลการตรวจสอบแบบแปลน (เพื่อใส่ในอีเมล) โดยมีข้อมูลดังนี้:
- รหัสคำร้อง: ${code}
- ชื่อผู้ยื่น: ${applicantName}
- ประเภทงาน: ${buildingType}
- ผลการพิจารณา (Decision): **${decision}** (อนุมัติ / ขอแก้ไขรายละเอียด / ปฏิเสธ)
- ความเห็นจากผู้ดูแลระบบ/วิศวกร: ${adminNotes || ''} ${engineerNotes || ''}
- ข้อกฎหมายอ้างอิง: อ้างอิงตามพระราชบัญญัติควบคุมอาคาร และกฎกระทรวงกำหนดวัสดุ/ฐานราก/โครงสร้างอาคาร พ.ศ. 2566

โครงสร้างข้อความที่ต้องการ (จัดย่อหน้าให้สวยงาม ไม่ต้องใส่คำขึ้นต้น "เรียน..." หรือคำลงท้าย เพราะระบบอีเมลมีให้อยู่แล้ว):
1. แจ้งผลการพิจารณาอย่างชัดเจน
2. อธิบายเหตุผลหรือรายละเอียดทางเทคนิค (ถ้าเป็น "อนุมัติ" ให้แจ้งขั้นตอนต่อไปเช่น เริ่มงานได้ภายใต้การกำกับดูแล, ถ้าเป็น "ขอแก้ไข" ให้ระบุจุดที่ต้องแก้ไขและเอกสารที่ต้องส่งเพิ่ม)
3. คำแนะนำด้านความปลอดภัยและมาตรฐาน STeP CMU`;

    console.log(`🤖 [AI Autofill] Drafting reply for ${code} (${decision})...`);
    const draftText = await callGemini(prompt, systemInstruction);

    // Convert newlines to HTML breaks for clean email display
    const draftHtml = draftText.replace(/\n/g, '<br>');

    res.json({ success: true, draftHtml: draftHtml });
  } catch (err) {
    console.error("AI Autofill Error:", err);
    res.status(500).json({ success: false, error: "AI Autofill เกิดข้อผิดพลาด: " + err.message });
  }
});

/**
 * Admin Send Reply & Record Decision (Threading Reply Email)
 */
app.post('/api/admin/reply', requireAdmin, async (req, res) => {
  try {
    const { code, status, adminNotes, engineerNotes, replyHtml } = req.body;

    if (!code || !status || !replyHtml) {
      return res.status(400).json({ success: false, error: "กรุณาระบุข้อมูลผลการตัดสินใจและข้อความตอบกลับให้ครบถ้วน" });
    }

    // 1. Get existing request to retrieve Email, Thread ID, Message ID
    const request = await getRequestByCode(code);
    if (!request) {
      return res.status(404).json({ success: false, error: `ไม่พบคำร้อง ${code}` });
    }

    console.log(`📨 [Admin Reply] Sending threaded email for ${code} to ${request.email} (By: ${req.adminEmail})...`);
    // 2. Send threaded reply email via Gmail API
    await sendThreadedReply(
      request.email,
      request.applicantName,
      code,
      replyHtml,
      request.threadId,
      request.messageId,
      req.adminEmail
    );

    // 3. Update status and notes in Google Sheet
    console.log(`📊 [Admin Reply] Updating database for ${code}...`);
    await updateRequestDecision(code, status, adminNotes, engineerNotes, request.threadId, request.messageId, req.adminEmail);

    res.json({ success: true, message: "บันทึกผลการตัดสินใจและส่งอีเมลตอบกลับเรียบร้อยแล้ว!" });
  } catch (err) {
    console.error("Admin Reply Error:", err);
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการตอบกลับ: " + err.message });
  }
});

// ==========================================
// 4. KNOWLEDGE BASE MANAGEMENT (Admin Only)
// ==========================================

/**
 * Get KB List
 */
app.get('/api/admin/kb', requireAdmin, async (req, res) => {
  try {
    const list = await getKnowledgeList();
    res.json({ success: true, data: list, coreKb: defaultKB });
  } catch (err) {
    res.status(500).json({ success: false, error: "ไม่สามารถดึงรายการ Knowledge Base ได้" });
  }
});

/**
 * Upload new document to KB
 */
app.post('/api/admin/kb', requireAdmin, async (req, res) => {
  try {
    const { fileName, fileData, category, summary } = req.body;
    if (!fileName || !fileData || !summary) {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อไฟล์ ไฟล์เอกสาร และคำอธิบายสรุป" });
    }

    console.log(`📚 [KB Upload] Uploading new KB file ${fileName} by ${req.adminEmail}...`);
    const fileLink = await uploadToDrive(fileData, fileName, 'application/pdf', true);
    const fileId = fileLink.split('/d/')[1]?.split('/')[0] || "UNKNOWN_ID";

    await addKnowledgeRecord(fileId, fileName, fileLink, req.adminEmail, category || "ข้อกำหนดทั่วไป", summary);

    res.json({ success: true, message: "อัปโหลดและเพิ่มเอกสารเข้าสู่ Knowledge Base สำเร็จ!" });
  } catch (err) {
    console.error("KB Upload Error:", err);
    res.status(500).json({ success: false, error: "ไม่สามารถอัปโหลดไฟล์เข้า KB ได้: " + err.message });
  }
});

// Export as Firebase Cloud Function (v2)
const { onRequest } = require("firebase-functions/v2/https");
exports.api = onRequest({
  cors: true,
  timeoutSeconds: 300,
  memory: "512MiB",
  region: "asia-southeast1"
}, app);

// Support local standalone execution
if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log("======================================================================");
    console.log(`🚀 STeP Blueprint Portal Backend Server running on port ${PORT}`);
    console.log(`👉 Test endpoint: http://localhost:${PORT}/api/admin/requests`);
    console.log("======================================================================");
  });
}

