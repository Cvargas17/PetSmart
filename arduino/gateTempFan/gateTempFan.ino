/*
  gateTempFan.ino — Control de puerta + sensor de temperatura + ventilador

  Hardware:
    - Servo puerta     → pin 3
    - LM35 (temp)      → pin A0 (salida analógica: 10mV/°C)
    - Relay ventilador → pin 8 (HIGH = encender)

  Protocolo serie (9600 baud):
    Recibe:  "OPEN"            → abre la puerta
             "CLOSE"           → cierra la puerta
             "THRESHOLD:30.0"  → actualiza umbral de temperatura
    Envía:   "OPENING" / "OPEN" / "CLOSING" / "CLOSED"
             {"temp":28.5,"fan":false,"threshold":30.0}  (cada 2s)
*/

#include <Servo.h>

// ── Pines ──────────────────────────────────────────────
#define SERVO_PIN    3
#define TEMP_PIN     A0
#define FAN_PIN      8
#define TEMP_SERVO_PIN   7
#define TEMP_SERVO_SPIN  180  // rotación continua (0 = sentido contrario)
#define TEMP_SERVO_STOP  90   // detener (neutro en servo de rotación continua)

// ── Configuración ──────────────────────────────────────
const int   OPEN_ANGLE       = 0;
const int   CLOSED_ANGLE     = 180;
const float VREF             = 5.0;   // voltaje de referencia del Arduino
const float HYSTERESIS       = 1.5;   // banda muerta para evitar chattering del ventilador
const float TEMP_OFFSET      = 55.3;  // calibración para sensor invertido: OFFSET - (voltage*100)
const unsigned long MOVE_DELAY_MS    = 250;
const unsigned long TEMP_INTERVAL_MS = 2000;

// ── Estado ─────────────────────────────────────────────
Servo  gateServo;
Servo  tempServo;
String buffer    = "";
float  threshold = 30.0;
bool   fanOn     = false;
unsigned long lastTempRead = 0;

// ── Puerta ─────────────────────────────────────────────
void moveServo(int angle) {
  gateServo.attach(SERVO_PIN);
  gateServo.write(angle);
  delay(MOVE_DELAY_MS);
  gateServo.detach();
}

void handleCommand(const String &cmd) {
  if (cmd.equalsIgnoreCase("OPEN")) {
    Serial.println("OPENING");
    moveServo(OPEN_ANGLE);
    Serial.println("OPEN");
  } else if (cmd.equalsIgnoreCase("CLOSE")) {
    Serial.println("CLOSING");
    moveServo(CLOSED_ANGLE);
    Serial.println("CLOSED");
  } else if (cmd.startsWith("THRESHOLD:")) {
    float val = cmd.substring(10).toFloat();
    if (val > 0 && val < 100) {
      threshold = val;
    }
  }
}

// ── Temperatura / ventilador ───────────────────────────
float readTempCelsius() {
  const int SAMPLES = 20;
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(TEMP_PIN);
    delay(5);
  }
  float raw = sum / (float)SAMPLES;
  float voltage = raw * (5.0 / 1023.0);
  Serial.print("[RAW] ");
  Serial.print(raw, 1);
  Serial.print("  Volt: ");
  Serial.println(voltage, 4);
  return TEMP_OFFSET - (voltage * 100);
}

void readAndReportTemp() {
  float temp = readTempCelsius();

  // Descartar lecturas fuera de rango (sensor desconectado o ruido)
  if (temp < -10.0 || temp > 85.0) {
    Serial.print("[DEBUG] Lectura descartada (fuera de rango): ");
    Serial.print(temp, 1);
    Serial.println(" C");
    return;
  }

  bool shouldBeOn = fanOn ? (temp >= threshold - HYSTERESIS)
                          : (temp >= threshold);
  if (shouldBeOn != fanOn) {
    fanOn = shouldBeOn;
    digitalWrite(FAN_PIN, fanOn ? HIGH : LOW);
    tempServo.write(fanOn ? TEMP_SERVO_SPIN : TEMP_SERVO_STOP);
    Serial.print("[DEBUG] Ventilador + Servo pin 7 ");
    Serial.println(fanOn ? "GIRANDO" : "DETENIDO");
  }

  float voltDebug = temp * 0.010;
  Serial.print("[DEBUG] Volt: ");
  Serial.print(voltDebug, 3);
  Serial.print("V  |  Temp: ");
  Serial.print(temp, 1);
  Serial.print(" C  |  Umbral: ");
  Serial.print(threshold, 1);
  Serial.print(" C  |  Ventilador: ");
  Serial.println(fanOn ? "ON" : "OFF");

  Serial.print("{\"temp\":");
  Serial.print(temp, 1);
  Serial.print(",\"fan\":");
  Serial.print(fanOn ? "true" : "false");
  Serial.print(",\"threshold\":");
  Serial.print(threshold, 1);
  Serial.println("}");
}

// ── Setup / Loop ───────────────────────────────────────
void setup() {
  Serial.begin(9600);
  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, LOW);
  tempServo.attach(TEMP_SERVO_PIN);
  tempServo.write(TEMP_SERVO_STOP);
  moveServo(CLOSED_ANGLE);
  Serial.println("READY");
}

void loop() {
  // Leer comandos serie
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buffer.trim();
      if (buffer.length() > 0) handleCommand(buffer);
      buffer = "";
    } else {
      buffer += c;
    }
  }

  // Leer temperatura cada 2 segundos
  unsigned long now = millis();
  if (now - lastTempRead >= TEMP_INTERVAL_MS) {
    lastTempRead = now;
    readAndReportTemp();
  }
}
