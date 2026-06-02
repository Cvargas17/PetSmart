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
  if (!products.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No hay productos registrados. Haz clic en "+ Agregar Producto" para crear uno.</td></tr>';
    return;
  }

  products.forEach((product) => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.type || '-'}</td>
      <td>${product.quantity}</td>
      <td>${product.status}</td>
      <td>${product.notes || '-'}</td>
      <td class="actions-cell">
        <button class="small" data-action="open-details" data-id="${product.id}" onclick="event.stopPropagation()">Ver Detalles</button>
      </td>
    `;
    row.addEventListener('click', () => openProductModal(product.id));
    tableBody.appendChild(row);
  });
}

async function loadProducts() {
  const products = await fetchProducts();
  renderProducts(products);
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
tableBody.addEventListener('click', () => {});

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

// ===== GATE CONTROL FUNCTIONS =====

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
    if (locked) {
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

loadGateState();
setInterval(loadGateState, 5000);
