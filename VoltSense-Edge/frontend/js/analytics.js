// VoltSense EV Battery Intelligence Analytics Controller

const urlParams = new URLSearchParams(window.location.search);
const vehicleId = urlParams.get('vehicle') || 'vehicle01';

const friendlyNames = {
  'vehicle01': 'VoltSense Prototype (LIVE)',
  'vehicle02': 'Delivery Rider EV-02',
  'vehicle03': 'Campus Shuttle EV-03',
  'vehicle04': 'Warehouse Forklift EV-04',
  'vehicle05': 'Rental Scooter EV-05'
};

let isFirebaseMode = false;
let pollingInterval = null;
let historyData = [];

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

// Helper to format date keys
function getDateString(timestamp) {
  const d = parseTimestamp(timestamp);
  return d.toISOString().split('T')[0];
}

function getFormattedTime(timestamp) {
  const d = parseTimestamp(timestamp);
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Generate an array of date strings for the last 14 days
function getLast14DaysArray() {
  const dates = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Calculate the average of a specific field
function calculateAverage(arr, key) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);
  return sum / arr.length;
}

// Perform calculations and update the analytics widgets
function computeStatistics() {
  if (historyData.length === 0) return;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Filter for last 7 days metrics
  const last7DaysLogs = historyData.filter(log => parseTimestamp(log.timestamp) >= sevenDaysAgo);
  const dataForAverages = last7DaysLogs.length > 0 ? last7DaysLogs : historyData;

  // 1. Weekly Averages
  const avgStress = calculateAverage(dataForAverages, 'stressScore');
  const avgTemp = calculateAverage(dataForAverages, 'temp');
  const avgCurrent = calculateAverage(dataForAverages, 'current');
  const peakTemp = Math.max(...dataForAverages.map(d => Number(d.temp) || 0));
  const peakCurrent = Math.max(...dataForAverages.map(d => Number(d.current) || 0));

  // Update UI values for section 3 & 4
  document.getElementById('thermalWeeklyAvg').textContent = `${avgTemp.toFixed(1)} °C`;
  document.getElementById('thermalWeeklyPeak').textContent = `${peakTemp.toFixed(1)} °C`;
  document.getElementById('loadAvg').textContent = `${avgCurrent.toFixed(2)} A`;
  document.getElementById('loadPeak').textContent = `${peakCurrent.toFixed(2)} A`;

  // Calculate hours above safe thermal threshold (45°C)
  // Estimated as percentage of logged points multiplied by 168 hours in a week
  const hotPointsCount = dataForAverages.filter(d => Number(d.temp) > 45).length;
  const hotPercentage = hotPointsCount / dataForAverages.length;
  const estHotHours = hotPercentage * 168;
  document.getElementById('thermalHotHours').textContent = `${estHotHours.toFixed(1)} hrs`;

  // Calculate high load events (>6A) & voltage sags (<3.4V under load >3A)
  const highLoadCount = dataForAverages.filter(d => Number(d.current) > 6.0).length;
  const sagCount = dataForAverages.filter(d => Number(d.voltage) < 3.4 && Number(d.current) > 3.0).length;
  document.getElementById('loadHighEventsCount').textContent = highLoadCount;
  document.getElementById('loadSagEventsCount').textContent = sagCount;

  // Temperature Trend Calculation (last 3 days vs preceding 3 days)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  
  const recentTempLogs = dataForAverages.filter(d => parseTimestamp(d.timestamp) >= threeDaysAgo);
  const olderTempLogs = dataForAverages.filter(d => {
    const t = parseTimestamp(d.timestamp);
    return t >= sixDaysAgo && t < threeDaysAgo;
  });
  
  const avgRecentTemp = calculateAverage(recentTempLogs, 'temp');
  const avgOlderTemp = calculateAverage(olderTempLogs, 'temp');
  
  const trendEl = document.getElementById('thermalTrend');
  if (avgRecentTemp > avgOlderTemp + 0.5) {
    trendEl.className = 'trend-indicator trend-up';
    trendEl.innerHTML = '<i data-lucide="trending-up" size="12"></i> Rising';
  } else if (avgRecentTemp < avgOlderTemp - 0.5) {
    trendEl.className = 'trend-indicator trend-down';
    trendEl.innerHTML = '<i data-lucide="trending-down" size="12"></i> Cooling';
  } else {
    trendEl.className = 'trend-indicator trend-stable';
    trendEl.innerHTML = '<i data-lucide="minus" size="12"></i> Stable';
  }

  // 2. Riding Behavior calculations (last 7 days)
  const avgGyro = calculateAverage(dataForAverages, 'gyro');
  const liveGyro = historyData[historyData.length - 1].gyro || 0;
  const liveSmoothness = Math.max(0, Math.min(100, Math.round(100 - (liveGyro / 2.5))));
  document.getElementById('rideSmoothness').textContent = `${liveSmoothness}%`;
  
  const aggressiveEventsCount = dataForAverages.filter(d => Number(d.gyro) > 80.0).length;
  document.getElementById('rideAggressiveIncidents').textContent = aggressiveEventsCount;

  // 3. Daily Stats for the 14-day charts
  const dayLabels = getLast14DaysArray();
  const stressAverages = [];
  const stressCounts = [];
  const riskCounts = [];
  const gyroAverages = [];
  const smoothnessAverages = [];

  const dayAggregates = dayLabels.map(day => {
    const dayLogs = historyData.filter(d => getDateString(d.timestamp) === day);
    const avgStress = calculateAverage(dayLogs, 'stressScore');
    const stressCount = dayLogs.filter(d => d.status === 'Stress').length;
    const riskCount = dayLogs.filter(d => d.status === 'Risk').length;
    const avgGyro = calculateAverage(dayLogs, 'gyro');
    
    // Smoothness defined as inverse of gyro
    const smoothness = dayLogs.length > 0 
      ? Math.max(0, Math.min(100, 100 - (avgGyro / 2.5)))
      : 100;

    return {
      day,
      avgStress,
      stressCount,
      riskCount,
      avgGyro,
      smoothness
    };
  });

  dayAggregates.forEach(item => {
    stressAverages.push(Math.round(item.avgStress));
    stressCounts.push(item.stressCount);
    riskCounts.push(item.riskCount);
    gyroAverages.push(Math.round(item.avgGyro));
    smoothnessAverages.push(Math.round(item.smoothness));
  });

  // Calculate Most Aggressive and Most Stable Day
  let maxGyro = -1;
  let minGyro = 999999;
  let maxDayStr = 'N/A';
  let minDayStr = 'N/A';

  dayAggregates.forEach(item => {
    // Only count days that have actual telemetry logged
    const dayLogs = historyData.filter(d => getDateString(d.timestamp) === item.day);
    if (dayLogs.length > 0) {
      if (item.avgGyro > maxGyro) {
        maxGyro = item.avgGyro;
        maxDayStr = formatDateLabel(item.day);
      }
      if (item.avgGyro < minGyro) {
        minGyro = item.avgGyro;
        minDayStr = formatDateLabel(item.day);
      }
    }
  });

  document.getElementById('rideMaxDay').textContent = maxDayStr;
  document.getElementById('rideMinDay').textContent = minDayStr;

  // Render/Update Charts
  updateCharts(dayLabels, stressAverages, stressCounts, riskCounts, gyroAverages, smoothnessAverages);

  // 4. Section 6: Correlation Analysis
  // Find logs where status is not Healthy (Stress or Risk)
  const anomalyLogs = historyData.filter(d => d.status === 'Stress' || d.status === 'Risk');
  if (anomalyLogs.length > 0) {
    const highCurrentAnomalies = anomalyLogs.filter(d => Number(d.current) > 4.0).length;
    const highVibAnomalies = anomalyLogs.filter(d => Number(d.gyro) > 40.0).length;
    const highTempAnomalies = anomalyLogs.filter(d => Number(d.temp) > 38.0).length;

    const currentPct = Math.round((highCurrentAnomalies / anomalyLogs.length) * 100);
    const vibPct = Math.round((highVibAnomalies / anomalyLogs.length) * 100);
    const tempPct = Math.round((highTempAnomalies / anomalyLogs.length) * 100);

    document.getElementById('correlCurrent').textContent = `${currentPct}%`;
    document.getElementById('correlVibration').textContent = `${vibPct}%`;
    document.getElementById('correlTemp').textContent = `${tempPct}%`;
  } else {
    document.getElementById('correlCurrent').textContent = '0%';
    document.getElementById('correlVibration').textContent = '0%';
    document.getElementById('correlTemp').textContent = '0%';
  }

  // 5. Section 1: Live Overview & Comparison Highlights
  const latestLog = historyData[historyData.length - 1];
  
  const statusEl = document.getElementById('liveStatus');
  statusEl.textContent = latestLog.status;
  
  let statusColor = 'var(--green)';
  let statusIcon = 'check-circle';
  if (latestLog.status === 'Stress') {
    statusColor = 'var(--yellow)';
    statusIcon = 'alert-triangle';
  } else if (latestLog.status === 'Risk') {
    statusColor = 'var(--red)';
    statusIcon = 'alert-octagon';
  }
  statusEl.style.color = statusColor;
  document.getElementById('statusCompare').innerHTML = `<i data-lucide="${statusIcon}" size="12" style="color: ${statusColor}"></i> <span>Driven by Decision Tree local ML model.</span>`;

  // Stress Score Live
  document.getElementById('liveStress').textContent = latestLog.stressScore;
  const barStress = document.getElementById('barStress');
  barStress.style.width = `${latestLog.stressScore}%`;
  barStress.style.background = statusColor;
  
  const stressDiff = latestLog.stressScore - avgStress;
  if (stressDiff > 0) {
    document.getElementById('stressCompare').innerHTML = `Current stress is <span class="comparison-highlight" style="color: var(--yellow);">${stressDiff.toFixed(0)}% above</span> weekly average.`;
  } else {
    document.getElementById('stressCompare').innerHTML = `Current stress is <span class="comparison-highlight" style="color: var(--green);">${Math.abs(stressDiff).toFixed(0)}% below</span> weekly average.`;
  }

  // Temp Live
  document.getElementById('liveTemp').textContent = Number(latestLog.temp).toFixed(1);
  document.getElementById('thermalCurrent').textContent = `${Number(latestLog.temp).toFixed(1)} °C`;
  const tempDiff = latestLog.temp - avgTemp;
  if (tempDiff > 0) {
    document.getElementById('tempCompare').innerHTML = `Current temp is <span class="comparison-highlight" style="color: var(--red);">${tempDiff.toFixed(1)}°C above</span> average operating benchmark.`;
  } else {
    document.getElementById('tempCompare').innerHTML = `Current temp is <span class="comparison-highlight" style="color: var(--green);">${Math.abs(tempDiff).toFixed(1)}°C below</span> average operating benchmark.`;
  }

  // Current Draw Live
  document.getElementById('liveCurrent').textContent = Number(latestLog.current).toFixed(2);
  const isHighDraw = latestLog.current > (avgCurrent * 1.5);
  if (isHighDraw) {
    document.getElementById('currentCompare').innerHTML = `Current draw is <span class="comparison-highlight" style="color: var(--orange);">elevated</span> compared to typical operating average.`;
  } else {
    document.getElementById('currentCompare').innerHTML = `Current draw is <span class="comparison-highlight" style="color: var(--green);">within typical</span> operating range.`;
  }

  lucide.createIcons();
}

