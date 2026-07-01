const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { db, isMock } = require('./firebaseConfig');

// 1. Load Decision Tree JSON model for native JS evaluation
const modelPath = path.join(__dirname, '../ml/battery_model.json');
let decisionTree = null;

try {
  if (fs.existsSync(modelPath)) {
    decisionTree = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    console.log('🤖 Seeding script loaded Decision Tree model successfully.');
  } else {
    console.warn('⚠️ Seeding script running with threshold heuristic fallbacks.');
  }
} catch (error) {
  console.error('❌ Error reading ML model file:', error.message);
}

// Heuristic fallback
function heuristicInference(voltage, current, temp, gyro) {
  if (temp > 48 || current > 6.0 || voltage < 3.3 || gyro > 120) {
    return 2; // Risk
  }
  if (temp > 38 || current > 3.0 || voltage < 3.6 || gyro > 40) {
    return 1; // Stress
  }
  return 0; // Healthy
}

// Recursively parse Decision Tree
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

// Calculate classification and metrics
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

// Generate a record based on probabilities
function generateRecord(timestamp) {
  const roll = Math.random();
  let voltage, current, temp, gyro;
  
  if (roll < 0.70) {
    // 70% Healthy operating mode
    voltage = parseFloat((randomFloat(3.75, 4.15)).toFixed(2));
    current = parseFloat((randomFloat(0.5, 2.5)).toFixed(2));
    temp = parseFloat((randomFloat(23.0, 36.5)).toFixed(2));
    gyro = parseFloat((randomFloat(2.0, 35.0)).toFixed(2));
  } else if (roll < 0.92) {
    // 22% Stress operating mode (load, mild grade, light vibrations)
    const trigger = Math.floor(Math.random() * 4);
    if (trigger === 0) { // Current load stress
      voltage = parseFloat((randomFloat(3.5, 3.75)).toFixed(2));
      current = parseFloat((randomFloat(3.0, 5.8)).toFixed(2));
      temp = parseFloat((randomFloat(32.0, 42.0)).toFixed(2));
      gyro = parseFloat((randomFloat(20.0, 75.0)).toFixed(2));
    } else if (trigger === 1) { // Thermal stress
      voltage = parseFloat((randomFloat(3.5, 3.8)).toFixed(2));
      current = parseFloat((randomFloat(1.5, 4.0)).toFixed(2));
      temp = parseFloat((randomFloat(38.0, 47.5)).toFixed(2));
      gyro = parseFloat((randomFloat(10.0, 50.0)).toFixed(2));
    } else if (trigger === 2) { // Gyro vibration stress
      voltage = parseFloat((randomFloat(3.6, 4.0)).toFixed(2));
      current = parseFloat((randomFloat(1.0, 3.5)).toFixed(2));
      temp = parseFloat((randomFloat(25.0, 38.0)).toFixed(2));
      gyro = parseFloat((randomFloat(40.0, 115.0)).toFixed(2));
    } else { // Voltage sag stress
      voltage = parseFloat((randomFloat(3.3, 3.49)).toFixed(2));
      current = parseFloat((randomFloat(2.0, 4.5)).toFixed(2));
      temp = parseFloat((randomFloat(30.0, 40.0)).toFixed(2));
      gyro = parseFloat((randomFloat(15.0, 60.0)).toFixed(2));
    }
  } else {
    // 8% Risk anomaly (fault, critical sag, extreme acceleration/drop, thermal threat)
    const anomaly = Math.floor(Math.random() * 4);
    voltage = parseFloat((randomFloat(3.4, 4.0)).toFixed(2));
    current = parseFloat((randomFloat(1.0, 4.5)).toFixed(2));
    temp = parseFloat((randomFloat(25.0, 36.0)).toFixed(2));
    gyro = parseFloat((randomFloat(10.0, 35.0)).toFixed(2));
    
    if (anomaly === 0) { // Critical cell sag
      voltage = parseFloat((randomFloat(2.85, 3.25)).toFixed(2));
    } else if (anomaly === 1) { // Critical current spike
      current = parseFloat((randomFloat(6.5, 11.5)).toFixed(2));
      temp = parseFloat((randomFloat(38.0, 52.0)).toFixed(2));
    } else if (anomaly === 2) { // Critical thermal run
      temp = parseFloat((randomFloat(48.5, 61.0)).toFixed(2));
    } else { // Critical gyro (crash/shock/vibration)
      gyro = parseFloat((randomFloat(125.0, 230.0)).toFixed(2));
    }
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
    timestamp: isMock ? timestamp.toISOString() : timestamp
  };
}

async function clearCollection(collectionName) {
  if (isMock) {
    db.history = [];
    db.saveToLocalFile();
    console.log('🧹 Cleared mock DB history.');
    return;
  }
  
  console.log(`🧹 Clearing remote Firestore collection: "${collectionName}"...`);
  const snapshot = await db.collection(collectionName).get();
  const docs = [];
  snapshot.forEach(doc => docs.push(doc));
  
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`   Deleted chunk ${i} to ${i + chunk.length}`);
  }
  console.log(`✅ Cleared ${docs.length} documents from live Firestore.`);
}

async function seed() {
  console.log('🚀 Starting Battery Telemetry Seeding Script...');
  
  await clearCollection('battery_history');
  
  const numRecords = 800;
  const nowMs = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  
  const records = [];
  
  console.log(`Generating ${numRecords} telemetry records over the last 14 days...`);
  for (let i = 0; i < numRecords; i++) {
    // Distribute timestamps naturally across the last 14 days
    const randomAgeMs = Math.random() * fourteenDaysMs;
    const recordTimestamp = new Date(nowMs - randomAgeMs);
    records.push(generateRecord(recordTimestamp));
  }
  
  // Sort records chronologically (oldest to newest)
  records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  if (isMock) {
    // In mock mode, simply push to the array and save
    db.history = records;
    db.latest = records[records.length - 1];
    db.saveToLocalFile();
    console.log(`✅ Successfully seeded ${records.length} records into local_db.json!`);
  } else {
    // In live mode, add to Firestore in parallel chunks
    console.log(`Pushed sorting array. Writing to live Firestore...`);
    
    // Save latest
    const latestRecord = records[records.length - 1];
    await db.collection('battery_data').doc('latest').set(latestRecord);
    
    // Insert history in chunks of 50 in parallel to prevent connection lockouts
    const chunkSize = 50;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await Promise.all(chunk.map(record => db.collection('battery_history').add(record)));
      console.log(`   Wrote logs ${i} to ${i + chunk.length} of ${numRecords}...`);
    }
    console.log(`✅ Successfully seeded ${records.length} records into live Firestore collection "battery_history"!`);
  }
  
  console.log('🎉 Seeding pipeline completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding process failed:', err.message);
  process.exit(1);
});
