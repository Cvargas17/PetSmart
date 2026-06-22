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

# Servo (rotación continua)
VEL_ABRIR  = 1000  # us — sentido B (abre)
VEL_CERRAR = 2000  # us — sentido A (cierra)
VEL_PARAR  = 1500  # us — quieto

# Margen para cerrar antes de llegar al objetivo (overshoot)
MARGEN_PESO = 5

# Puerto servidor HTTP
HTTP_PORT = 80

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
    peso = (lectura - TARA) / FACTOR
    if -FILTRO < peso < FILTRO:
        peso = 0.0
    return round(peso, 1)

# ============================================================
# FUNCIONES: PARLANTE
# ============================================================

def pitido(duracion_ms=300):
    buzzer.value(1)
    time.sleep_ms(duracion_ms)
    buzzer.value(0)
    time.sleep_ms(100)

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

def sincronizar_ntp():
    try:
        ntptime.settime()
        print("Hora sincronizada con NTP")
        return True
    except:
        print("No se pudo sincronizar NTP")
        return False

def hora_actual():
    t = utime.localtime()
    return t[3], t[4], t[5]  # hora, minuto, segundo

# ============================================================
# FUNCIONES: DISPENSADOR
# ============================================================

ultimo_dispense  = None
peso_antes       = 0
registro_consumo = []

def dispensar(gramos_objetivo):
    global ultimo_dispense, peso_antes

    print(f"Dispensando {gramos_objetivo}g...")
    alerta_dispensando()

    peso_inicial = leer_peso()
    if peso_inicial is None:
        print("Error leyendo celda de carga")
        return False

    peso_antes = peso_inicial
    objetivo   = peso_inicial + gramos_objetivo - MARGEN_PESO

    servo_abrir()
    timeout = 0

    while True:
        peso_actual = leer_peso()
        if peso_actual is not None:
            dispensado = peso_actual - peso_inicial
            print(f"Dispensado: {dispensado:.1f}g")
            if peso_actual >= objetivo:
                break
        time.sleep_ms(100)
        timeout += 1
        if timeout > 300:
            print("Timeout — cerrando compuerta")
            break

    servo_cerrar()
    time.sleep_ms(130)
    servo_parar()

    peso_final    = leer_peso()
    total_servido = peso_final - peso_antes if peso_final else 0
    print(f"Total dispensado: {total_servido:.1f}g")

    h, m, s = hora_actual()
    ultimo_dispense = utime.time()
    registro_consumo.append({
        "hora":    f"{h:02d}:{m:02d}",
        "servido": total_servido,
        "comido":  0
    })

    return True

def verificar_consumo():
    if not registro_consumo:
        return
    ultimo = registro_consumo[-1]
    if ultimo["comido"] > 0:
        return
    peso_actual = leer_peso()
    if peso_actual is None:
        return
    if peso_antes - peso_actual > 5:
        ultimo["comido"] = peso_antes - peso_actual
        print(f"Mascota comio: {ultimo['comido']:.1f}g")

def verificar_alerta_sin_comer():
    if ultimo_dispense is None:
        return
    horas = (utime.time() - ultimo_dispense) / 3600
    if horas >= config["horas_sin_comer"]:
        if registro_consumo and registro_consumo[-1]["comido"] == 0:
            print(f"Alerta: mascota no ha comido en {config['horas_sin_comer']} horas")
            alerta_sin_comer()

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
            conn.close()
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
        if h == hora_prog and m == min_prog:
            if clave not in horarios_ejecutados:
                print(f"Horario programado: {clave}")
                horarios_ejecutados.add(clave)
                dispensar(config["peso_porcion"])
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

servidor = iniciar_servidor()

ultimo_ntp     = utime.time()
ultimo_consumo = utime.time()

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

        time.sleep_ms(500)

    except Exception as e:
        print(f"Error: {e}")
        time.sleep(1)
