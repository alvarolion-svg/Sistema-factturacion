// ==================== ESTADO GLOBAL ====================

let currentSection = 'dashboard';
let currentTab = {};
let productos = [];
let clientes = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadDashboard();
});

function initializeEventListeners() {
  // Menú lateral
  document.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const section = e.currentTarget.dataset.section;
      switchSection(section);
    });
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      const parent = e.currentTarget.closest('.section-tabs').nextElementSibling;
      switchTab(parent, tab);
    });
  });

  // Botones principales
  document.getElementById('btn-nueva-factura')?.addEventListener('click', showFormularioFactura);
  document.getElementById('btn-nuevo-producto')?.addEventListener('click', showFormularioProducto);
  document.getElementById('btn-nuevo-cliente')?.addEventListener('click', showFormularioCliente);

  // Modal close
  document.querySelector('.close')?.addEventListener('click', closeModal);
}

// ==================== NAVEGACIÓN ====================

function switchSection(section) {
  // Ocultar secciones
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));

  // Mostrar sección seleccionada
  document.getElementById(section).classList.add('active');

  // Actualizar menú
  document.querySelectorAll('.menu-item').forEach((m) => m.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`).classList.add('active');

  // Actualizar título
  const titles = {
    dashboard: 'Dashboard',
    ventas: 'Ventas',
    compras: 'Compras y Gastos',
    maestros: 'Base de Datos',
    impositiva: 'Situación Impositiva',
    tesoreria: 'Tesorería',
    auditoria: 'Auditoría',
  };
  document.getElementById('section-title').textContent = titles[section];

  currentSection = section;

  // Cargar datos según la sección
  if (section === 'maestros') {
    loadMaestros();
  } else if (section === 'ventas') {
    loadVentas();
  } else if (section === 'tesoreria') {
    loadTesoreria();
  } else if (section === 'impositiva') {
    loadImpositiva();
  }
}

function switchTab(parent, tab) {
  // Ocultar tabs
  parent.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

  // Mostrar tab seleccionado
  const tabPane = parent.querySelector(`#${tab}`);
  if (tabPane) {
    tabPane.classList.add('active');
  }

  // Actualizar botones
  const tabBtns = parent.previousElementSibling.querySelectorAll('.tab-btn');
  tabBtns.forEach((b) => b.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  // Cargar datos específicos del tab
  if (tab === 'facturas') {
    loadFacturas();
  } else if (tab === 'productos') {
    loadProductos();
  } else if (tab === 'clientes') {
    loadClientes();
  }
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
  try {
    // Simular datos de dashboard
    const ventasTotal = 45000;
    const ccClientes = 12000;
    const ccProveedores = 8500;
    const tesoreriaTotal = 25000;

    document.getElementById('ventas-total').textContent = `$${ventasTotal.toLocaleString('es-AR')}`;
    document.getElementById('cc-clientes').textContent = `$${ccClientes.toLocaleString('es-AR')}`;
    document.getElementById('cc-proveedores').textContent = `$${ccProveedores.toLocaleString('es-AR')}`;
    document.getElementById('tesoreria-total').textContent = `$${tesoreriaTotal.toLocaleString('es-AR')}`;
  } catch (error) {
    console.error('Error al cargar dashboard:', error);
  }
}

// ==================== MAESTROS ====================

async function loadMaestros() {
  loadProductos();
  loadClientes();
}

async function loadProductos() {
  try {
    productos = await API.obtenerProductos();
    const tbody = document.querySelector('#tabla-productos tbody');
    tbody.innerHTML = '';

    productos.forEach((p) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.nombre}</td>
        <td>$${p.precio_venta.toLocaleString('es-AR')}</td>
        <td>${p.stock}</td>
        <td>
          <button class="btn btn-sm btn-secondary">Editar</button>
          <button class="btn btn-sm btn-danger">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error al cargar productos:', error);
  }
}

async function loadClientes() {
  try {
    clientes = await API.obtenerClientes();
    const tbody = document.querySelector('#tabla-clientes tbody');
    tbody.innerHTML = '';

    clientes.forEach((c) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.razon_social}</td>
        <td>${c.cuit || '-'}</td>
        <td>${c.email || '-'}</td>
        <td>${c.telefono || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary">Editar</button>
          <button class="btn btn-sm btn-danger">Eliminar</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error al cargar clientes:', error);
  }
}

// ==================== VENTAS ====================

async function loadVentas() {
  loadFacturas();
}

async function loadFacturas() {
  try {
    const facturas = await API.obtenerFacturas();
    const tbody = document.querySelector('#tabla-facturas tbody');
    tbody.innerHTML = '';

    if (!Array.isArray(facturas)) {
      tbody.innerHTML = '<tr><td colspan="7">Sin facturas registradas</td></tr>';
      return;
    }

    facturas.forEach((f) => {
      const estadoBadge = `
        <span class="badge badge-${f.estado === 'Cobrada' ? 'success' : f.estado === 'Abierta' ? 'warning' : 'danger'}">
          ${f.estado}
        </span>
      `;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${f.numero}</td>
        <td>${f.cliente_id}</td>
        <td>${f.fecha}</td>
        <td>$${f.total.toLocaleString('es-AR')}</td>
        <td>$${f.saldo.toLocaleString('es-AR')}</td>
        <td>${estadoBadge}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="verFactura('${f.id}')">Ver</button>
          ${f.estado !== 'Cobrada' ? `<button class="btn btn-sm btn-success" onclick="registrarCobro('${f.id}')">Cobrar</button>` : ''}
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error al cargar facturas:', error);
  }
}

// ==================== TESORERÍA ====================

async function loadTesoreria() {
  try {
    const estado = await API.obtenerEstadoTesoreria();

    const cajasContainer = document.getElementById('cajas-container');
    const bancosContainer = document.getElementById('bancos-container');

    cajasContainer.innerHTML = '';
    bancosContainer.innerHTML = '';

    estado.cuentas.forEach((c) => {
      const card = document.createElement('div');
      card.style.marginBottom = '1rem';
      card.innerHTML = `
        <p><strong>${c.nombre}</strong></p>
        <p>Saldo: $${c.saldo.toLocaleString('es-AR')} ${c.moneda}</p>
      `;

      if (c.tipo === 'Caja') {
        cajasContainer.appendChild(card);
      } else if (c.tipo === 'Banco') {
        bancosContainer.appendChild(card);
      }
    });
  } catch (error) {
    console.error('Error al cargar tesorería:', error);
  }
}

// ==================== IMPOSITIVA ====================

async function loadImpositiva() {
  // Simular datos impositivos
  document.getElementById('iva-cf').textContent = '$3,500';
  document.getElementById('iva-df').textContent = '$9,450';
  document.getElementById('iibb').textContent = '$1,200';
  document.getElementById('percepciones').textContent = '$850';
}

// ==================== FORMULARIOS ====================

function showFormularioProducto() {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <h3>Nuevo Producto</h3>
    <form id="form-producto">
      <div class="form-group">
        <label>Código</label>
        <input type="text" name="codigo" required>
      </div>
      <div class="form-group">
        <label>Nombre</label>
        <input type="text" name="nombre" required>
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <textarea name="descripcion"></textarea>
      </div>
      <div class="form-group">
        <label>Precio de Venta</label>
        <input type="number" name="precio_venta" step="0.01" required>
      </div>
      <div class="form-group">
        <label>Costo</label>
        <input type="number" name="costo" step="0.01">
      </div>
      <div class="form-group">
        <label>Stock</label>
        <input type="number" name="stock" value="0">
      </div>
      <button type="submit" class="btn btn-primary" style="width: 100%;">Guardar</button>
    </form>
  `;

  document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    datos.precio_venta = parseFloat(datos.precio_venta);
    datos.costo = parseFloat(datos.costo) || null;
    datos.stock = parseInt(datos.stock) || 0;

    try {
      await API.crearProducto(datos);
      closeModal();
      loadProductos();
      alert('Producto creado exitosamente');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });

  openModal();
}

function showFormularioCliente() {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <h3>Nuevo Cliente</h3>
    <form id="form-cliente">
      <div class="form-group">
        <label>Razón Social</label>
        <input type="text" name="razon_social" required>
      </div>
      <div class="form-group">
        <label>CUIT</label>
        <input type="text" name="cuit">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email">
      </div>
      <div class="form-group">
        <label>Teléfono</label>
        <input type="tel" name="telefono">
      </div>
      <div class="form-group">
        <label>Dirección</label>
        <input type="text" name="direccion">
      </div>
      <div class="form-group">
        <label>Ciudad</label>
        <input type="text" name="ciudad">
      </div>
      <button type="submit" class="btn btn-primary" style="width: 100%;">Guardar</button>
    </form>
  `;

  document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));

    try {
      await API.crearCliente(datos);
      closeModal();
      loadClientes();
      alert('Cliente creado exitosamente');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });

  openModal();
}

function showFormularioFactura() {
  const modalBody = document.getElementById('modal-body');
  const clienteOptions = clientes.map((c) => `<option value="${c.id}">${c.razon_social}</option>`).join('');
  const productoOptions = productos.map((p) => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre} - $${p.precio_venta}</option>`).join('');

  modalBody.innerHTML = `
    <h3>Nueva Factura</h3>
    <form id="form-factura">
      <div class="form-group">
        <label>Cliente</label>
        <select name="cliente_id" required>
          <option value="">Seleccionar cliente</option>
          ${clienteOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Tipo de Comprobante</label>
        <select name="tipo_comprobante">
          <option value="Factura A">Factura A</option>
          <option value="Factura B">Factura B</option>
        </select>
      </div>
      <div id="detalles"></div>
      <button type="button" onclick="agregarDetalle()" class="btn btn-secondary">+ Agregar Producto</button>
      <br><br>
      <button type="submit" class="btn btn-primary" style="width: 100%;">Crear Factura</button>
    </form>
  `;

  document.getElementById('form-factura').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    datos.detalles = [];

    try {
      await API.crearFactura(datos);
      closeModal();
      loadFacturas();
      alert('Factura creada exitosamente');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });

  openModal();
}

function agregarDetalle() {
  const detalles = document.getElementById('detalles');
  const detalle = document.createElement('div');
  detalle.className = 'form-group';
  detalle.style.border = '1px solid #e5e7eb';
  detalle.style.padding = '1rem';
  detalle.style.marginBottom = '1rem';
  detalle.innerHTML = `
    <label>Producto</label>
    <select name="producto_id" required>
      <option value="">Seleccionar producto</option>
      ${productos.map((p) => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre}</option>`).join('')}
    </select>
    <label style="margin-top: 0.5rem;">Cantidad</label>
    <input type="number" name="cantidad" min="1" value="1" required>
    <label style="margin-top: 0.5rem;">Precio Unitario</label>
    <input type="number" name="precio_unitario" step="0.01" required>
    <button type="button" onclick="this.closest('.form-group').remove()" class="btn btn-danger btn-sm" style="margin-top: 0.5rem;">Eliminar</button>
  `;
  detalles.appendChild(detalle);
}

// ==================== MODAL ====================

function openModal() {
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// ==================== ACCIONES ====================

function verFactura(id) {
  alert('Función en desarrollo: Ver factura ' + id);
}

function registrarCobro(id) {
  alert('Función en desarrollo: Registrar cobro ' + id);
}
