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

  // ==================== USUARIOS Y AUTENTICACIÓN ====================

  // Roles
  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      nivel INTEGER NOT NULL,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Permisos
  db.run(`
    CREATE TABLE IF NOT EXISTS permisos (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      seccion TEXT NOT NULL,
      accion TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_permisos_seccion ON permisos(seccion)`);

  // Relación Roles - Permisos
  db.run(`
    CREATE TABLE IF NOT EXISTS rol_permisos (
      id TEXT PRIMARY KEY,
      rol_id TEXT NOT NULL,
      permiso_id TEXT NOT NULL,
      UNIQUE(rol_id, permiso_id),
      FOREIGN KEY (rol_id) REFERENCES roles(id),
      FOREIGN KEY (permiso_id) REFERENCES permisos(id)
    )
  `);

  // Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol_id TEXT NOT NULL,
      departamento TEXT,
      telefono TEXT,
      activo BOOLEAN DEFAULT 1,
      ultimo_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rol_id) REFERENCES roles(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo)`);

  // Sesiones
  db.run(`
    CREATE TABLE IF NOT EXISTS sesiones (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      ip TEXT,
      user_agent TEXT,
      fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_expiracion DATETIME NOT NULL,
      activa BOOLEAN DEFAULT 1,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones(token)`);

  // ==================== AUDITORÍA ====================

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id TEXT PRIMARY KEY,
      tabla TEXT NOT NULL,
      tipo_operacion TEXT NOT NULL,
      registro_id TEXT NOT NULL,
      datos_anteriores TEXT,
      datos_nuevos TEXT,
      usuario_id TEXT,
      usuario_nombre TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_auditoria_tabla ON auditoria(tabla, registro_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id)`);

  // ==================== TOPVIEW - ÓRDENES DE PUBLICIDAD ====================

  // Tipos de anunciantes
  db.run(`
    CREATE TABLE IF NOT EXISTS tipos_anunciantes (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Productos de TOPVIEW
  db.run(`
    CREATE TABLE IF NOT EXISTS tipos_productos_topview (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      categoria TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Órdenes de Publicidad
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_publicidad (
      id TEXT PRIMARY KEY,
      numero_orden TEXT UNIQUE NOT NULL,
      tipo_anunciante TEXT NOT NULL,
      razon_social TEXT NOT NULL,
      nombre_anunciante TEXT NOT NULL,
      cliente_id TEXT,
      periodo_desde DATE NOT NULL,
      periodo_hasta DATE NOT NULL,
      fecha_facturacion DATE,
      email_contacto TEXT,
      costo_produccion REAL DEFAULT 0,
      monto_neto REAL DEFAULT 0,
      descuento_porcentaje REAL DEFAULT 0,
      descuento_monto REAL DEFAULT 0,
      monto_neto_aplicado REAL DEFAULT 0,
      descuento_facturas_porcentaje REAL DEFAULT 0,
      descuento_facturas_monto REAL DEFAULT 0,
      monto_final REAL DEFAULT 0,
      estado TEXT DEFAULT 'Activa',
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_publicidad_estado ON ordenes_publicidad(estado)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_publicidad_cliente ON ordenes_publicidad(cliente_id)`);

  // Detalles de Órdenes de Publicidad
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_publicidad_detalles (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      tipo_producto TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      ubicacion TEXT,
      especificaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);

  // Documentos Adjuntos
  db.run(`
    CREATE TABLE IF NOT EXISTS documentos_adjuntos (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      nombre_archivo TEXT NOT NULL,
      tipo_archivo TEXT,
      url_drive TEXT,
      descripcion TEXT,
      fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);

  // Replicación de Facturación
  db.run(`
    CREATE TABLE IF NOT EXISTS replicaciones_facturacion (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      numero_mes INTEGER,
      ano INTEGER,
      factura_id TEXT,
      fecha_generacion DATETIME,
      estado TEXT DEFAULT 'Pendiente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id),
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_replicaciones_orden ON replicaciones_facturacion(orden_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_replicaciones_mes_ano ON replicaciones_facturacion(numero_mes, ano)`);

  // Contactos por Email
  db.run(`
    CREATE TABLE IF NOT EXISTS contactos_email (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      email TEXT NOT NULL,
      nombre_contacto TEXT,
      cargo TEXT,
      principal BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);

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

  // Insertar roles iniciales
  db.run(`
    INSERT OR IGNORE INTO roles (id, nombre, descripcion, nivel)
    VALUES
      ('1', 'Administrador', 'Acceso total al sistema', 1),
      ('2', 'Gerente', 'Gestión general del negocio', 2),
      ('3', 'Contador', 'Acceso a finanzas y reportes', 3),
      ('4', 'Vendedor', 'Gestión de ventas y clientes', 4),
      ('5', 'Comprador', 'Gestión de compras y proveedores', 5),
      ('6', 'Operario', 'Consulta de datos limitada', 6)
  `);

  // Insertar permisos iniciales
  db.run(`
    INSERT OR IGNORE INTO permisos (id, codigo, descripcion, seccion, accion)
    VALUES
      -- Dashboard
      ('p1', 'dashboard_ver', 'Ver dashboard', 'dashboard', 'ver'),

      -- Ventas
      ('p2', 'facturas_crear', 'Crear facturas', 'ventas', 'crear'),
      ('p3', 'facturas_editar', 'Editar facturas', 'ventas', 'editar'),
      ('p4', 'facturas_eliminar', 'Eliminar facturas', 'ventas', 'eliminar'),
      ('p5', 'facturas_ver', 'Ver facturas', 'ventas', 'ver'),
      ('p6', 'presupuestos_crear', 'Crear presupuestos', 'ventas', 'crear'),
      ('p7', 'presupuestos_ver', 'Ver presupuestos', 'ventas', 'ver'),
      ('p8', 'cobros_registrar', 'Registrar cobros', 'ventas', 'cobrar'),
      ('p9', 'notas_credito_crear', 'Crear notas de crédito', 'ventas', 'crear'),

      -- Compras
      ('p10', 'compras_crear', 'Crear órdenes de compra', 'compras', 'crear'),
      ('p11', 'compras_editar', 'Editar órdenes de compra', 'compras', 'editar'),
      ('p12', 'compras_ver', 'Ver órdenes de compra', 'compras', 'ver'),
      ('p13', 'gastos_crear', 'Crear gastos', 'compras', 'crear'),
      ('p14', 'gastos_ver', 'Ver gastos', 'compras', 'ver'),

      -- Maestros
      ('p15', 'productos_crear', 'Crear productos', 'maestros', 'crear'),
      ('p16', 'productos_editar', 'Editar productos', 'maestros', 'editar'),
      ('p17', 'productos_ver', 'Ver productos', 'maestros', 'ver'),
      ('p18', 'clientes_crear', 'Crear clientes', 'maestros', 'crear'),
      ('p19', 'clientes_editar', 'Editar clientes', 'maestros', 'editar'),
      ('p20', 'clientes_ver', 'Ver clientes', 'maestros', 'ver'),
      ('p21', 'proveedores_crear', 'Crear proveedores', 'maestros', 'crear'),
      ('p22', 'proveedores_ver', 'Ver proveedores', 'maestros', 'ver'),

      -- Tesorería
      ('p23', 'tesoreria_ver', 'Ver tesorería', 'tesoreria', 'ver'),
      ('p24', 'cuentas_crear', 'Crear cuentas', 'tesoreria', 'crear'),
      ('p25', 'cuentas_editar', 'Editar cuentas', 'tesoreria', 'editar'),

      -- Reportes
      ('p26', 'reportes_ventas', 'Ver reportes de ventas', 'reportes', 'ver'),
      ('p27', 'reportes_compras', 'Ver reportes de compras', 'reportes', 'ver'),
      ('p28', 'reportes_financieros', 'Ver reportes financieros', 'reportes', 'ver'),
      ('p29', 'reportes_impositiva', 'Ver reportes impositivos', 'reportes', 'ver'),

      -- Auditoría
      ('p30', 'auditoria_ver', 'Ver auditoría', 'auditoria', 'ver'),
      ('p31', 'usuarios_gestionar', 'Gestionar usuarios', 'usuarios', 'gestionar'),

      -- TOPVIEW
      ('p32', 'topview_crear', 'Crear órdenes de publicidad', 'topview', 'crear'),
      ('p33', 'topview_editar', 'Editar órdenes de publicidad', 'topview', 'editar'),
      ('p34', 'topview_ver', 'Ver órdenes de publicidad', 'topview', 'ver')
  `);

  // Asignar permisos a roles
  // Admin: Todos los permisos
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '1', id) as id, '1' as rol_id, id as permiso_id
    FROM permisos
  `);

  // Gerente: Casi todos excepto auditoría y usuarios
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '2', id) as id, '2' as rol_id, id as permiso_id
    FROM permisos
    WHERE codigo NOT IN ('auditoria_ver', 'usuarios_gestionar')
  `);

  // Contador: Tesorería, reportes, auditoría
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '3', id) as id, '3' as rol_id, id as permiso_id
    FROM permisos
    WHERE seccion IN ('tesoreria', 'reportes', 'auditoria', 'maestros')
    AND codigo LIKE '%ver%'
  `);

  // Vendedor: Ventas y clientes
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '4', id) as id, '4' as rol_id, id as permiso_id
    FROM permisos
    WHERE seccion IN ('ventas', 'maestros')
    AND codigo LIKE '%clientes%' OR codigo LIKE '%facturas%' OR codigo LIKE '%presupuestos%' OR codigo LIKE '%cobros%'
  `);

  // Comprador: Compras y proveedores
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '5', id) as id, '5' as rol_id, id as permiso_id
    FROM permisos
    WHERE seccion IN ('compras', 'maestros')
    AND codigo LIKE '%proveedores%' OR codigo LIKE '%compras%' OR codigo LIKE '%gastos%'
  `);

  // Operario: Solo consulta
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '6', id) as id, '6' as rol_id, id as permiso_id
    FROM permisos
    WHERE codigo LIKE '%ver%'
  `);

  // Insertar usuario administrador por defecto (password: admin123)
  db.run(`
    INSERT OR IGNORE INTO usuarios (id, nombre, email, password, rol_id, departamento)
    VALUES ('admin1', 'Administrador', 'admin@system.local', '$2a$10$YWRtaW4xMjMuaGFzaGVk', '1', 'Administración')
  `);

  // Insertar tipos de anunciantes para TOPVIEW
  db.run(`
    INSERT OR IGNORE INTO tipos_anunciantes (id, nombre, descripcion)
    VALUES
      ('1', 'Pequeños Anunciantes', 'Pequeñas empresas y emprendimientos'),
      ('2', 'Pautas Estado', 'Organismos del estado'),
      ('3', 'Pautas Anuales', 'Contratos anuales'),
      ('4', 'Pautas Mensuales', 'Contratos mensuales')
  `);

  // Insertar productos de TOPVIEW
  db.run(`
    INSERT OR IGNORE INTO tipos_productos_topview (id, nombre, categoria, descripcion)
    VALUES
      ('1', 'PPLs', 'Publicidad Exterior', 'Pósters en puntos estratégicos'),
      ('2', 'Cajas Backlight', 'Iluminación', 'Cajas iluminadas backlight'),
      ('3', 'Gigantografías', 'Impresión', 'Impresión de gran formato'),
      ('4', 'Pantallas LEDs Verticales', 'Digital', 'Pantallas LED de gran tamaño verticales'),
      ('5', 'Video Wall', 'Digital', 'Pared de video de múltiples pantallas'),
      ('6', 'Pantallas Gran Formato', 'Digital', 'Pantallas LED de formato grande'),
      ('7', 'Ploteos', 'Impresión', 'Adhesivos impresos (ploteos)'),
      ('8', 'Stands', 'Instalación', 'Estructuras para ferias y eventos'),
      ('9', 'Varios', 'Otros', 'Otros productos y servicios')
  `);

  console.log('✓ Base de datos iniciada correctamente');
  console.log('✓ Roles creados (Admin, Gerente, Contador, Vendedor, Comprador, Operario)');
  console.log('✓ Permisos asignados por rol');
  console.log('✓ Usuario admin@system.local creado (password: admin123)');
  console.log('✓ Tipos de anunciantes TOPVIEW creados');
  console.log('✓ Productos TOPVIEW creados');
});

export default db;
