import os
import sys
import asyncio
from google.antigravity import Agent
from agent_config import get_agent_config, WEBAPP_URL
from agent_tools import (
    list_pending_requests,
    check_request_status,
    submit_admin_decision,
    submit_engineer_decision
)

# 1. Verify GEMINI_API_KEY
API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not API_KEY:
    print("=" * 60)
    print("WARNING: GEMINI_API_KEY environment variable is not set!")
    print("To get a free API key, please visit Google AI Studio:")
    print("👉 https://aistudio.google.com/app/api-keys")
    print("=" * 60)
    print("\nPlease set the GEMINI_API_KEY environment variable and try again.")
    print("Example: export GEMINI_API_KEY='your_api_key_here'")
    sys.exit(1)

# 2. Check WebApp URL config
if not WEBAPP_URL:
    print("-" * 60)
    print("INFO: STeP_WEBAPP_URL environment variable is not set.")
    print("Deploy your Google Apps Script Web App and set it to enable Sheet queries.")
    print("Example: export STeP_WEBAPP_URL='https://script.google.com/macros/s/.../exec'")
    print("-" * 60)

async def main():
    # Set up tools list
    tools = [
        list_pending_requests,
        check_request_status,
        submit_admin_decision,
        submit_engineer_decision
    ]
    
    # Load Antigravity Agent configuration
    config = get_agent_config(tools)
    
    # Initialize and run agent
    print("Initializing STeP CMU Blueprint AI Agent...")
    async with Agent(config=config) as agent:
        # Check if query passed via command line
        if len(sys.argv) > 1:
            query = " ".join(sys.argv[1:])
            print(f"User Query: {query}\n")
            print("Agent: ", end="", flush=True)
            response = await agent.chat(query)
            try:
                async for token in response:
                    print(token, end="", flush=True)
            except Exception as e:
                import websockets.exceptions
                if not isinstance(e, websockets.exceptions.ConnectionClosedOK):
                    raise e
            print("\n")
        else:
            # Fallback to interactive CLI loop
            print("AI Agent is ready. Type your query below (or 'exit' to quit).")
            print("-" * 50)
            while True:
                try:
                    user_input = input("\nUser: ").strip()
                    if not user_input:
                        continue
                    if user_input.lower() in ["exit", "quit", "q"]:
                        print("Goodbye!")
                        break
                    
                    print("Agent: ", end="", flush=True)
                    response = await agent.chat(user_input)
                    try:
                        async for token in response:
                            print(token, end="", flush=True)
                    except Exception as e:
                        import websockets.exceptions
                        if not isinstance(e, websockets.exceptions.ConnectionClosedOK):
                            raise e
                    print()
                except KeyboardInterrupt:
                    print("\nExiting...")
                    break
                except Exception as e:
                    print(f"\nError: {e}")

if __name__ == "__main__":
    # Run event loop
    asyncio.run(main())
