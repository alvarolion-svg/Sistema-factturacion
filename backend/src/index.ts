import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import db from './database';
import { VentasService } from './services/ventas';
import { TesoreriaService } from './services/tesoreria';
import { AuditoriaService } from './services/auditoria';
import { AutenticacionService } from './services/autenticacion';
import { ReportesService } from './services/reportes';
import { TopviewService } from './services/topview';
import { ProduccionTopviewService } from './services/produccionTopview';
import { LocacionesService } from './services/locaciones';
import { LiquidacionesService } from './services/liquidaciones';
import { autenticacion, requierePermiso, RequestConUsuario } from './middleware';
import { v4 as uuid } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json());

// ==================== SUBIDA DE ARCHIVOS ====================

const UPLOADS_DIR = path.join(__dirname, '../uploads');

const TIPOS_ARCHIVO_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

const storageDocumentos = multer.diskStorage({
  destination: (req, file, cb) => {
    const ahora = new Date();
    const anio = String(ahora.getFullYear());
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const carpeta = path.join(UPLOADS_DIR, anio, mes);
    fs.mkdirSync(carpeta, { recursive: true });
    cb(null, carpeta);
  },
  filename: (req, file, cb) => {
    const nombreSeguro = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${uuid()}-${nombreSeguro}`);
  },
});

const uploadDocumento = multer({
  storage: storageDocumentos,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (TIPOS_ARCHIVO_PERMITIDOS.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Se aceptan PDF, Word, Excel e imágenes.'));
    }
  },
});

// Servir archivos estáticos HTML
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// ==================== RUTAS DE SALUD ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sistema de Facturación - Backend Running' });
});

// ==================== RUTAS DE AUTENTICACIÓN ====================

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const resultado = await AutenticacionService.login(email, password, req.ip);
    res.json(resultado);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      await AutenticacionService.logout(token);
    }
    res.json({ message: 'Logout exitoso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const usuario = await AutenticacionService.obtenerUsuarioCompleto(req.usuario.id);
    res.json(usuario);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/roles', autenticacion, requierePermiso('usuarios_gestionar'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM roles WHERE habilitado = 1 ORDER BY nivel', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/usuarios', autenticacion, requierePermiso('usuarios_gestionar'), async (req, res) => {
  try {
    const usuarios = await AutenticacionService.listarUsuarios();
    res.json(usuarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', autenticacion, requierePermiso('usuarios_gestionar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const usuario = await AutenticacionService.crearUsuario(req.body);
    AuditoriaService.registrarOperacion('usuarios', 'INSERT', usuario.id, null, usuario, req.usuario?.id, req.ip);
    res.json(usuario);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:id/rol', autenticacion, requierePermiso('usuarios_gestionar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nuevo_rol_id } = req.body;
    const usuario = await AutenticacionService.cambiarRol(req.params.id, nuevo_rol_id);
    AuditoriaService.registrarOperacion('usuarios', 'UPDATE', req.params.id, null, { rol_id: nuevo_rol_id }, req.usuario?.id, req.ip);
    res.json(usuario);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE REPORTES ====================

app.get('/api/reportes/ventas', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteVentas(req.usuario.id, req.permisos || [], req.query);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/compras', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteCompras(req.usuario.id, req.permisos || [], req.query);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/financieros', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteFinanciero(req.usuario.id, req.permisos || [], req.query);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/impositiva', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteImpositiva(req.usuario.id, req.permisos || [], req.query);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/clientes', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteClientes(req.usuario.id, req.permisos || []);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/proveedores', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteProveedores(req.usuario.id, req.permisos || []);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/auditoria', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await ReportesService.reporteAuditoria(req.usuario.id, req.permisos || [], req.query);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE PRODUCTOS ====================

app.get('/api/productos', autenticacion, requierePermiso('productos_ver'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM productos WHERE habilitado = 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/productos', autenticacion, requierePermiso('productos_crear'), (req: RequestConUsuario, res: Response) => {
  const { codigo, nombre, descripcion, precio_venta, costo, stock, tipo } = req.body;
  const id = uuid();

  db.run(
    `
    INSERT INTO productos (id, codigo, nombre, descripcion, precio_venta, costo, stock, tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [id, codigo, nombre, descripcion, precio_venta, costo, stock, tipo === 'servicio' ? 'servicio' : 'fisico'],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('productos', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, codigo, nombre, descripcion, precio_venta, costo, stock, tipo: tipo === 'servicio' ? 'servicio' : 'fisico' });
    }
  );
});

