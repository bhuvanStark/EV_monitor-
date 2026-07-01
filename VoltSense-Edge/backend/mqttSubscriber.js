const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { saveLatestTelemetry, addHistoricalTelemetry } = require('./firestoreService');
const { isMock } = require('./firebaseConfig');

const CLOUD_ML_KEY = process.env.GEMINI_API_KEY || process.env.CLOUD_ML_KEY;

// 1. Load Decision Tree JSON model (as fallback)
const modelPath = path.join(__dirname, '../ml/battery_model.json');
let decisionTree = null;

try {
  if (fs.existsSync(modelPath)) {
    decisionTree = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    console.log('🤖 Machine Learning Decision Tree model loaded successfully.');
  } else {
    console.warn('⚠️ Decision Tree model JSON not found. Running training script is required.');
    console.warn('Backend will use threshold heuristics until model.json is generated.');
  }
} catch (error) {
  console.error('❌ Error reading ML model file:', error.message);
}

// Simple rule-based heuristic fallback if decisionTree model.json is missing
function heuristicInference(voltage, current, temp, gyro) {
  if (temp > 48 || current > 6.0 || voltage < 3.3 || gyro > 120) {
    return 2; // Risk
  }
  if (temp > 38 || current > 3.0 || voltage < 3.6 || gyro > 40) {
    return 1; // Stress
  }
  return 0; // Healthy
}

// Evaluate Decision Tree recursively
function predictTree(node, features) {
  if (!node) return 0;
  if (node.value !== undefined) {
    return node.value;
  }
  
  const val = features[node.feature];
  if (val <= node.threshold) {
    return predictTree(node.left, features);
  } else {
    return predictTree(node.right, features);
  }
}

// Local Decision Tree ML logic
function processML(voltage, current, temp, gyro) {
  let label = 0;
  if (decisionTree) {
    const features = [voltage, current, temp, gyro];
    label = predictTree(decisionTree, features);
  } else {
    label = heuristicInference(voltage, current, temp, gyro);
  }
  
  const statusMap = { 0: 'Healthy', 1: 'Stress', 2: 'Risk' };
  const status = statusMap[label] || 'Healthy';
  
  const tempStress = Math.max(0, Math.min(1, (temp - 25) / (60 - 25)));
  const currentStress = Math.max(0, Math.min(1, current / 10));
  const voltStress = Math.max(0, Math.min(1, (4.2 - voltage) / (4.2 - 2.8)));
  const gyroStress = Math.max(0, Math.min(1, gyro / 250));
  
  const maxFactor = Math.max(tempStress, currentStress, voltStress, gyroStress);
  let stressScore = Math.round(maxFactor * 100);
  
  if (status === 'Risk') {
    stressScore = Math.max(71, stressScore);
  } else if (status === 'Stress') {
    stressScore = Math.max(36, Math.min(70, stressScore));
  } else {
    stressScore = Math.min(35, stressScore);
  }
  
  let insight = 'All systems operational. Riding behavior and pack temperature are optimal.';
  if (status === 'Risk') {
    insight = 'CRITICAL: Multiple telemetry safety boundaries crossed. Inspect EV pack.';
  } else if (status === 'Stress') {
    insight = 'WARNING: Elevated battery stress levels. Adjust riding behavior.';
  }
  
  return { status, stressScore, insight };
}

