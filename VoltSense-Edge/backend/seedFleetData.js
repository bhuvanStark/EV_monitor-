const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { db, isMock, firebase } = require('./firebaseConfig');

// 1. Load Decision Tree JSON model
const modelPath = path.join(__dirname, '../ml/battery_model.json');
let decisionTree = null;

try {
  if (fs.existsSync(modelPath)) {
    decisionTree = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    console.log('🤖 Fleet Seeding loaded Decision Tree model successfully.');
  } else {
    console.warn('⚠️ Decision Tree model JSON not found. Running heuristics fallbacks.');
  }
} catch (error) {
  console.error('❌ Error reading ML model file:', error.message);
}

// Heuristics fallback
function heuristicInference(voltage, current, temp, gyro) {
  if (temp > 48 || current > 6.0 || voltage < 3.3 || gyro > 120) {
    return 2; // Risk
  }
  if (temp > 38 || current > 3.0 || voltage < 3.6 || gyro > 40) {
    return 1; // Stress
  }
  return 0; // Healthy
}

// Recursively evaluate decision tree
function predictTree(node, features) {
  if (!node) return 0;
  if (node.value !== undefined) return node.value;
  const val = features[node.feature];
  if (val <= node.threshold) {
    return predictTree(node.left, features);
  } else {
    return predictTree(node.right, features);
  }
}

