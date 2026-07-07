import os
import json
import urllib.request
import urllib.parse
import ssl
from datetime import datetime

# Fix for macOS Python SSL certificate verification
try:
    import certifi
    ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
except ImportError:
    ssl._create_default_https_context = ssl._create_unverified_context

# Load environment variables from .env if present
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ[key] = val

load_env()

# OAuth Credentials from environment
CLIENT_ID = os.environ.get("CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("CLIENT_SECRET", "")
REFRESH_TOKEN = os.environ.get("REFRESH_TOKEN", "")

ADMIN_EMAILS = [
    "kampanat@step.cmu.ac.th",
    "vachiravut@step.cmu.ac.th",
    "patipol@step.cmu.ac.th",
    "jirawat@step.cmu.ac.th",
    "amonlit@step.cmu.ac.th",
    "adchanapong@step.cmu.ac.th",
    "adchanawarata@gmail.com"
]

PDF_FILES = [
    ("กฎกระทรวง กำหนดวัสดุที่ใช้ในการก่อสร้างอ.pdf", "กฎกระทรวง กำหนดวัสดุที่ใช้ในการก่อสร้างอาคารประเภทควบคุมการใช้ พ.ศ. 2566"),
    ("กฎกระทรวง กำหนดฐานรากของอาคารและพื้นที่ด.pdf", "กฎกระทรวง กำหนดฐานรากของอาคารและพื้นดินที่รองรับอาคาร พ.ศ. 2566"),
    ("กฎกระทรวง กำหนดการออกแบบโครงสร้างอาคารแล.pdf", "กฎกระทรวง กำหนดการออกแบบโครงสร้างอาคารและลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2566"),
    ("ระบบขอเอกสารแบบแปลน.pdf", "คู่มือระบบขอเอกสารแบบแปลน STeP CMU")
]

def get_access_token():
    print("🔄 [1/6] กำลังขอ Access Token จาก Google OAuth...")
    url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH_TOKEN,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
        print("✅ ได้รับ Access Token สำเร็จ!")
        return res["access_token"]

def create_drive_folder(access_token, name, parent_id=None):
    url = "https://www.googleapis.com/drive/v3/files"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    body = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        body["parents"] = [parent_id]
        
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
        return res["id"]

def upload_file_to_drive(access_token, file_path, file_name, parent_id):
    # Step 1: Create file metadata
    url_meta = "https://www.googleapis.com/drive/v3/files"
    headers_meta = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    body_meta = {
        "name": file_name,
        "parents": [parent_id]
    }
    req_meta = urllib.request.Request(url_meta, data=json.dumps(body_meta).encode("utf-8"), headers=headers_meta, method="POST")
    with urllib.request.urlopen(req_meta) as res_meta:
        file_data = json.loads(res_meta.read().decode("utf-8"))
        file_id = file_data["id"]
        
    # Step 2: Upload media content
    with open(file_path, "rb") as f:
        file_content = f.read()
        
    url_media = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media"
    headers_media = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/pdf"
    }
    req_media = urllib.request.Request(url_media, data=file_content, headers=headers_media, method="PATCH")
    with urllib.request.urlopen(req_media) as res_media:
        return file_id

def make_file_public_read(access_token, file_id):
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    body = {
        "role": "reader",
        "type": "anyone"
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        return True

def create_google_sheet(access_token, title):
    url = "https://sheets.googleapis.com/v4/spreadsheets"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    body = {
        "properties": {"title": title},
        "sheets": [
            {"properties": {"title": "Requests"}},
            {"properties": {"title": "KnowledgeMetadata"}},
            {"properties": {"title": "Admins"}}
        ]
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
        return res["spreadsheetId"], res["spreadsheetUrl"]

def update_sheet_data(access_token, spreadsheet_id, range_name, values):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range_name}?valueInputOption=USER_ENTERED"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    body = {"values": values}
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="PUT")
    with urllib.request.urlopen(req) as response:
        return True

