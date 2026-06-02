const form = document.getElementById('product-form');
const tableBody = document.querySelector('#products-table tbody');
const alertBox = document.getElementById('alert');
const resetButton = document.getElementById('reset-button');

const fields = {
  id: document.getElementById('product-id'),
  name: document.getElementById('name'),
  sku: document.getElementById('sku'),
  quantity: document.getElementById('quantity'),
  status: document.getElementById('status'),
  notes: document.getElementById('notes'),
};

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
  fields.sku.value = '';
  fields.quantity.value = 0;
  fields.status.value = 'activo';
  fields.notes.value = '';
}

function renderProducts(products) {
  tableBody.innerHTML = '';
  if (!products.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No hay productos registrados.</td></tr>';
    return;
  }

  products.forEach((product) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.sku || '-'}</td>
      <td>${product.quantity}</td>
      <td>${product.status}</td>
      <td>${product.notes || '-'}</td>
      <td class="actions-cell">
        <button class="small" data-action="edit" data-id="${product.id}">Editar</button>
        <button class="small danger" data-action="delete" data-id="${product.id}">Eliminar</button>
        <button class="small secondary" data-action="notify" data-id="${product.id}">Notificar</button>
      </td>
    `;
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
    sku: fields.sku.value.trim(),
    quantity: Number(fields.quantity.value),
    status: fields.status.value,
    notes: fields.notes.value.trim(),
  };

  if (!payload.name) {
    return showAlert('El nombre del producto es obligatorio.', 'error');
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
    loadProducts();
  } catch (error) {
    showAlert('Error guardando el producto.', 'error');
  }
}

async function handleTableClick(event) {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === 'edit') {
    const product = await fetch(`/api/products`).then((res) => res.json()).then((list) => list.find((item) => item.id === Number(id)));
    if (product) {
      fields.id.value = product.id;
      fields.name.value = product.name;
      fields.sku.value = product.sku;
      fields.quantity.value = product.quantity;
      fields.status.value = product.status;
      fields.notes.value = product.notes;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (action === 'delete') {
    if (!confirm('¿Eliminar este producto?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    showAlert('Producto eliminado.');
    loadProducts();
  }

  if (action === 'notify') {
    const message = prompt('Mensaje para Telegram:');
    if (!message) return;
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: Number(id), message }),
    });
    const data = await response.json();
    if (response.ok) {
      showAlert('Notificación enviada a Telegram.');
    } else {
      showAlert(data.error || 'Error enviando la notificación.', 'error');
    }
  }
}

form.addEventListener('submit', saveProduct);
resetButton.addEventListener('click', resetForm);
tableBody.addEventListener('click', handleTableClick);
loadProducts();

// Gate control UI
const openGateButton = document.getElementById('open-gate-button');
const scheduleForm = document.getElementById('schedule-form');
const scheduleTimeInput = document.getElementById('schedule-time');
const schedulesTableBody = document.querySelector('#schedules-table tbody');
const gateStatusEl = document.getElementById('gate-status');
const scheduleIdInput = document.getElementById('schedule-id');
const scheduleSubmitButton = document.getElementById('schedule-submit');
const cancelScheduleEditButton = document.getElementById('cancel-schedule-edit');

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

async function loadSchedules() {
  try {
    const res = await fetch('/api/gate/schedules');
    const rows = await res.json();
    schedulesTableBody.innerHTML = '';
    if (!rows.length) {
      schedulesTableBody.innerHTML = '<tr><td colspan="3">No hay schedules.</td></tr>';
      return;
    }
    rows.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.time}</td>
        <td>${s.enabled ? 'Sí' : 'No'}</td>
        <td>
          <button class="small" data-id="${s.id}" data-action="edit-schedule">Editar</button>
          <button class="small" data-id="${s.id}" data-action="toggle-schedule">${s.enabled ? 'Desactivar' : 'Activar'}</button>
          <button class="small danger" data-id="${s.id}" data-action="delete-schedule">Eliminar</button>
        </td>
      `;
      schedulesTableBody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

async function addSchedule(event) {
  event.preventDefault();
  const time = scheduleTimeInput.value; // format HH:MM
  if (!time) return showAlert('Hora inválida para schedule.', 'error');
  try {
    if (scheduleIdInput && scheduleIdInput.value) {
      const id = scheduleIdInput.value;
      const res = await fetch(`/api/gate/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, enabled: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showAlert('Schedule actualizado.');
        scheduleForm.reset();
        if (scheduleIdInput) scheduleIdInput.value = '';
        if (scheduleSubmitButton) scheduleSubmitButton.textContent = 'Agregar schedule';
        if (cancelScheduleEditButton) cancelScheduleEditButton.classList.add('hidden');
        loadSchedules();
      } else {
        showAlert(data.error || 'Error actualizando schedule.', 'error');
      }
    } else {
      const res = await fetch('/api/gate/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, enabled: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showAlert('Schedule agregado.');
        scheduleForm.reset();
        loadSchedules();
      } else {
        showAlert(data.error || 'Error creando schedule.', 'error');
      }
    }
  } catch (e) {
    showAlert('Error de conexión al servidor.', 'error');
  }
}

async function handleSchedulesClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'delete-schedule') {
    if (!confirm('Eliminar schedule?')) return;
    await fetch(`/api/gate/schedules/${id}`, { method: 'DELETE' });
    showAlert('Schedule eliminado.');
    loadSchedules();
    return;
  }
  if (action === 'edit-schedule') {
    // fetch schedule details and populate form
    try {
      const res = await fetch('/api/gate/schedules');
      const rows = await res.json();
      const s = rows.find((r) => r.id === Number(id));
      if (!s) return showAlert('Schedule no encontrado', 'error');
      if (scheduleIdInput) scheduleIdInput.value = s.id;
      scheduleTimeInput.value = s.time;
      if (scheduleSubmitButton) scheduleSubmitButton.textContent = 'Guardar cambios';
      if (cancelScheduleEditButton) cancelScheduleEditButton.classList.remove('hidden');
      window.scrollTo({ top: document.querySelector('#schedules-table').offsetTop, behavior: 'smooth' });
    } catch (e) {
      showAlert('Error cargando schedule', 'error');
    }
    return;
  }
  if (action === 'toggle-schedule') {
    try {
      const res = await fetch(`/api/gate/schedules/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        showAlert('Schedule actualizado.');
        loadSchedules();
      } else {
        const d = await res.json();
        showAlert(d.error || 'Error al actualizar schedule', 'error');
      }
    } catch (e) {
      showAlert('Error conectando al servidor', 'error');
    }
    return;
  }
}

openGateButton?.addEventListener('click', openGate);
const closeGateButton = document.getElementById('close-gate-button');
closeGateButton?.addEventListener('click', closeGate);
scheduleForm?.addEventListener('submit', addSchedule);
schedulesTableBody?.addEventListener('click', handleSchedulesClick);
loadSchedules();
cancelScheduleEditButton?.addEventListener('click', (e) => {
  e.preventDefault();
  scheduleIdInput.value = '';
  scheduleForm.reset();
  if (scheduleSubmitButton) scheduleSubmitButton.textContent = 'Agregar schedule';
  if (cancelScheduleEditButton) cancelScheduleEditButton.classList.add('hidden');
});

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

loadGateState();
setInterval(loadGateState, 5000);