// Compute label, stress score, and insight
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

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// Generate data records based on operational profile
function generateTelemetryRecord(vehicleId, timestamp) {
  let voltage, current, temp, gyro;
  const roll = Math.random();

  switch (vehicleId) {
    case 'vehicle01': // VoltSense Prototype - Standard Mixed Usage
      if (roll < 0.70) {
        voltage = parseFloat((randomFloat(3.75, 4.15)).toFixed(2));
        current = parseFloat((randomFloat(0.5, 2.5)).toFixed(2));
        temp = parseFloat((randomFloat(23.0, 36.5)).toFixed(2));
        gyro = parseFloat((randomFloat(2.0, 35.0)).toFixed(2));
      } else if (roll < 0.92) {
        const trigger = Math.floor(Math.random() * 4);
        if (trigger === 0) { // current stress
          voltage = parseFloat((randomFloat(3.5, 3.75)).toFixed(2));
          current = parseFloat((randomFloat(3.0, 5.5)).toFixed(2));
          temp = parseFloat((randomFloat(32.0, 42.0)).toFixed(2));
          gyro = parseFloat((randomFloat(20.0, 75.0)).toFixed(2));
        } else if (trigger === 1) { // thermal stress
          voltage = parseFloat((randomFloat(3.5, 3.8)).toFixed(2));
          current = parseFloat((randomFloat(1.5, 4.0)).toFixed(2));
          temp = parseFloat((randomFloat(38.1, 46.0)).toFixed(2));
          gyro = parseFloat((randomFloat(10.0, 50.0)).toFixed(2));
        } else if (trigger === 2) { // gyro stress
          voltage = parseFloat((randomFloat(3.6, 4.0)).toFixed(2));
          current = parseFloat((randomFloat(1.0, 3.5)).toFixed(2));
          temp = parseFloat((randomFloat(25.0, 38.0)).toFixed(2));
          gyro = parseFloat((randomFloat(41.0, 110.0)).toFixed(2));
        } else { // voltage sag
          voltage = parseFloat((randomFloat(3.3, 3.49)).toFixed(2));
          current = parseFloat((randomFloat(2.0, 4.5)).toFixed(2));
          temp = parseFloat((randomFloat(30.0, 40.0)).toFixed(2));
          gyro = parseFloat((randomFloat(15.0, 60.0)).toFixed(2));
        }
      } else { // Risk anomalies
        const anomaly = Math.floor(Math.random() * 4);
        voltage = parseFloat((randomFloat(3.4, 4.0)).toFixed(2));
        current = parseFloat((randomFloat(1.0, 4.5)).toFixed(2));
        temp = parseFloat((randomFloat(25.0, 36.0)).toFixed(2));
        gyro = parseFloat((randomFloat(10.0, 35.0)).toFixed(2));
        
        if (anomaly === 0) {
          voltage = parseFloat((randomFloat(2.9, 3.25)).toFixed(2));
        } else if (anomaly === 1) {
          current = parseFloat((randomFloat(6.1, 9.5)).toFixed(2));
          temp = parseFloat((randomFloat(38.0, 50.0)).toFixed(2));
        } else if (anomaly === 2) {
          temp = parseFloat((randomFloat(48.5, 58.0)).toFixed(2));
        } else {
          gyro = parseFloat((randomFloat(121.0, 200.0)).toFixed(2));
        }
      }
      break;

    case 'vehicle02': // Aggressive Delivery Rider - High current & High vibration
      if (roll < 0.40) { // Healthy periods
        voltage = parseFloat((randomFloat(3.7, 4.10)).toFixed(2));
        current = parseFloat((randomFloat(1.0, 2.8)).toFixed(2));
        temp = parseFloat((randomFloat(26.0, 37.0)).toFixed(2));
        gyro = parseFloat((randomFloat(15.0, 38.0)).toFixed(2));
      } else if (roll < 0.85) { // Frequent stress events (especially load & gyro)
        const trigger = Math.floor(Math.random() * 2);
        if (trigger === 0) { // Heavy acceleration current stress
          voltage = parseFloat((randomFloat(3.45, 3.65)).toFixed(2));
          current = parseFloat((randomFloat(4.0, 5.9)).toFixed(2));
          temp = parseFloat((randomFloat(34.0, 44.0)).toFixed(2));
          gyro = parseFloat((randomFloat(45.0, 95.0)).toFixed(2));
        } else { // Offroad / high vibration stress
          voltage = parseFloat((randomFloat(3.55, 3.9)).toFixed(2));
          current = parseFloat((randomFloat(2.0, 4.5)).toFixed(2));
          temp = parseFloat((randomFloat(28.0, 39.0)).toFixed(2));
          gyro = parseFloat((randomFloat(65.0, 118.0)).toFixed(2));
        }
      } else { // Risk anomalies (severe current draw, fall/severe impact)
        const anomaly = Math.floor(Math.random() * 2);
        if (anomaly === 0) { // Critical throttle current spike
          voltage = parseFloat((randomFloat(3.0, 3.35)).toFixed(2));
          current = parseFloat((randomFloat(6.5, 11.5)).toFixed(2));
          temp = parseFloat((randomFloat(40.0, 52.0)).toFixed(2));
          gyro = parseFloat((randomFloat(40.0, 90.0)).toFixed(2));
        } else { // Crash or severe vibration shock
          voltage = parseFloat((randomFloat(3.6, 4.0)).toFixed(2));
          current = parseFloat((randomFloat(0.5, 3.0)).toFixed(2));
          temp = parseFloat((randomFloat(25.0, 38.0)).toFixed(2));
          gyro = parseFloat((randomFloat(125.0, 240.0)).toFixed(2));
        }
      }
      break;

    case 'vehicle03': // Campus Vehicle - Very Smooth & Stable
      if (roll < 0.96) { // Almost completely healthy and calm
        voltage = parseFloat((randomFloat(3.8, 4.18)).toFixed(2));
        current = parseFloat((randomFloat(0.2, 1.8)).toFixed(2));
        temp = parseFloat((randomFloat(21.0, 30.5)).toFixed(2));
        gyro = parseFloat((randomFloat(0.0, 18.0)).toFixed(2));
      } else { // Rare mild stress (slight speed bump or passenger load)
        voltage = parseFloat((randomFloat(3.65, 3.79)).toFixed(2));
        current = parseFloat((randomFloat(2.0, 3.3)).toFixed(2));
        temp = parseFloat((randomFloat(28.0, 33.0)).toFixed(2));
        gyro = parseFloat((randomFloat(20.0, 45.0)).toFixed(2));
      }
      break;

    case 'vehicle04': // Warehouse Vehicle - High temperature, repeated thermal stress
      if (roll < 0.35) { // Healthy but warm
        voltage = parseFloat((randomFloat(3.75, 4.15)).toFixed(2));
        current = parseFloat((randomFloat(0.5, 2.2)).toFixed(2));
        temp = parseFloat((randomFloat(34.0, 37.9)).toFixed(2));
        gyro = parseFloat((randomFloat(0.0, 15.0)).toFixed(2));
      } else if (roll < 0.80) { // Elevated thermal stress
        voltage = parseFloat((randomFloat(3.55, 3.8)).toFixed(2));
        current = parseFloat((randomFloat(1.0, 3.0)).toFixed(2));
        temp = parseFloat((randomFloat(38.5, 47.9)).toFixed(2));
        gyro = parseFloat((randomFloat(2.0, 20.0)).toFixed(2));
      } else { // Critical thermal run risk
        voltage = parseFloat((randomFloat(3.3, 3.7)).toFixed(2));
        current = parseFloat((randomFloat(1.5, 4.5)).toFixed(2));
        temp = parseFloat((randomFloat(48.5, 60.5)).toFixed(2));
        gyro = parseFloat((randomFloat(5.0, 25.0)).toFixed(2));
      }
      break;

    case 'vehicle05': // Rental Scooter - Moderate Stress, Occasional Vibration
      if (roll < 0.65) {
        voltage = parseFloat((randomFloat(3.75, 4.12)).toFixed(2));
        current = parseFloat((randomFloat(0.5, 2.5)).toFixed(2));
        temp = parseFloat((randomFloat(23.0, 36.0)).toFixed(2));
        gyro = parseFloat((randomFloat(10.0, 38.0)).toFixed(2));
      } else if (roll < 0.90) { // Moderate vibration stress
        voltage = parseFloat((randomFloat(3.6, 3.9)).toFixed(2));
        current = parseFloat((randomFloat(1.5, 3.5)).toFixed(2));
        temp = parseFloat((randomFloat(28.0, 38.0)).toFixed(2));
        gyro = parseFloat((randomFloat(42.0, 115.0)).toFixed(2));
      } else { // Occasional gyro risk (potholes/curbs)
        voltage = parseFloat((randomFloat(3.65, 4.05)).toFixed(2));
        current = parseFloat((randomFloat(0.5, 2.5)).toFixed(2));
        temp = parseFloat((randomFloat(25.0, 35.0)).toFixed(2));
        gyro = parseFloat((randomFloat(122.0, 195.0)).toFixed(2));
      }
      break;

    default: // Fallback
      voltage = 3.8;
      current = 1.0;
      temp = 25.0;
      gyro = 10.0;
  }

  const ml = processML(voltage, current, temp, gyro);
  return {
    voltage,
    current,
    temp,
    gyro,
    status: ml.status,
    stressScore: ml.stressScore,
    insight: ml.insight,
    timestamp: isMock ? timestamp.toISOString() : firebase.firestore.Timestamp.fromDate(timestamp)
  };
}

