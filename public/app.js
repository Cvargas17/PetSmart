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

// Reward device elements

const rewardStock =
  document.getElementById('reward-stock');

const rewardGuesses =
  document.getElementById('reward-guesses');

const rewardLimit =
  document.getElementById('reward-limit');

const rewardRefreshButton =
  document.getElementById('reward-refresh-button');

const rewardDispenseButton =
  document.getElementById('reward-dispense-button');

const rewardSaveConfigButton =
  document.getElementById('reward-save-button');

rewardRefreshButton.addEventListener(
  'click',
  loadRewardStatus
);

async function requestRewardDispense() {
  try {
    const res =
      await fetch('/api/reward/dispense', {
        method: 'POST'
      });

    const data =
      await res.json();

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudo dispensar el premio.'
      );
    }

    showAlert(
      'Dispensando premio...'
    );

    setTimeout(
      loadRewardStatus,
      3500
    );

  } catch (e) {
    console.error(
      'Error dispensando premio:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

rewardDispenseButton.addEventListener(
  'click',requestRewardDispense
);

rewardSaveConfigButton.addEventListener(
  'click', saveRewardConfig
);

console.log({
  rewardStock,
  rewardGuesses,
  rewardLimit,
  rewardRefreshButton,
  rewardDispenseButton
});
const rewardStart =
  document.getElementById(
    'reward-start'
  );

const rewardEnd =
  document.getElementById(
    'reward-end'
  );
const communicationPanel = document.getElementById('communication-panel');
const communicationStatusDot = document.getElementById('communication-dot');
const communicationStatusText = document.getElementById('communication-status-text');
const communicationDescription = document.getElementById('communication-description');
const communicationSpeakButton = document.getElementById('communication-speak-button');
const communicationMessage = document.getElementById('communication-message');

let arduinoConnected = false;
let communicationProduct = null;
let communicationConnected = false;
let communicationMode = false;
let communicationMessageTimeout = null;
const launcherUpButton =
  document.getElementById('launcher-up');

const launcherDownButton =
  document.getElementById('launcher-down');

const launcherLeftButton =
  document.getElementById('launcher-left');

const launcherRightButton =
  document.getElementById('launcher-right');

const launcherFireButton =
  document.getElementById('launcher-fire');

const launcherSaveStockButton =
  document.getElementById('launcher-save-stock');

const launcherStock =
  document.getElementById('launcher-stock');

const launcherTrainingTime =
  document.getElementById('launcher-training-time');

const launcherInterval =
  document.getElementById('launcher-interval');

const launcherSaveTrainingButton =
  document.getElementById('launcher-save-training');

const launcherStopTrainingButton =
  document.getElementById('launcher-stop-training');

const launcherSectorLabel =
  document.getElementById('launcher-sector-label');

// Telegram elements
const telegramForm = document.getElementById('telegram-form');
const telegramPhoneInput = document.getElementById('telegram-phone');
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const telegramEnabledInput = document.getElementById('telegram-enabled');
const telegramTestButton = document.getElementById('telegram-test-button');

// Feeding system elements
const feedingStatusDot = document.getElementById('feeding-dot');
const feedingStatusText = document.getElementById('feeding-status-text');
const feedingCurrentWeight = document.getElementById('feeding-current-weight');
const feedingLastDispense = document.getElementById('feeding-last-dispense');
const feedingTotalDispensed = document.getElementById('feeding-total-dispensed');
const feedingPortionGrams = document.getElementById('feeding-portion-grams');
const feedingDispenseButton = document.getElementById('feeding-dispense-button');
const feedingRefreshButton = document.getElementById('feeding-refresh-button');
const feedingConfigPortion = document.getElementById('feeding-config-portion');
const feedingConfigAlertHours = document.getElementById('feeding-config-alert-hours');
const feedingScheduleTime = document.getElementById('feeding-schedule-time');
const feedingSaveConfigButton = document.getElementById('feeding-save-config-button');
const feedingClearHistoryButton = document.getElementById('feeding-clear-history-button');
const feedingSchedulesTableBody = document.querySelector('#feeding-schedules-table tbody');
const feedingHistoryTableBody = document.querySelector('#feeding-history-table tbody');

let selectedProductId = null;
let feedingConnected = false;
let feedingSchedules = [];

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

function setCommunicationMessage(message = '', timeoutMs = 4000) {
  if (communicationMessageTimeout) {
    clearTimeout(communicationMessageTimeout);
    communicationMessageTimeout = null;
  }

  communicationMessage.textContent = message;
  communicationMessage.classList.toggle('hidden', !message);

  if (message && timeoutMs > 0) {
    communicationMessageTimeout = setTimeout(() => {
      communicationMessage.textContent = '';
      communicationMessage.classList.add('hidden');
      communicationMessageTimeout = null;
    }, timeoutMs);
  }
}

function updateCommunicationSection() {
  if (!communicationProduct) {
    communicationDescription.textContent = 'Sin sistema de comunicación configurado.';
    communicationSpeakButton.disabled = true;
    communicationStatusDot.className = 'status-dot disconnected';
    communicationStatusText.textContent = 'Sistema no configurado';
    setCommunicationMessage('');
    return;
  }

  if (!communicationConnected) {
    communicationDescription.textContent = communicationProduct.notes || 'Sistema de comunicación desconectado.';
    communicationStatusDot.className = 'status-dot disconnected';
    communicationStatusText.textContent = 'Raspberry no conectada';
    communicationSpeakButton.disabled = true;
    setCommunicationMessage('');
    return;
  }

  communicationDescription.textContent = communicationProduct.notes || 'Sistema de comunicación activo.';
  communicationStatusDot.className = 'status-dot connected';
  communicationStatusText.textContent = 'Raspberry conectada';
  communicationSpeakButton.disabled = false;
  setCommunicationMessage('');
}

function setCommunicationMode(active) {
  communicationMode = !!active;
  communicationSpeakButton.textContent = communicationMode ? 'Hablando' : 'Hablar';
  communicationSpeakButton.classList.toggle('active', communicationMode);
}

async function loadProducts() {
  const products = await fetchProducts();
  communicationProduct = products.find(p => /sistema de comunicaci/i.test(p.name));
  renderProducts(products);
  updateCommunicationSection();
  setCommunicationMode(false);
}

async function loadCommunicationStatus() {
  try {
    const res = await fetch('/api/communication/connection');
    if (!res.ok) return;
    const data = await res.json();
    communicationConnected = !!data.connected;
    updateCommunicationSection();
  } catch (e) {
    console.error('Error verificando conexión de comunicación', e);
    communicationConnected = false;
    updateCommunicationSection();
  }
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
        <td>${schedule.end_time || '-'}</td>
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

  const action = communicationMode ? 'stop' : 'start';
  const payload = {
    productId: communicationProduct.id,
    action,
    frequency: 880,
    duration: action === 'start' ? -1 : 0
  };

  if (!communicationConnected) {
    showAlert('No hay conexión con la Raspberry. Espera a que se reconecte.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/communication/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error enviando señal de hablar.');
    }

    setCommunicationMode(!communicationMode);
    setCommunicationMessage(action === 'start' ? 'Hablando...' : 'Se detuvo la comunicación.');
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
  await loadCommunicationStatus();
  loadGateState();
}

refreshGate();
setInterval(refreshGate, 1000);

// ===== SISTEMA DE ALIMENTACIÓN =====

async function loadFeedingConnection() {
  try {
    const res = await fetch('/api/feeding/connection');
    if (!res.ok) return;
    const data = await res.json();
    feedingConnected = !!data.connected;

    if (feedingConnected) {
      feedingStatusDot.className = 'status-dot connected';
      feedingStatusText.textContent = 'Conectada (online)';
      feedingDispenseButton.disabled = false;
      feedingRefreshButton.disabled = false;
      feedingSaveConfigButton.disabled = false;
    } else {
      feedingStatusDot.className = 'status-dot disconnected';
      feedingStatusText.textContent = 'No conectada (esperando conexión)';
      feedingDispenseButton.disabled = true;
      feedingRefreshButton.disabled = true;
      feedingSaveConfigButton.disabled = true;
    }
  } catch (e) {
    console.error('Error verificando conexión de alimentación', e);
    feedingConnected = false;
    feedingStatusDot.className = 'status-dot disconnected';
    feedingStatusText.textContent = 'Error al verificar conexión';
    feedingDispenseButton.disabled = true;
    feedingRefreshButton.disabled = true;
    feedingSaveConfigButton.disabled = true;
  }
}

async function loadFeedingStatus() {
  try {
    const res = await fetch('/api/feeding/status');
    if (!res.ok) return;
    const data = await res.json();

    feedingCurrentWeight.textContent = data.currentWeight || '0';
    feedingLastDispense.textContent = data.lastDispense ? new Date(data.lastDispense).toLocaleString() : '---';
    feedingTotalDispensed.textContent = data.totalFed || '0';
    
    if (data.config) {
      feedingConfigPortion.value = data.config.portionWeight || 100;
      feedingConfigAlertHours.value = data.config.hoursWithoutEating || 4;
      feedingSchedules = data.config.schedules || [];
      updateFeedingSchedulesTable();
    }
  } catch (e) {
    console.error('Error cargando estado de alimentación', e);
  }
}

async function dispenseFeed() {
  if (!feedingConnected) {
    showAlert('Sistema de alimentación no conectado', 'error');
    return;
  }

  const grams = parseInt(feedingPortionGrams.value) || 100;

  try {
    const res = await fetch('/api/feeding/dispense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grams })
    });

    const data = await res.json();
    
    if (!res.ok) {
      showAlert(data.error || 'Error dispensando alimento', 'error');
      return;
    }

    showAlert(`Dispensando ${grams}g...`);
    feedingDispenseButton.disabled = true;
    
    setTimeout(() => {
      loadFeedingStatus();
      feedingDispenseButton.disabled = false;
    }, 6000);
  } catch (e) {
    showAlert('Error de conexión al servidor', 'error');
  }
}

async function saveFeedingConfig() {
  if (!feedingConnected) {
    showAlert('Sistema de alimentación no conectado', 'error');
    return;
  }

  const portionWeight = parseInt(feedingConfigPortion.value) || 100;
  const hoursWithoutEating = parseInt(feedingConfigAlertHours.value) || 4;

  try {
    const res = await fetch('/api/feeding/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portionWeight,
        hoursWithoutEating,
        schedules: feedingSchedules
      })
    });

    const data = await res.json();
    
    if (!res.ok) {
      showAlert(data.error || 'Error guardando configuración', 'error');
      return;
    }

    showAlert('Configuración guardada correctamente');
    loadFeedingStatus();
  } catch (e) {
    showAlert('Error de conexión al servidor', 'error');
  }
}

