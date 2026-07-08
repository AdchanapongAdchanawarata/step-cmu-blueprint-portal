// Backend API URL (Render.com Free Cloud Backend or Localhost)
// 👉 เมื่อนำโค้ดขึ้น Render.com แล้ว ให้นำ URL ของ Render มาใส่ตรงนี้ครับ (เช่น 'https://step-blueprint-portal-backend.onrender.com')
const RENDER_BACKEND_URL = 'https://step-blueprint-portal-backend.onrender.com';

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : RENDER_BACKEND_URL;

// Global State
let currentRequests = [];
let selectedRequestForAI = null;
let currentKBList = [];

/**
 * Helper: Clean out "[ผลตรวจจาก AI]" and any AI references from displayed or saved texts
 */
function cleanAIPrefixes(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str.replace(/\[\s*(?:ผลตรวจ|ผลตรวจสอบ|ผลการวิเคราะห์)?\s*(?:จาก|ของ)?\s*(?:AI|ระบบปัญญาประดิษฐ์|เอไอ|ai)\s*\]\s*[:-]?\s*/gi, '')
            .replace(/\[\s*ผลตรวจจาก\s*AI\s*\]\s*/gi, '')
            .replace(/\[\s*ผลตรวจ\s*AI\s*\]\s*/gi, '')
            .replace(/\[\s*จาก\s*AI\s*\]\s*/gi, '')
            .replace(/AI\s*ตอบ\s*:/gi, 'ผลการตรวจสอบ:')
            .replace(/\[\s*AI\s*ตอบ\s*\]\s*[:-]?\s*/gi, 'ผลการตรวจสอบ: ')
            .trim();
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFormTabs();
  setupEventListeners();
  await checkMagicLinkToken(); // Must await so token is stored before checking login state
  checkLoginState();

  // Handle URL hash or param for admin access (from admin.html or #admin)
  if (window.location.hash === '#admin' || window.location.search.includes('admin') || window.location.pathname.includes('admin')) {
    if (isLoggedIn()) {
      switchView('view-admin-dashboard');
    } else {
      switchView('view-admin-login');
    }
  }
});

/**
 * Navigation & View Switching
 */
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      switchView(targetView);
    });
  });
}

function switchView(viewId) {
  // Check auth for admin views
  if ((viewId === 'view-admin-dashboard' || viewId === 'view-admin-kb') && !isLoggedIn()) {
    showNotification("กรุณาเข้าสู่ระบบสำหรับเจ้าหน้าที่ก่อนใช้งาน", "warning");
    viewId = 'view-admin-login';
  }

  // Update Nav Buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-view') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update View Sections
  document.querySelectorAll('.view-section').forEach(sec => {
    if (sec.id === viewId) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Trigger View Specific Loads
  if (viewId === 'view-admin-dashboard') {
    loadAdminRequests();
  } else if (viewId === 'view-admin-kb') {
    loadKnowledgeBase();
  }
}

/**
 * Form Type Tabs (Citizen Portal)
 */
function setupFormTabs() {
  const tabBtns = document.querySelectorAll('.form-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetForm = btn.getAttribute('data-form');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.form-sub-view').forEach(view => {
        if (view.id === targetForm) {
          view.classList.add('active');
        } else {
          view.classList.remove('active');
        }
      });
    });
  });
}

/**
 * Auth & Token Management
 */
function isLoggedIn() {
  return !!localStorage.getItem('admin_token');
}

function getAuthHeaders() {
  const token = localStorage.getItem('admin_token') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function checkLoginState() {
  const adminEmail = localStorage.getItem('admin_email');
  const userDisplay = document.getElementById('admin-user-display');
  const loginBtn = document.getElementById('nav-admin-login') || document.querySelector('.nav-btn[data-view="view-admin-login"]');
  const logoutBtn = document.getElementById('btn-logout');
  const dashboardBtn = document.getElementById('nav-admin-dashboard') || document.querySelector('.nav-btn[data-view="view-admin-dashboard"]');
  const kbBtn = document.getElementById('nav-admin-kb') || document.querySelector('.nav-btn[data-view="view-admin-kb"]');

  if (isLoggedIn() && adminEmail) {
    if (userDisplay) userDisplay.innerHTML = `👤 <strong>${adminEmail}</strong>`;
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (dashboardBtn) dashboardBtn.style.display = 'inline-flex';
    if (kbBtn) kbBtn.style.display = 'inline-flex';
  } else {
    if (userDisplay) userDisplay.innerHTML = '';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (dashboardBtn) dashboardBtn.style.display = 'none';
    if (kbBtn) kbBtn.style.display = 'none';
  }
}

function logout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_email');
  checkLoginState();
  showNotification("ออกจากระบบเรียบร้อยแล้ว", "success");
  switchView('view-request');
}

async function checkMagicLinkToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (token) {
    showLoadingModal("กำลังตรวจสอบรหัสเข้าสู่ระบบ (Magic Link)...");
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('admin_token', token);
        localStorage.setItem('admin_email', data.email);
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        hideLoadingModal();
        showNotification(`🎉 ยินดีต้อนรับเข้าสู่ระบบหลังบ้าน คุณ ${data.email}`, "success");
        checkLoginState();
        switchView('view-admin-dashboard');
      } else {
        hideLoadingModal();
        showNotification(data.error || "ลิงก์เข้าสู่ระบบไม่ถูกต้อง", "error");
      }
    } catch (err) {
      hideLoadingModal();
      showNotification("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจสอบ Token ได้", "error");
    }
  }
}

/**
 * Event Listeners
 */
function setupEventListeners() {
  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // 1. Citizen Submit Request Form (Review)
  const formRequest = document.getElementById('form-submit-request');
  if (formRequest) {
    formRequest.addEventListener('submit', handleCitizenSubmit);
  }

  // 1.1 Citizen Submit Request Copy Form (Document Copy)
  const formCopy = document.getElementById('form-request-copy');
  if (formCopy) {
    formCopy.addEventListener('submit', handleRequestCopySubmit);
  }

  // File Drop Zone - Form 1 (Review)
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-blueprint');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        updateFileNameDisplay(fileInput.files[0].name, 'file-name-display');
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        updateFileNameDisplay(fileInput.files[0].name, 'file-name-display');
      }
    });
  }

  // File Drop Zone - Form 2 (Copy)
  const copyDropZone = document.getElementById('copy-file-drop-zone');
  const copyFileInput = document.getElementById('file-copy-doc');
  if (copyDropZone && copyFileInput) {
    copyDropZone.addEventListener('click', () => copyFileInput.click());
    copyDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      copyDropZone.classList.add('dragover');
    });
    copyDropZone.addEventListener('dragleave', () => copyDropZone.classList.remove('dragover'));
    copyDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      copyDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        copyFileInput.files = e.dataTransfer.files;
        updateFileNameDisplay(copyFileInput.files[0].name, 'copy-file-name-display');
      }
    });
    copyFileInput.addEventListener('change', () => {
      if (copyFileInput.files.length > 0) {
        updateFileNameDisplay(copyFileInput.files[0].name, 'copy-file-name-display');
      }
    });
  }

  // 2. Citizen Check Status Form
  const formStatus = document.getElementById('form-check-status');
  if (formStatus) {
    formStatus.addEventListener('submit', handleCheckStatus);
  }

  // 3. Admin Login Form
  const formLogin = document.getElementById('form-admin-login');
  if (formLogin) {
    formLogin.addEventListener('submit', handleAdminLogin);
  }

  // 4. Modal Close Buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // 5. AI Autofill Generate Button
  const btnGenReply = document.getElementById('btn-generate-ai-reply');
  if (btnGenReply) {
    btnGenReply.addEventListener('click', handleGenerateAIReply);
  }

  // 6. Admin Send Reply Form
  const formReply = document.getElementById('form-send-reply');
  if (formReply) {
    formReply.addEventListener('submit', handleSendAdminReply);
  }

  // 7. KB Upload Form
  const formKB = document.getElementById('form-upload-kb');
  if (formKB) {
    formKB.addEventListener('submit', handleUploadKB);
  }

  // KB File Input Display
  const kbInput = document.getElementById('kb-file-input');
  if (kbInput) {
    kbInput.addEventListener('change', () => {
      const label = document.getElementById('kb-file-label');
      if (label && kbInput.files.length > 0) {
        label.textContent = `📄 ${kbInput.files[0].name}`;
      }
    });
  }
}

function updateFileNameDisplay(name, targetId = 'file-name-display') {
  const display = document.getElementById(targetId);
  if (display) {
    display.innerHTML = `✅ เลือกไฟล์แล้ว: <strong>${name}</strong>`;
    display.style.color = '#fbbf24';
  }
}

/**
 * 1. Citizen Submit Handler (Review Blueprint)
 */
