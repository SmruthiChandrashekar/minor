"""
evaluate.py — Run Laya predictions on the gold-standard dataset and compute metrics.

Outputs:
  - Console summary with accuracy, precision, recall, F1 per task
  - Head-to-head comparison against LLM baselines
  - Detailed JSON report saved to results/laya_classification_report.json

Usage:
    python -m jev_classifier.evaluate
"""

import json
import os
import sys
import time
import logging
import numpy as np
from collections import defaultdict

# Configure encoding for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Add project root to path for clean imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from jev_classifier.classifier import classify_severity, classify_department
from jev_classifier.dataset import SEVERITY_DATASET, DEPARTMENT_DATASET
from jev_classifier.config import SEVERITY_LABELS, INTENT_LABELS, DEPARTMENT_LABELS


# ── LLM Baselines (from results/classification_metrics_report.json) ───────────

LLM_BASELINES = {
    "severity": {"accuracy": 0.7381, "precision": 0.7824, "recall": 0.7511, "f1": 0.7604},
    "intent":   {"accuracy": 0.9524, "precision": 0.9706, "recall": 0.9000, "f1": 0.9293},
    "department": {"accuracy": 0.9688, "precision": 0.9722, "recall": 0.9722, "f1": 0.9697},
}


# ── Metrics Computation ──────────────────────────────────────────────────────

