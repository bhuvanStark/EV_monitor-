const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { getLatestTelemetry, getHistoricalTelemetry } = require('./firestoreService');
const { isMock } = require('./firebaseConfig');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Endpoint: Get latest telemetry state
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const latest = await getLatestTelemetry();
    if (!latest) {
      return res.status(404).json({ success: false, message: 'No telemetry data available yet.' });
    }
    res.json({ success: true, isMock, data: latest });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Get historical logs
app.get('/api/telemetry/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const history = await getHistoricalTelemetry(limit);
    res.json({ success: true, isMock, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Get backend status and metadata
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'ONLINE',
    mode: isMock ? 'SIMULATION' : 'LIVE',
    mqttTopic: process.env.MQTT_TOPIC || 'voltsense/data',
    mqttBroker: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com',
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`⚡ VoltSense Dashboard server is running on http://localhost:${PORT}`);
  console.log(`Serving frontend from: ${path.join(__dirname, '../frontend')}`);
  if (isMock) {
    console.log('Running in SIMULATION MODE. Data is loaded and saved to local_db.json.');
  } else {
    console.log('Running in LIVE FIRESTORE MODE.');
  }
});
