import os
import urllib.request
import urllib.parse
import json
from google.antigravity import LocalAgentConfig

# The deployed Google Apps Script Web App URL
WEBAPP_URL = os.environ.get("STeP_WEBAPP_URL", "")
PASSCODE = os.environ.get("STeP_PASSCODE", "STeP2026")

BASE_SYSTEM_INSTRUCTIONS = """You are the STeP CMU Blueprint Agent, a virtual assistant for the Facilities and Workspace Management team at Science and Technology Park, Chiang Mai University.

Your purpose is to help STeP staff (Admins and Engineers) manage and review blueprint requests (REQ-XXXX) and blueprint revision reviews (REV-XXXX).

You have access to tools that connect to the Google Sheets database (via the Apps Script Web App). You can:
1. List all pending requests.
2. Check the status of a specific request.
3. Help record admin and engineer approval decisions.
4. Answer usage statistics queries (e.g. how many requests are approved, who requested the most, etc.) using database records.

Always explain what you are doing. Speak in a professional, polite, and helpful tone (prefer Thai language as it is the official system language).
"""

def get_dynamic_instructions() -> str:
    """Fetches knowledge and instruction assets from Google Drive via the Apps Script Web App."""
    if not WEBAPP_URL:
        return BASE_SYSTEM_INSTRUCTIONS
        
    try:
        url = f"{WEBAPP_URL}?action=getDriveAssets&passcode={PASSCODE}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Antigravity-Agent'})
        # Timeout after 5 seconds to avoid freezing startup
        with urllib.request.urlopen(req, timeout=5) as response:
            res = json.loads(response.read().decode('utf-8'))
            if res.get("success") and res.get("data"):
                data = res["data"]
                ref_texts = []
                
                # Fetch references text content
                for ref_file in data.get("refFiles", []):
                    if ref_file.get("content"):
                        ref_texts.append(f"--- File: {ref_file['name']} ---\n{ref_file['content']}")
                
                skill_text = data.get("skillInstructions", "")
                
                compiled = BASE_SYSTEM_INSTRUCTIONS
                if ref_texts:
                    compiled += "\n\n### Google Drive Knowledge Base (Regulations & Guidelines):\n" + "\n\n".join(ref_texts)
                if skill_text:
                    compiled += f"\n\n### Google Drive Instructions (skill.md):\n{skill_text}"
                return compiled
    except Exception as e:
        print(f"Warning: Could not fetch dynamic drive assets, using local fallback. Error: {e}")
    return BASE_SYSTEM_INSTRUCTIONS

def get_agent_config(tools):
    """Generates the configuration for the Google Antigravity Agent.
    
    Includes the local skills directory path and dynamic system instructions.
    """
    # Load local skills directory path
    local_skills_dir = "/Users/aa/Desktop/nick_project/backend_assets/skills"
    
    return LocalAgentConfig(
        model="gemini-2.5-flash",
        tools=tools,
        system_instructions=get_dynamic_instructions(),
        skills_paths=[local_skills_dir]
    )
