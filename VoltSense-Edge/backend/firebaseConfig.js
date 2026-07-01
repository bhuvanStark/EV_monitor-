const firebase = require('firebase/app');
require('firebase/firestore');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let db;
let isMock = false;

// Helper to save database state
function saveMockDb(dbState) {
  try {
    const data = {
      latest: dbState.latest,
      history: dbState.history,
      collections: dbState.collections
    };
    fs.writeFileSync(path.join(__dirname, 'local_db.json'), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[MOCK FIRESTORE] Error saving local DB file:', err.message);
  }
}

class MockDocument {
  constructor(dbState, pathParts) {
    this.dbState = dbState;
    this.pathParts = pathParts; // e.g. ['collections', 'vehicle01', 'vehicleInfo']
  }

  get data() {
    let current = this.dbState;
    for (const part of this.pathParts) {
      if (!current[part]) return undefined;
      current = current[part];
    }
    return current;
  }

  set(data, options = {}) {
    // Check for merge options
    let current = this.dbState;
    for (let i = 0; i < this.pathParts.length - 1; i++) {
      const part = this.pathParts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    const lastPart = this.pathParts[this.pathParts.length - 1];
    
    // Save to compatibility fields if needed
    if (this.pathParts[0] === 'latest') {
      this.dbState.latest = options.merge ? { ...this.dbState.latest, ...data } : data;
    } else {
      if (options.merge && typeof current[lastPart] === 'object' && typeof data === 'object') {
        current[lastPart] = { ...current[lastPart], ...data };
      } else {
        current[lastPart] = data;
      }
    }
    
    saveMockDb(this.dbState);
    return Promise.resolve();
  }

  get() {
    const val = this.data;
    const exists = val !== undefined;
    return Promise.resolve({
      exists,
      data: () => val
    });
  }

  collection(name) {
    return new MockCollection(this.dbState, [...this.pathParts, name]);
  }
}

class MockCollection {
  constructor(dbState, pathParts) {
    this.dbState = dbState;
    this.pathParts = pathParts; // e.g. ['collections', 'vehicle01'] or ['history']
  }

  get rawCollection() {
    let current = this.dbState;
    for (const part of this.pathParts) {
      if (!current[part]) return undefined;
      current = current[part];
    }
    return current;
  }

  doc(id) {
    // If it's battery_data/latest compatibility path
    if (this.pathParts[0] === 'latest') {
      return new MockDocument(this.dbState, ['latest']);
    }
    if (this.pathParts[0] === 'collections' && this.pathParts[1] === 'battery_data' && id === 'latest') {
      return new MockDocument(this.dbState, ['latest']);
    }
    return new MockDocument(this.dbState, [...this.pathParts, id]);
  }

  add(data) {
    const id = 'mock_id_' + Math.random().toString(36).substr(2, 9);
    
    if (this.pathParts[0] === 'history') {
      // Compatibility path
      this.dbState.history.push({ id, ...data });
      if (this.dbState.history.length > 1200) this.dbState.history.shift();
      saveMockDb(this.dbState);
      return Promise.resolve({ id, ref: new MockDocument(this.dbState, ['history']) });
    }

    let current = this.dbState;
    for (let i = 0; i < this.pathParts.length - 1; i++) {
      const part = this.pathParts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    const lastPart = this.pathParts[this.pathParts.length - 1];
    if (!current[lastPart]) current[lastPart] = {};
    current[lastPart][id] = data;
    
    saveMockDb(this.dbState);
    return Promise.resolve({ id, ref: new MockDocument(this.dbState, [...this.pathParts, id]) });
  }

  get() {
    let col = {};
    if (this.pathParts[0] === 'history') {
      col = this.dbState.history.reduce((acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      }, {});
    } else {
      col = this.rawCollection || {};
    }

    const docs = Object.keys(col).map(key => {
      const data = col[key];
      return {
        id: key,
        ref: new MockDocument(this.dbState, [...this.pathParts, key]),
        data: () => data,
        exists: true
      };
    });

    const snapshot = {
      docs,
      forEach(cb) {
        docs.forEach(cb);
      },
      get size() {
        return docs.length;
      }
    };

    return Promise.resolve(snapshot);
  }

  orderBy(field, direction = 'asc') {
    return new MockQuery(this.dbState, this.pathParts, field, direction);
  }

  limit(n) {
    return new MockQuery(this.dbState, this.pathParts).limit(n);
  }
}

class MockQuery {
  constructor(dbState, pathParts, orderByField = null, orderDirection = 'asc') {
    this.dbState = dbState;
    this.pathParts = pathParts;
    this.orderByField = orderByField;
    this.orderDirection = orderDirection;
    this._limit = null;
  }

  orderBy(field, direction = 'asc') {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  get() {
    let items = [];
    if (this.pathParts[0] === 'history') {
      items = [...this.dbState.history];
    } else {
      let current = this.dbState;
      for (const part of this.pathParts) {
        if (!current[part]) current = {};
        else current = current[part];
      }
      items = Object.keys(current).map(key => ({
        id: key,
        ...current[key]
      }));
    }

    // Perform sorting
    if (this.orderByField) {
      items.sort((a, b) => {
        let valA = a[this.orderByField];
        let valB = b[this.orderByField];
        
        if (typeof valA === 'string' && typeof valB === 'string') {
          return this.orderDirection === 'desc' 
            ? valB.localeCompare(valA) 
            : valA.localeCompare(valB);
        }
        
        // Handle Date objects or timestamp fields
        const dateA = new Date(valA);
        const dateB = new Date(valB);
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
          return this.orderDirection === 'desc' ? dateB - dateA : dateA - dateB;
        }

        return this.orderDirection === 'desc' ? valB - valA : valA - valB;
      });
    }

    // Apply limit
    if (this._limit !== null) {
      items = items.slice(0, this._limit);
    }

    const docs = items.map(item => {
      const { id, ...data } = item;
      return {
        id,
        ref: new MockDocument(this.dbState, [...this.pathParts, id]),
        data: () => data,
        exists: true
      };
    });

    const snapshot = {
      docs,
      forEach(cb) {
        docs.forEach(cb);
      },
      get size() {
        return docs.length;
      }
    };

    return Promise.resolve(snapshot);
  }
}

// Mock database container
const mockDb = {
  latest: {},
  history: [],
  collections: {},
  
  collection(name) {
    // Compatibility check for battery_data and battery_history
    if (name === 'battery_data') {
      return new MockCollection(mockDb, ['latest']);
    }
    if (name === 'battery_history') {
      return new MockCollection(mockDb, ['history']);
    }
    if (name === 'battery_history_live') {
      return new MockCollection(mockDb, ['collections', 'vehicle01', 'history', 'battery_history']);
    }
    return new MockCollection(mockDb, ['collections', name]);
  },
  
  saveToLocalFile() {
    saveMockDb(mockDb);
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
    mockDb.collections = parsed.collections || {};
  }
} catch (e) {
  console.warn('Could not load local_db.json, starting fresh:', e.message);
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
