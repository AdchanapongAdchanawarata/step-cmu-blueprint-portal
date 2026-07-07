const { google } = require('googleapis');
const { config } = require('./google_services');

const oauth2Client = new google.auth.OAuth2(
  config.CLIENT_ID,
  config.CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: config.REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

/**
 * Helper to encode email in RFC 2822 base64url format
 */
function createRawEmail(to, subject, htmlBody, inReplyTo = null, references = null, replyTo = null, cc = null) {
  const senderName = "STeP CMU Blueprint Portal";
  const senderEmail = "adchanawarata@gmail.com"; // Authenticated sender account

  let emailLines = [
    `From: "${senderName}" <${senderEmail}>`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`
  ];

  if (replyTo) {
    emailLines.push(`Reply-To: ${replyTo}`);
  }
  if (cc) {
    emailLines.push(`Cc: ${cc}`);
  }
  if (inReplyTo) {
    emailLines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    emailLines.push(`References: ${references}`);
  }

  emailLines.push('', htmlBody);
  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 1. Send initial confirmation email (New Thread)
 * Returns { threadId, messageId } to be saved in database
 */
async function sendConfirmationEmail(toEmail, applicantName, reqId) {
  try {
    const subject = `[STeP CMU] ยืนยันการรับคำร้องงานแบบแปลนและอาคารสถานที่ (รหัส: ${reqId})`;
    const htmlBody = `
      <div style="font-family: 'Sarabun', 'Prompt', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f59e0b;">
          <h2 style="color: #d97706; margin: 0;">ศูนย์นวัตกรรมและการจัดการพื้นที่ (STeP CMU)</h2>
          <p style="color: #64748b; font-size: 14px; margin: 5px 0 0;">ระบบบริการตรวจสอบและคัดลอกแบบแปลนอาคารสถานที่</p>
        </div>
        <div style="padding: 20px 0; color: #334155; line-height: 1.6;">
          <p>เรียน คุณ <strong>${applicantName}</strong>,</p>
          <p>ทางศูนย์ฯ ได้รับเอกสารคำร้องของท่านเรียบร้อยแล้ว โดยมีรายละเอียดรหัสติดตามเรื่องดังนี้:</p>
          <div style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0; text-align: center;">
            <span style="font-size: 14px; color: #78350f; display: block;">รหัสติดตามคำร้องของท่าน</span>
            <strong style="font-size: 24px; color: #d97706; letter-spacing: 1px;">${reqId}</strong>
          </div>
          <p>🧑‍🔧 ทีมงานวิศวกรและผู้ดูแลระบบกำลังเร่งดำเนินการและตรวจสอบข้อกำหนดของท่านโดยเร็วที่สุด</p>
          <p style="color: #d97706; font-weight: bold;">⚠️ หมายเหตุสำคัญ: การตอบกลับผลการพิจารณาและแจ้งรายละเอียดจากเจ้าหน้าที่ จะเป็นการตอบกลับ (Reply) ในอีเมลฉบับนี้ ท่านไม่ต้องสร้างอีเมลใหม่ครับ</p>
          <p>ท่านสามารถตรวจสอบสถานะการดำเนินงานแบบ Real-time ได้ผ่านเว็บไซต์ระบบบริการของเราตลอด 24 ชั่วโมง</p>
        </div>
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
          <p>© 2026 Science and Technology Park, Chiang Mai University (STeP CMU)</p>
        </div>
      </div>
    `;

    const raw = createRawEmail(toEmail, subject, htmlBody);
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    // Get message details to extract Message-ID header
    const msgDetails = await gmail.users.messages.get({
      userId: 'me',
      id: res.data.id,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'Message-Id', 'message-id']
    });

    let messageIdHeader = res.data.id;
    const headers = msgDetails.data.payload?.headers || [];
    const foundHeader = headers.find(h => h.name.toLowerCase() === 'message-id');
    if (foundHeader) {
      messageIdHeader = foundHeader.value;
    }

    console.log(`✉️ ส่งอีเมลยืนยัน ${reqId} สำเร็จ! Thread ID: ${res.data.threadId} | Msg ID: ${messageIdHeader}`);
    return {
      threadId: res.data.threadId,
      messageId: messageIdHeader
    };
  } catch (err) {
    console.error("Error sending confirmation email:", err);
    return { threadId: '', messageId: '' };
  }
}

/**
 * 2. Send threaded reply email from Admin
 */
async function sendThreadedReply(toEmail, applicantName, reqId, replyTextHtml, threadId, originalMessageId, adminEmail = null) {
  try {
    const subject = `Re: [STeP CMU] ยืนยันการรับคำร้องงานแบบแปลนและอาคารสถานที่ (รหัส: ${reqId})`;
    const htmlBody = `
      <div style="font-family: 'Sarabun', 'Prompt', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f59e0b;">
          <h2 style="color: #d97706; margin: 0;">ศูนย์นวัตกรรมและการจัดการพื้นที่ (STeP CMU)</h2>
          <p style="color: #64748b; font-size: 14px; margin: 5px 0 0;">แจ้งผลการพิจารณาและรายละเอียดสำหรับคำร้อง <strong>${reqId}</strong></p>
        </div>
        <div style="padding: 20px 0; color: #334155; line-height: 1.6;">
          <p>เรียน คุณ <strong>${applicantName}</strong>,</p>
          <div style="background-color: #fffbeb; padding: 20px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
            ${replyTextHtml}
          </div>
          ${adminEmail ? `
          <div style="background-color: #fffbeb; border: 1px dashed #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 13px; color: #78350f;">
            👤 <strong>เจ้าหน้าที่ผู้รับผิดชอบและตอบคำร้องนี้:</strong> <span style="color: #ea580c; font-weight: bold;">${adminEmail}</span><br>
            ✉️ <em>เมื่อท่านกดตอบกลับ (Reply) อีเมลฉบับนี้ ข้อความของท่านจะถูกส่งตรงไปยังอีเมลของเจ้าหน้าที่ท่านนี้โดยตรงครับ</em>
          </div>` : ''}
          <p>หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการติดต่อเจ้าหน้าที่ สามารถติดต่อสอบถามหรือตอบกลับ (Reply) ในอีเมลฉบับนี้ได้ทันทีครับ</p>
        </div>
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
          <p>© 2026 Science and Technology Park, Chiang Mai University (STeP CMU)</p>
        </div>
      </div>
    `;

    const raw = createRawEmail(toEmail, subject, htmlBody, originalMessageId, originalMessageId, adminEmail, adminEmail);
    
    const requestBody = { raw };
    if (threadId) {
      requestBody.threadId = threadId;
    }

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody
    });

    console.log(`✉️ ส่งอีเมลตอบกลับ (Reply Thread) ${reqId} สำเร็จ! Thread ID: ${res.data.threadId}`);
    return true;
  } catch (err) {
    console.error("Error sending threaded reply email:", err);
    throw err;
  }
}

/**
 * 3. Send Admin Magic Link Email
 */
async function sendAdminMagicLink(toEmail, token, baseUrl) {
  try {
    const magicLink = `${baseUrl || 'http://localhost:8000'}/admin.html?token=${token}`;
    const subject = `[STeP CMU Portal] 🔒 ลิงก์เข้าสู่ระบบหลังบ้านสำหรับเจ้าหน้าที่ (Magic Link)`;
    const htmlBody = `
      <div style="font-family: 'Sarabun', 'Prompt', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #27272a; border-radius: 12px; background: linear-gradient(to bottom, #0a0a0a, #18181b); color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px;">
          <h2 style="color: #fbbf24; margin: 0;">STeP Blueprint Portal</h2>
          <p style="color: #a1a1aa; font-size: 14px;">ระบบจัดการคำร้องและ AI ตรวจแบบสำหรับเจ้าหน้าที่</p>
        </div>
        <div style="background-color: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px solid rgba(245, 158, 11, 0.2);">
          <p style="color: #e4e4e7; font-size: 16px; margin-bottom: 25px;">คุณได้ขอเข้าสู่ระบบหลังบ้านในฐานะผู้ดูแลระบบ</p>
          <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #ea580c, #f59e0b); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(234, 88, 12, 0.4);">🚀 คลิกเพื่อเข้าสู่ระบบทันที</a>
          <p style="color: #71717a; font-size: 12px; margin-top: 20px;">ลิงก์นี้มีความปลอดภัยสูง และมีอายุการใช้งาน 24 ชั่วโมง</p>
        </div>
        <div style="text-align: center; color: #71717a; font-size: 11px;">
          <p>หากคุณไม่ได้เป็นผู้ขอเข้าสู่ระบบ กรุณาละเลยอีเมลฉบับนี้</p>
        </div>
      </div>
    `;

    const raw = createRawEmail(toEmail, subject, htmlBody);
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    console.log(`🔒 ส่ง Magic Link ไปยัง ${toEmail} เรียบร้อยแล้ว!`);
    return true;
  } catch (err) {
    console.error("Error sending magic link email:", err);
    throw err;
  }
}

module.exports = {
  sendConfirmationEmail,
  sendThreadedReply,
  sendAdminMagicLink
};
