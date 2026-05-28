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
