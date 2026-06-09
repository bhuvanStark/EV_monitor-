const { db, isMock, firebase } = require('./firebaseConfig');

/**
 * Save the latest battery telemetry values.
 * Stores in battery_data collection with document ID 'latest'.
 */
async function saveLatestTelemetry(data) {
  const payload = {
    ...data,
    timestamp: isMock ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('battery_data').doc('latest').set(payload, { merge: true });
    return true;
  } catch (error) {
    console.error('Error saving latest telemetry:', error.message);
    throw error;
  }
}

/**
 * Add a record to historical telemetry log.
 * Stores in battery_history collection.
 */
async function addHistoricalTelemetry(data) {
  const payload = {
    ...data,
    timestamp: isMock ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = await db.collection('battery_history').add(payload);
    return docRef.id;
  } catch (error) {
    console.error('Error adding historical telemetry:', error.message);
    throw error;
  }
}

/**
 * Get latest telemetry status.
 */
async function getLatestTelemetry() {
  try {
    if (isMock) {
      return db.latest;
    }
    const doc = await db.collection('battery_data').doc('latest').get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting latest telemetry:', error.message);
    return null;
  }
}

/**
 * Get recent historical telemetry logs.
 */
async function getHistoricalTelemetry(limit = 30) {
  try {
    if (isMock) {
      return db.history.slice(-limit).reverse();
    }
    const snapshot = await db.collection('battery_history')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    return logs;
  } catch (error) {
    console.error('Error getting historical telemetry:', error.message);
    return [];
  }
}

module.exports = {
  saveLatestTelemetry,
  addHistoricalTelemetry,
  getLatestTelemetry,
  getHistoricalTelemetry
};
