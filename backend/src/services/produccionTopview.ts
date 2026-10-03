import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../dbHelpers';
import { AuditoriaService } from './auditoria';
import { TesoreriaService } from './tesoreria';

const PRODUCTO_SERVICIO_PRODUCCION_ID = 'topview-prod-1';

interface LineaProduccion {
  descripcion_ubicacion: string;
  producto_id?: string;
  caras_elementos: number;
  medida?: string;
  tarifa: number;
  descuento_porcentaje?: number;
}

// Filas de ordenes_produccion / su detalle: solo lo que se lee por nombre; el
// resto de las columnas viaja tal cual (índice abierto) porque se devuelve entera.
interface FilaOrdenProduccion {
  id: string;
  numero_orden: string;
  cliente_id: string | null;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  factura_id?: string | null;
  [columna: string]: unknown;
}

interface FilaLineaProduccion {
  producto_id: string | null;
  caras_elementos: number;
  tarifa: number;
  importe_neto: number;
  descripcion_ubicacion: string;
  [columna: string]: unknown;
}

interface OrdenProduccionCompleta extends FilaOrdenProduccion {
  lineas: FilaLineaProduccion[];
}

interface DatosOrdenProduccion {
  numero_orden_cliente?: string;
  agencia_id?: string;
  cliente_id: string;
  proveedor_id?: string;
  medio?: string;
  marca?: string;
  campana?: string;
  periodo_desde?: string;
  periodo_hasta?: string;
  fecha: string;
  pauta_numero?: string;
  observaciones?: string;
  email_envio_facturas?: string;
  contacto?: string;
  materiales?: string;
  lineas: LineaProduccion[];
}

// Orden de Producción: documento propio e independiente de las órdenes de
// exhibición (ordenes_publicidad) — ver comentario en database.ts. Cada línea
// tiene su propio precio (cantidad x tarifa - descuento), a diferencia de las
// órdenes de exhibición donde el monto es uno solo para toda la orden.
export class ProduccionTopviewService {
  private static calcularLineas(lineas: LineaProduccion[]) {
    const lineasCalculadas = lineas.map((l) => {
      const caras = Number(l.caras_elementos) || 0;
      const tarifa = Number(l.tarifa) || 0;
      const descuento = Number(l.descuento_porcentaje) || 0;
      const importeNeto = caras * tarifa * (1 - descuento / 100);
      return { ...l, caras_elementos: caras, tarifa, descuento_porcentaje: descuento, importe_neto: importeNeto };
    });
    const subtotal = lineasCalculadas.reduce((s, l) => s + l.importe_neto, 0);
    const iva = subtotal * 0.21;
    const total = subtotal + iva;
    return { lineasCalculadas, subtotal, iva, total };
  }

  static async crearOrdenProduccion(datos: DatosOrdenProduccion): Promise<OrdenProduccionCompleta> {
    if (!datos.cliente_id) throw new Error('El cliente es obligatorio.');
    if (!datos.lineas || datos.lineas.length === 0) throw new Error('Agregá al menos una línea de producción.');

    const { lineasCalculadas, subtotal, iva, total } = this.calcularLineas(datos.lineas);

    const id = uuid();
    const numeroOrden = `OPR-${Date.now()}`;

    await dbRun(
      `
      INSERT INTO ordenes_produccion (
        id, numero_orden, numero_orden_cliente, agencia_id, cliente_id, proveedor_id, medio, marca, campana,
        periodo_desde, periodo_hasta, fecha, pauta_numero, observaciones,
        email_envio_facturas, contacto, materiales, subtotal, iva, total, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        numeroOrden,
        datos.numero_orden_cliente || null,
        datos.agencia_id || null,
        datos.cliente_id,
        datos.proveedor_id || null,
        datos.medio || null,
        datos.marca || null,
        datos.campana || null,
        datos.periodo_desde || null,
        datos.periodo_hasta || null,
        datos.fecha,
        datos.pauta_numero || null,
        datos.observaciones || null,
        datos.email_envio_facturas || null,
        datos.contacto || null,
        datos.materiales || null,
        subtotal,
        iva,
        total,
        'Cargada',
      ]
    );

    for (const l of lineasCalculadas) {
      await dbRun(
        `
        INSERT INTO ordenes_produccion_detalles (
          id, orden_produccion_id, descripcion_ubicacion, producto_id, caras_elementos, medida,
          tarifa, descuento_porcentaje, importe_neto
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          uuid(),
          id,
          l.descripcion_ubicacion,
          l.producto_id || null,
          l.caras_elementos,
          l.medida || null,
          l.tarifa,
          l.descuento_porcentaje,
          l.importe_neto,
        ]
      );
    }