app.put('/api/productos/:id', autenticacion, requierePermiso('productos_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { codigo, nombre, descripcion, precio_venta, costo, stock, tipo } = req.body;

  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, productoAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!productoAnterior) return res.status(404).json({ error: 'Producto no encontrado' });

    const tipoFinal = tipo === 'servicio' ? 'servicio' : 'fisico';

    db.run(
      `
      UPDATE productos
      SET codigo = ?, nombre = ?, descripcion = ?, precio_venta = ?, costo = ?, stock = ?, tipo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [codigo, nombre, descripcion, precio_venta, costo, stock, tipoFinal, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('productos', 'UPDATE', id, productoAnterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, codigo, nombre, descripcion, precio_venta, costo, stock, tipo: tipoFinal });
      }
    );
  });
});

app.delete('/api/productos/:id', autenticacion, requierePermiso('productos_eliminar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;

  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, productoAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!productoAnterior) return res.status(404).json({ error: 'Producto no encontrado' });

    db.run('UPDATE productos SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('productos', 'DELETE', id, productoAnterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// ==================== RUTAS DE CLIENTES ====================

const CAMPOS_CLIENTE = [
  'razon_social',
  'nombre_fantasia',
  'cuit',
  'dni',
  'email',
  'telefono',
  'direccion',
  'ciudad',
  'codigo_postal',
  'provincia',
  'pais',
  'direccion_fiscal',
  'ciudad_fiscal',
  'codigo_postal_fiscal',
  'provincia_fiscal',
  'pais_fiscal',
  'condicion_iva',
  'condicion_pago',
  'limite_credito',
  'porcentaje_iva',
  'retencion_ganancias',
  'numero_plan_cuenta',
  'numero_cuenta_bancaria',
  'cbu',
  'banco',
  'descripcion_banco',
];

app.get('/api/clientes', autenticacion, requierePermiso('clientes_ver'), (req: RequestConUsuario, res: Response) => {
  db.all(
    `SELECT c.*, a.id as agencia_id, a.nombre as agencia_nombre
     FROM clientes c
     LEFT JOIN agencias a ON a.cliente_id = c.id
     WHERE c.habilitado = 1`,
    (err, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map((r) => ({ ...r, es_agencia: !!r.agencia_id })));
    }
  );
});

app.get('/api/clientes/:id', autenticacion, requierePermiso('clientes_ver'), (req: RequestConUsuario, res: Response) => {
  db.get('SELECT * FROM clientes WHERE id = ?', [req.params.id], (err, cliente: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    db.all('SELECT * FROM contactos_cliente WHERE cliente_id = ?', [req.params.id], (err, contactos) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT id, nombre FROM agencias WHERE cliente_id = ?', [req.params.id], (err, agencia: any) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ...cliente, contactos: contactos || [], es_agencia: !!agencia, agencia_nombre: agencia?.nombre });
      });
    });
  });
});

app.post('/api/clientes', autenticacion, requierePermiso('clientes_crear'), (req: RequestConUsuario, res: Response) => {
  const id = uuid();
  const valores = CAMPOS_CLIENTE.map((campo) => req.body[campo] ?? null);

  db.run(
    `INSERT INTO clientes (id, ${CAMPOS_CLIENTE.join(', ')}) VALUES (?, ${CAMPOS_CLIENTE.map(() => '?').join(', ')})`,
    [id, ...valores],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('clientes', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);

      const contactos: any[] = Array.isArray(req.body.contactos) ? req.body.contactos : [];
      contactos.forEach((c) => {
        db.run(
          `INSERT INTO contactos_cliente (id, cliente_id, nombre, apellido, email, rol, telefono, interno, skype)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), id, c.nombre || null, c.apellido || null, c.email || null, c.rol || null, c.telefono || null, c.interno || null, c.skype || null]
        );
      });

      res.json({ id, ...req.body });
    }
  );
});

app.put('/api/clientes/:id', autenticacion, requierePermiso('clientes_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;

  db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, clienteAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!clienteAnterior) return res.status(404).json({ error: 'Cliente no encontrado' });

    const valores = CAMPOS_CLIENTE.map((campo) => req.body[campo] ?? null);

    db.run(
      `UPDATE clientes SET ${CAMPOS_CLIENTE.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...valores, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('clientes', 'UPDATE', id, clienteAnterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.post('/api/clientes/:id/contactos', autenticacion, requierePermiso('clientes_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, apellido, email, rol, telefono, interno, skype } = req.body;
  const contactoId = uuid();

  db.run(
    `INSERT INTO contactos_cliente (id, cliente_id, nombre, apellido, email, rol, telefono, interno, skype)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contactoId, id, nombre || null, apellido || null, email || null, rol || null, telefono || null, interno || null, skype || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('contactos_cliente', 'INSERT', contactoId, null, req.body, req.usuario?.id, req.ip);
      res.json({ id: contactoId, cliente_id: id, nombre, apellido, email, rol, telefono, interno, skype });
    }
  );
});

app.delete('/api/clientes/contactos/:contactoId', autenticacion, requierePermiso('clientes_editar'), (req: RequestConUsuario, res: Response) => {
  const { contactoId } = req.params;

  db.get('SELECT * FROM contactos_cliente WHERE id = ?', [contactoId], (err, contactoAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!contactoAnterior) return res.status(404).json({ error: 'Contacto no encontrado' });

    db.run('DELETE FROM contactos_cliente WHERE id = ?', [contactoId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('contactos_cliente', 'DELETE', contactoId, contactoAnterior, null, req.usuario?.id, req.ip);
      res.json({ id: contactoId });
    });
  });
});

app.delete('/api/clientes/:id', autenticacion, requierePermiso('clientes_eliminar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;

  db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, clienteAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!clienteAnterior) return res.status(404).json({ error: 'Cliente no encontrado' });

    db.run('UPDATE clientes SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('clientes', 'DELETE', id, clienteAnterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// ==================== RUTAS DE PROVEEDORES ====================

const CAMPOS_PROVEEDOR = ['razon_social', 'cuit', 'email', 'telefono', 'direccion', 'ciudad', 'condicion_iva'];

app.get('/api/proveedores', autenticacion, requierePermiso('proveedores_ver'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM proveedores WHERE habilitado = 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/proveedores/:id', autenticacion, requierePermiso('proveedores_ver'), (req: RequestConUsuario, res: Response) => {
  db.get('SELECT * FROM proveedores WHERE id = ?', [req.params.id], (err, proveedor) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(proveedor);
  });
});

app.post('/api/proveedores', autenticacion, requierePermiso('proveedores_crear'), (req: RequestConUsuario, res: Response) => {
  const id = uuid();
  const valores = CAMPOS_PROVEEDOR.map((campo) => req.body[campo] ?? null);

  db.run(
    `INSERT INTO proveedores (id, ${CAMPOS_PROVEEDOR.join(', ')}) VALUES (?, ${CAMPOS_PROVEEDOR.map(() => '?').join(', ')})`,
    [id, ...valores],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('proveedores', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, ...req.body });
    }
  );
});

// Una misma empresa real suele ser cliente (a quien facturamos) Y proveedor
// (a quien le pagamos/le esperamos factura, ej. una agencia cobrando su
// comisión) — "atienden las dos ventanillas". En vez de re-tipear los datos,
// esto crea el proveedor con los mismos datos del cliente, o reutiliza el que
// ya exista con el mismo CUIT en vez de duplicarlo.
app.post('/api/proveedores/desde-cliente', autenticacion, requierePermiso('proveedores_crear'), (req: RequestConUsuario, res: Response) => {
  const { cliente_id } = req.body;
  if (!cliente_id) return res.status(400).json({ error: 'Falta el cliente.' });

  db.get('SELECT * FROM clientes WHERE id = ?', [cliente_id], (err, cliente: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const buscarExistente = (cb: (existente: any) => void) => {
      if (!cliente.cuit) return cb(null);
      db.get('SELECT * FROM proveedores WHERE cuit = ?', [cliente.cuit], (err, existente) => {
        if (err) return res.status(500).json({ error: err.message });
        cb(existente);
      });
    };

    buscarExistente((existente) => {
      if (existente) return res.json(existente);

      const id = uuid();
      const valores = [
        cliente.razon_social,
        cliente.cuit || null,
        cliente.email || null,
        cliente.telefono || null,
        cliente.direccion || null,
        cliente.ciudad || null,
        cliente.condicion_iva || 'Responsable Inscripto',
      ];
      db.run(
        `INSERT INTO proveedores (id, ${CAMPOS_PROVEEDOR.join(', ')}) VALUES (?, ${CAMPOS_PROVEEDOR.map(() => '?').join(', ')})`,
        [id, ...valores],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          AuditoriaService.registrarOperacion(
            'proveedores',
            'INSERT',
            id,
            null,
            { origen: 'desde_cliente', cliente_id, razon_social: cliente.razon_social },
            req.usuario?.id,
            req.ip
          );
          res.json({ id, razon_social: cliente.razon_social, cuit: cliente.cuit, email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion, ciudad: cliente.ciudad, condicion_iva: cliente.condicion_iva, habilitado: 1 });
        }
      );
    });
  });
});

