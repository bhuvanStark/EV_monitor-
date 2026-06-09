let charts = {
  voltage: null,
  current: null,
  temp: null,
  gyro: null
};

const CHART_HISTORY_LIMIT = 30;

function initCharts() {
  const chartOptionsBase = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        titleFont: { family: 'Exo 2', size: 10 },
        bodyFont: { family: 'Inter', size: 11 },
        borderColor: '#1E2942',
        borderWidth: 1,
        displayColors: false
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#5A697F',
          font: { family: 'JetBrains Mono', size: 8 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6
        }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: {
          color: '#5A697F',
          font: { family: 'JetBrains Mono', size: 8 }
        }
      }
    },
    elements: {
      point: { radius: 0, hoverRadius: 3, hitRadius: 8 },
      line: { tension: 0.3 }
    }
  };

  // 1. Voltage Chart
  const ctxVolts = document.getElementById('chartVoltage').getContext('2d');
  charts.voltage = new Chart(ctxVolts, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#00E5FF', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(0, 229, 255, 0.02)' }] },
    options: {
      ...chartOptionsBase,
      scales: { ...chartOptionsBase.scales, y: { ...chartOptionsBase.scales.y, min: 2.8, max: 4.4 } }
    }
  });

  // 2. Current Chart
  const ctxCurrent = document.getElementById('chartCurrent').getContext('2d');
  charts.current = new Chart(ctxCurrent, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#00E676', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(0, 230, 118, 0.02)' }] },
    options: {
      ...chartOptionsBase,
      scales: { ...chartOptionsBase.scales, y: { ...chartOptionsBase.scales.y, min: 0, max: 12.0 } }
    }
  });

  // 3. Temp Chart
  const ctxTemp = document.getElementById('chartTemp').getContext('2d');
  charts.temp = new Chart(ctxTemp, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#FF5252', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(255, 82, 82, 0.02)' }] },
    options: {
      ...chartOptionsBase,
      scales: { ...chartOptionsBase.scales, y: { ...chartOptionsBase.scales.y, min: 20, max: 70 } }
    }
  });

  // 4. Gyro Chart
  const ctxGyro = document.getElementById('chartGyro').getContext('2d');
  charts.gyro = new Chart(ctxGyro, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#FF9100', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(255, 145, 0, 0.02)' }] },
    options: {
      ...chartOptionsBase,
      scales: { ...chartOptionsBase.scales, y: { ...chartOptionsBase.scales.y, min: 0, max: 260 } }
    }
  });
}

function pushChartData(timestamp, voltage, current, temp, gyro) {
  const timeLabel = timestamp.includes(':') ? (timestamp.includes(' ') ? timestamp.split(' ')[1] : timestamp) : timestamp;
  
  function updateLineChart(chartInstance, val) {
    if (!chartInstance) return;
    chartInstance.data.labels.push(timeLabel);
    chartInstance.data.datasets[0].data.push(val);
    
    if (chartInstance.data.labels.length > CHART_HISTORY_LIMIT) {
      chartInstance.data.labels.shift();
      chartInstance.data.datasets[0].data.shift();
    }
    chartInstance.update('none');
  }

  updateLineChart(charts.voltage, voltage);
  updateLineChart(charts.current, current);
  updateLineChart(charts.temp, temp);
  updateLineChart(charts.gyro, gyro);
}

function clearCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].data.labels = [];
      charts[key].data.datasets[0].data = [];
      charts[key].update();
    }
  });
}

window.initCharts = initCharts;
window.pushChartData = pushChartData;
window.clearCharts = clearCharts;
