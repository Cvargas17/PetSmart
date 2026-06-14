/*
  tempFan.ino — Sensor de temperatura DHT11 con control de ventilador

  Hardware:
    - DHT11 (o DHT22) en pin 7
    - Módulo relay para ventilador en pin 8 (HIGH = encender)

  Protocolo serie (9600 baud):
    Envía cada 2s:  {"temp":28.5,"fan":false,"threshold":30.0}
    Recibe:         THRESHOLD:30.0
*/

#include <DHT.h>

#define DHT_PIN      7
#define DHT_TYPE     DHT11
#define FAN_PIN      8
#define READ_INTERVAL_MS 2000

DHT dht(DHT_PIN, DHT_TYPE);

float threshold = 30.0;
bool  fanOn     = false;
unsigned long lastRead = 0;

void setup() {
  Serial.begin(9600);
  dht.begin();
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, LOW);
}

void loop() {
  // Recibir umbral desde el servidor
  while (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.startsWith("THRESHOLD:")) {
      float val = line.substring(10).toFloat();
      if (val > 0 && val < 100) {
        threshold = val;
      }
    }
  }

  unsigned long now = millis();
  if (now - lastRead < READ_INTERVAL_MS) return;
  lastRead = now;

  float temp = dht.readTemperature();
  if (isnan(temp)) return;  // lectura inválida, reintentar

  bool shouldBeOn = (temp >= threshold);
  if (shouldBeOn != fanOn) {
    fanOn = shouldBeOn;
    digitalWrite(FAN_PIN, fanOn ? HIGH : LOW);
  }

  // Enviar JSON al servidor
  Serial.print("{\"temp\":");
  Serial.print(temp, 1);
  Serial.print(",\"fan\":");
  Serial.print(fanOn ? "true" : "false");
  Serial.print(",\"threshold\":");
  Serial.print(threshold, 1);
  Serial.println("}");
}
