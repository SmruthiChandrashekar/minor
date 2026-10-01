# evaluate_ragas.py — Automated Ragas Evaluation Suite for Policy RAG Pipeline

import os
import sys
import json
import time
import warnings
import argparse
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

# Suppress known deprecation noise for clean output
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# Configure standard output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Load project environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
ENV_PATH = os.path.join(PROJECT_ROOT, "backend", ".env")
load_dotenv(ENV_PATH)

# LangChain 1.4+ compatibility shim for ragas
import types
if "langchain_community.chat_models.vertexai" not in sys.modules:
    _m = types.ModuleType("langchain_community.chat_models.vertexai")
    _m.ChatVertexAI = None
    sys.modules["langchain_community.chat_models.vertexai"] = _m

# Ragas and LangChain Imports
from ragas.llms import llm_factory
from ragas.run_config import RunConfig
from langchain_community.embeddings import HuggingFaceEmbeddings
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas import evaluate
from ragas.dataset_schema import SingleTurnSample, EvaluationDataset

# Import Ragas Metrics (instantiated metric singletons)
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_recall,
    context_precision,
    answer_correctness,
)

# Import RAG pipeline functions
sys.path.insert(0, BASE_DIR)
import query_data

# Curated evaluation benchmark — 6 representative Puravankara policy questions
EVAL_BENCHMARK = [
    {
        "question": "What is the maximum Earned Leave accumulation allowed?",
        "reference": "Employees are allowed to accumulate Earned Leave (EL) up to a maximum of 60 days. Any accrued leave beyond this limit will automatically lapse at the end of the calendar year."
    },
    {
        "question": "What is the purpose of the POSH policy and how are complaints protected?",
        "reference": "The purpose of the POSH policy is to prevent and prohibit sexual harassment at the workplace and provide a safe and respectful working environment. Complaints are handled confidentially by the Internal Committee (IC), and the identity and contact details of the complainant, victim, or witnesses are strictly prohibited from being disclosed or published to the public or press."
    },
    {
        "question": "What is the Maternity Leave entitlement and eligibility for female employees?",
        "reference": "Female employees who have completed at least 80 days of service in the preceding 12 months are eligible for Maternity Leave up to a maximum period of 26 weeks (182 days) based on a medical certificate. Maternity leave must be applied 40 days in advance of the expected date of delivery."
    },
    {
        "question": "What are the official reimbursement rates for local conveyance using personal vehicles?",
        "reference": "As per the Local Conveyance Policy effective 1st November 2023, official travel reimbursement rates are INR 5.50 per km for Two-Wheelers and INR 13.00 per km for Four-Wheelers. Auto or taxi travel is reimbursed at actuals, claimed monthly with HOD approval."
    },
    {
        "question": "What protections exist for employees reporting wrongdoing under the Whistle Blower Policy?",
        "reference": "Employees submitting a Protected Disclosure under the Whistle Blower Policy are guaranteed complete protection against unfair treatment, discrimination, harassment, victimization, retaliation, or threat of termination or disciplinary action."
    },
    {
        "question": "What is Puravankara's policy regarding gifts and bribery?",
        "reference": "Puravankara maintains a strict zero-tolerance policy against bribery and corruption. Employees must not give or receive bribes, inappropriate gifts, hospitality, facilitation payments, or unauthorized contributions for obtaining or retaining business advantages."
    }
]