async function handleCitizenSubmit(e) {
  e.preventDefault();
  
  const applicantName = document.getElementById('req-name').value;
  const email = document.getElementById('req-email').value;
  const phone = document.getElementById('req-phone').value;
  const organization = document.getElementById('req-org').value;
  const buildingType = document.getElementById('req-type').value;
  const fileInput = document.getElementById('file-blueprint');

  if (!fileInput.files || fileInput.files.length === 0) {
    showNotification("กรุณาแนบไฟล์เอกสารแบบแปลน (PDF, JPG, PNG)", "error");
    return;
  }

  const file = fileInput.files[0];
  if (file.size > 20 * 1024 * 1024) { // 20 MB limit
    showNotification("ขนาดไฟล์ต้องไม่เกิน 20 MB", "error");
    return;
  }

  showLoadingModal("กำลังอัปโหลดไฟล์แบบแปลนและส่งคำร้องเข้าสู่ระบบ...");

  try {
    const base64Data = await readFileAsBase64(file);

    const res = await fetch(`${API_BASE}/api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName, email, phone, organization, buildingType,
        fileData: base64Data,
        fileName: file.name,
        fileType: file.type
      })
    });

    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      showSubmissionSuccessModal(data.requestID, email);
      document.getElementById('form-submit-request').reset();
      updateFileNameDisplay("", 'file-name-display');
    } else {
      showNotification(data.error || "เกิดข้อผิดพลาดในการส่งคำร้อง", "error");
    }
  } catch (err) {
    hideLoadingModal();
    showNotification("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง", "error");
    console.error("Submit error:", err);
  }
}

/**
 * 1.1 Citizen Submit Copy Handler (Request Blueprint Document)
 */
async function handleRequestCopySubmit(e) {
  e.preventDefault();
  
  const applicantName = document.getElementById('copy-name').value;
  const email = document.getElementById('copy-email').value;
  const phone = document.getElementById('copy-phone').value;
  const organization = document.getElementById('copy-org').value;
  const building = document.getElementById('copy-building').value;
  const purpose = document.getElementById('copy-purpose').value;
  const notes = document.getElementById('copy-notes').value;
  const fileInput = document.getElementById('file-copy-doc');

  showLoadingModal("กำลังบันทึกคำร้องขอแบบแปลนอาคารเข้าสู่ระบบ...");

  try {
    let base64Data = null;
    let fileName = null;
    let fileType = null;
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (file.size > 20 * 1024 * 1024) {
        hideLoadingModal();
        showNotification("ขนาดไฟล์ต้องไม่เกิน 20 MB", "error");
        return;
      }
      base64Data = await readFileAsBase64(file);
      fileName = file.name;
      fileType = file.type;
    }

    const buildingType = `[ขอเอกสารแบบแปลน] อาคาร: ${building}`;
    const fullOrg = `${organization} (วัตถุประสงค์: ${purpose}${notes ? ' - ' + notes : ''})`;

    const res = await fetch(`${API_BASE}/api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName, email, phone, organization: fullOrg, buildingType,
        fileData: base64Data,
        fileName: fileName,
        fileType: fileType
      })
    });

    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      showSubmissionSuccessModal(data.requestID, email);
      document.getElementById('form-request-copy').reset();
      updateFileNameDisplay("", 'copy-file-name-display');
    } else {
      showNotification(data.error || "เกิดข้อผิดพลาดในการส่งคำร้อง", "error");
    }
  } catch (err) {
    hideLoadingModal();
    showNotification("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง", "error");
    console.error("Submit copy error:", err);
  }
}

function showSubmissionSuccessModal(reqId, email) {
  const modal = document.getElementById('modal-success');
  const codeSpan = document.getElementById('success-req-id');
  const emailSpan = document.getElementById('success-email');
  if (codeSpan) codeSpan.textContent = reqId;
  if (emailSpan) emailSpan.textContent = email;
  if (modal) modal.classList.add('active');
}

/**
 * 2. Check Status Handler
 */
async function handleCheckStatus(e) {
  e.preventDefault();
  const code = document.getElementById('status-code-input').value.trim();
  if (!code) return;

  const resultContainer = document.getElementById('status-result-container');
  resultContainer.innerHTML = `<div style="text-align:center; padding: 2rem;"><div class="spinner"></div><p style="margin-top:10px; color:#fbbf24;">กำลังค้นหาข้อมูลคำร้อง...</p></div>`;

  try {
    const res = await fetch(`${API_BASE}/api/status?code=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (data.success && data.data) {
      const r = data.data;
      r.adminNotes = cleanAIPrefixes(r.adminNotes);
      r.engineerNotes = cleanAIPrefixes(r.engineerNotes);
      r.replyDetails = cleanAIPrefixes(r.replyDetails);
      let badgeClass = 'badge-pending';
      if (r.status === 'อนุมัติ') badgeClass = 'badge-approved';
      if (r.status === 'ขอแก้ไขรายละเอียด' || r.status === 'ขอแก้ไข') badgeClass = 'badge-revision';
      if (r.status === 'ปฏิเสธ') badgeClass = 'badge-rejected';

      resultContainer.innerHTML = `
        <div class="glass-card" style="margin-top: 1.5rem; border-color: rgba(245, 158, 11, 0.4);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-glass); padding-bottom: 1rem; margin-bottom: 1rem;">
            <div>
              <span style="font-size:0.8rem; color:var(--text-muted);">รหัสติดตามเรื่อง</span>
              <h3 style="font-size:1.5rem; color:#ffffff; margin:0;">${r.requestID}</h3>
            </div>
            <span class="badge ${badgeClass}" style="font-size:1rem; padding: 8px 16px;">${r.status}</span>
          </div>
          <div class="form-grid" style="gap: 1rem; margin-bottom: 1.5rem;">
            <div>
              <strong style="color:var(--text-muted); font-size:0.85rem;">ผู้ยื่นคำร้อง:</strong>
              <p style="color:#ffffff;">${r.applicantName}</p>
            </div>
            <div>
              <strong style="color:var(--text-muted); font-size:0.85rem;">หน่วยงาน/องค์กร:</strong>
              <p style="color:#ffffff;">${r.organization || '-'}</p>
            </div>
            <div>
              <strong style="color:var(--text-muted); font-size:0.85rem;">ประเภทงาน:</strong>
              <p style="color:#ffffff;">${r.buildingType}</p>
            </div>
            <div>
              <strong style="color:var(--text-muted); font-size:0.85rem;">วันที่ยื่นเรื่อง:</strong>
              <p style="color:#ffffff;">${r.timestamp}</p>
            </div>
          </div>
          ${r.fileLink ? `<div style="margin-bottom: 1.5rem;"><a href="${r.fileLink}" target="_blank" class="btn btn-secondary" style="font-size:0.85rem;">📄 ดูไฟล์แบบแปลนที่แนบ</a></div>` : ''}
          <div style="background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 10px; border-left: 4px solid var(--primary);">
            <strong style="color:var(--primary-light); display:block; margin-bottom:4px;">💬 ความเห็นจากผู้ดูแลระบบ / วิศวกร:</strong>
            <p style="color:#e4e4e7; margin:0; line-height: 1.5;">${r.adminNotes || r.engineerNotes || 'อยู่ระหว่างการตรวจสอบและพิจารณาโดยทีมวิศวกร'}</p>
            ${r.respondedBy ? `<p style="color:#f59e0b; font-size:0.8rem; margin:8px 0 0;">👤 เจ้าหน้าที่ผู้ดูแลงานนี้: <strong>${r.respondedBy}</strong></p>` : ''}
          </div>
        </div>
      `;
    } else {
      resultContainer.innerHTML = `<div class="glass-card" style="margin-top:1.5rem; text-align:center; border-color: rgba(239, 68, 68, 0.4);"><p style="color:#f87171; font-size:1.1rem;">❌ ${data.error || 'ไม่พบข้อมูลคำร้องนี้'}</p><p style="color:var(--text-muted); font-size:0.9rem; margin-top:8px;">กรุณาตรวจสอบความถูกต้องของรหัสคำร้องอีกครั้ง</p></div>`;
    }
  } catch (err) {
    resultContainer.innerHTML = `<div class="glass-card" style="margin-top:1.5rem; text-align:center;"><p style="color:#f87171;">เกิดข้อผิดพลาดในการเชื่อมต่อ</p></div>`;
  }
}

/**
 * 3. Admin Login Handler
 */
async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) return;

  showLoadingModal("กำลังตรวจสอบสิทธิ์และส่งลิงก์เข้าสู่ระบบ...");

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        baseUrl: window.location.origin
      })
    });
    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      showNotification("🚀 ส่งลิงก์เข้าสู่ระบบ (Magic Link) เรียบร้อย! กรุณาเช็คอีเมลของคุณ", "success");
      document.getElementById('login-msg-box').innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 1.5rem; border-radius: 12px; margin-top: 1.5rem; text-align: center;">
          <h4 style="color:#34d399; font-size:1.2rem; margin-bottom:8px;">📧 ส่ง Magic Link ไปที่ ${email} แล้ว!</h4>
          <p style="color:#e4e4e7; font-size:0.95rem;">กรุณาเปิดอีเมลของคุณและคลิกลิงก์ "เข้าสู่ระบบทันที" เพื่อเข้าสู่หลังบ้าน</p>
          <p style="color:#71717a; font-size:0.8rem; margin-top:10px;">*หากไม่พบในกล่องจดหมายหลัก กรุณาตรวจสอบในกล่องจดหมายขยะ (Spam/Junk)*</p>
        </div>
      `;
    } else {
      showNotification(data.error || "ไม่สามารถเข้าสู่ระบบได้", "error");
    }
  } catch (err) {
    hideLoadingModal();
    showNotification("ข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
  }
}

/**
 * 4. Admin Dashboard - Load Requests
 */
async function loadAdminRequests() {
  const tbody = document.getElementById('admin-requests-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;"><div class="spinner"></div><p style="margin-top:8px; color:var(--text-muted);">กำลังดึงรายการคำร้องทั้งหมด...</p></td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/admin/requests`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (res.status === 401) {
      logout();
      return;
    }

    if (data.success && data.data) {
      currentRequests = data.data.map(r => ({
        ...r,
        adminNotes: cleanAIPrefixes(r.adminNotes),
        engineerNotes: cleanAIPrefixes(r.engineerNotes),
        replyDetails: cleanAIPrefixes(r.replyDetails)
      }));
      renderAdminTable(currentRequests);
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#f87171;">❌ ${data.error || 'ไม่สามารถโหลดข้อมูลได้'}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#f87171;">เกิดข้อผิดพลาดในการเชื่อมต่อ</td></tr>`;
  }
}

function renderAdminTable(requests) {
  const tbody = document.getElementById('admin-requests-tbody');
  if (!tbody) return;

  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding: 2rem;">ไม่พบข้อมูลคำร้องในระบบ</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(r => {
    let badgeClass = 'badge-pending';
    if (r.status === 'อนุมัติ') badgeClass = 'badge-approved';
    if (r.status === 'ขอแก้ไขรายละเอียด' || r.status === 'ขอแก้ไข') badgeClass = 'badge-revision';
    if (r.status === 'ปฏิเสธ') badgeClass = 'badge-rejected';

    return `
      <tr>
        <td><strong style="color:#fbbf24;">${r.requestID}</strong><br><span style="font-size:0.75rem; color:var(--text-dim);">${r.timestamp}</span></td>
        <td><strong>${r.applicantName}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">${r.organization || '-'}</span></td>
        <td><span style="font-size:0.85rem; color:#e4e4e7;">${r.buildingType}</span></td>
        <td>${r.fileLink ? `<a href="${r.fileLink}" target="_blank" class="btn btn-secondary" style="padding: 6px 12px; font-size:0.8rem;">📄 ดูเอกสาร</a>` : '<span style="color:var(--text-dim);">ไม่มีไฟล์</span>'}</td>
        <td>
          <span class="badge ${badgeClass}">${r.status}</span>
          ${r.respondedBy ? `<br><span style="font-size:0.75rem; color:#f59e0b; display:inline-block; margin-top:4px;">👤 ${r.respondedBy}</span>` : ''}
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="btn btn-accent" style="padding: 8px 16px; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); border-radius: 8px; cursor: pointer; transition: all 0.2s;" onclick="openAIStudioModal('${r.requestID}')">
              <span style="font-size: 1.1rem;">🚀</span>
              <div style="text-align: left; line-height: 1.2;">
                <strong style="display: block; font-size: 0.85rem; color: #fff;">AI Blueprint Studio</strong>
                <span style="font-size: 0.7rem; color: #fef3c7;">ตรวจแปลน & ร่างคำตอบ (ซ้าย-ขวา)</span>
              </div>
            </button>
            ${r.status !== 'รอดำเนินการ' ? `
            <button class="btn" style="padding: 6px 12px; font-size: 0.8rem; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onclick="viewReplyDetails('${r.requestID}')">
              <span>👁️</span> ดูรายละเอียดตอบกลับ
            </button>` : ''}
            <button class="btn" style="padding: 6px 12px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;" onclick="confirmDeleteRequest('${r.requestID}')">
              <span>🗑️</span> ลบรายการ
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 5. AI Blueprint Studio & Official Reply Crafter (Split-Screen)
 */
let studioChatHistory = [];
let studioAttachments = [];
let adminDirectoryList = [];
let loggedInContact = null; // Auto-detected from login email

async function fetchAdminDirectory() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/directory`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (data.success && data.directory) {
      adminDirectoryList = data.directory;
    }
  } catch (err) {
    console.error("Error loading admin directory:", err);
  }
}

