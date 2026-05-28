const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

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
}

app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { name, sku, quantity, status, notes } = req.body;
  const sql = `INSERT INTO products (name, sku, quantity, status, notes) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [name, sku || '', quantity || 0, status || 'activo', notes || ''], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID });
  });
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, sku, quantity, status, notes } = req.body;
  const sql = `UPDATE products SET name = ?, sku = ?, quantity = ?, status = ?, notes = ? WHERE id = ?`;
  db.run(sql, [name, sku || '', quantity || 0, status || 'activo', notes || '', id], function (err) {
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

app.post('/api/notify', async (req, res) => {
  const { productId, message } = req.body;
  if (!productId || !message) {
    return res.status(400).json({ error: 'productId y message son obligatorios' });
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: 'Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en variables de entorno' });
  }

  db.get('SELECT * FROM products WHERE id = ?', [productId], async (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const text = `Producto: ${product.name}\nSKU: ${product.sku || '-'}\nCantidad: ${product.quantity}\nEstado: ${product.status}\nMensaje: ${message}`;

    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
      });
      const result = await response.json();
      if (!result.ok) {
        return res.status(500).json({ error: result.description || 'Error al enviar Telegram' });
      }
      res.json({ success: true, telegram: result });
    } catch (fetchError) {
      res.status(500).json({ error: fetchError.message });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
