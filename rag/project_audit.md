# Technical Audit: Puravankara Grievance Redressal Mechanism (GRM)

This document provides an exhaustive technical dissection of the Puravankara GRM project, an AI-powered enterprise solution for grievance management.

---

## 1. 📁 COMPLETE PROJECT STRUCTURE

The repository is organized into a modular, service-oriented architecture separating the frontend, backend, and specialized AI agents.

### Root Directory
- `agents/`: Contains the specialized ML models and logic for classification, severity, and escalation.
- `backend/`: FastAPI server, database scripts, routes, and utility functions.
- `frontend/`: React application (Vite-based) with the user and admin interfaces.
- `rag/`: The Retrieval-Augmented Generation pipeline including vector storage and document processing.
- `severity_model/` & `agents/classification/model/`: Serialized model weights (Safetensors) and configs.
- `requirements.txt`: Unified Python dependencies.

---

## 2. ⚙️ BACKEND INFRASTRUCTURE (FastAPI)

### API Architecture
The backend is built with **FastAPI**, chosen for its high performance and native support for asynchronous operations, which is critical for handling LLM and ML model inference.

### Key Endpoints
- **`/api/agents/chat`**: The main RAG interface. Normalizes user input to English, performs vector retrieval, and generates a context-aware response.
- **`/submit-complaint`**: The entry point for the grievance pipeline. Triggers classification, severity assessment, database persistence, and escalation.
- **`/api/agents/transcribe`**: Accepts audio files (WebM) and uses the Groq/Whisper API for high-speed, high-accuracy speech-to-text.
- **`/api/admin/*`**: A suite of analytics endpoints (`/trends`, `/metrics`, `/insights`) that interface with Supabase RPCs.
- **`/api/agents/warmup`**: Proactively initializes heavy models in memory to eliminate "cold start" latency.

### Middleware & Security
- **CORS**: Configured to allow specific origins (localhost:5173).
- **Global Error Handling**: Try-except blocks wrap all agent calls, returning standard HTTP error codes.

---

## 3. 🧠 ML PIPELINE (CORE)

The system uses a **Multi-Agent Orchestration** approach where specialized models handle different parts of the triage process.

### A. Complaint Classification Agent
- **Model**: **DistilBERT-base-uncased** (fine-tuned).
- **Labels**: HR, POSH, Child Labour, Safety, Compliance, Other.
- **Methodology**: Uses `AutoModelForSequenceClassification` with a custom label mapping.
- **Training**: Trained on a balanced dataset generated via templates (`generate_data.py`), reaching high accuracy (target >95%) due to the distinct nature of workplace grievance categories.

### B. Severity Prediction Agent
- **Architecture**: DistilBERT-base-uncased with additional dropout layers (0.3) to prevent overfitting on shorter text inputs.
- **Levels**: Low, Medium, High, Critical, Policy.
- **Hybrid Logic**: Implements `check_critical` (rule-based override) to catch high-risk words (e.g., "death", "child") before falling back to the ML model.
- **Dataset**: Expanded to 2000 samples per class using data augmentation (`expand_dataset.py`) to ensure robustness across different phrasings.

### C. Escalation Agent
- **Logic**: A non-blocking service that interprets the output of the classification and severity agents.
- **Automation Flow**:
  1. **Low/Medium**: Logged to DB only.
  2. **High**: Email notification dispatched to the specific Department Admin fetched from `users` table.
  3. **Critical**: Immediate **Email + SMS** (via Twilio) dispatched to Department Admin + Compliance fallback.
- **Notifier Service**: Decoupled SMTP and Twilio logic with simulation modes for development safety.

---

## 4. 🔍 RAG PIPELINE

The RAG system enables the chatbot to provide answers grounded in official company policy documents.

### Data Flow
`User Query → Translation (to EN) → HuggingFace Embedding (all-MiniLM-L6-v2) → Chroma DB Retrieval (Top-k) → Prompt Injection → Groq Llama-3.1-8b-instant → Translation (to Target) → Response`

