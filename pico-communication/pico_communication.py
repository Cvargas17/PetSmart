import network, time, json
from machine import Pin, PWM
from umqtt.simple import MQTTClient

SSID     = "GalaxyA71"
PASSWORD = "Lanh4358"
BROKER   = "broker.hivemq.com"
TOPIC    = "alerta"
STATUS_TOPIC = "alerta/status"
PWM_PIN  = 0
HEARTBEAT_INTERVAL = 0.5

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

def connect_to_mqtt():
    global client
    if client:
        try:
            client.disconnect()
        except Exception:
            pass

    client_id = 'alerta_%d' % time.ticks_ms()
    client = MQTTClient(client_id, BROKER)
    client.set_callback(on_message)

    while True:
        try:
            client.connect()
            client.subscribe(TOPIC)
            print("MQTT conectado y suscrito al tópico", TOPIC)
            publish_status()
            return
        except Exception as e:
            print('Error conectando MQTT:', e)
            time.sleep(5)


def publish_status(retries=2):
    for attempt in range(retries):
        try:
            client.publish(STATUS_TOPIC, 'online', True, 1)
            if attempt == 0:
                time.sleep(0.1)
            return
        except Exception as e:
            print('Error publicando estado MQTT:', e)
            time.sleep(0.2)


client = None
connect_to_mqtt()
print("Esperando...")

last_heartbeat = time.time()

while True:
    if not wlan.isconnected():
        print('WiFi desconectado. Reconectando...')
        wlan.connect(SSID, PASSWORD)
        while not wlan.isconnected():
            print('.', end='')
            time.sleep(0.5)
        print(' OK →', wlan.ifconfig()[0])
        connect_to_mqtt()

    try:
        client.check_msg()
    except Exception as e:
        print('Error MQTT receive:', e)
        time.sleep(1)
        connect_to_mqtt()

    if time.time() - last_heartbeat >= HEARTBEAT_INTERVAL:
        publish_status()
        last_heartbeat = time.time()

    time.sleep_ms(100)
