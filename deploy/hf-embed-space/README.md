---
title: Purva Embed
emoji: 🔎
colorFrom: indigo
colorTo: red
sdk: gradio
sdk_version: 6.28.0
app_file: app.py
pinned: false
---

# Purva embedding service

Runs `sentence-transformers/all-MiniLM-L6-v2` for the Puravankara GRM backend's
policy search. It is the same model `rag/chroma_final` was built with, so the
vectors are compatible.

Runs on **ZeroGPU** hardware (the free option for Gradio Spaces). The GPU is
borrowed per call, so the backend sends its `HF_TOKEN` to have that time count
against the account's ZeroGPU quota rather than the small anonymous one.

The backend calls the Gradio API endpoint `embed` with `(texts, key)`:
`POST /gradio_api/call/embed` with `{"data": [["..."], "<EMBED_KEY>"]}`, then
`GET /gradio_api/call/embed/<event_id>` for the vectors.

Set the `EMBED_KEY` secret in the Space settings, and the same value plus
`EMBED_URL` (this Space's `https://<owner>-<space>.hf.space` URL) on each Render
backend.