// 2. Cloud ML Deep Diagnostics Inference Function
async function getCloudMLInference(voltage, current, temp, gyro, telemetry) {
  if (!CLOUD_ML_KEY) return null;

  const promptText = `You are a real-time EV Battery Diagnostics AI.
Analyze the following telemetry:
- Voltage: ${voltage} V
- Current: ${current} A (Absolute magnitude: ${Math.abs(current)} A)
- Temperature: ${temp} °C
- Gyro Norm: ${gyro} dps (derived from raw gyro_x: ${telemetry.gyro_x || 0}, gyro_y: ${telemetry.gyro_y || 0}, gyro_z: ${telemetry.gyro_z || 0})
- Accelerometer raw: X: ${telemetry.accel_x || 0}, Y: ${telemetry.accel_y || 0}, Z: ${telemetry.accel_z || 0}

Sensor Calibration and Defect Context:
1. Voltage is currently reporting exactly 0 V or near 0 V. This means the voltage sensor is disconnected, missing, or uncalibrated. Do NOT treat 0V as a critical empty battery or Risk. Estimate the battery health state based on other functional parameters (temperature and current draw) and mark the voltage sensor as uncalibrated in the insight!
2. Temperature = -127 °C indicates a disconnected temperature sensor (DS18B20 pull-up error). Flag this sensor failure in the insight.
3. Gyroscope norm of 200-350 dps is standard baseline sensor noise for normal riding or EV standby vibrations. Do NOT treat 250 dps as Risk. Only treat norm > 1000 dps as high strain, shock, or crash.
4. Current: If current draw is a constant -12.6A, it is likely a static dummy discharge value.

Classify the state as "Healthy", "Stress", or "Risk".
Estimate a "stressScore" (0-100).
Generate a concise, actionable "insight" (max 2 sentences).

Your response must be a JSON object matching this schema:
{
  "status": "Healthy" | "Stress" | "Risk",
  "stressScore": number,
  "insight": "string advice"
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${CLOUD_ML_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Cloud ML API HTTP Error: ${response.status}`);
    }
    
    const resData = await response.json();
    const textContent = resData.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(textContent.trim());
    return {
      status: parsed.status,
      stressScore: Number(parsed.stressScore),
      insight: parsed.insight
    };
  } catch (error) {
    console.error('⚠️ Cloud ML inference failed:', error.message);
    return null;
  }
}

// 3. Connect to MQTT Broker
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com';
const brokerPort = process.env.MQTT_PORT || 1883;
const topic = process.env.MQTT_TOPIC || 'voltsense/data';

console.log(`📡 Connecting to MQTT Broker at ${brokerUrl}:${brokerPort}...`);

const mqttOptions = {
  port: parseInt(brokerPort),
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: 'voltsense_subscriber_' + Math.random().toString(36).substring(2, 8),
  reconnectPeriod: 5000
};

let mqttClient;

// Throttling Cloud ML calls to 15s to avoid rate-limiting and keep things responsive
let lastCloudMLCallTime = 0;
const CLOUD_ML_COOLDOWN_MS = 15000;
let lastCloudMLResult = null;

