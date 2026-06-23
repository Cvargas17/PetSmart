# ============================================================
# SISTEMA DE ALIMENTACIÓN - Raspberry Pi Pico W
# ============================================================
# Funcionalidades:
# - SCRUM-78: Dispensar comida en horarios programados
# - SCRUM-79: Registro de consumo de la mascota
# - SCRUM-80: Pesaje en tiempo real mientras dispensa
# - SCRUM-81: Alertas por falta de consumo
# - Extra: Dispensar manualmente desde la app
# ============================================================

import machine
import network
import ntptime
import utime
import time
import json
import socket
import umqtt.simple as mqtt

# ============================================================
# CONFIGURACIÓN FIJA (hardware)
# ============================================================

# WiFi
WIFI_SSID     = "GalaxyA71"
WIFI_PASSWORD = "Lanh4358"

# Pines
SERVO_PIN    = 16
HX711_DT     = 14
HX711_SCK    = 15
PARLANTE_PIN = 0

# Calibración celda de carga
TARA   = -175863
FACTOR = 689.82
FILTRO = 5  # gramos — ignorar variaciones menores a esto
OFFSET_PESO = 21  # gramos — corrección fija para que la bandeja vacía marque 0

# Servo (rotación continua)
VEL_ABRIR  = 1000  # us — sentido B (abre)
VEL_CERRAR = 2000  # us — sentido A (cierra)
VEL_PARAR  = 1500  # us — quieto
TIEMPO_MOVIMIENTO_MS = 120  # tiempo de giro para abrir/cerrar sin pasarse

# Margen para cerrar antes de llegar al objetivo (overshoot)
MARGEN_PESO = 5
UMBRAL_RELLENO_G = 20  # solo alertar si falta bastante alimento

# Puerto servidor HTTP
HTTP_PORT = 80

# MQTT para reportar el estado de la Raspberry
MQTT_BROKER = "broker.hivemq.com"
MQTT_STATUS_TOPIC = "alerta/status/feeding"
MQTT_COMMAND_TOPIC = "alerta/feeding/command"
MQTT_TELEMETRY_TOPIC = "alerta/feeding/telemetry"
MQTT_CONFIG_TOPIC = "alerta/feeding/config"
MQTT_EVENT_TOPIC = "alerta/feeding/event"
UTC_OFFSET_HOURS = -6  # Costa Rica
ESPERA_RELLENAR_MS = 15000
ultimo_estado_mqtt = 0

# ============================================================
# CONFIGURACIÓN DINÁMICA (se actualiza desde la app)
# ============================================================
config = {
    "peso_porcion":    100,  # gramos por porción
    "horas_sin_comer": 4,    # horas sin comer para activar alerta
    "horarios":        []    # [{"hora": 8, "minuto": 0}, ...]
}

# ============================================================
# INICIALIZACIÓN DE HARDWARE
# ============================================================

servo    = machine.PWM(machine.Pin(SERVO_PIN))
servo.freq(50)

dt  = machine.Pin(HX711_DT,  machine.Pin.IN)
sck = machine.Pin(HX711_SCK, machine.Pin.OUT)

buzzer = machine.Pin(PARLANTE_PIN, machine.Pin.OUT)
buzzer.value(0)

# ============================================================
# FUNCIONES: SERVO
# ============================================================

