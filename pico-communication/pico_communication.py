import network, time, json
from machine import Pin, PWM
from umqtt.simple import MQTTClient

SSID     = "LIB-3309537"
PASSWORD = "dhJwxskN5pnf"
BROKER   = "broker.hivemq.com"
TOPIC    = "alerta"
PWM_PIN  = 0

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)
print("Conectando WiFi", end="")
while not wlan.isconnected():
    print(".", end="")
    time.sleep(0.5)
print(" OK →", wlan.ifconfig()[0])

pwm = PWM(Pin(PWM_PIN))

def on_message(topic, payload):
    datos = json.loads(payload)
    freq  = datos['f']
    dur   = datos['d']

    if freq == 0:
        pwm.duty_u16(0)
        return

    pwm.freq(freq)
    pwm.duty_u16(2000)

    if dur > 0:
        time.sleep(dur)
        pwm.duty_u16(0)

client = MQTTClient("alerta", BROKER)
client.set_callback(on_message)
client.connect()
client.subscribe(TOPIC)
print("Esperando...")

while True:
    client.check_msg()
    time.sleep_ms(1)
