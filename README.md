# VoltSense Edge — Fleet Battery Stress Intelligence Platform

VoltSense Edge is an edge-native, real-time **Fleet Battery Stress Intelligence Platform** designed for commercial EV operators (e.g., Swiggy, Zepto, Blinkit, Yulu, and rental scooter fleets). The platform ingests telemetry data from physical hardware nodes (such as ESP32 microcontrollers) via MQTT, applies local Machine Learning Decision Trees and Cloud AI diagnostics, and generates real-time fleet health stats, maintenance queues, and historical trend analyses.

---

## 📂 Project Architecture & Directory Structure

```
VoltSense-Edge/
│
├── ml/
│   ├── generate_synthetic_data.py (Generates CSV telemetry data)
│   ├── train_model.py             (Trains Decision Tree, saves battery_model.json)
│   ├── battery_model.json         (JSON tree representation for Node.js backend)
│   └── labels.txt                 (Class labels: Healthy, Stress, Risk)
│
├── backend/
│   ├── server.js                  (Express server hosting API endpoints & static dashboard)
│   ├── mqttSubscriber.js          (MQTT subscriber, local/cloud ML diagnostics parser & summary compiler)
│   ├── firebaseConfig.js          (Firebase Web SDK loader with robust mock Firestore fallback)
│   ├── firestoreService.js        (Abstracts database reads/writes for per-vehicle collections)
│   ├── seedFleetData.js           (Seeding script populating all 5 vehicle profiles)
│   ├── package.json               (Backend Node dependency configuration)
│   └── .env                       (MQTT and Firebase configuration settings)
│
└── frontend/
    ├── index.html                 (Landing Entry Page)
    ├── fleet.html                 (Fleet Command Center Dashboard - Landing Page)
    ├── dashboard.html             (Instrument-cluster UI dashboard for Lab Prototype)
    ├── analytics.html             (Per-Vehicle diagnostics intelligence reports page)
    ├── css/
    │   └── styles.css             (Custom UI styling theme)
    └── js/
        ├── firebase.js            (Configures Firestore listeners)
        ├── dashboard.js           (Drives UI telemetry mapping and modal inputs)
        ├── analytics.js           (Powers Chart.js trend lines and query parameter routing)
        ├── charts.js              (Manages rolling Chart.js data logs)
        └── insights.js            (Resolves recommendation advice based on states)
```

---

## 🚙 Operational Fleet Scenarios Seeded

The platform tracks exactly 5 vehicle slots representing distinct real-world operational scenarios:
1. **Vehicle 01 (VoltSense Prototype - LIVE):** Feeds directly from the physical hardware (or offline simulator) via MQTT, rendering real-time telemetry updates and Today's Live Summary (ride duration, average load, peak temp, and live safety recommendations).
2. **Vehicle 02 (Delivery Rider - ACTIVE):** Simulates aggressive delivery logistics cycles with high current draw loads and high chassis vibrations.
3. **Vehicle 03 (Campus Shuttle - ACTIVE):** Represents smooth transit with low battery load and stable temperature ranges.
4. **Vehicle 04 (Warehouse Forklift - ACTIVE):** Operates under high ambient temperatures, triggering repeated thermal stress warnings.
5. **Vehicle 05 (Rental Scooter - ACTIVE):** Models a mixed ride-share scooter suffering frequent chassis vibration anomalies.

---

## ⚡ Quick Start & Setup

### 1. Install Node Dependencies
Navigate into the backend directory and install package requirements:
```bash
cd backend
npm install
```

### 2. Configure Environment Settings
Create a configuration file from the template:
```bash
cp .env.example .env
```
Open `.env` and configure:
* `MQTT_BROKER_URL`: Address of the broker (default: `mqtt://broker.hivemq.com`).
* `GEMINI_API_KEY`: API Key for advanced Cloud Diagnostics inferences.
* `USE_SIMULATION`: Set to `true` to run a mock local telemetry publisher and mock local database (`local_db.json`) if running offline without Firestore.

### 3. Seed Fleet Scenario Profiles
Initialize the database with 14 days of realistic, chronological historical data (~300 records per vehicle):
```bash
node seedFleetData.js
```

### 4. Run the Backend Platform
Start the MQTT Subscriber (ingesting telemetry and generating daily live statistics) and the Express web server:
```bash
# Terminal 1: Run MQTT subscriber
npm run subscriber

# Terminal 2: Run backend server
npm run start
```

### 5. Access the Platform
1. Open your browser and navigate to: **`http://localhost:3000`**
2. You will land on the **Fleet Command Center** (`fleet.html`), displaying summary cards (Healthy, Stressed, Risk counts, and the Fleet Stress Index), the 5 vehicle status cards, the maintenance queue, and the fleet rankings.
3. Click **View Analytics Report** on any vehicle card to load its detailed per-vehicle diagnostics report (`analytics.html?vehicle=vehicleXX`).
4. Click **Prototype Lab** or **Live Dashboard** in the navigation bar to inspect real-time raw instrument telemetry for the physical prototype.
