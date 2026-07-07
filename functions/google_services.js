const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load config from setup or environment
let config = {
  CLIENT_ID: process.env.CLIENT_ID || "",
  CLIENT_SECRET: process.env.CLIENT_SECRET || "",
  REFRESH_TOKEN: process.env.REFRESH_TOKEN || "",
  SPREADSHEET_ID: "1YsJIR2ri0DlzwjkPg6T3t_bftvtDkESG9Agubo4KaAM",
  DRIVE_KB_FOLDER_ID: "16bqNTJgwRdEvontWg3gXw1LAEWAmtSEG",
  DRIVE_SUBMISSIONS_FOLDER_ID: "1MRx5HPbqUmPtZKJwl59TMpO6YPkXhBPP",
  ADMIN_EMAILS: [
    "kampanat@step.cmu.ac.th",
    "vachiravut@step.cmu.ac.th",
    "patipol@step.cmu.ac.th",
    "jirawat@step.cmu.ac.th",
    "amonlit@step.cmu.ac.th",
    "adchanapong@step.cmu.ac.th",
    "adchanawarata@gmail.com"
  ],
  ORG_NAME: "อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU)",
  ADMIN_DIRECTORY: [
    { name: "นายอมรฤทธิ์ อินต๊ะ (A-monlit Inta)", role: "หัวหน้าทีม (Team Leader)", email: "amonlit@step.cmu.ac.th", phone: "080-1265622" },
    { name: "นายกัมปนาท เปี้ยตั๋น (Kampanat Peatan)", role: "หัวหน้าทีม (Team Leader)", email: "kampanat@step.cmu.ac.th", phone: "-" },
    { name: "นายวชิราวุฒิ จันปิน (Vachiravut Junpin)", role: "ผู้ช่วยหัวหน้าทีม (Assistant Team Leader)", email: "vachiravut@step.cmu.ac.th", phone: "-" },
    { name: "นายปฏิพล อินสม (Patipol Insom)", role: "วิศวกร (Engineer)", email: "patipol@step.cmu.ac.th", phone: "088-4085242" },
    { name: "นายจิระวัฒน์ เกษจรัล (Jirawat Keatjarun)", role: "วิศวกร (Engineer)", email: "jirawat@step.cmu.ac.th", phone: "091-8795998" },
    { name: "นายอัจชนะพงษ์ อัจชนะวราทา (Adchanapong Adchanawarata)", role: "หัวหน้าทีม (Team Leader)", email: "adchanapong@step.cmu.ac.th", phone: "-" }
  ]
};

// Try loading from google_assets_config.json if available
try {
  const configPath = path.join(__dirname, '..', 'google_assets_config.json');
  if (fs.existsSync(configPath)) {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...loaded };
  }
} catch (e) {
  console.warn("Using default OAuth & Sheet config:", e.message);
}

const oauth2Client = new google.auth.OAuth2(
  config.CLIENT_ID,
  config.CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: config.REFRESH_TOKEN });

const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Get all request records from Google Sheet
 */
async function getAllRequests() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'Requests!A2:N',
    });
    const rows = res.data.values || [];
    return rows.map(row => ({
      requestID: row[0] || '',
      timestamp: row[1] || '',
      applicantName: row[2] || '',
      email: row[3] || '',
      phone: row[4] || '',
      organization: row[5] || '',
      buildingType: row[6] || '',
      fileLink: row[7] || '',
      status: row[8] || 'รอดำเนินการ',
      adminNotes: row[9] || '',
      engineerNotes: row[10] || '',
      threadId: row[11] || '',
      messageId: row[12] || '',
      respondedBy: row[13] || ''
    })).reverse(); // Newest first
  } catch (err) {
    console.error("Error fetching all requests:", err);
    throw err;
  }
}

/**
 * Get a specific request by ID (e.g. REQ-1001)
 */
async function getRequestByCode(code) {
  const requests = await getAllRequests();
  return requests.find(r => r.requestID.toUpperCase() === code.toUpperCase()) || null;
}

/**
 * Create a new request record in Google Sheet
 */
async function createRequestRecord(data) {
  try {
    // Generate Request ID (e.g., REQ-1001)
    const resGet = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'Requests!A:A',
    });
    const count = (resGet.data.values || []).length;
    const reqId = `REQ-${1000 + count}`;
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const newRow = [
      reqId,
      timestamp,
      data.applicantName || '',
      data.email || '',
      data.phone || '',
      data.organization || '',
      data.buildingType || '',
      data.fileLink || '',
      'รอดำเนินการ',
      '',
      '',
      data.threadId || '',
      data.messageId || '',
      ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'Requests!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] }
    });

    return { requestID: reqId, timestamp };
  } catch (err) {
    console.error("Error creating request record:", err);
    throw err;
  }
}

/**
 * Update request status and notes in Google Sheet
 */