function formatDateLabel(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parts[2]} ${months[parseInt(parts[1]) - 1]}`;
}

// Chart.js instances
let chartStressInstance = null;
let chartRidingInstance = null;

function updateCharts(labels, stressAverages, stressCounts, riskCounts, gyroAverages, smoothnessAverages) {
  const formattedLabels = labels.map(l => formatDateLabel(l));

  // Chart 1: Stress Score Trend
  if (!chartStressInstance) {
    const ctx = document.getElementById('chartStressHistory').getContext('2d');
    chartStressInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: formattedLabels,
        datasets: [
          {
            label: 'Risk Events',
            data: riskCounts,
            backgroundColor: 'rgba(255, 82, 82, 0.55)',
            borderColor: 'var(--red)',
            borderWidth: 1,
            stack: 'events',
            yAxisID: 'yEvents'
          },
          {
            label: 'Stress Events',
            data: stressCounts,
            backgroundColor: 'rgba(255, 213, 79, 0.45)',
            borderColor: 'var(--yellow)',
            borderWidth: 1,
            stack: 'events',
            yAxisID: 'yEvents'
          },
          {
            label: 'Average Stress Index',
            type: 'line',
            data: stressAverages,
            borderColor: 'var(--teal)',
            backgroundColor: 'rgba(0, 229, 255, 0.05)',
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            yAxisID: 'yStress'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: 'var(--text-secondary)', font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 } }
          },
          yStress: {
            position: 'left',
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 } },
            title: { display: true, text: 'Stress Score (%)', color: 'var(--teal)', font: { size: 9 } }
          },
          yEvents: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 }, stepSize: 1 },
            title: { display: true, text: 'Anomaly Logs', color: 'var(--yellow)', font: { size: 9 } }
          }
        }
      }
    });
  } else {
    chartStressInstance.data.labels = formattedLabels;
    chartStressInstance.data.datasets[0].data = riskCounts;
    chartStressInstance.data.datasets[1].data = stressCounts;
    chartStressInstance.data.datasets[2].data = stressAverages;
    chartStressInstance.update('none');
  }

  // Chart 2: Riding Behavior Trend
  if (!chartRidingInstance) {
    const ctx = document.getElementById('chartRidingHistory').getContext('2d');
    chartRidingInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [
          {
            label: 'Smoothness Rating (%)',
            data: smoothnessAverages,
            borderColor: 'var(--green)',
            backgroundColor: 'rgba(0, 230, 118, 0.04)',
            borderWidth: 2,
            pointRadius: 2,
            fill: true,
            yAxisID: 'ySmooth'
          },
          {
            label: 'Average Gyro (dps)',
            data: gyroAverages,
            borderColor: 'var(--orange)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 2,
            fill: false,
            yAxisID: 'yGyro'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: 'var(--text-secondary)', font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 } }
          },
          ySmooth: {
            position: 'left',
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 } },
            title: { display: true, text: 'Smoothness (%)', color: 'var(--green)', font: { size: 9 } }
          },
          yGyro: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: 'var(--text-secondary)', font: { size: 9 } },
            title: { display: true, text: 'Chassis Gyro (dps)', color: 'var(--orange)', font: { size: 9 } }
          }
        }
      }
    });
  } else {
    chartRidingInstance.data.labels = formattedLabels;
    chartRidingInstance.data.datasets[0].data = smoothnessAverages;
    chartRidingInstance.data.datasets[1].data = gyroAverages;
    chartRidingInstance.update('none');
  }
}

// Fetch Weekly Diagnostic Summary
async function loadWeeklySummaryReport() {
  try {
    const res = await fetch(`/api/analytics/summary?vehicle=${vehicleId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.summary) {
        document.getElementById('intelligenceSummary').textContent = data.summary;
      } else {
        document.getElementById('intelligenceSummary').textContent = 'Unable to fetch report summary. Using heuristics fallback.';
      }
    }
  } catch (err) {
    console.error('Summary API Error:', err.message);
    document.getElementById('intelligenceSummary').textContent = 'Network error loading report summary. Default heuristics active.';
  }
}