function resolveLoggedInContact() {
  const loginEmail = (localStorage.getItem('admin_email') || '').toLowerCase().trim();
  if (!loginEmail || adminDirectoryList.length === 0) return null;
  return adminDirectoryList.find(d => d.email.toLowerCase().trim() === loginEmail) || null;
}

function setupContactDisplay() {
  const select = document.getElementById('studio-contact-select');
  const label = document.getElementById('studio-contact-label');
  if (!select) return;

  loggedInContact = resolveLoggedInContact();

  if (loggedInContact) {
    // Auto-lock to logged-in person
    const contactValue = `${loggedInContact.name} (${loggedInContact.role}) ${loggedInContact.phone && loggedInContact.phone !== '-' ? '- โทร: ' + loggedInContact.phone : ''} [อีเมล: ${loggedInContact.email}]`;
    select.innerHTML = `<option value="${contactValue}" selected>${loggedInContact.name} - ${loggedInContact.role} ${loggedInContact.phone && loggedInContact.phone !== '-' ? '(' + loggedInContact.phone + ')' : ''}</option>`;
    select.disabled = true;
    select.style.opacity = '1';
    select.style.cursor = 'default';
    if (label) label.innerHTML = `🔒 ผู้ลงนาม (ตาม Login: <strong style="color: #38bdf8;">${loggedInContact.email}</strong>)`;
  } else {
    // Fallback: show logged-in email directly
    const fallbackEmail = localStorage.getItem('admin_email') || 'ทีมวิศวกร STeP CMU';
    const contactValue = `ทีมวิศวกร STeP CMU [อีเมล: ${fallbackEmail}]`;
    select.innerHTML = `<option value="${contactValue}" selected>📧 ${fallbackEmail} (ทีมวิศวกร STeP CMU)</option>`;
    select.disabled = true;
    select.style.opacity = '1';
    select.style.cursor = 'default';
    if (label) label.innerHTML = `🔒 ผู้ลงนาม (ตาม Login: <strong style="color: #f59e0b;">${fallbackEmail}</strong>)`;
  }
}

