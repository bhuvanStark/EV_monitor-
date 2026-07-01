// UI and Application Controller
let isFirebaseMode = false;
let pollingInterval = null;

// Track history locally for charts logic
let historyBuffer = [];

// Helper to parse any timestamp representation robustly into a JS Date object
function parseTimestamp(timestamp) {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  // Firestore Timestamp object: { seconds, nanoseconds } or { _seconds, _nanoseconds }
  const seconds = timestamp.seconds !== undefined ? timestamp.seconds : timestamp._seconds;
  if (seconds !== undefined) {
    return new Date(seconds * 1000);
  }
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Formats time strings
function getFormattedTime(timestamp) {
  const d = parseTimestamp(timestamp);
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Sync Clock
function syncClock() {
  const clockEl = document.getElementById('liveClock');
  if (clockEl) {
    clockEl.textContent = getFormattedTime();
  }
}

// Handle Latest Telemetry UI updates
function updateLatestUI(data) {
  if (!data) return;

  const { voltage, current, temp, gyro, status, stressScore, insight, timestamp } = data;
  
  // Set text values
  document.getElementById('metricVoltage').textContent = Number(voltage).toFixed(2);
  document.getElementById('metricCurrent').textContent = Number(current).toFixed(2);
  document.getElementById('metricTemp').textContent = Number(temp).toFixed(1);
  document.getElementById('metricGyro').textContent = Number(gyro).toFixed(0);
  document.getElementById('liveTime').textContent = getFormattedTime(timestamp);

  // Voltage percentage fill (2.8V - 4.2V range)
  const voltPct = Math.max(0, Math.min(100, ((voltage - 2.8) / (4.2 - 2.8)) * 100));
  document.getElementById('barVoltage').style.width = `${voltPct}%`;

  // Current percentage fill (0A - 12A range)
  const currPct = Math.max(0, Math.min(100, (current / 12) * 100));
  document.getElementById('barCurrent').style.width = `${currPct}%`;

  // Gyro percentage fill (0 - 250 dps range)
  const gyroPct = Math.max(0, Math.min(100, (gyro / 250) * 100));
  document.getElementById('barGyro').style.width = `${gyroPct}%`;

  // Temperature status classification and styling
  const tempBadge = document.getElementById('tempBadge');
  tempBadge.className = 'metric-subtext';
  if (temp < 38) {
    tempBadge.innerHTML = `<span style="color: var(--green)">🟢 Normal</span>`;
  } else if (temp <= 48) {
    tempBadge.innerHTML = `<span style="color: var(--yellow)">🟡 Warm</span>`;
  } else {
    tempBadge.innerHTML = `<span style="color: var(--red); font-weight: bold;">🔴 Critical</span>`;
  }

  // Update Classification Card
  const statusNameEl = document.getElementById('statusName');
  statusNameEl.textContent = status;
  
  const statusIconBox = document.getElementById('statusIconBox');
  statusIconBox.className = 'status-icon-frame';
  
  // Apply colors dynamically
  let statusColor = 'var(--green)';
  let statusIcon = 'shield-check';
  
  if (status === 'Stress') {
    statusColor = 'var(--yellow)';
    statusIcon = 'alert-triangle';
  } else if (status === 'Risk') {
    statusColor = 'var(--red)';
    statusIcon = 'alert-octagon';
  }
  
  statusNameEl.style.color = statusColor;
  statusIconBox.style.borderColor = `${statusColor}40`;
  statusIconBox.style.background = `${statusColor}0D`;
  statusIconBox.innerHTML = `<i data-lucide="${statusIcon}" style="color: ${statusColor}; width: 28px; height: 28px;"></i>`;

  // Update Stress Score Scoreboard
  document.getElementById('stressScoreNum').textContent = stressScore;
  const stressScoreFill = document.getElementById('stressScoreFill');
  stressScoreFill.style.width = `${stressScore}%`;
  stressScoreFill.style.backgroundColor = statusColor;

  // Resolve Insight advisory message
  const insightResult = window.getActionableInsight ? window.getActionableInsight(status, voltage, current, temp, gyro) : { header: status, message: insight, severity: 'info' };
  document.getElementById('insightHeader').textContent = insightResult.header;
  document.getElementById('insightText').textContent = insightResult.message;
  
  const insightContainer = document.getElementById('insightContainer');
  if (status === 'Risk') {
    insightContainer.style.background = 'rgba(255, 82, 82, 0.08)';
    insightContainer.style.borderColor = 'rgba(255, 82, 82, 0.3)';
    document.getElementById('insightHeader').style.color = 'var(--red)';
  } else if (status === 'Stress') {
    insightContainer.style.background = 'rgba(255, 213, 79, 0.06)';
    insightContainer.style.borderColor = 'rgba(255, 213, 79, 0.2)';
    document.getElementById('insightHeader').style.color = 'var(--yellow)';
  } else {
    insightContainer.style.background = 'rgba(0, 229, 255, 0.04)';
    insightContainer.style.borderColor = 'rgba(0, 229, 255, 0.15)';
    document.getElementById('insightHeader').style.color = 'var(--teal)';
  }

  // Refresh lucide icons for status elements
  lucide.createIcons();
}

// Handle Historical Log UI updates
function updateHistoryUI(historyArray) {
  if (!historyArray || historyArray.length === 0) return;

  // Sort logs chronological (old to new) for chart loading
  const chronological = [...historyArray].reverse();
  
  // Update Chart streams
  if (window.clearCharts && window.pushChartData) {
    window.clearCharts();
    chronological.forEach(log => {
      window.pushChartData(log.timestamp, log.voltage, log.current, log.temp, log.gyro);
    });
  }

  // Render logs list (newest first)
  const logContainer = document.getElementById('terminalLog');
  logContainer.innerHTML = historyArray.map(log => {
    let statColor = 'var(--green)';
    if (log.status === 'Stress') statColor = 'var(--yellow)';
    else if (log.status === 'Risk') statColor = 'var(--red)';
    
    return `
      <div class="log-entry">
        <span class="log-time">[${getFormattedTime(log.timestamp)}]</span>
        <span class="log-status" style="color: ${statColor}">${log.status}</span>
        <span class="log-vals">&rarr; V: ${log.voltage}V, I: ${log.current}A, Temp: ${log.temp}°C, Gyro: ${log.gyro} dps (Stress: ${log.stressScore}%)</span>
      </div>
    `;
  }).join('');
}

// REST HTTP Polling fallback loop
function startHttpPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  const fetchTelemetry = async () => {
    try {
      // Fetch latest doc
      const latestRes = await fetch('/api/telemetry/latest');
      if (latestRes.ok) {
        const latest = await latestRes.json();
        const data = latest.data;
        if (data && data.timestamp) {
          data.timestamp = parseTimestamp(data.timestamp).toISOString();
        }
        updateLatestUI(data);
      }
      
      // Fetch history docs
      const historyRes = await fetch('/api/telemetry/history?limit=30');
      if (historyRes.ok) {
        const history = await historyRes.json();
        const historyData = history.data || [];
        historyData.forEach(log => {
          if (log.timestamp) {
            log.timestamp = parseTimestamp(log.timestamp).toISOString();
          }
        });
        updateHistoryUI(historyData);
      }
    } catch (err) {
      console.error('HTTP Polling Error:', err.message);
    }
  };

  fetchTelemetry();
  pollingInterval = setInterval(fetchTelemetry, 3000);
}

// Settings Modal Action handlers
function openSettings() {
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings(event) {
  event.preventDefault();
  
  const configInput = document.getElementById('firebaseConfigInput').value.trim();
  
  if (!configInput) {
    localStorage.removeItem('voltsense_firebase_config');
    alert('Firebase credentials cleared. Reverting to HTTP polling mode.');
    window.location.reload();
    return;
  }
  
  try {
    // Validate JSON
    const parsed = JSON.parse(configInput);
    
    // Check if valid Firebase configuration structure
    if (!parsed.projectId || !parsed.apiKey) {
      alert('Error: Invalid Firebase configuration object structure. Must contain at least projectId and apiKey.');
      return;
    }
    
    localStorage.setItem('voltsense_firebase_config', JSON.stringify(parsed));
    alert('Firebase configuration saved successfully! Reloading dashboard...');
    window.location.reload();
  } catch (err) {
    alert('Error parsing JSON configuration. Please make sure it is a valid JSON object string.');
  }
}

// Initialization on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  // 1. Sync current time and trigger live clock updates
  syncClock();
  setInterval(syncClock, 1000);
  
  // 2. Render initial chart canvas frames
  if (window.initCharts) {
    window.initCharts();
  }

  // 3. Populate pre-filled config inputs if already configured
  const currentConfig = localStorage.getItem('voltsense_firebase_config');
  if (currentConfig) {
    try {
      document.getElementById('firebaseConfigInput').value = JSON.stringify(JSON.parse(currentConfig), null, 2);
    } catch(e) {}
  }
  
  // 4. Run Firebase or fallback REST HTTP API subscriber listener
  isFirebaseMode = window.initFirebaseClient ? window.initFirebaseClient() : false;
  
  const modeBadgeText = document.getElementById('modeBadgeText');
  const connStatusText = document.getElementById('connStatusText');
  const connectionBadge = document.getElementById('connectionBadge');

  if (isFirebaseMode) {
    // Set UI badges for Real-time Firebase listeners
    modeBadgeText.textContent = 'Firestore Mode';
    connStatusText.textContent = 'Connected (Firestore)';
    connectionBadge.className = 'status-badge';
    
    // Connect client updates
    const active = window.setupRealtimeListeners(updateLatestUI, updateHistoryUI);
    if (!active) {
      console.warn('Real-time listener setup failed. Falling back to HTTP polling.');
      startHttpPolling();
    }
  } else {
    // Set UI badges for REST polling
    modeBadgeText.textContent = 'Local Server Mode';
    connStatusText.textContent = 'Connected (Server Polling)';
    connectionBadge.className = 'status-badge simulation';
    
    startHttpPolling();
  }

  // Bind icons
  lucide.createIcons();
});

// Cleanups
window.addEventListener('beforeunload', () => {
  if (pollingInterval) clearInterval(pollingInterval);
  if (window.cleanupListeners) window.cleanupListeners();
});
