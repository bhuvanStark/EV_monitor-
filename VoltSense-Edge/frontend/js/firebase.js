// Firebase frontend module
let dbInstance = null;
let firestoreUnsubscribeLatest = null;
let firestoreUnsubscribeHistory = null;

// User provided credentials for voltsense-edge
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBzVe1KYbjyr1UllJkGEGstIYWulvsY7m0",
  authDomain: "voltsense-edge.firebaseapp.com",
  projectId: "voltsense-edge",
  storageBucket: "voltsense-edge.firebasestorage.app",
  messagingSenderId: "315362400766",
  appId: "1:315362400766:web:f54fc020e552d81d5988af"
};

/**
 * Initializes Firebase with credentials stored in localStorage or default fallback.
 * Returns true if successful, false otherwise.
 */
function initFirebaseClient() {
  let firebaseConfig = defaultFirebaseConfig;

  // If user has saved custom config in localStorage, override with it
  const configStr = localStorage.getItem('voltsense_firebase_config');
  if (configStr) {
    try {
      firebaseConfig = JSON.parse(configStr);
      console.log('Using custom Firebase config from localStorage override.');
    } catch (e) {
      console.warn('Invalid custom config in localStorage, using default credential set.');
    }
  }

  try {
    // Check if firebase is imported (via CDN scripts loaded in HTML)
    if (typeof firebase === 'undefined') {
      console.error('❌ Firebase SDK not loaded in browser context.');
      return false;
    }

    // Prevent re-initialization error
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    
    dbInstance = firebase.firestore();
    console.log('🔥 Firebase Client initialized successfully.');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Client:', err.message);
    return false;
  }
}

/**
 * Sets up real-time snapshot listeners for telemetry data.
 */
function setupRealtimeListeners(onLatestUpdate, onHistoryUpdate) {
  if (!dbInstance) return false;

  // Cleanup existing listeners if any
  cleanupListeners();

  try {
    // 1. Subscribe to latest state document
    firestoreUnsubscribeLatest = dbInstance.collection('battery_data').doc('latest')
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          // Normalize timestamp if it's a Firestore Timestamp object
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            data.timestamp = data.timestamp.toDate().toISOString();
          }
          onLatestUpdate(data);
        } else {
          console.warn('Latest telemetry document does not exist yet.');
        }
      }, (error) => {
        console.error('Latest telemetry listener error:', error);
      });

    // 2. Subscribe to history collection
    firestoreUnsubscribeHistory = dbInstance.collection('battery_history')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .onSnapshot((snapshot) => {
        const historyData = [];
        snapshot.forEach((doc) => {
          const item = doc.data();
          // Normalize timestamp
          if (item.timestamp && typeof item.timestamp.toDate === 'function') {
            item.timestamp = item.timestamp.toDate().toISOString();
          }
          historyData.push({ id: doc.id, ...item });
        });
        onHistoryUpdate(historyData);
      }, (error) => {
        console.error('Historical telemetry listener error:', error);
      });

    return true;
  } catch (err) {
    console.error('❌ Failed to establish Firestore listeners:', err.message);
    return false;
  }
}

function cleanupListeners() {
  if (firestoreUnsubscribeLatest) {
    firestoreUnsubscribeLatest();
    firestoreUnsubscribeLatest = null;
  }
  if (firestoreUnsubscribeHistory) {
    firestoreUnsubscribeHistory();
    firestoreUnsubscribeHistory = null;
  }
}

// Expose functions globally
window.initFirebaseClient = initFirebaseClient;
window.setupRealtimeListeners = setupRealtimeListeners;
window.cleanupListeners = cleanupListeners;