async function loadFeedingHistory() {
  try {
    const res = await fetch('/api/feeding/history?limit=20');
    if (!res.ok) return;
    const history = await res.json();

    feedingHistoryTableBody.innerHTML = '';
    
    if (!history.length) {
      feedingHistoryTableBody.innerHTML = '<tr><td colspan="4" class="empty">Sin historial de alimentación</td></tr>';
      return;
    }

    history.forEach(record => {
      const row = document.createElement('tr');
      const fecha = new Date(record.created_at).toLocaleString();
      const tipo = record.scheduled ? 'Programado' : 'Manual';
      row.innerHTML = `
        <td>${fecha}</td>
        <td>${record.dispensed_grams || '0'}</td>
        <td>${record.eaten_grams || '---'}</td>
        <td>${tipo}</td>
      `;
      feedingHistoryTableBody.appendChild(row);
    });
  } catch (e) {
    console.error('Error cargando historial de alimentación', e);
  }
}

async function clearFeedingHistory() {
  if (!confirm('¿Deseas limpiar todo el historial de alimentación?')) {
    return;
  }

  try {
    const res = await fetch('/api/feeding/history', {
      method: 'DELETE'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Error limpiando historial');
    }

    showAlert('Historial de alimentación limpiado');
    await loadFeedingHistory();
  } catch (e) {
    console.error('Error limpiando historial de alimentación', e);
    showAlert(e.message || 'Error limpiando historial', 'error');
  }
}

function updateFeedingSchedulesTable() {
  feedingSchedulesTableBody.innerHTML = '';
  
  if (!feedingSchedules.length) {
    feedingSchedulesTableBody.innerHTML = '<tr><td colspan="2" class="empty">Sin horarios programados</td></tr>';
    return;
  }

  feedingSchedules.forEach((schedule, index) => {
    const row = document.createElement('tr');
    const hora = typeof schedule === 'string' ? schedule : `${schedule.hora || 0}:${String(schedule.minuto || 0).padStart(2, '0')}`;
    row.innerHTML = `
      <td>${hora}</td>
      <td>
        <button class="small danger" data-index="${index}" onclick="removeFeedingSchedule(${index})">Eliminar</button>
      </td>
    `;
    feedingSchedulesTableBody.appendChild(row);
  });
}

function addFeedingSchedule() {
  const timeInput = feedingScheduleTime.value;
  if (!timeInput) {
    showAlert('Por favor selecciona una hora', 'error');
    return;
  }

  const [hora, minuto] = timeInput.split(':').map(x => parseInt(x));
  
  if (feedingSchedules.some(s => {
    const sh = typeof s === 'string' ? s.split(':')[0] : s.hora;
    const sm = typeof s === 'string' ? s.split(':')[1] : s.minuto;
    return parseInt(sh) === hora && parseInt(sm) === minuto;
  })) {
    showAlert('Este horario ya existe', 'error');
    return;
  }

  feedingSchedules.push({ hora, minuto });
  feedingScheduleTime.value = '';
  updateFeedingSchedulesTable();
  showAlert('Horario agregado');
}

function removeFeedingSchedule(index) {
  feedingSchedules.splice(index, 1);
  updateFeedingSchedulesTable();
  showAlert('Horario eliminado');
}

// Event listeners para alimentación
feedingDispenseButton?.addEventListener('click', dispenseFeed);
feedingRefreshButton?.addEventListener('click', loadFeedingStatus);
feedingSaveConfigButton?.addEventListener('click', saveFeedingConfig);
feedingClearHistoryButton?.addEventListener('click', clearFeedingHistory);

// Llamar a loadFeedingConnection cada segundo
async function refreshFeeding() {
  await loadFeedingConnection();
}

refreshFeeding();
setInterval(refreshFeeding, 2000);
setInterval(loadFeedingStatus, 3000);
setInterval(loadFeedingHistory, 5000);

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
  //loadRewardStatus();
}, 5000);


