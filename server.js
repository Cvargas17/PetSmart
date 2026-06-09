require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const schedule = require('node-schedule');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const LOGIN_USER = process.env.LOGIN_USER || 'admin';
const LOGIN_PASS = process.env.LOGIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path === '/login.html' || req.path === '/api/login') return next();
  // Excluir endpoints del sensor de la autenticación
const publicApiPaths = ['/api/sensor/motion', '/api/sensor/state', '/api/sensor/history', '/api/sensor/notify-setting'];
// Verificar si la ruta es de la API y si NO está en las públicas
if (req.path.startsWith('/api/')) {
    if (!publicApiPaths.includes(req.path)) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    // Si está en públicas, no hacer nada y continuar
}
  if (req.path === '/' || req.path.endsWith('.html')) return res.redirect('/login.html');
  next();
}

app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

let rewardStatus = {
  stock: 0,
  correctGuesses: 0
};
let rewardConfig = {
  dailyLimit: 0,
  startHour: '00:00',
  endHour: '00:00'
};
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (
    typeof username === 'string' && typeof password === 'string' &&
    username === LOGIN_USER && password === LOGIN_PASS
  ) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

const DB_PATH = path.join(__dirname, 'db.sqlite');
const dbExists = fs.existsSync(DB_PATH);
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('No se pudo abrir la base de datos:', err.message);
    process.exit(1);
  }
});

if (!dbExists) {
  db.run(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT,
      quantity INTEGER DEFAULT 0,
      status TEXT DEFAULT 'activo',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error al crear la tabla products:', err.message);
    } else {
      console.log('Base de datos inicializada en', DB_PATH);
    }
  });

  // Insert default communication system product if not present
  db.get(`SELECT id FROM products WHERE name = ?`, ['sistema de comunicación'], (err, row) => {
    if (err) return console.error('Error comprobando producto por defecto:', err.message);
    if (!row) {
      db.run(`INSERT INTO products (name, sku, quantity, status, notes) VALUES (?, ?, ?, ?, ?)`,
        ['sistema de comunicación', '', 1, 'activo', 'Habla con tu mascota'], (ierr) => {
          if (ierr) console.error('Error insertando producto por defecto:', ierr.message);
          else console.log('Producto por defecto "sistema de comunicación" agregado.');
        });
    }
  });
}

// Create schedules table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    end_time TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Error creando tabla schedules:', err.message);
});
// Add end_time column if it doesn't exist (migration for existing DBs)
db.run(`ALTER TABLE schedules ADD COLUMN end_time TEXT`, () => {});

// gate_state table
db.run(`
  CREATE TABLE IF NOT EXISTS gate_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    last_control TEXT,
    locked_until TEXT,
    updated_at TEXT
  )
`, (err) => {
  if (err) console.error('Error creando tabla gate_state:', err.message);
  // ensure single row exists
  db.run(`INSERT OR IGNORE INTO gate_state (id, state, updated_at) VALUES (1, 'closed', CURRENT_TIMESTAMP)`);
});

db.run(`
  CREATE TABLE IF NOT EXISTS telegram_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    phone TEXT,
    bot_token TEXT,
    chat_id TEXT,
    enabled INTEGER DEFAULT 0,
    updated_at TEXT
  )
`, (err) => {
  if (err) console.error('Error creando tabla telegram_settings:', err.message);
  db.run(
    `INSERT OR IGNORE INTO telegram_settings (id, phone, bot_token, chat_id, enabled, updated_at) VALUES (1, '', ?, ?, ?, CURRENT_TIMESTAMP)`,
    [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? 1 : 0]
  );

  // Ensure default communication system product exists (useful if DB already existed)
  db.get(`SELECT id FROM products WHERE name = ?`, ['sistema de comunicación'], (err, row) => {
    if (err) return console.error('Error comprobando producto por defecto:', err.message);
    if (!row) {
      db.run(`INSERT INTO products (name, sku, quantity, status, notes) VALUES (?, ?, ?, ?, ?)`,
        ['sistema de comunicación', 'RPI-PICO-W', 1, 'activo', 'Habla con tu mascota'], (ierr) => {
          if (ierr) console.error('Error insertando producto por defecto:', ierr.message);
          else console.log('Producto por defecto "sistema de comunicación" agregado.');
        });
    }
  });
});