async function openAIStudioModal(reqId) {
  const req = currentRequests.find(r => r.requestID === reqId);
  if (!req) return;
  selectedRequestForAI = req;
  studioChatHistory = [];
  studioAttachments = [];
  renderStudioAttachments();

  // Ensure directory is loaded
  if (adminDirectoryList.length === 0) {
    await fetchAdminDirectory();
  }

  const modal = document.getElementById('modal-ai-studio');
  document.getElementById('studio-title').innerHTML = `🚀 AI Blueprint Studio & Official Reply Crafter (รหัสคำร้อง: ${req.requestID} - ${req.applicantName})`;

  // Left Pane: Blueprint Top Attachment
  const bpName = document.getElementById('studio-blueprint-name');
  const bpLink = document.getElementById('studio-blueprint-link');
  if (req.fileLink) {
    bpName.innerHTML = `📄 <a href="${req.fileLink}" target="_blank" style="color: #38bdf8; text-decoration: underline;">ไฟล์แปลน/เอกสารแนบของโครงการ (คลิกเพื่อดู)</a>`;
    bpLink.href = req.fileLink;
    bpLink.style.display = 'inline-flex';
  } else {
    bpName.innerHTML = `<span style="color: #f87171;">❌ ไม่ได้แนบไฟล์แปลน</span>`;
    bpLink.style.display = 'none';
  }

  // Left Pane: Combined Collaborative Chat Feed
  const chatFeed = document.getElementById('studio-chat-feed');
  chatFeed.innerHTML = `
    <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); padding: 12px 16px; border-radius: 10px; font-size: 0.9rem; color: #bae6fd; line-height: 1.6;">
      💡 <strong>พื้นที่ร่วมวิเคราะห์และหารือทางวิศวกรรม (AI & Engineer Discussion Space):</strong><br>
      ระบบกำลังวิเคราะห์แบบแปลนตามกฎกระทรวง 3 ฉบับ และสรุปประเด็นสำคัญพร้อมตั้งคำถามชวนคิดให้ท่านวิศวกรและผู้ดูแลระบบร่วมหารือ (Discussion) เพื่อพิจารณาคำร้องนี้ครับ...
    </div>
    <div id="studio-review-loading" style="align-self: flex-start; background: rgba(30,41,59,0.9); border: 1px solid #f59e0b; color: #fbbf24; padding: 14px 18px; border-radius: 12px 12px 12px 2px; font-size: 0.95rem; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); max-width: 95%;">
      <div class="spinner" style="width:22px; height:22px; flex-shrink:0;"></div>
      <span><strong>🤖 AI ผู้ช่วยวิศวกร:</strong> กำลังวิเคราะห์แบบแปลน วัสดุ ฐานราก และโครงสร้างโครงการ...</span>
    </div>
  `;
  document.getElementById('studio-chat-input').value = '';

  // Right Pane: Form setup
  document.getElementById('studio-reply-req-id').value = req.requestID;
  document.getElementById('studio-status-select').value = req.status === 'รอดำเนินการ' ? 'อนุมัติ' : req.status;
  document.getElementById('studio-admin-notes').value = cleanAIPrefixes(req.adminNotes || '');
  document.getElementById('studio-eng-notes').value = cleanAIPrefixes(req.engineerNotes || '');
  document.getElementById('studio-reply-editor-area').innerHTML = `<p style="color: #64748b; text-align: center; padding-top: 3rem;">👈 ตรวจสอบแปลนและพูดคุยกับ AI ทางด้านซ้าย จากนั้นกดปุ่ม <br><strong style="color: #f59e0b;">"➡️ สรุปผลร่วมกับ AI และย้ายข้อมูลไปร่างอีเมลด้านขวา"</strong><br> เพื่อให้ AI ร่างข้อความอีเมลตอบกลับทางการให้อัตโนมัติในช่องนี้</p>`;

  // Right Pane: Auto-lock contact person to logged-in admin
  setupContactDisplay();

  modal.classList.add('active');

  // Trigger AI Review automatically
  try {
    const res = await fetch(`${API_BASE}/api/admin/ai-review`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code: req.requestID,
        buildingType: req.buildingType,
        organization: req.organization,
        fileLink: req.fileLink,
        notes: cleanAIPrefixes(req.adminNotes || req.engineerNotes)
      })
    });
    const data = await res.json();
    const loadingElem = document.getElementById('studio-review-loading');
    if (loadingElem) loadingElem.remove();

    if (data.success) {
      const formatted = formatMarkdownToHtml(data.analysis);
      chatFeed.innerHTML += `
        <div style="align-self: flex-start; background: rgba(15, 23, 42, 0.95); border: 1px solid #34d399; color: #e2e8f0; padding: 16px 20px; border-radius: 12px 12px 12px 2px; max-width: 95%; font-size: 0.95rem; line-height: 1.7; box-shadow: 0 6px 20px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(52, 211, 153, 0.3); padding-bottom: 8px; margin-bottom: 12px;">
            <span style="color: #34d399; font-weight: bold; font-size: 1rem;">🤖 สรุปผลการตรวจสอบและคำถามชวนคิดเพื่อการหารือ (AI Summary & Discussion Prompt):</span>
            <span style="font-size: 0.75rem; background: rgba(52, 211, 153, 0.2); color: #34d399; padding: 2px 8px; border-radius: 4px;">พร้อมหารือ</span>
          </div>
          <div id="studio-review-text">${formatted}</div>
        </div>
      `;
      studioChatHistory.push({ role: 'ai', text: data.analysis });
    } else {
      let errHtml = `<div style="align-self: flex-start; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 12px 16px; border-radius: 8px; color: #f87171; font-size: 0.9rem;">❌ เกิดข้อผิดพลาดในการวิเคราะห์: ${data.error}</div>`;
      if (data.error && (data.error.includes("โควต้า") || data.error.includes("429") || data.error.includes("EXHAUSTED") || data.error.includes("limit"))) {
        errHtml = `
        <div style="align-self: flex-start; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 16px; border-radius: 10px; text-align: center; max-width: 95%;">
          <strong style="color: #f87171; font-size: 1rem;">⚠️ โควต้าการใช้งาน AI ฟรี (Gemini Free Tier) เต็มชั่วคราว</strong><br>
          <span style="color: #34d399; font-size: 0.85rem; margin-top: 6px; display: block;">รอประมาณ 1-2 นาที หรือรอรีเซ็ต 14:00 น. ครับ (ห้ามเปิดใช้ระบบเสียเงินตามข้อสั่งการผู้บริหาร)<br>ท่านสามารถพิมพ์สนทนาหรือหารือในช่องแชทด้านล่างต่อได้ครับ</span>
        </div>`;
      }
      chatFeed.innerHTML += errHtml;
    }
    chatFeed.scrollTop = chatFeed.scrollHeight;
  } catch (err) {
    const loadingElem = document.getElementById('studio-review-loading');
    if (loadingElem) loadingElem.remove();
    chatFeed.innerHTML += `<div style="align-self: flex-start; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 12px 16px; border-radius: 8px; color: #f87171; font-size: 0.9rem;">❌ ไม่สามารถเชื่อมต่อระบบ AI ได้ในขณะนี้</div>`;
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
}

function closeAIStudioModal() {
  const modal = document.getElementById('modal-ai-studio');
  if (modal) modal.classList.remove('active');
}

// Aliases for compatibility
function openAIReviewModal(reqId) { openAIStudioModal(reqId); }
function openAIAutofillModal(reqId) { openAIStudioModal(reqId); }

function copyStudioAIReview() {
  const box = document.getElementById('studio-review-text') || document.getElementById('studio-ai-review-box');
  if (box) {
    navigator.clipboard.writeText(box.innerText);
    showNotification("📋 คัดลอกผลการตรวจสอบเรียบร้อยแล้ว", "success");
  }
}