try {
  mqttClient = mqtt.connect(brokerUrl, mqttOptions);
  
  mqttClient.on('connect', () => {
    console.log(`🟢 Connected to MQTT Broker. Subscribing to topic: "${topic}"`);
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to topic "${topic}":`, err.message);
      }
    });
  });

  mqttClient.on('message', async (receivedTopic, message) => {
    if (receivedTopic !== topic) return;
    
    try {
      const payloadString = message.toString();
      console.log(`📥 Received Message: Topic [${receivedTopic}] -> ${payloadString}`);
      
      const telemetry = JSON.parse(payloadString);
      
      let voltage = telemetry.voltage;
      let current = telemetry.current;
      let temp = telemetry.temp !== undefined ? telemetry.temp : telemetry.temperature;
      
      let gyro = 0;
      if (telemetry.gyro !== undefined) {
        gyro = telemetry.gyro;
      } else if (telemetry.gyro_x !== undefined && telemetry.gyro_y !== undefined && telemetry.gyro_z !== undefined) {
        const rawNorm = Math.sqrt(
          telemetry.gyro_x * telemetry.gyro_x +
          telemetry.gyro_y * telemetry.gyro_y +
          telemetry.gyro_z * telemetry.gyro_z
        );
        gyro = Math.round(rawNorm);
      }

      if (current !== undefined) {
        current = Math.abs(current);
      }

      if (voltage === undefined || current === undefined || temp === undefined) {
        console.warn('⚠️ Invalid JSON packet payload: Must contain voltage, current, and temp/temperature.');
        return;
      }
      
      const now = Date.now();
      let mlOutputs = null;

      // Rate limit Cloud ML calls to prevent hitting API quotas
      if (CLOUD_ML_KEY && (now - lastCloudMLCallTime >= CLOUD_ML_COOLDOWN_MS)) {
        console.log('🤖 Querying Cloud ML Diagnostics for deep analysis...');
        lastCloudMLCallTime = now;
        
        getCloudMLInference(voltage, current, temp, gyro, telemetry)
          .then(async (mlResult) => {
            if (mlResult) {
              lastCloudMLResult = mlResult;
              console.log('🤖 Cloud ML Diagnostics Update:', mlResult);
              
              // Push the live telemetry + Cloud ML diagnostics update to Firestore immediately
              const fullRecord = {
                voltage: parseFloat(voltage),
                current: parseFloat(current),
                temp: parseFloat(temp),
                gyro: parseFloat(gyro),
                ...mlResult
              };
              await saveLatestTelemetry(fullRecord, 'vehicle01');
              await addHistoricalTelemetry(fullRecord, 'vehicle01');
              
              // Update daily live summary
              updateTodaySummary({ ...fullRecord, timestamp: new Date().toISOString() });
            }
          })
          .catch(err => console.error('Error writing Cloud ML telemetry:', err.message));
      }

      // Read from cached AI diagnosis if available, otherwise run local fast decision tree
      if (lastCloudMLResult) {
        mlOutputs = {
          status: lastCloudMLResult.status,
          stressScore: lastCloudMLResult.stressScore,
          insight: lastCloudMLResult.insight
        };
      } else {
        mlOutputs = processML(
          parseFloat(voltage),
          parseFloat(current),
          parseFloat(temp),
          parseFloat(gyro)
        );
      }
      
      const fullRecord = {
        voltage: parseFloat(voltage),
        current: parseFloat(current),
        temp: parseFloat(temp),
        gyro: parseFloat(gyro),
        ...mlOutputs
      };
      
      await saveLatestTelemetry(fullRecord, 'vehicle01');
      await addHistoricalTelemetry(fullRecord, 'vehicle01');
      
      // Update daily live summary
      updateTodaySummary({ ...fullRecord, timestamp: new Date().toISOString() });
      
    } catch (err) {
      console.error('❌ Error processing received MQTT message:', err.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('❌ MQTT Broker Connection Error:', err.message);
    handleMQTTFailure();
  });

} catch (e) {
  console.error('❌ MQTT initialization failed:', e.message);
  handleMQTTFailure();
}

let simulationInterval = null;
let troubleshootingLogged = false;

function handleMQTTFailure() {
  if (process.env.USE_SIMULATION === 'true' && !simulationInterval) {
    console.warn('⚠️ MQTT Broker unavailable. Initiating simulated data loop...');
    startSimulatedPublisher();
  } else if (process.env.USE_SIMULATION !== 'true' && !troubleshootingLogged) {
    troubleshootingLogged = true;
    console.warn('\n================================================================');
    console.warn('⚠️ MQTT Broker Connection Failed. Troubleshooting checklist:');
    console.warn('1. RUN OFFLINE SIMULATION: Set USE_SIMULATION=true in VoltSense-Edge/backend/.env');
    console.warn('   This runs the pipeline offline without requiring ESP32 hardware or MQTT broker connection.');
    console.warn('2. SWITCH MQTT BROKERS: Your ISP/network might block HiveMQ. In VoltSense-Edge/backend/.env,');
    console.warn('   change MQTT_BROKER_URL to mqtt://broker.emqx.io or mqtt://test.mosquitto.org');
    console.warn('   (Ensure your ESP32 code is updated to match the new broker address).');
    console.warn('3. CHECK DIRECTORY: Ensure you run "npm run subscriber" from VoltSense-Edge/backend directory.');
    console.warn('================================================================\n');
  }
}

if (process.env.USE_SIMULATION === 'true') {
  console.log('💡 Simulation mode is active. Simulated publisher will feed data in background.');
  startSimulatedPublisher();
}

// Local memory to buffer today's live telemetry records for Vehicle 01 summary
const todayLogs = [];

async function updateTodaySummary(record) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  // Clean logs that are not from today
  while (todayLogs.length > 0 && new Date(todayLogs[0].timestamp).getTime() < todayStart) {
    todayLogs.shift();
  }
  
  todayLogs.push(record);
  
  const totalRecords = todayLogs.length;
  let stressEvents = 0;
  let riskEvents = 0;
  let peakTemperature = 0;
  let totalTemp = 0;
  let peakCurrentDraw = 0;
  let totalCurrent = 0;
  
  todayLogs.forEach(log => {
    if (log.status === 'Stress') stressEvents++;
    if (log.status === 'Risk') riskEvents++;
    if (log.temp > peakTemperature) peakTemperature = log.temp;
    totalTemp += log.temp;
    if (log.current > peakCurrentDraw) peakCurrentDraw = log.current;
    totalCurrent += log.current;
  });
  
  const averageTemperature = parseFloat((totalTemp / totalRecords).toFixed(1));
  const averageCurrentDraw = parseFloat((totalCurrent / totalRecords).toFixed(2));
  
  const firstTimestamp = new Date(todayLogs[0].timestamp).getTime();
  const lastTimestamp = new Date(todayLogs[totalRecords - 1].timestamp).getTime();
  const rideDuration = Math.max(1, Math.round((lastTimestamp - firstTimestamp) / 60000));
  
  let recommendation = 'All parameters are optimal. Riding behavior is highly efficient and battery thermals are healthy.';
  if (peakTemperature > 48) {
    recommendation = 'CRITICAL: High battery temperature detected today. Inspect pack thermal pathways immediately.';
  } else if (peakTemperature > 40) {
    recommendation = 'WARNING: Elevated temperature detected. Ride smoothly and avoid heavy load periods.';
  } else if (averageCurrentDraw > 4.5) {
    recommendation = 'WARNING: Aggressive acceleration pattern. Advise rider to smooth out throttle inputs.';
  } else if (stressEvents > 15) {
    recommendation = 'NOTICE: Frequent stress events logged today. Schedule maintenance diagnostics check.';
  }
  
  const summary = {
    totalRecords,
    stressEvents,
    riskEvents,
    peakTemperature: parseFloat(peakTemperature.toFixed(1)),
    averageTemperature,
    peakCurrentDraw: parseFloat(peakCurrentDraw.toFixed(1)),
    averageCurrentDraw,
    rideDuration,
    recommendation,
    lastUpdated: new Date().toISOString()
  };
  
  try {
    const { db } = require('./firebaseConfig');
    await db.collection('vehicle01').doc('summary').set(summary, { merge: true });
    console.log('📈 Updated Today\'s Live Summary for vehicle01:', summary);
  } catch (err) {
    console.error('Error updating live summary:', err.message);
  }
}

function startSimulatedPublisher() {
  if (simulationInterval) return;
  
  simulationInterval = setInterval(async () => {
    const roll = Math.random();
    let voltage, current, temp, gyro;
    
    if (roll < 0.7) {
      voltage = parseFloat((randomFloat(3.7, 4.15)).toFixed(2));
      current = parseFloat((randomFloat(0.5, 2.5)).toFixed(2));
      temp = parseFloat((randomFloat(25.0, 36.0)).toFixed(2));
      gyro = parseFloat((randomFloat(2.0, 35.0)).toFixed(2));
    } else if (roll < 0.9) {
      voltage = parseFloat((randomFloat(3.4, 3.7)).toFixed(2));
      current = parseFloat((randomFloat(3.0, 5.8)).toFixed(2));
      temp = parseFloat((randomFloat(37.0, 46.0)).toFixed(2));
      gyro = parseFloat((randomFloat(35.0, 95.0)).toFixed(2));
    } else {
      const anomaly = Math.floor(Math.random() * 4);
      voltage = parseFloat((randomFloat(3.5, 4.0)).toFixed(2));
      current = parseFloat((randomFloat(1.0, 4.0)).toFixed(2));
      temp = parseFloat((randomFloat(25.0, 35.0)).toFixed(2));
      gyro = parseFloat((randomFloat(5.0, 30.0)).toFixed(2));
      
      if (anomaly === 0) voltage = parseFloat((randomFloat(2.9, 3.25)).toFixed(2));
      else if (anomaly === 1) current = parseFloat((randomFloat(6.5, 11.0)).toFixed(2));
      else if (anomaly === 2) temp = parseFloat((randomFloat(49.0, 62.0)).toFixed(2));
      else gyro = parseFloat((randomFloat(130.0, 240.0)).toFixed(2));
    }
    
    try {
      const mlOutputs = processML(voltage, current, temp, gyro);
      const record = { voltage, current, temp, gyro, ...mlOutputs };
      
      await saveLatestTelemetry(record, 'vehicle01');
      await addHistoricalTelemetry(record, 'vehicle01');
      
      // Update daily live summary
      updateTodaySummary({ ...record, timestamp: new Date().toISOString() });
      
      console.log(`[SIMULATOR TELEMETRY PUBLISH] -> V: ${voltage}V, I: ${current}A, T: ${temp}°C, G: ${gyro} dps | Status: ${mlOutputs.status}`);
      
    } catch (err) {
      console.error('Error writing simulator telemetry:', err.message);
    }
  }, 3000);
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

process.on('SIGINT', () => {
  console.log('Shutting down MQTT Subscriber...');
  if (simulationInterval) clearInterval(simulationInterval);
  if (mqttClient) mqttClient.end();
  process.exit(0);
});