def compute_metrics(y_true: list, y_pred: list, labels: list) -> dict:
    """
    Compute accuracy, per-class precision/recall/F1, macro averages,
    and confusion matrix without requiring sklearn.
    """
    n = len(y_true)
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    accuracy = correct / n if n > 0 else 0.0

    # Per-class metrics
    per_class = {}
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        support = sum(1 for t in y_true if t == label)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        per_class[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1-score": round(f1, 4),
            "support": support,
        }

    # Macro averages
    macro_precision = np.mean([v["precision"] for v in per_class.values()])
    macro_recall = np.mean([v["recall"] for v in per_class.values()])
    macro_f1 = np.mean([v["f1-score"] for v in per_class.values()])

    # Confusion matrix
    label_idx = {label: i for i, label in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for t, p in zip(y_true, y_pred):
        if t in label_idx and p in label_idx:
            matrix[label_idx[t]][label_idx[p]] += 1

    return {
        "accuracy": round(accuracy, 4),
        "precision": round(float(macro_precision), 4),
        "recall": round(float(macro_recall), 4),
        "f1": round(float(macro_f1), 4),
        "per_class": per_class,
        "confusion_matrix": matrix,
        "confusion_matrix_labels": labels,
    }


def format_comparison(task_name: str, laya_metrics: dict, llm_baseline: dict) -> str:
    """Format a comparison table between Laya and LLM for a single task."""
    lines = []
    lines.append(f"\n  {'Metric':<14} {'Laya':>10} {'LLM':>10} {'Delta':>10}")
    lines.append(f"  {'─' * 44}")
    for metric in ["accuracy", "precision", "recall", "f1"]:
        laya_val = laya_metrics.get(metric, 0)
        llm_val = llm_baseline.get(metric, 0)
        delta = laya_val - llm_val
        sign = "+" if delta >= 0 else ""
        lines.append(
            f"  {metric.capitalize():<14} {laya_val:>9.2%} {llm_val:>9.2%} {sign}{delta:>8.2%}"
        )
    return "\n".join(lines)


def format_confusion_matrix(matrix: list, labels: list) -> str:
    """Format confusion matrix as a readable text table."""
    col_w = max(len(l) for l in labels) + 2
    header = " " * (col_w + 2) + "".join(f"{l:>{col_w}}" for l in labels)
    lines = [header]
    for i, label in enumerate(labels):
        row = f"  {label:<{col_w}}" + "".join(f"{matrix[i][j]:>{col_w}}" for j in range(len(labels)))
        lines.append(row)
    return "\n".join(lines)


# ── Main Evaluation ──────────────────────────────────────────────────────────

def run_evaluation():
    """Run the full Laya evaluation pipeline."""
    print("=" * 70)
    print("  LAYA DECISION MODEL — ISOLATED CLASSIFICATION LAB")
    print("  Puravankara Grievance Severity & Department Evaluation")
    print("=" * 70)

    # ── Phase 1: Severity + Intent Classification ─────────────────────────
    print("\n[1/3] Running severity + intent classification...")
    print(f"      Dataset: {len(SEVERITY_DATASET)} samples")

    sev_true, sev_pred = [], []
    int_true, int_pred = [], []
    sev_details = []
    sev_confidences = []
    int_confidences = []
    sev_latencies = []

    for idx, (text, expected_sev, expected_int) in enumerate(SEVERITY_DATASET, 1):
        try:
            result = classify_severity(text)
            pred_sev = result["severity"]
            pred_int = result["intent"]

            sev_true.append(expected_sev)
            sev_pred.append(pred_sev)
            int_true.append(expected_int)
            int_pred.append(pred_int)

            sev_confidences.append(result["severity_confidence"])
            int_confidences.append(result["intent_confidence"])
            sev_latencies.append(result["latency_ms"])

            sev_correct = pred_sev == expected_sev
            int_correct = pred_int == expected_int

            status = "OK" if (sev_correct and int_correct) else "MISS"
            print(f"      [{idx:>2}/{len(SEVERITY_DATASET)}] {status} | Sev: {expected_sev}->{pred_sev} | Int: {expected_int}->{pred_int} | {result['latency_ms']:.0f}ms")

            sev_details.append({
                "text": text,
                "expected_severity": expected_sev,
                "predicted_severity": pred_sev,
                "severity_correct": sev_correct,
                "severity_confidence": result["severity_confidence"],
                "severity_probabilities": result["severity_probabilities"],
                "expected_intent": expected_int,
                "predicted_intent": pred_int,
                "intent_correct": int_correct,
                "intent_confidence": result["intent_confidence"],
                "latency_ms": result["latency_ms"],
            })

        except Exception as e:
            logger.error(f"Error on sample {idx}: {e}")
            sev_true.append(expected_sev)
            sev_pred.append("ERROR")
            int_true.append(expected_int)
            int_pred.append("ERROR")
            sev_details.append({
                "text": text,
                "expected_severity": expected_sev,
                "predicted_severity": "ERROR",
                "severity_correct": False,
                "expected_intent": expected_int,
                "predicted_intent": "ERROR",
                "intent_correct": False,
                "error": str(e),
            })

    # ── Phase 2: Department Classification ────────────────────────────────
    print(f"\n[2/3] Running department classification...")
    print(f"      Dataset: {len(DEPARTMENT_DATASET)} samples")

    dept_true, dept_pred = [], []
    dept_details = []
    dept_confidences = []
    dept_latencies = []

    for idx, (text, expected_dept) in enumerate(DEPARTMENT_DATASET, 1):
        try:
            result = classify_department(text)
            pred_dept = result["department"]

            dept_true.append(expected_dept)
            dept_pred.append(pred_dept)

            dept_confidences.append(result["department_confidence"])
            dept_latencies.append(result["latency_ms"])

            correct = pred_dept == expected_dept
            status = "OK" if correct else "MISS"
            print(f"      [{idx:>2}/{len(DEPARTMENT_DATASET)}] {status} | Exp: {expected_dept:<10} -> Pred: {pred_dept:<10} | Conf: {result['department_confidence']:.3f} | {result['latency_ms']:.0f}ms")

            dept_details.append({
                "text": text,
                "expected_department": expected_dept,
                "predicted_department": pred_dept,
                "correct": correct,
                "confidence": result["department_confidence"],
                "probabilities": result["department_probabilities"],
                "latency_ms": result["latency_ms"],
            })

        except Exception as e:
            logger.error(f"Error on sample {idx}: {e}")
            dept_true.append(expected_dept)
            dept_pred.append("ERROR")
            dept_details.append({
                "text": text,
                "expected_department": expected_dept,
                "predicted_department": "ERROR",
                "correct": False,
                "error": str(e),
            })

    # ── Phase 3: Compute Metrics & Report ─────────────────────────────────
    print(f"\n[3/3] Computing metrics and generating report...\n")

    sev_metrics = compute_metrics(sev_true, sev_pred, SEVERITY_LABELS)
    int_metrics = compute_metrics(int_true, int_pred, INTENT_LABELS)
    dept_metrics = compute_metrics(dept_true, dept_pred, DEPARTMENT_LABELS)

    # Latency stats
    all_latencies = sev_latencies + dept_latencies
    latency_stats = {
        "severity_median_ms": round(float(np.median(sev_latencies)), 2) if sev_latencies else 0,
        "severity_p95_ms": round(float(np.percentile(sev_latencies, 95)), 2) if sev_latencies else 0,
        "department_median_ms": round(float(np.median(dept_latencies)), 2) if dept_latencies else 0,
        "department_p95_ms": round(float(np.percentile(dept_latencies, 95)), 2) if dept_latencies else 0,
        "overall_median_ms": round(float(np.median(all_latencies)), 2) if all_latencies else 0,
        "overall_p95_ms": round(float(np.percentile(all_latencies, 95)), 2) if all_latencies else 0,
    }

    # Confidence stats
    confidence_stats = {
        "severity_mean_confidence": round(float(np.mean(sev_confidences)), 4) if sev_confidences else 0,
        "intent_mean_confidence": round(float(np.mean(int_confidences)), 4) if int_confidences else 0,
        "department_mean_confidence": round(float(np.mean(dept_confidences)), 4) if dept_confidences else 0,
    }

    # ── Print Results ─────────────────────────────────────────────────────
    print("=" * 70)
    print("  LAYA CLASSIFICATION RESULTS")
    print("=" * 70)

    # Severity
    print(f"\n  SEVERITY CLASSIFICATION ({len(SEVERITY_DATASET)} samples)")
    print(f"  Accuracy:  {sev_metrics['accuracy']:.2%}")
    print(f"  Precision: {sev_metrics['precision']:.2%}")
    print(f"  Recall:    {sev_metrics['recall']:.2%}")
    print(f"  F1 Score:  {sev_metrics['f1']:.2%}")
    print(f"  Mean Confidence: {confidence_stats['severity_mean_confidence']:.4f}")
    print(f"\n  Per-class breakdown:")
    for label, stats in sev_metrics["per_class"].items():
        print(f"    {label:<8} P={stats['precision']:.3f}  R={stats['recall']:.3f}  F1={stats['f1-score']:.3f}  (n={stats['support']})")
    print(f"\n  Confusion Matrix (rows=actual, cols=predicted):")
    print(format_confusion_matrix(sev_metrics["confusion_matrix"], SEVERITY_LABELS))

    # Comparison
    print(f"\n  SEVERITY: Laya vs LLM Comparison")
    print(format_comparison("Severity", sev_metrics, LLM_BASELINES["severity"]))

    # Intent
    print(f"\n  {'─' * 66}")
    print(f"\n  INTENT CLASSIFICATION ({len(SEVERITY_DATASET)} samples)")
    print(f"  Accuracy:  {int_metrics['accuracy']:.2%}")
    print(f"  Precision: {int_metrics['precision']:.2%}")
    print(f"  Recall:    {int_metrics['recall']:.2%}")
    print(f"  F1 Score:  {int_metrics['f1']:.2%}")
    print(f"  Mean Confidence: {confidence_stats['intent_mean_confidence']:.4f}")
    print(f"\n  Per-class breakdown:")
    for label, stats in int_metrics["per_class"].items():
        print(f"    {label:<12} P={stats['precision']:.3f}  R={stats['recall']:.3f}  F1={stats['f1-score']:.3f}  (n={stats['support']})")

    print(f"\n  INTENT: Laya vs LLM Comparison")
    print(format_comparison("Intent", int_metrics, LLM_BASELINES["intent"]))

    # Department
    print(f"\n  {'─' * 66}")
    print(f"\n  DEPARTMENT CLASSIFICATION ({len(DEPARTMENT_DATASET)} samples)")
    print(f"  Accuracy:  {dept_metrics['accuracy']:.2%}")
    print(f"  Precision: {dept_metrics['precision']:.2%}")
    print(f"  Recall:    {dept_metrics['recall']:.2%}")
    print(f"  F1 Score:  {dept_metrics['f1']:.2%}")
    print(f"  Mean Confidence: {confidence_stats['department_mean_confidence']:.4f}")
    print(f"\n  Per-class breakdown:")
    for label, stats in dept_metrics["per_class"].items():
        print(f"    {label:<12} P={stats['precision']:.3f}  R={stats['recall']:.3f}  F1={stats['f1-score']:.3f}  (n={stats['support']})")
    print(f"\n  Confusion Matrix (rows=actual, cols=predicted):")
    print(format_confusion_matrix(dept_metrics["confusion_matrix"], DEPARTMENT_LABELS))

    print(f"\n  DEPARTMENT: Laya vs LLM Comparison")
    print(format_comparison("Department", dept_metrics, LLM_BASELINES["department"]))

    # Latency
    print(f"\n  {'─' * 66}")
    print(f"\n  LATENCY STATS")
    print(f"  Severity  — Median: {latency_stats['severity_median_ms']:.1f}ms  |  P95: {latency_stats['severity_p95_ms']:.1f}ms")
    print(f"  Department — Median: {latency_stats['department_median_ms']:.1f}ms  |  P95: {latency_stats['department_p95_ms']:.1f}ms")
    print(f"  Overall   — Median: {latency_stats['overall_median_ms']:.1f}ms  |  P95: {latency_stats['overall_p95_ms']:.1f}ms")

    print("\n" + "=" * 70)

    # ── Save JSON Report ──────────────────────────────────────────────────
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": "Laya (convaiinnovations/laya, ModernBERT-large, local)",
        "severity": sev_metrics,
        "intent": int_metrics,
        "department": dept_metrics,
        "confidence_stats": confidence_stats,
        "latency_stats": latency_stats,
        "llm_baselines": LLM_BASELINES,
        "comparison": {
            "severity_delta": {
                k: round(sev_metrics[k] - LLM_BASELINES["severity"][k], 4)
                for k in ["accuracy", "precision", "recall", "f1"]
            },
            "intent_delta": {
                k: round(int_metrics[k] - LLM_BASELINES["intent"][k], 4)
                for k in ["accuracy", "precision", "recall", "f1"]
            },
            "department_delta": {
                k: round(dept_metrics[k] - LLM_BASELINES["department"][k], 4)
                for k in ["accuracy", "precision", "recall", "f1"]
            },
        },
        "severity_details": sev_details,
        "department_details": dept_details,
    }

    report_dir = os.path.join(PROJECT_ROOT, "results")
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, "laya_classification_report.json")

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=4, ensure_ascii=False, default=str)

    print(f"\n  Report saved to: results/laya_classification_report.json")
    print("=" * 70)

    return report


if __name__ == "__main__":
    run_evaluation()
