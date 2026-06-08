// Redirect to login on any 401 response
const _originalFetch = window.fetch;
window.fetch = async function (...args) {
  const res = await _originalFetch(...args);
  if (res.status === 401) {
    window.location.href = '/login.html';
  }
  return res;
};

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// Form and Table Elements
const form = document.getElementById('product-form');
const tableBody = document.querySelector('#products-table tbody');
const alertBox = document.getElementById('alert');
const resetButton = document.getElementById('reset-button');
const toggleFormButton = document.getElementById('toggle-form-button');
const cancelFormButton = document.getElementById('cancel-form-button');
const formSection = document.getElementById('form-section');

const fields = {
  id: document.getElementById('product-id'),
  name: document.getElementById('name'),
  type: document.getElementById('type'),
  quantity: document.getElementById('quantity'),
  status: document.getElementById('status'),
  notes: document.getElementById('notes'),
};

// Modal Elements
const modal = document.getElementById('product-modal');
const closeModalButton = document.getElementById('close-modal-button');
const modalCloseButton = document.getElementById('modal-close-button');
const modalTitle = document.getElementById('modal-title');

const modalFields = {
  name: document.getElementById('modal-name'),
  type: document.getElementById('modal-type'),
  quantity: document.getElementById('modal-quantity'),
  status: document.getElementById('modal-status'),
  notes: document.getElementById('modal-notes'),
};

const modalSaveButton = document.getElementById('modal-save-button');
const modalNotifyButton = document.getElementById('modal-notify-button');
const modalDeleteButton = document.getElementById('modal-delete-button');
const modalAddScheduleButton = document.getElementById('modal-add-schedule-button');
const modalScheduleStartInput = document.getElementById('modal-schedule-start');
const modalScheduleEndInput = document.getElementById('modal-schedule-end');
const modalSchedulesTableBody = document.querySelector('#modal-schedules-table tbody');

// Gate control elements
const openGateButton = document.getElementById('open-gate-button');
const closeGateButton = document.getElementById('close-gate-button');
const gateStatusEl = document.getElementById('gate-status');
const serialDot = document.getElementById('serial-dot');
const serialStatusEl = document.getElementById('serial-status');
const gateNoConnectionEl = document.getElementById('gate-no-connection');
const arduinoResponseRow = document.getElementById('arduino-response-row');
const arduinoLastMsgEl = document.getElementById('arduino-last-msg');

const communicationPanel = document.getElementById('communication-panel');
const communicationDescription = document.getElementById('communication-description');
const communicationSpeakButton = document.getElementById('communication-speak-button');

let arduinoConnected = false;
let communicationProduct = null;

// Telegram elements
const telegramForm = document.getElementById('telegram-form');
const telegramPhoneInput = document.getElementById('telegram-phone');
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const telegramEnabledInput = document.getElementById('telegram-enabled');
const telegramTestButton = document.getElementById('telegram-test-button');

let selectedProductId = null;

async function fetchProducts() {
  const response = await fetch('/api/products');
  return response.json();
}

function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 4000);
}

function resetForm() {
  fields.id.value = '';
  fields.name.value = '';
  fields.type.value = '';
  fields.quantity.value = 0;
  fields.status.value = 'activo';
  fields.notes.value = '';
}

