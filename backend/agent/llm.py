"""
llm.py — Unified LLM client provider.

Supports switching between:
1. Local Ollama (via OpenAI-compatible API at localhost:11434/v1)
2. Cloud Groq (ultra-fast cloud API)

Configurable via .env:
  LLM_PROVIDER=ollama   # or "groq"
  OLLAMA_BASE_URL=http://localhost:11434/v1
  OLLAMA_MODEL=qwen3.5:4b
  GROQ_MODEL=openai/gpt-oss-120b
"""

import os
import re
import logging
from openai import OpenAI
from groq import Groq

logger = logging.getLogger(__name__)


def get_llm():
    """
    Returns (client, model_name).
    Both OpenAI (for Ollama) and Groq share the exact same .chat.completions.create() syntax.
    """
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()

    if provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        model = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
        # Generous timeout for local CPU/GPU inference
        client = OpenAI(base_url=base_url, api_key="ollama", timeout=120.0)
        return client, model
    else:
        groq_api_key = os.getenv("GROQ_API_KEY")
        model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        client = Groq(api_key=groq_api_key, timeout=30.0)
        return client, model


def extract_response_text(choice_message) -> str:
    """
    Extract clean response text from a message object.
    Handles reasoning models (like Qwen 3.5 / DeepSeek) where thoughts
    might be in a 'reasoning' attribute or wrapped in <think> tags.
    """
    content = getattr(choice_message, "content", "") or ""
    if content.strip():
        cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        if cleaned:
            return cleaned

    # Fallback to reasoning attribute if content is empty (e.g. token-budget boundary)
    reasoning = getattr(choice_message, "reasoning", "") or ""
    if reasoning.strip():
        # Try to extract the final conclusion from reasoning if available
        return reasoning.strip()

    return content
