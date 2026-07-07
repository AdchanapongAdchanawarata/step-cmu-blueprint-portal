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
      currentRequests = data.data;
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
          <button class="btn btn-accent" style="padding: 8px 16px; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); border-radius: 8px; cursor: pointer; transition: all 0.2s;" onclick="openAIStudioModal('${r.requestID}')">
            <span style="font-size: 1.1rem;">🚀</span>
            <div style="text-align: left; line-height: 1.2;">
              <strong style="display: block; font-size: 0.85rem; color: #fff;">AI Blueprint Studio</strong>
              <span style="font-size: 0.7rem; color: #fef3c7;">ตรวจแปลน & ร่างคำตอบ (ซ้าย-ขวา)</span>
            </div>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 5. AI Blueprint Studio & Official Reply Crafter (Split-Screen)
 */
let studioChatHistory = [];
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

  // Left Pane: AI Review Box
  const reviewBox = document.getElementById('studio-ai-review-box');
  reviewBox.innerHTML = `<div style="text-align:center; padding: 2rem;"><div class="spinner" style="width:30px; height:30px; margin: 0 auto;"></div><p style="margin-top:10px; color:#fbbf24;">AI กำลังตรวจสอบภาพแปลนและคำนวณข้อกำหนดโครงสร้าง...</p></div>`;

  // Left Pane: Chat Feed
  const chatFeed = document.getElementById('studio-chat-feed');
  chatFeed.innerHTML = `<div style="background: rgba(56, 189, 248, 0.1); border-left: 3px solid #38bdf8; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; color: #bae6fd;">💡 <strong>ระบบผู้ช่วยอัจฉริยะ:</strong> ท่านสามารถพิมพ์คำถามสอบถามรายละเอียดเชิงลึกของแปลนนี้ได้ครับ เช่น *"ระยะยื่นระเบียงผ่านเกณฑ์มั้ย?"* หรือ *"ค่าการรับน้ำหนักพื้นตามกฎกระทรวงคือเท่าไร?"*</div>`;
  document.getElementById('studio-chat-input').value = '';

  // Right Pane: Form setup
  document.getElementById('studio-reply-req-id').value = req.requestID;
  document.getElementById('studio-status-select').value = req.status === 'รอดำเนินการ' ? 'อนุมัติ' : req.status;
  document.getElementById('studio-admin-notes').value = req.adminNotes || '';
  document.getElementById('studio-eng-notes').value = req.engineerNotes || '';
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
        notes: req.adminNotes || req.engineerNotes
      })
    });
    const data = await res.json();
    if (data.success) {
      const formatted = formatMarkdownToHtml(data.analysis);
      reviewBox.innerHTML = `<div id="studio-review-text" style="color: #e2e8f0;">${formatted}</div>`;
    } else {
      let errHtml = `<p style="color:#f87171; text-align:center; padding:1rem;">❌ เกิดข้อผิดพลาด: ${data.error}</p>`;
      if (data.error && (data.error.includes("โควต้า") || data.error.includes("429") || data.error.includes("EXHAUSTED") || data.error.includes("limit"))) {
        errHtml = `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 1rem; border-radius: 8px; text-align: center;">
          <strong style="color: #f87171;">⚠️ โควต้าการใช้งาน AI ฟรี (Gemini Free Tier) เต็มชั่วคราว</strong><br>
          <span style="color: #34d399; font-size: 0.85rem;">รอประมาณ 1-2 นาที หรือรอรีเซ็ต 14:00 น. ครับ (ห้ามเปิดใช้ระบบเสียเงินตามข้อสั่งการผู้บริหาร)</span>
        </div>`;
      }
      reviewBox.innerHTML = errHtml;
    }
  } catch (err) {
    reviewBox.innerHTML = `<p style="color:#f87171; text-align:center;">ไม่สามารถเชื่อมต่อระบบ AI ได้ในขณะนี้</p>`;
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
    showNotification("📋 คัดลอกผลตรวจของ AI เรียบร้อยแล้ว", "success");
  }
}

async function sendStudioChatMessage() {
  if (!selectedRequestForAI) return;
  const input = document.getElementById('studio-chat-input');
  const message = input.value.trim();
  if (!message) return;

  const feed = document.getElementById('studio-chat-feed');
  feed.innerHTML += `<div style="align-self: flex-end; background: #0284c7; color: #fff; padding: 8px 14px; border-radius: 12px 12px 2px 12px; max-width: 85%; font-size: 0.9rem; margin-top: 6px;"><strong>🧑‍🔧 วิศวกร:</strong> ${message}</div>`;
  input.value = '';
  feed.scrollTop = feed.scrollHeight;

  const loadingId = 'chat-loading-' + Date.now();
  feed.innerHTML += `<div id="${loadingId}" style="align-self: flex-start; background: rgba(30,41,59,0.8); color: #fbbf24; padding: 8px 14px; border-radius: 12px 12px 12px 2px; font-size: 0.85rem; margin-top: 6px; display: flex; align-items: center; gap: 8px;"><div class="spinner" style="width:16px; height:16px;"></div> AI กำลังตรวจสอบภาพแปลนและค้นหาคำตอบ...</div>`;
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
      feed.innerHTML += `<div style="align-self: flex-start; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(56, 189, 248, 0.3); color: #e2e8f0; padding: 10px 14px; border-radius: 12px 12px 12px 2px; max-width: 90%; font-size: 0.9rem; margin-top: 6px; line-height: 1.5;"><strong>🤖 AI ที่ปรึกษา:</strong> ${formattedReply}</div>`;
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
    chatSummary = studioChatHistory.map(h => `${h.role === 'user' ? 'ถาม' : 'AIตอบ'}: ${h.text}`).join(' | ');
  }

  const combinedSummary = `[ผลตรวจจาก AI] ${reviewText.substring(0, 400)}... ${chatSummary ? ' | [สรุปประเด็นคุยเพิ่มเติม] ' + chatSummary.substring(0, 300) : ''}`;
  document.getElementById('studio-eng-notes').value = combinedSummary;

  showNotification("➡️ ย้ายข้อสรุปการปรึกษา AI มายังช่องข้อแนะนำฝั่งขวาแล้ว กำลังสั่ง AI ร่างอีเมล...", "success");
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
        code, status, adminNotes, engineerNotes, replyHtml
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