function toggleFormSection() {
  formSection.classList.toggle('hidden');
  if (!formSection.classList.contains('hidden')) {
    resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderProducts(products) {
  tableBody.innerHTML = '';
  const visibleProducts = products.filter(p => !/sistema de comunicaci/i.test(p.name));
  if (!visibleProducts.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No hay productos registrados. Haz clic en "+ Agregar Producto" para crear uno.</td></tr>';
    return;
  }

  visibleProducts.forEach((product) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.type || '-'}</td>
      <td>${product.quantity}</td>
      <td>${product.status}</td>
      <td>${product.notes || '-'}</td>
      <td class="actions-cell">
        <button class="small" data-action="open-details" data-id="${product.id}">Ver Detalles</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateCommunicationSection() {
  if (!communicationProduct) {
    communicationDescription.textContent = 'Sin sistema de comunicación configurado.';
    communicationSpeakButton.disabled = true;
    return;
  }

  communicationDescription.textContent = communicationProduct.notes || 'Sistema de comunicación activo.';
  communicationSpeakButton.disabled = false;
}

async function loadProducts() {
  const products = await fetchProducts();
  communicationProduct = products.find(p => /sistema de comunicaci/i.test(p.name));
  renderProducts(products);
  updateCommunicationSection();
}

async function saveProduct(event) {
  event.preventDefault();
  const payload = {
    name: fields.name.value.trim(),
    type: fields.type.value,
    quantity: Number(fields.quantity.value),
    status: fields.status.value,
    notes: fields.notes.value.trim(),
  };

  if (!payload.name) {
    return showAlert('El nombre del producto es obligatorio.', 'error');
  }

  if (!payload.type) {
    return showAlert('Debes seleccionar un tipo de producto.', 'error');
  }

  try {
    const method = fields.id.value ? 'PUT' : 'POST';
    const url = fields.id.value ? `/api/products/${fields.id.value}` : '/api/products';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    showAlert(fields.id.value ? 'Producto actualizado.' : 'Producto creado.');
    resetForm();
    toggleFormSection();
    loadProducts();
  } catch (error) {
    showAlert('Error guardando el producto.', 'error');
  }
}

async function openProductModal(productId) {
  selectedProductId = productId;
  const products = await fetchProducts();
  const product = products.find((p) => p.id === productId);
  
  if (!product) {
    showAlert('Producto no encontrado.', 'error');
    return;
  }

  // Populate modal fields
  modalFields.name.value = product.name;
  modalFields.type.value = product.type || '';
  modalFields.quantity.value = product.quantity;
  modalFields.status.value = product.status;
  modalFields.notes.value = product.notes || '';
  modalTitle.textContent = product.name;

  // Load and display schedules
  await loadModalSchedules();

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = 'auto';
  selectedProductId = null;
}

async function saveProductFromModal() {
  const payload = {
    name: modalFields.name.value.trim(),
    type: modalFields.type.value,
    quantity: Number(modalFields.quantity.value),
    status: modalFields.status.value,
    notes: modalFields.notes.value.trim(),
  };

  if (!payload.name) {
    showAlert('El nombre del producto es obligatorio.', 'error');
    return;
  }

  if (!payload.type) {
    showAlert('Debes seleccionar un tipo de producto.', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/products/${selectedProductId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Error updating product');

    showAlert('Producto actualizado.');
    loadProducts();
    await openProductModal(selectedProductId);
  } catch (error) {
    showAlert('Error guardando el producto.', 'error');
  }
}

async function deleteProductFromModal() {
  if (!confirm('¿Eliminar este producto?')) return;

  try {
    await fetch(`/api/products/${selectedProductId}`, { method: 'DELETE' });
    showAlert('Producto eliminado.');
    loadProducts();
    closeProductModal();
  } catch (error) {
    showAlert('Error eliminando el producto.', 'error');
  }
}

async function notifyFromModal() {
  const message = prompt('Mensaje para Telegram:');
  if (!message) return;

  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: selectedProductId, message }),
    });

    if (response.ok) {
      showAlert('Notificación enviada a Telegram.');
    } else {
      const data = await response.json();
      showAlert(data.error || 'Error enviando la notificación.', 'error');
    }
  } catch (error) {
    showAlert('Error de conexión.', 'error');
  }
}

