#include <Servo.h>
#include <Arduino_JSON.h>
Servo verticalServo;
Servo horizontalServo;
Servo drumServo;
const int buzzerPin = 7; 
const int flywheelPin = 9;

int stock = 0;
bool inPlay = false;

int horizontalSector = 2;
int verticalSector = 2;

void setup() {
  Serial.begin(9600);

  pinMode(buzzerPin, OUTPUT);
  pinMode(flywheelPin, OUTPUT);

  verticalServo.attach(6);
  horizontalServo.attach(5);
  drumServo.attach(4);


  verticalServo.write(20);
  horizontalServo.write(90);
  drumServo.write(165);

  digitalWrite(flywheelPin, LOW);

  randomSeed(analogRead(A0));
}

void sector(int h, int v){
  h = map(h,1,3,45,135);
  v = map(v,1,3,20,0);          
  verticalServo.write(v);
  horizontalServo.write(h);
  delay(500);
}
void spinFlywheel() {
  digitalWrite(flywheelPin, HIGH);
}

void stopFlywheel() {
  digitalWrite(flywheelPin, LOW);
}

void rotateDrumOneBall() {
  drumServo.write(90);
  delay(500);
  drumServo.write(165);
}
void fire(){
  if (stock <= 0) {
    inPlay = false;
    stopFlywheel();
    writeJSON("empty");
    return;
  }
  digitalWrite(buzzerPin, HIGH);
  delay(100);
  digitalWrite(buzzerPin, LOW);
  spinFlywheel();
  delay(1500);
  rotateDrumOneBall();

  delay(500);

  stock--;
  stopFlywheel();
  writeJSON("fired");
}

void startTraining(int intervalMs) {
  inPlay = true;

  while (inPlay && stock > 0) {
    int h = random(1, 4);
    int v = random(1, 4);

    sector(h, v);
    fire();

    delay(intervalMs);

    readJSON();
    if (!inPlay) {
      break;
    }
  }

  stopFlywheel();

  if (stock <= 0) {
    inPlay = false;
    writeJSON("empty");
  } else {
    writeJSON("fired");
  }
}

void writeJSON(String message) {
  JSONVar status;

  status["device"] = "ballLauncher";
  status["message"] = message;
  status["stock"] = stock;
  status["inPlay"] = inPlay;
  status["horizontalSector"] = horizontalSector;
  status["verticalSector"] = verticalSector;

  Serial.println(JSON.stringify(status));
}

void readJSON() {
  if (!Serial.available()) {
    return;
  }

  String jsonString = Serial.readStringUntil('\n');

  JSONVar data = JSON.parse(jsonString);

  if (JSON.typeof(data) == "undefined") {
    return;
  }

  if (data.hasOwnProperty("stock")) {
    stock = int(data["stock"]);
  }

  if (data.hasOwnProperty("inPlay")) {
    inPlay = bool(data["inPlay"]);

    if (!inPlay) {
      stopFlywheel();
    }
  }

  if (data.hasOwnProperty("h") && data.hasOwnProperty("v")) {
    int h = int(data["h"]);
    int v = int(data["v"]);

    sector(h, v);
  }

  if (data.hasOwnProperty("fire")) {
    if (bool(data["fire"])) {
      fire();
    }
  }

  if (data.hasOwnProperty("start")) {
    if (bool(data["start"])) {
      int intervalMs = 3000;

      if (data.hasOwnProperty("interval")) {
        intervalMs = int(data["interval"]);
      }

      startTraining(intervalMs);
    }
  }
}

void loop() {
  readJSON();
}