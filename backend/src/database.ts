import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'facturacion.db');

export const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // ==================== MAESTROS ====================

  // Productos
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_venta REAL NOT NULL,
      costo REAL,
      stock INTEGER DEFAULT 0,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Proveedores
  db.run(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id TEXT PRIMARY KEY,
      razon_social TEXT NOT NULL,
      cuit TEXT UNIQUE,
      email TEXT,
      telefono TEXT,
      direccion TEXT,
      ciudad TEXT,
      condicion_iva TEXT DEFAULT 'Responsable Inscripto',
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      razon_social TEXT NOT NULL,
      cuit TEXT UNIQUE,
      email TEXT,
      telefono TEXT,
      direccion TEXT,
      ciudad TEXT,
      condicion_iva TEXT DEFAULT 'Responsable Inscripto',
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== VENTAS ====================

  // Presupuestos
  db.run(`
    CREATE TABLE IF NOT EXISTS presupuestos (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      cliente_id TEXT NOT NULL,
      fecha DATE NOT NULL,
      estado TEXT DEFAULT 'Borrador',
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      observaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON presupuestos(cliente_id)`);

  // Detalles de Presupuestos
  db.run(`
    CREATE TABLE IF NOT EXISTS presupuestos_detalles (
      id TEXT PRIMARY KEY,
      presupuesto_id TEXT NOT NULL,
      producto_id TEXT NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);

  // Facturas
  db.run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      cliente_id TEXT NOT NULL,
      fecha DATE NOT NULL,
      fecha_vencimiento DATE,
      tipo_comprobante TEXT DEFAULT 'Factura A',
      estado TEXT DEFAULT 'Abierta',
      validada_arca BOOLEAN DEFAULT 0,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      saldo REAL DEFAULT 0,
      observaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado)`);

  // Detalles de Facturas
  db.run(`
    CREATE TABLE IF NOT EXISTS facturas_detalles (
      id TEXT PRIMARY KEY,
      factura_id TEXT NOT NULL,
      producto_id TEXT NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (factura_id) REFERENCES facturas(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);

  // Notas de Crédito
  db.run(`
    CREATE TABLE IF NOT EXISTS notas_credito (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      factura_id TEXT NOT NULL,
      cliente_id TEXT NOT NULL,
      fecha DATE NOT NULL,
      motivo TEXT,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      estado TEXT DEFAULT 'Emitida',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (factura_id) REFERENCES facturas(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  // ==================== COMPRAS ====================

  // Órdenes de Compra
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_compra (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      proveedor_id TEXT NOT NULL,
      fecha DATE NOT NULL,
      estado TEXT DEFAULT 'Pendiente',
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      observaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_proveedor ON ordenes_compra(proveedor_id)`);

  // Gastos
  db.run(`
    CREATE TABLE IF NOT EXISTS gastos (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      proveedor_id TEXT,
      tipo_gasto TEXT NOT NULL,
      fecha DATE NOT NULL,
      estado TEXT DEFAULT 'Pendiente',
      monto REAL NOT NULL,
      iva REAL,
      total REAL NOT NULL,
      descripcion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
  `);

  // ==================== TESORERÍA ====================

  // Cuentas
  db.run(`
    CREATE TABLE IF NOT EXISTS cuentas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      moneda TEXT DEFAULT 'ARS',
      saldo REAL DEFAULT 0,
      habilitada BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cuentas Corrientes - Clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS cc_clientes (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      saldo REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cliente_id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  // Cuentas Corrientes - Proveedores
  db.run(`
    CREATE TABLE IF NOT EXISTS cc_proveedores (
      id TEXT PRIMARY KEY,
      proveedor_id TEXT NOT NULL,
      saldo REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(proveedor_id),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
  `);

  // Movimientos Contables
  db.run(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id TEXT PRIMARY KEY,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo_documento TEXT NOT NULL,
      documento_id TEXT NOT NULL,
      descripcion TEXT,
      cuenta_origen_id TEXT,
      cuenta_destino_id TEXT,
      monto REAL NOT NULL,
      saldo_anterior REAL,
      saldo_nuevo REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cuenta_origen_id) REFERENCES cuentas(id),
      FOREIGN KEY (cuenta_destino_id) REFERENCES cuentas(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_movimientos_documento ON movimientos(tipo_documento, documento_id)`);

  // ==================== AUDITORÍA ====================

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id TEXT PRIMARY KEY,
      tabla TEXT NOT NULL,
      tipo_operacion TEXT NOT NULL,
      registro_id TEXT NOT NULL,
      datos_anteriores TEXT,
      datos_nuevos TEXT,
      usuario TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_auditoria_tabla ON auditoria(tabla, registro_id)`);

  // ==================== SITUACIÓN IMPOSITIVA ====================

  // IVA (CF y DF)
  db.run(`
    CREATE TABLE IF NOT EXISTS iva_movimientos (
      id TEXT PRIMARY KEY,
      fecha DATE NOT NULL,
      tipo TEXT NOT NULL,
      documento_id TEXT,
      monto_iva REAL NOT NULL,
      tipo_iva TEXT,
      retenido BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Percepciones
  db.run(`
    CREATE TABLE IF NOT EXISTS percepciones (
      id TEXT PRIMARY KEY,
      fecha DATE NOT NULL,
      documento_id TEXT,
      tipo_percepcion TEXT NOT NULL,
      monto REAL NOT NULL,
      porcentaje REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // IIBB
  db.run(`
    CREATE TABLE IF NOT EXISTS iibb_movimientos (
      id TEXT PRIMARY KEY,
      fecha DATE NOT NULL,
      monto_base REAL NOT NULL,
      monto_iibb REAL NOT NULL,
      alicuota REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✓ Base de datos iniciada correctamente');
});

export default db;