async function loadModalSchedules() {
  try {
    const res = await fetch('/api/gate/schedules');
    const schedules = await res.json();
    
    modalSchedulesTableBody.innerHTML = '';
    if (!schedules.length) {
      modalSchedulesTableBody.innerHTML = '<tr><td colspan="4">No hay bloques de horarios agregados.</td></tr>';
      return;
    }

    schedules.forEach((schedule) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${schedule.time || schedule.start || '-'}</td>
        <td>${schedule.end || '-'}</td>
        <td>${schedule.enabled ? 'Sí' : 'No'}</td>
        <td class="actions-cell">
          <button class="small" data-id="${schedule.id}" data-action="toggle-schedule">
            ${schedule.enabled ? 'Desactivar' : 'Activar'}
          </button>
          <button class="small danger" data-id="${schedule.id}" data-action="delete-schedule">Eliminar</button>
        </td>
      `;
      modalSchedulesTableBody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error loading schedules:', e);
  }
}

async function addModalSchedule() {
  const start = modalScheduleStartInput.value;
  const end = modalScheduleEndInput.value;
  
  if (!start || !end) {
    showAlert('Debes seleccionar hora de inicio y fin.', 'error');
    return;
  }

  if (start >= end) {
    showAlert('La hora de fin debe ser mayor a la hora de inicio.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/gate/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: start, end, enabled: true }),
    });

    if (res.ok) {
      showAlert('Bloque de horario agregado.');
      modalScheduleStartInput.value = '';
      modalScheduleEndInput.value = '';
      await loadModalSchedules();
    } else {
      const data = await res.json();
      showAlert(data.error || 'Error creando bloque de horario.', 'error');
    }
  } catch (error) {
    showAlert('Error de conexión.', 'error');
  }
}

async function loadTelegramSettings() {
  try {
    const response = await fetch('/api/telegram/settings');
    if (!response.ok) return;
    const settings = await response.json();
    telegramPhoneInput.value = settings.phone || '';
    telegramBotTokenInput.value = settings.botToken || '';
    telegramChatIdInput.value = settings.chatId || '';
    telegramEnabledInput.checked = !!settings.enabled;
  } catch (error) {
    console.error('Error cargando configuracion Telegram:', error);
  }
}

async function saveTelegramSettings(event) {
  event.preventDefault();
  const payload = {
    phone: telegramPhoneInput.value.trim(),
    botToken: telegramBotTokenInput.value.trim(),
    chatId: telegramChatIdInput.value.trim(),
    enabled: telegramEnabledInput.checked,
  };

  if (payload.enabled && (!payload.botToken || !payload.chatId)) {
    showAlert('Bot token y Chat ID son obligatorios para activar Telegram.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/telegram/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      showAlert(data.error || 'Error guardando Telegram.', 'error');
      return;
    }
    showAlert('Configuracion de Telegram guardada.');
  } catch (error) {
    showAlert('Error de conexion guardando Telegram.', 'error');
  }
}

async function testTelegramSettings() {
  try {
    const response = await fetch('/api/telegram/test', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      showAlert(data.error || 'Error enviando prueba de Telegram.', 'error');
      return;
    }
    showAlert('Mensaje de prueba enviado a Telegram.');
  } catch (error) {
    showAlert('Error de conexion enviando prueba.', 'error');
  }
}

async function handleModalSchedulesClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'delete-schedule') {
    if (!confirm('¿Eliminar este bloque de horario?')) return;
    try {
      await fetch(`/api/gate/schedules/${id}`, { method: 'DELETE' });
      showAlert('Bloque de horario eliminado.');
      await loadModalSchedules();
    } catch (error) {
      showAlert('Error eliminando bloque de horario.', 'error');
    }
    return;
  }

  if (action === 'toggle-schedule') {
    try {
      const res = await fetch(`/api/gate/schedules/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        showAlert('Bloque de horario actualizado.');
        await loadModalSchedules();
      } else {
        const d = await res.json();
        showAlert(d.error || 'Error al actualizar bloque de horario', 'error');
      }
    } catch (error) {
      showAlert('Error conectando al servidor', 'error');
    }
  }
}

// Event listeners for form
form.addEventListener('submit', saveProduct);
resetButton.addEventListener('click', resetForm);
toggleFormButton.addEventListener('click', toggleFormSection);
cancelFormButton.addEventListener('click', toggleFormSection);
tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="open-details"]');
  if (!button) return;
  openProductModal(Number(button.dataset.id));
});

// Handle speak action for communication device
tableBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action="speak"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  // Call server to publish MQTT and send Telegram
  try {
    await fetch('/api/communication/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: id, frequency: 880, duration: 0.9 })
    });
    showAlert('Se emitió la señal para hablar.');
  } catch (e) {
    showAlert('Error enviando señal de hablar.', 'error');
  }
});

// end of products events

