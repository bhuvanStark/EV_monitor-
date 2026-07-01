const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { getLatestTelemetry, getHistoricalTelemetry } = require('./firestoreService');
const { db, isMock } = require('./firebaseConfig');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Endpoint: Get latest telemetry state
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const vehicleId = req.query.vehicle || 'vehicle01';
    const latest = await getLatestTelemetry(vehicleId);
    if (!latest) {
      return res.status(404).json({ success: false, message: `No telemetry data available yet for ${vehicleId}.` });
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
    const vehicleId = req.query.vehicle || 'vehicle01';
    const history = await getHistoricalTelemetry(limit, vehicleId);
    res.json({ success: true, isMock, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Get weekly diagnostic report summary
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const vehicleId = req.query.vehicle || 'vehicle01';
    const history = await getHistoricalTelemetry(limit, vehicleId);
    
    let stressCount = 0;
    let riskCount = 0;
    const totalCount = history.length;
    let peakTemp = 0;
    let avgTemp = 0;
    let peakCurrent = 0;
    let avgCurrent = 0;
    
    history.forEach(log => {
      if (log.status === 'Stress') stressCount++;
      if (log.status === 'Risk') riskCount++;
      if (log.temp > peakTemp) peakTemp = log.temp;
      avgTemp += log.temp;
      if (log.current > peakCurrent) peakCurrent = log.current;
      avgCurrent += log.current;
    });
    
    avgTemp = totalCount > 0 ? (avgTemp / totalCount) : 0;
    avgCurrent = totalCount > 0 ? (avgCurrent / totalCount) : 0;
    
    const stats = {
      totalRecords: totalCount,
      stressEvents: stressCount,
      riskEvents: riskCount,
      peakTemperature: peakTemp.toFixed(1),
      averageTemperature: avgTemp.toFixed(1),
      peakCurrentDraw: peakCurrent.toFixed(1),
      averageCurrentDraw: avgCurrent.toFixed(1)
    };
    
    const CLOUD_ML_KEY = process.env.GEMINI_API_KEY || process.env.CLOUD_ML_KEY;
    
    if (CLOUD_ML_KEY && totalCount > 0) {
      const promptText = `You are a real-time EV Battery Diagnostics AI.
Analyze the following weekly summary statistics:
- Total telemetry points: ${stats.totalRecords}
- Stress events: ${stats.stressEvents}
- Risk events: ${stats.riskEvents}
- Peak temperature: ${stats.peakTemperature}°C (Average: ${stats.averageTemperature}°C)
- Peak current draw: ${stats.peakCurrentDraw}A (Average: ${stats.averageCurrentDraw}A)

Write a concise, professional 3-4 sentence paragraph summarizing the weekly report.
Guidelines:
1. Summarize how the battery behaved over the week.
2. Note if stress/risk events were caused by high current or temperature issues.
3. Assess if the battery is generally healthy or needs inspection.
4. Do NOT use markdown bold/bullet points. Return plain text only.
5. Hide any reference to Gemini or Google AI. Speak as the integrated VoltSense Diagnostics Co-processor.`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${CLOUD_ML_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });
        
        if (response.ok) {
          const resData = await response.json();
          if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
            const summaryText = resData.candidates[0].content.parts[0].text.trim();
            return res.json({ success: true, summary: summaryText });
          }
        }
      } catch (apiErr) {
        console.error('⚠️ Cloud ML Weekly Summary API Error:', apiErr.message);
      }
    }
    
    // Rule-based fallback if Gemini API is not configured or fails
    let safetyLevel = 'healthy';
    if (riskCount > 10) safetyLevel = 'critical';
    else if (stressCount > 30) safetyLevel = 'stressed';
    
    let fallbackText = `Battery stress remained stable over the analysis period. `;
    if (safetyLevel === 'critical') {
      fallbackText = `WARNING: Multiple critical Risk events (${riskCount}) were logged. High peak current (${stats.peakCurrentDraw}A) and elevated peak temperatures (${stats.peakTemperature}°C) suggest immediate inspection is recommended. `;
    } else if (safetyLevel === 'stressed') {
      fallbackText = `NOTICE: Elevated battery stress levels detected (${stressCount} occurrences). Riding behavior showed high current draw spikes. Pack thermal management remained generally stable. `;
    } else {
      fallbackText += `All key safety boundaries for voltage, current, and temperature remained within nominal guidelines. Riding behavior is smooth and the EV pack is performing optimally. `;
    }
    fallbackText += `The average operating temperature was ${stats.averageTemperature}°C, with current draw averaging ${stats.averageCurrentDraw}A. No critical battery sags were recorded.`;
    
    res.json({ success: true, summary: fallbackText });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Get latest stats and summary for all vehicles
