"""
evaluate_classification.py — Evaluates LLM-based classification metrics using Ollama (qwen2.5:3b).

Computes:
  1. Severity Classification (LOW, MEDIUM, HIGH)
  2. Intent Classification (QUERY, GRIEVANCE)
  3. Department Classification (HR, IC, CRM, CSD, ESG, Investors)

Metrics calculated:
  - Accuracy
  - Macro & Weighted Precision, Recall, F1
  - Per-class Precision, Recall, F1-score, and Support
  - Confusion Matrix

Results are saved to: results/classification_metrics_report.json

Usage:
  python backend/tests/evaluate_classification.py
  python backend/tests/evaluate_classification.py --limit 6 --verbose
"""

import os
import sys
import json
import time
import argparse
from typing import Dict, List, Any

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

from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    classification_report,
    confusion_matrix,
)

from backend.agent.llm import get_llm
from backend.agent.nodes.classify_severity import classify_severity_node
from backend.agent.nodes.classify_department import classify_department_node


def compute_metrics(y_true: List[str], y_pred: List[str], labels: List[str]) -> Dict[str, Any]:
    """Calculate accuracy, precision, recall, f1, per-class stats and confusion matrix."""
    acc = float(accuracy_score(y_true, y_pred))
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, average="macro", zero_division=0
    )
    p_weighted, r_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, average="weighted", zero_division=0
    )

    report_dict = classification_report(
        y_true, y_pred, labels=labels, output_dict=True, zero_division=0
    )

    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()

    return {
        "accuracy": round(acc, 4),
        "precision": round(float(p_macro), 4),
        "recall": round(float(r_macro), 4),
        "f1": round(float(f1_macro), 4),
        "per_class": report_dict,
        "confusion_matrix": cm,
    }


def print_metrics_table(name: str, metrics: Dict[str, Any], labels: List[str], model_name: str = ""):
    """Pretty prints metrics and per-class summary to the console."""
    model_disp = f" ({model_name})" if model_name else ""
    print(f"\n============================================================")
    print(f"📊 {name.upper()} EVALUATION METRICS{model_disp}")
    print(f"============================================================")
    print(f"Accuracy  : {metrics['accuracy'] * 100:.2f}%")
    print(f"Precision : {metrics['precision'] * 100:.2f}% (Macro)")
    print(f"Recall    : {metrics['recall'] * 100:.2f}% (Macro)")
    print(f"F1-Score  : {metrics['f1'] * 100:.2f}% (Macro)")
    print("------------------------------------------------------------")
    print(f"{'Class':<12} {'Precision':<12} {'Recall':<12} {'F1-Score':<12} {'Support':<10}")
    print("-" * 58)

    per_class = metrics.get("per_class", {})
    for lbl in labels:
        if lbl in per_class:
            stats = per_class[lbl]
            p = f"{stats['precision'] * 100:.2f}%"
            r = f"{stats['recall'] * 100:.2f}%"
            f = f"{stats['f1-score'] * 100:.2f}%"
            s = int(stats['support'])
            print(f"{lbl:<12} {p:<12} {r:<12} {f:<12} {s:<10}")

    if "macro avg" in per_class:
        m = per_class["macro avg"]
        print("-" * 58)
        print(f"{'Macro Avg':<12} {m['precision'] * 100:.2f}%     {m['recall'] * 100:.2f}%     {m['f1-score'] * 100:.2f}%     {int(m['support']):<10}")
    if "weighted avg" in per_class:
        w = per_class["weighted avg"]
        print(f"{'Weighted Avg':<12} {w['precision'] * 100:.2f}%     {w['recall'] * 100:.2f}%     {w['f1-score'] * 100:.2f}%     {int(w['support']):<10}")
    print("============================================================\n")


