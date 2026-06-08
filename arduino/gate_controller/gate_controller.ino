#include <Arduino.h>
#include <Servo.h>

const int SERVO_PIN = 3;
const int OPEN_ANGLE = 0;
const int CLOSED_ANGLE = 360;
const unsigned long OPEN_DURATION_MS = 3000;
const unsigned long MOVE_DELAY_MS = 250; // tiempo para que el servo alcance la posicion

Servo gateServo;
String buffer = "";

void moveServo(int angle) {
  gateServo.attach(SERVO_PIN);
  gateServo.write(angle);
  delay(MOVE_DELAY_MS);
  gateServo.detach();
}

void setup() {
  Serial.begin(9600);
  moveServo(CLOSED_ANGLE);
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
    moveServo(OPEN_ANGLE);
    Serial.println("OPEN");
    delay(OPEN_DURATION_MS);
    moveServo(CLOSED_ANGLE);
    Serial.println("CLOSED");
    while (Serial.available()) Serial.read();
    buffer = "";
  } else if (cmd.equalsIgnoreCase("CLOSE")) {
    Serial.println("CLOSING");
    moveServo(CLOSED_ANGLE);
    Serial.println("CLOSED");
  } else {
    Serial.print("UNKNOWN:");
    Serial.println(cmd);
  }
}
