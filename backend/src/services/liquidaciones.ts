import { v4 as uuid } from 'uuid';
import db from '../database';
import { AuditoriaService } from './auditoria';

// Liquidaciones a concesionarios: cuánto le paga Topview a cada concesionario
// por cada línea de orden, mes a mes. Cantidad/locación/punto se toman de la
// orden real (ya vinculada a la locación) porque no tiene sentido cargarlos
// dos veces; el monto NO se deriva de lo que le cobramos al anunciante — no
// hay relación fija — se carga a mano por línea y por período (ver
// [[project_modulo_liquidaciones_locatarios]]).
export class LiquidacionesService {
  private static queryAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, filas: any[]) => (err ? reject(err) : resolve(filas || [])));
    });
  }

  private static queryGet(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, fila: any) => (err ? reject(err) : resolve(fila)));
    });
  }

  private static runQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  }

  // Concesionarios reales (proveedores usados en al menos una locación) para
  // el selector de la pantalla — no todo el padrón de proveedores.
  static async listarConcesionarios(): Promise<any[]> {
    return this.queryAll(`
      SELECT DISTINCT p.id, p.razon_social
      FROM proveedores p
      JOIN locaciones l ON l.concesionario_id = p.id
      WHERE l.habilitado != 0 OR l.habilitado IS NULL
      ORDER BY p.razon_social
    `);
  }

  // Todas las líneas de orden con locación de ese concesionario, activas ese
  // mes/año (según replicaciones_facturacion, el mismo anclaje que usa la
  // facturación mensual), con el monto ya cargado si existe.
  static async listarPeriodo(concesionarioId: string, mes: number, ano: number): Promise<any[]> {
    const filas = await this.queryAll(
      `
      SELECT
        d.id as detalle_id,
        o.id as orden_id,
        o.numero_orden,
        o.numero_orden_agencia,
        o.razon_social as anunciante,
        o.periodo_desde,
        o.periodo_hasta,
        d.tipo_producto,
        d.cantidad,
        d.punto_instalacion,
        l.id as locacion_id,
        l.nombre as locacion_nombre,
        ld.id as liquidacion_id,
        COALESCE(ld.monto, 0) as monto
      FROM ordenes_publicidad_detalles d
      JOIN locaciones l ON l.id = d.locacion_id
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      JOIN replicaciones_facturacion r ON r.orden_id = o.id AND r.numero_mes = ? AND r.ano = ?
      LEFT JOIN liquidaciones_detalle ld ON ld.orden_detalle_id = d.id AND ld.mes = ? AND ld.ano = ?
      WHERE l.concesionario_id = ? AND (o.habilitado != 0 OR o.habilitado IS NULL)
      ORDER BY l.nombre, o.razon_social
      `,
      [mes, ano, mes, ano, concesionarioId]
    );
    return filas;
  }

  static async totalPeriodo(concesionarioId: string, mes: number, ano: number): Promise<number> {
    const filas = await this.listarPeriodo(concesionarioId, mes, ano);
    return filas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  }

  static async guardarMonto(ordenDetalleId: string, mes: number, ano: number, monto: number): Promise<void> {
    const detalle = await this.queryGet('SELECT id FROM ordenes_publicidad_detalles WHERE id = ?', [ordenDetalleId]);
    if (!detalle || !detalle.id) throw new Error('Esa línea de orden no existe.');

    const existente = await this.queryGet(
      'SELECT * FROM liquidaciones_detalle WHERE orden_detalle_id = ? AND mes = ? AND ano = ?',
      [ordenDetalleId, mes, ano]
    );

    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE liquidaciones_detalle SET monto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [monto, existente.id]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'UPDATE', existente.id, existente, { monto });
    } else {
      const id = uuid();
      await this.runQuery(
        'INSERT INTO liquidaciones_detalle (id, orden_detalle_id, mes, ano, monto) VALUES (?, ?, ?, ?, ?)',
        [id, ordenDetalleId, mes, ano, monto]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'INSERT', id, null, { ordenDetalleId, mes, ano, monto });
    }
  }
}