app.put('/api/proveedores/:id', autenticacion, requierePermiso('proveedores_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;

  db.get('SELECT * FROM proveedores WHERE id = ?', [id], (err, proveedorAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proveedorAnterior) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const valores = CAMPOS_PROVEEDOR.map((campo) => req.body[campo] ?? null);

    db.run(
      `UPDATE proveedores SET ${CAMPOS_PROVEEDOR.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...valores, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('proveedores', 'UPDATE', id, proveedorAnterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/proveedores/:id', autenticacion, requierePermiso('proveedores_eliminar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;

  db.get('SELECT * FROM proveedores WHERE id = ?', [id], (err, proveedorAnterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proveedorAnterior) return res.status(404).json({ error: 'Proveedor no encontrado' });

    db.run('UPDATE proveedores SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('proveedores', 'DELETE', id, proveedorAnterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// ==================== RUTAS DE FACTURAS ====================

app.post('/api/facturas', autenticacion, requierePermiso('facturas_crear'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { cliente_id, fecha, tipo_comprobante, detalles, validar_arca } = req.body;
    const factura = await VentasService.crearFactura(
      cliente_id,
      fecha,
      tipo_comprobante,
      detalles,
      validar_arca || false
    );
    AuditoriaService.registrarOperacion('facturas', 'INSERT', factura.id, null, factura, req.usuario?.id, req.ip);
    res.json(factura);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/facturas/:id', autenticacion, requierePermiso('facturas_ver'), (req: RequestConUsuario, res: Response) => {
  db.get('SELECT * FROM facturas WHERE id = ?', [req.params.id], (err, factura: any) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(
      `
      SELECT fd.*, p.nombre as producto_nombre
      FROM facturas_detalles fd
      JOIN productos p ON fd.producto_id = p.id
      WHERE fd.factura_id = ?
    `,
      [req.params.id],
      (err, detalles) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ...factura, detalles });
      }
    );
  });
});

app.get('/api/facturas', autenticacion, requierePermiso('facturas_ver'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM facturas ORDER BY fecha DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ==================== RUTAS DE COBROS ====================

app.post('/api/cobros', autenticacion, requierePermiso('cobros_registrar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { factura_id, monto, cuenta_banco_id } = req.body;
    const result = await VentasService.registrarCobro(factura_id, monto, cuenta_banco_id);
    AuditoriaService.registrarOperacion('cobros', 'INSERT', factura_id, null, { monto, cuenta_banco_id }, req.usuario?.id, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE NOTAS DE CRÉDITO ====================

app.post('/api/notas-credito', autenticacion, requierePermiso('notas_credito_crear'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { factura_id, motivo } = req.body;
    const nc = await VentasService.crearNotaCredito(factura_id, motivo);
    AuditoriaService.registrarOperacion('notas_credito', 'INSERT', nc.id, null, nc, req.usuario?.id, req.ip);
    res.json(nc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE TESORERÍA ====================

app.get('/api/tesoreria/estado', autenticacion, requierePermiso('tesoreria_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const estado = await TesoreriaService.obtenerEstadoTesoreria();
    res.json(estado);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cuentas', autenticacion, requierePermiso('cuentas_crear'), (req: RequestConUsuario, res: Response) => {
  const { nombre, tipo, moneda } = req.body;
  const id = uuid();

  db.run(
    `
    INSERT INTO cuentas (id, nombre, tipo, moneda)
    VALUES (?, ?, ?, ?)
  `,
    [id, nombre, tipo, moneda],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('cuentas', 'INSERT', id, null, { nombre, tipo, moneda }, req.usuario?.id, req.ip);
      res.json({ id, nombre, tipo, moneda, saldo: 0 });
    }
  );
});

// ==================== RUTAS DE AUDITORÍA ====================

app.get('/api/auditoria/:tabla/:id', autenticacion, requierePermiso('auditoria_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { tabla, id } = req.params;
    const historial = await AuditoriaService.obtenerHistorial(tabla, id);
    res.json(historial);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE TOPVIEW - ÓRDENES DE PUBLICIDAD ====================

app.post('/api/ordenes-publicidad', autenticacion, requierePermiso('topview_crear'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await TopviewService.crearOrden(req.body);
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'INSERT', orden.id, null, orden, req.usuario?.id, req.ip);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-publicidad/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await TopviewService.actualizarOrden(req.params.id, req.body);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ordenes-publicidad/:id', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await TopviewService.obtenerOrden(req.params.id);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ordenes-publicidad', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const filtros = {
      tipo_anunciante: req.query.tipo_anunciante as string,
      estado: req.query.estado as string,
      fecha_desde: req.query.fecha_desde as string,
      fecha_hasta: req.query.fecha_hasta as string,
    };
    const ordenes = await TopviewService.listarOrdenes(filtros);
    res.json(ordenes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ordenes-publicidad/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await TopviewService.eliminarOrden(req.params.id);
    res.json({ message: 'Orden eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ordenes-produccion', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const ordenes = await ProduccionTopviewService.listarOrdenesProduccion();
    res.json(ordenes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ordenes-produccion/:id', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await ProduccionTopviewService.obtenerOrdenProduccion(req.params.id);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ordenes-produccion', autenticacion, requierePermiso('topview_crear'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await ProduccionTopviewService.crearOrdenProduccion(req.body);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-produccion/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const orden = await ProduccionTopviewService.actualizarOrdenProduccion(req.params.id, req.body);
    res.json(orden);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ordenes-produccion/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await ProduccionTopviewService.eliminarOrdenProduccion(req.params.id);
    res.json({ message: 'Orden de producción eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ordenes-produccion/:id/facturar', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const facturaId = await ProduccionTopviewService.generarFactura(req.params.id);
    res.json({ message: 'Factura generada', factura_id: facturaId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-produccion/:id/estado', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nuevoEstado } = req.body;
    await ProduccionTopviewService.actualizarEstado(req.params.id, nuevoEstado);
    res.json({ message: 'Estado actualizado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-produccion/:id/facturacion-colppy', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { numero_factura_colppy, numero_nc_colppy } = req.body;
    await ProduccionTopviewService.actualizarFacturacionColppy(req.params.id, { numero_factura_colppy, numero_nc_colppy });
    res.json({ message: 'Datos de Colppy actualizados' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-publicidad/:id/estado', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nuevoEstado, numero_factura_colppy, numero_nc_colppy } = req.body;
    await TopviewService.actualizarEstado(req.params.id, nuevoEstado, { numero_factura_colppy, numero_nc_colppy });
    res.json({ message: 'Estado actualizado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-publicidad/:id/facturacion-colppy', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { numero_factura_colppy, numero_nc_colppy } = req.body;
    await TopviewService.actualizarFacturacionColppy(req.params.id, { numero_factura_colppy, numero_nc_colppy });
    res.json({ message: 'Datos de Colppy actualizados' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Locaciones
app.get('/api/locaciones', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.listarLocaciones());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/locaciones/:id', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.obtenerLocacion(req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locaciones', autenticacion, requierePermiso('topview_crear'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.crearLocacion(req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locaciones/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.actualizarLocacion(req.params.id, req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locaciones/:id', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await LocacionesService.eliminarLocacion(req.params.id);
    res.json({ message: 'Locación eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locaciones/:id/soportes', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.agregarSoporte(req.params.id, req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locaciones/soportes/:capacidadId', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    res.json(await LocacionesService.actualizarSoporte(req.params.capacidadId, req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locaciones/soportes/:capacidadId', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await LocacionesService.eliminarSoporte(req.params.capacidadId);
    res.json({ message: 'Soporte eliminado de la locación' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ordenes-publicidad/:id/cobro', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { cobrado, fecha_cobro } = req.body;
    await TopviewService.actualizarCobro(req.params.id, !!cobrado, fecha_cobro);
    res.json({ message: 'Cobro actualizado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ordenes-publicidad/:id/documentos', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nombreArchivo, tipoArchivo, urlDrive, descripcion } = req.body;
    const documento = await TopviewService.adjuntarDocumento(
      req.params.id,
      nombreArchivo,
      tipoArchivo,
      urlDrive,
      descripcion
    );
    res.json(documento);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post(
  '/api/ordenes-publicidad/:id/documentos/subir',
  autenticacion,
  requierePermiso('topview_editar'),
  (req: RequestConUsuario, res: Response, next: NextFunction) => {
    uploadDocumento.single('archivo')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req: RequestConUsuario, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

      const rutaRelativa = path.relative(UPLOADS_DIR, req.file.path);
      const documento = await TopviewService.adjuntarDocumento(
        req.params.id,
        req.file.originalname,
        req.file.mimetype,
        undefined,
        (req.body as any).descripcion,
        rutaRelativa,
        req.usuario?.id,
        req.ip
      );
      res.json(documento);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/api/ordenes-publicidad/documentos/:docId/descargar',
  autenticacion,
  requierePermiso('topview_ver'),
  (req: RequestConUsuario, res: Response) => {
    db.get('SELECT * FROM documentos_adjuntos WHERE id = ?', [req.params.docId], (err, doc: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      if (!doc.ruta_archivo) return res.status(404).json({ error: 'Este documento no tiene un archivo cargado.' });

      const rutaCompleta = path.join(UPLOADS_DIR, doc.ruta_archivo);
      res.download(rutaCompleta, doc.nombre_archivo, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'No se pudo encontrar el archivo.' });
      });
    });
  }
);

app.post('/api/ordenes-publicidad/:id/facturas', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const facturas = await TopviewService.generarFacturasReplicadas(req.params.id);
    AuditoriaService.registrarOperacion('facturas', 'INSERT', req.params.id, null, { facturas_generadas: facturas.length }, req.usuario?.id, req.ip);
    res.json({ message: `${facturas.length} facturas generadas`, facturas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/topview/tipos-anunciantes', autenticacion, (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM tipos_anunciantes WHERE habilitado = 1 ORDER BY id', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/topview/agencias', autenticacion, async (req: RequestConUsuario, res: Response) => {
  try {
    const agencias = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM agencias WHERE habilitado = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(agencias);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/topview/intermediarios', autenticacion, requierePermiso('topview_comisionistas_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const intermediarios = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM intermediarios WHERE habilitado = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(intermediarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/topview/intermediarios/reporte', autenticacion, requierePermiso('topview_comisionistas_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    // Trae el detalle orden por orden (no pre-agregado) para que el
    // frontend pueda filtrar por mes/año/tipo y mostrar qué clientes
    // conforman cada comisión — un comisionista sin ninguna orden en el
    // período elegido igual aparece, con `ordenes: []`.
    const filas: any[] = await new Promise((resolve, reject) => {
      db.all(
        `
        SELECT
          i.id as intermediario_id, i.nombre as intermediario_nombre, i.tipo as intermediario_tipo,
          oi.orden_id, oi.monto_comision, oi.factura_formal,
          o.numero_orden, o.numero_orden_agencia, o.nombre_anunciante, o.mes_ingreso, o.ano_ingreso
        FROM intermediarios i
        LEFT JOIN ordenes_intermediarios oi ON oi.intermediario_id = i.id
        LEFT JOIN ordenes_publicidad o ON o.id = oi.orden_id AND (o.habilitado != 0 OR o.habilitado IS NULL)
        WHERE i.habilitado = 1
        ORDER BY i.nombre
      `,
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    const porIntermediario = new Map<string, any>();
    for (const f of filas) {
      if (!porIntermediario.has(f.intermediario_id)) {
        porIntermediario.set(f.intermediario_id, {
          id: f.intermediario_id,
          nombre: f.intermediario_nombre,
          tipo: f.intermediario_tipo,
          ordenes: [] as any[],
        });
      }
      if (f.orden_id && f.numero_orden) {
        porIntermediario.get(f.intermediario_id).ordenes.push({
          orden_id: f.orden_id,
          numero_orden: f.numero_orden,
          numero_orden_agencia: f.numero_orden_agencia,
          nombre_anunciante: f.nombre_anunciante,
          monto_comision: f.monto_comision,
          factura_formal: !!f.factura_formal,
          mes_ingreso: f.mes_ingreso,
          ano_ingreso: f.ano_ingreso,
        });
      }
    }

    res.json(Array.from(porIntermediario.values()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/liquidaciones/concesionarios', autenticacion, requierePermiso('liquidaciones_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const concesionarios = await LiquidacionesService.listarConcesionarios();
    res.json(concesionarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/liquidaciones', autenticacion, requierePermiso('liquidaciones_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { concesionario_id, mes, ano } = req.query;
    if (!concesionario_id || !mes || !ano) {
      return res.status(400).json({ error: 'Faltan concesionario_id, mes o año.' });
    }
    const filas = await LiquidacionesService.listarPeriodo(String(concesionario_id), Number(mes), Number(ano));
    const manuales = await LiquidacionesService.listarManuales(String(concesionario_id), Number(mes), Number(ano));
    const condicion = await LiquidacionesService.obtenerCondicion(String(concesionario_id));

    // Una liquidación real separa Publicidad de Stand, cada una con su
    // propio declarado y su propio Canon (visto en una liquidación real:
    // "TOTAL CANON PUBLICIDAD" y "TOTAL CANON STAND" por separado, sumados
    // en un "TOTAL FINAL"). Las líneas manuales no tienen sección propia —
    // van a Publicidad por default.
    const declaradoPublicidad =
      filas.filter((f) => !f.excluida && f.seccion === 'publicidad').reduce((s, f) => s + (Number(f.monto) || 0), 0) +
      manuales.reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const declaradoStand = filas
      .filter((f) => !f.excluida && f.seccion === 'stand')
      .reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const canonPublicidad = declaradoPublicidad * (condicion.porcentajeComision / 100);
    const canonStand = declaradoStand * (condicion.porcentajeComision / 100);
    const secciones = {
      publicidad: { declarado: declaradoPublicidad, canon: canonPublicidad },
      stand: { declarado: declaradoStand, canon: canonStand },
    };

    const totalDeclarado = declaradoPublicidad + declaradoStand;
    const totalFinal = canonPublicidad + canonStand;
    const ivaMonto = totalFinal * (condicion.ivaPorcentaje / 100);
    const percepcionesCalculadas = condicion.percepciones.map((p) => ({
      nombre: p.nombre,
      porcentaje: p.porcentaje,
      monto: totalFinal * (p.porcentaje / 100),
    }));
    const totalAPagar = totalFinal + ivaMonto + percepcionesCalculadas.reduce((s, p) => s + p.monto, 0);

    res.json({
      filas,
      manuales,
      porcentaje_comision: condicion.porcentajeComision,
      total_declarado: totalDeclarado,
      total: totalFinal,
      secciones,
      iva_porcentaje: condicion.ivaPorcentaje,
      iva_monto: ivaMonto,
      percepciones: percepcionesCalculadas,
      total_a_pagar: totalAPagar,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/liquidaciones/condiciones', autenticacion, requierePermiso('liquidaciones_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const condiciones = await LiquidacionesService.listarCondiciones();
    res.json(condiciones);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/condiciones/:concesionarioId', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { porcentaje_comision, iva_porcentaje, notas } = req.body;
    if (porcentaje_comision === undefined) {
      return res.status(400).json({ error: 'Falta porcentaje_comision.' });
    }
    await LiquidacionesService.guardarCondicion(
      req.params.concesionarioId,
      Number(porcentaje_comision),
      iva_porcentaje === undefined ? 21 : Number(iva_porcentaje),
      notas
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/liquidaciones/condiciones/:concesionarioId/percepciones', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nombre, porcentaje } = req.body;
    const percepcion = await LiquidacionesService.agregarPercepcion(req.params.concesionarioId, nombre, Number(porcentaje) || 0);
    res.json(percepcion);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/condiciones/percepciones/:id', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nombre, porcentaje } = req.body;
    const percepcion = await LiquidacionesService.actualizarPercepcion(req.params.id, nombre, Number(porcentaje) || 0);
    res.json(percepcion);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/liquidaciones/condiciones/percepciones/:id', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await LiquidacionesService.eliminarPercepcion(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/:ordenDetalleId/estado-especial', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { mes, ano, estado_especial } = req.body;
    if (!mes || !ano) {
      return res.status(400).json({ error: 'Faltan mes o año.' });
    }
    if (estado_especial !== null && estado_especial !== 'sin_cargo' && estado_especial !== 'canje') {
      return res.status(400).json({ error: 'estado_especial tiene que ser sin_cargo, canje o null.' });
    }
    await LiquidacionesService.marcarEstadoEspecial(req.params.ordenDetalleId, Number(mes), Number(ano), estado_especial);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/:ordenDetalleId', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { mes, ano, monto } = req.body;
    if (!mes || !ano || monto === undefined) {
      return res.status(400).json({ error: 'Faltan mes, año o monto.' });
    }
    await LiquidacionesService.guardarMonto(req.params.ordenDetalleId, Number(mes), Number(ano), Number(monto));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/:ordenDetalleId/exclusion', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { mes, ano, excluida } = req.body;
    if (!mes || !ano || excluida === undefined) {
      return res.status(400).json({ error: 'Faltan mes, año o excluida.' });
    }
    await LiquidacionesService.marcarExclusion(req.params.ordenDetalleId, Number(mes), Number(ano), !!excluida);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/liquidaciones/manual', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { concesionario_id, mes, ano, descripcion, monto } = req.body;
    if (!concesionario_id || !mes || !ano) {
      return res.status(400).json({ error: 'Faltan concesionario_id, mes o año.' });
    }
    const linea = await LiquidacionesService.agregarLineaManual({
      concesionario_id,
      mes: Number(mes),
      ano: Number(ano),
      descripcion,
      monto: Number(monto) || 0,
    });
    res.json(linea);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/liquidaciones/manual/:id', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { descripcion, monto } = req.body;
    const linea = await LiquidacionesService.actualizarLineaManual(req.params.id, { descripcion, monto: Number(monto) || 0 });
    res.json(linea);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/liquidaciones/manual/:id', autenticacion, requierePermiso('liquidaciones_cargar'), async (req: RequestConUsuario, res: Response) => {
  try {
    await LiquidacionesService.eliminarLineaManual(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/topview/agencias', autenticacion, requierePermiso('topview_crear'), (req: RequestConUsuario, res: Response) => {
  const { nombre, descripcion, contacto, email, telefono, proveedor_id, cliente_id } = req.body;
  const id = uuid();

  db.run(
    `INSERT INTO agencias (id, nombre, descripcion, contacto, email, telefono, proveedor_id, cliente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre, descripcion || null, contacto || null, email || null, telefono || null, proveedor_id || null, cliente_id || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('agencias', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, nombre, descripcion, contacto, email, telefono, proveedor_id, cliente_id });
    }
  );
});