### Technical Implementation
- **Vector DB**: **Chroma** (persistent).
- **Chunking Strategy**: `RecursiveCharacterTextSplitter` with `chunk_size=500` and `overlap=100` to preserve context across boundaries.
- **Similarity Search**: Uses L2 distance with a strict threshold (0.9) to filter out "hallucinated" or irrelevant documents.
- **Memory**: The system maintains a `chat_history` for multi-turn conversations and rephrases vague follow-ups (e.g., "tell me more") into specific queries.

---

## 5. 🗄️ DATABASE DESIGN

The system uses **Supabase (PostgreSQL)** for persistence.

### Schema Design
- **`users`**: Stores user profiles, roles (admin/user), and department assignments for escalation routing.
- **`grievances`**: The core table. Includes columns for `category`, `severity`, `status`, and rich metadata (location, incident date, anonymity flag).
- **Analytics RPCs**: Custom PL/pgSQL functions (`get_admin_trends`, `get_admin_metrics`) perform heavy aggregation on the server side to minimize data transfer to the frontend.

---

## 6. 🌐 FRONTEND (React)

Built with **React + Vite + Bootstrap**, emphasizing a premium, responsive "Astra" aesthetic.

### Key Components
- **Chatbot UI**: A floating assistant panel with support for suggested prompts, markdown rendering, and source citations.
- **Lodge System**: Multi-step forms tailored for **Internal**, **Contract**, and **External** stakeholders. Features real-time intent detection—if a user types a question in the complaint form, it redirects them to the chatbot.
- **Admin Dashboard**: A secure management console.
  - **Real-time Updates**: Uses Supabase Postgres Changes (WebSockets) to reflect new complaints instantly.
  - **Analytics**: High-impact charts using **Recharts** to visualize volume trends and resolution KPIs.

---

## 7. 🌍 MULTILINGUAL SYSTEM

- **Mechanism**: Hybrid approach.
  - **Static UI**: JSON-based translation files (`translations.js`) for instant local switching.
  - **Dynamic Content**: Backend integration with `deep-translator`.
- **Normalization**: Every non-English query is translated to English before processing by ML models or RAG to ensure maximum accuracy (since models are trained on English).

---

## 8. 🎤 VOICE-BASED INPUT SYSTEM

The system implements a sophisticated **Groq-Whisper** backend for voice.
1. **Frontend**: Uses `MediaRecorder` API to capture high-quality audio in WebM format.
2. **Transfer**: Audio is sent as `multipart/form-data` to the `/api/agents/transcribe` endpoint.
3. **Transcription**: The backend proxies the request to Groq's Whisper-v3 model, returning the transcript in milliseconds.

---

## 9. 🔄 END-TO-END SYSTEM FLOW (Complaint Flow)
1. **User** submits a complaint in Hindi.
2. **Frontend** sends it to the backend.
3. **Backend Translator** converts it to English.
4. **Classification Agent** labels it as "Safety".
5. **Severity Agent** labels it as "Critical".
6. **Escalation Agent** identifies the "Safety Admin" from the DB.
7. **Notifier** sends an SMS alert to the admin.
8. **DB** persists the record.
9. **Frontend** displays the Tracking ID to the user.

---

## 10. 🚀 SCALABILITY & ARCHITECTURE REVIEW

- **Current Bottlenecks**: Python's Global Interpreter Lock (GIL) can affect model inference under high load.
- **Improvements**:
  - **Asynchronous Processing**: Already implemented for notifications to prevent blocking API responses.
  - **Model Quantization**: Using `fp16` in training/inference helps memory usage.
  - **Caching**: The RAG system uses in-memory warming, but could benefit from Redis for cross-instance sharing.

---

## 11. 🧠 DESIGN DECISIONS & JUSTIFICATION

- **Why DistilBERT?**: Chosen over full BERT/RoBERTa because it provides 97% of the performance with 40% less memory and significantly faster inference time.
- **Why Groq?**: The extremely low latency of Groq (LPU) makes the chatbot feel interactive rather than sluggish.
- **Why Chroma?**: Lightweight, disk-persistent, and integrates perfectly with LangChain for rapid iteration on policy documents.
