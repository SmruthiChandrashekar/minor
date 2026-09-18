import sys
import os
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.agent.llm import get_llm, extract_response_text
from backend.agent.nodes.classify_department import classify_department_node

print("============================================================")
print("[*] TESTING OLLAMA INTEGRATION")
print("============================================================")

client, model = get_llm()
provider = os.getenv("LLM_PROVIDER", "groq")
base_url = getattr(client, "base_url", "Groq Cloud")

print(f"1. Active Provider : {provider.upper()}")
print(f"2. Active Model    : {model}")
print(f"3. Client Endpoint : {base_url}")
print("------------------------------------------------------------")

print("\n>>> Sending test ping to local LLM...")
start = time.time()
try:
    res = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Respond strictly with the single word: OLLAMA_ONLINE"}],
        max_tokens=100,
    )
    duration = round(time.time() - start, 2)
    response_text = extract_response_text(res.choices[0].message)
    print(f"[OK] Success! ({duration}s)")
    print(f"     Model Output: {response_text or '[Thinking completed]'}")
except Exception as e:
    print(f"[FAIL] Connection failed: {e}")

print("\n>>> Testing real department classification node via Ollama...")
test_state = {"user_message": "Water leakage and seepage in bathroom ceiling of flat 302"}
start = time.time()
try:
    dept_result = classify_department_node(test_state)
    duration = round(time.time() - start, 2)
    print(f"[OK] Department Classified in {duration}s:")
    print(f"     Department : {dept_result.get('department')}")
    print(f"     Reason     : {dept_result.get('department_reason')}")
except Exception as e:
    print(f"[FAIL] Classification failed: {e}")

print("============================================================")