async function clearVehicleData(vehicleId) {
  if (isMock) {
    if (!db.collections) db.collections = {};
    db.collections[vehicleId] = {
      vehicleInfo: {},
      summary: {},
      history: {
        battery_history: {}
      }
    };
    db.saveToLocalFile();
    return;
  }

  console.log(`🧹 Clearing Firestore collection: "${vehicleId}"...`);
  
  // Clear root documents
  try {
    await db.collection(vehicleId).doc('vehicleInfo').delete();
    await db.collection(vehicleId).doc('summary').delete();
  } catch (err) {
    // Info might not exist yet
  }

  // Clear battery_history subcollection
  let snapshot;
  if (vehicleId === 'vehicle01') {
    snapshot = await db.collection('battery_history_live').get();
  } else {
    snapshot = await db.collection(vehicleId).doc('history').collection('battery_history').get();
  }
  const docs = [];
  snapshot.forEach(doc => docs.push(doc));
  
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log(`✅ Cleared historical telemetry for "${vehicleId}"`);
}

async function seedVehicle(vehicleId, name, status, type, scenarioDesc, recommendation) {
  console.log(`\n🚙 Seeding ${name} (${vehicleId})...`);
  await clearVehicleData(vehicleId);

  const numRecords = 300;
  const nowMs = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  
  const records = [];
  
  for (let i = 0; i < numRecords; i++) {
    const randomAgeMs = Math.random() * fourteenDaysMs;
    const recordTimestamp = new Date(nowMs - randomAgeMs);
    records.push(generateTelemetryRecord(vehicleId, recordTimestamp));
  }

  // Sort chronologically
  records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Compute summary metrics
  let stressEventsCount = 0;
  let riskEventsCount = 0;
  let peakTemp = 0;
  let avgTemp = 0;
  let peakCurrent = 0;
  let avgCurrent = 0;

  records.forEach(r => {
    if (r.status === 'Stress') stressEventsCount++;
    if (r.status === 'Risk') riskEventsCount++;
    if (r.temp > peakTemp) peakTemp = r.temp;
    avgTemp += r.temp;
    if (r.current > peakCurrent) peakCurrent = r.current;
    avgCurrent += r.current;
  });

  avgTemp = avgTemp / numRecords;
  avgCurrent = avgCurrent / numRecords;

  const latestRecord = records[records.length - 1];

  const vehicleInfo = {
    vehicleId,
    name,
    status,
    type,
    scenarioDesc,
    voltage: latestRecord.voltage,
    current: latestRecord.current,
    temp: latestRecord.temp,
    gyro: latestRecord.gyro,
    healthStatus: latestRecord.status,
    stressScore: latestRecord.stressScore,
    insight: latestRecord.insight,
    lastUpdated: latestRecord.timestamp
  };

  const summary = {
    totalRecords: numRecords,
    stressEvents: stressEventsCount,
    riskEvents: riskEventsCount,
    peakTemperature: parseFloat(peakTemp.toFixed(1)),
    averageTemperature: parseFloat(avgTemp.toFixed(1)),
    peakCurrentDraw: parseFloat(peakCurrent.toFixed(1)),
    averageCurrentDraw: parseFloat(avgCurrent.toFixed(1)),
    recommendation,
    lastUpdated: isMock ? new Date().toISOString() : firebase.firestore.Timestamp.fromDate(new Date())
  };

  // Write to DB
  if (isMock) {
    db.collections[vehicleId] = {
      vehicleInfo,
      summary,
      history: {
        battery_history: records.reduce((acc, r, index) => {
          const mockId = `hist_${index}_${vehicleId}`;
          acc[mockId] = r;
          return acc;
        }, {})
      }
    };
    if (vehicleId === 'vehicle01') {
      db.latest = latestRecord;
    }
    db.saveToLocalFile();
    console.log(`✅ Seeded ${records.length} records inside mock collections for ${vehicleId}`);
  } else {
    // Write info and summary
    await db.collection(vehicleId).doc('vehicleInfo').set(vehicleInfo);
    await db.collection(vehicleId).doc('summary').set(summary);

    // Save latest history reference for vehicle01 compatibility
    if (vehicleId === 'vehicle01') {
      await db.collection('battery_data').doc('latest').set(latestRecord);
    }

    // Write history in parallel chunks
    const chunkSize = 50;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await Promise.all(chunk.map(r => {
        if (vehicleId === 'vehicle01') {
          return db.collection('battery_history_live').add(r);
        }
        return db.collection(vehicleId).doc('history').collection('battery_history').add(r);
      }));
    }
    console.log(`✅ Seeded ${records.length} records inside Firestore collections for ${vehicleId}`);
  }
}