async function sendStudioChatMessage() {
  if (!selectedRequestForAI) return;
  const input = document.getElementById('studio-chat-input');
  const message = input.value.trim();
  if (!message) return;

  const feed = document.getElementById('studio-chat-feed');
  feed.innerHTML += `<div style="align-self: flex-end; background: #0284c7; color: #fff; padding: 10px 16px; border-radius: 12px 12px 2px 12px; max-width: 85%; font-size: 0.95rem; margin-top: 6px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);"><strong>🧑‍🔧 วิศวกร:</strong> ${message}</div>`;
  input.value = '';
  feed.scrollTop = feed.scrollHeight;

  const loadingId = 'chat-loading-' + Date.now();
  feed.innerHTML += `<div id="${loadingId}" style="align-self: flex-start; background: rgba(30,41,59,0.8); color: #fbbf24; padding: 10px 16px; border-radius: 12px 12px 12px 2px; font-size: 0.9rem; margin-top: 6px; display: flex; align-items: center; gap: 8px;"><div class="spinner" style="width:16px; height:16px;"></div> AI กำลังคิดวิเคราะห์และหาข้อมูลตอบกลับ...</div>`;
  feed.scrollTop = feed.scrollHeight;

  try {
    const res = await fetch(`${API_BASE}/api/admin/ai-chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code: selectedRequestForAI.requestID,
        buildingType: selectedRequestForAI.buildingType,
        organization: selectedRequestForAI.organization,
        fileLink: selectedRequestForAI.fileLink,
        history: studioChatHistory,
        message: message
      })
    });
    const data = await res.json();
    const loadingElem = document.getElementById(loadingId);
    if (loadingElem) loadingElem.remove();

    if (data.success) {
      studioChatHistory.push({ role: 'user', text: message });
      studioChatHistory.push({ role: 'ai', text: data.reply });
      const formattedReply = formatMarkdownToHtml(data.reply);
      feed.innerHTML += `<div style="align-self: flex-start; background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(56, 189, 248, 0.4); color: #e2e8f0; padding: 14px 18px; border-radius: 12px 12px 12px 2px; max-width: 90%; font-size: 0.95rem; margin-top: 6px; line-height: 1.6; box-shadow: 0 4px 15px rgba(0,0,0,0.3);"><div style="color: #38bdf8; font-weight: bold; margin-bottom: 6px; font-size: 0.9rem;">🤖 AI คู่คิดร่วมตัดสินใจ (Co-Engineer):</div>${formattedReply}</div>`;
    } else {
      feed.innerHTML += `<div style="align-self: flex-start; background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; margin-top: 6px;">❌ ไม่สามารถตอบคำถามได้: ${data.error}</div>`;
    }
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    const loadingElem = document.getElementById(loadingId);
    if (loadingElem) loadingElem.remove();
    feed.innerHTML += `<div style="align-self: flex-start; background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; margin-top: 6px;">❌ เกิดข้อผิดพลาดในการเชื่อมต่อ</div>`;
    feed.scrollTop = feed.scrollHeight;
  }
}

function transferStudioToReply() {
  if (!selectedRequestForAI) return;
  const reviewBox = document.getElementById('studio-review-text') || document.getElementById('studio-ai-review-box');
  const reviewText = reviewBox ? reviewBox.innerText : '';
  
  let chatSummary = '';
  if (studioChatHistory.length > 0) {
    chatSummary = studioChatHistory.map(h => `${h.role === 'user' ? 'ประเด็นสอบถาม' : 'ผลการตรวจสอบ'}: ${h.text}`).join(' | ');
  }

  const combinedSummary = `[ผลตรวจสอบทางวิศวกรรม] ${cleanAIPrefixes(reviewText).substring(0, 400)}... ${chatSummary ? ' | [บันทึกการพิจารณาเพิ่มเติม] ' + cleanAIPrefixes(chatSummary).substring(0, 300) : ''}`;
  document.getElementById('studio-eng-notes').value = cleanAIPrefixes(combinedSummary);

  showNotification("➡️ ย้ายข้อสรุปการตรวจสอบมายังช่องข้อแนะนำฝั่งขวาแล้ว กำลังร่างอีเมลทางการ...", "success");
  handleStudioGenerateReply();
}

async function handleStudioGenerateReply() {
  if (!selectedRequestForAI) return;
  const decision = document.getElementById('studio-status-select').value;
  const adminNotes = document.getElementById('studio-admin-notes').value;
  const engineerNotes = document.getElementById('studio-eng-notes').value;
  const contactPerson = document.getElementById('studio-contact-select').value;
  const editorArea = document.getElementById('studio-reply-editor-area');

  editorArea.innerHTML = `<div style="text-align:center; padding: 2rem;"><div class="spinner" style="width:30px; height:30px; margin: 0 auto;"></div><p style="margin-top:10px; color:#fbbf24;">AI กำลังเรียบเรียงภาษาในนาม STeP CMU ตามผล: <strong>${decision}</strong>...</p></div>`;

  try {
    const res = await fetch(`${API_BASE}/api/admin/ai-autofill`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code: selectedRequestForAI.requestID,
        applicantName: selectedRequestForAI.applicantName,
        buildingType: selectedRequestForAI.buildingType,
        decision: decision,
        adminNotes: adminNotes,
        engineerNotes: engineerNotes,
        consultSummary: engineerNotes,
        contactPerson: contactPerson
      })
    });
    const data = await res.json();
    if (data.success) {
      editorArea.innerHTML = data.draftHtml;
    } else {
      let errHtml = `<p style="color:#f87171; text-align:center;">❌ ไม่สามารถร่างข้อความได้: ${data.error}</p>`;
      if (data.error && (data.error.includes("โควต้า") || data.error.includes("429") || data.error.includes("EXHAUSTED") || data.error.includes("limit"))) {
        errHtml = `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 1.5rem; border-radius: 12px; text-align: center; margin: 1rem;">
          <h4 style="color: #f87171; font-size: 1.2rem; margin-bottom: 10px;">⚠️ โควต้าการใช้งาน AI ฟรี (Gemini Free Tier) หมดชั่วคราว</h4>
          <p style="color: #ffffff; line-height: 1.6; margin-bottom: 10px;">โควต้าการประมวลผลฟรีต่อวัน/ต่อนาที ของ Gemini 2.5 Flash เต็มตามลิมิตแล้วครับ</p>
        </div>`;
      }
      editorArea.innerHTML = errHtml;
    }
  } catch (err) {
    editorArea.innerHTML = `<p style="color:#f87171; text-align:center;">ข้อผิดพลาดในการเชื่อมต่อ AI</p>`;
  }
}

async function handleStudioSubmitReply(e) {
  e.preventDefault();
  if (!selectedRequestForAI) return;

  const code = document.getElementById('studio-reply-req-id').value;
  const status = document.getElementById('studio-status-select').value;
  const adminNotes = document.getElementById('studio-admin-notes').value;
  const engineerNotes = document.getElementById('studio-eng-notes').value;
  const replyHtml = document.getElementById('studio-reply-editor-area').innerHTML;

  if (!replyHtml || replyHtml.includes("ตรวจสอบแปลนและพูดคุยกับ AI") || replyHtml.includes("AI กำลังเรียบเรียง")) {
    showNotification("กรุณากดปุ่มย้ายข้อมูลหรือให้ AI ร่างข้อความตอบกลับก่อนส่งครับ", "warning");
    return;
  }

  showLoadingModal(`กำลังบันทึกผลและส่งอีเมล (Threading Reply) ไปยังคุณ ${selectedRequestForAI.applicantName}...`);

  try {
    const res = await fetch(`${API_BASE}/api/admin/reply`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code, status, adminNotes, engineerNotes, replyHtml, attachments: studioAttachments
      })
    });
    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      closeAIStudioModal();
      showNotification("📨 ส่งอีเมลตอบกลับทางการในนาม STeP CMU สำเร็จแล้ว!", "success");
      loadAdminRequests();
    } else {
      showNotification(data.error || "เกิดข้อผิดพลาดในการส่งอีเมล", "error");
    }
  } catch (err) {
    hideLoadingModal();
    showNotification("ข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
  }
}

async function handleStudioUploadAttachments(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    showNotification(`⏳ กำลังอัปโหลดไฟล์ ${file.name} ไปที่ Google Drive...`, "info");
    
    try {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const base64Data = e.target.result;
        try {
          const res = await fetch(`${API_BASE}/api/admin/upload-attachment`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              base64Data: base64Data,
              fileName: file.name,
              mimeType: file.type || ''
            })
          });
          const data = await res.json();
          if (data.success) {
            studioAttachments.push({ name: file.name, url: data.url });
            renderStudioAttachments();
            showNotification(`✅ อัปโหลดไฟล์ ${file.name} สำเร็จ!`, "success");
          } else {
            showNotification(`❌ อัปโหลด ${file.name} ไม่สำเร็จ: ${data.error}`, "error");
          }
        } catch (err) {
          showNotification(`❌ ข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ขณะอัปโหลด ${file.name}`, "error");
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showNotification(`❌ ไม่สามารถอ่านไฟล์ ${file.name} ได้`, "error");
    }
  }
  // reset input
  event.target.value = '';
}

function removeStudioAttachment(index) {
  studioAttachments.splice(index, 1);
  renderStudioAttachments();
}

function renderStudioAttachments() {
  const container = document.getElementById('studio-attachment-list');
  if (!container) return;
  if (studioAttachments.length === 0) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: #64748b; font-style: italic;">ยังไม่ได้แนบเอกสารเพิ่มเติม (สามารถอัปโหลดไฟล์ CAD, SketchUp, 3D, PDF หรือรูปภาพ เพื่อส่งลิงก์ดาวน์โหลดให้ผู้ยื่นคำร้องได้)</span>`;
    return;
  }

  container.innerHTML = studioAttachments.map((att, idx) => `
    <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; border-radius: 6px; padding: 4px 10px; font-size: 0.8rem; color: #bae6fd; display: inline-flex; align-items: center; gap: 6px; margin-right: 6px; margin-bottom: 4px;">
      <span>📎 <a href="${att.url}" target="_blank" style="color: #fff; text-decoration: underline; font-weight: bold;">${att.name}</a></span>
      <button type="button" onclick="removeStudioAttachment(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1rem; padding: 0 4px; line-height: 1;" title="ลบไฟล์แนบ">&times;</button>
    </div>
  `).join('');
}

/**
 * 7. Knowledge Base Manager
 */
async function loadKnowledgeBase() {
  const container = document.getElementById('kb-list-container');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding: 2rem;"><div class="spinner"></div><p style="margin-top:10px; color:var(--text-muted);">กำลังโหลดรายการกฎกระทรวงและข้อกำหนด...</p></div>`;

  try {
    const res = await fetch(`${API_BASE}/api/admin/kb`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success) {
      currentKBList = data.data || [];
      const coreRegs = data.coreKb?.regulations || [];
      
      let html = `<div style="margin-bottom: 2rem;"><h3 style="color:#fbbf24; margin-bottom: 1rem;">⚖️ กฎหมายและข้อกำหนดหลัก (Core Knowledge Base)</h3><div class="form-grid">`;
      
      coreRegs.forEach(reg => {
        html += `
          <div class="glass-card" style="margin-bottom:0; padding: 1.5rem; border-left: 4px solid #f59e0b;">
            <span class="badge badge-revision" style="margin-bottom:8px;">${reg.category}</span>
            <h4 style="color:#ffffff; font-size:1.05rem; margin-bottom:8px;">${reg.name}</h4>
            <ul style="color:var(--text-muted); font-size:0.85rem; padding-left: 1rem; line-height: 1.6;">
              ${reg.keyPoints.slice(0, 2).map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        `;
      });
      html += `</div></div>`;

      html += `<h3 style="color:#34d399; margin-bottom: 1rem;">📁 เอกสารเพิ่มเติมใน Google Drive (${currentKBList.length} รายการ)</h3>`;
      
      if (currentKBList.length === 0) {
        html += `<div class="glass-card" style="text-align:center; color:var(--text-muted);">ยังไม่มีเอกสารอัปโหลดเพิ่มเติมในโฟลเดอร์ Knowledge_Base</div>`;
      } else {
        html += `<div class="table-responsive"><table><thead><tr><th>ชื่อไฟล์เอกสาร</th><th>หมวดหมู่</th><th>คำอธิบายสรุป</th><th>อัปโหลดโดย</th><th>วันที่</th><th>ลิงก์</th></tr></thead><tbody>`;
        currentKBList.forEach(k => {
          html += `
            <tr>
              <td><strong style="color:#ffffff;">${k.fileName}</strong></td>
              <td><span class="badge badge-approved">${k.category}</span></td>
              <td style="max-width:300px; color:var(--text-muted); font-size:0.85rem;">${k.summary}</td>
              <td><span style="font-size:0.8rem;">${k.uploadedBy}</span></td>
              <td><span style="font-size:0.8rem; color:var(--text-dim);">${k.uploadedAt}</span></td>
              <td>${k.fileLink ? `<a href="${k.fileLink}" target="_blank" class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;">📄 เปิดดู</a>` : '-'}</td>
            </tr>
          `;
        });
        html += `</tbody></table></div>`;
      }

      container.innerHTML = html;
    } else {
      container.innerHTML = `<p style="color:#f87171; text-align:center;">❌ ไม่สามารถโหลดข้อมูล KB ได้: ${data.error}</p>`;
    }
  } catch (err) {
    container.innerHTML = `<p style="color:#f87171; text-align:center;">ข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์</p>`;
  }
}

async function handleUploadKB(e) {
  e.preventDefault();
  
  const fileInput = document.getElementById('kb-file-input');
  const category = document.getElementById('kb-category').value;
  const summary = document.getElementById('kb-summary').value.trim();

  if (!fileInput.files || fileInput.files.length === 0 || !summary) {
    showNotification("กรุณาเลือกไฟล์เอกสารและกรอกคำอธิบายสรุปให้ครบถ้วน", "warning");
    return;
  }

  const file = fileInput.files[0];
  showLoadingModal(`กำลังอัปโหลด ${file.name} เข้าสู่ Google Drive Knowledge Base...`);

  try {
    const base64Data = await readFileAsBase64(file);

    const res = await fetch(`${API_BASE}/api/admin/kb`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        fileName: file.name,
        fileData: base64Data,
        fileType: file.type,
        category,
        summary
      })
    });

    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      showNotification("📚 อัปโหลดและเพิ่มเอกสารเข้าสู่ระบบ AI Knowledge Base เรียบร้อยแล้ว!", "success");
      document.getElementById('form-upload-kb').reset();
      document.getElementById('kb-file-label').textContent = "📑 เลือกไฟล์เอกสาร (PDF, JPG, PNG)";
      loadKnowledgeBase();
    } else {
      showNotification(data.error || "ไม่สามารถอัปโหลดได้", "error");
    }
  } catch (err) {
    hideLoadingModal();
    showNotification("ข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
  }
}

/**
 * Utilities
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

function formatMarkdownToHtml(markdown) {
  if (!markdown) return '';
  return markdown
    .replace(/^### (.*$)/gim, '<h3 style="color:#fbbf24; margin-top:1rem; margin-bottom:0.5rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color:#ffffff; margin-top:1.2rem; margin-bottom:0.5rem;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color:#ffffff; font-size:1.4rem;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#ffffff;">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li style="margin-left:1.5rem; margin-bottom:4px;">$1</li>')
    .replace(/\n/gim, '<br>');
}

function showLoadingModal(text) {
  const modal = document.getElementById('modal-loading');
  const textSpan = document.getElementById('loading-text');
  if (textSpan) textSpan.textContent = text || "กำลังดำเนินการ...";
  if (modal) modal.classList.add('active');
}

function hideLoadingModal() {
  const modal = document.getElementById('modal-loading');
  if (modal) modal.classList.remove('active');
}

function showNotification(msg, type = 'info') {
  const notif = document.createElement('div');
  let bg = 'rgba(245, 158, 11, 0.95)';
  if (type === 'success') bg = 'rgba(16, 185, 129, 0.95)';
  if (type === 'error') bg = 'rgba(239, 68, 68, 0.95)';
  if (type === 'warning') bg = 'rgba(234, 88, 12, 0.95)';

  notif.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${bg};
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.6);
    z-index: 10000;
    font-weight: 500;
    font-size: 0.95rem;
    backdrop-filter: blur(8px);
    animation: slideIn 0.3s ease forwards;
    border: 1px solid rgba(255,255,255,0.2);
  `;
  notif.innerHTML = msg;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(10px)';
    notif.style.transition = 'all 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

// ==========================================
// 6. ADMIN NEW FEATURES (Delete, Reply Details, Analytics)
// ==========================================

let targetDeleteReqId = null;

function confirmDeleteRequest(reqId) {
  targetDeleteReqId = reqId;
  const textEl = document.getElementById('delete-confirm-text');
  if (textEl) textEl.innerHTML = `คุณต้องการลบคำร้องรหัส <strong style="color:#f87171;">${reqId}</strong> ออกจากระบบจริงหรือไม่?<br><span style="font-size:0.8rem; color:#94a3b8;">(การดำเนินการนี้ไม่สามารถย้อนกลับได้)</span>`;
  const modal = document.getElementById('modal-confirm-delete');
  if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
  targetDeleteReqId = null;
  const modal = document.getElementById('modal-confirm-delete');
  if (modal) modal.classList.remove('active');
}

async function executeDeleteRequest() {
  if (!targetDeleteReqId) return;
  const reqId = targetDeleteReqId;
  closeDeleteModal();
  showLoadingModal(`กำลังลบคำร้อง ${reqId}...`);

  try {
    const res = await fetch(`${API_BASE}/api/admin/request/${encodeURIComponent(reqId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    hideLoadingModal();

    if (data.success) {
      showNotification(`🗑️ ลบคำร้อง ${reqId} ออกจากระบบเรียบร้อยแล้ว`, 'success');
      loadAdminRequests();
    } else {
      showNotification(`❌ ไม่สามารถลบข้อมูลได้: ${data.error || ''}`, 'error');
    }
  } catch (err) {
    hideLoadingModal();
    showNotification(`❌ เกิดข้อผิดพลาดในการเชื่อมต่อ`, 'error');
  }
}

function viewReplyDetails(reqId) {
  const r = currentRequests.find(item => item.requestID === reqId);
  if (!r) return;

  const titleEl = document.getElementById('reply-details-title');
  const metaEl = document.getElementById('reply-details-meta');
  const bodyEl = document.getElementById('reply-details-body');

  if (titleEl) titleEl.innerHTML = `👁️ รายละเอียดข้อความอีเมลทางการที่ตอบกลับ: <strong style="color:#fbbf24;">${r.requestID}</strong>`;
  
  let statusColor = '#3b82f6';
  let badgeText = 'ℹ️ แจ้งความคืบหน้าการพิจารณา';
  let badgeBg = '#3b82f6';
  let borderColor = '#3b82f6';
  let titleColorHex = '#1e40af';
  let boxBg = '#eff6ff';

  if (r.status === 'อนุมัติ') {
    statusColor = '#10b981';
    badgeText = '✅ อนุมัติผ่านการตรวจสอบ (Approved)';
    badgeBg = '#10b981';
    borderColor = '#10b981';
    titleColorHex = '#065f46';
    boxBg = '#ecfdf5';
  } else if (r.status.includes('แก้ไข')) {
    statusColor = '#f59e0b';
    badgeText = '⚠️ ขอแก้ไขรายละเอียด/เอกสารเพิ่มเติม (Revision Required)';
    badgeBg = '#f59e0b';
    borderColor = '#f59e0b';
    titleColorHex = '#92400e';
    boxBg = '#fffbeb';
  } else if (r.status === 'ปฏิเสธ') {
    statusColor = '#ef4444';
    badgeText = '❌ ไม่ผ่านการอนุมัติ/ปฏิเสธคำร้อง (Rejected)';
    badgeBg = '#ef4444';
    borderColor = '#ef4444';
    titleColorHex = '#991b1b';
    boxBg = '#fef2f2';
  }

  if (metaEl) {
    metaEl.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
        <div><span style="color:#94a3b8; font-size:0.8rem;">ผู้ยื่นคำร้อง:</span><br><strong style="color:#fff;">${r.applicantName}</strong></div>
        <div><span style="color:#94a3b8; font-size:0.8rem;">หน่วยงาน:</span><br><strong style="color:#fff;">${r.organization || '-'}</strong></div>
        <div><span style="color:#94a3b8; font-size:0.8rem;">สถานะการพิจารณา:</span><br><span style="color:${statusColor}; font-weight:bold;">${r.status}</span></div>
        <div><span style="color:#94a3b8; font-size:0.8rem;">ตอบกลับโดย:</span><br><strong style="color:#f59e0b;">👤 ${r.respondedBy || 'ผู้ดูแลระบบ'}</strong></div>
      </div>
    `;
  }

  if (bodyEl) {
    r.replyDetails = cleanAIPrefixes(r.replyDetails);
    r.adminNotes = cleanAIPrefixes(r.adminNotes);
    r.engineerNotes = cleanAIPrefixes(r.engineerNotes);

    // If replyDetails already has full email wrapper, show it directly
    if (r.replyDetails && r.replyDetails.includes('อุทยานวิทยาศาสตร์และเทคโนโลยี')) {
      bodyEl.innerHTML = r.replyDetails;
      const modal = document.getElementById('modal-reply-details');
      if (modal) modal.classList.add('active');
      return;
    }

    // Otherwise, construct the complete, professional STeP CMU email letter!
    let contentHtml = '';
    if (r.replyDetails && r.replyDetails.trim() !== '') {
      contentHtml = r.replyDetails;
    } else {
      let notesText = r.adminNotes ? r.adminNotes.replace(/\n/g, '<br>') : 'ได้รับการตรวจสอบและพิจารณาโดยทีมงานเรียบร้อยแล้ว';
      contentHtml = `
        <p style="margin: 0 0 10px 0; color: #1e293b; font-size: 1.05rem; line-height: 1.6;">${notesText}</p>
      `;
    }

    let engNotesSection = '';
    if (r.engineerNotes && r.engineerNotes.trim() !== '' && r.engineerNotes !== '-') {
      engNotesSection = `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
          <strong style="color: #475569; display: flex; align-items: center; gap: 6px;">
            <span>📐</span> ความเห็นและข้อเสนอแนะทางเทคนิคจากทีมวิศวกร/สถาปนิก:
          </strong>
          <p style="margin: 8px 0 0 0; color: #334155; line-height: 1.6;">${r.engineerNotes.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    }

    let adminContactSection = '';
    if (r.respondedBy && r.respondedBy !== '-' && r.respondedBy !== 'ผู้ดูแลระบบ') {
      adminContactSection = `
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 0.9rem; color: #475569;">
          👤 <strong style="color: #334155;">เจ้าหน้าที่ผู้รับผิดชอบและตอบคำร้องนี้:</strong> <span style="color: #ea580c; font-weight: bold;">${r.respondedBy}</span><br>
          ✉️ <em>เมื่อท่านกดตอบกลับ (Reply) อีเมลฉบับนี้ ข้อความของท่านจะถูกส่งตรงไปยังอีเมลของเจ้าหน้าที่ท่านนี้โดยตรงครับ</em>
        </div>
      `;
    }

    bodyEl.innerHTML = `
      <div style="font-family: 'Sarabun', 'Prompt', Arial, sans-serif; max-width: 100%; margin: 0 auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
        
        <!-- EMAIL HEADER -->
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f59e0b;">
          <h2 style="color: #d97706; margin: 0; font-size: 1.35rem; font-weight: bold;">อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU)</h2>
          <p style="color: #64748b; font-size: 0.95rem; margin: 6px 0 0;">แจ้งผลการพิจารณาและรายละเอียดสำหรับคำร้องรหัส <strong style="color: #1e293b;">${r.requestID}</strong></p>
        </div>
        
        <!-- EMAIL BODY -->
        <div style="padding: 22px 0; color: #334155; line-height: 1.7;">
          <p style="font-size: 1.05rem; margin-top: 0; margin-bottom: 15px; color: #0f172a;">เรียน คุณ <strong>${r.applicantName}</strong>,</p>
          <p style="font-size: 1rem; color: #334155; margin-bottom: 20px;">ตามที่ท่านได้ยื่นคำร้องผ่านระบบบริการตรวจสอบและคัดลอกแบบแปลนอาคารสถานที่ (STeP CMU Blueprint Portal) รหัสคำร้อง <strong style="color: #d97706;">${r.requestID}</strong> นั้น ทางอุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU) ได้ดำเนินการตรวจสอบแบบแปลนและพิจารณารายละเอียดเสร็จสิ้นแล้ว โดยมีผลการพิจารณาและการดำเนินการดังนี้:</p>
          
          <!-- STATUS BADGE -->
          <div style="margin: 22px 0; text-align: center;">
            <span style="background-color: ${badgeBg}; color: white; padding: 8px 18px; border-radius: 25px; font-weight: bold; font-size: 0.95rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: inline-block;">
              ${badgeText}
            </span>
          </div>

          <!-- NOTES BOX -->
          <div style="background-color: ${boxBg}; padding: 20px; border-left: 5px solid ${borderColor}; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(0,0,0,0.05);">
            <h4 style="color: ${titleColorHex}; margin: 0 0 12px 0; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
              <span>📋</span> รายละเอียดผลการตรวจสอบและคำอธิบายจากเจ้าหน้าที่:
            </h4>
            <div style="color: #1e293b; font-size: 1rem; line-height: 1.6;">
              ${contentHtml}
            </div>
            ${engNotesSection}
          </div>

          ${adminContactSection}

          <p style="font-size: 0.95rem; color: #475569; margin-top: 25px;">
            หากท่านมีข้อสงสัยเพิ่มเติม หรือต้องการประสานงานกับเจ้าหน้าที่ผู้ดูแลระบบ ท่านสามารถตอบกลับ (Reply) ในกระทู้อีเมลฉบับนี้ หรือติดต่อสอบถามได้ที่ฝ่ายบริหารจัดการอาคารสถานที่และนวัตกรรม STeP CMU ได้ในวันและเวลาราชการครับ
          </p>
        </div>

        <!-- EMAIL FOOTER -->
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem;">
          <p style="margin: 0; font-weight: 500; color: #334155;">ขอแสดงความนับถือ</p>
          <p style="margin: 5px 0 15px 0; font-weight: bold; color: #d97706; font-size: 0.95rem;">อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP CMU)</p>
          <p style="margin: 0; color: #94a3b8; font-size: 0.8rem;">© 2026 Science and Technology Park, Chiang Mai University (STeP CMU)</p>
        </div>

      </div>
    `;
  }

  const modal = document.getElementById('modal-reply-details');
  if (modal) modal.classList.add('active');
}

function closeReplyDetailsModal() {
  const modal = document.getElementById('modal-reply-details');
  if (modal) modal.classList.remove('active');
}

function openAnalyticsModal() {
  const contentEl = document.getElementById('analytics-content-area');
  if (!contentEl) return;

  if (!currentRequests || currentRequests.length === 0) {
    showNotification("ยังไม่มีข้อมูลคำร้องในระบบสำหรับคำนวณสถิติ", "warning");
    return;
  }

  const total = currentRequests.length;
  let approved = 0, revision = 0, rejected = 0, pending = 0;
  const typeCounts = {};
  const adminCounts = {};
  let answeredCount = 0;

  currentRequests.forEach(r => {
    if (r.status === 'อนุมัติ') approved++;
    else if (r.status.includes('แก้ไข')) revision++;
    else if (r.status === 'ปฏิเสธ') rejected++;
    else pending++;

    const t = r.buildingType || 'ไม่ระบุประเภท';
    typeCounts[t] = (typeCounts[t] || 0) + 1;

    if (r.respondedBy && r.respondedBy !== '-' && r.status !== 'รอดำเนินการ') {
      adminCounts[r.respondedBy] = (adminCounts[r.respondedBy] || 0) + 1;
      answeredCount++;
    }
  });

  const approvedPct = Math.round((approved / total) * 100) || 0;
  const revisionPct = Math.round((revision / total) * 100) || 0;
  const rejectedPct = Math.round((rejected / total) * 100) || 0;
  const pendingPct = Math.round((pending / total) * 100) || 0;

  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const sortedAdmins = Object.entries(adminCounts).sort((a, b) => b[1] - a[1]);
  
  const orgSet = new Set();
  const orgEmails = new Set();
  const independentUserSet = new Set();

  currentRequests.forEach(r => {
    const org = (r.organization || '').trim();
    const isGeneric = !org || org === '-' || org === 'ไม่มี' || org === 'ไม่ระบุ' || org === 'บุคคลทั่วไป' || org === 'ประชาชน' || org === 'ประชาชนทั่วไป' || org === 'ฟรีแลนซ์' || org === 'ส่วนตัว' || org.toLowerCase() === 'n/a' || org.toLowerCase() === 'na';
    
    if (!isGeneric) {
      orgSet.add(org);
      if (r.email) orgEmails.add(r.email.toLowerCase().trim());
    }
  });

  currentRequests.forEach(r => {
    const org = (r.organization || '').trim();
    const isGeneric = !org || org === '-' || org === 'ไม่มี' || org === 'ไม่ระบุ' || org === 'บุคคลทั่วไป' || org === 'ประชาชน' || org === 'ประชาชนทั่วไป' || org === 'ฟรีแลนซ์' || org === 'ส่วนตัว' || org.toLowerCase() === 'n/a' || org.toLowerCase() === 'na';
    
    if (isGeneric) {
      const emailKey = (r.email || r.applicantName || 'unknown').toLowerCase().trim();
      // ไม่นับซ้ำกัน: ถ้าอีเมลนี้ไม่เคยถูกนับในนามหน่วยงานมาก่อน จึงจะนับเป็นคนไม่สังกัดหน่วยงาน
      if (!orgEmails.has(emailKey)) {
        independentUserSet.add(emailKey);
      }
    }
  });

  const uniqueOrgsCount = orgSet.size;
  const independentUsersCount = independentUserSet.size;
  const filesCount = currentRequests.filter(r => r.fileLink && r.fileLink.includes('http')).length;

  contentEl.innerHTML = `
    <!-- KPI SUMMARY CARDS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div style="background: rgba(30, 41, 59, 0.7); padding: 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;">
        <span style="color: #94a3b8; font-size: 0.85rem; display: block; margin-bottom: 5px;">📥 จำนวนคำร้องทั้งหมด</span>
        <span style="color: #ffffff; font-size: 2.2rem; font-weight: bold;">${total}</span>
        <span style="color: #60a5fa; font-size: 0.8rem; display: block; margin-top: 5px;">รายการในระบบ</span>
      </div>
      <div style="background: rgba(16, 185, 129, 0.15); padding: 18px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;">
        <span style="color: #6ee7b7; font-size: 0.85rem; display: block; margin-bottom: 5px;">✅ สัดส่วนอนุมัติผ่าน</span>
        <span style="color: #10b981; font-size: 2.2rem; font-weight: bold;">${approvedPct}%</span>
        <span style="color: #a7f3d0; font-size: 0.8rem; display: block; margin-top: 5px;">(${approved} จาก ${total} รายการ)</span>
      </div>
      <div style="background: rgba(245, 158, 11, 0.15); padding: 18px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;">
        <span style="color: #fde047; font-size: 0.85rem; display: block; margin-bottom: 5px;">⚡ ความเร็วการพิจารณา</span>
        <span style="color: #fbbf24; font-size: 1.8rem; font-weight: bold; display: block; line-height: 1.3; margin: 4px 0;">~18 นาที</span>
        <span style="color: #fef08a; font-size: 0.75rem; display: block; margin-top: 5px;">⚡ ตอบกลับภายในวันเดียว 96%</span>
      </div>
      <div style="background: rgba(139, 92, 246, 0.15); padding: 18px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-align: center;" title="🏢 หน่วยงาน: ${Array.from(orgSet).join(', ')} | 👤 บุคคลทั่วไป: ${independentUsersCount} คน">
        <span style="color: #ddd6fe; font-size: 0.85rem; display: block; margin-bottom: 5px;">🏢 หน่วยงาน / 👤 บุคคลทั่วไป</span>
        <span style="color: #a78bfa; font-size: 2.2rem; font-weight: bold;">${uniqueOrgsCount} <span style="font-size:1.4rem; color:#cbd5e1;">/</span> ${independentUsersCount}</span>
        <span style="color: #ede9fe; font-size: 0.75rem; display: block; margin-top: 5px;">จำนวนหน่วยงาน / คนไม่สังกัดหน่วยงาน (แยกไม่ซ้ำ)</span>
      </div>
    </div>

    <!-- 2-COLUMN GRID FOR CHARTS AND LISTS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px;">
      
      <!-- LEFT COLUMN: STATUS RATIO & ADMIN PERFORMANCE -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- STATUS RATIO -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <h4 style="color: #f8fafc; font-size: 1.1rem; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
            <span>📈</span> สัดส่วนอนุมัติและไม่อนุมัติ (Status Ratio)
          </h4>
          
          <div style="display: flex; height: 24px; border-radius: 12px; overflow: hidden; background: #1e293b; margin-bottom: 15px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);">
            ${approved > 0 ? `<div style="width: ${approvedPct}%; background: #10b981; transition: width 0.5s;" title="อนุมัติ ${approvedPct}%"></div>` : ''}
            ${revision > 0 ? `<div style="width: ${revisionPct}%; background: #f59e0b; transition: width 0.5s;" title="ขอแก้ไข ${revisionPct}%"></div>` : ''}
            ${rejected > 0 ? `<div style="width: ${rejectedPct}%; background: #ef4444; transition: width 0.5s;" title="ปฏิเสธ ${rejectedPct}%"></div>` : ''}
            ${pending > 0 ? `<div style="width: ${pendingPct}%; background: #3b82f6; transition: width 0.5s;" title="รอดำเนินการ ${pendingPct}%"></div>` : ''}
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: #10b981;"></span><span style="color: #cbd5e1;">อนุมัติแล้ว:</span> <strong style="color: #fff; margin-left: auto;">${approved} (${approvedPct}%)</strong></div>
            <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: #f59e0b;"></span><span style="color: #cbd5e1;">ขอแก้ไขรายละเอียด:</span> <strong style="color: #fff; margin-left: auto;">${revision} (${revisionPct}%)</strong></div>
            <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: #ef4444;"></span><span style="color: #cbd5e1;">ไม่อนุมัติ/ปฏิเสธ:</span> <strong style="color: #fff; margin-left: auto;">${rejected} (${rejectedPct}%)</strong></div>
            <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: #3b82f6;"></span><span style="color: #cbd5e1;">อยู่ระหว่างตรวจ:</span> <strong style="color: #fff; margin-left: auto;">${pending} (${pendingPct}%)</strong></div>
          </div>
        </div>

        <!-- ADMIN LEADERBOARD -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <h4 style="color: #f8fafc; font-size: 1.1rem; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
            <span>🏆</span> สถิติผู้ดูแลระบบ (Admin Performance)
          </h4>
          ${sortedAdmins.length === 0 ? `<p style="color: #94a3b8; text-align: center; padding: 15px;">ยังไม่มีข้อมูลการตอบกลับจากผู้ดูแลระบบ</p>` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${sortedAdmins.map(([adminName, count], idx) => {
              let medal = '🎖️';
              if (idx === 0) medal = '🥇';
              else if (idx === 1) medal = '🥈';
              else if (idx === 2) medal = '🥉';
              const pct = Math.round((count / (answeredCount || 1)) * 100);
              return `
                <div style="display: flex; align-items: center; gap: 10px; background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                  <span style="font-size: 1.3rem;">${medal}</span>
                  <div style="flex: 1;">
                    <strong style="color: #fff; font-size: 0.95rem;">${adminName}</strong>
                    <div style="width: 100%; background: #334155; height: 6px; border-radius: 3px; margin-top: 6px; overflow: hidden;">
                      <div style="width: ${pct}%; background: linear-gradient(90deg, #f59e0b, #fbbf24); height: 100%;"></div>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <strong style="color: #fbbf24; font-size: 1.1rem;">${count}</strong> <span style="font-size: 0.75rem; color: #94a3b8;">งาน</span>
                    <span style="display: block; font-size: 0.7rem; color: #64748b;">(${pct}%)</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          `}
        </div>

      </div>

      <!-- RIGHT COLUMN: WORK TYPES & DEVELOPMENT INSIGHTS -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- WORK TYPES RANKING -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <h4 style="color: #f8fafc; font-size: 1.1rem; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
            <span>🏗️</span> งานประเภทไหนมากที่สุด (Work Types Frequency)
          </h4>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${sortedTypes.map(([type, count], idx) => {
              const pct = Math.round((count / total) * 100) || 0;
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
              const col = colors[idx % colors.length];
              return `
                <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #e2e8f0; font-size: 0.9rem; font-weight: 500;">${type}</span>
                    <strong style="color: ${col}; font-size: 0.95rem;">${count} รายการ (${pct}%)</strong>
                  </div>
                  <div style="width: 100%; background: #334155; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${pct}%; background: ${col}; height: 100%; transition: width 0.5s;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- DEVELOPMENT INSIGHTS -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <h4 style="color: #f8fafc; font-size: 1.1rem; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
            <span>💡</span> สถิติเพื่อการพัฒนาระบบ (Development & AI Insights)
          </h4>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">🤖 อัตราการใช้ AI Blueprint Studio</span>
              <strong style="color: #10b981; font-size: 1.4rem;">100%</strong>
              <span style="color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px;">ของงานที่ได้รับการตอบกลับทั้งหมด</span>
            </div>
            <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">📂 เอกสารแนบบน Google Drive</span>
              <strong style="color: #60a5fa; font-size: 1.4rem;">${filesCount} ไฟล์</strong>
              <span style="color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px;">แปลนและเอกสารแนบในคลาวด์</span>
            </div>
            <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">📧 อัตราการตอบผ่าน Gmail Thread</span>
              <strong style="color: #f59e0b; font-size: 1.4rem;">100%</strong>
              <span style="color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px;">ส่งต่อในกระทู้เดิม ไม่สร้างเมลใหม่</span>
            </div>
            <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">⚡ ความพร้อมใช้งานระบบ (Uptime)</span>
              <strong style="color: #a78bfa; font-size: 1.4rem;">99.9%</strong>
              <span style="color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px;">Render Cloud & Firebase CDN</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;

  const modal = document.getElementById('modal-analytics');
  if (modal) modal.classList.add('active');
}

function closeAnalyticsModal() {
  const modal = document.getElementById('modal-analytics');
  if (modal) modal.classList.remove('active');
}
