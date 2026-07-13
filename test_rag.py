from rag.query_data import get_rag_response

res = get_rag_response("What protections exist for employees filing complaints?")

print("\n🧠 Answer:\n")
print(res["answer"])

print("\n📚 Sources:\n")

seen = set()
for src in res["sources"]:
    key = f"{src['source']} - Page {src['page']}"
    if key not in seen:
        seen.add(key)
        print(f"- {src['source']} (Page {src['page']}) | Score: {src['score']}")