import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import db from './database';
import { VentasService } from './services/ventas';
import { TesoreriaService } from './services/tesoreria';
import { AuditoriaService } from './services/auditoria';
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

// ==================== RUTAS DE PRODUCTOS ====================

app.get('/api/productos', (req, res) => {
  db.all('SELECT * FROM productos WHERE habilitado = 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/productos', (req, res) => {
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
      AuditoriaService.registrarOperacion('productos', 'INSERT', id, null, req.body);
      res.json({ id, codigo, nombre, descripcion, precio_venta, costo, stock });
    }
  );
});

// ==================== RUTAS DE CLIENTES ====================

app.get('/api/clientes', (req, res) => {
  db.all('SELECT * FROM clientes WHERE habilitado = 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/clientes', (req, res) => {
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
      AuditoriaService.registrarOperacion('clientes', 'INSERT', id, null, req.body);
      res.json({ id, razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva });
    }
  );
});

// ==================== RUTAS DE FACTURAS ====================

app.post('/api/facturas', async (req, res) => {
  try {
    const { cliente_id, fecha, tipo_comprobante, detalles, validar_arca } = req.body;
    const factura = await VentasService.crearFactura(
      cliente_id,
      fecha,
      tipo_comprobante,
      detalles,
      validar_arca || false
    );
    res.json(factura);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/facturas/:id', (req, res) => {
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

// ==================== RUTAS DE COBROS ====================

app.post('/api/cobros', async (req, res) => {
  try {
    const { factura_id, monto, cuenta_banco_id } = req.body;
    const result = await VentasService.registrarCobro(factura_id, monto, cuenta_banco_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE NOTAS DE CRÉDITO ====================

app.post('/api/notas-credito', async (req, res) => {
  try {
    const { factura_id, motivo } = req.body;
    const nc = await VentasService.crearNotaCredito(factura_id, motivo);
    res.json(nc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RUTAS DE TESORERÍA ====================

app.get('/api/tesoreria/estado', async (req, res) => {
  try {
    const estado = await TesoreriaService.obtenerEstadoTesoreria();
    res.json(estado);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cuentas', (req, res) => {
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
      res.json({ id, nombre, tipo, moneda, saldo: 0 });
    }
  );
});

// ==================== RUTAS DE AUDITORÍA ====================

app.get('/api/auditoria/:tabla/:id', async (req, res) => {
  try {
    const { tabla, id } = req.params;
    const historial = await AuditoriaService.obtenerHistorial(tabla, id);
    res.json(historial);
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
