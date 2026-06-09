/**
 * Helper library to resolve actionable advice based on battery status and state.
 */
function getActionableInsight(status, voltage, current, temp, gyro) {
  let header = 'Optimal Riding';
  let message = 'All systems operational. Battery telemetry is within safe limits.';
  let severity = 'info';

  if (status === 'Risk') {
    severity = 'critical';
    header = 'CRITICAL ALARM';
    if (temp > 48) {
      message = `Battery overheating (${temp}°C)! Pull over immediately, switch off the ignition, and let the pack cool down to avoid thermal runaway.`;
    } else if (current > 6.0) {
      message = `Current spike alert (${current}A)! Severe controller or motor overload. Stop driving immediately to inspect power electronics.`;
    } else if (voltage < 3.3) {
      message = `Critical under-voltage (${voltage}V)! Battery pack is completely depleted. Do not draw further load; charge the vehicle immediately.`;
    } else if (gyro > 120) {
      message = `Extreme chassis movement/vibration (${gyro} dps) or drop event detected. Halt the vehicle to inspect structural integrity and pack mounts.`;
    } else {
      message = 'Multiple safety bounds exceeded. Shutdown power output and request technical support.';
    }
  } else if (status === 'Stress') {
    severity = 'warning';
    header = 'STRESS WARNING';
    if (temp > 38) {
      message = `High thermal level (${temp}°C). Reduce driving speed, avoid steep inclines, and avoid aggressive acceleration to allow natural cooling.`;
    } else if (current > 3.0) {
      message = `High current draw (${current}A). Avoid rapid throttle opening. Smooth out throttle inputs to prolong battery health.`;
    } else if (voltage < 3.6) {
      message = `Low voltage sag (${voltage}V). Battery energy level is dropping. Head to the nearest charging station soon.`;
    } else if (gyro > 40) {
      message = `Elevated vibration level (${gyro} dps). You are driving on a bumpy/unstable road. Maintain caution and steady speeds.`;
    } else {
      message = 'Battery pack is experiencing high strain. Adjust riding profile.';
    }
  } else {
    // Healthy
    if (voltage > 4.1) {
      message = 'Battery is fully charged. Regenerative braking may be limited until capacity drops below 95%.';
    } else {
      message = 'Excellent! Your riding pattern is optimal. Steady throttle inputs will help maximize battery State-of-Health (SOH).';
    }
  }

  return { header, message, severity };
}

// Export if running in Node, else expose to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getActionableInsight };
} else {
  window.getActionableInsight = getActionableInsight;
}
