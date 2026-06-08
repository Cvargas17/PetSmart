from machine import Pin, ADC
import network
import urequests
import time

# ========== CONFIGURACIÓN ==========
SSID = "emmanuel"
PASSWORD = "emmanu20"
API_URL = "http://10.23.232.57:3000/api/sensor/motion"
SETTINGS_URL = "http://10.23.232.57:3000/api/sensor/notify-setting"

sensor = ADC(Pin(28))
UMBRAL = 15000
TIEMPO_ALERTA = 10
TIEMPO_MINIMO_ENVIO = 1
# ==================================

ultimo_envio = 0
ultimo_movimiento = time.time()
alerta_enviada = False

def conectar_wifi():
    print("Conectando a WiFi...")
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(SSID, PASSWORD)
    
    timeout = 15
    while not wlan.isconnected() and timeout > 0:
        print(f"Esperando... {timeout} segundos")
        time.sleep(1)
        timeout -= 1
    
    if wlan.isconnected():
        print("✅ WiFi conectada!")
        print("IP:", wlan.ifconfig()[0])
        return True
    return False

def notificaciones_activadas():
    """Consulta al servidor si las notificaciones están activadas"""
    try:
        response = urequests.get(SETTINGS_URL)
        texto = response.text
        response.close()
        
        # DEBUG: Imprimir lo que recibe
        print(f"DEBUG Respuesta servidor: '{texto}'")
        
        if '"enabled": true' in texto or '"enabled":true' in texto:
            return True
        elif '"enabled": false' in texto or '"enabled":false' in texto:
            return False
        else:
            return True
    except Exception as e:
        print(f"Error consultando configuración: {e}")
        return True

def enviar_estado(estado, valor, alerta):
    try:
        datos = {"estado": estado, "valor": valor, "alerta": alerta}
        response = urequests.post(API_URL, json=datos)
        response.close()
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

print("=== SENSOR DE MOVIMIENTO ===")

# Muestra valores para calibrar
print("Calibrando...")
for i in range(5):
    print(f"Valor: {sensor.read_u16()}")
    time.sleep(0.5)

if not conectar_wifi():
    print("No se puede continuar")
else:
    print("Sensor listo. Esperando detección...")
    
    while True:
        valor = sensor.read_u16()
        
        if valor < UMBRAL:
            # MOVIMIENTO DETECTADO
            ahora = time.time()
            if ahora - ultimo_envio > TIEMPO_MINIMO_ENVIO:
                print(f"🔴 MOVIMIENTO! Valor: {valor}")
                enviar_estado("movimiento", valor, False)
                ultimo_envio = ahora
            
            # Reiniciar contadores
            ultimo_movimiento = ahora
            alerta_enviada = False
            
        else:
            # SIN MOVIMIENTO
            tiempo_sin = time.time() - ultimo_movimiento
            
            if int(tiempo_sin * 2) % 20 == 0:
                print(f"🟢 Sin movimiento - Valor: {valor}")
            
            # Verificar si debe enviar alerta
            if tiempo_sin >= TIEMPO_ALERTA and not alerta_enviada:
                # CONSULTAR si las notificaciones están activadas
                if notificaciones_activadas():
                    print(f"⚠️ ALERTA! {TIEMPO_ALERTA}s sin movimiento")
                    enviar_estado("sin_movimiento", valor, True)
                else:
                    print(f"🔕 Alerta suprimida (notificaciones desactivadas)")
                alerta_enviada = True  # Marcar como enviada aunque esté desactivada
        
        time.sleep(0.3)