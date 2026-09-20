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
  db.run(`ALTER TABLE productos ADD COLUMN tipo TEXT DEFAULT 'fisico'`, () => {});

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
      nombre_fantasia TEXT,
      cuit TEXT UNIQUE,
      dni TEXT,
      email TEXT,
      telefono TEXT,
      direccion TEXT,
      ciudad TEXT,
      codigo_postal TEXT,
      provincia TEXT,
      pais TEXT,
      direccion_fiscal TEXT,
      ciudad_fiscal TEXT,
      codigo_postal_fiscal TEXT,
      provincia_fiscal TEXT,
      pais_fiscal TEXT,
      condicion_iva TEXT DEFAULT 'Responsable Inscripto',
      condicion_pago TEXT,
      limite_credito REAL DEFAULT 0,
      porcentaje_iva REAL DEFAULT 0,
      retencion_ganancias REAL DEFAULT 0,
      numero_plan_cuenta TEXT,
      numero_cuenta_bancaria TEXT,
      cbu TEXT,
      banco TEXT,
      descripcion_banco TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agrega las columnas a bases ya existentes (creadas antes de este cambio).
  // "duplicate column name" es esperable en cada reinicio una vez agregadas: se ignora.
  const columnasNuevasClientes = [
    'nombre_fantasia TEXT',
    'dni TEXT',
    'codigo_postal TEXT',
    'provincia TEXT',
    'pais TEXT',
    'direccion_fiscal TEXT',
    'ciudad_fiscal TEXT',
    'codigo_postal_fiscal TEXT',
    'provincia_fiscal TEXT',
    'pais_fiscal TEXT',
    'condicion_pago TEXT',
    'limite_credito REAL DEFAULT 0',
    'porcentaje_iva REAL DEFAULT 0',
    'retencion_ganancias REAL DEFAULT 0',
    'numero_plan_cuenta TEXT',
    'numero_cuenta_bancaria TEXT',
    'cbu TEXT',
    'banco TEXT',
    'descripcion_banco TEXT',
  ];
  columnasNuevasClientes.forEach((definicion) => {
    db.run(`ALTER TABLE clientes ADD COLUMN ${definicion}`, () => {});
  });

  // Contactos de un cliente (hasta N, sin límite fijo)
  db.run(`
    CREATE TABLE IF NOT EXISTS contactos_cliente (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      nombre TEXT,
      apellido TEXT,
      email TEXT,
      rol TEXT,
      telefono TEXT,
      interno TEXT,
      skype TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
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
      descripcion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (factura_id) REFERENCES facturas(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);
  db.run(`ALTER TABLE facturas_detalles ADD COLUMN descripcion TEXT`, () => {});

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
      orden_id TEXT,
      numero_mes INTEGER,
      ano INTEGER,
      origen TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);
  // Vincula el gasto con la orden/mes que lo generó (evita duplicar el mismo
  // gasto si se re-genera la factura de ese mes) y qué lo originó: la agencia
  // (% factura a esperar) o un comisionista con factura.
  db.run(`ALTER TABLE gastos ADD COLUMN orden_id TEXT`, () => {});
  db.run(`ALTER TABLE gastos ADD COLUMN numero_mes INTEGER`, () => {});
  db.run(`ALTER TABLE gastos ADD COLUMN ano INTEGER`, () => {});
  db.run(`ALTER TABLE gastos ADD COLUMN origen TEXT`, () => {});

  // Comisiones en efectivo: circuito paralelo a gastos para comisionistas SIN
  // factura formal. No es fiscal (no genera IVA ni es deducible), así que no
  // vive en gastos — es un simple "cuánto le debo en mano y ya se lo pagué o
  // no". Una fila por comisionista/orden/mes (misma granularidad que gastos,
  // se regenera un renglón por cada factura mensual de la orden). factura_id
  // referencia la factura AL CLIENTE de ese mismo período, para poder mostrar
  // si ya se cobró antes de decidir pagar la comisión — el pago no depende de
  // nuestra voluntad sino de haber cobrado esa factura primero.
  db.run(`
    CREATE TABLE IF NOT EXISTS comisiones_efectivo (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      intermediario_id TEXT NOT NULL,
      factura_id TEXT,
      numero_mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      monto REAL NOT NULL,
      pagado BOOLEAN DEFAULT 0,
      fecha_pago DATE,
      descripcion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id),
      FOREIGN KEY (intermediario_id) REFERENCES intermediarios(id),
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
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

  // Agencias de Publicidad
  db.run(`
    CREATE TABLE IF NOT EXISTS agencias (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      contacto TEXT,
      email TEXT,
      telefono TEXT,
      proveedor_id TEXT,
      cliente_id TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);
  // Muchas agencias "atienden las dos ventanillas": son cliente (les
  // facturamos la pauta) Y a la vez cobran su comisión como proveedor. Este
  // vínculo directo a clientes es lo que permite mostrar el tag "Agencia" en
  // la ficha del cliente, más allá de si además tiene un proveedor cargado.
  db.run(`ALTER TABLE agencias ADD COLUMN cliente_id TEXT`, () => {});
  // Proveedor a quien se le espera la factura de servicio (si esta agencia
  // cobra parte de su remuneración así — ver condiciones_agencia).
  db.run(`ALTER TABLE agencias ADD COLUMN proveedor_id TEXT`, () => {});

  // Intermediarios (Columna Gris)
  db.run(`
    CREATE TABLE IF NOT EXISTS intermediarios (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      contacto TEXT,
      email TEXT,
      telefono TEXT,
      factura_formal BOOLEAN DEFAULT 0,
      proveedor_id TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
  `);
  // Proveedor a quien se le espera la factura (comisionista "con factura").
  db.run(`ALTER TABLE intermediarios ADD COLUMN proveedor_id TEXT`, () => {});

  // Condiciones de descuento por agencia: cómo se remunera a cada agencia
  // (% que se cubre con Nota de Crédito, % que se cubre esperando recibir su
  // factura de servicio). Una misma agencia puede tener más de una condición
  // guardada (ej. distinta modalidad de compra) — se elige al cargar la orden,
  // y sirve solo como sugerencia: se puede modificar para un caso puntual.
  db.run(`
    CREATE TABLE IF NOT EXISTS condiciones_agencia (
      id TEXT PRIMARY KEY,
      agencia_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      porcentaje_nc REAL DEFAULT 0,
      nc_en_cascada BOOLEAN DEFAULT 0,
      porcentaje_factura REAL DEFAULT 0,
      factura_en_cascada BOOLEAN DEFAULT 0,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agencia_id) REFERENCES agencias(id)
    )
  `);
  db.run(`ALTER TABLE condiciones_agencia ADD COLUMN nc_en_cascada BOOLEAN DEFAULT 0`, () => {});

  // Mismo concepto para comisionistas: % y forma de cálculo habituales de cada
  // uno, sugeridos al agregarlo a una orden pero editables por orden.
  db.run(`
    CREATE TABLE IF NOT EXISTS condiciones_intermediario (
      id TEXT PRIMARY KEY,
      intermediario_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      porcentaje_comision REAL DEFAULT 0,
      tipo_calculo TEXT DEFAULT 'cascada',
      factura_formal BOOLEAN DEFAULT 0,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (intermediario_id) REFERENCES intermediarios(id)
    )
  `);
  // La clasificación Tipo 1 (factura)/Tipo 2 (efectivo) ya no es un atributo
  // fijo del comisionista — una misma persona puede tener negocios de ambos
  // tipos. Ahora vive en cada condición (el "negocio" puntual), junto con el
  // % y la forma de cálculo, y de ahí se copia a la orden al elegirla.
  db.run(`ALTER TABLE condiciones_intermediario ADD COLUMN factura_formal BOOLEAN DEFAULT 0`, () => {});

  // Órdenes de Publicidad
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_publicidad (
      id TEXT PRIMARY KEY,
      numero_orden TEXT UNIQUE NOT NULL,
      numero_orden_agencia TEXT,
      tipo_anunciante TEXT NOT NULL,
      razon_social TEXT NOT NULL,
      nombre_anunciante TEXT NOT NULL,
      cliente_id TEXT,
      agencia_id TEXT,
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
      estado TEXT DEFAULT 'Cargada',
      notas TEXT,
      facturado BOOLEAN DEFAULT 0,
      leyenda_factura TEXT,
      incluir_numero_orden_agencia BOOLEAN DEFAULT 1,
      descuento_en_cascada BOOLEAN DEFAULT 0,
      descuento_facturas_en_cascada BOOLEAN DEFAULT 0,
      mes_ingreso INTEGER,
      ano_ingreso INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (agencia_id) REFERENCES agencias(id)
    )
  `);

  // Agrega la columna a bases ya existentes (creadas antes de este cambio).
  // "duplicate column name" es esperable en cada reinicio una vez agregada: se ignora.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN numero_orden_agencia TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN leyenda_factura TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN incluir_numero_orden_agencia BOOLEAN DEFAULT 1`, () => {});
  // Descuento NC (comercial) y FC (facturas) pueden ser cada uno directo sobre el bruto
  // o en cascada sobre el remanente del anterior, según lo que se haya negociado con
  // cada agencia/cliente — por eso es elegible por orden, no fijo.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN descuento_en_cascada BOOLEAN DEFAULT 0`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN descuento_facturas_en_cascada BOOLEAN DEFAULT 0`, () => {});
  // Mes/año de ingreso: a qué mes se asigna la venta a efectos comerciales/reporte,
  // independiente del período de vigencia real (evita distorsiones cuando una campaña
  // cruza el fin de mes, ej. una pauta del 31/10 al 30/11 se puede igual asignar a Octubre).
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN mes_ingreso INTEGER`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN ano_ingreso INTEGER`, () => {});

  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_publicidad_estado ON ordenes_publicidad(estado)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_publicidad_cliente ON ordenes_publicidad(cliente_id)`);

  // Arreglos No Registrables (acuerdos informales que afectan el precio de una orden)
  db.run(`
    CREATE TABLE IF NOT EXISTS arreglos_no_registrables (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      tipo TEXT,
      descripcion TEXT,
      monto REAL DEFAULT 0,
      tercero_nombre TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);

  // Intermediarios por Orden (flexible, N intermediarios)
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_intermediarios (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      intermediario_id TEXT NOT NULL,
      numero_nivel INTEGER DEFAULT 1,
      porcentaje_comision REAL DEFAULT 0,
      monto_comision REAL DEFAULT 0,
      tipo_calculo TEXT DEFAULT 'cascada',
      factura_formal BOOLEAN DEFAULT 0,
      numero_factura TEXT,
      fecha_factura DATE,
      url_documento TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id),
      FOREIGN KEY (intermediario_id) REFERENCES intermediarios(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_intermediarios_orden ON ordenes_intermediarios(orden_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_intermediarios_nivel ON ordenes_intermediarios(numero_nivel)`);

  // Detalles de Órdenes de Publicidad
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_publicidad_detalles (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      tipo_producto TEXT NOT NULL,
      producto_id TEXT,
      cantidad INTEGER NOT NULL,
      ubicacion TEXT,
      especificaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);
  // El soporte pasa a ser un producto real del catálogo general (con su
  // propio ABM en Productos) en vez de un texto libre. tipo_producto queda
  // como copia de solo lectura del nombre, para no romper las pantallas que
  // ya lo muestran directo sin hacer join.
  db.run(`ALTER TABLE ordenes_publicidad_detalles ADD COLUMN producto_id TEXT`, () => {});

  // Documentos Adjuntos
  db.run(`
    CREATE TABLE IF NOT EXISTS documentos_adjuntos (
      id TEXT PRIMARY KEY,
      orden_id TEXT NOT NULL,
      nombre_archivo TEXT NOT NULL,
      tipo_archivo TEXT,
      url_drive TEXT,
      ruta_archivo TEXT,
      descripcion TEXT,
      fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_id) REFERENCES ordenes_publicidad(id)
    )
  `);

  // Agrega la columna a bases ya existentes (creadas antes de este cambio).
  // "duplicate column name" es esperable en cada reinicio una vez agregada: se ignora.
  db.run(`ALTER TABLE documentos_adjuntos ADD COLUMN ruta_archivo TEXT`, () => {});

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

  // Órdenes de Producción: documento propio, independiente de las órdenes de
  // exhibición — su propia numeración, sus propias líneas con precio (cantidad
  // x tarifa = importe) y su propia factura. No es un agregado de una orden de
  // exhibición: aparece siempre que hay producción, venga sola o junto con una
  // orden de exhibición que el usuario separa manualmente al cargarla.
  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_produccion (
      id TEXT PRIMARY KEY,
      numero_orden TEXT UNIQUE NOT NULL,
      numero_orden_cliente TEXT,
      agencia_id TEXT,
      cliente_id TEXT NOT NULL,
      proveedor_id TEXT,
      medio TEXT,
      marca TEXT,
      campana TEXT,
      periodo_desde DATE,
      periodo_hasta DATE,
      fecha DATE NOT NULL,
      pauta_numero TEXT,
      observaciones TEXT,
      email_envio_facturas TEXT,
      contacto TEXT,
      materiales TEXT,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      estado TEXT DEFAULT 'Cargada',
      numero_factura_colppy TEXT,
      numero_nc_colppy TEXT,
      habilitado BOOLEAN DEFAULT 1,
      factura_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agencia_id) REFERENCES agencias(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_cliente ON ordenes_produccion(cliente_id)`);
  // N° de orden del cliente/agencia (ej. "8002" en el PDF) — lo que se
  // muestra y se busca en la lista, igual que numero_orden_agencia en
  // ordenes_publicidad. numero_orden sigue siendo el ID interno (OPR-...).
  db.run(`ALTER TABLE ordenes_produccion ADD COLUMN numero_orden_cliente TEXT`, () => {});
  // Mismo tracker manual Cargada/Revisada/Facturada que ordenes_publicidad
  // (contra Colppy) — "Facturada" acá también se autocompleta cuando se
  // genera la factura real in-app (generarFactura), ver produccionTopview.ts.
  db.run(`UPDATE ordenes_produccion SET estado = 'Cargada' WHERE estado = 'Activa'`, () => {});
  // Mismos campos de referencia libre hacia Colppy que ordenes_publicidad.
  db.run(`ALTER TABLE ordenes_produccion ADD COLUMN numero_factura_colppy TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_produccion ADD COLUMN numero_nc_colppy TEXT`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_produccion_detalles (
      id TEXT PRIMARY KEY,
      orden_produccion_id TEXT NOT NULL,
      descripcion_ubicacion TEXT NOT NULL,
      producto_id TEXT,
      caras_elementos INTEGER DEFAULT 1,
      medida TEXT,
      tarifa REAL DEFAULT 0,
      descuento_porcentaje REAL DEFAULT 0,
      importe_neto REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_produccion_id) REFERENCES ordenes_produccion(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_detalles_orden ON ordenes_produccion_detalles(orden_produccion_id)`);

  // Locaciones: dónde está instalado cada soporte (Nordelta CC, Ven Street
  // Center, etc.) — antes era texto libre en cada línea de orden. Ahora es
  // una entidad real con su propio concesionario (a quien le pagamos por el
  // espacio) y su inventario, para poder armar liquidaciones y reportes de
  // demanda/ocupación sin cargar nada dos veces.
  db.run(`
    CREATE TABLE IF NOT EXISTS locaciones (
      id TEXT PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      tipo TEXT,
      concesionario_id TEXT,
      notas TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (concesionario_id) REFERENCES proveedores(id)
    )
  `);

  // Qué soportes tiene instalados cada locación, y cuántos. Es el catálogo
  // del que se elige al cargar una línea de orden (Locación → Soporte →
  // Cantidad), no un movimiento de venta en sí mismo.
  db.run(`
    CREATE TABLE IF NOT EXISTS locaciones_capacidad (
      id TEXT PRIMARY KEY,
      locacion_id TEXT NOT NULL,
      producto_id TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locacion_id) REFERENCES locaciones(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_locaciones_capacidad_locacion ON locaciones_capacidad(locacion_id)`);

  // Puntos de instalación con nombre propio dentro de una locación+soporte
  // (ej. Escaleras Mecánicas: "Freddo" y "Co Work" en Nordelta CC; o
  // variantes como Gran Formato "6x4"/"8x4") — opcional: la mayoría de los
  // soportes no lo necesitan y la cantidad vive directo en locaciones_capacidad.
  // Cuando SÍ hay puntos, la cantidad real es la suma de estos, no la de
  // locaciones_capacidad (que queda en 0/sin usar para ese caso).
  db.run(`
    CREATE TABLE IF NOT EXISTS locaciones_puntos (
      id TEXT PRIMARY KEY,
      capacidad_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      cantidad INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (capacidad_id) REFERENCES locaciones_capacidad(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_locaciones_puntos_capacidad ON locaciones_puntos(capacidad_id)`);

  // Liquidaciones a concesionarios: cuánto le paga Topview a cada
  // concesionario por cada línea de orden, mes a mes. No se calcula del
  // precio que le cobramos al anunciante — no tiene relación fija con eso —
  // se carga a mano por línea de detalle (que ya sabe su locación y su
  // cantidad/punto real). Una fila por línea de orden + mes/año.
  db.run(`
    CREATE TABLE IF NOT EXISTS liquidaciones_detalle (
      id TEXT PRIMARY KEY,
      orden_detalle_id TEXT NOT NULL,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orden_detalle_id) REFERENCES ordenes_publicidad_detalles(id),
      UNIQUE(orden_detalle_id, mes, ano)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_liquidaciones_detalle_periodo ON liquidaciones_detalle(mes, ano)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_liquidaciones_detalle_orden_detalle ON liquidaciones_detalle(orden_detalle_id)`);
  // Permite sacar una línea auto-generada de la liquidación de un período sin
  // borrar la orden ni el número que ya se cobró — ej. el cliente terminó no
  // pagando esa campaña puntual. Queda la fila (auditable), simplemente deja
  // de contar/mostrarse por default.
  db.run(`ALTER TABLE liquidaciones_detalle ADD COLUMN excluida BOOLEAN DEFAULT 0`, () => {});

  // Líneas sueltas de liquidación que no vienen de ninguna orden — ajustes,
  // compensaciones de un desfasaje de un mes anterior, etc. Tabla separada
  // (no una fila más de liquidaciones_detalle) porque no cuelgan de ningún
  // orden_detalle_id real.
  db.run(`
    CREATE TABLE IF NOT EXISTS liquidaciones_manuales (
      id TEXT PRIMARY KEY,
      concesionario_id TEXT NOT NULL,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (concesionario_id) REFERENCES proveedores(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_liquidaciones_manuales_periodo ON liquidaciones_manuales(concesionario_id, mes, ano)`);

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
      ('p39', 'gastos_editar', 'Editar gastos', 'compras', 'editar'),

      -- Maestros
      ('p15', 'productos_crear', 'Crear productos', 'maestros', 'crear'),
      ('p16', 'productos_editar', 'Editar productos', 'maestros', 'editar'),
      ('p17', 'productos_ver', 'Ver productos', 'maestros', 'ver'),
      ('p36', 'productos_eliminar', 'Eliminar productos', 'maestros', 'eliminar'),
      ('p18', 'clientes_crear', 'Crear clientes', 'maestros', 'crear'),
      ('p19', 'clientes_editar', 'Editar clientes', 'maestros', 'editar'),
      ('p20', 'clientes_ver', 'Ver clientes', 'maestros', 'ver'),
      ('p35', 'clientes_eliminar', 'Eliminar clientes', 'maestros', 'eliminar'),
      ('p21', 'proveedores_crear', 'Crear proveedores', 'maestros', 'crear'),
      ('p22', 'proveedores_ver', 'Ver proveedores', 'maestros', 'ver'),
      ('p37', 'proveedores_editar', 'Editar proveedores', 'maestros', 'editar'),
      ('p38', 'proveedores_eliminar', 'Eliminar proveedores', 'maestros', 'eliminar'),

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
      ('p34', 'topview_ver', 'Ver órdenes de publicidad', 'topview', 'ver'),
      ('p40', 'topview_comisionistas_ver', 'Ver comisionistas y sus condiciones de comisión', 'topview', 'ver'),
      ('p41', 'topview_comisionistas_crear', 'Crear comisionistas y condiciones de comisión', 'topview', 'crear'),
      ('p42', 'topview_comisionistas_editar', 'Editar/eliminar comisionistas y condiciones de comisión', 'topview', 'editar'),
      ('p43', 'topview_condiciones_agencia_crear', 'Crear condiciones de agencia', 'topview', 'crear'),
      ('p44', 'topview_condiciones_agencia_editar', 'Editar/eliminar condiciones de agencia', 'topview', 'editar'),
      ('p45', 'topview_vendedores_ver', 'Ver vendedores y su comisión por escala', 'topview', 'ver'),
      ('p46', 'topview_vendedores_crear', 'Crear vendedores y tramos de escala', 'topview', 'crear'),
      ('p47', 'topview_vendedores_editar', 'Editar/eliminar vendedores y tramos de escala', 'topview', 'editar'),
      ('p48', 'topview_netos_ver', 'Ver netos reales post-comisión en Reportes (reservado a Administrador)', 'topview', 'ver'),
      ('p49', 'liquidaciones_ver', 'Ver liquidaciones a concesionarios (reservado a Administrador)', 'topview', 'ver'),
      ('p50', 'liquidaciones_cargar', 'Cargar/editar montos de liquidaciones a concesionarios (reservado a Administrador)', 'topview', 'crear')
  `);

  // Asignar permisos a roles
  // Admin: Todos los permisos
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '1', id) as id, '1' as rol_id, id as permiso_id
    FROM permisos
  `);

  // Gerente: Casi todos excepto auditoría, usuarios, netos post-comisión,
  // comisionistas y liquidaciones a concesionarios (topview_netos_ver,
  // liquidaciones_ver/cargar y todo topview_comisionistas_* quedan
  // reservados a Administrador — de Gerente para abajo no se ve ni la
  // facturación bruta desglosada por comisionista ni cuánto se le paga a
  // cada concesionario).
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '2', id) as id, '2' as rol_id, id as permiso_id
    FROM permisos
    WHERE codigo NOT IN (
      'auditoria_ver', 'usuarios_gestionar', 'topview_netos_ver',
      'topview_comisionistas_ver', 'topview_comisionistas_crear', 'topview_comisionistas_editar',
      'liquidaciones_ver', 'liquidaciones_cargar'
    )
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
  // Incluye tesoreria_ver además: sin él, un Vendedor puede registrar un cobro
  // (permiso cobros_registrar) pero no puede ver en qué cuenta se recibe el dinero.
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '4', id) as id, '4' as rol_id, id as permiso_id
    FROM permisos
    WHERE seccion IN ('ventas', 'maestros')
    AND codigo LIKE '%clientes%' OR codigo LIKE '%facturas%' OR codigo LIKE '%presupuestos%' OR codigo LIKE '%cobros%' OR codigo = 'tesoreria_ver'
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
  // Excluye topview_comisionistas_ver y topview_vendedores_ver: datos de
  // comisiones/compensación quedan reservados a Gerente/Administrador.
  // topview_netos_ver y liquidaciones_ver quedan reservados a Administrador
  // únicamente.
  db.run(`
    INSERT OR IGNORE INTO rol_permisos (id, rol_id, permiso_id)
    SELECT printf('rp_%s_%s', '6', id) as id, '6' as rol_id, id as permiso_id
    FROM permisos
    WHERE codigo LIKE '%ver%' AND codigo NOT IN ('topview_comisionistas_ver', 'topview_vendedores_ver', 'topview_netos_ver', 'liquidaciones_ver')
  `);

  // Insertar usuario administrador por defecto (password: admin123)
  db.run(`
    INSERT OR IGNORE INTO usuarios (id, nombre, email, password, rol_id, departamento)
    VALUES ('admin1', 'Administrador', 'admin@system.local', 'YWRtaW4xMjM=', '1', 'Administración')
  `);

  // Insertar tipos de anunciantes para TOPVIEW
  db.run(`
    INSERT OR IGNORE INTO tipos_anunciantes (id, nombre, descripcion)
    VALUES
      ('1', 'Pequeños Anunciantes', 'Pequeñas empresas y emprendimientos'),
      ('2', 'Pautas Estado', 'Organismos del estado'),
      ('3', 'Pautas Anuales', 'Contratos anuales'),
      ('4', 'Pautas Mensuales', 'Contratos mensuales'),
      ('5', 'Pautas en dólares', 'Compras desde el exterior')
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

  // Producto genérico de catálogo usado para facturar órdenes de Topview:
  // la factura no detalla el desglose fino de la pauta (eso vive en
  // ordenes_publicidad_detalles), sólo esta línea genérica + el número de orden.
  db.run(`
    INSERT OR IGNORE INTO productos (id, codigo, nombre, descripcion, precio_venta, stock, habilitado, tipo)
    VALUES ('topview-serv-1', 'TOPVIEW-SERV', 'Servicios de Publicidad Exterior', 'Línea genérica de facturación para órdenes de Topview (OOH/DOOH)', 0, 0, 1, 'servicio')
  `);
  db.run(`UPDATE productos SET tipo = 'servicio' WHERE id = 'topview-serv-1' AND (tipo IS NULL OR tipo != 'servicio')`, () => {});

  // Idem para Órdenes de Producción, cuando la línea no está vinculada a un
  // soporte puntual del catálogo (facturas_detalles.producto_id es obligatorio).
  db.run(`
    INSERT OR IGNORE INTO productos (id, codigo, nombre, descripcion, precio_venta, stock, habilitado, tipo)
    VALUES ('topview-prod-1', 'TOPVIEW-PROD', 'Producción', 'Línea genérica de facturación para órdenes de producción de Topview', 0, 0, 1, 'servicio')
  `);

  // Soportes de Topview como productos reales del catálogo general (con ABM
  // en Productos), reemplazando la lista fija de tipos_productos_topview que
  // no tenía alta/edición/baja. precio_venta en 0: no se facturan por unidad,
  // van dentro del monto acordado de la orden — la cantidad es solo para
  // llevar el registro interno de la pauta (historia de venta por soporte).
  db.run(`
    INSERT OR IGNORE INTO productos (id, codigo, nombre, descripcion, precio_venta, stock, habilitado, tipo)
    VALUES
      ('soporte-1', 'SOP-PPL', 'PPLs', 'Publicidad Exterior — Pósters en puntos estratégicos', 0, 0, 1, 'fisico'),
      ('soporte-2', 'SOP-BACKLIGHT', 'Cajas Backlight', 'Iluminación — Cajas iluminadas backlight', 0, 0, 1, 'fisico'),
      ('soporte-3', 'SOP-GIGA', 'Gigantografías', 'Impresión de gran formato', 0, 0, 1, 'fisico'),
      ('soporte-4', 'SOP-LEDV', 'Pantallas LEDs Verticales', 'Digital — Pantallas LED de gran tamaño verticales', 0, 0, 1, 'fisico'),
      ('soporte-5', 'SOP-VWALL', 'Video Wall', 'Digital — Pared de video de múltiples pantallas', 0, 0, 1, 'fisico'),
      ('soporte-6', 'SOP-GRANF', 'Pantallas Gran Formato', 'Digital — Pantallas LED de formato grande', 0, 0, 1, 'fisico'),
      ('soporte-7', 'SOP-PLOTEO', 'Ploteos', 'Impresión — Adhesivos impresos', 0, 0, 1, 'fisico'),
      ('soporte-8', 'SOP-STAND', 'Stands', 'Instalación — Estructuras para ferias y eventos', 0, 0, 1, 'fisico'),
      ('soporte-9', 'SOP-VARIOS', 'Varios', 'Otros productos y servicios', 0, 0, 1, 'fisico')
  `);

  // Insertar agencias de publicidad
  db.run(`
    INSERT OR IGNORE INTO agencias (id, nombre, descripcion, contacto)
    VALUES
      ('ag1', 'TOPVIEW Argentina', 'Agencia principal TOPVIEW', 'Juan García'),
      ('ag2', 'TOPVIEW Rosario', 'Sucursal Rosario', 'María López'),
      ('ag3', 'TOPVIEW Córdoba', 'Sucursal Córdoba', 'Carlos Rodríguez')
  `);

  // Insertar comisionistas (Columna Gris)
  db.run(`
    INSERT OR IGNORE INTO intermediarios (id, nombre, tipo, descripcion, factura_formal)
    VALUES
      ('int1', 'Comisionista 1', 'Red LATAM', 'Red latinoamericana de publicidad', 1),
      ('int2', 'Comisionista 2', 'Plataforma Digital', 'Plataforma de publicidad digital', 1),
      ('int3', 'Comisionista 3', 'Persona Física', 'Representante de zona', 0),
      ('int4', 'Comisionista 4', 'Comisionista con factura', 'Cobra su comisión facturada formalmente', 1),
      ('int5', 'Comisionista 5', 'Comisionista en efectivo', 'Cobra su comisión en efectivo, sin factura', 0)
  `);
  // Renombra la nomenclatura previa ("Intermediario N") a "Comisionista N" en
  // instalaciones existentes, para que el dato coincida con el resto de la UI.
  ['1', '2', '3', '4', '5'].forEach((n) => {
    db.run(`UPDATE intermediarios SET nombre = 'Comisionista ${n}' WHERE id = 'int${n}' AND nombre = 'Intermediario ${n}'`, () => {});
  });

  // Vendedores: personal de ventas propio de Topview, distinto de los
  // comisionistas (que son terceros externos a la operación). No están
  // ligados a un usuario del sistema por ahora. Se taguean en la orden
  // (vendedor_id) y comisionan mensual por escala sobre el total vendido,
  // no por orden individual — ver escala_comisiones_vendedor.
  db.run(`
    CREATE TABLE IF NOT EXISTS vendedores (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT,
      email TEXT,
      telefono TEXT,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Instalaciones que ya crearon la tabla con "contacto" (nombre original del
  // campo, copiado sin pensar del patrón de agencias/comisionistas — que son
  // empresas, no personas): se renombra a "apellido", que tiene sentido acá.
  db.run(`ALTER TABLE vendedores RENAME COLUMN contacto TO apellido`, () => {});
  db.run(`ALTER TABLE vendedores ADD COLUMN apellido TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN vendedor_id TEXT`, () => {});
  // Baja lógica: "eliminar" una orden nunca borra el registro (tiene facturas/gastos/
  // comisiones colgando) — solo la oculta de la lista activa, igual que con comisionistas.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN habilitado BOOLEAN DEFAULT 1`, () => {});
  // Nota libre de vigencia (ej. "Diciembre" o "Noviembre (oct y nov 2.8M)") — de la planilla
  // de referencia real, no es un dato estructurado ni afecta ningún cálculo.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN vigencia_hasta_nota TEXT`, () => {});
  // El estado de la orden pasó de un pseudo-ciclo de vida (Activa/Pausada/
  // Cancelada/Finalizada) a un tracker simple de 3 pasos del proceso real con
  // Colppy (Cargada/Revisada/Facturada) — ver comentario junto a ESTADOS_ORDEN
  // en el frontend. Migra lo existente para que no queden huérfanas.
  db.run(`UPDATE ordenes_publicidad SET estado = 'Cargada' WHERE estado = 'Activa'`, () => {});
  // Cuando el estado pasa a "Facturada" (ya se facturó de verdad en Colppy),
  // acá quedan los números reales del comprobante — dato de referencia libre,
  // no genera ni valida nada, solo para tener trazabilidad hacia Colppy.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN numero_factura_colppy TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN numero_nc_colppy TEXT`, () => {});
  // Cobro de las órdenes NO registradas (facturado = false): como nunca
  // generan una factura real, nunca tocan cc_clientes/tesorería — este es
  // el único lugar donde queda si esa plata efectivamente se cobró. Para
  // las registradas esto no aplica, el cobro real se seguirá viendo en
  // cc_clientes vía las facturas de verdad.
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN cobrado BOOLEAN DEFAULT 0`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad ADD COLUMN fecha_cobro DATE`, () => {});
  // Referencia a Locaciones — reemplaza de a poco el texto libre "ubicacion".
  // Ambos campos quedan (ubicacion sigue existiendo) para no romper lo ya
  // cargado; las líneas nuevas usan locacion_id/punto_instalacion.
  db.run(`ALTER TABLE ordenes_publicidad_detalles ADD COLUMN locacion_id TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_publicidad_detalles ADD COLUMN punto_instalacion TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_produccion_detalles ADD COLUMN locacion_id TEXT`, () => {});
  db.run(`ALTER TABLE ordenes_produccion_detalles ADD COLUMN punto_instalacion TEXT`, () => {});
  // Lo que paga esa línea (soporte × cantidad en esa locación) — opcional.
  // Si se carga en al menos una línea, "Monto neto" de la orden se arma
  // solo (suma de líneas) en vez de escribirlo a mano.
  db.run(`ALTER TABLE ordenes_publicidad_detalles ADD COLUMN precio REAL DEFAULT 0`, () => {});

  // Escala de comisión de vendedores: todo-o-nada por tramo (no progresiva) —
  // según el total vendido en el mes, TODO ese total comisiona al % del tramo
  // en que cae, no por tramos parciales como IVA. hasta = NULL en el último
  // tramo (sin techo). vendedor_id NULL = escala general (default para
  // cualquier vendedor sin escala propia); cada vendedor puede tener la suya
  // con tramos y % totalmente distintos — no es una única escala compartida.
  db.run(`
    CREATE TABLE IF NOT EXISTS escala_comisiones_vendedor (
      id TEXT PRIMARY KEY,
      vendedor_id TEXT,
      desde REAL NOT NULL,
      hasta REAL,
      porcentaje REAL NOT NULL,
      habilitado BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    )
  `);
  db.run(`ALTER TABLE escala_comisiones_vendedor ADD COLUMN vendedor_id TEXT`, () => {});
  db.run(`
    INSERT OR IGNORE INTO escala_comisiones_vendedor (id, vendedor_id, desde, hasta, porcentaje)
    VALUES
      ('esc1', NULL, 1, 30000000, 2.0),
      ('esc2', NULL, 30000001, 50000000, 3.0),
      ('esc3', NULL, 50000001, NULL, 4.0)
  `);

  console.log('✓ Base de datos iniciada correctamente');
  console.log('✓ Roles creados (Admin, Gerente, Contador, Vendedor, Comprador, Operario)');
  console.log('✓ Permisos asignados por rol');
  console.log('✓ Usuario admin@system.local creado (password: admin123)');
  console.log('✓ Tipos de anunciantes TOPVIEW creados');
  console.log('✓ Productos TOPVIEW creados');
  console.log('✓ Agencias de publicidad creadas');
  console.log('✓ Intermediarios (Columna Gris) creados');
});

export default db;
