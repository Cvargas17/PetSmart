#include <Servo.h>

// Sketch simple para controlar una puerta con un servo.
// Protocolo por serie: enviar "OPEN" (sin comillas) seguido de \n para abrir.
// Ajusta los pines y ángulos según tu montaje.

const int SERVO_PIN = 9;
const int OPEN_ANGLE = 0;   // ángulo para puerta abierta
const int CLOSED_ANGLE = 90; // ángulo para puerta cerrada
const unsigned long OPEN_DURATION_MS = 3000; // tiempo que mantiene abierta

Servo gateServo;
String buffer = "";

void setup() {
  Serial.begin(9600);
  gateServo.attach(SERVO_PIN);
  gateServo.write(CLOSED_ANGLE);
  Serial.println("READY");
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buffer.trim();
      handleCommand(buffer);
      buffer = "";
    } else {
      buffer += c;
    }
  }
}

void handleCommand(const String &cmd) {
  if (cmd.equalsIgnoreCase("OPEN")) {
    Serial.println("OPENING");
    gateServo.write(OPEN_ANGLE);
    delay(OPEN_DURATION_MS);
    gateServo.write(CLOSED_ANGLE);
    Serial.println("CLOSED");
  } else if (cmd.equalsIgnoreCase("CLOSE")) {
    Serial.println("CLOSING");
    gateServo.write(CLOSED_ANGLE);
    Serial.println("CLOSED");
  } else {
    Serial.print("UNKNOWN:");
    Serial.println(cmd);
  }
}