//Reward device system functions
async function loadRewardStatus() {
 try {
    const res =
      await fetch('/api/reward/status');

    if (!res.ok) {
      throw new Error(
        'No se pudo cargar el estado'
      );
    }

    const data =
      await res.json();

    rewardStock.value =
      data.stock;

    rewardGuesses.value =
      data.correctGuesses;

    rewardLimit.value =
      data.dailyLimit;

  } catch (e) {
    console.error(
      'Error cargando recompensa:',
      e
    );
  }
}

// ===== SENSOR DE TEMPERATURA / VENTILADOR =====

async function loadTempState() {
  try {
    const res = await fetch('/api/temp/state');
    if (!res.ok) return;
    const data = await res.json();

    const dot      = document.getElementById('temp-status-dot');
    const statusTx = document.getElementById('temp-status-text');
    const valEl    = document.getElementById('temp-value');
    const fanIcon  = document.getElementById('fan-icon');
    const fanLabel = document.getElementById('fan-label');
    const thInput  = document.getElementById('temp-threshold-input');

    if (!dot) return;

    if (data.connected) {
      dot.className = 'status-dot connected';
      statusTx.textContent = 'Arduino conectado';
    } else {
      dot.className = 'status-dot disconnected';
      statusTx.textContent = TEMP_PORT_HINT
        ? 'Arduino desconectado — revisa TEMP_PORT en .env'
        : 'TEMP_PORT no configurado en .env';
    }

    if (data.temp !== null && data.temp !== undefined) {
      valEl.textContent = parseFloat(data.temp).toFixed(1);
    } else {
      valEl.textContent = '--';
    }

    if (data.fan) {
      fanIcon.className = 'fan-icon on';
      fanLabel.textContent = 'Ventilador: ENCENDIDO';
      fanLabel.style.color = 'var(--primary)';
    } else {
      fanIcon.className = 'fan-icon off';
      fanLabel.textContent = 'Ventilador: APAGADO';
      fanLabel.style.color = 'var(--muted)';
    }

    if (thInput && data.threshold !== undefined) {
      thInput.value = data.threshold;
    }
  } catch (e) {
    console.error('Error cargando temperatura:', e);
  }
}

