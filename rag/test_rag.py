# test_rag.py — Automated test suite for Phase 1 RAG pipeline

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from query_data import get_rag_response

test_queries = [
    ("Test 1", "What is the maximum Earned Leave accumulation allowed?"),
    ("Test 2", "Are employees on probation entitled to Casual Leave?"),
    ("Test 3", "What is the purpose of the POSH policy?"),
    ("Test 4", "What is the definition of a Whistle Blower?"),
    ("Test 5 (Out of Context)", "What is Puravankara policy on pet allowances for remote workers?"),
    ("Test 6 (Harassment)", "He is sexually harassing me.")
]

for label, q in test_queries:
    print("=" * 60)
    print(f"[{label}] Query: \"{q}\"")
    res = get_rag_response(q)
    print(f"Answer:\n{res['answer']}")
    print("\nSources:")
    if res['sources']:
        for s in res['sources']:
            print(f"  - {s['source']} (p.{s['page']}) [score: {s['score']}]")
    else:
        print("  - None (Insufficient Context / Out of Bounds)")
    print("=" * 60 + "\n")
