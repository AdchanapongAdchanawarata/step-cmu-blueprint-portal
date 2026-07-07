import urllib.request
import urllib.parse
import json
import logging
from agent_config import WEBAPP_URL, PASSCODE

logger = logging.getLogger(__name__)

def _make_request(params):
    """Helper to send a GET request to the Google Apps Script Web App."""
    if not WEBAPP_URL:
        return "Error: STeP_WEBAPP_URL environment variable is not set. Please set it before running the agent."
    
    try:
        # Build URL with parameters
        query_string = urllib.parse.urlencode(params)
        full_url = f"{WEBAPP_URL}?{query_string}"
        
        # Google Apps Script redirects (302) are handled automatically by urllib
        req = urllib.request.Request(full_url, headers={'User-Agent': 'Antigravity-Agent'})
        with urllib.request.urlopen(req) as response:
            result = response.read().decode('utf-8')
            return result
    except Exception as e:
        return f"Network Error: Failed to communicate with backend. Detail: {str(e)}"

def list_pending_requests() -> str:
    """Lists all document requests and reviews from the database (Google Sheets) including details and current status.
    
    Returns:
        A JSON string containing the list of requests or an error message.
    """
    params = {
        "action": "list",
        "passcode": PASSCODE
    }
    result = _make_request(params)
    try:
        data = json.loads(result)
        if data.get("success"):
            reqs = data.get("requests", [])
            if not reqs:
                return "No requests found in the database."
            return json.dumps(reqs, indent=2, ensure_ascii=False)
        else:
            return f"Error from backend: {data.get('error')}"
    except Exception:
        return f"Raw result from backend: {result}"

def check_request_status(code: str) -> str:
    """Checks the real-time status and details of a specific request using its request code (e.g., REQ-1001, REV-1001).
    
    Args:
        code: The unique request identifier, e.g. "REQ-1001" or "REV-1001".
    """
    params = {
        "action": "status",
        "code": code
    }
    result = _make_request(params)
    try:
        data = json.loads(result)
        if data.get("success"):
            if data.get("found"):
                return json.dumps(data.get("data"), indent=2, ensure_ascii=False)
            else:
                return f"No request found with code '{code}'."
        else:
            return f"Error: {data.get('error')}"
    except Exception:
        return f"Raw result: {result}"

def submit_admin_decision(code: str, decision: str, notes: str) -> str:
    """Submits the Admin's review decision for a request (typically REQ-XXXX) to either approve it (send to engineer) or reject it.
    
    Args:
        code: The unique request identifier (e.g., "REQ-1001").
        decision: Must be either "APPROVE" or "REJECT".
        notes: Feedback notes explaining the reason for the decision.
    """
    decision = decision.upper()
    if decision not in ["APPROVE", "REJECT"]:
        return "Error: decision must be either 'APPROVE' or 'REJECT'."
        
    params = {
        "action": "admin",
        "code": code,
        "decision": decision,
        "notes": notes,
        "passcode": PASSCODE
    }
    result = _make_request(params)
    try:
        data = json.loads(result)
        if data.get("success"):
            return f"Successfully submitted Admin decision '{decision}' for request '{code}'."
        else:
            return f"Error submitting decision: {data.get('error')}"
    except Exception:
        return f"Raw result: {result}"

def submit_engineer_decision(code: str, decision: str, notes: str, file_link: str = "") -> str:
    """Submits the Engineer's review decision for a blueprint review request (typically REV-XXXX), finalizing it and providing the blueprint download link if approved.
    
    Args:
        code: The unique request identifier (e.g., "REV-1001").
        decision: Must be either "APPROVE" or "REJECT".
        notes: Technical notes or recommendations.
        file_link: The URL to the actual blueprint layout file (required if approving).
    """
    decision = decision.upper()
    if decision not in ["APPROVE", "REJECT"]:
        return "Error: decision must be either 'APPROVE' or 'REJECT'."
    if decision == "APPROVE" and not file_link:
        return "Error: A file_link is required when approving a request."
        
    params = {
        "action": "engineer",
        "code": code,
        "decision": decision,
        "notes": notes,
        "fileLink": file_link,
        "passcode": PASSCODE
    }
    result = _make_request(params)
    try:
        data = json.loads(result)
        if data.get("success"):
            return f"Successfully submitted Engineer decision '{decision}' for request '{code}'."
        else:
            return f"Error submitting decision: {data.get('error')}"
    except Exception:
        return f"Raw result: {result}"

def query_usage_statistics() -> str:
    """Queries and returns aggregated usage statistics of the blueprint portal system.
    
    Use this tool when the staff asks for reports, stats, totals, approval/rejection rates,
    or details on which companies submit the most requests.
    
    Returns:
        A JSON string containing statistics like total requests, pending counts,
        approved/rejected counts, company share distribution, and timeline.
    """
    params = {
        "action": "getStats",
        "passcode": PASSCODE
    }
    result = _make_request(params)
    try:
        data = json.loads(result)
        if data.get("success"):
            return json.dumps(data.get("stats"), indent=2, ensure_ascii=False)
        else:
            return f"Error querying statistics: {data.get('error')}"
    except Exception:
        return f"Raw result: {result}"