async function seedFleet() {
  console.log('🚀 Starting Fleet Seeding Script...');
  
  // Seed the 5 vehicles
  await seedVehicle(
    'vehicle01',
    'VoltSense Prototype',
    'LIVE',
    'Prototype',
    'Live telemetry feeds directly from the physical ESP32 controller.',
    'Vehicle is currently active. Maintain smooth throttle control during tests to preserve state of health.'
  );

  await seedVehicle(
    'vehicle02',
    'Delivery Rider EV-02',
    'ACTIVE',
    'Commercial Delivery',
    'Aggressive driving profile. High throttling cycles and frequent off-road vibrations.',
    'CRITICAL STRESS: Repeated high current draws (>6A) and throttle spikes. Suggest advising driver on smoother deceleration and acceleration profiles.'
  );

  await seedVehicle(
    'vehicle03',
    'Campus Shuttle EV-03',
    'ACTIVE',
    'Campus Mobility',
    'Highly stable profile. Uniform velocity on smooth paved terrain.',
    'HEALTHY: Excellent thermal margins and low battery load. No actions required. Battery health is optimal.'
  );

  await seedVehicle(
    'vehicle04',
    'Warehouse Forklift EV-04',
    'ACTIVE',
    'Material Handling',
    'Intensive indoor cycles with high ambient temperatures, causing repeated thermal stress.',
    'WARNING THERMAL: High average operating temperature (39.5°C). Ensure parking in cooling docks between shifts and check thermal ventilation grids.'
  );

  await seedVehicle(
    'vehicle05',
    'Rental Scooter EV-05',
    'ACTIVE',
    'Public Sharing',
    'Mixed usage profile. Subjected to rough handling and moderate chassis vibration anomalies.',
    'NOTICE: Multiple moderate vibration events detected. Recommend scheduling suspension check and physical chassis weld inspection.'
  );

  // Seed fleet wide general metadata (to comply with 'fleet' collection structure)
  console.log('\n🚙 Seeding fleet wide general metadata...');
  await seedVehicle(
    'fleet',
    'Corporate EV Fleet',
    'ACTIVE',
    'Fleet Aggregate',
    'Aggregated dashboard metrics of all operational assets.',
    'Recommend checkup on Vehicle04 (Thermal Stress) and Vehicle02 (High Throttle Load) in the upcoming rotation cycle.'
  );

  console.log('\n🎉 Fleet seeding completed successfully!');
  process.exit(0);
}

seedFleet().catch(err => {
  console.error('❌ Seeding process failed:', err.message);
  process.exit(1);
});