app.put('/api/topview/agencias/:id', autenticacion, requierePermiso('topview_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, descripcion, contacto, email, telefono, proveedor_id, cliente_id } = req.body;

  db.get('SELECT * FROM agencias WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Agencia no encontrada' });

    db.run(
      `UPDATE agencias SET nombre = ?, descripcion = ?, contacto = ?, email = ?, telefono = ?, proveedor_id = ?, cliente_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nombre, descripcion || null, contacto || null, email || null, telefono || null, proveedor_id || null, cliente_id || null, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('agencias', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.post('/api/topview/intermediarios', autenticacion, requierePermiso('topview_comisionistas_crear'), (req: RequestConUsuario, res: Response) => {
  const { nombre, tipo, descripcion, contacto, email, telefono, factura_formal, proveedor_id } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const id = uuid();

  db.run(
    `INSERT INTO intermediarios (id, nombre, tipo, descripcion, contacto, email, telefono, factura_formal, proveedor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre, tipo || '', descripcion || null, contacto || null, email || null, telefono || null, factura_formal ? 1 : 0, proveedor_id || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('intermediarios', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, nombre, tipo, descripcion, contacto, email, telefono, factura_formal: !!factura_formal, proveedor_id });
    }
  );
});

app.put('/api/topview/intermediarios/:id', autenticacion, requierePermiso('topview_comisionistas_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, tipo, descripcion, contacto, email, telefono, factura_formal, proveedor_id } = req.body;

  db.get('SELECT * FROM intermediarios WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Comisionista no encontrado' });

    db.run(
      `UPDATE intermediarios SET nombre = ?, tipo = ?, descripcion = ?, contacto = ?, email = ?, telefono = ?, factura_formal = ?, proveedor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nombre, tipo || '', descripcion || null, contacto || null, email || null, telefono || null, factura_formal ? 1 : 0, proveedor_id || null, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('intermediarios', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/topview/intermediarios/:id', autenticacion, requierePermiso('topview_comisionistas_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  db.get('SELECT * FROM intermediarios WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Comisionista no encontrado' });
    db.run('UPDATE intermediarios SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('intermediarios', 'DELETE', id, anterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// ==================== CONDICIONES DE DESCUENTO (agencia / comisionista) ====================

app.get('/api/topview/condiciones-agencia', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  const { agencia_id } = req.query;
  let query = 'SELECT * FROM condiciones_agencia WHERE habilitado = 1';
  const params: any[] = [];
  if (agencia_id) {
    query += ' AND agencia_id = ?';
    params.push(agencia_id);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/topview/condiciones-agencia', autenticacion, requierePermiso('topview_condiciones_agencia_crear'), (req: RequestConUsuario, res: Response) => {
  const { agencia_id, nombre, porcentaje_nc, porcentaje_factura, factura_en_cascada } = req.body;
  if (!agencia_id || !nombre) return res.status(400).json({ error: 'Elegí una agencia y un nombre para la condición.' });
  const id = uuid();

  db.run(
    `INSERT INTO condiciones_agencia (id, agencia_id, nombre, porcentaje_nc, porcentaje_factura, factura_en_cascada)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, agencia_id, nombre, porcentaje_nc || 0, porcentaje_factura || 0, factura_en_cascada ? 1 : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('condiciones_agencia', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, ...req.body });
    }
  );
});