def run_classification_evaluation(
    benchmark_path: str = None,
    output_path: str = None,
    limit: int = None,
    verbose: bool = False,
) -> Dict[str, Any]:
    """Run full classification evaluation using the active Ollama model."""
    if benchmark_path is None:
        benchmark_path = os.path.join(PROJECT_ROOT, "backend", "tests", "eval_benchmark.json")
    if output_path is None:
        output_path = os.path.join(PROJECT_ROOT, "results", "classification_metrics_report.json")

    with open(benchmark_path, "r", encoding="utf-8") as f:
        bench_data = json.load(f)

    test_cases = bench_data.get("test_cases", [])
    if limit and limit > 0:
        test_cases = test_cases[:limit]

    print(f"[*] Starting Classification Evaluation with {len(test_cases)} test cases...")
    client, model_name = get_llm()
    provider = os.getenv("LLM_PROVIDER", "ollama")
    print(f"[*] Provider: {provider.upper()} | Model: {model_name}")

    y_true_sev = []
    y_pred_sev = []
    y_true_intent = []
    y_pred_intent = []
    severity_details = []

    y_true_dept = []
    y_pred_dept = []
    department_details = []

    total_start = time.time()

    for idx, tc in enumerate(test_cases, 1):
        text = tc["text"]
        exp_sev = tc["expected_severity"]
        exp_intent = tc["expected_intent"]
        exp_dept = tc.get("expected_department")

        t0 = time.time()
        # 1. Severity & Intent via classify_severity_node
        sev_state = {"user_message": text, "messages": []}
        sev_res = classify_severity_node(sev_state)
        pred_sev = sev_res.get("severity", "LOW")
        pred_intent = sev_res.get("intent", "QUERY")
        sev_time = round(time.time() - t0, 2)

        y_true_sev.append(exp_sev)
        y_pred_sev.append(pred_sev)
        y_true_intent.append(exp_intent)
        y_pred_intent.append(pred_intent)

        sev_corr = (pred_sev == exp_sev)
        intent_corr = (pred_intent == exp_intent)

        severity_details.append({
            "text": text,
            "expected_severity": exp_sev,
            "predicted_severity": pred_sev,
            "severity_correct": sev_corr,
            "expected_intent": exp_intent,
            "predicted_intent": pred_intent,
            "intent_correct": intent_corr,
        })

        dept_info_str = ""
        # 2. Department via classify_department_node if grievance / expected_department
        if exp_dept:
            t1 = time.time()
            dept_state = {"user_message": text, "messages": []}
            dept_res = classify_department_node(dept_state)
            pred_dept = dept_res.get("department", "CRM")
            dept_time = round(time.time() - t1, 2)

            y_true_dept.append(exp_dept)
            y_pred_dept.append(pred_dept)
            dept_corr = (pred_dept == exp_dept)

            department_details.append({
                "text": text,
                "expected_department": exp_dept,
                "predicted_department": pred_dept,
                "correct": dept_corr,
            })
            dept_info_str = f" | Dept: {pred_dept} (Exp: {exp_dept}, {'OK' if dept_corr else 'X'}) [{dept_time}s]"

        if verbose or idx % 5 == 0 or idx == len(test_cases):
            print(
                f"[{idx}/{len(test_cases)}] Sev: {pred_sev} ({'OK' if sev_corr else 'X'}) | "
                f"Intent: {pred_intent} ({'OK' if intent_corr else 'X'})"
                f"{dept_info_str} [{sev_time}s] -- {text[:45]}...",
                flush=True,
            )

    elapsed = round(time.time() - total_start, 2)
    print(f"\n[OK] Inference complete in {elapsed}s across {len(test_cases)} samples.", flush=True)

    # Calculate metrics
    sev_labels = ["LOW", "MEDIUM", "HIGH"]
    intent_labels = ["QUERY", "GRIEVANCE"]
    dept_labels = ["HR", "IC", "CRM", "CSD", "ESG", "Investors"]

    sev_metrics = compute_metrics(y_true_sev, y_pred_sev, sev_labels)
    intent_metrics = compute_metrics(y_true_intent, y_pred_intent, intent_labels)

    dept_metrics = {}
    if y_true_dept:
        # Filter dept labels present
        dept_metrics = compute_metrics(y_true_dept, y_pred_dept, dept_labels)

    # Print summaries
    tag = f"{provider.upper()} {model_name}"
    print_metrics_table("Severity Classification", sev_metrics, sev_labels, tag)
    print_metrics_table("Intent Classification", intent_metrics, intent_labels, tag)
    if dept_metrics:
        print_metrics_table("Department Classification", dept_metrics, dept_labels, tag)

    # Build final report
    final_report = {
        "severity": sev_metrics,
        "intent": intent_metrics,
        "department": dept_metrics,
        "severity_details": severity_details,
        "department_details": department_details,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=4)

    print(f"[OK] Classification report saved to: {output_path}", flush=True)
    return final_report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Classification Metrics using Ollama")
    parser.add_argument("--benchmark", type=str, default=None, help="Path to benchmark JSON")
    parser.add_argument("--output", type=str, default=None, help="Path to save report JSON")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of test samples")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print verbose test details")
    args = parser.parse_args()

    run_classification_evaluation(
        benchmark_path=args.benchmark,
        output_path=args.output,
        limit=args.limit,
        verbose=args.verbose,
    )
