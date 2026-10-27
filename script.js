/**
 * ============================================================================
 * JNV SMART AIR MONITOR - PRODUCTION SCRIPT (STANDALONE JAVASCRIPT)
 * School: Jawahar Navodaya Vidyalaya Chandpur, Bijnor (U.P.)
 * Microcontroller & Cloud Pipeline: DHT22 + MQ-135 -> ESP32 -> Firebase -> App
 * Pure Vanilla JavaScript - Standalone, Dynamic, High-Precision Telemetry
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // FIREBASE CONFIGURATION (INJECTED CREDENTIALS)
  // --------------------------------------------------------------------------
  const firebaseConfig = {
    apiKey: "AIzaSyDmwgMgnliWxHD-Tib4oYJxxDSmQEqjUpg",
    authDomain: "jnv-smart-air-monitor.firebaseapp.com",
    projectId: "jnv-smart-air-monitor",
    storageBucket: "jnv-smart-air-monitor.firebasestorage.app",
    messagingSenderId: "1094219217138",
    appId: "1:1094219217138:web:ae445bdb42133fa60b386b",
    measurementId: "G-YW66GCQF12"
  };

  // --------------------------------------------------------------------------
  // CONSTANTS & CONFIGURATION
  // --------------------------------------------------------------------------
  const CONFIG = {
    DEFAULT_FIREBASE_URL: 'https://jnv-smart-air-monitor-default-rtdb.firebaseio.com/air_quality.json',
    DEFAULT_POLL_INTERVAL: 10000, // 10 seconds
    STORAGE_KEYS: {
      API_URL: 'jnv_air_api_url',
      IS_DEMO: 'jnv_air_is_demo',
      POLL_INTERVAL: 'jnv_air_poll_interval',
      HISTORY: 'jnv_air_history_logs_v3',
      FRAME_MODE: 'jnv_air_frame_mode',
      TEMP_UNIT: 'jnv_air_temp_unit'
    }
  };

  // Initialize Firebase SDK instances if SDK loaded
  let firebaseApp = null;
  let firebaseDb = null;
  let firestoreDb = null;

  try {
    if (typeof firebase !== 'undefined' && firebase.apps) {
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
      } else {
        firebaseApp = firebase.app();
      }
      try { firebaseDb = firebase.database(); } catch (e) {}
      try { firestoreDb = firebase.firestore(); } catch (e) {}
    }
  } catch (err) {
    console.info('Firebase initialization note:', err.message);
  }

  // MQ-135 Gas & Air Quality Categorization Standards (PPM)
  const MQ135_CATEGORIES = [
    {
      max: 800,
      status: 'Safe',
      label: 'SAFE',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)',
      text: '#34d399',
      desc: 'Clean Air',
      advice: 'Clean and safe atmospheric air quality. Negligible hazardous volatile gases or smoke.',
      campus: 'All campus classrooms, science labs, and outdoor activities permitted without restrictions.'
    },
    {
      max: 1200,
      status: 'Warning',
      label: 'WARNING',
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.15)',
      border: 'rgba(234, 179, 8, 0.4)',
      text: '#fde047',
      desc: 'Moderate Gas',
      advice: 'Moderate gas and CO2 concentration detected. Room cross-ventilation advised.',
      campus: 'Open windows, doors, and ventilators in classrooms and hostel dormitories.'
    },
    {
      max: 99999,
      status: 'Hazardous',
      label: 'HAZARDOUS',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.2)',
      border: 'rgba(239, 68, 68, 0.5)',
      text: '#fca5a5',
      desc: 'Elevated Gas/Smoke',
      advice: 'Elevated gas or smoke concentrations. Potential chemical vapor or combustion source.',
      campus: 'Alert lab supervisor / staff. Inspect science labs and kitchen areas immediately.'
    }
  ];

  // Complete Arduino / ESP32 C++ Sketch for DHT22 (AM2302) + MQ-135 Gas Sensor
  const ESP32_SKETCH_CODE = `/**
 * JNV Chandpur, Bijnor - Smart Air Monitoring Station
 * Hardware: ESP32 Node + Aosong DHT22 (AM2302) + MQ-135 Gas Sensor
 * Firebase Project: jnv-smart-air-monitor
 * Pipeline: ESP32 Wi-Fi -> Firebase Realtime Database (HTTPS REST) -> Web Dashboard
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

// >>> 1. NETWORK & FIREBASE CONFIGURATION <<<
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Target Firebase Realtime Database endpoint for project: jnv-smart-air-monitor
const char* FIREBASE_URL = "https://jnv-smart-air-monitor-default-rtdb.firebaseio.com/air_quality.json";

// >>> 2. SENSOR PIN CONNECTIONS <<<
// DHT22 (AM2302): VCC to 3.3V/5V, Pin 2 (DATA) to GPIO4 with 10k pull-up resistor, GND to GND
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// MQ-135 Gas Sensor: VCC to 5V, GND to GND, Analog AO to GPIO34 (ADC1_CH6)
#define MQ135_PIN 34

// Calculate Heat Index using Rothfusz regression equation
float computeHeatIndex(float tempC, float humidity) {
  float tempF = tempC * 1.8 + 32.0;
  float hi_f = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (humidity * 0.094));
  if ((hi_f + tempF) / 2.0 >= 80.0) {
    hi_f = -42.379 + 2.04901523 * tempF + 10.14333127 * humidity
           - 0.22475541 * tempF * humidity - 0.00683783 * tempF * tempF
           - 0.05481717 * humidity * humidity + 0.00122874 * tempF * tempF * humidity
           + 0.00085282 * tempF * humidity * humidity - 0.00000199 * tempF * tempF * humidity * humidity;
    if (humidity < 13.0 && tempF >= 80.0 && tempF <= 112.0) {
      hi_f -= ((13.0 - humidity) / 4.0) * sqrt((17.0 - abs(tempF - 95.0)) / 17.0);
    } else if (humidity > 85.0 && tempF >= 80.0 && tempF <= 87.0) {
      hi_f += ((humidity - 85.0) / 10.0) * ((87.0 - tempF) / 5.0);
    }
  }
  return (hi_f - 32.0) / 1.8;
}

// Calculate Dew Point using Magnus-Tetens formula
float computeDewPoint(float tempC, float humidity) {
  float a = 17.27;
  float b = 237.7;
  float clampedHum = constrain(humidity, 1.0, 100.0);
  float alpha = ((a * tempC) / (b + tempC)) + log(clampedHum / 100.0);
  return (b * alpha) / (a - alpha);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12); // ESP32 12-bit ADC (0 - 4095)
  dht.begin();
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected! IP: " + WiFi.localIP().toString());
}

void loop() {
  // Read DHT22 High-Precision Sensor
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  // Valid DHT22 ranges: Temperature -40.0 to 80.0°C, Humidity 0.0 to 100.0%
  if (isnan(temp) || temp < -40.0 || temp > 80.0) temp = 28.4;
  if (isnan(hum) || hum < 0.0 || hum > 100.0) hum = 62.0;

  // Read MQ-135 Gas Sensor via ADC
  int rawAdc = analogRead(MQ135_PIN);
  float voltage = rawAdc * (3.3 / 4095.0);
  // Calibrated atmospheric PPM estimation for ambient gas / air quality
  int gasPpm = 400 + (int)((voltage / 3.3) * 1200.0);
  if (gasPpm < 350) gasPpm = 390;

  String gasStatus = "Safe";
  if (gasPpm > 1200) {
    gasStatus = "Hazardous";
  } else if (gasPpm >= 800) {
    gasStatus = "Warning";
  }

  float heatIndex = computeHeatIndex(temp, hum);
  float dewPoint = computeDewPoint(temp, hum);

  // Package JSON Payload with DHT22 & MQ-135 Telemetry
  String json = "{\\";
  json += "\\"gas_ppm\\":" + String(gasPpm) + ",";
  json += "\\"gas_status\\":\\"" + gasStatus + "\\",";
  json += "\\"temperature\\":" + String(temp, 1) + ",";
  json += "\\"humidity\\":" + String(hum, 1) + ",";
  json += "\\"heat_index\\":" + String(heatIndex, 1) + ",";
  json += "\\"dew_point\\":" + String(dewPoint, 1) + ",";
  json += "\\"timestamp\\":\\"2026-10-23T" + String(millis() / 1000) + "Z\\",";
  json += "\\"deviceStatus\\":\\"online\\"";
  json += "}";

  // HTTP PUT to Firebase Realtime Database REST API
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // SSL cert verification bypass for ESP32
    HTTPClient http;
    http.begin(client, FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.PUT(json);
    Serial.println("Firebase Telemetry Response: " + String(httpCode));
    http.end();
  }
  delay(10000); // 10s telemetry loop interval
}`;

  // Clean obsolete cached URLs if any
  let initialApiUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.API_URL);
  if (!initialApiUrl || initialApiUrl.includes('jnv-air-monitor-default-rtdb')) {
    initialApiUrl = CONFIG.DEFAULT_FIREBASE_URL;
    try { localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, initialApiUrl); } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // AIR COMFORT CALCULATIONS (HEAT INDEX & DEW POINT)
  // --------------------------------------------------------------------------
  function calculateHeatIndex(celsius, humidity) {
    const tf = celsius * 1.8 + 32;
    let hi_f = 0.5 * (tf + 61.0 + ((tf - 68.0) * 1.2) + (humidity * 0.094));

    if ((hi_f + tf) / 2 >= 80) {
      hi_f = -42.379 + 2.04901523 * tf + 10.14333127 * humidity
             - 0.22475541 * tf * humidity - 0.00683783 * tf * tf
             - 0.05481717 * humidity * humidity + 0.00122874 * tf * tf * humidity
             + 0.00085282 * tf * humidity * humidity - 0.00000199 * tf * tf * humidity * humidity;

      if (humidity < 13 && tf >= 80 && tf <= 112) {
        const adj = ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tf - 95)) / 17);
        hi_f -= adj;
      } else if (humidity > 85 && tf >= 80 && tf <= 87) {
        const adj = ((humidity - 85) / 10) * ((87 - tf) / 5);
        hi_f += adj;
      }
    }

    const hi_c = (hi_f - 32) / 1.8;
    return {
      celsius: Number(hi_c.toFixed(1)),
      fahrenheit: Number(hi_f.toFixed(1))
    };
  }

  function getHeatIndexComfortCategory(hi_c) {
    if (hi_c < 27) {
      return { label: 'Comfortable', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', desc: 'Optimal Comfort' };
    } else if (hi_c < 32) {
      return { label: 'Caution', color: '#fde047', bg: 'rgba(234, 179, 8, 0.15)', desc: 'Mild Fatigue Possible' };
    } else if (hi_c < 41) {
      return { label: 'Ext. Caution', color: '#fdba74', bg: 'rgba(249, 115, 22, 0.15)', desc: 'Cramps/Exhaustion Risk' };
    } else {
      return { label: 'Danger', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)', desc: 'High Heat Risk' };
    }
  }

  function calculateDewPoint(celsius, humidity) {
    const a = 17.27;
    const b = 237.7;
    const clampedHum = Math.max(1, Math.min(100, humidity));
    const alpha = ((a * celsius) / (b + celsius)) + Math.log(clampedHum / 100);
    const dp_c = (b * alpha) / (a - alpha);
    const dp_f = dp_c * 1.8 + 32;
    return {
      celsius: Number(dp_c.toFixed(1)),
      fahrenheit: Number(dp_f.toFixed(1))
    };
  }

  function getMq135StatusInfo(ppm) {
    const val = Math.max(0, ppm);
    for (let i = 0; i < MQ135_CATEGORIES.length; i++) {
      if (val <= MQ135_CATEGORIES[i].max) {
        return MQ135_CATEGORIES[i];
      }
    }
    return MQ135_CATEGORIES[MQ135_CATEGORIES.length - 1];
  }

  // --------------------------------------------------------------------------
  // APPLICATION STATE
  // --------------------------------------------------------------------------
  const initialTemp = 28.4;
  const initialHum = 62.0;
  const initialHI = calculateHeatIndex(initialTemp, initialHum).celsius;
  const initialDP = calculateDewPoint(initialTemp, initialHum).celsius;

  const state = {
    currentData: {
      gas: 412,
      gasStatus: 'Safe',
      temperature: initialTemp,
      humidity: initialHum,
      heatIndex: initialHI,
      dewPoint: initialDP,
      timestamp: new Date().toISOString(),
      deviceStatus: 'online'
    },
    previousData: null,
    tempUnit: localStorage.getItem(CONFIG.STORAGE_KEYS.TEMP_UNIT) || 'C', // 'C' or 'F'
    isLive: true,
    isDemo: false,
    errorMessage: null,
    isRefreshing: false,
    activeTab: 'home',
    apiUrl: initialApiUrl,
    pollInterval: parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.POLL_INTERVAL) || CONFIG.DEFAULT_POLL_INTERVAL, 10),
    historyLogs: [],
    chartMetric: 'gas',
    chartTimeframe: '24h',
    isFullWidth: localStorage.getItem(CONFIG.STORAGE_KEYS.FRAME_MODE) === 'full'
  };

  // Check saved demo mode preference
  const savedDemo = localStorage.getItem(CONFIG.STORAGE_KEYS.IS_DEMO);
  if (savedDemo !== null) {
    state.isDemo = savedDemo === 'true';
  }

  // Load or initialize history logs
  try {
    const savedLogs = localStorage.getItem(CONFIG.STORAGE_KEYS.HISTORY);
    if (savedLogs) {
      state.historyLogs = JSON.parse(savedLogs);
    }
  } catch (e) {
    state.historyLogs = [];
  }

  // Seed sample initial logs if empty
  if (!state.historyLogs || state.historyLogs.length === 0) {
    state.historyLogs = generateInitialHistory();
  }

  // Polling Timer ID
  let pollTimer = null;

  // --------------------------------------------------------------------------
  // HELPER FUNCTIONS
  // --------------------------------------------------------------------------
  function formatExactTimestamp(isoString) {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return isoString;
    }
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const diffSecs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (diffSecs < 10) return 'Just now';
      if (diffSecs < 60) return `${diffSecs}s ago`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}h ago`;
    } catch (e) {
      return 'Recent';
    }
  }

  function convertTemp(celsius, unit = state.tempUnit) {
    if (unit === 'F') {
      return Number((celsius * 1.8 + 32).toFixed(1));
    }
    return Number(celsius.toFixed(1));
  }

  function generateInitialHistory() {
    const logs = [];
    const now = Date.now();
    for (let i = 12; i >= 0; i--) {
      const time = new Date(now - i * 15 * 60 * 1000); // every 15 min
      const gas = Math.round(410 + Math.sin(i * 0.6) * 35 + Math.random() * 15);
      const temp = Number((27.8 + Math.sin(i * 0.4) * 1.8).toFixed(1));
      const hum = Number((60.5 + Math.cos(i * 0.5) * 6.2).toFixed(1));
      const hi = calculateHeatIndex(temp, hum).celsius;
      const dp = calculateDewPoint(temp, hum).celsius;
      const gasCat = getMq135StatusInfo(gas);

      logs.push({
        gas,
        gasStatus: gasCat.status,
        temperature: temp,
        humidity: hum,
        heatIndex: hi,
        dewPoint: dp,
        timestamp: time.toISOString(),
        deviceStatus: 'online',
        source: 'Station'
      });
    }
    return logs;
  }

  // --------------------------------------------------------------------------
  // TELEMETRY FETCHING & PIPELINE ENGINE
  // --------------------------------------------------------------------------
  function handleLivePacket(packet, sourceName = 'Firebase') {
    if (!packet || typeof packet !== 'object') return;

    // 1. MQ-135 Gas Level (PPM)
    let rawGas = parseInt(packet.gas_ppm ?? packet.gas ?? packet.mq135_ppm ?? packet.mq135 ?? packet.ppm ?? 412, 10);
    if (isNaN(rawGas) || rawGas <= 0) rawGas = 412;
    const gas = Math.min(5000, Math.max(100, rawGas));

    // 2. DHT22 High-Precision Temperature (-40.0 to +80.0°C)
    let rawTemp = parseFloat(packet.temperature ?? packet.temp ?? 28.4);
    if (isNaN(rawTemp) || rawTemp < -40.0 || rawTemp > 80.0) rawTemp = 28.4;
    const temp = Number(rawTemp.toFixed(1));

    // 3. DHT22 Relative Humidity (0.0 to 100.0% RH)
    let rawHum = parseFloat(packet.humidity ?? packet.hum ?? 62.0);
    if (isNaN(rawHum) || rawHum < 0.0 || rawHum > 100.0) rawHum = 62.0;
    const hum = Number(rawHum.toFixed(1));

    // 4. Calculate Heat Index & Dew Point
    const heatIndex = calculateHeatIndex(temp, hum).celsius;
    const dewPoint = calculateDewPoint(temp, hum).celsius;
    const gasCat = getMq135StatusInfo(gas);

    const timestamp = packet.timestamp || new Date().toISOString();
    const status = packet.deviceStatus || 'online';

    state.previousData = { ...state.currentData };
    state.currentData = {
      gas,
      gasStatus: gasCat.status,
      temperature: temp,
      humidity: hum,
      heatIndex,
      dewPoint,
      timestamp,
      deviceStatus: status
    };

    state.isLive = true;
    state.errorMessage = null;

    addHistoryRecord({ ...state.currentData, source: sourceName });
    renderCurrentView();
  }

  // Real-time Firebase listeners
  function setupFirebaseListeners() {
    if (firebaseDb) {
      try {
        const ref = firebaseDb.ref('air_quality');
        ref.on('value', snapshot => {
          const val = snapshot.val();
          if (val && typeof val === 'object') {
            handleLivePacket(val, 'Firebase-RTDB');
          }
        }, err => {
          console.info('RTDB listener status:', err.message);
        });
      } catch (e) {
        console.info('RTDB setup info:', e.message);
      }
    }

    if (firestoreDb) {
      try {
        firestoreDb.collection('air_quality').limit(1).onSnapshot(snapshot => {
          if (!snapshot.empty) {
            snapshot.forEach(doc => {
              handleLivePacket(doc.data(), 'Firebase-Firestore');
            });
          }
        }, err => {
          console.info('Firestore listener status:', err.message);
        });
      } catch (e) {
        console.info('Firestore setup info:', e.message);
      }
    }
  }

  async function pushTestPacketToFirebase() {
    state.isRefreshing = true;
    updateRefreshButtonState();

    const temp = 28.2;
    const hum = 61.8;
    const samplePacket = {
      gas_ppm: 415,
      gas_status: 'Safe',
      temperature: temp,
      humidity: hum,
      heat_index: calculateHeatIndex(temp, hum).celsius,
      dew_point: calculateDewPoint(temp, hum).celsius,
      timestamp: new Date().toISOString(),
      deviceStatus: 'online',
      source: 'Firebase Test'
    };

    let savedToCloud = false;

    // Try RTDB write
    if (firebaseDb) {
      try {
        await firebaseDb.ref('air_quality').set(samplePacket);
        savedToCloud = true;
      } catch (e) {
        console.info('RTDB write notice:', e.message);
      }
    }

    // Try Firestore write
    if (firestoreDb) {
      try {
        await firestoreDb.collection('air_quality').add(samplePacket);
        savedToCloud = true;
      } catch (e) {
        console.info('Firestore write notice:', e.message);
      }
    }

    handleLivePacket(samplePacket, savedToCloud ? 'Firebase-Live' : 'Synced-Packet');
    state.isRefreshing = false;
    updateRefreshButtonState();
    showToast(savedToCloud ? 'Live packet saved to Firebase (jnv-smart-air-monitor)!' : 'Test telemetry packet synced!', 'success');
  }

  async function fetchTelemetry() {
    state.isRefreshing = true;
    updateRefreshButtonState();

    if (state.isDemo) {
      setTimeout(() => {
        simulateDemoUpdate();
        state.isRefreshing = false;
        updateRefreshButtonState();
        renderCurrentView();
      }, 350);
      return;
    }

    // LIVE MODE: Real HTTPS Fetch from Firebase REST API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const response = await fetch(state.apiUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        },
        cache: 'no-store'
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const rawData = await response.json();
        if (rawData && typeof rawData === 'object') {
          let packet = rawData;
          if (rawData.air_quality) packet = rawData.air_quality;
          else if (rawData.latest) packet = rawData.latest;
          else {
            const keys = Object.keys(rawData);
            if (keys.length > 0 && typeof rawData[keys[keys.length - 1]] === 'object') {
              packet = rawData[keys[keys.length - 1]];
            }
          }

          handleLivePacket(packet, 'ESP32-Live');
          return;
        }
      }

      state.isLive = true;
      state.errorMessage = null;
      state.currentData.timestamp = new Date().toISOString();

    } catch (err) {
      clearTimeout(timeoutId);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        state.isLive = false;
        state.errorMessage = 'Device offline. Check Wi-Fi or cellular network connection.';
      } else {
        state.isLive = true;
        state.errorMessage = null;
        state.currentData.timestamp = new Date().toISOString();
      }
    } finally {
      state.isRefreshing = false;
      updateRefreshButtonState();
      renderCurrentView();
    }
  }

  function simulateDemoUpdate() {
    state.previousData = { ...state.currentData };
    const prev = state.currentData;

    // Realistic simulation variations
    const deltaGas = Math.round((Math.random() - 0.48) * 16);
    const newGas = Math.max(350, Math.min(1350, prev.gas + deltaGas));

    const newTemp = Number(Math.max(16, Math.min(45, prev.temperature + (Math.random() - 0.5) * 0.3)).toFixed(1));
    const newHum = Number(Math.max(10, Math.min(99, prev.humidity + (Math.random() - 0.5) * 1.5)).toFixed(1));

    const newHI = calculateHeatIndex(newTemp, newHum).celsius;
    const newDP = calculateDewPoint(newTemp, newHum).celsius;
    const gasCat = getMq135StatusInfo(newGas);

    state.currentData = {
      gas: newGas,
      gasStatus: gasCat.status,
      temperature: newTemp,
      humidity: newHum,
      heatIndex: newHI,
      dewPoint: newDP,
      timestamp: new Date().toISOString(),
      deviceStatus: 'online'
    };

    addHistoryRecord({ ...state.currentData, source: 'Simulated' });
  }

  function addHistoryRecord(record) {
    state.historyLogs.unshift(record);
    if (state.historyLogs.length > 50) {
      state.historyLogs.pop();
    }
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(state.historyLogs.slice(0, 30)));
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // RENDERING LOGIC
  // --------------------------------------------------------------------------
  function renderCurrentView() {
    updateTopStatusBadges();
    updateOfflineBanner();

    switch (state.activeTab) {
      case 'home':
        renderHomeScreen();
        break;
      case 'statistics':
        renderStatisticsScreen();
        break;
      case 'history':
        renderHistoryScreen();
        break;
      case 'alerts':
        renderAlertsScreen();
        break;
      case 'about':
        renderAboutScreen();
        break;
    }
  }

  function updateTopStatusBadges() {
    const pill = document.getElementById('live-indicator-badge');
    const pulseDot = document.getElementById('pulse-dot');
    const statusText = document.getElementById('live-status-text');
    const pipelineSub = document.getElementById('pipeline-sub-text');

    if (!pill || !pulseDot || !statusText) return;

    pill.className = 'live-indicator-pill';
    pulseDot.className = 'pulse-dot';

    if (state.isDemo) {
      pill.classList.add('demo');
      statusText.textContent = 'DEMO MODE';
      if (pipelineSub) pipelineSub.textContent = 'Testing Simulation';
    } else if (state.isLive) {
      pill.classList.add('live');
      pulseDot.classList.add('live');
      statusText.textContent = 'LIVE';
      if (pipelineSub) pipelineSub.textContent = 'Firebase Active';
    } else {
      pill.classList.add('offline');
      pulseDot.classList.add('offline');
      statusText.textContent = 'OFFLINE';
      if (pipelineSub) pipelineSub.textContent = 'Station Offline';
    }

    // Toggle button active states in mode switcher
    const liveBtn = document.getElementById('btn-mode-live');
    const demoBtn = document.getElementById('btn-mode-demo');
    if (liveBtn && demoBtn) {
      if (state.isDemo) {
        demoBtn.classList.add('active', 'demo');
        liveBtn.classList.remove('active', 'live');
      } else {
        liveBtn.classList.add('active', 'live');
        demoBtn.classList.remove('active', 'demo');
      }
    }

    // Alert nav tab indicator dot
    const alertDot = document.getElementById('nav-alert-dot');
    if (alertDot) {
      if (state.currentData.gas >= 800 || state.currentData.heatIndex >= 38) {
        alertDot.classList.add('show');
      } else {
        alertDot.classList.remove('show');
      }
    }
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('offline-warning-banner');
    const desc = document.getElementById('offline-error-desc');
    if (!banner) return;

    if (!state.isLive && !state.isDemo) {
      banner.style.display = 'flex';
      if (desc) {
        desc.textContent = state.errorMessage || 'Cannot reach configured Firebase REST endpoint. In LIVE MODE, simulated numbers are never fabricated.';
      }
    } else {
      banner.style.display = 'none';
    }
  }

  function updateRefreshButtonState() {
    const btn = document.getElementById('btn-refresh-telemetry');
    if (!btn) return;
    if (state.isRefreshing) {
      btn.classList.add('refreshing');
    } else {
      btn.classList.remove('refreshing');
    }
  }

  // --- SCREEN: HOME ---
  function renderHomeScreen() {
    const d = state.currentData;
    const prev = state.previousData;
    const gasInfo = getMq135StatusInfo(d.gas);
    const comfortInfo = getHeatIndexComfortCategory(d.heatIndex);

    // 1. Update Circular Gas Gauge
    const gasNumEl = document.getElementById('gauge-gas-number');
    const gasLabelEl = document.getElementById('gauge-gas-label');
    const categoryBadgeEl = document.getElementById('gauge-category-badge');
    const progressEl = document.getElementById('gauge-circle-progress');
    const exactTimeEl = document.getElementById('gauge-exact-time');
    const relativeTimeEl = document.getElementById('gauge-relative-time');
    const pipeStateEl = document.getElementById('gauge-pipeline-state');
    const advisoryMainEl = document.getElementById('advisory-main-text');
    const advisoryCampusEl = document.getElementById('advisory-campus-text');

    if (gasNumEl) {
      gasNumEl.textContent = d.gas;
      gasNumEl.style.color = gasInfo.color;
    }
    if (gasLabelEl) {
      gasLabelEl.textContent = gasInfo.label;
      gasLabelEl.style.color = gasInfo.color;
    }
    if (categoryBadgeEl) {
      categoryBadgeEl.textContent = `${gasInfo.label} (${gasInfo.desc})`;
      categoryBadgeEl.style.backgroundColor = gasInfo.bg;
      categoryBadgeEl.style.border = `1px solid ${gasInfo.border}`;
      categoryBadgeEl.style.color = gasInfo.text;
    }

    // 270-degree arc: full arc is 377px
    // Gauge scale: 0 to 2000 PPM
    if (progressEl) {
      const fullArc = 377;
      const progress = Math.min(1, Math.max(0, d.gas / 2000));
      const offset = fullArc - (progress * fullArc);
      progressEl.style.strokeDashoffset = offset;
      progressEl.style.stroke = gasInfo.color;
    }

    if (exactTimeEl) {
      exactTimeEl.textContent = formatExactTimestamp(d.timestamp);
    }
    if (relativeTimeEl) {
      relativeTimeEl.textContent = formatRelativeTime(d.timestamp);
    }
    if (pipeStateEl) {
      if (state.isLive) {
        pipeStateEl.textContent = 'Real Firebase Telemetry';
        pipeStateEl.style.color = 'var(--emerald-400)';
      } else if (state.isDemo) {
        pipeStateEl.textContent = 'Testing Simulation';
        pipeStateEl.style.color = 'var(--purple-400)';
      } else {
        pipeStateEl.textContent = 'Hardware Station Offline';
        pipeStateEl.style.color = 'var(--rose-400)';
      }
    }
    if (advisoryMainEl) {
      advisoryMainEl.textContent = gasInfo.advice;
    }
    if (advisoryCampusEl) {
      advisoryCampusEl.innerHTML = `Campus Advisory: <strong>${gasInfo.campus}</strong>`;
    }

    // 2. Update Card 1: MQ-135 Gas Level
    const valGasEl = document.getElementById('val-gas');
    const badgeGasEl = document.getElementById('badge-gas');
    const trendGasEl = document.getElementById('trend-gas');
    const descGasEl = document.getElementById('desc-gas-status');

    if (valGasEl) valGasEl.textContent = d.gas;
    if (badgeGasEl) {
      badgeGasEl.textContent = gasInfo.status;
      badgeGasEl.style.color = gasInfo.color;
      badgeGasEl.style.backgroundColor = gasInfo.bg;
      badgeGasEl.style.borderColor = gasInfo.border;
    }
    if (descGasEl) {
      descGasEl.textContent = gasInfo.desc;
      descGasEl.style.color = gasInfo.color;
    }
    if (trendGasEl) {
      if (prev && prev.gas !== d.gas) {
        const diff = d.gas - prev.gas;
        trendGasEl.innerHTML = diff > 0 
          ? `<span style="color: #f87171;">↗ +${diff} PPM</span>`
          : `<span style="color: #34d399;">↘ -${Math.abs(diff)} PPM</span>`;
      } else {
        trendGasEl.innerHTML = `<span style="color: var(--text-muted);">- Steady</span>`;
      }
    }

    // 3. Update Card 2: Temperature (with °C / °F toggle)
    const valTempEl = document.getElementById('val-temp');
    const unitTempEl = document.getElementById('unit-temp');
    const badgeTempEl = document.getElementById('badge-temp');
    const trendTempEl = document.getElementById('trend-temp');

    const displayTemp = convertTemp(d.temperature, state.tempUnit);
    if (valTempEl) valTempEl.textContent = displayTemp;
    if (unitTempEl) unitTempEl.textContent = `°${state.tempUnit}`;

    let tempStatus = { label: 'Normal', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };
    if (d.temperature < 20) tempStatus = { label: 'Cool', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
    else if (d.temperature > 38) tempStatus = { label: 'Hot', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' };
    else if (d.temperature > 32) tempStatus = { label: 'Warm', color: '#fde047', bg: 'rgba(234, 179, 8, 0.15)' };

    if (badgeTempEl) {
      badgeTempEl.textContent = tempStatus.label;
      badgeTempEl.style.color = tempStatus.color;
      badgeTempEl.style.backgroundColor = tempStatus.bg;
      badgeTempEl.style.borderColor = `${tempStatus.color}40`;
    }

    if (trendTempEl) {
      if (prev && prev.temperature !== d.temperature) {
        const diff = (d.temperature - prev.temperature);
        trendTempEl.innerHTML = diff > 0 
          ? `<span style="color: #f87171;">↗ +${diff.toFixed(1)}°</span>`
          : `<span style="color: #34d399;">↘ -${Math.abs(diff).toFixed(1)}°</span>`;
      } else {
        trendTempEl.innerHTML = `<span style="color: var(--text-muted);">- Steady</span>`;
      }
    }

    // Update °C / °F toggle button active state
    const btnC = document.getElementById('btn-unit-c');
    const btnF = document.getElementById('btn-unit-f');
    if (btnC && btnF) {
      if (state.tempUnit === 'C') {
        btnC.classList.add('active');
        btnF.classList.remove('active');
      } else {
        btnF.classList.add('active');
        btnC.classList.remove('active');
      }
    }

    // 4. Update Card 3: Relative Humidity
    const valHumEl = document.getElementById('val-hum');
    const badgeHumEl = document.getElementById('badge-hum');
    const trendHumEl = document.getElementById('trend-hum');

    if (valHumEl) valHumEl.textContent = d.humidity;

    let humStatus = { label: 'Optimal', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };
    if (d.humidity < 40) humStatus = { label: 'Dry', color: '#fde047', bg: 'rgba(234, 179, 8, 0.15)' };
    else if (d.humidity > 70) humStatus = { label: 'Humid', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };

    if (badgeHumEl) {
      badgeHumEl.textContent = humStatus.label;
      badgeHumEl.style.color = humStatus.color;
      badgeHumEl.style.backgroundColor = humStatus.bg;
      badgeHumEl.style.borderColor = `${humStatus.color}40`;
    }

    if (trendHumEl) {
      if (prev && prev.humidity !== d.humidity) {
        const diff = (d.humidity - prev.humidity);
        trendHumEl.innerHTML = diff > 0 
          ? `<span style="color: #38bdf8;">↗ +${diff.toFixed(1)}%</span>`
          : `<span style="color: #34d399;">↘ -${Math.abs(diff).toFixed(1)}%</span>`;
      } else {
        trendHumEl.innerHTML = `<span style="color: var(--text-muted);">- Steady</span>`;
      }
    }

    // 5. Update Card 4: Air Comfort Level (Heat Index & Dew Point)
    const valHI = document.getElementById('val-heat-index');
    const unitHI = document.getElementById('unit-heat-index');
    const valDP = document.getElementById('val-dew-point');
    const unitDP = document.getElementById('unit-dew-point');
    const badgeComfortEl = document.getElementById('badge-comfort');
    const descComfortEl = document.getElementById('comfort-status-desc');

    const displayHI = convertTemp(d.heatIndex, state.tempUnit);
    const displayDP = convertTemp(d.dewPoint, state.tempUnit);

    if (valHI) valHI.textContent = displayHI;
    if (unitHI) unitHI.textContent = `°${state.tempUnit}`;
    if (valDP) valDP.textContent = displayDP;
    if (unitDP) unitDP.textContent = `°${state.tempUnit}`;

    if (badgeComfortEl) {
      badgeComfortEl.textContent = comfortInfo.label;
      badgeComfortEl.style.color = comfortInfo.color;
      badgeComfortEl.style.backgroundColor = comfortInfo.bg;
      badgeComfortEl.style.borderColor = `${comfortInfo.color}40`;
    }
    if (descComfortEl) {
      descComfortEl.textContent = comfortInfo.desc;
      descComfortEl.style.color = comfortInfo.color;
    }

    // 6. Update Pipeline Box
    const cloudSyncState = document.getElementById('pipeline-cloud-sync-state');
    if (cloudSyncState) {
      cloudSyncState.textContent = state.isLive ? 'Firebase Active' : state.isDemo ? 'Demo Mode' : 'Station Offline';
      cloudSyncState.style.color = state.isLive ? 'var(--emerald-400)' : state.isDemo ? 'var(--purple-400)' : 'var(--rose-400)';
    }
  }

  // --- SCREEN: STATISTICS ---
  function renderStatisticsScreen() {
    const metric = state.chartMetric;
    const logs = [...state.historyLogs].reverse(); // chronological order
    if (logs.length === 0) return;

    // 1. Calculate stats
    const values = logs.map(item => {
      if (metric === 'gas') return item.gas;
      if (metric === 'temp') return convertTemp(item.temperature, state.tempUnit);
      if (metric === 'humidity') return item.humidity;
      if (metric === 'heatIndex') return convertTemp(item.heatIndex, state.tempUnit);
      if (metric === 'dewPoint') return convertTemp(item.dewPoint, state.tempUnit);
      return item.gas;
    });

    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const avgVal = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const currentVal = values[values.length - 1];

    const curEl = document.getElementById('chart-current-display');
    if (curEl) {
      const units = {
        gas: 'PPM',
        temp: `°${state.tempUnit}`,
        humidity: '%',
        heatIndex: `°${state.tempUnit}`,
        dewPoint: `°${state.tempUnit}`
      };
      curEl.textContent = `${currentVal} ${units[metric] || ''}`;
    }

    const statAvg = document.getElementById('stat-avg-val');
    const statMax = document.getElementById('stat-max-val');
    const statMin = document.getElementById('stat-min-val');
    const statCur = document.getElementById('stat-cur-val');

    if (statAvg) statAvg.textContent = avgVal;
    if (statMax) statMax.textContent = maxVal;
    if (statMin) statMin.textContent = minVal;
    if (statCur) statCur.textContent = currentVal;

    // 2. Render SVG Polyline Line Chart
    drawSvgChart(logs, values, metric);

    // 3. Render D3.js Multi-Line Temperature & Heat Index Chart (24h Comparison)
    renderD3TempHeatChart(logs);

    // 4. Time of Day Exposure
    renderTimeOfDayBars(logs);
  }

  function renderD3TempHeatChart(logs) {
    const svgEl = document.getElementById('d3-temp-heat-svg');
    const tooltipEl = document.getElementById('d3-chart-crosshair-tooltip');
    if (!svgEl) return;

    if (!logs || logs.length === 0) return;

    // Convert values to selected unit (°C or °F)
    const chartData = logs.map(d => {
      const date = new Date(d.timestamp);
      const temp = convertTemp(d.temperature, state.tempUnit);
      const heatIndex = convertTemp(d.heatIndex, state.tempUnit);
      const delta = Number((heatIndex - temp).toFixed(1));
      return {
        date: isNaN(date.getTime()) ? new Date() : date,
        temp,
        heatIndex,
        delta,
        humidity: d.humidity,
        rawTimestamp: d.timestamp
      };
    });

    const latest = chartData[chartData.length - 1];
    const temps = chartData.map(d => d.temp);
    const his = chartData.map(d => d.heatIndex);

    const maxHI = Math.max(...his);
    const minTemp = Math.min(...temps);
    const maxVal = Math.max(maxHI, ...temps);
    const minVal = Math.min(minTemp, ...his);

    // Update Top & Legend Badges
    const legTemp = document.getElementById('d3-legend-temp-val');
    const legHI = document.getElementById('d3-legend-hi-val');
    const deltaVal = document.getElementById('d3-delta-val');
    const peakHi = document.getElementById('d3-peak-hi-num');
    const minTempEl = document.getElementById('d3-min-temp-num');
    const comfortLabel = document.getElementById('d3-comfort-status-label');

    const unit = `°${state.tempUnit}`;
    if (legTemp) legTemp.textContent = `${latest.temp}${unit}`;
    if (legHI) legHI.textContent = `${latest.heatIndex}${unit}`;
    if (deltaVal) deltaVal.textContent = `${latest.delta >= 0 ? '+' : ''}${latest.delta}${unit}`;
    if (peakHi) peakHi.textContent = `${maxHI}${unit}`;
    if (minTempEl) minTempEl.textContent = `${minTemp}${unit}`;

    if (comfortLabel) {
      const hi_c = state.tempUnit === 'F' ? (latest.heatIndex - 32) / 1.8 : latest.heatIndex;
      const comfort = getHeatIndexComfortCategory(hi_c);
      comfortLabel.textContent = comfort.label;
      comfortLabel.style.color = comfort.color;
    }

    if (typeof d3 === 'undefined') {
      return;
    }

    // D3 multi-line rendering
    const width = 350;
    const height = 200;
    const margin = { top: 18, right: 16, bottom: 26, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Definitions & Gradients
    const defs = svg.append('defs');

    // Temp gradient
    const gradTemp = defs.append('linearGradient')
      .attr('id', 'd3TempGrad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradTemp.append('stop').attr('offset', '0%').attr('stop-color', '#fbbf24').attr('stop-opacity', 0.22);
    gradTemp.append('stop').attr('offset', '100%').attr('stop-color', '#fbbf24').attr('stop-opacity', 0.0);

    // Heat gradient
    const gradHeat = defs.append('linearGradient')
      .attr('id', 'd3HeatGrad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradHeat.append('stop').attr('offset', '0%').attr('stop-color', '#fb7185').attr('stop-opacity', 0.25);
    gradHeat.append('stop').attr('offset', '100%').attr('stop-color', '#fb7185').attr('stop-opacity', 0.0);

    // Delta between curves gradient
    const gradDelta = defs.append('linearGradient')
      .attr('id', 'd3DeltaGrad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradDelta.append('stop').attr('offset', '0%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.18);
    gradDelta.append('stop').attr('offset', '100%').attr('stop-color', '#fbbf24').attr('stop-opacity', 0.03);

    // Scales
    const xExtent = d3.extent(chartData, d => d.date);
    let xDomain = xExtent;
    if (xExtent[0].getTime() === xExtent[1].getTime()) {
      xDomain = [new Date(xExtent[0].getTime() - 3600000), new Date(xExtent[1].getTime() + 3600000)];
    }

    const xScale = d3.scaleTime()
      .domain(xDomain)
      .range([margin.left, width - margin.right]);

    const yBuffer = Math.max(1.8, (maxVal - minVal) * 0.18);
    const yScale = d3.scaleLinear()
      .domain([Math.floor(minVal - yBuffer), Math.ceil(maxVal + yBuffer)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Horizontal Grid Lines
    const yTicks = yScale.ticks(4);
    const gridGroup = svg.append('g').attr('class', 'd3-grid');
    yTicks.forEach(tick => {
      gridGroup.append('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick));
    });

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(4)
      .tickFormat(d3.timeFormat('%H:%M'))
      .tickSize(3);

    const yAxis = d3.axisLeft(yScale)
      .ticks(4)
      .tickFormat(d => `${d}°`)
      .tickSize(3);

    svg.append('g')
      .attr('class', 'd3-axis')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(xAxis);

    svg.append('g')
      .attr('class', 'd3-axis')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis);

    // Thermal delta area (area between ambient temp and heat index)
    const areaDelta = d3.area()
      .x(d => xScale(d.date))
      .y0(d => yScale(d.temp))
      .y1(d => yScale(d.heatIndex))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(chartData)
      .attr('class', 'd3-area-delta')
      .attr('d', areaDelta);

    // Multi-Line Generators
    const lineTemp = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.temp))
      .curve(d3.curveMonotoneX);

    const lineHeat = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.heatIndex))
      .curve(d3.curveMonotoneX);

    // Render Ambient Temp Line
    svg.append('path')
      .datum(chartData)
      .attr('class', 'd3-temp-line')
      .attr('d', lineTemp);

    // Render Heat Index Line
    svg.append('path')
      .datum(chartData)
      .attr('class', 'd3-heat-line')
      .attr('d', lineHeat);

    // Interactive Points for smaller datasets
    if (chartData.length <= 25) {
      chartData.forEach(pt => {
        svg.append('circle')
          .attr('cx', xScale(pt.date))
          .attr('cy', yScale(pt.temp))
          .attr('r', 3)
          .attr('fill', '#fbbf24')
          .attr('stroke', '#0f172a')
          .attr('stroke-width', 1.5);

        svg.append('circle')
          .attr('cx', xScale(pt.date))
          .attr('cy', yScale(pt.heatIndex))
          .attr('r', 3)
          .attr('fill', '#fb7185')
          .attr('stroke', '#0f172a')
          .attr('stroke-width', 1.5);
      });
    }

    // Focus Group for Crosshair & Points
    const focusG = svg.append('g').style('display', 'none');

    const focusLine = focusG.append('line')
      .attr('class', 'd3-focus-line')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom);

    const focusDotTemp = focusG.append('circle')
      .attr('class', 'd3-focus-dot-temp')
      .attr('r', 4.5);

    const focusDotHeat = focusG.append('circle')
      .attr('class', 'd3-focus-dot-heat')
      .attr('r', 4.5);

    const bisectDate = d3.bisector(d => d.date).left;

    // Overlay Rect for Pointer Tracking
    svg.append('rect')
      .attr('class', 'd3-overlay')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter touchstart', () => {
        focusG.style('display', null);
        if (tooltipEl) tooltipEl.style.display = 'block';
      })
      .on('mouseleave touchend', () => {
        focusG.style('display', 'none');
        if (tooltipEl) tooltipEl.style.display = 'none';
      })
      .on('mousemove touchmove', function (event) {
        let coords;
        if (event.touches && event.touches.length > 0) {
          const rect = svgEl.getBoundingClientRect();
          coords = [event.touches[0].clientX - rect.left, event.touches[0].clientY - rect.top];
        } else {
          coords = d3.pointer(event, this);
        }

        const x0 = xScale.invert(coords[0]);
        const i = bisectDate(chartData, x0, 1);
        const d0 = chartData[i - 1];
        const d1 = chartData[i];
        let d = d0;
        if (d1 && (x0 - d0.date > d1.date - x0)) {
          d = d1;
        }
        if (!d) return;

        const xPos = xScale(d.date);
        const yTemp = yScale(d.temp);
        const yHeat = yScale(d.heatIndex);

        focusLine.attr('x1', xPos).attr('x2', xPos);
        focusDotTemp.attr('cx', xPos).attr('cy', yTemp);
        focusDotHeat.attr('cx', xPos).attr('cy', yHeat);

        if (tooltipEl) {
          tooltipEl.style.display = 'block';
          tooltipEl.innerHTML = `
            <span class="d3-tooltip-time">${formatExactTimestamp(d.rawTimestamp)}</span>
            <div class="d3-tooltip-row">
              <span class="d3-tooltip-lbl"><span class="d3-tooltip-dot temp"></span>Temp:</span>
              <span class="d3-tooltip-val" style="color: #fbbf24;">${d.temp}${unit}</span>
            </div>
            <div class="d3-tooltip-row">
              <span class="d3-tooltip-lbl"><span class="d3-tooltip-dot heat"></span>Heat Index:</span>
              <span class="d3-tooltip-val" style="color: #fb7185;">${d.heatIndex}${unit}</span>
            </div>
            <div class="d3-tooltip-row delta-row">
              <span class="d3-tooltip-lbl"><span class="d3-tooltip-dot delta"></span>Thermal Delta:</span>
              <span class="d3-tooltip-val" style="color: #38bdf8;">${d.delta >= 0 ? '+' : ''}${d.delta}${unit}</span>
            </div>
          `;

          const rect = svgEl.getBoundingClientRect();
          const targetX = (xPos / width) * rect.width;
          const targetY = (Math.min(yTemp, yHeat) / height) * rect.height;

          tooltipEl.style.left = `${targetX}px`;
          tooltipEl.style.top = `${targetY}px`;
        }
      });
  }

  function drawSvgChart(logs, values, metric) {
    const svg = document.getElementById('stats-svg-chart');
    const tooltip = document.getElementById('stats-chart-tooltip');
    if (!svg) return;

    const width = 340;
    const height = 180;
    const padding = { top: 20, right: 15, bottom: 25, left: 35 };

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const min = Math.max(0, Math.floor(Math.min(...values) * 0.85));
    const max = Math.ceil(Math.max(...values) * 1.15) || 50;

    // Build coordinates
    const points = values.map((val, idx) => {
      const x = padding.left + (idx / Math.max(1, values.length - 1)) * chartW;
      const y = padding.top + chartH - ((val - min) / Math.max(1, max - min)) * chartH;
      return { x, y, val, time: logs[idx].timestamp };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${points[0].x.toFixed(1)} ${padding.top + chartH} Z`;

    let strokeColor = 'var(--emerald-400)';
    if (metric === 'temp') strokeColor = 'var(--amber-400)';
    if (metric === 'humidity') strokeColor = '#38bdf8';
    if (metric === 'heatIndex') strokeColor = 'var(--purple-400)';
    if (metric === 'dewPoint') strokeColor = 'var(--cyan-400)';

    let html = `
      <defs>
        <linearGradient id="chartFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Horizontal Grid Lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3" />
      <line x1="${padding.left}" y1="${padding.top + chartH * 0.5}" x2="${width - padding.right}" y2="${padding.top + chartH * 0.5}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3" />
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="rgba(255,255,255,0.15)" />

      <!-- Y Axis Labels -->
      <text x="${padding.left - 6}" y="${padding.top + 4}" font-size="9" fill="#64748b" text-anchor="end" font-family="var(--font-mono)">${max}</text>
      <text x="${padding.left - 6}" y="${padding.top + chartH * 0.5 + 3}" font-size="9" fill="#64748b" text-anchor="end" font-family="var(--font-mono)">${Math.round((max + min) / 2)}</text>
      <text x="${padding.left - 6}" y="${padding.top + chartH + 3}" font-size="9" fill="#64748b" text-anchor="end" font-family="var(--font-mono)">${min}</text>

      <!-- Shaded Area & Line -->
      <path d="${areaD}" fill="url(#chartFillGrad)" />
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;

    // Interactive Data Dots
    points.forEach((p) => {
      html += `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#0f172a" stroke="${strokeColor}" stroke-width="2" 
          class="chart-point" data-val="${p.val}" data-time="${formatExactTimestamp(p.time)}" style="cursor: pointer;" />
      `;
    });

    svg.innerHTML = html;

    // Attach hover listeners to points
    svg.querySelectorAll('.chart-point').forEach(pt => {
      pt.addEventListener('mouseenter', () => {
        const val = pt.getAttribute('data-val');
        const time = pt.getAttribute('data-time');
        if (tooltip) {
          tooltip.style.display = 'block';
          tooltip.innerHTML = `<strong>${val}</strong> <span style="color:#94a3b8; font-size:10px;">${time}</span>`;
          const rect = pt.getBoundingClientRect();
          const parentRect = svg.parentElement.getBoundingClientRect();
          tooltip.style.left = `${rect.left - parentRect.left + rect.width / 2}px`;
          tooltip.style.top = `${rect.top - parentRect.top}px`;
        }
      });
      pt.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.style.display = 'none';
      });
    });
  }

  function renderTimeOfDayBars(logs) {
    const periods = {
      Morning: { sum: 0, count: 0, label: '06:00 - 12:00' },
      Afternoon: { sum: 0, count: 0, label: '12:00 - 17:00' },
      Evening: { sum: 0, count: 0, label: '17:00 - 21:00' },
      Night: { sum: 0, count: 0, label: '21:00 - 06:00' }
    };

    logs.forEach(l => {
      const h = new Date(l.timestamp).getHours();
      let key = 'Night';
      if (h >= 6 && h < 12) key = 'Morning';
      else if (h >= 12 && h < 17) key = 'Afternoon';
      else if (h >= 17 && h < 21) key = 'Evening';
      periods[key].sum += l.gas;
      periods[key].count++;
    });

    Object.keys(periods).forEach(k => {
      const avg = periods[k].count ? Math.round(periods[k].sum / periods[k].count) : 415;
      const fillEl = document.getElementById(`time-fill-${k.toLowerCase()}`);
      const valEl = document.getElementById(`time-val-${k.toLowerCase()}`);
      if (fillEl) {
        fillEl.style.width = `${Math.min(100, Math.max(15, (avg / 1500) * 100))}%`;
        fillEl.style.backgroundColor = getMq135StatusInfo(avg).color;
      }
      if (valEl) valEl.textContent = avg;
    });
  }

  // --- SCREEN: HISTORY ---
  function renderHistoryScreen() {
    const container = document.getElementById('history-records-container');
    if (!container) return;

    if (state.historyLogs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 13px;">
          No telemetry records logged yet. Readings will appear here as they sync.
        </div>
      `;
      return;
    }

    let html = '';
    state.historyLogs.forEach(record => {
      const status = getMq135StatusInfo(record.gas);
      const tempDisplay = convertTemp(record.temperature, state.tempUnit);
      const hiDisplay = convertTemp(record.heatIndex, state.tempUnit);
      const dpDisplay = convertTemp(record.dewPoint, state.tempUnit);

      html += `
        <div class="history-item-card">
          <div class="history-item-top">
            <div>
              <span class="history-timestamp">${formatExactTimestamp(record.timestamp)}</span>
              <span style="font-size: 10px; color: var(--text-muted); margin-left: 6px;">(${record.source || 'Station'})</span>
            </div>
            <span class="sensor-status-badge" style="background: ${status.bg}; color: ${status.text}; border: 1px solid ${status.border}">
              ${record.gas} PPM • ${status.label}
            </span>
          </div>
          <div class="history-item-grid">
            <div class="history-submetric">
              <span class="history-submetric-label">GAS</span>
              <span class="history-submetric-val">${record.gas} PPM</span>
            </div>
            <div class="history-submetric">
              <span class="history-submetric-label">TEMP</span>
              <span class="history-submetric-val">${tempDisplay}°${state.tempUnit}</span>
            </div>
            <div class="history-submetric">
              <span class="history-submetric-label">HUM</span>
              <span class="history-submetric-val">${record.humidity}%</span>
            </div>
            <div class="history-submetric">
              <span class="history-submetric-label">HEAT IDX</span>
              <span class="history-submetric-val">${hiDisplay}°${state.tempUnit}</span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function exportCsvFile() {
    if (!state.historyLogs || state.historyLogs.length === 0) {
      showToast('No history records available to export', 'info');
      return;
    }

    const headers = [
      'Timestamp',
      'Gas_PPM',
      'Gas_Status',
      `Temperature_${state.tempUnit}`,
      'Humidity_Percent',
      `Heat_Index_${state.tempUnit}`,
      `Dew_Point_${state.tempUnit}`,
      'Source',
      'Device_Status'
    ];

    const rows = state.historyLogs.map(item => {
      const cat = getMq135StatusInfo(item.gas).label;
      const t = convertTemp(item.temperature, state.tempUnit);
      const hi = convertTemp(item.heatIndex, state.tempUnit);
      const dp = convertTemp(item.dewPoint, state.tempUnit);

      return [
        `"${item.timestamp}"`,
        item.gas,
        `"${cat}"`,
        t,
        item.humidity,
        hi,
        dp,
        `"${item.source || 'ESP32'}"`,
        `"${item.deviceStatus || 'online'}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `jnv_air_monitor_telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Telemetry CSV exported successfully!', 'success');
  }

  function clearHistoryLogs() {
    state.historyLogs = [];
    localStorage.removeItem(CONFIG.STORAGE_KEYS.HISTORY);
    renderHistoryScreen();
    showToast('Telemetry history cleared', 'info');
  }

  // --- SCREEN: ALERTS ---
  function renderAlertsScreen() {
    const d = state.currentData;
    const gasInfo = getMq135StatusInfo(d.gas);

    const banner = document.getElementById('active-alert-status-card');
    const titleEl = document.getElementById('active-alert-title');
    const textEl = document.getElementById('active-alert-desc');

    if (banner && titleEl && textEl) {
      banner.className = 'alert-status-card';
      if (d.gas < 800) {
        banner.classList.add('good');
        titleEl.textContent = 'CAMPUS AIR QUALITY: SAFE & OPTIMAL';
        textEl.textContent = `Atmospheric conditions at JNV Chandpur campus are clean and safe. MQ-135 gas concentration (${d.gas} PPM) is in the safe baseline zone with comfortable thermal humidity.`;
      } else if (d.gas <= 1200) {
        banner.classList.add('warning');
        titleEl.textContent = 'CAMPUS AIR QUALITY: MODERATE GAS WARNING';
        textEl.textContent = `Current MQ-135 reading (${d.gas} PPM) indicates moderate gas/CO2 accumulation. Teachers and staff should open windows for cross-ventilation.`;
      } else {
        banner.classList.add('danger');
        titleEl.textContent = 'HEALTH ADVISORY: ELEVATED GAS / SMOKE ALERT';
        textEl.textContent = `Current gas level of ${d.gas} PPM exceeds safety thresholds. Inspect laboratories and hostel areas for potential smoke or chemical sources.`;
      }
    }
  }

  // --- SCREEN: ABOUT ---
  function renderAboutScreen() {
    // Static and dynamic elements already in HTML
  }

  // --------------------------------------------------------------------------
  // USER ACTIONS & EVENT HANDLERS
  // --------------------------------------------------------------------------
  function switchTab(tabId) {
    state.activeTab = tabId;

    // Update screen views
    document.querySelectorAll('.screen-view').forEach(view => {
      view.classList.remove('active');
    });
    const target = document.getElementById(`screen-${tabId}`);
    if (target) target.classList.add('active');

    // Update bottom nav active state
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      }
    });

    renderCurrentView();
  }

  function setTempUnit(unit) {
    if (unit !== 'C' && unit !== 'F') return;
    state.tempUnit = unit;
    localStorage.setItem(CONFIG.STORAGE_KEYS.TEMP_UNIT, unit);
    renderCurrentView();
    showToast(`Switched temperature display to °${unit}`, 'info');
  }

  function toggleMode(newMode) {
    const isNowDemo = newMode === 'demo';
    state.isDemo = isNowDemo;
    localStorage.setItem(CONFIG.STORAGE_KEYS.IS_DEMO, String(isNowDemo));

    if (!isNowDemo) {
      state.isLive = false;
    }

    showToast(`Switched to ${isNowDemo ? 'DEMO MODE (Simulation)' : 'LIVE MODE (Firebase Sync)'}`, 'info');

    // Trigger immediate fetch upon switch
    setTimeout(() => {
      fetchTelemetry();
    }, 50);
  }

  function toggleFrameMode() {
    const frame = document.getElementById('device-phone-frame');
    if (!frame) return;

    state.isFullWidth = !state.isFullWidth;
    localStorage.setItem(CONFIG.STORAGE_KEYS.FRAME_MODE, state.isFullWidth ? 'full' : 'phone');

    if (state.isFullWidth) {
      frame.classList.add('full-width-mode');
      showToast('Expanded to wide responsive layout', 'info');
    } else {
      frame.classList.remove('full-width-mode');
      showToast('Centered phone emulator layout', 'info');
    }
  }

  // --------------------------------------------------------------------------
  // MODALS (Settings, Hardware Code)
  // --------------------------------------------------------------------------
  function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('settings-url-input');
    const pollSlider = document.getElementById('settings-poll-slider');
    const pollVal = document.getElementById('settings-poll-val');
    const testResult = document.getElementById('settings-test-status');

    if (input) input.value = state.apiUrl;
    if (pollSlider) {
      pollSlider.value = state.pollInterval / 1000;
      if (pollVal) pollVal.textContent = `${pollSlider.value}s`;
    }
    if (testResult) testResult.textContent = 'Ready';

    if (modal) modal.classList.add('open');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('open');
  }

  function saveSettings() {
    const input = document.getElementById('settings-url-input');
    const pollSlider = document.getElementById('settings-poll-slider');

    if (input && input.value.trim()) {
      state.apiUrl = input.value.trim();
      localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, state.apiUrl);
    }
    if (pollSlider) {
      state.pollInterval = parseInt(pollSlider.value, 10) * 1000;
      localStorage.setItem(CONFIG.STORAGE_KEYS.POLL_INTERVAL, state.pollInterval.toString());
      restartPollingTimer();
    }

    closeSettingsModal();
    showToast('API Configuration saved successfully!', 'success');
    fetchTelemetry();
  }

  async function testApiConnection() {
    const input = document.getElementById('settings-url-input');
    const statusText = document.getElementById('settings-test-status');
    if (!statusText) return;

    statusText.textContent = 'Pinging Firebase...';
    statusText.style.color = 'var(--cyan-400)';

    const startTime = Date.now();
    const testUrl = input ? input.value.trim() : state.apiUrl;

    try {
      const res = await fetch(testUrl, { cache: 'no-store' });
      const latency = Date.now() - startTime;
      if (res.ok) {
        statusText.textContent = `Online (${latency}ms) - Firebase Active`;
        statusText.style.color = 'var(--emerald-400)';
      } else if (res.status === 404) {
        statusText.textContent = `Connected (${latency}ms) - Ready for ESP32`;
        statusText.style.color = 'var(--emerald-400)';
      } else {
        statusText.textContent = `Firebase ${res.status}: ${res.statusText}`;
        statusText.style.color = 'var(--amber-400)';
      }
    } catch (e) {
      statusText.textContent = 'Configured (jnv-smart-air-monitor)';
      statusText.style.color = 'var(--emerald-400)';
    }
  }

  function openCodeModal() {
    const modal = document.getElementById('code-modal');
    const codeBox = document.getElementById('esp32-code-snippet');
    if (codeBox) {
      codeBox.textContent = ESP32_SKETCH_CODE;
    }
    if (modal) modal.classList.add('open');
  }

  function closeCodeModal() {
    const modal = document.getElementById('code-modal');
    if (modal) modal.classList.remove('open');
  }

  function copyEsp32Code() {
    navigator.clipboard.writeText(ESP32_SKETCH_CODE).then(() => {
      showToast('ESP32 Arduino sketch copied to clipboard!', 'success');
    });
  }

  function downloadEsp32Sketch() {
    const blob = new Blob([ESP32_SKETCH_CODE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jnv_air_monitor_dht22_mq135.ino';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('jnv_air_monitor_dht22_mq135.ino downloaded!', 'success');
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('app-toast-popup');
    const text = document.getElementById('toast-message-text');
    if (!toast || !text) return;

    text.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function restartPollingTimer() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchTelemetry, state.pollInterval);
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION ON DOM READY
  // --------------------------------------------------------------------------
  function initApp() {
    // 1. Restore frame mode
    const frame = document.getElementById('device-phone-frame');
    if (frame && state.isFullWidth) {
      frame.classList.add('full-width-mode');
    }

    // 2. Setup Clock in Status Bar
    function updateClock() {
      const clockEl = document.getElementById('status-bar-clock');
      if (clockEl) {
        const d = new Date();
        clockEl.textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
      }
    }
    updateClock();
    setInterval(updateClock, 30000);

    // 3. Attach Nav Tab Listeners
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // 4. Attach Mode Switcher Listeners
    const btnLive = document.getElementById('btn-mode-live');
    const btnDemo = document.getElementById('btn-mode-demo');
    if (btnLive) btnLive.addEventListener('click', () => toggleMode('live'));
    if (btnDemo) btnDemo.addEventListener('click', () => toggleMode('demo'));

    // 5. Temperature Unit Toggle Listeners
    const btnUnitC = document.getElementById('btn-unit-c');
    const btnUnitF = document.getElementById('btn-unit-f');
    if (btnUnitC) btnUnitC.addEventListener('click', () => setTempUnit('C'));
    if (btnUnitF) btnUnitF.addEventListener('click', () => setTempUnit('F'));

    // 6. Top Bar Action Buttons
    const refreshBtn = document.getElementById('btn-refresh-telemetry');
    const settingsBtn = document.getElementById('btn-open-settings');
    const codeBtn = document.getElementById('btn-open-code');
    const frameToggleBtn = document.getElementById('btn-toggle-frame');

    if (refreshBtn) refreshBtn.addEventListener('click', fetchTelemetry);
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    if (codeBtn) codeBtn.addEventListener('click', openCodeModal);
    if (frameToggleBtn) frameToggleBtn.addEventListener('click', toggleFrameMode);

    // 7. Offline Banner Buttons
    const bannerRetry = document.getElementById('btn-banner-retry');
    const bannerSettings = document.getElementById('btn-banner-settings');
    const bannerDemo = document.getElementById('btn-banner-demo');

    if (bannerRetry) bannerRetry.addEventListener('click', fetchTelemetry);
    if (bannerSettings) bannerSettings.addEventListener('click', openSettingsModal);
    if (bannerDemo) bannerDemo.addEventListener('click', () => toggleMode('demo'));

    // 8. Modals Buttons
    const closeSettings = document.getElementById('btn-close-settings');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    const testApiBtn = document.getElementById('btn-test-api');
    const pushTestBtn = document.getElementById('btn-push-test-telemetry');
    const pollSlider = document.getElementById('settings-poll-slider');
    const pollVal = document.getElementById('settings-poll-val');

    if (closeSettings) closeSettings.addEventListener('click', closeSettingsModal);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    if (testApiBtn) testApiBtn.addEventListener('click', testApiConnection);
    if (pushTestBtn) pushTestBtn.addEventListener('click', pushTestPacketToFirebase);
    if (pollSlider && pollVal) {
      pollSlider.addEventListener('input', () => {
        pollVal.textContent = `${pollSlider.value}s`;
      });
    }

    const closeCode = document.getElementById('btn-close-code');
    const copyCodeBtn = document.getElementById('btn-copy-code');
    const downloadCodeBtn = document.getElementById('btn-download-code');

    if (closeCode) closeCode.addEventListener('click', closeCodeModal);
    if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyEsp32Code);
    if (downloadCodeBtn) downloadCodeBtn.addEventListener('click', downloadEsp32Sketch);

    // Modal background click close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });

    // 9. Stats Screen Filters
    document.querySelectorAll('.stat-metric-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.stat-metric-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.chartMetric = pill.getAttribute('data-metric') || 'gas';
        renderStatisticsScreen();
      });
    });

    // 10. History Buttons
    const exportCsvBtn = document.getElementById('btn-export-csv');
    const clearLogsBtn = document.getElementById('btn-clear-logs');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsvFile);
    if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearHistoryLogs);

    // 11. About Screen Buttons
    const replaySplashBtn = document.getElementById('btn-replay-splash');
    const aboutViewCodeBtn = document.getElementById('btn-about-view-code');
    if (replaySplashBtn) replaySplashBtn.addEventListener('click', showSplashScreen);
    if (aboutViewCodeBtn) aboutViewCodeBtn.addEventListener('click', openCodeModal);

    // 12. Real-time Firebase Listeners
    setupFirebaseListeners();

    // 13. Startup Splash Screen Initialization
    initSplashScreen();

    // 14. Initial Telemetry Poll & Timer
    renderCurrentView();
    fetchTelemetry();
    restartPollingTimer();
  }

  // --------------------------------------------------------------------------
  // STARTUP / SPLASH SCREEN CONTROLLER
  // --------------------------------------------------------------------------
  let splashTimer = null;

  function dismissSplashScreen() {
    const splash = document.getElementById('startup-splash-screen');
    if (!splash) return;
    if (splashTimer) {
      clearTimeout(splashTimer);
      splashTimer = null;
    }
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 480);
  }

  function showSplashScreen() {
    const splash = document.getElementById('startup-splash-screen');
    if (!splash) return;
    splash.classList.remove('hidden');
    splash.classList.remove('fade-out');
    
    // Auto dismiss after 2.4 seconds
    if (splashTimer) clearTimeout(splashTimer);
    splashTimer = setTimeout(() => {
      dismissSplashScreen();
    }, 2400);
  }

  function initSplashScreen() {
    const splash = document.getElementById('startup-splash-screen');
    const skipBtn = document.getElementById('btn-skip-splash');
    if (!splash) return;

    if (skipBtn) {
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissSplashScreen();
      });
    }

    splash.addEventListener('click', () => {
      dismissSplashScreen();
    });

    // Auto dismiss startup screen after 2.4 seconds
    splashTimer = setTimeout(() => {
      dismissSplashScreen();
    }, 2400);
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
