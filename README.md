# BatteryIQ — EV Two-Wheeler Battery Intelligence Dashboard

**BatteryIQ** is an IoT-based electric vehicle battery intelligence system designed to track, classify, and analyze battery pack diagnostics and health in real time. It features a premium, responsive instrument-cluster themed dashboard designed for two-wheeler EVs. 

The system leverages on-device **TinyML** running on an **ESP32** microcontroller to classify riding behavior patterns, which are mapped directly to battery degradation rates.

---

## 🎨 Design Direction & Interface
The dashboard uses a high-fidelity, premium EV instrument cluster aesthetic:
* **Color Palette**: Dark Navy background (`#0A0F1E`), Card Navy (`#0D1526`), Electric Green accents (`#00E676`), and Teal highlights (`#00E5FF`).
* **Typography**: *Exo 2* for technical headings and instrument displays, *Inter* for readable UI elements.
* **Layout**: Fully responsive grid (1 column on mobile, 2 columns on desktop) with glassmorphism effects, scale hover states, and glowing notification indicators.

---

## 📊 Core Features & Sections

### 1. Header Bar & Device Metadata
* Displays active device identity (`ESP32-NODE-01`), connection status indicator (pulsing green "Live" badge), and live synchronized clock.

### 2. Key Metrics Row
* **Battery SOH**: Color-coded percentage health state indicator (Green >80%, Yellow 60-80%, Red <60%).
* **Cell Voltage**: Real-time voltage shown in Volts (V) complete with a min/max bar slider (3.2V to 4.2V bounds).
* **Pack Temperature**: Temperature in °C mapped to safety levels (Normal / Warning / Critical).
* **Est. Life Remaining**: Remaining battery life in months calculated from the SOH degradation speed.

### 3. TinyML Riding Pattern Classifier
* Displays the active pattern determined by the on-device TinyML model:
  * 🟢 **Smooth Rider**: Minimal wear.
  * 🟡 **Stop-Start Urban**: Moderate congestion-based wear.
  * 🟠 **Overload Carrier**: Elevated payload/incline thermal stress.
  * 🔴 **Aggressive Accelerator**: Severe cell discharge degradation.
* Includes an active glowing border pulse animation matching the pattern's severity, confidence score percentage bar, and a sliding log of the last 10 detected patterns.

### 4. Real-Time Telemetry Streams (Line Charts)
* Features 3 stacked dark-themed line charts powered by **Chart.js** displaying historical trends (last 30 ticks) for:
  * **Cell Voltage (V)**
  * **Current Draw (mA)**
  * **Pack Temperature (°C)**
* Updates synchronously every 3 seconds.

### 5. Battery Degradation Analysis
* **Horizontal Bar Chart**: Compares the degradation rate (SOH drop per 100 cycles) across all 4 riding styles.
* **Financial Risk Calculator**: Highlights active financial loss warning (e.g., *"Aggressive riding costs you ₹18,000 extra battery life per year"*).
* **Habit Recommender**: Provides dynamic actionable instructions matching the current active pattern.

### 6. MQTT Connection Panel
* Tracks subscription metrics on **HiveMQ Cloud WebSocket Broker** across relevant topics (`ev/battery/voltage`, `ev/battery/temp`, `ev/battery/soh`, `ev/battery/pattern`, `ev/battery/prediction`).
* Monospace terminal log tracking incoming JSON messages in real time.

### 7. Active Safety Alerts
* Triggers dismissible alerts based on telemetry thresholds:
  * *Critical Temperature* (>45°C)
  * *Elevated Temperature* (>40°C)
  * *Critical/Warning SOH* (<60% or <80%)
  * *Aggressive Riding Profile* active.
* Automatically reverts to a green **"All Systems Operational"** banner when all alerts are cleared.

---

## ⚙️ Telemetry Simulation Engine
Until the physical ESP32 node is connected, a built-in Javascript simulation drives all telemetry:
* **Voltage**: Oscillates between 3.2V and 4.2V with random load-draw noise.
* **Current Draw**: Varies between 200mA and 2000mA according to active riding dynamics.
* **Temperature**: Oscillates between 25°C and 45°C depending on charge/discharge speed.
* **State-of-Health (SOH)**: Starts at 87% and degrades slowly depending on active model patterns.
* **Aggressive Riding Simulator Button**: Instantly spikes current draw (1800mA–2500mA) and temperature (42°C–52°C) while forcing the pattern to *Aggressive Accelerator* for 10 seconds to demonstrate how the safety system and alert panel respond.
* **Reset Simulation Button**: Flushes history buffers, restores telemetry states to baseline, and resets alerts.

---

## 🔌 System Architecture & Live Deployment

```
ESP32 Telemetry  →   JSON Payload   →  MQTT Broker (HiveMQ)  →  WebSocket Bridge  →  HTML5 Dashboard  →  Chart.js
 (Sensors + ML)     (MQTT Publish)       (Cloud Server)        (Browser Socket)     (Live Parsing)      (Rendering)
```

To swap simulated data with live ESP32 sensors:
1. Add the Eclipse Paho MQTT Javascript library to `index.html`:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js"></script>
   ```
2. Connect to the WebSocket port (usually `8000` or `443` for SSL) of your HiveMQ broker:
   ```javascript
   const client = new Paho.MQTT.Client("your-broker-address.s1.hivemq.cloud", 8884, "web_client_id");
   
   client.connect({
       useSSL: true,
       userName: "your_username",
       password: "your_password",
       onSuccess: () => {
           console.log("Connected!");
           client.subscribe("ev/battery/#");
       }
   });
   ```
3. Parse the message payloads in your callback and pass them to the UI updater elements:
   ```javascript
   client.onMessageArrived = (message) => {
       const data = JSON.parse(message.payloadString);
       if (message.destinationName === "ev/battery/voltage") {
           // Call dashboard updater
           updateVoltage(data.voltage);
       }
   };
   ```

---

## 🚀 How to Run Locally

### Option A: Local View
Simply double-click the `index.html` file to run it in any modern browser (Chrome, Edge, Firefox, Safari).

### Option B: Hosting via GitHub Pages
To host this live on the web:
1. Commit and push this project repository to GitHub.
2. Go to **Settings** > **Pages** inside your GitHub repository.
3. Select the `main` branch as the build source and save.
4. Your dashboard will be live at `https://<your-username>.github.io/<repo-name>/`.
