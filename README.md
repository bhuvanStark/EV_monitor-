# VoltSense Edge — EV Battery Intelligence Suite

VoltSense Edge is a real-time battery diagnostics and classification system. It parses telemetry metrics (`voltage`, `current`, `temp`, `gyro`) from an EV battery pack via an MQTT subscriber, runs real-time classification using an on-device Decision Tree model, and writes diagnostics state to Firebase Firestore. The frontend dashboard connects to Firestore in real-time, rendering active metrics, charts, and actionable safety insights.

---

## 📂 Directory Structure

```
VoltSense-Edge/
│
├── ml/
│   ├── generate_synthetic_data.py (Generates CSV telemetry data)
│   ├── train_model.py             (Trains Decision Tree, saves .pkl, .tflite, and .json)
│   ├── battery_model.pkl          (Scikit-learn model export)
│   ├── battery_model.tflite        (TF Lite model export)
│   ├── battery_model.json         (JSON tree representation for Node.js backend)
│   └── labels.txt                 (Class labels: Healthy, Stress, Risk)
│
├── backend/
│   ├── server.js                  (Express server hosting static dashboard & telemetry API)
│   ├── mqttSubscriber.js          (MQTT client parser & database writer)
│   ├── firebaseConfig.js          (Firebase Node Admin SDK loader with local DB fallback)
│   ├── firestoreService.js        (Abstracts database queries and logs)
│   ├── package.json               (Backend Node dependency configuration)
│   └── .env                       (MQTT and Firebase connection credentials)
│
└── frontend/
    ├── index.html                 (Landing Entry Page)
    ├── dashboard.html             (Instrument-cluster UI dashboard)
    ├── css/
    │   └── styles.css             (Custom UI styling)
    └── js/
        ├── firebase.js            (Configures Firestore listeners)
        ├── dashboard.js           (Drives UI telemetry mapping and modal inputs)
        ├── charts.js              (Manages rolling Chart.js data logs)
        └── insights.js            (Resolves recommendation advice based on states)
```

---

## ⚡ Setup & Execution

### 1. Train the ML Classifier
Create a Python virtual environment and run the training scripts to output classification weights:

```bash
# Navigate to ML directory
cd ml

# Create virtual environment (if not already created)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install scikit-learn pandas numpy

# Generate synthetic data & train the model
python generate_synthetic_data.py
python train_model.py
```

### 2. Configure Backend Credentials
Rename the environment variables file and fill in your MQTT broker and Firebase service account path details:

```bash
# Navigate to Backend
cd ../backend

# Setup environment configuration
cp .env.example .env
```

Open `.env` and fill in:
* `MQTT_BROKER_URL`: Connection string (e.g. `mqtt://broker.hivemq.com` or HiveMQ Cloud host)
* `MQTT_PORT`: Connection port (typically `1883` or `8883`)
* `FIREBASE_SERVICE_ACCOUNT_PATH`: Path to your Firebase service account JSON key file.
* `USE_SIMULATION`: Set to `true` to run a mock local telemetry publisher and mock local database (`local_db.json`) if you do not have MQTT brokers/Firebase credentials ready yet.

### 3. Run the Node.js Backend & Subscriber
Install backend Node packages and start the subscriber client and server:

```bash
# Install NPM packages
npm install

# Start MQTT subscriber (runs in background, listening and saving data)
npm run subscriber

# In a separate terminal shell, start the Express dashboard web server:
npm run start
```

### 4. Access the Dashboard UI
1. Open your browser and head to: **`http://localhost:3000`**
2. Click **Enter Dashboard**.
3. **Firestore Live Connection Setup**:
   * Click the **Settings Gear Icon** in the top right of the dashboard.
   * Paste your Firebase Client Web SDK configuration credentials:
     ```json
     {
       "apiKey": "YOUR_API_KEY",
       "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",
       "projectId": "YOUR_PROJECT_ID",
       "storageBucket": "YOUR_PROJECT_ID.appspot.com",
       "messagingSenderId": "YOUR_SENDER_ID",
       "appId": "YOUR_APP_ID"
     }
     ```
   * Click **Save Config & Reload**.
   * The dashboard will now automatically initialize the Firebase client and listen to Firestore collections `battery_data` and `battery_history` in real-time! If left empty, it safely falls back to local server REST API pooling.
