"""
Purva embedding service — runs all-MiniLM-L6-v2 on a free Hugging Face
Gradio Space (ZeroGPU hardware) so the Render backend can do meaning-based
policy search without PyTorch.

Exposed as the Gradio API endpoint "embed": (texts, key) -> vectors.
The backend calls it over HTTP (see SpaceEmbeddings in rag/query_data.py);
the page itself is only a status screen.
"""

import hmac
import os

# ZeroGPU requires `spaces` to be imported before torch
try:
    import spaces
    gpu = spaces.GPU(duration=10)
except ImportError:  # running outside Hugging Face (local testing)
    def gpu(fn):
        return fn

import gradio as gr
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_KEY = os.environ.get("EMBED_KEY", "")
MAX_TEXTS = 64

# On ZeroGPU, "cuda" here is attached on demand inside @gpu functions
try:
    model = SentenceTransformer(MODEL_NAME, device="cuda")
except Exception:
    model = SentenceTransformer(MODEL_NAME, device="cpu")


@gpu
def _encode(texts: list[str]) -> list[list[float]]:
    # Same call the local index was built with (HuggingFaceEmbeddings -> encode),
    # so vectors match rag/chroma_final.
    return model.encode(texts, convert_to_numpy=True).tolist()


def embed(texts: list[str], key: str) -> list[list[float]]:
    # Check the key before _encode so bad requests don't spend GPU quota
    if not EMBED_KEY or not hmac.compare_digest(key or "", EMBED_KEY):
        raise gr.Error("Invalid or missing API key")
    if not texts or len(texts) > MAX_TEXTS:
        raise gr.Error(f"Send between 1 and {MAX_TEXTS} texts")
    return _encode(texts)


with gr.Blocks(title="Purva Embed") as demo:
    gr.Markdown(
        f"## Purva embedding service\n"
        f"Model: `{MODEL_NAME}` · Key configured: "
        f"{'yes' if EMBED_KEY else '**no — set the EMBED_KEY secret**'}\n\n"
        f"The GRM backend calls the `embed` API endpoint."
    )
    gr.api(embed, api_name="embed")

if __name__ == "__main__":
    demo.launch()
