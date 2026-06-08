#include <Servo.h>
#include <Arduino_JSON.h>

Servo myServo;
//const String ID = "3001";
const int bButton = 2;
const int gButton = 3;
const int oButton = 4;
const int buzzer = 5;
const int servo = 6;
int correct=-1;
int correctGuesses=0;
int limit=10;
int stock=10;
bool inHours= true;
bool dispense = false;

void dispenseTreat(bool command){
  digitalWrite(5, HIGH);
  myServo.write(180);
  delay(3000);
  digitalWrite(5,LOW);
  myServo.write(0);
  correct = random(2,5);
  if(command)
    correctGuesses++;
  if(dispense)
      dispense=false;
  stock--;
}

void readJSon(){
  if(Serial.available()){
     String jsonString = Serial.readStringUntil('\n');

    JSONVar data = JSON.parse(jsonString);

    if (JSON.typeof(data) == "undefined") {
      Serial.println("JSON invalido");
      return;
    }

    if (data.hasOwnProperty("limit")) {
      limit = int(data["limit"]);
    }

    if (data.hasOwnProperty("inHours")) {
      inHours = bool(data["inHours"]);
    }

    if (data.hasOwnProperty("dispense")) {
      dispense = bool(data["dispense"]);
    }

    if (data.hasOwnProperty("stock")) {
      stock = int(data["stock"]);
    }

  }
}

void writeJSon(){
  JSONVar status;
  //status["ID"] = ID;
  status["stock"] = stock;
  status["correctGuesses"] = correctGuesses;
  Serial.println(JSON.stringify(status));
}

void setup() {
  randomSeed(analogRead(A1));
  pinMode(bButton, INPUT);
  pinMode(gButton, INPUT);
  pinMode(oButton, INPUT);
  
  pinMode(buzzer, OUTPUT);
  pinMode(servo, OUTPUT);

  myServo.attach(servo);
  myServo.write(0);
  Serial.begin(9600);

  correct = random(2,5);

  delay(1500);
  writeJSon();  
}

void loop() {
  readJSon();
  if(((correctGuesses<limit and inHours and digitalRead(correct) == HIGH) or dispense) and stock>0){
    dispenseTreat(digitalRead(correct) == HIGH);
    writeJSon();
  }
}
