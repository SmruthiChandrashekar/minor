# ⚡ EV Charging Station Digital Twin

> An AI-powered digital twin system for EV charging stations that predicts energy demand, simulates station congestion, optimizes charger allocation, and provides real-time operational recommendations.

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.21-FF6F00?logo=tensorflow&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![SimPy](https://img.shields.io/badge/SimPy-4.1-yellow)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Overview

This project implements a **Digital Twin** of an EV charging station that:

1. **Predicts** energy demand for the next 4-hour slot using a hybrid LSTM + CatBoost model
2. **Simulates** vehicle arrivals and queue behavior using SimPy
3. **Models** electrical grid load using ACN-Sim (Caltech)
4. **Optimizes** charger configuration (fast vs slow) to minimize wait times and grid stress
5. **Recommends** dynamic pricing and load balancing actions in real time

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│              Real-time Dashboard + Load Profile Chart            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (REST API)
┌──────────────────────────▼──────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│         /predict    /weather    /add-real-data                   │
└────┬──────────┬──────────┬──────────┬───────────────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│Supabase │ │Weather │ │  ML    │ │  Simulation  │
│  (DB)   │ │  API   │ │Engine  │ │   Engine     │
│         │ │Open-   │ │LSTM +  │ │SimPy + ACN   │
│PostgreSQL│ │Meteo   │ │CatBoost│ │              │
└─────────┘ └────────┘ └───┬────┘ └──────┬───────┘
                            │             │
                            ▼             ▼
                    ┌──────────────────────────┐
                    │   Optimization Engine     │
                    │ + Recommendation Engine   │
                    └──────────────────────────┘
```

---

## 🔬 How It Works

### 1. Demand Prediction (Hybrid ML)

The system predicts energy demand for the **next 4-hour time slot** using a two-stage hybrid model:

| Stage | Model | Input | Output |
|-------|-------|-------|--------|
| 1 | **LSTM** (neural network) | Last 12 time steps × 14 features | Preliminary demand estimate |
| 2 | **CatBoost** (gradient boosting) | 14 base features + LSTM output | Final demand prediction (kWh) |

**14 Engineered Features:**

| Category | Features |
|----------|----------|
| Time | `slot`, `slot_sin`, `slot_cos`, `is_weekend` |
| Lag | `prev_slot_demand`, `prev_day_same_slot`, `prev2_slot_demand`, `prev3_slot_demand` |
| Rolling Stats | `rolling_mean_3`, `rolling_mean_6`, `rolling_std_6` |
| Weather | `temp_min`, `temp_max`, `temp_mean` |

- **Cyclic encoding** (`sin`/`cos`) ensures the model knows slot 5 and slot 0 are adjacent (midnight wrap-around)
- **Weather data** is fetched from Open-Meteo API for the **forecasted** hour, not the current hour

### 2. Digital Twin Simulation (SimPy)

Simulates the **physical station** — vehicles arriving, queuing, and charging:

- **Chargers**: Configurable fast (3–7 min) and slow (10–20 min) chargers
- **Vehicle arrivals**: Stochastic inter-arrival times (1–3 min)
- **Metrics**: Average/max wait time, queue length, charger utilization
- **Status**: NORMAL / MODERATE LOAD / HIGH CONGESTION

### 3. Electrical Load Modeling (ACN-Sim)

Simulates the **electrical side** using Caltech's ACN-Sim:

- 5 EVSEs (chargers), each max 32A at 240V
- Building-level constraint: total ≤ 80A
- Outputs: **load profile** (amps per minute), **peak load**, **total energy**
- Uses `UncontrolledCharging` scheduling algorithm

### 4. Charger Optimization

Brute-force search over charger configurations (1–4 fast × 1–4 slow):

```
Score = avg_wait_time + (peak_load × 0.1)
```

Picks the configuration with the **lowest combined score** — balancing customer wait times and grid stress.

### 5. Recommendation Engine

Generates real-time operational recommendations:

| Module | Logic |
|--------|-------|
| **Dynamic Pricing** | Surge (×1.5) when load > 80%, Discount (×0.8) when load < 30% |
| **Load Balancing** | Shift vehicles to nearby stations when load > 85% |
| **Alerts** | Critical overload warning when load > 90% or wait > 20 min |

---

## 🗂️ Project Structure

```
digitwinie/
├── backend/
│   ├── main.py              # FastAPI app — API endpoints
│   ├── db.py                # Supabase database operations
│   ├── weather.py           # Open-Meteo weather API integration
│   ├── scheduler.py         # Background scheduler (runs every slot)
│   └── seed_db.py           # Database initialization script
│
├── src/
│   ├── ml/
│   │   ├── predict.py       # Main prediction pipeline (orchestrator)
│   │   └── preprocess.py    # Feature engineering (14 features)
│   ├── simulation.py        # SimPy digital twin simulation
│   ├── acn_simulator.py     # ACN-Sim electrical load simulation
│   ├── optimization.py      # Charger configuration optimizer
│   └── recommendation/
│       └── engine.py        # Dynamic pricing + load balancing + alerts
│
├── frontend/
│   └── src/
│       ├── App.jsx          # Main React application
│       ├── api.js           # Backend API integration
│       └── components/
│           └── Dashboard.jsx # Real-time telemetry dashboard
│
├── models/
│   ├── lstm_model.h5        # Trained LSTM model
│   ├── hybrid_catboost_model.pkl  # Trained CatBoost model
│   ├── scaler_X.pkl         # Input feature scaler
│   └── scaler_y.pkl         # Output scaler
│
├── data/
│   ├── fallback_dataset.csv # Historical averages for missing slots
│   └── raw/                 # Raw training data
│
└── requirements.txt         # Python dependencies
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, Recharts, Lucide Icons |
| **Backend** | FastAPI, Uvicorn, Pydantic |
| **Database** | Supabase (cloud PostgreSQL) |
| **ML / DL** | TensorFlow/Keras (LSTM), CatBoost, Scikit-learn, NumPy, Pandas |
| **Simulation** | SimPy (queue simulation), ACN-Sim (electrical load modeling) |
| **Weather** | Open-Meteo API (free, no API key required) |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase account (free tier works)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ev-charging-digital-twin.git
cd ev-charging-digital-twin
```

### 2. Backend Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Seed the database (first time only)
python -m backend.seed_db

# Start the FastAPI server
uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

### 3. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite dev server
npm run dev
```

The dashboard will be available at `http://localhost:5173`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/predict` | Runs the full prediction + simulation + optimization pipeline |
| `GET` | `/weather` | Returns current weather forecast for Bangalore |
| `POST` | `/add-real-data` | Submit actual kWh data for the completed slot |

### Example: `/predict` Response

```json
{
  "status": "success",
  "predicted_slot": 3,
  "slot_range": "12:00 - 16:00",
  "demand_kwh": 42.31,
  "vehicles": 6,
  "simulation": {
    "avg_wait_time": 4.5,
    "max_wait_time": 12,
    "utilization_percent": 78.2,
    "status": "MODERATE LOAD"
  },
  "optimization": {
    "fast_chargers": 2,
    "slow_chargers": 3,
    "peak_load": 64.0,
    "load_profile": [32, 64, 80, 64, 32]
  },
  "control": {
    "pricing": { "price_per_kwh": 12.0, "status": "NORMAL" },
    "load_balancing": { "action": "Balanced" },
    "alerts": ["All systems normal"]
  }
}
```

---

## 🔄 Prediction Pipeline Flow

```
System Clock → Current Slot
        │
        ▼
Supabase DB → Last 50 rows ─────────────────┐
        │                                     │
        ▼                                     ▼
Missing Slot Detection                  Feature Engineering
(auto-fill from fallback CSV)           (14 features)
        │                                     │
        ▼                                     ▼
Open-Meteo API → Weather Forecast      LSTM (12 timesteps)
                                              │
                                              ▼
                                        CatBoost (15 features)
                                              │
                                              ▼
                                     Predicted Demand (kWh)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                                 SimPy    ACN-Sim   Optimizer
                                (queues) (grid load) (best config)
                                    │         │         │
                                    └─────────┼─────────┘
                                              ▼
                                    Recommendation Engine
                                    (pricing + alerts)
                                              │
                                              ▼
                                      API Response → Dashboard
```

---

## 📊 Time Slots

The day is divided into 6 slots of 4 hours each:

| Slot | Time Range | Typical Pattern |
|------|-----------|-----------------|
| 0 | 00:00 – 04:00 | Low demand (night) |
| 1 | 04:00 – 08:00 | Rising (early morning) |
| 2 | 08:00 – 12:00 | High (morning commute) |
| 3 | 12:00 – 16:00 | Moderate (afternoon) |
| 4 | 16:00 – 20:00 | High (evening commute) |
| 5 | 20:00 – 00:00 | Declining (night) |

---

## 🛡️ Fallback Mechanism

When real data is missing (operator didn't input actual kWh):

1. System detects missing slots between last DB entry and current slot
2. Reads historical averages from `data/fallback_dataset.csv`
3. Auto-inserts averaged values with `is_real: False` flag
4. Prediction continues with mixed real + synthetic data

---

## 🔮 Future Scope

- **OCPP Integration** — Auto-collect data from real chargers via Open Charge Point Protocol
- **Multi-Station Support** — Scale to city-wide charging networks
- **Battery SoC-Aware Scheduling** — Prioritize vehicles based on battery percentage
- **Time-of-Use Pricing** — Factor in electricity tariff variations
- **Mobile App** — Operator dashboard for on-the-go monitoring

---

## 📄 License

This project is for academic/research purposes.

---

<p align="center">
  Built with ❤️ for smarter EV charging infrastructure
</p>
