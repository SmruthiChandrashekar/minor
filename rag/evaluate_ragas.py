# evaluate_ragas.py — Automated Ragas Evaluation Suite for Policy RAG Pipeline

import os
import sys
import json
import time
from dotenv import load_dotenv
from openai import OpenAI

# Configure standard output to handle Unicode characters (emojis) on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Load project environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(os.path.dirname(BASE_DIR), "backend", ".env")
load_dotenv(ENV_PATH)


# Ragas and LangChain Imports
from ragas.llms import llm_factory
from langchain_community.embeddings import HuggingFaceEmbeddings
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas import evaluate
from ragas.dataset_schema import SingleTurnSample, EvaluationDataset

# Import Ragas Metrics
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_recall,
    context_precision,
    answer_correctness
)

# Import RAG pipeline functions
import query_data

# Curated evaluation benchmark — 2 questions x 5 metrics = 10 LLM calls (fast run)
EVAL_BENCHMARK = [
    {
        "question": "What is the maximum Earned Leave accumulation allowed?",
        "reference": "Employees are allowed to accumulate Earned Leave (EL) up to a maximum of 60 days. Any accrued leave beyond this limit will automatically lapse at the end of the calendar year."
    },
    {
        "question": "What is the purpose of the POSH policy?",
        "reference": "The purpose of the POSH policy is to prevent and prohibit sexual harassment at the workplace and provide a safe, secure, and respectful working environment for all employees, visitors, and associates."
    }
]

def run_evaluation():
    print("=" * 70)
    print("🚀 STARTING PURAVANKARA POLICY RAG EVALUATION WITH RAGAS")
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
        ans = res["answer"]
        
        # Replicate pipeline context retrieval to get raw list of strings for Ragas
        clean_q = query_data.preprocess_query(q)
        raw_results = query_data.db.similarity_search_with_score(clean_q, k=6)
        deduped = query_data.deduplicate_results(raw_results)
        
        # Filter matching exact query threshold rules
        filtered = [doc.page_content for doc, score in deduped if score <= 1.05]
        
        # Ragas requires at least one context chunk. Provide fallback if none retrieved
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
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        raise RuntimeError("GROQ_API_KEY environment variable not found.")
        
    groq_client = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=groq_api_key
    )
    
    # Use the official project gpt-oss-120b model for evaluation
    evaluator_llm = llm_factory("openai/gpt-oss-120b", client=groq_client)
    
    # Embeddings setup
    raw_embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    evaluator_embeddings = LangchainEmbeddingsWrapper(raw_embeddings)

    # 4. Evaluate using Ragas
    print("\n[4/4] Evaluating with Ragas metric suite (this may take a minute)...")
    start_eval = time.time()
    
    results = evaluate(
        dataset=dataset,
        metrics=[
            faithfulness,
            answer_relevancy,
            context_recall,
            context_precision,
            answer_correctness
        ],
        llm=evaluator_llm,
        embeddings=evaluator_embeddings
    )
    
    eval_duration = round(time.time() - start_eval, 2)
    print(f"\n✅ Evaluation completed in {eval_duration} seconds.")
    
    # Output metrics summary report
    print("\n" + "=" * 50)
    print("📈 AGGREGATED EVALUATION SCORES SUMMARY")
    print("=" * 50)
    for metric, score in results.items():
        print(f"  📌 {metric.replace('_', ' ').title()}: {round(score * 100, 2)}%")
    print("=" * 50)

    # Save detailed JSON report
    os.makedirs(os.path.join(os.path.dirname(BASE_DIR), "results"), exist_ok=True)
    report_path = os.path.join(os.path.dirname(BASE_DIR), "results", "ragas_evaluation_report.json")
    
    # Convert Ragas results to a pandas dataframe or dict for export
    df_results = results.to_pandas()
    records = df_results.to_dict(orient="records")
    
    report_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "aggregated_scores": {k: round(v, 4) for k, v in results.items()},
        "eval_duration_seconds": eval_duration,
        "detailed_results": records
    }
    
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=4, ensure_ascii=False)
        
    print(f"\n📂 Saved detailed evaluation report to: results/ragas_evaluation_report.json")
    
    # Generate a markdown table summary representation
    md_summary = "\n### Detailed Ragas Evaluation Results\n\n"
    md_summary += "| Query | Faithfulness | Answer Relevancy | Context Recall | Context Precision | Answer Correctness |\n"
    md_summary += "| :--- | :---: | :---: | :---: | :---: | :---: |\n"
    for r in records:
        q_text = r.get("user_input", "")
        # truncate query text if too long for display
        q_disp = q_text if len(q_text) <= 50 else q_text[:47] + "..."
        
        f_score = f"{round(r.get('faithfulness', 0) * 100, 1)}%" if r.get("faithfulness") is not None else "N/A"
        ar_score = f"{round(r.get('answer_relevancy', 0) * 100, 1)}%" if r.get("answer_relevancy") is not None else "N/A"
        cr_score = f"{round(r.get('context_recall', 0) * 100, 1)}%" if r.get("context_recall") is not None else "N/A"
        cp_score = f"{round(r.get('context_precision', 0) * 100, 1)}%" if r.get("context_precision") is not None else "N/A"
        ac_score = f"{round(r.get('answer_correctness', 0) * 100, 1)}%" if r.get("answer_correctness") is not None else "N/A"
        
        md_summary += f"| {q_disp} | {f_score} | {ar_score} | {cr_score} | {cp_score} | {ac_score} |\n"
        
    print(md_summary)

if __name__ == "__main__":
    run_evaluation()