// Simple WebAudio beep for "Hablar"
function playBeep({ frequency = 880, duration = 0.9, type = 'sine' } = {}) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = frequency;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      o.stop(ctx.currentTime + 0.06);
      try { ctx.close(); } catch (e) {}
    }, duration * 1000);
  } catch (e) {
    console.error('Error reproducir sonido:', e);
  }
}
telegramForm.addEventListener('submit', saveTelegramSettings);
telegramTestButton.addEventListener('click', testTelegramSettings);
communicationSpeakButton?.addEventListener('click', async () => {
  if (!communicationProduct) {
    showAlert('No hay sistema de comunicación configurado.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/communication/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: communicationProduct.id, frequency: 880, duration: 0.9 })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error enviando señal de hablar.');
    }

    showAlert('Se emitió la señal para hablar.');
  } catch (error) {
    showAlert(error.message || 'Error enviando señal de hablar.', 'error');
  }
});

// Event listeners for modal
closeModalButton.addEventListener('click', closeProductModal);
modalCloseButton.addEventListener('click', closeProductModal);
modalSaveButton.addEventListener('click', saveProductFromModal);
modalDeleteButton.addEventListener('click', deleteProductFromModal);
modalNotifyButton.addEventListener('click', notifyFromModal);
modalAddScheduleButton.addEventListener('click', addModalSchedule);
modalSchedulesTableBody.addEventListener('click', handleModalSchedulesClick);

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeProductModal();
});

loadProducts();
loadTelegramSettings();

// ===== GATE CONTROL FUNCTIONS =====

async function loadConnectionStatus() {
  try {
    const res = await fetch('/api/gate/connection');
    if (!res.ok) return;
    const data = await res.json();

    arduinoConnected = data.connected || data.demo;

    if (data.demo) {
      serialDot.className = 'status-dot demo';
      serialStatusEl.textContent = 'Modo Demo (sin Arduino real)';
    } else if (data.connected) {
      serialDot.className = 'status-dot connected';
      serialStatusEl.textContent = `Conectado en ${data.port}`;
    } else if (data.port) {
      serialDot.className = 'status-dot disconnected';
      serialStatusEl.textContent = `Sin conexión en ${data.port} — revisa el cable`;
    } else {
      serialDot.className = 'status-dot disconnected';
      serialStatusEl.textContent = 'ARDUINO_PORT no configurado';
    }

    gateNoConnectionEl.classList.toggle('hidden', arduinoConnected);

    if (data.lastMessage) {
      arduinoLastMsgEl.textContent = data.lastMessage;
      arduinoResponseRow.style.display = 'flex';
    }

    if (!arduinoConnected) {
      openGateButton.disabled = true;
      closeGateButton.disabled = true;
    }
  } catch (e) {
    console.error('Error verificando conexión serial', e);
  }
}

async function openGate() {
  try {
    const res = await fetch('/api/gate/open', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showAlert('Comando enviado: puerta abriendo.');
    } else {
      showAlert(data.error || 'Error abriendo la puerta.', 'error');
    }
    loadGateState();
  } catch (e) {
    showAlert('Error de conexión al servidor.', 'error');
  }
}

async function closeGate() {
  try {
    const res = await fetch('/api/gate/close', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showAlert('Comando enviado: puerta cerrando.');
    } else {
      showAlert(data.error || 'Error cerrando la puerta.', 'error');
    }
    loadGateState();
  } catch (e) {
    showAlert('Error de conexión al servidor.', 'error');
  }
}

async function loadGateState() {
  try {
    const res = await fetch('/api/gate/state');
    if (!res.ok) return;
    const st = await res.json();
    const now = new Date();
    let locked = false;
    if (st.locked_until) {
      const lu = new Date(st.locked_until);
      if (lu > now && st.last_control === 'schedule') locked = true;
    }
    gateStatusEl.textContent = `${st.state}${locked ? ' (Bloqueada por schedule hasta ' + st.locked_until + ')' : ''}`;
    if (!arduinoConnected || locked) {
      openGateButton.disabled = true;
      closeGateButton.disabled = true;
    } else {
      if (st.state === 'open') {
        openGateButton.disabled = true;
        closeGateButton.disabled = false;
      } else {
        openGateButton.disabled = false;
        closeGateButton.disabled = true;
      }
    }
  } catch (e) {
    console.error('Error cargando estado de puerta', e);
  }
}

// ===== GATE CONTROL EVENT LISTENERS =====