def servo_mover(us):
    duty = int(us * 65535 // 20000)
    servo.duty_u16(duty)

def servo_abrir():
    servo_mover(VEL_ABRIR)

def servo_cerrar():
    servo_mover(VEL_CERRAR)

def servo_parar():
    servo_mover(VEL_PARAR)

def servo_cerrar_compuerta():
    servo_cerrar()
    time.sleep_ms(TIEMPO_MOVIMIENTO_MS)
    servo_parar()

# ============================================================
# FUNCIONES: CELDA DE CARGA
# ============================================================

def leer_crudo():
    timeout = 0
    while dt.value() == 1:
        time.sleep_ms(1)
        timeout += 1
        if timeout > 500:
            return None
    count = 0
    for _ in range(24):
        sck.value(1)
        count = count << 1
        sck.value(0)
        if dt.value():
            count += 1
    sck.value(1)
    sck.value(0)
    if count & 0x800000:
        count -= 0x1000000
    return count

def leer_promedio(n=5):
    lecturas = []
    for _ in range(n):
        v = leer_crudo()
        if v is not None:
            lecturas.append(v)
        time.sleep_ms(50)
    if not lecturas:
        return None
    return sum(lecturas) // len(lecturas)

def leer_peso():
    lectura = leer_promedio()
    if lectura is None:
        return None
    peso = (lectura - TARA) / FACTOR - OFFSET_PESO
    if -FILTRO < peso < FILTRO:
        peso = 0.0
    return int(round(peso))

def leer_peso_estable(intentos=2, pausa_ms=50):
    ultima_lectura = None
    for _ in range(intentos):
        lectura = leer_peso()
        if lectura is not None:
            ultima_lectura = lectura
        time.sleep_ms(pausa_ms)
    return ultima_lectura

# ============================================================
# FUNCIONES: PARLANTE
# ============================================================

def pitido(duracion_ms=300):
    buzzer.value(1)
    time.sleep_ms(duracion_ms)
    buzzer.value(0)
    time.sleep_ms(TIEMPO_MOVIMIENTO_MS)

def alerta_sin_comer():
    for _ in range(3):
        pitido(500)
        time.sleep_ms(200)

def alerta_dispensando():
    pitido(150)

# ============================================================
# FUNCIONES: WIFI Y NTP
# ============================================================

wlan = network.WLAN(network.STA_IF)

def conectar_wifi():
    wlan.active(True)
    if wlan.isconnected():
        return True
    print(f"Conectando a {WIFI_SSID}...")
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    timeout = 0
    while not wlan.isconnected():
        time.sleep(1)
        timeout += 1
        if timeout > 20:
            print("No se pudo conectar al WiFi")
            return False
    print(f"WiFi conectado: {wlan.ifconfig()[0]}")
    return True

def reportar_estado_mqtt(retain=False):
    global ultimo_estado_mqtt
    try:
        if not wlan.isconnected():
            print("MQTT no se reporta: no hay WiFi")
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding", MQTT_BROKER)
        client.connect()
        client.publish(MQTT_STATUS_TOPIC, b"online", retain=retain)
        payload = json.dumps({
            "peso_actual": leer_peso(),
            "comido_actual": registro_consumo[-1]["comido"] if registro_consumo else 0,
            "config": config,
            "online": True
        })
        client.publish(MQTT_TELEMETRY_TOPIC, payload.encode(), retain=True)
        client.disconnect()
        ultimo_estado_mqtt = utime.time()
        print("Estado MQTT reportado: online")
    except Exception as e:
        print(f"Error reportando estado MQTT: {e}")

def publicar_telemetria():
    try:
        if not wlan.isconnected():
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding_telemetry", MQTT_BROKER)
        client.connect()
        payload = json.dumps({
            "peso_actual": leer_peso(),
            "comido_actual": registro_consumo[-1]["comido"] if registro_consumo else 0,
            "config": config,
            "online": True
        })
        client.publish(MQTT_TELEMETRY_TOPIC, payload.encode(), retain=True)
        client.disconnect()
    except Exception as e:
        print(f"Error publicando telemetría: {e}")

def publicar_evento_dispensado(gramos, scheduled=False):
    try:
        if not wlan.isconnected():
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding_event", MQTT_BROKER)
        client.connect()
        payload = json.dumps({
            "action": "dispensed",
            "grams": int(round(gramos)),
            "scheduled": bool(scheduled),
            "peso_actual": leer_peso()
        })
        client.publish(MQTT_EVENT_TOPIC, payload.encode(), retain=False)
        client.disconnect()
    except Exception as e:
        print(f"Error publicando evento de dispensado: {e}")

def publicar_evento_consumo(gramos):
    try:
        if not wlan.isconnected():
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding_consume", MQTT_BROKER)
        client.connect()
        payload = json.dumps({
            "action": "consumed",
            "grams": int(round(gramos)),
            "hora": f"{hora_actual()[0]:02d}:{hora_actual()[1]:02d}"
        })
        client.publish(MQTT_EVENT_TOPIC, payload.encode(), retain=False)
        client.disconnect()
    except Exception as e:
        print(f"Error publicando evento de consumo: {e}")

def publicar_evento_sin_comer():
    try:
        if not wlan.isconnected():
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding_noeat", MQTT_BROKER)
        client.connect()
        payload = json.dumps({
            "action": "no_eat",
            "horas_sin_comer": config["horas_sin_comer"],
            "peso_actual": leer_peso()
        })
        client.publish(MQTT_EVENT_TOPIC, payload.encode(), retain=False)
        client.disconnect()
    except Exception as e:
        print(f"Error publicando alerta sin comer: {e}")

def publicar_evento_rellenar(peso_actual, objetivo):
    try:
        if not wlan.isconnected():
            return
        import umqtt.simple as mqtt
        client = mqtt.MQTTClient(b"pico_feeding_refill", MQTT_BROKER)
        client.connect()
        payload = json.dumps({
            "action": "refill",
            "peso_actual": int(round(peso_actual)) if peso_actual is not None else None,
            "objetivo": int(round(objetivo))
        })
        client.publish(MQTT_EVENT_TOPIC, payload.encode(), retain=False)
        client.disconnect()
    except Exception as e:
        print(f"Error publicando alerta de recarga: {e}")

def sincronizar_ntp():
    try:
        ntptime.host = "pool.ntp.org"
        ntptime.settime()
        print("Hora sincronizada con NTP")
        return True
    except Exception as e:
        print(f"No se pudo sincronizar NTP: {e}")
        return False

def hora_actual():
    t = utime.localtime(utime.time() + UTC_OFFSET_HOURS * 3600)
    return t[3], t[4], t[5]  # hora, minuto, segundo

# ============================================================
# FUNCIONES: DISPENSADOR
# ============================================================

ultimo_dispense  = None
peso_antes       = 0
registro_consumo = []

def dispensar(gramos_objetivo, scheduled=False):
    global ultimo_dispense, peso_antes

    print(f"Dispensando {gramos_objetivo}g...")
    alerta_dispensando()

    servo_abrir()
    time.sleep_ms(TIEMPO_MOVIMIENTO_MS)
    servo_parar()

    time.sleep_ms(100)
    peso_inicial = leer_peso_estable()
    if peso_inicial is None:
        print("Error leyendo celda de carga")
        return False

    peso_antes = peso_inicial
    objetivo   = peso_inicial + gramos_objetivo - MARGEN_PESO

    timeout = 0

    while True:
        peso_actual = leer_peso()
        if peso_actual is not None:
            dispensado = peso_actual - peso_inicial
            print(f"Dispensado: {int(round(dispensado))}g")
            if peso_actual >= objetivo:
                break
        time.sleep_ms(100)
        timeout += 1
        if timeout > 300:
            print("Timeout — cerrando compuerta")
            break

    servo_cerrar_compuerta()

    time.sleep_ms(100)
    peso_final = leer_peso_estable()
    total_servido = peso_final - peso_antes if peso_final is not None else 0
    print(f"Total dispensado: {int(round(total_servido))}g")

    tiempo_espera = 0
    while tiempo_espera < ESPERA_RELLENAR_MS:
        peso_chequeo = leer_peso_estable()
        if peso_chequeo is not None and peso_chequeo >= objetivo:
            break
        time.sleep_ms(500)
        tiempo_espera += 500

    peso_verificacion = leer_peso_estable()
    if peso_verificacion is None:
        publicar_evento_rellenar(peso_verificacion, objetivo)
    else:
        diferencia = objetivo - peso_verificacion
        if diferencia >= UMBRAL_RELLENO_G:
            publicar_evento_rellenar(peso_verificacion, objetivo)

    h, m, s = hora_actual()
    ultimo_dispense = utime.time()
    registro_consumo.append({
        "hora":    f"{h:02d}:{m:02d}",
        "servido": total_servido,
        "comido":  0
    })

    if scheduled:
        publicar_evento_dispensado(total_servido, scheduled=True)
    publicar_telemetria()

    return True

def verificar_consumo():
    if not registro_consumo:
        return
    ultimo = registro_consumo[-1]
    if ultimo["comido"] > 0:
        return
    peso_actual = leer_peso_estable()
    if peso_actual is None:
        return
    if peso_antes - peso_actual > 5:
        ultimo["comido"] = peso_antes - peso_actual
        print(f"Mascota comio: {int(round(ultimo['comido']))}g")
        publicar_evento_consumo(ultimo["comido"])

def verificar_alerta_sin_comer():
    if ultimo_dispense is None:
        return
    horas = (utime.time() - ultimo_dispense) / 3600
    if horas >= config["horas_sin_comer"]:
        if registro_consumo and registro_consumo[-1]["comido"] == 0:
            print(f"Alerta: mascota no ha comido en {config['horas_sin_comer']} horas")
            alerta_sin_comer()
            publicar_evento_sin_comer()

# ============================================================
# FUNCIONES: SERVIDOR HTTP
# ============================================================

def iniciar_servidor():
    addr = socket.getaddrinfo("0.0.0.0", HTTP_PORT)[0][-1]
    s    = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(addr)
    s.listen(1)
    s.setblocking(False)
    print(f"Servidor HTTP en puerto {HTTP_PORT}")
    return s

def manejar_comando_mqtt(topic, payload):
    try:
        mensaje = payload.decode() if isinstance(payload, (bytes, bytearray)) else str(payload)
        data = json.loads(mensaje)
        if data.get("action") == "dispense":
            gramos = int(data.get("grams", config["peso_porcion"]))
            print(f"MQTT comando de dispensado recibido: {gramos}g")
            dispensar(gramos)
        elif data.get("action") == "config" or topic == MQTT_CONFIG_TOPIC:
            if "peso_porcion" in data:
                config["peso_porcion"] = int(data["peso_porcion"])
            if "horas_sin_comer" in data:
                config["horas_sin_comer"] = int(data["horas_sin_comer"])
            if "horarios" in data and isinstance(data["horarios"], list):
                config["horarios"] = data["horarios"]
            print(f"MQTT config actualizada: {config}")
    except Exception as e:
        print(f"Error procesando comando MQTT: {e}")

def conectar_mqtt():
    client_id = b"pico_feeding_cmd"
    client = mqtt.MQTTClient(client_id, MQTT_BROKER)
    client.connect()
    client.set_callback(manejar_comando_mqtt)
    client.subscribe(MQTT_COMMAND_TOPIC)
    client.subscribe(MQTT_CONFIG_TOPIC)
    print(f"Suscrito a MQTT comando: {MQTT_COMMAND_TOPIC}")
    print(f"Suscrito a MQTT config: {MQTT_CONFIG_TOPIC}")
    return client

def manejar_request(conn):
    try:
        request = conn.recv(1024).decode()

        headers = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n\r\n"

        # ── GET /estado
        if "GET /estado" in request:
            h, m, s = hora_actual()
            datos = {
                "peso_actual": leer_peso(),
                "hora":        f"{h:02d}:{m:02d}:{s:02d}",
                "consumo":     registro_consumo[-5:] if registro_consumo else [],
                "config":      config,
                "ip":          wlan.ifconfig()[0]
            }
            conn.send(headers)
            conn.send(json.dumps(datos))

        # ── POST /dispensar (manual desde la app)
        elif "POST /dispensar" in request:
            gramos = config["peso_porcion"]
            if "gramos=" in request:
                try:
                    gramos = int(request.split("gramos=")[1].split(" ")[0].split("&")[0])
                except:
                    pass
            conn.send(headers)
            conn.send(json.dumps({"status": "dispensando", "gramos": gramos}))
            dispensar(gramos)
            return

        # ── POST /configurar (actualiza config desde la app)
        # Body esperado: {"peso_porcion": 100, "horas_sin_comer": 4, "horarios": [{"hora": 8, "minuto": 0}]}
        elif "POST /configurar" in request:
            try:
                body = request.split("\r\n\r\n")[1]
                nueva_config = json.loads(body)
                if "peso_porcion"    in nueva_config: config["peso_porcion"]    = nueva_config["peso_porcion"]
                if "horas_sin_comer" in nueva_config: config["horas_sin_comer"] = nueva_config["horas_sin_comer"]
                if "horarios"        in nueva_config: config["horarios"]        = nueva_config["horarios"]
                print(f"Config actualizada: {config}")
                conn.send(headers)
                conn.send(json.dumps({"status": "ok", "config": config}))
            except Exception as e:
                conn.send("HTTP/1.1 400 Bad Request\r\n\r\n")
                conn.send(json.dumps({"error": str(e)}))

        else:
            conn.send("HTTP/1.1 404 Not Found\r\n\r\n")

    except Exception as e:
        print(f"Error request: {e}")
    finally:
        conn.close()

# ============================================================
# VERIFICAR HORARIOS
# ============================================================

horarios_ejecutados = set()

def verificar_horarios():
    h, m, s = hora_actual()
    clave   = f"{h:02d}:{m:02d}"

    for horario in config["horarios"]:
        hora_prog = horario["hora"]
        min_prog  = horario["minuto"]
        if h == hora_prog and m == min_prog and s <= 20:
            if clave not in horarios_ejecutados:
                print(f"Horario programado: {clave}")
                horarios_ejecutados.add(clave)
                dispensar(config["peso_porcion"], scheduled=True)
        else:
            ejecutado = f"{hora_prog:02d}:{min_prog:02d}"
            if ejecutado in horarios_ejecutados and m != min_prog:
                horarios_ejecutados.discard(ejecutado)

# ============================================================
# PROGRAMA PRINCIPAL
# ============================================================

print("SISTEMA DE ALIMENTACION - Raspberry Pi Pico W")

servo_parar()

if conectar_wifi():
    sincronizar_ntp()
    reportar_estado_mqtt(retain=True)

servidor = iniciar_servidor()
mqtt_cmd_client = None
try:
    mqtt_cmd_client = conectar_mqtt()
except Exception as e:
    print(f"No se pudo conectar al MQTT de comandos: {e}")

ultimo_ntp     = utime.time()
ultimo_consumo = utime.time()
ultimo_peso    = utime.time()

print("Sistema listo\n")

while True:
    try:
        verificar_horarios()

        if utime.time() - ultimo_consumo > 30:
            verificar_consumo()
            verificar_alerta_sin_comer()
            ultimo_consumo = utime.time()

        try:
            conn, addr = servidor.accept()
            manejar_request(conn)
        except OSError:
            pass

        if utime.time() - ultimo_ntp > 21600:
            if wlan.isconnected():
                sincronizar_ntp()
            else:
                conectar_wifi()
                sincronizar_ntp()
            ultimo_ntp = utime.time()

        if utime.time() - ultimo_estado_mqtt > 10:
            reportar_estado_mqtt(retain=True)
        if utime.time() - ultimo_peso > 0.25:
            publicar_telemetria()
            ultimo_peso = utime.time()

        if mqtt_cmd_client:
            try:
                mqtt_cmd_client.check_msg()
            except Exception as e:
                print(f"Error MQTT comando: {e}")
                try:
                    mqtt_cmd_client = conectar_mqtt()
                except Exception as conn_err:
                    print(f"No se pudo reconectar MQTT comandos: {conn_err}")

        time.sleep_ms(100)

    except Exception as e:
        print(f"Error: {e}")
        time.sleep(1)
