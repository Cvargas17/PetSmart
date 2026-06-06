require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { SerialPort } = require('serialport');
const schedule = require('node-schedule');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        ['sistema de comunicación', 'RPI-PICO-W', 1, 'activo', 'Sistema de comunicación (Raspberry Pi Pico W) — botón Hablar que emite sonido en la web.'], (ierr) => {
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
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Error creando tabla schedules:', err.message);
});

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
        ['sistema de comunicación', 'RPI-PICO-W', 1, 'activo', 'Sistema de comunicación (Raspberry Pi Pico W) — botón Hablar que emite sonido en la web.'], (ierr) => {
          if (ierr) console.error('Error insertando producto por defecto:', ierr.message);
          else console.log('Producto por defecto "sistema de comunicación" agregado.');
        });
    }
  });
});

// Serial port setup
const ARDUINO_PORT = process.env.ARDUINO_PORT || '';
let arduinoPort = null;
let serialReady = false;
let lastArduinoMessage = '';
const scheduledJobs = new Map();
const OPEN_DURATION_MS = 3000; // must match Arduino OPEN duration

// MQTT setup
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'mi_proyecto/melodia';
let mqttClient = null;
try {
  mqttClient = mqtt.connect(MQTT_BROKER, { clientId: `petSmart_server_${Math.random().toString(16).slice(2,8)}` });
  mqttClient.on('connect', () => console.log('Conectado a broker MQTT:', MQTT_BROKER));
  mqttClient.on('error', (e) => console.error('MQTT error:', e && e.message));
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
          const lockedUntil = new Date(now.getTime() + OPEN_DURATION_MS).toISOString();
          db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`, ['open', lastControl, lockedUntil]);
          notifyGateState('open', lastControl);
          setTimeout(() => {
            db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['closed', lastControl], (err) => {
              if (err) console.error('Error actualizando estado:', err.message);
              else notifyGateState('closed', lastControl);
            });
          }, OPEN_DURATION_MS + 200);
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
            const lockedUntil = new Date(now.getTime() + OPEN_DURATION_MS).toISOString();
            db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`, ['open', lastControl, lockedUntil]);
            notifyGateState('open', lastControl);
            // schedule a DB update to mark closed after OPEN_DURATION_MS so server state matches servo
            setTimeout(() => {
              db.run(`INSERT OR REPLACE INTO gate_state (id, state, last_control, locked_until, updated_at) VALUES (1, ?, ?, NULL, CURRENT_TIMESTAMP)`, ['closed', lastControl], (err) => {
                if (err) console.error('Error al actualizar estado a closed después de OPEN duration:', err.message);
                else notifyGateState('closed', lastControl);
              });
            }, OPEN_DURATION_MS + 200);
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
  // cron: second minute hour day month dayOfWeek
  const cron = `0 ${minute} ${hour} * * *`;
  const job = schedule.scheduleJob(cron, async () => {
    console.log('Ejecutando schedule id', row.id, '-> abrir puerta');
    try {
      // set last_control to schedule and update state (sendGateCommand will also update)
      await sendGateCommand('OPEN', 'schedule');
      console.log('Comando OPEN enviado por schedule', row.id);
    } catch (e) {
      console.error('Error enviando comando OPEN desde schedule:', e.message);
    }
  });
  scheduledJobs.set(row.id, job);
}

function cancelScheduledJob(id) {
  const job = scheduledJobs.get(Number(id));
  if (job) {
    job.cancel();
    scheduledJobs.delete(Number(id));
  }
}

initSerial();
scheduleAllFromDb();

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

app.get('/api/gate/schedules', (req, res) => {
  db.all('SELECT id, time, enabled, created_at FROM schedules ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/gate/schedules', (req, res) => {
  const { time, enabled } = req.body;
  if (!time || !/^(?:[01]?\d|2[0-3]):00$/.test(time)) {
    return res.status(400).json({ error: 'time es requerido en formato HH:00' });
  }
  const sql = `INSERT INTO schedules (time, enabled) VALUES (?, ?)`;
  db.run(sql, [time, enabled ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    if (enabled) scheduleJobFromRow({ id, time, enabled: 1 });
    res.json({ id });
  });
});

// Update schedule (time and enabled)
app.put('/api/gate/schedules/:id', (req, res) => {
  const { id } = req.params;
  const { time, enabled } = req.body;
  if (!time || !/^(?:[01]?\d|2[0-3]):00$/.test(time)) {
    return res.status(400).json({ error: 'time es requerido en formato HH:00' });
  }
  db.run('UPDATE schedules SET time = ?, enabled = ? WHERE id = ?', [time, enabled ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    // cancel existing job then reschedule if enabled
    cancelScheduledJob(id);
    if (enabled) scheduleJobFromRow({ id: Number(id), time, enabled: 1 });
    res.json({ changes: this.changes });
  });
});

// Toggle enabled state
app.patch('/api/gate/schedules/:id/toggle', (req, res) => {
  const { id } = req.params;
  db.get('SELECT enabled, time FROM schedules WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Schedule no encontrado' });
    const newEnabled = row.enabled ? 0 : 1;
    db.run('UPDATE schedules SET enabled = ? WHERE id = ?', [newEnabled, id], function (uerr) {
      if (uerr) return res.status(500).json({ error: uerr.message });
      cancelScheduledJob(id);
      if (newEnabled) scheduleJobFromRow({ id: Number(id), time: row.time, enabled: 1 });
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

// Endpoint para hacer que el sistema de comunicación emita sonido (publica MQTT y notifica Telegram)
app.post('/api/communication/speak', async (req, res) => {
  try {
    const { productId, frequency = 880, duration = 0.9 } = req.body || {};
    console.log('📢 POST /api/communication/speak:', { productId, frequency, duration });
    
    // publish MQTT message
    if (!mqttClient) {
      console.warn('❌ MQTT client not initialized');
    } else if (!mqttClient.connected) {
      console.warn('⚠️  MQTT no conectado, intentando continuar');
    } else {
      const payload = JSON.stringify({ f: Number(frequency) || 0, d: Number(duration) || 0.9 });
      console.log(`📤 Publicando en MQTT topic "${MQTT_TOPIC}":`, payload);
      mqttClient.publish(MQTT_TOPIC, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ Error publicando MQTT:', err.message);
        } else {
          console.log('✅ Mensaje publicado en MQTT exitosamente');
        }
      });
    }

    // send Telegram notification (if configured)
    const prodRow = await getDb('SELECT name FROM products WHERE id = ?', [productId || 1]);
    const pname = prodRow?.name || 'sistema de comunicación';
    try {
      await sendTelegramMessage(`Se está hablando en ${pname}`, { force: true });
    } catch (tgErr) {
      console.error('Error enviando Telegram:', tgErr.message);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error en /api/communication/speak:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