// REST Polling subscriber updates
function startHttpPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  const pollTelemetry = async () => {
    try {
      const res = await fetch(`/api/telemetry/latest?vehicle=${vehicleId}`);
      if (res.ok) {
        const latest = await res.json();
        if (latest.success && latest.data) {
          handleIncomingLiveUpdate(latest.data);
        }
      }
    } catch (e) {
      console.error('HTTP Polling Live Update Error:', e.message);
    }
  };
  
  pollingInterval = setInterval(pollTelemetry, 3000);
}

// Push new telemetry update dynamically
function handleIncomingLiveUpdate(latestData) {
  if (!latestData || !latestData.timestamp) return;
  
  // Update Live Sync display
  document.getElementById('liveTime').textContent = getFormattedTime(latestData.timestamp);
  
  // Check if we already have this record in history to avoid duplicates
  const exists = historyData.some(d => d.timestamp === latestData.timestamp);
  if (!exists) {
    historyData.push(latestData);
    if (historyData.length > 1200) historyData.shift();
  }
  
  // Recalculate stats and update layout metrics
  computeStatistics();
}

// Fetch all historical telemetry on load
async function fetchHistoryAndRun() {
  try {
    const res = await fetch(`/api/telemetry/history?limit=1000&vehicle=${vehicleId}`);
    if (res.ok) {
      const historyRes = await res.json();
      if (historyRes.success && historyRes.data) {
        // Reverse so that oldest is index 0 (chronological order)
        historyData = [...historyRes.data].reverse();
        console.log(`Loaded ${historyData.length} historical baseline points for ${vehicleId}.`);
        
        computeStatistics();
      }
    }
  } catch (err) {
    console.error('Failed to load historical analytics records:', err.message);
  }
}