def run_evaluation(force_provider: str = None):
    print("=" * 70)
    print("🚀 PURAVANKARA POLICY RAG EVALUATION WITH RAGAS")
    print("=" * 70)

    # 1. Warm up policy RAG system
    print("[1/4] Initializing RAG vector store and database...")
    query_data.initialize_rag()
    
    # 2. Run benchmark queries through the RAG pipeline to collect responses & contexts
    print("\n[2/4] Executing benchmark queries and retrieving contexts...")
    samples = []
    
    for idx, item in enumerate(EVAL_BENCHMARK, 1):
        q = item["question"]
        ref = item["reference"]
        
        print(f"      [{idx}/{len(EVAL_BENCHMARK)}] Query: '{q}'")
        
        # Get actual pipeline response
        res = query_data.get_rag_response(q)
        ans = res.get("answer", "")
        
        # Replicate pipeline context retrieval to get raw list of strings for Ragas
        clean_q = query_data.preprocess_query(q)
        raw_results = query_data.db.similarity_search_with_score(clean_q, k=6)
        deduped = query_data.deduplicate_results(raw_results)
        
        # Filter matching exact query threshold rules
        filtered = [doc.page_content for doc, score in deduped if score <= 1.05]
        
        if not filtered:
            filtered = ["No relevant context found in Puravankara policy docs."]
            
        sample = SingleTurnSample(
            user_input=q,
            response=ans,
            retrieved_contexts=filtered,
            reference=ref
        )
        samples.append(sample)

    dataset = EvaluationDataset(samples=samples)

    # 3. Setup Ragas Evaluator LLM and Embeddings wrappers
    print("\n[3/4] Setting up Ragas LLM & Embeddings wrappers...")
    provider = force_provider or os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    if provider == "groq":
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            raise RuntimeError("GROQ_API_KEY environment variable not found.")
        groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        print(f"      Using Groq cloud provider: {groq_model} (fast)")
        groq_client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_api_key,
            timeout=60.0
        )
        evaluator_llm = llm_factory(groq_model, client=groq_client)
    else:
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
        print(f"      Using local Ollama provider: {model} at {base_url}")
        ollama_client = OpenAI(base_url=base_url, api_key="ollama", timeout=300.0)
        evaluator_llm = llm_factory(model, client=ollama_client)

    # Embeddings setup
    raw_embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    evaluator_embeddings = LangchainEmbeddingsWrapper(raw_embeddings)

    # 4. Evaluate using Ragas
    print("\n[4/4] Evaluating with Ragas metric suite...")
    start_eval = time.time()
    
    # Use max_workers=1 to avoid overloading local Ollama concurrency
    run_config = RunConfig(timeout=300, max_workers=1, max_retries=3)

    results = evaluate(
        dataset=dataset,
        metrics=[
            faithfulness,
            answer_relevancy,
            context_recall,
            context_precision,
            answer_correctness,
        ],
        llm=evaluator_llm,
        embeddings=evaluator_embeddings,
        run_config=run_config,
    )
    
    eval_duration = round(time.time() - start_eval, 2)
    print(f"\n[OK] Evaluation completed in {eval_duration} seconds.")
    
    # Convert Ragas EvaluationResult to DataFrame
    df_results = results.to_pandas()
    records = df_results.to_dict(orient="records")

    # Extract aggregated scores safely
    metric_cols = [
        "faithfulness",
        "answer_relevancy",
        "context_precision",
        "context_recall",
        "answer_correctness",
    ]
    aggregated_scores = {}
    for col in metric_cols:
        if col in df_results.columns:
            series = pd.to_numeric(df_results[col], errors="coerce")
            val = series.mean()
            aggregated_scores[col] = round(float(val), 4) if pd.notna(val) else 0.0

    # Calculate Hallucination Rate: 1.0 - Faithfulness
    faith = aggregated_scores.get("faithfulness", 1.0)
    hallucination_rate = round(max(0.0, 1.0 - faith), 4) if faith is not None else 0.0
    aggregated_scores["hallucination_rate"] = hallucination_rate

    # Output metrics summary report matching the Evaluation Framework slide
    print("\n" + "=" * 60)
    print("📊 AGGREGATED RAGAS EVALUATION SCORES SUMMARY")
    print("=" * 60)
    for metric, score in aggregated_scores.items():
        val = f"{round(score * 100, 2)}%" if score is not None else "N/A"
        print(f"  📌 {metric.replace('_', ' ').title():<22}: {val}")
    print("=" * 60)

    # Save detailed JSON report
    report_dir = os.path.join(PROJECT_ROOT, "results")
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, "ragas_evaluation_report.json")
    
    # Clean records for JSON serialization (convert NaN to None)
    clean_records = []
    for r in records:
        clean_r = {}
        for k, v in r.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                clean_r[k] = None
            else:
                clean_r[k] = v
        clean_records.append(clean_r)

    report_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "aggregated_scores": aggregated_scores,
        "eval_duration_seconds": eval_duration,
        "detailed_results": clean_records
    }
    
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=4, ensure_ascii=False)
        
    print(f"\n📂 Saved detailed evaluation report to: results/ragas_evaluation_report.json\n")
    return report_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Ragas Evaluation Suite")
    parser.add_argument("--groq", action="store_true", help="Use Groq cloud API for faster evaluation")
    parser.add_argument("--provider", type=str, default=None, help="LLM provider: 'ollama' or 'groq'")
    args = parser.parse_args()

    provider = "groq" if args.groq else args.provider
    run_evaluation(force_provider=provider)
