import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import db from './database';
import { VentasService } from './services/ventas';
import { TesoreriaService } from './services/tesoreria';
import { AuditoriaService } from './services/auditoria';
import { AutenticacionService } from './services/autenticacion';
import { ReportesService } from './services/reportes';
import { TopviewService } from './services/topview';
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

app.get('/api/auth/me', autenticacion, (req: RequestConUsuario, res: Response) => {
  res.json(req.usuario);
});

// ==================== RUTAS DE USUARIOS ====================

app.get('/api/usuarios', autenticacion, requierePermiso('usuarios_gestionar'), async (req, res) => {
  try {
    const usuarios = await AutenticacionService.listarUsuarios();
    res.json(usuarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', autenticacion, requierePermiso('usuarios_gestionar'), async (req, res) => {
  try {
    const usuario = await AutenticacionService.crearUsuario(req.body);
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
  const { codigo, nombre, descripcion, precio_venta, costo, stock } = req.body;
  const id = uuid();

  db.run(
    `
    INSERT INTO productos (id, codigo, nombre, descripcion, precio_venta, costo, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [id, codigo, nombre, descripcion, precio_venta, costo, stock],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('productos', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, codigo, nombre, descripcion, precio_venta, costo, stock });
    }
  );
});

// ==================== RUTAS DE CLIENTES ====================

app.get('/api/clientes', autenticacion, requierePermiso('clientes_ver'), (req: RequestConUsuario, res: Response) => {
  db.all('SELECT * FROM clientes WHERE habilitado = 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/clientes', autenticacion, requierePermiso('clientes_crear'), (req: RequestConUsuario, res: Response) => {
  const { razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva } = req.body;
  const id = uuid();

  db.run(
    `
    INSERT INTO clientes (id, razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [id, razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      AuditoriaService.registrarOperacion('clientes', 'INSERT', id, null, req.body, req.usuario?.id, req.ip);
      res.json({ id, razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva });
    }
  );
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
  db.get('SELECT * FROM facturas WHERE id = ?', [req.params.id], (err, factura) => {
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

app.put('/api/ordenes-publicidad/:id/estado', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const { nuevoEstado } = req.body;
    await TopviewService.actualizarEstado(req.params.id, nuevoEstado);
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', req.params.id, null, { estado: nuevoEstado }, req.usuario?.id, req.ip);
    res.json({ message: 'Estado actualizado' });
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

app.post('/api/ordenes-publicidad/:id/facturas', autenticacion, requierePermiso('topview_editar'), async (req: RequestConUsuario, res: Response) => {
  try {
    const facturas = await TopviewService.generarFacturasReplicadas(req.params.id);
    AuditoriaService.registrarOperacion('facturas', 'INSERT', req.params.id, null, { facturas_generadas: facturas.length }, req.usuario?.id, req.ip);
    res.json({ message: `${facturas.length} facturas generadas`, facturas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/topview', autenticacion, requierePermiso('topview_ver'), async (req: RequestConUsuario, res: Response) => {
  try {
    const reporte = await TopviewService.reporteOrdenes();
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