    AuditoriaService.registrarOperacion('ordenes_produccion', 'INSERT', id, null, { numero_orden: numeroOrden, ...datos });
    return this.obtenerOrdenProduccion(id);
  }

  static async actualizarOrdenProduccion(id: string, datos: DatosOrdenProduccion): Promise<OrdenProduccionCompleta> {
    const existente = await dbGet<FilaOrdenProduccion>('SELECT * FROM ordenes_produccion WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Orden de producción no encontrada.');
    if (existente.factura_id) throw new Error('Esta orden ya fue facturada — no se puede editar. Podés clonarla para crear una nueva.');
    if (!datos.cliente_id) throw new Error('El cliente es obligatorio.');
    if (!datos.lineas || datos.lineas.length === 0) throw new Error('Agregá al menos una línea de producción.');

    const { lineasCalculadas, subtotal, iva, total } = this.calcularLineas(datos.lineas);

    await dbRun(
      `
      UPDATE ordenes_produccion SET
        numero_orden_cliente = ?, agencia_id = ?, cliente_id = ?, proveedor_id = ?, medio = ?, marca = ?, campana = ?,
        periodo_desde = ?, periodo_hasta = ?, fecha = ?, pauta_numero = ?, observaciones = ?,
        email_envio_facturas = ?, contacto = ?, materiales = ?, subtotal = ?, iva = ?, total = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [
        datos.numero_orden_cliente || null,
        datos.agencia_id || null,
        datos.cliente_id,
        datos.proveedor_id || null,
        datos.medio || null,
        datos.marca || null,
        datos.campana || null,
        datos.periodo_desde || null,
        datos.periodo_hasta || null,
        datos.fecha,
        datos.pauta_numero || null,
        datos.observaciones || null,
        datos.email_envio_facturas || null,
        datos.contacto || null,
        datos.materiales || null,
        subtotal,
        iva,
        total,
        id,
      ]
    );

    await dbRun('DELETE FROM ordenes_produccion_detalles WHERE orden_produccion_id = ?', [id]);
    for (const l of lineasCalculadas) {
      await dbRun(
        `
        INSERT INTO ordenes_produccion_detalles (
          id, orden_produccion_id, descripcion_ubicacion, producto_id, caras_elementos, medida,
          tarifa, descuento_porcentaje, importe_neto
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          uuid(),
          id,
          l.descripcion_ubicacion,
          l.producto_id || null,
          l.caras_elementos,
          l.medida || null,
          l.tarifa,
          l.descuento_porcentaje,
          l.importe_neto,
        ]
      );
    }

    AuditoriaService.registrarOperacion('ordenes_produccion', 'UPDATE', id, existente, datos);
    return this.obtenerOrdenProduccion(id);
  }

  static async obtenerOrdenProduccion(id: string): Promise<OrdenProduccionCompleta> {
    const orden = await dbGet<FilaOrdenProduccion>(
      `
      SELECT op.*, c.razon_social as cliente_razon_social, a.nombre as agencia_nombre, p.razon_social as proveedor_razon_social,
             f.numero as factura_numero
      FROM ordenes_produccion op
      LEFT JOIN clientes c ON c.id = op.cliente_id
      LEFT JOIN agencias a ON a.id = op.agencia_id
      LEFT JOIN proveedores p ON p.id = op.proveedor_id
      LEFT JOIN facturas f ON f.id = op.factura_id
      WHERE op.id = ?
    `,
      [id]
    );
    if (!orden || !orden.id) throw new Error('Orden de producción no encontrada.');
    const lineas = await dbAll<FilaLineaProduccion>(
      'SELECT * FROM ordenes_produccion_detalles WHERE orden_produccion_id = ? ORDER BY created_at',
      [id]
    );
    return { ...orden, lineas };
  }

  static async listarOrdenesProduccion(): Promise<FilaOrdenProduccion[]> {
    return dbAll<FilaOrdenProduccion>(`
      SELECT op.*, c.razon_social as cliente_razon_social, a.nombre as agencia_nombre, p.razon_social as proveedor_razon_social
      FROM ordenes_produccion op
      LEFT JOIN clientes c ON c.id = op.cliente_id
      LEFT JOIN agencias a ON a.id = op.agencia_id
      LEFT JOIN proveedores p ON p.id = op.proveedor_id
      WHERE op.habilitado != 0 OR op.habilitado IS NULL
      ORDER BY op.created_at DESC
    `);
  }

  // Tracker manual contra Colppy (Cargada/Revisada/Facturada) — no bloquea
  // nada por sí mismo, el bloqueo de edición real es por factura_id (ver
  // actualizarOrdenProduccion). Se puede cambiar en cualquier momento desde
  // la lista, igual que en ordenes_publicidad.
  static async actualizarEstado(id: string, nuevoEstado: string): Promise<void> {
    await dbRun('UPDATE ordenes_produccion SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      nuevoEstado,
      id,
    ]);
    AuditoriaService.registrarOperacion('ordenes_produccion', 'UPDATE', id, null, { estado: nuevoEstado });
  }

  // Números reales de Colppy (factura/NC), sueltos del estado para poder
  // corregirlos después sin re-disparar la transición — mismo criterio que
  // ordenes_publicidad.
  static async actualizarFacturacionColppy(
    id: string,
    datos: { numero_factura_colppy?: string; numero_nc_colppy?: string }
  ): Promise<void> {
    await dbRun(
      `UPDATE ordenes_produccion SET
        numero_factura_colppy = COALESCE(?, numero_factura_colppy),
        numero_nc_colppy = COALESCE(?, numero_nc_colppy),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [datos.numero_factura_colppy ?? null, datos.numero_nc_colppy ?? null, id]
    );
    AuditoriaService.registrarOperacion('ordenes_produccion', 'UPDATE', id, null, datos);
  }

  static async eliminarOrdenProduccion(id: string): Promise<void> {
    await dbRun('UPDATE ordenes_produccion SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    AuditoriaService.registrarOperacion('ordenes_produccion', 'DELETE', id, null, { habilitado: 0 });
  }

  // Genera la factura real de la orden de producción. Se factura siempre a
  // "Cliente" (mismo criterio que las órdenes de exhibición: es el campo "a
  // quien se factura", la agencia es solo referencia) — una orden de
  // producción es una sola factura, no es recurrente como la exhibición.
  static async generarFactura(id: string): Promise<string> {
    const orden = await this.obtenerOrdenProduccion(id);
    if (orden.factura_id) throw new Error('Esta orden ya tiene una factura generada.');
    if (!orden.lineas || orden.lineas.length === 0) throw new Error('La orden no tiene líneas de producción.');

    const facturaId = uuid();
    const numeroFactura = `FAC-${orden.numero_orden}`;

    await dbRun(
      `
      INSERT INTO facturas (
        id, numero, cliente_id, fecha, tipo_comprobante, estado, subtotal, iva, total, saldo
      ) VALUES (?, ?, ?, ?, 'Factura A', 'Abierta', ?, ?, ?, ?)
    `,
      [facturaId, numeroFactura, orden.cliente_id, orden.fecha, orden.subtotal, orden.iva, orden.total, orden.total]
    );

    for (const l of orden.lineas) {
      await dbRun(
        `
        INSERT INTO facturas_detalles (
          id, factura_id, producto_id, cantidad, precio_unitario, subtotal, descripcion
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          uuid(),
          facturaId,
          l.producto_id || PRODUCTO_SERVICIO_PRODUCCION_ID,
          l.caras_elementos,
          l.tarifa,
          l.importe_neto,
          l.descripcion_ubicacion,
        ]
      );
    }

    await dbRun(
      'UPDATE ordenes_produccion SET factura_id = ?, estado = "Facturada", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [facturaId, id]
    );

    if (orden.cliente_id) {
      await TesoreriaService.actualizarCCCliente(orden.cliente_id, orden.total, 'debe');
    }

    AuditoriaService.registrarOperacion('ordenes_produccion', 'UPDATE', id, null, { factura_id: facturaId, estado: 'Facturada' });
    return facturaId;
  }
}