db.run(`
  CREATE TABLE IF NOT EXISTS motion_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estado TEXT NOT NULL,
    valor INTEGER,
    alerta INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Error creando tabla motion_events:', err.message);
});

// Tabla para configuración del sensor
db.run(`
  CREATE TABLE IF NOT EXISTS sensor_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    notify_enabled INTEGER DEFAULT 1,
    updated_at TEXT
  )
`, (err) => {
  if (err) console.error('Error creando tabla sensor_settings:', err.message);
  else {
    // Insertar registro por defecto si no existe
    db.run(`INSERT OR IGNORE INTO sensor_settings (id, notify_enabled, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP)`);
  }
});

// Serial port setup
const ARDUINO_PORT = process.env.ARDUINO_PORT || 'DEMO';
let arduinoPort = null;
let serialReady = false;
let lastArduinoMessage = '';
const scheduledJobs = new Map();
const OPEN_DURATION_MS = 3000; // must match Arduino OPEN duration

// MQTT setup
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'alerta';
const MQTT_STATUS_TOPIC = process.env.MQTT_STATUS_TOPIC || 'alerta/status';
let mqttClient = null;
let raspberryConnected = false;
let raspberryLastSeen = 0;
const RASPBERRY_STATUS_TIMEOUT_MS = 15000;

function updateRaspberryStatus(isConnected) {
  raspberryConnected = !!isConnected;
  if (raspberryConnected) {
    raspberryLastSeen = Date.now();
  }
}

function handleStatusMessage(payload) {
  try {
    let message = payload.toString().trim();
    if ((message.startsWith('"') && message.endsWith('"')) || (message.startsWith("'") && message.endsWith("'"))) {
      message = message.slice(1, -1).trim();
    }

    const normalized = message.toLowerCase();
    if (normalized === 'online' || normalized === '1' || normalized === 'true') {
      updateRaspberryStatus(true);
      return;
    }

    if (normalized === 'offline' || normalized === '0' || normalized === 'false') {
      updateRaspberryStatus(false);
      return;
    }

    if (message.startsWith('{') || message.startsWith('[')) {
      const data = JSON.parse(message);
      if (data.status === 'online' || data.connected === true) {
        updateRaspberryStatus(true);
        return;
      }
      if (data.status === 'offline' || data.connected === false) {
        updateRaspberryStatus(false);
        return;
      }
    }
  } catch (e) {
    console.warn('No se pudo parsear estado Raspberry MQTT:', e.message);
  }
}

try {
  mqttClient = mqtt.connect(MQTT_BROKER, { clientId: `petSmart_server_${Math.random().toString(16).slice(2,8)}` });
  mqttClient.on('connect', () => {
    console.log('Conectado a broker MQTT:', MQTT_BROKER);
    mqttClient.subscribe(MQTT_STATUS_TOPIC, { qos: 1 }, (err) => {
      if (err) console.error('Error suscribiendo al estado Raspberry:', err.message);
    });
  });
  mqttClient.on('error', (e) => console.error('MQTT error:', e && e.message));
  mqttClient.on('close', () => {
    console.warn('MQTT conexión cerrada');
  });
  mqttClient.on('message', (topic, payload) => {
    if (topic === MQTT_STATUS_TOPIC) {
      handleStatusMessage(payload);
    }
  });
} catch (e) {
  console.error('No se pudo inicializar MQTT:', e.message);
  mqttClient = null;
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function getTelegramSettings() {
  const row = await getDb('SELECT phone, bot_token, chat_id, enabled FROM telegram_settings WHERE id = 1');
  return {
    phone: row?.phone || '',
    botToken: row?.bot_token || TELEGRAM_BOT_TOKEN,
    chatId: row?.chat_id || TELEGRAM_CHAT_ID,
    enabled: !!row?.enabled
  };
}

async function sendTelegramMessage(text, { force = false } = {}) {
  const settings = await getTelegramSettings();
  if (!settings.botToken || !settings.chatId) {
    if (force) throw new Error('Faltan Bot token o Chat ID de Telegram');
    return { skipped: true };
  }
  if (!settings.enabled && !force) {
    return { skipped: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: settings.chatId, text })
  });
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.description || 'Error al enviar Telegram');
  }
  return result;
}

function notifyGateState(state, lastControl) {
  const action = state === 'open' ? 'abierta' : 'cerrada';
  const control = lastControl === 'schedule' ? 'schedule' : 'manual';
  sendTelegramMessage(`Puerta ${action}\nControl: ${control}\nHora: ${new Date().toLocaleString()}`)
    .catch((err) => console.error('Error enviando notificacion Telegram:', err.message));
}
function handleRewardSerialMessage(line){
  const msg = line.toString().trim();

  if (!msg) return;

  console.log('Arduino recompensa:', msg);

  try {
    const data = JSON.parse(msg);

    if (data.stock !== undefined) {
      rewardStatus.stock =
        Number(data.stock);
    }

    if (data.correctGuesses !== undefined) {
      rewardStatus.correctGuesses =
        Number(data.correctGuesses);
    }

    console.log(
      'Reward status actualizado:',
      rewardStatus
    );

  } catch (e) {
    console.log(
      'Mensaje ignorado:',
      msg
    );
  }
}

function initSerial() {
  if (!ARDUINO_PORT || ARDUINO_PORT === 'DEMO') {
    if (ARDUINO_PORT === 'DEMO') {
      console.log('MODO DEMO: Puerta simulada, sin conexión real a Arduino.');
    } else {
      console.warn('No ARDUINO_PORT configurado. La puerta no podrá abrirse por serie.');
    }
    return;
  }

  try {
    arduinoPort = new SerialPort({ path: ARDUINO_PORT, baudRate: 9600 }); 
    const parser = arduinoPort.pipe( new ReadlineParser({ delimiter: '\n' }) );
    arduinoPort.on('open', () => {
      serialReady = true;
    });
    arduinoPort.on('error', () => {
      serialReady = false;
    });
    arduinoPort.on('close', () => {
      serialReady = false;
    });
    arduinoPort.on('open', () => console.log('Conexión serie con Arduino abierta en', ARDUINO_PORT));
    arduinoPort.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) lastArduinoMessage = msg;
      console.log('Arduino:', msg);
    });
    parser.on('data', (line) => {
      handleRewardSerialMessage(line);
    });
    arduinoPort.on('error', (err) => console.error('Error puerto serie:', err.message));
  } catch (e) {
    console.error('No se pudo inicializar el puerto serie:', e.message);
    arduinoPort = null;
  }
}

function sendGateCommand(cmd, lastControl = 'manual') {
  return new Promise((resolve, reject) => {
    if (ARDUINO_PORT === 'DEMO') {
      console.log(`[DEMO] Comando ${cmd} enviado (sin Arduino real)`);
      try {
        const now = new Date();
        if (cmd === 'OPEN') {
          db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['open', lastControl], (err) => {
            if (err) console.error('Error actualizando estado:', err.message);
            else notifyGateState('open', lastControl);
          });
        } else if (cmd === 'CLOSE') {
          db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['closed', lastControl], (err) => {
            if (err) console.error('Error actualizando estado:', err.message);
            else notifyGateState('closed', lastControl);
          });
        }
      } catch (e) {
        console.error('Error actualizando estado de puerta:', e.message);
      }
      return resolve();
    }

    if (!ARDUINO_PORT) {
      return reject(new Error('ARDUINO_PORT no configurado. Define el puerto del Arduino, por ejemplo COM3.'));
    }

    if (!serialReady || !arduinoPort || !arduinoPort.isOpen || !arduinoPort.writable) {
      return reject(new Error(`Arduino no conectado o puerto no disponible (${ARDUINO_PORT}). Revisa el cable, el puerto COM y reinicia el servidor.`));
    }

    try {
      arduinoPort.write(cmd + '\n', async (err) => {
        if (err) return reject(err);
        // update gate state in DB
        try {
          const now = new Date();
          if (cmd === 'OPEN') {
            db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['open', lastControl], (err) => {
              if (err) console.error('Error actualizando estado:', err.message);
              else notifyGateState('open', lastControl);
            });
          } else if (cmd === 'CLOSE') {
            db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['closed', lastControl], (err) => {
              if (err) console.error('Error actualizando estado:', err.message);
              else notifyGateState('closed', lastControl);
            });
          }
        } catch (e) {
          console.error('Error actualizando estado de puerta:', e.message);
        }
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

function getGateState() {
  return new Promise((resolve, reject) => {
    db.get('SELECT state, last_control, locked_until, updated_at FROM gate_state WHERE id = 1', [], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve({ state: 'closed', last_control: null, locked_until: null });
      resolve(row);
    });
  });
}

function scheduleAllFromDb() {
  db.all('SELECT id, time, enabled FROM schedules WHERE enabled = 1', [], (err, rows) => {
    if (err) return console.error('Error cargando schedules:', err.message);
    rows.forEach((r) => scheduleJobFromRow(r));
  });
}

function scheduleJobFromRow(row) {
  // row.time expected as HH:MM
  // cancel existing job for this id if present
  cancelScheduledJob(row.id);
  const [hour, minute] = (row.time || '00:00').split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return;
  const startJob = schedule.scheduleJob(`0 ${minute} ${hour} * * *`, async () => {
    console.log('Ejecutando schedule id', row.id, '-> cerrar puerta');
    try {
      const gateState = await getGateState();
      if (gateState.state !== 'closed') {
        await sendGateCommand('CLOSE', 'schedule');
        console.log('Comando CLOSE enviado por schedule', row.id);
      } else {
        console.log('Schedule id', row.id, '-> puerta ya estaba cerrada');
      }
    } catch (e) {
      console.error('Error enviando comando CLOSE desde schedule:', e.message);
    }
  });

  let endJob = null;
  if (row.end_time) {
    const [eHour, eMinute] = row.end_time.split(':').map(Number);
    if (!Number.isNaN(eHour) && !Number.isNaN(eMinute)) {
      endJob = schedule.scheduleJob(`0 ${eMinute} ${eHour} * * *`, async () => {
        console.log('Fin de schedule id', row.id, '-> abrir puerta');
        try {
          await sendGateCommand('OPEN', 'schedule');
          console.log('Comando OPEN enviado al fin de schedule', row.id);
        } catch (e) {
          console.error('Error enviando comando OPEN al fin de schedule:', e.message);
        }
      });
    }
  }

  scheduledJobs.set(row.id, { startJob, endJob });
}

function cancelScheduledJob(id) {
  const entry = scheduledJobs.get(Number(id));
  if (entry) {
    if (entry.startJob) entry.startJob.cancel();
    if (entry.endJob) entry.endJob.cancel();
    scheduledJobs.delete(Number(id));
  }
}

app.get('/api/products', (req, res) => {
  db.all('SELECT id, name, sku, sku AS type, quantity, status, notes, created_at FROM products ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { name, sku, type, quantity, status, notes } = req.body;
  const sql = `INSERT INTO products (name, sku, quantity, status, notes) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [name, type || sku || '', quantity || 0, status || 'activo', notes || ''], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID });
  });
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, sku, type, quantity, status, notes } = req.body;
  const sql = `UPDATE products SET name = ?, sku = ?, quantity = ?, status = ?, notes = ? WHERE id = ?`;
  db.run(sql, [name, type || sku || '', quantity || 0, status || 'activo', notes || '', id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ changes: this.changes });
  });
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ changes: this.changes });
  });
});