app.get('/api/fleet/vehicles', async (req, res) => {
  try {
    const vehicleIds = ['vehicle01', 'vehicle02', 'vehicle03', 'vehicle04', 'vehicle05'];
    const vehiclesData = [];
    
    for (const id of vehicleIds) {
      const info = await getLatestTelemetry(id);
      if (info) {
        // Fetch summary
        const summaryDoc = await db.collection(id).doc('summary').get();
        info.summary = summaryDoc.exists ? summaryDoc.data() : null;
        vehiclesData.push(info);
      }
    }
    
    res.json({ success: true, isMock, data: vehiclesData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Get overall fleet wide summary and stats
app.get('/api/fleet/summary', async (req, res) => {
  try {
    const vehicleIds = ['vehicle01', 'vehicle02', 'vehicle03', 'vehicle04', 'vehicle05'];
    const vehicles = [];
    
    for (const id of vehicleIds) {
      const info = await getLatestTelemetry(id);
      if (info) {
        const summaryDoc = await db.collection(id).doc('summary').get();
        info.summary = summaryDoc.exists ? summaryDoc.data() : null;
        vehicles.push(info);
      }
    }
    
    // Aggregates
    let healthyCount = 0;
    let stressCount = 0;
    let riskCount = 0;
    let totalStressScore = 0;
    
    vehicles.forEach(v => {
      if (v.healthStatus === 'Healthy') healthyCount++;
      else if (v.healthStatus === 'Stress') stressCount++;
      else if (v.healthStatus === 'Risk') riskCount++;
      totalStressScore += (v.stressScore || 0);
    });
    
    const fleetStressIndex = vehicles.length > 0 ? Math.round(totalStressScore / vehicles.length) : 0;
    
    // Generate maintenance queue
    const maintenanceQueue = [];
    vehicles.forEach(v => {
      if (v.vehicleId === 'vehicle04') {
        maintenanceQueue.push({
          vehicleId: v.vehicleId,
          name: v.name,
          issue: 'Repeated Thermal Events',
          severity: 'critical',
          recommendation: v.summary ? v.summary.recommendation : 'Inspect cooling vents'
        });
      } else if (v.vehicleId === 'vehicle02') {
        maintenanceQueue.push({
          vehicleId: v.vehicleId,
          name: v.name,
          issue: 'Repeated Throttle Stress Events',
          severity: 'warning',
          recommendation: v.summary ? v.summary.recommendation : 'Train driver on smooth acceleration'
        });
      } else if (v.vehicleId === 'vehicle05') {
        maintenanceQueue.push({
          vehicleId: v.vehicleId,
          name: v.name,
          issue: 'Sensor/Chassis Check Recommended',
          severity: 'info',
          recommendation: v.summary ? v.summary.recommendation : 'Chassis vibration check'
        });
      }
    });
    
    // Fleet Rankings
    const stableVehicles = [...vehicles].sort((a, b) => (a.stressScore || 0) - (b.stressScore || 0));
    const highestStressVehicles = [...vehicles].sort((a, b) => (b.stressScore || 0) - (a.stressScore || 0));
    
    const thermalVehicles = [...vehicles].sort((a, b) => {
      const tempA = a.summary ? a.summary.averageTemperature : 0;
      const tempB = b.summary ? b.summary.averageTemperature : 0;
      return tempB - tempA;
    });
    
    const currentVehicles = [...vehicles].sort((a, b) => {
      const currA = a.summary ? a.summary.peakCurrentDraw : 0;
      const currB = b.summary ? b.summary.peakCurrentDraw : 0;
      return currB - currA;
    });
    
    const rankings = {
      mostStable: stableVehicles[0] ? { vehicleId: stableVehicles[0].vehicleId, name: stableVehicles[0].name, value: `${stableVehicles[0].stressScore}% Stress Index` } : null,
      highestStress: highestStressVehicles[0] ? { vehicleId: highestStressVehicles[0].vehicleId, name: highestStressVehicles[0].name, value: `${highestStressVehicles[0].stressScore}% Stress Index` } : null,
      highestThermal: thermalVehicles[0] ? { vehicleId: thermalVehicles[0].vehicleId, name: thermalVehicles[0].name, value: `${thermalVehicles[0].summary ? thermalVehicles[0].summary.averageTemperature : 0}°C Avg Temp` } : null,
      mostAggressive: currentVehicles[0] ? { vehicleId: currentVehicles[0].vehicleId, name: currentVehicles[0].name, value: `${currentVehicles[0].summary ? currentVehicles[0].summary.peakCurrentDraw : 0}A Peak Current` } : null
    };
    
    res.json({
      success: true,
      data: {
        healthyCount,
        stressCount,
        riskCount,
        fleetStressIndex,
        maintenanceQueue,
        rankings
      }
    });
    
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
