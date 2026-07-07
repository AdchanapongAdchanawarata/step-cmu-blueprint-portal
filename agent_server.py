import os
import sys
import json
import asyncio
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from google.antigravity import Agent
from agent_config import get_agent_config, WEBAPP_URL, PASSCODE
from agent_tools import (
    list_pending_requests,
    check_request_status,
    submit_admin_decision,
    submit_engineer_decision,
    query_usage_statistics
)

PORT = 8000

# 1. Verify GEMINI_API_KEY
API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not API_KEY:
    print("=" * 60)
    print("WARNING: GEMINI_API_KEY environment variable is not set!")
    print("To get a free API key, please visit Google AI Studio:")
    print("👉 https://aistudio.google.com/app/api-keys")
    print("=" * 60)
    print("\nPlease set the GEMINI_API_KEY environment variable and restart the server.")
    sys.exit(1)

# Set up event loop for running async tasks
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

def _forward_to_gas(params, post_data=None):
    """Helper to forward client requests securely to Google Apps Script backend."""
    if not WEBAPP_URL:
        return {"success": False, "error": "STeP_WEBAPP_URL is not set on the server."}
    
    try:
        query_string = urllib.parse.urlencode(params)
        full_url = f"{WEBAPP_URL}?{query_string}"
        
        req = urllib.request.Request(full_url, headers={'User-Agent': 'STeP-Server-Proxy'})
        
        # If posting data (e.g. base64 file uploads), send it
        if post_data:
            req.method = 'POST'
            req.add_header('Content-Type', 'application/json')
            data_bytes = json.dumps(post_data).encode('utf-8')
            with urllib.request.urlopen(req, data=data_bytes, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        else:
            with urllib.request.urlopen(req, timeout=15) as response:
                return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        return {"success": False, "error": f"Failed to reach Google Sheets: {str(e)}"}

class AgentHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging raw HTTP requests to stdout for cleaner console
        pass

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Serve the index.html page or proxy GET requests to Apps Script."""
        self.send_header('Access-Control-Allow-Origin', '*')
        
        # 1. Route: Serve Frontend UI index.html
        if self.path == '/' or self.path == '/index.html':
            try:
                file_path = os.path.join(os.path.dirname(__file__), 'public', 'index.html')
                if not os.path.exists(file_path):
                    file_path = os.path.join(os.path.dirname(__file__), 'index.html')
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Error loading index.html: {str(e)}".encode('utf-8'))
            return

        # 2. Route: Proxy Check Status
        if self.path.startswith('/api/status'):
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            code = query.get('code', [''])[0]
            
            res = _forward_to_gas({"action": "status", "code": code})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 3. Route: Proxy Get Stats
        if self.path.startswith('/api/stats'):
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            passcode = query.get('passcode', [''])[0]
            
            res = _forward_to_gas({"action": "getStats", "passcode": passcode})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 4. Route: Proxy Get Pending List
        if self.path.startswith('/api/pending'):
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            passcode = query.get('passcode', [''])[0]
            
            res = _forward_to_gas({"action": "list", "passcode": passcode})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 5. Route: Get templates list dynamically
        if self.path == '/api/templates':
            res = _forward_to_gas({"action": "getDriveAssets"})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        """Handle chatbot requests or proxy data insertion POST requests."""
        self.send_header('Access-Control-Allow-Origin', '*')
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_body = json.loads(post_data.decode('utf-8'))
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "Invalid JSON"}).encode('utf-8'))
            return

        # 1. Route: AI Chat Room
        if self.path == '/chat':
            user_message = req_body.get('message', '')
            print(f"[Portal -> AI] Request: {user_message}")
            try:
                response_text = loop.run_until_complete(self.run_agent_chat(user_message))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'reply': response_text}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        # 2. Route: Request Blueprint submission
        if self.path == '/api/request':
            # Forward directly to GAS
            res = _forward_to_gas({"action": "request"}, post_data=req_body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 3. Route: Review Blueprint submission (includes base64 file upload)
        if self.path == '/api/review':
            res = _forward_to_gas({"action": "review"}, post_data=req_body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 4. Route: Admin Decision
        if self.path == '/api/decision/admin':
            res = _forward_to_gas({
                "action": "admin",
                "code": req_body.get('code'),
                "decision": req_body.get('decision'),
                "notes": req_body.get('notes'),
                "passcode": req_body.get('passcode')
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        # 5. Route: Engineer Decision
        if self.path == '/api/decision/engineer':
            res = _forward_to_gas({
                "action": "engineer",
                "code": req_body.get('code'),
                "decision": req_body.get('decision'),
                "notes": req_body.get('notes'),
                "fileLink": req_body.get('fileLink'),
                "passcode": req_body.get('passcode')
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    async def run_agent_chat(self, msg):
        tools = [
            list_pending_requests,
            check_request_status,
            submit_admin_decision,
            submit_engineer_decision,
            query_usage_statistics
        ]
        config = get_agent_config(tools)
        async with Agent(config=config) as agent:
            response = await agent.chat(msg)
            tokens = []
            try:
                async for token in response:
                    tokens.append(token)
            except Exception as e:
                import websockets.exceptions
                if not isinstance(e, websockets.exceptions.ConnectionClosedOK):
                    raise e
            return "".join(tokens)

def run_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, AgentHTTPHandler)
    
    print("=" * 70)
    print(f"STeP CMU Portal Web Server successfully started on port {PORT}!")
    print(f"👉 Open in your browser: http://localhost:{PORT}")
    print("\n[Highly Recommended] Share with your team using ngrok:")
    print(f"👉 Run command: ngrok http {PORT}")
    print("=" * 70)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