app.put('/api/topview/condiciones-agencia/:id', autenticacion, requierePermiso('topview_condiciones_agencia_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, porcentaje_nc, porcentaje_factura, factura_en_cascada } = req.body;

  db.get('SELECT * FROM condiciones_agencia WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Condición no encontrada' });

    db.run(
      `UPDATE condiciones_agencia SET nombre = ?, porcentaje_nc = ?, porcentaje_factura = ?, factura_en_cascada = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nombre, porcentaje_nc || 0, porcentaje_factura || 0, factura_en_cascada ? 1 : 0, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('condiciones_agencia', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/topview/condiciones-agencia/:id', autenticacion, requierePermiso('topview_condiciones_agencia_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  db.get('SELECT * FROM condiciones_agencia WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Condición no encontrada' });
    db.run('UPDATE condiciones_agencia SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('condiciones_agencia', 'DELETE', id, anterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

app.get('/api/topview/condiciones-intermediario', autenticacion, requierePermiso('topview_comisionistas_ver'), async (req: RequestConUsuario, res: Response) => {
  const { intermediario_id } = req.query;
  let query = 'SELECT * FROM condiciones_intermediario WHERE habilitado = 1';
  const params: any[] = [];
  if (intermediario_id) {
    query += ' AND intermediario_id = ?';
    params.push(intermediario_id);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/topview/condiciones-intermediario', autenticacion, requierePermiso('topview_comisionistas_crear'), (req: RequestConUsuario, res: Response) => {
  const { intermediario_id, nombre, porcentaje_comision, tipo_calculo, factura_formal } = req.body;
  if (!intermediario_id || !nombre) return res.status(400).json({ error: 'Elegí un comisionista y un nombre para la condición.' });
  const id = uuid();

  db.run(
    `INSERT INTO condiciones_intermediario (id, intermediario_id, nombre, porcentaje_comision, tipo_calculo, factura_formal)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, intermediario_id, nombre, porcentaje_comision || 0, tipo_calculo || 'cascada', factura_formal ? 1 : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('condiciones_intermediario', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, ...req.body });
    }
  );
});

