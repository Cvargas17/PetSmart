# PetSmart Product Control

Aplicación web para controlar productos y enviar notificaciones a Telegram.

## Instalación (C#)

1. Asegúrate de tener el SDK de .NET instalado (net8.0 o net7.0).

2. Restaura paquetes:

```bash
dotnet restore
```

3. Copia el archivo de ejemplo y configura tus credenciales de Telegram:

```bash
copy .env.example .env
```

4. Inicia la aplicación C#:

```bash
dotnet run
```

5. Para probar el servidor Node con Arduino, usa:

```bash
npm install
set ARDUINO_PORT=COM3
npm start
```

- Alternativamente en Windows puedes ejecutar:

```bash
start-server.bat
```

- Si quieres iniciar la app .NET de `Program.cs`, usa:

```bash
start-dotnet.bat
```

6. Abre en el navegador:

```text
http://localhost:3000
```

> Para reiniciar rápido durante pruebas puedes usar:
>
> ```bash
> npm run dev
> ```

---

## Uso

- Agrega productos con nombre, SKU, cantidad, estado y notas.
- Edita o elimina productos.
- Envía notificaciones a Telegram desde cada producto.

## Integración con Arduino (Puerta)

Pasos mínimos para usar la puerta controlada por Arduino:

1. Instala dependencias de Node (si usas `server.js`):

```bash
npm install serialport node-schedule
```

2. Configura la variable de entorno `ARDUINO_PORT` con el puerto serie donde está conectado el Arduino (ej. `COM3` en Windows):

```bash
set ARDUINO_PORT=COM3
node server.js
```

3. Flashea el sketch Arduino en `arduino/gate_controller.ino`. El servo esta configurado en el pin digital 3.

4. En la web, usa el botón "Abrir puerta (manual)" o crea schedules desde la UI.

Notas:
- El backend envía la cadena `OPEN` por serie al Arduino; el sketch mueve un servo y lo vuelve a cerrar automáticamente.
- Ajusta `SERVO_PIN`, `OPEN_ANGLE`, `CLOSED_ANGLE` y `OPEN_DURATION_MS` en el sketch según tu montaje.

## Uso

- Agrega productos con nombre, SKU, cantidad, estado y notas.
- Edita o elimina productos.
- Envía notificaciones a Telegram desde cada producto.