openGateButton?.addEventListener('click', openGate);
closeGateButton?.addEventListener('click', closeGate);

// ===== INITIALIZE =====

async function refreshGate() {
  await loadConnectionStatus();
  loadGateState();
}

refreshGate();
setInterval(refreshGate, 5000);

// ===== SENSOR DE MOVIMIENTO =====

let sensorNotifyEnabled = true;

async function loadSensorState() {
  try {
    const res = await fetch('/api/sensor/state');
    if (!res.ok) return;
    const data = await res.json();
    
    const dot = document.getElementById('sensor-status-dot');
    const statusText = document.getElementById('sensor-status-text');
    const lastEventSpan = document.getElementById('sensor-last-event');
    const lastValueSpan = document.getElementById('sensor-last-value');
    const lastTimeSpan = document.getElementById('sensor-last-time');
    
    if (!dot || !statusText) return;
    
    if (data.estado === 'movimiento') {
      dot.className = 'status-dot connected';
      statusText.textContent = 'Movimiento detectado (haz interrumpido)';
      if (lastEventSpan) lastEventSpan.textContent = '🔴 MOVIMIENTO';
    } else if (data.estado === 'sin_movimiento') {
      dot.className = 'status-dot disconnected';
      statusText.textContent = 'Sin movimiento (haz intacto)';
      if (lastEventSpan) lastEventSpan.textContent = '🟢 Sin movimiento';
    } else {
      dot.className = 'status-dot demo';
      statusText.textContent = 'Sin datos';
      if (lastEventSpan) lastEventSpan.textContent = '---';
    }
    
    if (lastValueSpan) lastValueSpan.textContent = data.valor || '---';
    if (lastTimeSpan) lastTimeSpan.textContent = data.created_at ? new Date(data.created_at).toLocaleString() : '---';
  } catch (e) {
    console.error('Error cargando estado del sensor:', e);
  }
}

async function loadSensorHistory() {
  try {
    const res = await fetch('/api/sensor/history?limit=20');
    if (!res.ok) return;
    const events = await res.json();
    
    const tbody = document.querySelector('#sensor-history-table tbody');
    if (!tbody) return;
    
    if (!events.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No hay eventos registrados</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    events.forEach(ev => {
      const row = document.createElement('tr');
      const fecha = new Date(ev.created_at).toLocaleString();
      let evento = '';
      let notificacion = '';
      
      if (ev.estado === 'movimiento') {
        evento = '🔴 MOVIMIENTO - Haz interrumpido';
        notificacion = 'No';
      } else {
        evento = '🟢 Sin movimiento - Haz intacto';
        notificacion = ev.alerta ? '✅ Sí (Telegram)' : 'No';
      }
      
      row.innerHTML = `
        <td>${fecha}</td>
        <td>${evento}</td>
        <td>${ev.valor}</td>
        <td>${notificacion}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) {
    console.error('Error cargando historial:', e);
  }
}

async function loadSensorNotifySetting() {
  try {
    const res = await fetch('/api/sensor/notify-setting');
    if (res.ok) {
      const data = await res.json();
      sensorNotifyEnabled = data.enabled;
      const toggle = document.getElementById('sensor-notify-toggle');
      if (toggle) toggle.checked = sensorNotifyEnabled;
    }
  } catch (e) {
    console.error('Error cargando configuración:', e);
  }
}

async function saveSensorNotifySetting(enabled) {
  try {
    await fetch('/api/sensor/notify-setting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Event listener para el toggle
const notifyToggle = document.getElementById('sensor-notify-toggle');
if (notifyToggle) {
  notifyToggle.addEventListener('change', (e) => {
    sensorNotifyEnabled = e.target.checked;
    saveSensorNotifySetting(sensorNotifyEnabled);
  });
}

// Botón refrescar
const refreshBtn = document.getElementById('refresh-sensor-btn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    loadSensorState();
    loadSensorHistory();
  });
}

// Inicializar sensor (después de que el DOM esté listo)
setTimeout(() => {
  loadSensorState();
  loadSensorHistory();
  loadSensorNotifySetting();
}, 500);

// Actualizar cada 5 segundos
setInterval(() => {
  loadSensorState();
}, 5000);