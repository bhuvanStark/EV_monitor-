#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <MPU6050.h>
#include <DHT.h>
#include <WebServer.h>

// ---------------- WIFI ----------------

const char* ssid = "Akhilleash's S24 FE";
const char* password = "beega123";

// ---------------- RELAY ----------------

#define RELAY_PIN 32

WebServer server(80);

// Change these if your relay works opposite
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ---------------- MQTT ----------------

const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* mqtt_topic = "voltsense/data";

// ---------------- DHT11 ----------------

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// ---------------- ACS712 ----------------

#define ACS_PIN 34

float sensitivity = 0.185;
float offset = 2.335;

// ---------------- MPU6050 ----------------

MPU6050 mpu;

// ---------------- MQTT CLIENT ----------------

WiFiClient espClient;
PubSubClient client(espClient);

// ---------------- WIFI ----------------

void setupWiFi()
{
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.println(WiFi.localIP());
}

// ---------------- MQTT ----------------

void reconnectMQTT()
{
  while (!client.connected())
  {
    Serial.print("Connecting MQTT...");

    String clientId =
      "VoltSense-" +
      String((uint32_t)ESP.getEfuseMac(), HEX);

    if (client.connect(clientId.c_str()))
    {
      Serial.println("Connected");
    }
    else
    {
      Serial.print("Failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 sec");

      delay(5000);
    }
  }
}


void handleRoot()
{
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<title>VoltSense Relay</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{
font-family:Arial;
text-align:center;
background:#f4f4f4;
margin-top:60px;
}
button{
width:180px;
height:60px;
font-size:22px;
margin:20px;
border:none;
border-radius:10px;
color:white;
}
.on{
background:green;
}
.off{
background:red;
}
</style>
</head>
<body>

<h2>VoltSense Relay Control</h2>

<a href="/on">
<button class="on">Relay ON</button>
</a>

<a href="/off">
<button class="off">Relay OFF</button>
</a>

</body>
</html>
)rawliteral";

  server.send(200, "text/html", html);
}

void relayON()
{
  digitalWrite(RELAY_PIN, RELAY_ON);
  server.sendHeader("Location","/");
  server.send(303);
}

void relayOFF()
{
  digitalWrite(RELAY_PIN, RELAY_OFF);
  server.sendHeader("Location","/");
  server.send(303);
}


// ---------------- SETUP ----------------

void setup()
{
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  dht.begin();

  Wire.begin(21, 22);

  mpu.initialize();

  if (mpu.testConnection())
    Serial.println("MPU6050 Connected");
  else
    Serial.println("MPU6050 Failed");

  setupWiFi();

  client.setServer(mqtt_server, mqtt_port);
  server.on("/", handleRoot);
  server.on("/on", relayON);
  server.on("/off", relayOFF);

  server.begin();

  Serial.println("Web Server Started");
}

// ---------------- LOOP ----------------

void loop()
{
  if (!client.connected())
  {
    reconnectMQTT();
  }

  client.loop();

  server.handleClient();

  if (WiFi.status() != WL_CONNECTED)
{
    Serial.println("WiFi Disconnected!");
}

  // ---------- DHT11 ----------

  float temperature = dht.readTemperature();

  if (isnan(temperature))
  {
    Serial.println("DHT11 Read Failed");
    temperature = -1;
  }

  Serial.print("DHT11 Temperature: ");
  Serial.println(temperature);

  // ---------- ACS712 ----------

  long total = 0;

  for (int i = 0; i < 100; i++)
  {
    total += analogRead(ACS_PIN);
    delay(2);
  }

  float raw = total / 100.0;

  float voltage =
      raw * (3.3 / 4095.0);

  float current =
      (voltage - offset) /
      sensitivity;

  // ---------- MPU6050 ----------

  int16_t ax, ay, az;
  int16_t gx, gy, gz;

  mpu.getMotion6(
      &ax, &ay, &az,
      &gx, &gy, &gz);

  // ---------- ML STATUS ----------

  String ml_status = "NO CURRENT";

  if (temperature > 0)
    ml_status = "Normal";

  if (temperature > 60)
    ml_status = "Overheat";

  if (abs(current) > 2.0)
    ml_status = "HighCurrent";

  // ---------- JSON ----------

  StaticJsonDocument<512> doc;

  doc["temperature"] = temperature;
  doc["voltage"] = voltage;
  doc["current"] = current;

  doc["accel_x"] = ax;
  doc["accel_y"] = ay;
  doc["accel_z"] = az;

  doc["gyro_x"] = gx;
  doc["gyro_y"] = gy;
  doc["gyro_z"] = gz;

  doc["ml_status"] = ml_status;

  char payload[512];

  serializeJson(doc, payload);

  // ---------- MQTT PUBLISH ----------

  client.publish(
      mqtt_topic,
      payload);

  Serial.println("Published:");

  serializeJsonPretty(doc, Serial);

  Serial.println();
  Serial.println("-------------------");
  Serial.print("Open: http://");
  Serial.println(WiFi.localIP());


  Serial.print("Free Heap: ");
  Serial.println(ESP.getFreeHeap());
  
  delay(2000);
}