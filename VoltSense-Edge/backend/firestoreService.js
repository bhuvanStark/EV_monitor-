const { db, isMock, firebase } = require('./firebaseConfig');

/**
 * Save the latest battery telemetry values for a specific vehicle.
 * Stores in the vehicle's collection, under document 'vehicleInfo'.
 * Keeps compatibility with old 'battery_data/latest' for vehicle01.
 */
async function saveLatestTelemetry(data, vehicleId = 'vehicle01') {
  const payload = {
    ...data,
    timestamp: isMock ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (vehicleId === 'vehicle01') {
      await db.collection('battery_data').doc('latest').set(payload, { merge: true });
    } else {
      await db.collection(vehicleId).doc('vehicleInfo').set(payload, { merge: true });
    }
    return true;
  } catch (error) {
    console.error(`Error saving latest telemetry for ${vehicleId}:`, error.message);
    throw error;
  }
}

/**
 * Add a record to historical telemetry log for a specific vehicle.
 * Stores in the vehicle's collection, under doc 'history', subcollection 'battery_history'.
 * Keeps compatibility with old 'battery_history_live' for vehicle01.
 */
async function addHistoricalTelemetry(data, vehicleId = 'vehicle01') {
  const payload = {
    ...data,
    timestamp: isMock ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    let docRef;
    if (vehicleId === 'vehicle01') {
      docRef = await db.collection('battery_history_live').add(payload);
    } else {
      docRef = await db.collection(vehicleId).doc('history').collection('battery_history').add(payload);
    }
    return docRef ? docRef.id : null;
  } catch (error) {
    console.error(`Error adding historical telemetry for ${vehicleId}:`, error.message);
    throw error;
  }
}

/**
 * Get latest telemetry status for a specific vehicle.
 */
async function getLatestTelemetry(vehicleId = 'vehicle01') {
  try {
    const doc = vehicleId === 'vehicle01'
      ? await db.collection('battery_data').doc('latest').get()
      : await db.collection(vehicleId).doc('vehicleInfo').get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error(`Error getting latest telemetry for ${vehicleId}:`, error.message);
    return null;
  }
}

/**
 * Get recent historical telemetry logs for a specific vehicle.
 */
async function getHistoricalTelemetry(limit = 30, vehicleId = 'vehicle01') {
  try {
    const query = vehicleId === 'vehicle01'
      ? db.collection('battery_history_live')
      : db.collection(vehicleId).doc('history').collection('battery_history');

    const snapshot = await query
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    return logs;
  } catch (error) {
    console.error(`Error getting historical telemetry for ${vehicleId}:`, error.message);
    return [];
  }
}

module.exports = {
  saveLatestTelemetry,
  addHistoricalTelemetry,
  getLatestTelemetry,
  getHistoricalTelemetry
};