const TEMP_PORT_HINT = true;

async function loadTempHistory() {
  try {
    const res = await fetch('/api/temp/history?limit=20');
    if (!res.ok) return;
    const rows = await res.json();
    const tbody = document.querySelector('#temp-history-table tbody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Sin lecturas registradas</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td>${parseFloat(r.temp).toFixed(1)} °C</td>
        <td>${r.fan ? '&#128168; ON' : 'OFF'}</td>
        <td>${parseFloat(r.threshold).toFixed(1)} °C</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error cargando historial de temperatura:', e);
  }
}

async function saveTempThreshold() {
  const input = document.getElementById('temp-threshold-input');
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0 || val > 99) {
    showAlert('El umbral debe estar entre 0 y 99 °C.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/temp/threshold', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: val })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando umbral.');
    showAlert(`Umbral actualizado a ${val} °C.`);
  } catch (e) {
    showAlert(e.message, 'error');
  }
}

document.getElementById('temp-threshold-save')?.addEventListener('click', saveTempThreshold);
document.getElementById('temp-refresh-btn')?.addEventListener('click', () => {
  loadTempState();
  loadTempHistory();
});

// Inicializar y refrescar temperatura cada 5 segundos
setTimeout(() => {
  loadTempState();
  loadTempHistory();
}, 600);