def main():
    print("=" * 70)
    print("🚀 เริ่มต้นสคริปต์สร้างฐานข้อมูลและ Knowledge Base สำหรับ STeP Blueprint Portal")
    print("=" * 70)
    
    try:
        access_token = get_access_token()
        
        print("📁 [2/6] ใช้โฟลเดอร์หลักใน Google Drive ที่สร้างไว้แล้ว ('STeP_Blueprint_Portal_Data')...")
        main_folder_id = "1X_YCIekgWB-kQYhX4O7jzX7V9YJLdGHH"
        print(f"✅ โฟลเดอร์หลัก ID: {main_folder_id}")
        
        print("📂 [3/6] ใช้โฟลเดอร์ย่อย 'Knowledge_Base' และ 'Submissions' ที่สร้างไว้แล้ว...")
        kb_folder_id = "16bqNTJgwRdEvontWg3gXw1LAEWAmtSEG"
        sub_folder_id = "1MRx5HPbqUmPtZKJwl59TMpO6YPkXhBPP"
        print(f"✅ โฟลเดอร์ KB ID: {kb_folder_id} | Submissions ID: {sub_folder_id}")
        
        print("📤 [4/6] กำลังอัปโหลดไฟล์กฎกระทรวง 3 ฉบับ และคู่มือระบบเข้าโฟลเดอร์ KB...")
        kb_metadata_rows = [
            ["FileID", "FileName", "FileLink", "UploadedBy", "UploadedAt", "Category", "Summary"]
        ]
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        for file_name, summary in PDF_FILES:
            file_path = os.path.join(os.path.dirname(__file__), file_name)
            if os.path.exists(file_path):
                print(f"   ⬆️ กำลังอัปโหลด: {file_name} ...")
                file_id = upload_file_to_drive(access_token, file_path, file_name, kb_folder_id)
                make_file_public_read(access_token, file_id)
                file_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
                kb_metadata_rows.append([
                    file_id, file_name, file_link, "System Auto-Setup", now_str, "กฎหมาย/มาตรฐานอาคาร", summary
                ])
                print(f"      ✅ อัปโหลดสำเร็จ! ID: {file_id}")
            else:
                print(f"      ⚠️ ไม่พบไฟล์ {file_name} ข้ามการอัปโหลด")
                
        print("📊 [5/6] กำลังสร้าง Google Sheet Database ('STeP_Blueprint_Portal_Database')...")
        sheet_id, sheet_url = create_google_sheet(access_token, "STeP_Blueprint_Portal_Database")
        print(f"✅ สร้าง Spreadsheet สำเร็จ!")
        print(f"   🔗 URL: {sheet_url}")
        print(f"   🆔 ID: {sheet_id}")
        
        print("📝 [6/6] กำลังบันทึกโครงสร้างตารางและรายชื่อ Admin ทั้ง 7 ท่าน...")
        
        # 1. Requests tab
        requests_headers = [[
            "RequestID", "Timestamp", "ApplicantName", "Email", "Phone", "Organization",
            "BuildingType", "FileLink", "Status", "AdminNotes", "EngineerNotes", "ThreadID", "MessageID"
        ]]
        update_sheet_data(access_token, sheet_id, "Requests!A1:M1", requests_headers)
        
        # 2. KnowledgeMetadata tab
        update_sheet_data(access_token, sheet_id, f"KnowledgeMetadata!A1:G{len(kb_metadata_rows)}", kb_metadata_rows)
        
        # 3. Admins tab
        admins_rows = [["Email", "Role", "AddedAt"]]
        for email in ADMIN_EMAILS:
            admins_rows.append([email, "SuperAdmin", now_str])
        update_sheet_data(access_token, sheet_id, f"Admins!A1:C{len(admins_rows)}", admins_rows)
        
        print("✅ บันทึกข้อมูลตั้งต้นลง Google Sheet เรียบร้อยทั้งหมด!")
        
        # Save config IDs to file for server use
        config_data = {
            "SPREADSHEET_ID": sheet_id,
            "SPREADSHEET_URL": sheet_url,
            "DRIVE_MAIN_FOLDER_ID": main_folder_id,
            "DRIVE_KB_FOLDER_ID": kb_folder_id,
            "DRIVE_SUBMISSIONS_FOLDER_ID": sub_folder_id,
            "ADMIN_EMAILS": ADMIN_EMAILS
        }
        with open(os.path.join(os.path.dirname(__file__), "google_assets_config.json"), "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
            
        print("\n" + "=" * 70)
        print("🎉 เสร็จสมบูรณ์! ข้อมูลการเชื่อมต่อถูกบันทึกไว้ใน `google_assets_config.json` เรียบร้อยแล้ว")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ เกิดข้อผิดพลาด: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
