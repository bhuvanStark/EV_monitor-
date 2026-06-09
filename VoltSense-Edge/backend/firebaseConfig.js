const firebase = require('firebase/app');
require('firebase/firestore');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let db;
let isMock = false;

// Mock database to save local telemetry history and latest states in memory/disk
const mockDb = {
  latest: {},
  history: [],
  collection(name) {
    return {
      doc(id) {
        return {
          set(data, options) {
            if (id === 'latest') {
              mockDb.latest = data;
              mockDb.saveToLocalFile();
            }
            console.log(`[MOCK FIRESTORE] Saved to collection '${name}', document '${id}'`);
            return Promise.resolve();
          }
        };
      },
      add(data) {
        mockDb.history.push({ id: Math.random().toString(36).substr(2, 9), ...data });
        if (mockDb.history.length > 100) mockDb.history.shift();
        mockDb.saveToLocalFile();
        console.log(`[MOCK FIRESTORE] Added record to collection '${name}'`);
        return Promise.resolve({ id: 'mock-id-' + Math.random().toString(36).substr(2, 5) });
      }
    };
  },
  saveToLocalFile() {
    try {
      const data = {
        latest: mockDb.latest,
        history: mockDb.history
      };
      fs.writeFileSync(path.join(__dirname, 'local_db.json'), JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[MOCK FIRESTORE] Error saving local DB file:', err.message);
    }
  }
};

// Attempt to load mock state if it exists
try {
  const localDbPath = path.join(__dirname, 'local_db.json');
  if (fs.existsSync(localDbPath)) {
    const raw = fs.readFileSync(localDbPath, 'utf8');
    const parsed = JSON.parse(raw);
    mockDb.latest = parsed.latest || {};
    mockDb.history = parsed.history || [];
  }
} catch (e) {
  // Ignore
}

const useSimulation = process.env.USE_SIMULATION === 'true';
const projectId = process.env.FIREBASE_PROJECT_ID;

if (projectId && !useSimulation) {
  try {
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID
    };

    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log('🔥 Firebase Client SDK initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Client:', error.message);
    console.warn('⚠️ Falling back to mock Firestore simulation mode.');
    db = mockDb;
    isMock = true;
  }
} else {
  console.warn('⚠️ Starting in mock Firestore simulation mode.');
  db = mockDb;
  isMock = true;
}

module.exports = {
  db,
  isMock,
  firebase: isMock ? null : firebase
};