app.get('/api/telegram/settings', async (req, res) => {
  try {
    const settings = await getTelegramSettings();
    res.json({
      phone: settings.phone,
      botToken: settings.botToken,
      chatId: settings.chatId,
      enabled: settings.enabled
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/telegram/settings', async (req, res) => {
  const { phone, botToken, chatId, enabled } = req.body;
  try {
    await runDb(
      `INSERT OR REPLACE INTO telegram_settings (id, phone, bot_token, chat_id, enabled, updated_at) VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [phone || '', botToken || '', chatId || '', enabled ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/test', async (req, res) => {
  try {
    await sendTelegramMessage('Prueba PetSmart: Telegram configurado correctamente.', { force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notify', async (req, res) => {
  const { productId, message } = req.body;
  if (!productId || !message) {
    return res.status(400).json({ error: 'productId y message son obligatorios' });
  }

  db.get('SELECT * FROM products WHERE id = ?', [productId], async (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const text = `Producto: ${product.name}\nTipo: ${product.sku || '-'}\nCantidad: ${product.quantity}\nEstado: ${product.status}\nMensaje: ${message}`;

    try {
      const result = await sendTelegramMessage(text, { force: true });
      res.json({ success: true, telegram: result });
    } catch (fetchError) {
      res.status(500).json({ error: fetchError.message });
    }
  });
});

// Gate endpoints
app.post('/api/gate/open', async (req, res) => {
  try {
    const state = await getGateState();
    const now = new Date();
    if (state.locked_until && state.last_control === 'schedule' && new Date(state.locked_until) > now) {
      return res.status(423).json({ error: 'Schedule tiene precedencia hasta ' + state.locked_until });
    }
    if (state.state === 'open') {
      return res.status(400).json({ error: 'La puerta ya está abierta. Solo se puede cerrar.' });
    }
    await sendGateCommand('OPEN', 'manual');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error enviando comando a Arduino' });
  }
});

app.post('/api/gate/close', async (req, res) => {
  try {
    const state = await getGateState();
    const now = new Date();
    if (state.locked_until && state.last_control === 'schedule' && new Date(state.locked_until) > now) {
      return res.status(423).json({ error: 'Schedule tiene precedencia hasta ' + state.locked_until });
    }
    if (state.state === 'closed') {
      return res.status(400).json({ error: 'La puerta ya está cerrada. Solo se puede abrir.' });
    }
    await sendGateCommand('CLOSE', 'manual');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error enviando comando a Arduino' });
  }
});

app.get('/api/gate/state', async (req, res) => {
  try {
    const state = await getGateState();
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/gate/connection', (req, res) => {
  res.json({
    connected: serialReady,
    port: ARDUINO_PORT || null,
    demo: ARDUINO_PORT === 'DEMO',
    lastMessage: lastArduinoMessage || null
  });
});

app.get('/api/communication/connection', (req, res) => {
  const now = Date.now();
  if (raspberryConnected && now - raspberryLastSeen > RASPBERRY_STATUS_TIMEOUT_MS) {
    raspberryConnected = false;
  }

  res.json({
    connected: raspberryConnected,
    broker: MQTT_BROKER,
    topic: MQTT_TOPIC,
    statusTopic: MQTT_STATUS_TOPIC,
    lastSeen: raspberryLastSeen || null
  });
});

app.get('/api/gate/schedules', (req, res) => {
  db.all('SELECT id, time, end_time, enabled, created_at FROM schedules ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/gate/schedules', (req, res) => {
  const { time, end, enabled } = req.body;
  const timeRe = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
  if (!time || !timeRe.test(time)) {
    return res.status(400).json({ error: 'time es requerido en formato HH:MM' });
  }
  if (end && !timeRe.test(end)) {
    return res.status(400).json({ error: 'end es requerido en formato HH:MM' });
  }
  const sql = `INSERT INTO schedules (time, end_time, enabled) VALUES (?, ?, ?)`;
  db.run(sql, [time, end || null, enabled ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    if (enabled) scheduleJobFromRow({ id, time, end_time: end || null, enabled: 1 });
    res.json({ id });
  });
});

// Update schedule (time and enabled)
app.put('/api/gate/schedules/:id', (req, res) => {
  const { id } = req.params;
  const { time, end, enabled } = req.body;
  const timeRe = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
  if (!time || !timeRe.test(time)) {
    return res.status(400).json({ error: 'time es requerido en formato HH:MM' });
  }
  if (end && !timeRe.test(end)) {
    return res.status(400).json({ error: 'end es requerido en formato HH:MM' });
  }
  db.run('UPDATE schedules SET time = ?, end_time = ?, enabled = ? WHERE id = ?', [time, end || null, enabled ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    cancelScheduledJob(id);
    if (enabled) scheduleJobFromRow({ id: Number(id), time, end_time: end || null, enabled: 1 });
    res.json({ changes: this.changes });
  });
});

// Toggle enabled state
app.patch('/api/gate/schedules/:id/toggle', (req, res) => {
  const { id } = req.params;
  db.get('SELECT enabled, time, end_time FROM schedules WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Schedule no encontrado' });
    const newEnabled = row.enabled ? 0 : 1;
    db.run('UPDATE schedules SET enabled = ? WHERE id = ?', [newEnabled, id], function (uerr) {
      if (uerr) return res.status(500).json({ error: uerr.message });
      cancelScheduledJob(id);
      if (newEnabled) scheduleJobFromRow({ id: Number(id), time: row.time, end_time: row.end_time, enabled: 1 });
      res.json({ id: Number(id), enabled: !!newEnabled });
    });
  });
});

app.delete('/api/gate/schedules/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM schedules WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    cancelScheduledJob(id);
    res.json({ changes: this.changes });
  });
});

// ===== SENSOR DE MOVIMIENTO ENDPOINTS =====

app.get('/api/sensor/state', (req, res) => {
  db.get(
    `SELECT estado, valor, alerta, created_at FROM motion_events ORDER BY created_at DESC LIMIT 1`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || { estado: 'sin_datos', valor: 0, alerta: 0 });
    }
  );
});

app.get('/api/sensor/history', (req, res) => {
  const limit = req.query.limit || 20;
  db.all(
    `SELECT id, estado, valor, alerta, created_at FROM motion_events ORDER BY created_at DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/sensor/notify-setting', (req, res) => {
  db.get('SELECT notify_enabled FROM sensor_settings WHERE id = 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ enabled: row ? row.notify_enabled === 1 : true });
  });
});

app.post('/api/sensor/notify-setting', (req, res) => {
  const { enabled } = req.body;
  db.run(
    `UPDATE sensor_settings SET notify_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    [enabled ? 1 : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.post('/api/sensor/motion', (req, res) => {
  const { estado, valor, alerta } = req.body;
  if (!estado) {
    return res.status(400).json({ error: 'estado es obligatorio' });
  }
  
  db.run(
    `INSERT INTO motion_events (estado, valor, alerta) VALUES (?, ?, ?)`,
    [estado, valor || 0, alerta ? 1 : 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      if (alerta) {
        db.get('SELECT notify_enabled FROM sensor_settings WHERE id = 1', [], (err, row) => {
          if (!err && row && row.notify_enabled === 1) {
            sendTelegramMessage(`🚨 ALERTA DE MOVIMIENTO\nEstado: ${estado}\nValor: ${valor}\nHora: ${new Date().toLocaleString()}`)
              .catch(e => console.error('Error enviando Telegram:', e.message));
          }
        });
      }
      
      res.json({ id: this.lastID });
    }
  );
});

app.post('/api/communication/speak', async (req, res) => {
  try {
    const { productId, frequency = 880, duration = 0.9, action } = req.body || {};
    const isStart = action === 'start';
    const isStop = action === 'stop';
    const payloadBody = isStop
      ? { action: 'stop', f: 0, d: 0 }
      : { action: 'start', f: Number(frequency) || 880, d: -1 };

    console.log('📢 POST /api/communication/speak:', { productId, frequency, duration, action, payloadBody });

    if (!mqttClient || !mqttClient.connected) {
      console.warn('❌ MQTT no conectado. No se puede enviar la señal de comunicación.');
      return res.status(503).json({ error: 'Sistema de comunicación no disponible. MQTT no está conectado.' });
    }

    const now = Date.now();
    if (raspberryConnected && now - raspberryLastSeen > RASPBERRY_STATUS_TIMEOUT_MS) {
      raspberryConnected = false;
    }

    if (!raspberryConnected) {
      console.warn('❌ Raspberry no conectada. No se puede enviar la señal de comunicación.');
      return res.status(503).json({ error: 'Raspberry no conectada. Espera a que se reconecte.' });
    }

    const payload = JSON.stringify(payloadBody);
    console.log(`📤 Publicando en MQTT topic "${MQTT_TOPIC}":`, payload);
    mqttClient.publish(MQTT_TOPIC, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error('❌ Error publicando MQTT:', err.message);
      } else {
        console.log('✅ Mensaje publicado en MQTT exitosamente');
      }
    });

    if (isStart) {
      try {
        await sendTelegramMessage('Se utilizó el sistema de comunicación', { force: true });
      } catch (tgErr) {
        console.error('Error enviando Telegram:', tgErr.message);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error en /api/communication/speak:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// reward system 
function calculateRewardInHours() {
  const now =
    new Date();

  const currentMinutes =
    now.getHours() * 60 +
    now.getMinutes();

  const [
    startHour,
    startMinute
  ] =
    rewardConfig.startHour
      .split(':')
      .map(Number);

  const [
    endHour,
    endMinute
  ] =
    rewardConfig.endHour
      .split(':')
      .map(Number);

  const startMinutes =
    startHour * 60 +
    startMinute;

  const endMinutes =
    endHour * 60 +
    endMinute;

  return (
    currentMinutes >=
      startMinutes &&
    currentMinutes <
      endMinutes
  );
}
function sendArduinoJson(data) {
  return new Promise(
    (resolve, reject) => {
      if (
        !arduinoPort ||
        !arduinoPort.isOpen ||
        !arduinoPort.writable
      ) {
        return reject(
          new Error(
            'Arduino no conectado'
          )
        );
      }

      arduinoPort.write(
        JSON.stringify(data) + '\n',
        (err) => {
          if (err) {
            return reject(err);
          }

          resolve();
        }
      );
    }
  );
}

async function getRewardStatus() {
    if (!arduinoPort?.isOpen) {
    throw new Error(
      'Arduino no conectado'
    );
  }
  return {
    ...rewardStatus,
    ...rewardConfig
  };
}
app.put(
  '/api/reward/config',
  async (req, res) => {
    try {
      const dailyLimit =
        Number(req.body.dailyLimit);

      const stock =
        Number(req.body.stock);

      const startHour =
        req.body.startHour;

      const endHour =
        req.body.endHour;

      if (
        !Number.isInteger(dailyLimit) ||
        dailyLimit < 0
      ) {
        return res.status(400).json({
          error:
            'El límite debe ser un entero mayor o igual a 0.'
        });
      }

      if (
        !Number.isInteger(stock) ||
        stock < 0
      ) {
        return res.status(400).json({
          error:
            'El stock debe ser un entero mayor o igual a 0.'
        });
      }

      if (
        !/^\d{2}:\d{2}$/.test(startHour) ||
        !/^\d{2}:\d{2}$/.test(endHour)
      ) {
        return res.status(400).json({
          error:
            'Las horas deben usar el formato HH:MM.'
        });
      }

      rewardConfig.dailyLimit =
        dailyLimit;

      rewardConfig.startHour =
        startHour;

      rewardConfig.endHour =
        endHour;

      rewardStatus.stock =
        stock;

      await sendRewardConfig();

      res.json({
        success: true,
        config: {
          ...rewardConfig,
          stock:
            rewardStatus.stock,
          inHours:
            calculateRewardInHours()
        }
      });

    } catch (e) {
      console.error(
        'Error en /api/reward/config:',
        e.message
      );

      res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get('/api/reward/status', async (req, res) => {
  try {
    const data = await getRewardStatus();
    res.json(data);
  } catch (e) {
    console.error(
      'Error en /api/reward/status:',
      e.message
    );

    res.status(500).json({
      error: e.message
    });
  }
});
async function dispenseReward() {
  await sendArduinoJson({
    dispense: true
  });
};

async function sendRewardConfig() {
  await sendArduinoJson({
    limit:
      rewardConfig.dailyLimit,

    stock:
      rewardStatus.stock,

    inHours:
      calculateRewardInHours()
  });
}

app.post('/api/reward/dispense', async (req, res) => {

  try {

    await dispenseReward();
    res.json({
      success: true
    });
  } catch (e) {
    console.error(
      'Error en /api/reward/dispense:',
      e.message
    );
    res.status(500).json({
      success: false,
      error: e.message
    });

  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});



initSerial();
scheduleAllFromDb();
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: el puerto ${PORT} ya está en uso. Detén el proceso que lo usa o configura otra variable PORT.`);
    process.exit(1);
  }
  throw err;
});
