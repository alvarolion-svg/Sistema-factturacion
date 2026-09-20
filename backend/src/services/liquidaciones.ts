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
      SELECT DISTINCT p.id, p.razon_social, p.direccion
      FROM proveedores p
      JOIN locaciones l ON l.concesionario_id = p.id
      WHERE l.habilitado != 0 OR l.habilitado IS NULL
      ORDER BY p.razon_social
    `);
  }

  // % de Canon, IVA y percepciones de cada concesionario para la solapa
  // "Canon por concesionario" — todos los concesionarios reales, con
  // defaults (Canon 100%, IVA 21%, sin percepciones) para el que todavía no
  // tiene nada cargado.
  static async listarCondiciones(): Promise<any[]> {
    const concesionarios = await this.queryAll(`
      SELECT DISTINCT p.id as concesionario_id, p.razon_social,
        COALESCE(cc.porcentaje_comision, 100) as porcentaje_comision,
        COALESCE(cc.iva_porcentaje, 21) as iva_porcentaje,
        cc.notas
      FROM proveedores p
      JOIN locaciones l ON l.concesionario_id = p.id
      LEFT JOIN condiciones_concesionario cc ON cc.concesionario_id = p.id
      WHERE l.habilitado != 0 OR l.habilitado IS NULL
      ORDER BY p.razon_social
    `);
    const percepciones = await this.queryAll('SELECT * FROM condiciones_percepciones ORDER BY nombre');
    const percepcionesPorConcesionario = new Map<string, any[]>();
    percepciones.forEach((p) => {
      if (!percepcionesPorConcesionario.has(p.concesionario_id)) percepcionesPorConcesionario.set(p.concesionario_id, []);
      percepcionesPorConcesionario.get(p.concesionario_id)!.push(p);
    });
    return concesionarios.map((c) => ({ ...c, percepciones: percepcionesPorConcesionario.get(c.concesionario_id) || [] }));
  }

  // Condición completa de un concesionario (Canon, IVA y percepciones) para
  // calcular el Total a Pagar de su liquidación del período.
  static async obtenerCondicion(concesionarioId: string): Promise<{ porcentajeComision: number; ivaPorcentaje: number; percepciones: any[] }> {
    const fila = await this.queryGet(
      'SELECT porcentaje_comision, iva_porcentaje FROM condiciones_concesionario WHERE concesionario_id = ?',
      [concesionarioId]
    );
    const percepciones = await this.queryAll(
      'SELECT * FROM condiciones_percepciones WHERE concesionario_id = ? ORDER BY nombre',
      [concesionarioId]
    );
    return {
      porcentajeComision: fila && fila.porcentaje_comision !== undefined ? Number(fila.porcentaje_comision) : 100,
      ivaPorcentaje: fila && fila.iva_porcentaje !== undefined ? Number(fila.iva_porcentaje) : 21,
      percepciones,
    };
  }

  static async guardarCondicion(
    concesionarioId: string,
    porcentajeComision: number,
    ivaPorcentaje: number,
    notas?: string
  ): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_concesionario WHERE concesionario_id = ?', [concesionarioId]);
    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE condiciones_concesionario SET porcentaje_comision = ?, iva_porcentaje = ?, notas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [porcentajeComision, ivaPorcentaje, notas || null, existente.id]
      );
      AuditoriaService.registrarOperacion('condiciones_concesionario', 'UPDATE', existente.id, existente, { porcentajeComision, ivaPorcentaje, notas });
    } else {
      const id = uuid();
      await this.runQuery(
        'INSERT INTO condiciones_concesionario (id, concesionario_id, porcentaje_comision, iva_porcentaje, notas) VALUES (?, ?, ?, ?, ?)',
        [id, concesionarioId, porcentajeComision, ivaPorcentaje, notas || null]
      );
      AuditoriaService.registrarOperacion('condiciones_concesionario', 'INSERT', id, null, { concesionarioId, porcentajeComision, ivaPorcentaje, notas });
    }
  }

  static async agregarPercepcion(concesionarioId: string, nombre: string, porcentaje: number): Promise<any> {
    if (!nombre || !nombre.trim()) throw new Error('El nombre de la percepción es obligatorio.');
    const id = uuid();
    await this.runQuery(
      'INSERT INTO condiciones_percepciones (id, concesionario_id, nombre, porcentaje) VALUES (?, ?, ?, ?)',
      [id, concesionarioId, nombre.trim(), porcentaje || 0]
    );
    AuditoriaService.registrarOperacion('condiciones_percepciones', 'INSERT', id, null, { concesionarioId, nombre, porcentaje });
    return this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
  }

  static async actualizarPercepcion(id: string, nombre: string, porcentaje: number): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa percepción no existe.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre de la percepción es obligatorio.');
    await this.runQuery(
      'UPDATE condiciones_percepciones SET nombre = ?, porcentaje = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nombre.trim(), porcentaje || 0, id]
    );
    AuditoriaService.registrarOperacion('condiciones_percepciones', 'UPDATE', id, existente, { nombre, porcentaje });
    return this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
  }

  static async eliminarPercepcion(id: string): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa percepción no existe.');
    await this.runQuery('DELETE FROM condiciones_percepciones WHERE id = ?', [id]);
    AuditoriaService.registrarOperacion('condiciones_percepciones', 'DELETE', id, existente, null);
  }

  // Todas las líneas de orden con locación de ese concesionario, activas ese
  // mes/año (según replicaciones_facturacion, el mismo anclaje que usa la
  // facturación mensual), con el monto ya cargado si existe. Devuelve
  // también las excluidas (con excluida=true) para poder restaurarlas — el
  // que llama decide si las muestra.
  //
  // Corte del día 15 (pedido explícito del usuario, 2026-09-20): si la
  // campaña arranca (periodo_desde) DESPUÉS del 15 del mes que se está
  // mirando, por defecto no cuenta para este mes — se informa igual (con
  // inicio_tardio=true) pero arranca excluida, salvo que ya haya una
  // decisión explícita guardada en liquidaciones_detalle.excluida (el
  // usuario puede tildarla para sumarla igual a este mes).
  static async listarPeriodo(concesionarioId: string, mes: number, ano: number): Promise<any[]> {
    const esInicioTardio = `
      CASE
        WHEN CAST(strftime('%Y', o.periodo_desde) AS INTEGER) = ?
         AND CAST(strftime('%m', o.periodo_desde) AS INTEGER) = ?
         AND CAST(strftime('%d', o.periodo_desde) AS INTEGER) > 15
        THEN 1 ELSE 0
      END
    `;
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
        COALESCE(ld.monto, 0) as monto,
        ld.estado_especial as estado_especial,
        CASE WHEN d.tipo_producto = 'Stand' THEN 'stand' ELSE 'publicidad' END as seccion,
        ${esInicioTardio} as inicio_tardio,
        COALESCE(ld.excluida, ${esInicioTardio}) as excluida
      FROM ordenes_publicidad_detalles d
      JOIN locaciones l ON l.id = d.locacion_id
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      JOIN replicaciones_facturacion r ON r.orden_id = o.id AND r.numero_mes = ? AND r.ano = ?
      LEFT JOIN liquidaciones_detalle ld ON ld.orden_detalle_id = d.id AND ld.mes = ? AND ld.ano = ?
      WHERE l.concesionario_id = ? AND (o.habilitado != 0 OR o.habilitado IS NULL)
      ORDER BY l.nombre, o.razon_social
      `,
      [ano, mes, ano, mes, mes, ano, mes, ano, concesionarioId]
    );
    return filas.map((f) => ({ ...f, excluida: !!f.excluida, inicio_tardio: !!f.inicio_tardio }));
  }

  // Líneas sueltas cargadas a mano para ese concesionario/período — ajustes,
  // compensaciones, lo que se facturó pero el cliente terminó no pagando,
  // etc. No vienen de ninguna orden.
  static async listarManuales(concesionarioId: string, mes: number, ano: number): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM liquidaciones_manuales WHERE concesionario_id = ? AND mes = ? AND ano = ? ORDER BY created_at',
      [concesionarioId, mes, ano]
    );
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

  // Saca (o restaura) una línea auto-generada de la liquidación del período
  // sin tocar la orden — ej. el cliente terminó no pagando esa campaña.
  // Conserva el monto que ya estuviera cargado, solo cambia el flag.
  static async marcarExclusion(ordenDetalleId: string, mes: number, ano: number, excluida: boolean): Promise<void> {
    const detalle = await this.queryGet('SELECT id FROM ordenes_publicidad_detalles WHERE id = ?', [ordenDetalleId]);
    if (!detalle || !detalle.id) throw new Error('Esa línea de orden no existe.');

    const existente = await this.queryGet(
      'SELECT * FROM liquidaciones_detalle WHERE orden_detalle_id = ? AND mes = ? AND ano = ?',
      [ordenDetalleId, mes, ano]
    );

    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE liquidaciones_detalle SET excluida = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [excluida ? 1 : 0, existente.id]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'UPDATE', existente.id, existente, { excluida });
    } else {
      const id = uuid();
      await this.runQuery(
        'INSERT INTO liquidaciones_detalle (id, orden_detalle_id, mes, ano, monto, excluida) VALUES (?, ?, ?, ?, 0, ?)',
        [id, ordenDetalleId, mes, ano, excluida ? 1 : 0]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'INSERT', id, null, { ordenDetalleId, mes, ano, excluida });
    }
  }

  // Marca una línea como "sin cargo" o "canje" en vez de un monto en pesos
  // (visto en una liquidación real: "S/c" y "Canje" en columnas donde iría
  // el importe) — cuenta como $0 en los totales. null la vuelve a un monto
  // normal (no borra el monto que hubiera, el usuario lo re-carga si quiere).
  static async marcarEstadoEspecial(
    ordenDetalleId: string,
    mes: number,
    ano: number,
    estadoEspecial: 'sin_cargo' | 'canje' | null
  ): Promise<void> {
    const detalle = await this.queryGet('SELECT id FROM ordenes_publicidad_detalles WHERE id = ?', [ordenDetalleId]);
    if (!detalle || !detalle.id) throw new Error('Esa línea de orden no existe.');

    const existente = await this.queryGet(
      'SELECT * FROM liquidaciones_detalle WHERE orden_detalle_id = ? AND mes = ? AND ano = ?',
      [ordenDetalleId, mes, ano]
    );

    const montoNuevo = estadoEspecial ? 0 : existente?.monto || 0;
    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE liquidaciones_detalle SET estado_especial = ?, monto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [estadoEspecial, montoNuevo, existente.id]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'UPDATE', existente.id, existente, { estadoEspecial });
    } else {
      const id = uuid();
      await this.runQuery(
        'INSERT INTO liquidaciones_detalle (id, orden_detalle_id, mes, ano, monto, estado_especial) VALUES (?, ?, ?, ?, 0, ?)',
        [id, ordenDetalleId, mes, ano, estadoEspecial]
      );
      AuditoriaService.registrarOperacion('liquidaciones_detalle', 'INSERT', id, null, { ordenDetalleId, mes, ano, estadoEspecial });
    }
  }

  static async agregarLineaManual(datos: {
    concesionario_id: string;
    mes: number;
    ano: number;
    descripcion: string;
    monto: number;
  }): Promise<any> {
    if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');
    const id = uuid();
    await this.runQuery(
      'INSERT INTO liquidaciones_manuales (id, concesionario_id, mes, ano, descripcion, monto) VALUES (?, ?, ?, ?, ?, ?)',
      [id, datos.concesionario_id, datos.mes, datos.ano, datos.descripcion.trim(), datos.monto || 0]
    );
    AuditoriaService.registrarOperacion('liquidaciones_manuales', 'INSERT', id, null, datos);
    return this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
  }

  static async actualizarLineaManual(id: string, datos: { descripcion: string; monto: number }): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa línea manual no existe.');
    if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');
    await this.runQuery(
      'UPDATE liquidaciones_manuales SET descripcion = ?, monto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [datos.descripcion.trim(), datos.monto || 0, id]
    );
    AuditoriaService.registrarOperacion('liquidaciones_manuales', 'UPDATE', id, existente, datos);
    return this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
  }

  static async eliminarLineaManual(id: string): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa línea manual no existe.');
    await this.runQuery('DELETE FROM liquidaciones_manuales WHERE id = ?', [id]);
    AuditoriaService.registrarOperacion('liquidaciones_manuales', 'DELETE', id, existente, null);
  }
}
