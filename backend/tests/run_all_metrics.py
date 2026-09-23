"""
run_all_metrics.py — Master evaluation runner for Puravankara Enterprise.

Orchestrates and executes:
  1. Classification Metrics (Severity, Intent, Department via Ollama qwen2.5:3b)
  2. System & Operational Metrics (Response Latency, Escalation Accuracy, Resolution Rate, User Satisfaction)

Saves reports to:
  - results/classification_metrics_report.json
  - results/system_metrics_report.json

Usage:
  # Run all evaluations (full 42-sample benchmark)
  python backend/tests/run_all_metrics.py

  # Quick run with limited samples
  python backend/tests/run_all_metrics.py --limit 6 --verbose

  # Run only system metrics
  python backend/tests/run_all_metrics.py --skip-classification
"""

import os
import sys
import json
import time
import argparse

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Fix Windows console UTF-8 output encoding
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, "backend", ".env"))

from backend.tests.evaluate_classification import run_classification_evaluation
from backend.tests.evaluate_system import run_system_evaluation


def print_banner():
    print("=" * 70)
    print("      PURAVANKARA ENTERPRISE — METRICS & EVALUATION SUITE")
    print("=" * 70)
    provider = os.getenv("LLM_PROVIDER", "ollama").upper()
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b") if provider == "OLLAMA" else os.getenv("GROQ_MODEL", "")
    print(f"  Active LLM Engine : {provider} ({model})")
    print(f"  Timestamp         : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70 + "\n", flush=True)


def print_executive_dashboard(class_res, sys_res):
    print("\n" + "#" * 70)
    print("         EXECUTIVE PERFORMANCE & QUALITY DASHBOARD")
    print("#" * 70)

    # 1. Classification Overview
    if class_res:
        print("\n--- [1] CLASSIFICATION MODEL METRICS (Ollama qwen2.5:3b) ---")
        sev = class_res.get("severity", {})
        intent = class_res.get("intent", {})
        dept = class_res.get("department", {})

        print(f"  Severity Accuracy   : {sev.get('accuracy', 0) * 100:.2f}%  |  F1 (Macro): {sev.get('f1', 0) * 100:.2f}%")
        print(f"  Intent Accuracy     : {intent.get('accuracy', 0) * 100:.2f}%  |  F1 (Macro): {intent.get('f1', 0) * 100:.2f}%")
        if dept:
            print(f"  Department Accuracy : {dept.get('accuracy', 0) * 100:.2f}%  |  F1 (Macro): {dept.get('f1', 0) * 100:.2f}%")
        else:
            print("  Department Accuracy : [Not tested in sample batch]")

    # 2. RAG Metrics using RAGAS Overview
    ragas_report_path = os.path.join(PROJECT_ROOT, "results", "ragas_evaluation_report.json")
    if os.path.exists(ragas_report_path):
        try:
            with open(ragas_report_path, "r", encoding="utf-8", errors="replace") as f:
                ragas_data = json.load(f)
            ragas_scores = ragas_data.get("aggregated_scores", {})
            print("\n--- [2] RAG METRICS USING RAGAS ---")
            faith = ragas_scores.get("faithfulness")
            relev = ragas_scores.get("answer_relevancy")
            prec = ragas_scores.get("context_precision")
            halluc = ragas_scores.get("hallucination_rate")

            f_str = f"{faith * 100:.2f}%" if faith is not None else "N/A"
            r_str = f"{relev * 100:.2f}%" if relev is not None else "N/A"
            p_str = f"{prec * 100:.2f}%" if prec is not None else "N/A"
            h_str = f"{halluc * 100:.2f}%" if halluc is not None else "N/A"

            print(f"  Faithfulness        : {f_str}")
            print(f"  Answer Relevancy    : {r_str}")
            print(f"  Context Precision   : {p_str}")
            print(f"  Hallucination Rate  : {h_str}")
        except Exception as e:
            print(f"  [Notice] Could not load Ragas scores: {e}")

    # 3. System Operations Overview
    if sys_res:
        print("\n--- [3] SYSTEM OPERATIONS & WORKFLOW METRICS ---")
        lat = sys_res.get("response_latency", {})
        esc = sys_res.get("escalation_accuracy", {})
        res = sys_res.get("resolution_rate", {})
        sat = sys_res.get("user_satisfaction", {})

        if not lat.get("skipped"):
            print(f"  Response Latency    : Avg: {lat.get('avg_ms', 0):.0f} ms | p50: {lat.get('p50_ms', 0):.0f} ms | p95: {lat.get('p95_ms', 0):.0f} ms")
        else:
            print("  Response Latency    : [Skipped]")

        print(f"  Escalation Accuracy : {esc.get('accuracy', 0) * 100:.1f}% ({esc.get('passed', 0)}/{esc.get('total_tests', 0)} passed)")
        print(f"  Resolution Rate     : {res.get('resolution_rate', 0) * 100:.2f}% ({res.get('resolved', 0)}/{res.get('total', 0)} grievances resolved)")
        if sat.get("total_feedback", 0) > 0:
            print(f"  User Satisfaction   : {sat.get('avg_rating', 0)}/5.0 ({sat.get('total_feedback')} ratings)")
        else:
            print("  User Satisfaction   : No feedback submitted yet (0/5.0)")

    print("\n--- [4] GENERATED ARTIFACT REPORTS ---")
    print(f"  - results/classification_metrics_report.json")
    print(f"  - results/ragas_evaluation_report.json")
    print(f"  - results/system_metrics_report.json")
    print("#" * 70 + "\n", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Run All Puravankara Metrics")
    parser.add_argument("--limit", type=int, default=None, help="Limit classification test samples")
    parser.add_argument("--skip-classification", action="store_true", help="Skip classification evaluation")
    parser.add_argument("--skip-system", action="store_true", help="Skip system evaluation")
    parser.add_argument("--skip-latency", action="store_true", help="Skip response latency test in system evaluation")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    print_banner()

    class_results = None
    sys_results = None

    # Step 1: Classification Evaluation
    if not args.skip_classification:
        class_results = run_classification_evaluation(
            limit=args.limit,
            verbose=args.verbose,
        )

    # Step 2: System Evaluation
    if not args.skip_system:
        sys_results = run_system_evaluation(
            skip_latency=args.skip_latency,
            latency_samples=3 if args.limit is None else min(args.limit, 3),
        )

    # Step 3: Executive Summary Dashboard
    print_executive_dashboard(class_results, sys_results)


if __name__ == "__main__":
    main()
