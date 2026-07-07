/**
 * STeP Blueprint Workflow System - Google Apps Script Backend
 * 
 * This file handles database operations in Google Sheets, file uploads to Google Drive,
 * fetching reference assets from Drive, and providing dashboard statistics.
 */

// Global Configurations - You can specify your Parent Folder ID here.
// If left empty, the script will automatically create a folder named "STeP AI Assets" in your Google Drive.
const DRIVE_FOLDER_ID = ""; 
const STAFF_PASSCODE = "STeP2026"; 
const STAFF_EMAIL = "facilities-staff@step.cmu.ac.th";  

/**
 * Serves the HTML frontend page or API requests.
 */
function doGet(e) {
  if (e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    const passcode = e.parameter.passcode;
    
    // API endpoints for the Python Antigravity Agent / Frontend Client
    if (action === "list") {
      const res = getPendingRequests(passcode);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "status") {
      const res = checkRequestStatus(e.parameter.code);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "admin") {
      const res = adminDecision(e.parameter.code, e.parameter.decision, e.parameter.notes, passcode);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "engineer") {
      const res = engineerDecision(e.parameter.code, e.parameter.decision, e.parameter.notes, e.parameter.fileLink, passcode);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getDriveAssets") {
      const res = fetchDriveAssets();
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: res }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getStats") {
      const res = getStatistics(passcode);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "chat") {
      const res = runServerlessChat(e.parameter.message, passcode);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid action" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('STeP CMU Blueprint Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handles incoming POST requests (e.g. file uploads, form submissions, decisions)
 */
function doPost(e) {
  try {
    let postData;
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      postData = {};
    }
    
    const action = e.parameter.action || postData.action;
    const passcode = e.parameter.passcode || postData.passcode;
    
    let result;
    if (action === "request") {
      result = requestDocument(postData);
    } else if (action === "review") {
      result = reviewDocument(postData);
    } else if (action === "admin") {
      result = adminDecision(postData.code, postData.decision, postData.notes, passcode);
    } else if (action === "engineer") {
      result = engineerDecision(postData.code, postData.decision, postData.notes, postData.fileLink, passcode);
    } else if (action === "chat") {
      result = runServerlessChat(postData.message, passcode);
    } else {
      result = { success: false, error: "Invalid POST action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * Helper to get or create the Sheet named "Requests"
 */
function getRequestSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("STeP Blueprint Requests");
  let sheet = ss.getSheetByName("Requests");
  if (!sheet) {
    sheet = ss.insertSheet("Requests");
    sheet.appendRow([
      "Timestamp",        // Column A
      "Type",             // Column B (REQUEST / REVIEW)
      "Request Code",     // Column C
      "Name",             // Column D
      "Company",          // Column E
      "Phone",            // Column F
      "Email",            // Column G
      "Details",          // Column H
      "Status",           // Column I (WAITING_ADMIN, WAITING_ENGINEER, APPROVED, REJECTED)
      "File Link",        // Column J
      "Staff Notes",      // Column K
      "Linked Request",   // Column L
      "Decision Timestamp"// Column M
    ]);
    sheet.getRange("A1:M1").setFontWeight("bold").setBackground("#f1f5f9").setFontColor("#334155");
    sheet.setFrozenRows(1);
  } else {
    // Dynamically upgrade existing sheet to include Column M
    const maxCols = sheet.getLastColumn();
    if (maxCols < 13) {
      sheet.getRange(1, 13).setValue("Decision Timestamp");
      sheet.getRange("M1").setFontWeight("bold").setBackground("#f1f5f9").setFontColor("#334155");
    }
  }
  return sheet;
}

/**
 * Automatically initializes and returns the Parent Folder in Google Drive
 */
function getOrCreateParentFolder() {
  if (DRIVE_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (e) {
      console.warn("Could not load folder by specified ID, attempting auto-setup...");
    }
  }

  // Look for folder named "STeP AI Assets"
  const folders = DriveApp.getFoldersByName("STeP AI Assets");
  if (folders.hasNext()) {
    return folders.next();
  }

  // Create Parent and Subfolders
  const parent = DriveApp.createFolder("STeP AI Assets");
  parent.createFolder("ref");
  parent.createFolder("asset");
  parent.createFolder("uploads");
  
  // Create default skill.md
  parent.createFile("skill.md", `# STeP AI Agent Skills

## ทักษะการตรวจสอบแบบแปลน (Blueprint Review Instructions)
1. วิเคราะห์ว่าไฟล์รูปหรือไฟล์ PDF ที่ส่งมาแสดงแนวเขตการปรับปรุงถูกต้องหรือไม่
2. ตรวจเช็คว่ามีเส้นทางหนีไฟและอุปกรณ์ดับเพลิงพ่นสัญลักษณ์ไว้หรือไม่
3. สรุปผลความเสี่ยงทางโครงสร้างอาคาร
`, MimeType.PLAIN_TEXT);

  return parent;
}

/**
 * Helper to get a specific subfolder by name
 */
function getSubfolder(folderName) {
  const parent = getOrCreateParentFolder();
  const subfolders = parent.getFoldersByName(folderName);
  if (subfolders.hasNext()) {
    return subfolders.next();
  }
  return parent.createFolder(folderName);
}

/**
 * Handle Base64 file upload from client and save to Google Drive
 */
function uploadFileToDrive(base64Data, fileName, mimeType) {
  try {
    const folder = getSubfolder("uploads");
    const rawData = base64Data.split(",")[1] || base64Data;
    const decoded = Utilities.base64Decode(rawData);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    
    // Set file access to public view link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl() };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Submits a new blueprint request (Menu 1 - REQ-XXXX)
 */
function requestDocument(data) {
  try {
    const sheet = getRequestSheet();
    const timestamp = new Date();
    
    const lastRow = sheet.getLastRow();
    const nextNum = lastRow > 1 ? lastRow : 1;
    const requestCode = "REQ-" + String(1000 + nextNum);
    
    sheet.appendRow([
      timestamp,
      "REQUEST",
      requestCode,
      data.name,
      data.company,
      data.phone,
      data.email,
      data.details,
      "WAITING_ADMIN", 
      "",  // File Link
      "",  // Staff Notes
      ""   // Linked Request
    ]);
    
    // 1. Send email confirmation to User
    try {
      MailApp.sendEmail({
        to: data.email,
        subject: "STeP CMU: ได้รับคำขอรับแบบแปลน " + requestCode,
        htmlBody: `<h3>สวัสดีคุณ ${data.name}</h3>
                   <p>ระบบได้รับคำขอรับแบบแปลนของพื้นที่เรียบร้อยแล้ว</p>
                   <p><b>รหัสคำขอคือ:</b> <span style="font-size:16px; color:#f2a32d; font-weight:bold;">${requestCode}</span></p>
                   <p>คุณสามารถใช้รหัสนี้ในการเช็กขั้นตอนการทำงานได้ตลอดเวลา</p>
                   <br/>
                   <p>ฝ่ายจัดการสิ่งอำนวยความสะดวก STeP CMU</p>`
      });
    } catch (e) {
      console.warn("User Mail error: " + e);
    }
    
    // 2. Send email notification to Staff (Admin)
    try {
      MailApp.sendEmail({
        to: STAFF_EMAIL,
        subject: "STeP Alert: มีคำขอรับแบบแปลนยื่นเข้ามาใหม่ " + requestCode,
        htmlBody: `<h3>แจ้งเตือนเจ้าหน้าที่จัดการพื้นที่ STeP CMU</h3>
                   <p>มีผู้ยื่นคำขอรับแบบแปลนเข้ามาใหม่ในระบบ</p>
                   <p><b>รหัสคำขอ:</b> <span style="color:#f2a32d; font-weight:bold;">${requestCode}</span></p>
                   <p><b>ผู้ขอ:</b> คุณ ${data.name} (บริษัท ${data.company})</p>
                   <p><b>เบอร์ติดต่อ:</b> ${data.phone} | <b>อีเมล:</b> ${data.email}</p>
                   <p><b>รายละเอียดเพิ่มเติม:</b> ${data.details || "-"}</p>
                   <br/>
                   <p>กรุณาล็อกอินเข้าระบบพอร์ทัลแอดมินเพื่อดำเนินงานตรวจสอบคำขอ</p>`
      });
    } catch (e) {
      console.warn("Staff Mail error: " + e);
    }
    
    return { success: true, requestCode: requestCode };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Submits a blueprint revision/review request (Menu 2 - REV-XXXX)
 */
function reviewDocument(data) {
  try {
    const sheet = getRequestSheet();
    const timestamp = new Date();
    
    const lastRow = sheet.getLastRow();
    const nextNum = lastRow > 1 ? lastRow : 1;
    const requestCode = "REV-" + String(1000 + nextNum);
    
    // Save file
    let fileUrl = "";
    if (data.fileData && data.fileName) {
      const uploadRes = uploadFileToDrive(data.fileData, data.fileName, data.fileMime);
      if (uploadRes.success) {
        fileUrl = uploadRes.url;
      } else {
        return { success: false, error: "อัปโหลดไฟล์ล้มเหลว: " + uploadRes.error };
      }
    }
    
    sheet.appendRow([
      timestamp,
      "REVIEW",
      requestCode,
      data.name,
      data.company,
      data.phone,
      data.email,
      data.details || (data.isRevision ? "ส่งแบบแก้ไขเพิ่มเติม" : "ยื่นแบบตรวจสอบแปลนครั้งแรก"),
      "WAITING_ENGINEER", // Directly to Engineer for review
      fileUrl,
      "", // Staff Notes
      data.isRevision ? data.linkedRequest : "" // Linked Request
    ]);
    
    // 1. Send email confirmation to User
    try {
      MailApp.sendEmail({
        to: data.email,
        subject: "STeP CMU: ได้รับแบบแปลนที่ส่งตรวจสอบ " + requestCode,
        htmlBody: `<h3>สวัสดีคุณ ${data.name}</h3>
                   <p>ระบบได้รับไฟล์แบบแปลนที่ท่านยื่นส่งตรวจเรียบร้อยแล้ว</p>
                   <p><b>รหัสคำขอยื่นตรวจคือ:</b> <span style="font-size:16px; color:#f2a32d; font-weight:bold;">${requestCode}</span></p>
                   <p><b>ประเภทคำขอ:</b> ${data.isRevision ? "ส่งแบบแก้ไข (อ้างอิงรหัสเดิม: " + data.linkedRequest + ")" : "ส่งตรวจสอบครั้งแรก"}</p>
                   ${fileUrl ? `<p><b>ลิงก์ไฟล์ที่อัปโหลด:</b> <a href="${fileUrl}" target="_blank">คลิกเพื่อดูไฟล์</a></p>` : ''}
                   <p>คุณสามารถใช้รหัสนี้ตรวจสอบการพิจารณาตรวจสอบจากฝ่ายวิศวกรได้ตลอดเวลา</p>
                   <br/>
                   <p>ฝ่ายวิศวกรรมและเทคนิค STeP CMU</p>`
      });
    } catch (e) {
      console.warn("User Mail error: " + e);
    }
    
    // 2. Send email notification to Staff (Engineer)
    try {
      MailApp.sendEmail({
        to: STAFF_EMAIL,
        subject: "STeP Alert: มีงานส่งตรวจแบบแปลนอาคารยื่นใหม่ " + requestCode,
        htmlBody: `<h3>แจ้งเตือนฝ่ายวิศวกรรมและสิ่งอำนวยความสะดวก STeP CMU</h3>
                   <p>มีแบบแปลนยื่นเข้ามาให้ตรวจสอบความปลอดภัยใหม่ในระบบ</p>
                   <p><b>รหัสส่งตรวจ:</b> <span style="color:#f2a32d; font-weight:bold;">${requestCode}</span></p>
                   <p><b>ประเภทคำขอ:</b> ${data.isRevision ? "ส่งงานแก้ไขแบบอาคาร (อ้างอิงใบเดิม: " + data.linkedRequest + ")" : "ส่งตรวจแบบแปลนครั้งแรก"}</p>
                   <p><b>ผู้ยื่น:</b> คุณ ${data.name} (บริษัท ${data.company})</p>
                   ${fileUrl ? `<p><b>ลิงก์เปิดดูแบบแปลน:</b> <a href="${fileUrl}" target="_blank">คลิกตรวจสอบแบบแปลนที่นี่</a></p>` : ''}
                   <br/>
                   <p>กรุณาล็อกอินเข้าระบบพอร์ทัลเพื่อตรวจแบบแปลนอาคารหรือใช้งาน AI เพื่อช่วยประเมินร่วมกัน</p>`
      });
    } catch (e) {
      console.warn("Staff Mail error: " + e);
    }
    
    return { success: true, requestCode: requestCode };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Checks request status by code and lists timeline.
 */
function checkRequestStatus(code) {
  try {
    const sheet = getRequestSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === code) {
        const type = data[i][1];
        const status = data[i][8];
        const staffNotes = data[i][10];
        
        let currentStep = 1;
        if (status === "WAITING_ADMIN") {
          currentStep = 2;
        } else if (status === "WAITING_ENGINEER") {
          currentStep = 3;
        } else if (status === "APPROVED" || status === "REJECTED") {
          currentStep = 4;
        }
        
        // If rejected, fetch recommended docs from 'ref' subfolder
        let recommendationDocs = [];
        if (status === "REJECTED") {
          try {
            const refFolder = getSubfolder("ref");
            const files = refFolder.getFiles();
            while (files.hasNext()) {
              const file = files.next();
              recommendationDocs.push({
                name: file.getName(),
                url: file.getUrl()
              });
            }
          } catch (e) {
            console.warn("Ref folder load error: " + e);
          }
        }
        
        return {
          success: true,
          found: true,
          data: {
            type: type,
            requestCode: data[i][2],
            name: data[i][3],
            company: data[i][4],
            details: data[i][7],
            status: status,
            fileLink: data[i][9],
            staffNotes: staffNotes,
            linkedRequest: data[i][11],
            currentStep: currentStep,
            recommendations: recommendationDocs
          }
        };
      }
    }
    return { success: true, found: false };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Fetches assets from Google Drive folders (ref, asset, skill.md) dynamically
 */
function fetchDriveAssets() {
  const assets = {
    refFiles: [],
    templates: [],
    skillInstructions: ""
  };
  
  try {
    // 1. Read files from 'ref' folder
    const refFolder = getSubfolder("ref");
    const refFiles = refFolder.getFiles();
    while (refFiles.hasNext()) {
      const file = refFiles.next();
      let textContent = "";
      if (file.getMimeType() === MimeType.PLAIN_TEXT || file.getName().endsWith(".txt")) {
        textContent = file.getAs(MimeType.PLAIN_TEXT).getDataAsString();
      }
      assets.refFiles.push({
        name: file.getName(),
        url: file.getUrl(),
        content: textContent
      });
    }
    
    // 2. Read templates from 'asset' folder
    const assetFolder = getSubfolder("asset");
    const templates = assetFolder.getFiles();
    while (templates.hasNext()) {
      const file = templates.next();
      assets.templates.push({
        name: file.getName(),
        url: file.getUrl()
      });
    }
    
    // 3. Read skill.md
    const parent = getOrCreateParentFolder();
    const skillFiles = parent.getFilesByName("skill.md");
    if (skillFiles.hasNext()) {
      const file = skillFiles.next();
      assets.skillInstructions = file.getAs(MimeType.PLAIN_TEXT).getDataAsString();
    }
  } catch (err) {
    console.error("fetchDriveAssets failed: " + err);
  }
  
  return assets;
}

/**
 * Fetches all requests for the staff dashboard (passcode required)
 */
function getPendingRequests(passcode) {
  if (passcode !== STAFF_PASSCODE) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  
  try {
    const sheet = getRequestSheet();
    const data = sheet.getDataRange().getValues();
    const requests = [];
    
    for (let i = 1; i < data.length; i++) {
      requests.push({
        rowNum: i + 1,
        timestamp: data[i][0],
        type: data[i][1],
        requestCode: data[i][2],
        name: data[i][3],
        company: data[i][4],
        phone: data[i][5],
        email: data[i][6],
        details: data[i][7],
        status: data[i][8],
        fileLink: data[i][9],
        staffNotes: data[i][10],
        linkedRequest: data[i][11]
      });
    }
    
    return { success: true, requests: requests };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Admin action on a request
 */
function adminDecision(code, decision, notes, passcode) {
  if (passcode !== STAFF_PASSCODE) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  
  try {
    const sheet = getRequestSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === code) {
        const row = i + 1;
        const newStatus = decision === "APPROVE" ? "WAITING_ENGINEER" : "REJECTED";
        
        sheet.getRange(row, 9).setValue(newStatus); // Status (Col I)
        sheet.getRange(row, 11).setValue(notes);    // Staff Notes (Col K)
        sheet.getRange(row, 13).setValue(new Date()); // Decision Timestamp (Col M)
        
        // 1. Email User
        const userEmail = data[i][6];
        const userName = data[i][3];
        try {
          MailApp.sendEmail({
            to: userEmail,
            subject: `STeP CMU: ผลการพิจารณาเบื้องต้นสำหรับคำขอ ${code}`,
            htmlBody: `<h3>สวัสดีคุณ ${userName}</h3>
                       <p>ฝ่ายบริการสิ่งอำนวยความสะดวกได้ตรวจสอบคำขอ ${code} ของคุณแล้ว</p>
                       <p><b>ผลการพิจารณา:</b> <span style="font-weight:bold; color:${decision === 'APPROVE' ? '#10b981' : '#ef4444'};">${decision === 'APPROVE' ? 'อนุมัติเบื้องต้น (ส่งต่อวิศวกรตรวจสอบแปลน)' : 'ปฏิเสธคำขอเบื้องต้น'}</span></p>
                       <p><b>ความเห็นจากแอดมิน:</b> ${notes || "-"}</p>
                       <br/>
                       <p>ฝ่ายบริการสิ่งอำนวยความสะดวก STeP CMU</p>`
          });
        } catch (e) {}
        
        // 2. Email Staff (Cross-notify)
        try {
          if (decision === "APPROVE") {
            MailApp.sendEmail({
              to: STAFF_EMAIL,
              subject: `STeP Alert: ส่งงานต่อถึงวิศวกรเพื่อตรวจแปลนห้อง ${code}`,
              htmlBody: `<h3>แจ้งฝ่ายวิศวกรรมอาคาร</h3>
                         <p>แอดมินได้อนุมัติเอกสารคำขอเบื้องต้นเลขงาน ${code} เรียบร้อยแล้ว และระบบได้ส่งต่องานนี้เข้าคิวตรวจแปลนของวิศวกรต่อ</p>
                         <p><b>ความเห็นพนักงานแอดมิน:</b> ${notes || "-"}</p>
                         <br/>
                         <p>กรุณาเข้าระบบเพื่อวิเคราะห์แบบแปลนนี้</p>`
            });
          } else {
            MailApp.sendEmail({
              to: STAFF_EMAIL,
              subject: `STeP Record: มีการปฏิเสธคำขอแรกเริ่มของงาน ${code}`,
              htmlBody: `<h3>บันทึกการตัดสินใจการปฏิเสธ (แอดมิน)</h3>
                         <p>รหัสงาน: <b>${code}</b> ได้รับการยกเลิก/ปฏิเสธเบื้องต้นเรียบร้อยแล้ว</p>
                         <p><b>ผู้ขอ:</b> คุณ ${userName} (${userEmail})</p>
                         <p><b>หมายเหตุแอดมิน:</b> ${notes || "-"}</p>`
            });
          }
        } catch (e) {}
        
        return { success: true };
      }
    }
    return { success: false, error: "ไม่พบคำขอ" };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Engineer action on a request
 */
function engineerDecision(code, decision, notes, fileLink, passcode) {
  if (passcode !== STAFF_PASSCODE) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  
  try {
    const sheet = getRequestSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === code) {
        const row = i + 1;
        const newStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
        
        sheet.getRange(row, 9).setValue(newStatus); // Status (Col I)
        sheet.getRange(row, 11).setValue(notes);    // Staff Notes (Col K)
        sheet.getRange(row, 13).setValue(new Date()); // Decision Timestamp (Col M)
        if (decision === "APPROVE" && fileLink) {
          sheet.getRange(row, 10).setValue(fileLink); // File Link (Col J)
        }
        
        // 1. Email User
        const userEmail = data[i][6];
        const userName = data[i][3];
        try {
          MailApp.sendEmail({
            to: userEmail,
            subject: `STeP CMU: ผลการตรวจสอบแบบแปลนสำหรับคำขอ ${code}`,
            htmlBody: `<h3>สวัสดีคุณ ${userName}</h3>
                       <p>ฝ่ายวิศวกรรม/เทคนิคได้ตรวจสอบคำขอยื่นแปลน ${code} เรียบร้อยแล้ว</p>
                       <p><b>ผลการพิจารณาพิจารณาตัดสินสุดท้าย:</b> <span style="font-weight:bold; color:${decision === 'APPROVE' ? '#10b981' : '#ef4444'};">${decision === 'APPROVE' ? 'อนุมัติแบบแปลนผ่านเกณฑ์เรียบร้อย' : 'ปฏิเสธ / สั่งให้ดำเนินการแก้ไขแบบแปลนใหม่'}</span></p>
                       <p><b>ความเห็น/ข้อเสนอแนะวิศวกร:</b> ${notes || "-"}</p>
                       ${decision === 'APPROVE' && fileLink ? `<p><b>ลิงก์ดาวน์โหลดไฟล์แบบแปลนที่อนุมัติ:</b> <a href="${fileLink}" target="_blank">คลิกที่นี่เพื่อดาวน์โหลดไฟล์</a></p>` : ''}
                       <br/>
                       <p>ฝ่ายวิศวกรรมและเทคนิค STeP CMU</p>`
          });
        } catch (e) {}
        
        // 2. Email Admin Team (Cross-notify/Record)
        try {
          MailApp.sendEmail({
            to: STAFF_EMAIL,
            subject: `STeP Record: ผลตรวจแบบแปลนสุดท้ายสำหรับ ${code} (${newStatus})`,
            htmlBody: `<h3>รายงานผลตรวจสอบแบบแปลนโดยวิศวกร</h3>
                       <p>รหัสคำขอ: <b>${code}</b></p>
                       <p>ผลการตรวจสอบสุดท้าย: <span style="font-weight:bold; color:${decision === 'APPROVE' ? '#10b981' : '#ef4444'};">${decision === 'APPROVE' ? 'อนุมัติเสร็จสิ้นสำเร็จ' : 'ปฏิเสธไม่ผ่านและสั่งแก้ไข'}</span></p>
                       <p><b>ผู้ยื่นแบบแปลน:</b> คุณ ${userName} (${userEmail}) จากบริษัท ${data[i][4]}</p>
                       <p><b>หมายเหตุวิศวกรผู้ตรวจ:</b> ${notes || "-"}</p>
                       ${decision === 'APPROVE' && fileLink ? `<p>ลิงก์เก็บเอกสารแบบแปลนในระบบ: <a href="${fileLink}">${fileLink}</a></p>` : ''}`
          });
        } catch (e) {}
        
        return { success: true };
      }
    }
    return { success: false, error: "ไม่พบคำขอ" };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Compiles aggregated statistics from Sheets data for the Dashboard
 */
function getStatistics(passcode) {
  if (passcode !== STAFF_PASSCODE) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  
  try {
    const sheet = getRequestSheet();
    const data = sheet.getDataRange().getValues();
    
    let total = 0;
    let requestCount = 0;
    let reviewCount = 0;
    
    let waitingAdmin = 0;
    let waitingEngineer = 0;
    let approved = 0;
    let rejected = 0;
    
    const companyCount = {};
    const statusOverTime = {};
    
    let totalDuration = 0;
    let completedCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const type = data[i][1];
      const status = data[i][8];
      const company = data[i][4];
      const submitDate = data[i][0] ? new Date(data[i][0]) : null;
      const decisionDate = data[i][12] ? new Date(data[i][12]) : null; // Column M is 12 (0-indexed)
      
      total++;
      if (type === "REQUEST") requestCount++;
      if (type === "REVIEW") reviewCount++;
      
      if (status === "WAITING_ADMIN") waitingAdmin++;
      else if (status === "WAITING_ENGINEER") waitingEngineer++;
      else if (status === "APPROVED") approved++;
      else if (status === "REJECTED") rejected++;
      
      if (company) {
        companyCount[company] = (companyCount[company] || 0) + 1;
      }
      
      // Group by date YYYY-MM-DD
      if (data[i][0] && submitDate) {
        const dateStr = submitDate.getFullYear() + "-" + String(submitDate.getMonth() + 1).padStart(2, '0') + "-" + String(submitDate.getDate()).padStart(2, '0');
        statusOverTime[dateStr] = (statusOverTime[dateStr] || 0) + 1;
      }
      
      // Calculate duration for completed requests (APPROVED or REJECTED)
      if ((status === "APPROVED" || status === "REJECTED") && submitDate && decisionDate && !isNaN(submitDate.getTime()) && !isNaN(decisionDate.getTime())) {
        const diff = decisionDate.getTime() - submitDate.getTime();
        if (diff >= 0) {
          totalDuration += diff;
          completedCount++;
        }
      }
    }
    
    let avgDurationText = "ไม่มีข้อมูลการปิดงาน";
    if (completedCount > 0) {
      const avgMs = totalDuration / completedCount;
      const avgMins = avgMs / 60000;
      const avgHours = avgMs / 3600000;
      const avgDays = avgMs / 86400000;
      
      if (avgMins < 60) {
        avgDurationText = Math.round(avgMins) + " นาที";
      } else if (avgHours < 24) {
        avgDurationText = avgHours.toFixed(1) + " ชั่วโมง";
      } else {
        avgDurationText = avgDays.toFixed(1) + " วัน";
      }
    }
    
    const successRate = total > 0 ? ((approved / total) * 100).toFixed(1) + "%" : "0%";
    
    return {
      success: true,
      stats: {
        total: total,
        requestCount: requestCount,
        reviewCount: reviewCount,
        waitingAdmin: waitingAdmin,
        waitingEngineer: waitingEngineer,
        approved: approved,
        rejected: rejected,
        companyShare: companyCount,
        timeline: statusOverTime,
        avgDuration: avgDurationText,
        successRate: successRate
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Processes chat messages in a serverless manner directly inside Apps Script
 * using the Gemini API and database context.
 */
function runServerlessChat(message, passcode) {
  if (passcode !== STAFF_PASSCODE) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";
  if (!apiKey) {
    return { 
      success: false, 
      error: "กรุณาตั้งค่า Script Property ชื่อ 'GEMINI_API_KEY' ในหน้าต่างตั้งค่าโครงการ Apps Script ก่อนใช้งานฟังก์ชันแชทแบบ Serverless" 
    };
  }
  
  try {
    // 1. Gather sheet data context
    const sheet = getRequestSheet();
    const sheetData = sheet.getDataRange().getValues();
    let sheetTextContext = "รายการคำขอและสถานะปัจจุบัน:\n";
    // Limit to latest 100 entries to avoid token limit
    const limit = Math.min(sheetData.length, 101);
    for (let i = 1; i < limit; i++) {
      sheetTextContext += `- รหัส: ${sheetData[i][2]}, ประเภท: ${sheetData[i][1]}, ผู้ยื่น: ${sheetData[i][3]}, หน่วยงาน: ${sheetData[i][4]}, สถานะ: ${sheetData[i][8]}, รายละเอียด: ${sheetData[i][7]}, ความเห็นวิศวกร: ${sheetData[i][10]}\n`;
    }
    
    // 2. Gather Drive knowledge assets context
    const assets = fetchDriveAssets();
    let driveKnowledgeContext = "คู่มือและข้อกำหนดความรู้บน Google Drive:\n";
    assets.refFiles.forEach(f => {
      driveKnowledgeContext += `--- ไฟล์: ${f.name} ---\n${f.content || "(ไม่มีเนื้อหา)"}\n`;
    });
    driveKnowledgeContext += `\nคำสั่ง/ทักษะตรวจสอบ (skill.md):\n${assets.skillInstructions}\n`;
    
    // 3. Create payload for Gemini API
    const systemPrompt = `You are the STeP CMU Blueprint Agent, a virtual assistant for the Facilities and Workspace Management team at Science and Technology Park, Chiang Mai University.
Help STeP staff manage and review blueprint requests. You have the following database and reference context:

${sheetTextContext}

${driveKnowledgeContext}

Speak in a professional, polite, and helpful tone. Always reply in Thai language. Answer the user's question accurately using the context above. If they ask for statistics, calculate them using the list of requests.`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nคำถามจากเจ้าหน้าที่: ${message}` }]
        }
      ]
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro"
    ];
    
    let responseText = "";
    let lastError = "";

    for (let m = 0; m < modelsToTry.length; m++) {
      const modelName = modelsToTry[m];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      
      let maxRetries = 2;
      let baseDelayMs = 1000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = UrlFetchApp.fetch(url, options);
          responseText = response.getContentText();
          const json = JSON.parse(responseText);
          
          if (json.error) {
            const code = json.error.code;
            const status = json.error.status;
            lastError = `โมเดล ${modelName} ผิดพลาด (Code: ${code}, Status: ${status}, Message: ${json.error.message})`;
            
            if (code === 503 || code === 429 || status === "UNAVAILABLE" || status === "RESOURCE_EXHAUSTED") {
              if (attempt < maxRetries - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                Utilities.sleep(delay);
                continue;
              }
            }
            if (code === 404) {
              break;
            }
          } else if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
            return { success: true, reply: json.candidates[0].content.parts[0].text };
          }
        } catch (e) {
          lastError = `โมเดล ${modelName} Exception: ${e.toString()}`;
          if (attempt < maxRetries - 1) {
            const delay = baseDelayMs * Math.pow(2, attempt);
            Utilities.sleep(delay);
            continue;
          }
        }
      }
    }

    return { 
      success: false, 
      error: "การตอบสนองจาก Gemini API ล้มเหลวทุกโมเดลหลักและโมเดลสำรอง: " + (responseText || lastError) 
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

