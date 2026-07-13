# Puravankara Grievance Redressal Mechanism (GRM)

An AI-powered enterprise solution for grievance management, built with a modern web stack and specialized Machine Learning agents for intelligent classification, severity prediction, and automated escalation.

## 🌟 Key Features

- **Multi-Agent AI Triage**: Specialized ML models (DistilBERT) for automated complaint classification (HR, POSH, Safety, etc.) and severity prediction (Low to Critical).
- **Automated Escalation**: Intelligent routing that alerts relevant Department Admins via Email and SMS based on the severity of the issue.
- **RAG-Powered Policy Chatbot**: Built-in AI chatbot capable of answering questions based on official company policies, powered by Llama-3.1 and Chroma DB.
- **Multilingual Support**: Hybrid translation system (static UI + dynamic Deep Translator backend) allowing users to file grievances in multiple languages.
- **Voice-to-Text**: High-accuracy, low-latency audio transcription using Groq/Whisper integration.
- **Admin Dashboard**: Real-time analytics and visualizations powered by Supabase WebSockets and Recharts.

## 🏗️ Architecture

The project is structured into distinct services:
- **`frontend/`**: React application built with Vite and Bootstrap, offering a premium and responsive user experience.
- **`backend/`**: High-performance FastAPI server handling API routes, RAG processing, and asynchronous tasks.
- **`agents/` & `severity_model/`**: Specialized AI models and orchestration logic for classifying intent, predicting severity, and triggering escalations.
- **`rag/`**: Retrieval-Augmented Generation pipeline handling vector storage and contextual policy retrieval.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js (v16 or higher)
- A configured Supabase project
- Relevant API Keys (e.g., Groq API, Twilio, SMTP credentials) configured in `backend/.env`

### 1. Backend Setup (FastAPI & ML Agents)

The backend must be run from the **root** of the project so that all modules (`agents`, `rag`, `backend`) can be correctly discovered by Python.

```bash
# 1. Activate the virtual environment
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Start the backend server from the project root
uvicorn backend.main:app --reload
```
*The backend API will be available at `http://localhost:8000`.*

### 2. Frontend Setup (React/Vite)

Open a new terminal window to start the frontend.

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```
*The web app will be available at `http://localhost:5173`.*

---

## 🔒 Environment Variables

You need an `.env` file located in the `backend/` directory to configure external services. Key variables typically include:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GROQ_API_KEY`
- (And other related SMTP/Twilio variables for the escalation agent)

---

## 🗄️ Database Schema (Supabase)

- **`users`**: Profiles, roles (user/admin), and department assignments.
- **`grievances`**: Core data table storing complaint details, inferred categories, severity levels, and resolution status.
- **RPCs**: Custom Supabase functions handle complex analytics aggregations directly on the Postgres server to optimize performance.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Bootstrap, Recharts
- **Backend**: Python, FastAPI, Supabase (PostgreSQL)
- **Machine Learning**: Transformers (HuggingFace), PyTorch, Chroma DB, Groq API (Llama-3.1, Whisper)
