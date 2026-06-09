import network, time, json
from machine import Pin, PWM
from umqtt.simple import MQTTClient

SSID     = "LIB-3309537"
PASSWORD = "dhJwxskN5pnf"
BROKER   = "broker.hivemq.com"
TOPIC    = "alerta"
STATUS_TOPIC = "alerta/status"
PWM_PIN  = 0
HEARTBEAT_INTERVAL = 10

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

last_heartbeat = time.time()
client.publish(STATUS_TOPIC, 'online')

while True:
    try:
        client.check_msg()
    except Exception as e:
        print('Error MQTT receive:', e)

    if time.time() - last_heartbeat >= HEARTBEAT_INTERVAL:
        try:
            client.publish(STATUS_TOPIC, 'online')
            last_heartbeat = time.time()
        except Exception as e:
            print('Error MQTT heartbeat:', e)
    time.sleep_ms(100)