async function updateRequestDecision(code, status, adminNotes, engineerNotes, threadId, messageId, adminEmail = '') {
  try {
    const resGet = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'Requests!A1:N',
    });
    const rows = resGet.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toUpperCase() === code.toUpperCase()) {
        rowIndex = i + 1; // 1-indexed
        break;
      }
    }
    if (rowIndex === -1) throw new Error(`Request ${code} not found in database.`);

    // Update specific columns: I=Status(8), J=AdminNotes(9), K=EngNotes(10), L=ThreadID(11), M=MsgID(12), N=AdminEmail(13)
    const currentRow = rows[rowIndex - 1];
    const updatedStatus = status || currentRow[8];
    const updatedAdminNotes = adminNotes !== undefined ? adminNotes : currentRow[9];
    const updatedEngNotes = engineerNotes !== undefined ? engineerNotes : currentRow[10];
    const updatedThreadId = threadId || currentRow[11];
    const updatedMsgId = messageId || currentRow[12];
    const updatedAdminEmail = adminEmail !== undefined && adminEmail !== '' ? adminEmail : (currentRow[13] || '');

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `Requests!I${rowIndex}:N${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[updatedStatus, updatedAdminNotes, updatedEngNotes, updatedThreadId, updatedMsgId, updatedAdminEmail]] }
    });

    return true;
  } catch (err) {
    console.error("Error updating decision:", err);
    throw err;
  }
}

/**
 * Upload base64 or buffer file to Google Drive
 */
async function uploadToDrive(base64Data, fileName, mimeType, isKB = false) {
  try {
    const folderId = isKB ? config.DRIVE_KB_FOLDER_ID : config.DRIVE_SUBMISSIONS_FOLDER_ID;
    const buffer = Buffer.from(base64Data.replace(/^data:.*;base64,/, ''), 'base64');
    
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: mimeType || 'application/pdf',
        body: bufferStream
      }
    });

    const fileId = res.data.id;
    // Make readable
    await drive.permissions.create({
      fileId: fileId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  } catch (err) {
    console.error("Error uploading to Drive:", err);
    throw err;
  }
}

/**
 * Get Knowledge Base metadata from Google Sheet
 */
async function getKnowledgeList() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'KnowledgeMetadata!A2:G',
    });
    const rows = res.data.values || [];
    return rows.map(row => ({
      fileID: row[0] || '',
      fileName: row[1] || '',
      fileLink: row[2] || '',
      uploadedBy: row[3] || '',
      uploadedAt: row[4] || '',
      category: row[5] || '',
      summary: row[6] || ''
    }));
  } catch (err) {
    console.error("Error getting KB list:", err);
    return [];
  }
}

/**
 * Add new KB file metadata to Google Sheet
 */
async function addKnowledgeRecord(fileId, fileName, fileLink, uploadedBy, category, summary) {
  try {
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const newRow = [fileId, fileName, fileLink, uploadedBy, timestamp, category, summary];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'KnowledgeMetadata!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] }
    });
    return true;
  } catch (err) {
    console.error("Error adding KB record:", err);
    throw err;
  }
}

/**
 * Verify if email is an Admin
 */
async function verifyAdminEmail(email) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'Admins!A2:A',
    });
    const rows = res.data.values || [];
    const admins = rows.map(r => (r[0] || '').toLowerCase().trim());
    
    // Also check static config as backup
    const allAdmins = new Set([...admins, ...config.ADMIN_EMAILS.map(e => e.toLowerCase().trim())]);
    return allAdmins.has(email.toLowerCase().trim());
  } catch (err) {
    console.error("Error verifying admin:", err);
    return config.ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
  }
}

/**
 * Download file from Google Drive as base64 for Gemini multimodal analysis
 */
async function getFileForGemini(fileLinkOrId) {
  try {
    if (!fileLinkOrId) return null;
    let fileId = fileLinkOrId;
    if (fileLinkOrId.includes('/d/')) {
      fileId = fileLinkOrId.split('/d/')[1]?.split('/')[0];
    }
    if (!fileId || fileId === 'UNKNOWN_ID') return null;

    console.log(`📥 Downloading file ${fileId} from Google Drive for Gemini Multimodal...`);
    const metaRes = await drive.files.get({
      fileId: fileId,
      fields: 'name, mimeType, size'
    });
    const mimeType = metaRes.data.mimeType || 'application/pdf';
    const size = parseInt(metaRes.data.size || '0', 10);

    // Limit to 18 MB for inline Gemini processing
    if (size > 18 * 1024 * 1024) {
      console.warn(`⚠️ File ${fileId} is over 18MB (${size} bytes). Skipping inline attachment.`);
      return null;
    }

    const res = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'arraybuffer' });

    const base64Data = Buffer.from(res.data).toString('base64');
    return {
      mimeType: mimeType,
      data: base64Data
    };
  } catch (err) {
    console.error("⚠️ Error downloading file for Gemini:", err.message);
    return null;
  }
}

module.exports = {
  getAllRequests,
  getRequestByCode,
  createRequestRecord,
  updateRequestDecision,
  uploadToDrive,
  getKnowledgeList,
  addKnowledgeRecord,
  verifyAdminEmail,
  getFileForGemini,
  config
};