app.put('/api/topview/condiciones-intermediario/:id', autenticacion, requierePermiso('topview_comisionistas_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, porcentaje_comision, tipo_calculo, factura_formal } = req.body;

  db.get('SELECT * FROM condiciones_intermediario WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Condición no encontrada' });

    db.run(
      `UPDATE condiciones_intermediario SET nombre = ?, porcentaje_comision = ?, tipo_calculo = ?, factura_formal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nombre, porcentaje_comision || 0, tipo_calculo || 'cascada', factura_formal ? 1 : 0, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('condiciones_intermediario', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/topview/condiciones-intermediario/:id', autenticacion, requierePermiso('topview_comisionistas_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  db.get('SELECT * FROM condiciones_intermediario WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Condición no encontrada' });
    db.run('UPDATE condiciones_intermediario SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('condiciones_intermediario', 'DELETE', id, anterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// ==================== RUTAS DE VENDEDORES ====================
// Personal de ventas propio de Topview (distinto de los comisionistas,
// externos). Comisionan mensual por escala sobre el total vendido, no por
// orden — ver /api/topview/vendedores/reporte.

app.get('/api/topview/vendedores', autenticacion, requierePermiso('topview_vendedores_ver'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM vendedores WHERE habilitado = 1 ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/topview/vendedores', autenticacion, requierePermiso('topview_vendedores_crear'), (req: RequestConUsuario, res: Response) => {
  const { nombre, apellido, email, telefono } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const id = uuid();
  db.run(
    `INSERT INTO vendedores (id, nombre, apellido, email, telefono) VALUES (?, ?, ?, ?, ?)`,
    [id, nombre, apellido || null, email || null, telefono || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('vendedores', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, nombre, apellido, email, telefono });
    }
  );
});

app.put('/api/topview/vendedores/:id', autenticacion, requierePermiso('topview_vendedores_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { nombre, apellido, email, telefono } = req.body;
  db.get('SELECT * FROM vendedores WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Vendedor no encontrado' });
    db.run(
      `UPDATE vendedores SET nombre = ?, apellido = ?, email = ?, telefono = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nombre, apellido || null, email || null, telefono || null, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('vendedores', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/topview/vendedores/:id', autenticacion, requierePermiso('topview_vendedores_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  db.get('SELECT * FROM vendedores WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Vendedor no encontrado' });
    db.run('UPDATE vendedores SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('vendedores', 'DELETE', id, anterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

app.get('/api/topview/escala-comisiones-vendedor', autenticacion, requierePermiso('topview_vendedores_ver'), (req: RequestConUsuario, res: Response) => {
  db.all(
    `SELECT e.*, v.nombre as vendedor_nombre
     FROM escala_comisiones_vendedor e
     LEFT JOIN vendedores v ON v.id = e.vendedor_id
     WHERE e.habilitado = 1
     ORDER BY (e.vendedor_id IS NULL) DESC, v.nombre, e.desde ASC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/topview/escala-comisiones-vendedor', autenticacion, requierePermiso('topview_vendedores_crear'), (req: RequestConUsuario, res: Response) => {
  const { vendedor_id, desde, hasta, porcentaje } = req.body;
  if (desde === undefined || desde === null || !porcentaje) {
    return res.status(400).json({ error: 'Completá el desde y el porcentaje del tramo.' });
  }
  const id = uuid();
  db.run(
    `INSERT INTO escala_comisiones_vendedor (id, vendedor_id, desde, hasta, porcentaje) VALUES (?, ?, ?, ?, ?)`,
    [id, vendedor_id || null, desde, hasta || null, porcentaje],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('escala_comisiones_vendedor', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, vendedor_id, desde, hasta, porcentaje });
    }
  );
});

app.put('/api/topview/escala-comisiones-vendedor/:id', autenticacion, requierePermiso('topview_vendedores_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { vendedor_id, desde, hasta, porcentaje } = req.body;
  db.get('SELECT * FROM escala_comisiones_vendedor WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Tramo no encontrado' });
    db.run(
      `UPDATE escala_comisiones_vendedor SET vendedor_id = ?, desde = ?, hasta = ?, porcentaje = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [vendedor_id || null, desde, hasta || null, porcentaje, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('escala_comisiones_vendedor', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

app.delete('/api/topview/escala-comisiones-vendedor/:id', autenticacion, requierePermiso('topview_vendedores_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  db.get('SELECT * FROM escala_comisiones_vendedor WHERE id = ?', [id], (err, anterior) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Tramo no encontrado' });
    db.run('UPDATE escala_comisiones_vendedor SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('escala_comisiones_vendedor', 'DELETE', id, anterior, null, req.usuario?.id, req.ip);
      res.json({ id });
    });
  });
});

// Reporte mensual: cuánto le corresponde a cada vendedor por su escala.
// Base = suma de monto_final (ya neto de NC/FC y comisiones a comisionistas)
// menos los arreglos no registrables (confidenciales) de sus órdenes, de las
// órdenes asignadas a ese mes/año comercial (mes_ingreso/ano_ingreso). Todo
// el total del mes comisiona al % del tramo en que cae (no progresivo).
app.get('/api/topview/vendedores/reporte', autenticacion, requierePermiso('topview_vendedores_ver'), async (req: RequestConUsuario, res: Response) => {
  const mes = Number(req.query.mes);
  const ano = Number(req.query.ano);
  if (!mes || !ano) return res.status(400).json({ error: 'Indicá mes y año.' });

  try {
    const ordenes: any[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT o.id, o.vendedor_id, o.monto_final,
                COALESCE((SELECT SUM(a.monto) FROM arreglos_no_registrables a WHERE a.orden_id = o.id), 0) as arreglos_monto
         FROM ordenes_publicidad o
         WHERE o.mes_ingreso = ? AND o.ano_ingreso = ? AND o.vendedor_id IS NOT NULL`,
        [mes, ano],
        (err, rows) => (err ? reject(err) : resolve(rows as any[]))
      );
    });

    const vendedores: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM vendedores WHERE habilitado = 1 ORDER BY nombre', (err, rows) => (err ? reject(err) : resolve(rows as any[])));
    });

    const escala: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM escala_comisiones_vendedor WHERE habilitado = 1 ORDER BY desde ASC', (err, rows) =>
        err ? reject(err) : resolve(rows as any[])
      );
    });
    const escalaGeneral = escala.filter((t) => !t.vendedor_id);

    const tramoPara = (base: number, vendedorId: string) => {
      const escalaPropia = escala.filter((t) => t.vendedor_id === vendedorId);
      const tramos = escalaPropia.length > 0 ? escalaPropia : escalaGeneral;
      return tramos.find((t) => base >= t.desde && (t.hasta === null || base <= t.hasta)) || null;
    };

    const reporte = vendedores.map((v) => {
      const ordenesVendedor = ordenes.filter((o) => o.vendedor_id === v.id);
      const baseComision = ordenesVendedor.reduce(
        (acc, o) => acc + (o.monto_final - o.arreglos_monto),
        0
      );
      const tramo = tramoPara(baseComision, v.id);
      const comision = tramo ? baseComision * (tramo.porcentaje / 100) : 0;
      return {
        vendedor_id: v.id,
        vendedor_nombre: v.nombre,
        cantidad_ordenes: ordenesVendedor.length,
        base_comision: baseComision,
        porcentaje_aplicado: tramo ? tramo.porcentaje : 0,
        comision,
      };
    });

    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE GASTOS ====================
// Facturas de agencias/comisionistas que Topview espera recibir (ver
// condiciones_agencia / intermediarios.factura_formal). Cierre de ejercicio: 31/12.

app.get('/api/gastos', autenticacion, requierePermiso('gastos_ver'), (req: RequestConUsuario, res: Response) => {
  db.all(
    `SELECT g.*, p.razon_social as proveedor_nombre
     FROM gastos g
     LEFT JOIN proveedores p ON p.id = g.proveedor_id
     ORDER BY g.fecha ASC`,
    (err, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });

      // g.fecha es "YYYY-MM-DD": se parsean los componentes a mano en vez de
      // `new Date(string)`, que interpreta la fecha como UTC y puede correr un
      // día para atrás según el huso horario del servidor — justo el tipo de
      // error que puede hacer fallar la detección del cruce 31/12 → 1/1.
      const hoy = new Date();
      const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      const anoActual = hoy.getFullYear();
      const enriquecidos = (rows || []).map((g) => {
        const [anoFecha, mesFecha, diaFecha] = g.fecha.split('-').map(Number);
        const fechaLocal = new Date(anoFecha, mesFecha - 1, diaFecha);
        const diasPendiente =
          g.estado === 'Pendiente' ? Math.floor((hoyLocal.getTime() - fechaLocal.getTime()) / 86400000) : 0;
        const cruzaEjercicio = g.estado === 'Pendiente' && anoFecha < anoActual;
        return { ...g, dias_pendiente: diasPendiente, cruza_ejercicio: cruzaEjercicio };
      });
      res.json(enriquecidos);
    }
  );
});

app.get('/api/gastos/:id', autenticacion, requierePermiso('gastos_ver'), (req: RequestConUsuario, res: Response) => {
  db.get(
    `SELECT g.*, p.razon_social as proveedor_nombre
     FROM gastos g
     LEFT JOIN proveedores p ON p.id = g.proveedor_id
     WHERE g.id = ?`,
    [req.params.id],
    (err, gasto: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
      res.json(gasto);
    }
  );
});

app.put('/api/gastos/:id', autenticacion, requierePermiso('gastos_editar'), (req: RequestConUsuario, res: Response) => {
  const { id } = req.params;
  const { estado, descripcion } = req.body;

  db.get('SELECT * FROM gastos WHERE id = ?', [id], (err, anterior: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!anterior) return res.status(404).json({ error: 'Gasto no encontrado' });

    db.run(
      'UPDATE gastos SET estado = ?, descripcion = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [estado || anterior.estado, descripcion ?? anterior.descripcion, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        AuditoriaService.registrarOperacion('gastos', 'UPDATE', id, anterior, req.body, req.usuario?.id, req.ip);
        res.json({ id, ...req.body });
      }
    );
  });
});

// Comisiones en efectivo: circuito paralelo a gastos para comisionistas sin
// factura formal (ver comentario en database.ts). No es fiscal — sólo un
// pendiente/pagado por comisionista/orden/mes, con el dato de si ya se cobró
// la factura del cliente de ese mismo período para poder decidir si pagar.
app.get('/api/comisiones-efectivo', autenticacion, requierePermiso('topview_comisionistas_ver'), (req: RequestConUsuario, res: Response) => {
  const { pagado } = req.query;
  let query = `
    SELECT
      ce.*,
      i.nombre as intermediario_nombre,
      o.numero_orden,
      f.numero as factura_numero,
      f.estado as factura_estado,
      f.saldo as factura_saldo
    FROM comisiones_efectivo ce
    JOIN intermediarios i ON i.id = ce.intermediario_id
    JOIN ordenes_publicidad o ON o.id = ce.orden_id
    LEFT JOIN facturas f ON f.id = ce.factura_id
  `;
  const params: any[] = [];
  if (pagado === '0' || pagado === '1') {
    query += ' WHERE ce.pagado = ?';
    params.push(pagado);
  }
  query += ' ORDER BY ce.ano DESC, ce.numero_mes DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/comisiones-efectivo/pagar', autenticacion, requierePermiso('topview_comisionistas_editar'), (req: RequestConUsuario, res: Response) => {
  const { ids, fecha_pago } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Elegí al menos una comisión para marcar como pagada.' });
  }
  const fecha = fecha_pago || new Date().toISOString().split('T')[0];

  const placeholders = ids.map(() => '?').join(',');
  db.run(
    `UPDATE comisiones_efectivo SET pagado = 1, fecha_pago = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
    [fecha, ...ids],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('comisiones_efectivo', 'UPDATE', ids.join(','), null, { pagado: true, fecha_pago: fecha }, req.usuario?.id, req.ip);
      res.json({ actualizados: this.changes, fecha_pago: fecha });
    }
  );
});

app.get('/api/reportes/topview', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const incluirNetos = !!req.permisos?.includes('topview_netos_ver');
    const reporte = await TopviewService.reporteOrdenes(incluirNetos);
    res.json(reporte);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ERROR HANDLING ====================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Sistema de Facturación - Backend     ║
╚════════════════════════════════════════╝

✓ Server running on http://localhost:${PORT}
✓ Environment: ${process.env.NODE_ENV || 'development'}
✓ Database: facturacion.db (SQLite)
✓ CORS enabled from: ${process.env.CORS_ORIGIN || '*'}
  `);
});