// Document initialized
window.addEventListener('DOMContentLoaded', async () => {
  // Update Subtitle dynamically based on vehicle friendly name
  const vehicleName = friendlyNames[vehicleId] || 'VoltSense Fleet Vehicle';
  const subtitleEl = document.querySelector('.logo-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `Fleet Intelligence Report — ${vehicleName}`;
  }

  // 1. Initial history load
  await fetchHistoryAndRun();
  
  // 2. Fetch AI Summary from backend
  await loadWeeklySummaryReport();
  
  // 3. Initialize Firebase or fallback REST sync
  isFirebaseMode = window.initFirebaseClient ? window.initFirebaseClient() : false;
  
  const modeBadgeText = document.getElementById('modeBadgeText');
  const connStatusText = document.getElementById('connStatusText');
  const connectionBadge = document.getElementById('connectionBadge');

  if (isFirebaseMode) {
    modeBadgeText.textContent = 'Firestore Mode';
    connStatusText.textContent = 'Connected (Firestore)';
    connectionBadge.className = 'status-badge';
    
    // Subscribe to latest doc updates of this specific vehicle
    const dbInstance = window.getFirestoreDb();
    if (dbInstance) {
      const docRef = vehicleId === 'vehicle01'
        ? dbInstance.collection('battery_data').doc('latest')
        : dbInstance.collection(vehicleId).doc('vehicleInfo');

      docRef.onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            if (data.timestamp && typeof data.timestamp.toDate === 'function') {
              data.timestamp = data.timestamp.toDate().toISOString();
            }
            handleIncomingLiveUpdate(data);
          }
        }, err => console.error('Firestore real-time subscriber error:', err));
    }
  } else {
    modeBadgeText.textContent = 'Local Server Mode';
    connStatusText.textContent = 'Connected (Polling)';
    connectionBadge.className = 'status-badge simulation';
    
    startHttpPolling();
  }
  
  lucide.createIcons();
});

// Cleanups
window.addEventListener('beforeunload', () => {
  if (pollingInterval) clearInterval(pollingInterval);
});