setInterval(() => {
  loadTempState();
}, 5000);

async function saveRewardConfig() {
  try {
    const payload = {
      stock:
        Number(
          rewardStock.value
        ),

      dailyLimit:
        Number(
          rewardLimit.value
        ),

      startHour:
        rewardStart.value,

      endHour:
        rewardEnd.value
    };

    const res =
      await fetch(
        '/api/reward/config',
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              'application/json'
          },
          body:
            JSON.stringify(
              payload
            )
        }
      );

    const data =
      await res.json();

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudo guardar la configuración.'
      );
    }

    showAlert(
      'Configuración de recompensas guardada.'
    );

  } catch (e) {
    console.error(
      'Error guardando recompensas:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}


let launcherH = 2;
let launcherV = 2;

function updateLauncherSectorLabel() {
  let horizontal = 'Centro';
  let vertical = 'Centro';

  if (launcherH === 1) horizontal = 'Izquierda';
  if (launcherH === 3) horizontal = 'Derecha';

  if (launcherV === 3) vertical = 'Arriba';
  if (launcherV === 1) vertical = 'Abajo';

  launcherSectorLabel.textContent =
    `${vertical} / ${horizontal}`;
}

async function sendLauncherCommand(payload) {
  const res =
    await fetch('/api/launcher/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

  const data =
    await res.json();

  if (!res.ok) {
    throw new Error(
      data.error ||
      'No se pudo enviar el comando al lanzador.'
    );
  }

  return data;
}

async function moveLauncher(h, v) {
  try {
    launcherH = h;
    launcherV = v;

    updateLauncherSectorLabel();

    await sendLauncherCommand({
      h: launcherH,
      v: launcherV
    });

    showAlert(
      'Dirección actualizada.'
    );

  } catch (e) {
    console.error(
      'Error moviendo lanzador:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

async function fireLauncher() {
  try {
    await sendLauncherCommand({
      fire: true
    });

    showAlert(
      'Disparo enviado.'
    );

    setTimeout(
      loadLauncherStatus,
      4000
    );

  } catch (e) {
    console.error(
      'Error disparando:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

async function loadLauncherStatus() {
  try {
    const res =
      await fetch('/api/launcher/status');

    const data =
      await res.json();

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudo cargar el estado del lanzador.'
      );
    }

    launcherStock.value =
      data.stock ?? 0;

    launcherH =
      data.horizontalSector ?? 2;

    launcherV =
      data.verticalSector ?? 2;

    updateLauncherSectorLabel();

  } catch (e) {
    console.error(
      'Error cargando estado del lanzador:',
      e
    );
  }
}

async function updateLauncherStock() {
  try {
    const stock =
      Number(launcherStock.value);

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      throw new Error(
        'El stock debe ser un número entero mayor o igual a 0.'
      );
    }

    await sendLauncherCommand({
      stock: stock
    });

    showAlert(
      'Stock actualizado en el lanzador.'
    );

    setTimeout(
      loadLauncherStatus,
      500
    );

  } catch (e) {
    console.error(
      'Error actualizando stock:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

async function saveLauncherTraining() {
  try {
    const payload = {
      time:
        launcherTrainingTime.value,

      interval:
        Number(launcherInterval.value),

      stock:
        Number(launcherStock.value)
    };

    const res =
      await fetch('/api/launcher/training', {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body:
          JSON.stringify(payload)
      });

    const data =
      await res.json();

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudo programar el entrenamiento.'
      );
    }

    showAlert(
      'Entrenamiento programado.'
    );

  } catch (e) {
    console.error(
      'Error programando entrenamiento:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

async function stopLauncherTraining() {
  try {
    await sendLauncherCommand({
      inPlay: false
    });

    showAlert(
      'Entrenamiento detenido.'
    );

    await loadLauncherStatus();

  } catch (e) {
    console.error(
      'Error deteniendo entrenamiento:',
      e
    );

    showAlert(
      e.message,
      'error'
    );
  }
}

launcherUpButton?.addEventListener('click', () => {
  const nextV = Math.min(3, launcherV + 1);
  moveLauncher(launcherH, nextV);
});

launcherDownButton?.addEventListener('click', () => {
  const nextV = Math.max(1, launcherV - 1);
  moveLauncher(launcherH, nextV);
});

launcherLeftButton?.addEventListener(
  'click',
  () => {
    const nextH =
      Math.max(1, launcherH - 1);

    moveLauncher(
      nextH,
      launcherV
    );
  }
);

launcherRightButton?.addEventListener(
  'click',
  () => {
    const nextH =
      Math.min(3, launcherH + 1);

    moveLauncher(
      nextH,
      launcherV
    );
  }
);

launcherFireButton?.addEventListener(
  'click',
  fireLauncher
);

launcherSaveTrainingButton?.addEventListener(
  'click',
  saveLauncherTraining
);

launcherStopTrainingButton?.addEventListener(
  'click',
  stopLauncherTraining
);
launcherSaveStockButton?.addEventListener(
  'click',
  updateLauncherStock
);

updateLauncherSectorLabel();
loadLauncherStatus();