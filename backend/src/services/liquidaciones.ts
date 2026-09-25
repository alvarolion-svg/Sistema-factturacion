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

  // Concesionarios reales (proveedores usados en al menos una locación, sea
  // a nivel locación entera o de un punto/soporte/reparto puntual — ver
  // [[project_concesionario_por_punto_no_por_locacion]]) para el selector de
  // la pantalla — no todo el padrón de proveedores.
  static async listarConcesionarios(): Promise<any[]> {
    return this.queryAll(`
      SELECT DISTINCT p.id, p.razon_social, p.direccion
      FROM proveedores p
      WHERE p.id IN (
        SELECT l.concesionario_id FROM locaciones l WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND l.concesionario_id IS NOT NULL
        UNION
        SELECT lc.concesionario_id FROM locaciones_capacidad lc JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND lc.concesionario_id IS NOT NULL
        UNION
        SELECT lp.concesionario_id FROM locaciones_puntos lp
          JOIN locaciones_capacidad lc ON lc.id = lp.capacidad_id
          JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND lp.concesionario_id IS NOT NULL
        UNION
        SELECT rep.concesionario_id FROM locaciones_capacidad_reparto rep
          JOIN locaciones_capacidad lc ON lc.id = rep.capacidad_id
          JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL)
      )
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
      LEFT JOIN condiciones_concesionario cc ON cc.concesionario_id = p.id
      WHERE p.id IN (
        SELECT l.concesionario_id FROM locaciones l WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND l.concesionario_id IS NOT NULL
        UNION
        SELECT lc.concesionario_id FROM locaciones_capacidad lc JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND lc.concesionario_id IS NOT NULL
        UNION
        SELECT lp.concesionario_id FROM locaciones_puntos lp
          JOIN locaciones_capacidad lc ON lc.id = lp.capacidad_id
          JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL) AND lp.concesionario_id IS NOT NULL
        UNION
        SELECT rep.concesionario_id FROM locaciones_capacidad_reparto rep
          JOIN locaciones_capacidad lc ON lc.id = rep.capacidad_id
          JOIN locaciones l ON l.id = lc.locacion_id
          WHERE (l.habilitado != 0 OR l.habilitado IS NULL)
      )
      ORDER BY p.razon_social
    `);
    const percepciones = await this.queryAll('SELECT * FROM condiciones_percepciones ORDER BY nombre');
    const percepcionesPorConcesionario = new Map<string, any[]>();
    percepciones.forEach((p) => {
      if (!percepcionesPorConcesionario.has(p.concesionario_id)) percepcionesPorConcesionario.set(p.concesionario_id, []);
      percepcionesPorConcesionario.get(p.concesionario_id)!.push(p);
    });
    // Esteban Vivo: solo los concesionarios que lo tienen cargado traen esta
    // condición (hoy, Parque C. Avellaneda / Pueblo Caamaño) — null para el
    // resto, así la pantalla sabe cuándo mostrar la sección.
    const vivoRows = await this.queryAll('SELECT * FROM condiciones_esteban_vivo');
    const vivoPorConcesionario = new Map<string, any>();
    vivoRows.forEach((v) => vivoPorConcesionario.set(v.concesionario_id, v));
    // Oxant es una condición ÚNICA compartida por los 3 concesionarios que
    // trae (CECNOR SA, WFPP SRL, PILAR SHOPS S.A.) — no una por concesionario
    // como Esteban Vivo. Se edita desde cualquiera de esas 3 filas en "Canon
    // por concesionario" y actualiza la misma fila global de condiciones_oxant.
    const oxantConcesionarioIds = new Set(
      (await this.queryAll('SELECT concesionario_id FROM oxant_concesionarios')).map((r) => r.concesionario_id)
    );
    const oxantCondicion = await this.obtenerCondicionOxant();
    // Iris Chiterer: se queda con un % flat de lo declarado por Terra Uno
    // (hoy el único concesionario que la trae) — condición 1 a 1, como
    // Esteban Vivo, pero sin cascada.
    const irisRows = await this.queryAll('SELECT * FROM condiciones_iris_chiterer');
    const irisPorConcesionario = new Map<string, any>();
    irisRows.forEach((v) => irisPorConcesionario.set(v.concesionario_id, v));
    // World Padel Pilar: se compensa por comerciales (trueque), no plata —
    // condición 1 a 1 como Esteban Vivo/Iris, pero convive con el Canon $
    // normal del mismo concesionario (no lo reemplaza).
    const comercialesRows = await this.queryAll('SELECT * FROM condiciones_comerciales');
    const comercialesPorConcesionario = new Map<string, any>();
    comercialesRows.forEach((v) => comercialesPorConcesionario.set(v.concesionario_id, v));
    return concesionarios.map((c) => {
      const vivo = vivoPorConcesionario.get(c.concesionario_id);
      const iris = irisPorConcesionario.get(c.concesionario_id);
      const comerciales = comercialesPorConcesionario.get(c.concesionario_id);
      return {
        ...c,
        percepciones: percepcionesPorConcesionario.get(c.concesionario_id) || [],
        esteban_vivo: vivo
          ? {
              porcentaje_comision_vendedor: Number(vivo.porcentaje_comision_vendedor),
              porcentaje_canon: Number(vivo.porcentaje_canon),
              porcentaje_gastos_top: Number(vivo.porcentaje_gastos_top),
              porcentaje_vivo: Number(vivo.porcentaje_vivo),
            }
          : null,
        oxant: oxantConcesionarioIds.has(c.concesionario_id)
          ? { porcentaje_comision: oxantCondicion.porcentajeComision, iva_porcentaje: oxantCondicion.ivaPorcentaje }
          : null,
        iris_chiterer: iris ? { porcentaje: Number(iris.porcentaje) } : null,
        comerciales: comerciales
          ? {
              porcentaje_concesionario: Number(comerciales.porcentaje_concesionario),
              porcentaje_topview: Number(comerciales.porcentaje_topview),
            }
          : null,
      };
    });
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

  // Condición de Esteban Vivo para un concesionario (null si no aplica —
  // solo Parque C. Avellaneda / Pueblo Caamaño la tienen cargada hoy, ver
  // [[project_esteban_vivo_comisiona_no_comisionista]]). Es una cascada
  // propia, sin relación con el Canon real del concesionario.
  static async obtenerCondicionEstebanVivo(concesionarioId: string): Promise<{
    porcentajeComisionVendedor: number;
    porcentajeCanon: number;
    porcentajeGastosTop: number;
    porcentajeVivo: number;
  } | null> {
    const fila = await this.queryGet('SELECT * FROM condiciones_esteban_vivo WHERE concesionario_id = ?', [concesionarioId]);
    if (!fila) return null;
    return {
      porcentajeComisionVendedor: Number(fila.porcentaje_comision_vendedor),
      porcentajeCanon: Number(fila.porcentaje_canon),
      porcentajeGastosTop: Number(fila.porcentaje_gastos_top),
      porcentajeVivo: Number(fila.porcentaje_vivo),
    };
  }

  static async guardarCondicionEstebanVivo(
    concesionarioId: string,
    datos: { porcentajeComisionVendedor: number; porcentajeCanon: number; porcentajeGastosTop: number; porcentajeVivo: number }
  ): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_esteban_vivo WHERE concesionario_id = ?', [concesionarioId]);
    if (existente && existente.id) {
      await this.runQuery(
        `UPDATE condiciones_esteban_vivo
         SET porcentaje_comision_vendedor = ?, porcentaje_canon = ?, porcentaje_gastos_top = ?, porcentaje_vivo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [datos.porcentajeComisionVendedor, datos.porcentajeCanon, datos.porcentajeGastosTop, datos.porcentajeVivo, existente.id]
      );
      AuditoriaService.registrarOperacion('condiciones_esteban_vivo', 'UPDATE', existente.id, existente, datos);
    } else {
      const id = uuid();
      await this.runQuery(
        `INSERT INTO condiciones_esteban_vivo
         (id, concesionario_id, porcentaje_comision_vendedor, porcentaje_canon, porcentaje_gastos_top, porcentaje_vivo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, concesionarioId, datos.porcentajeComisionVendedor, datos.porcentajeCanon, datos.porcentajeGastosTop, datos.porcentajeVivo]
      );
      AuditoriaService.registrarOperacion('condiciones_esteban_vivo', 'INSERT', id, null, { concesionarioId, ...datos });
    }
  }

  static async listarConcesionariosEstebanVivo(): Promise<Array<{ concesionario_id: string; razon_social: string }>> {
    return this.queryAll(`
      SELECT cv.concesionario_id, p.razon_social
      FROM condiciones_esteban_vivo cv
      JOIN proveedores p ON p.id = cv.concesionario_id
      ORDER BY p.razon_social
    `);
  }

  // Cascada de Esteban Vivo para UN concesionario/período — agrupa por orden
  // real (no por nombre de anunciante) para no mezclar campañas distintas
  // del mismo cliente en una sola fila, pero sí consolidar las líneas de
  // soporte de una misma orden. Extraído de lo que antes vivía inline en
  // GET /api/liquidaciones, ahora reutilizado también por la solapa propia
  // "Esteban Vivo" (que suma los 2 concesionarios que lo traen — mismo
  // patrón que Oxant, a pedido del usuario: "el manejo es similar").
  static async calcularEstebanVivoConcesionario(concesionarioId: string, mes: number, ano: number): Promise<{
    porcentajes: { comision_vendedor: number; canon: number; gastos_top: number; vivo: number };
    lineas: Array<{
      anunciante: string;
      numero_orden: string;
      declarado: number;
      comision_vendedor: number;
      neto1: number;
      canon: number;
      neto2: number;
      gastos_top: number;
      neto3: number;
      com_vivo: number;
    }>;
    total_a_pagar: number;
  } | null> {
    const condicionVivo = await this.obtenerCondicionEstebanVivo(concesionarioId);
    if (!condicionVivo) return null;
    const filas = await this.listarPeriodo(concesionarioId, mes, ano);
    const porOrden = new Map<string, { anunciante: string; numeroOrden: string; declarado: number }>();
    filas
      .filter((f) => !f.excluida)
      .forEach((f) => {
        const clave = f.orden_id;
        if (!porOrden.has(clave)) {
          porOrden.set(clave, {
            anunciante: f.nombre_anunciante || f.anunciante,
            numeroOrden: f.numero_orden_agencia || f.numero_orden,
            declarado: 0,
          });
        }
        porOrden.get(clave)!.declarado += Number(f.monto) || 0;
      });
    const lineas = Array.from(porOrden.values())
      .filter((l) => l.declarado !== 0)
      .map((l) => {
        const comisionVendedor = l.declarado * (condicionVivo.porcentajeComisionVendedor / 100);
        const neto1 = l.declarado - comisionVendedor;
        const canon = neto1 * (condicionVivo.porcentajeCanon / 100);
        const neto2 = neto1 - canon;
        const gastosTop = neto2 * (condicionVivo.porcentajeGastosTop / 100);
        const neto3 = neto2 - gastosTop;
        const comVivo = neto3 * (condicionVivo.porcentajeVivo / 100);
        return {
          anunciante: l.anunciante,
          numero_orden: l.numeroOrden,
          declarado: l.declarado,
          comision_vendedor: comisionVendedor,
          neto1,
          canon,
          neto2,
          gastos_top: gastosTop,
          neto3,
          com_vivo: comVivo,
        };
      });
    return {
      porcentajes: {
        comision_vendedor: condicionVivo.porcentajeComisionVendedor,
        canon: condicionVivo.porcentajeCanon,
        gastos_top: condicionVivo.porcentajeGastosTop,
        vivo: condicionVivo.porcentajeVivo,
      },
      lineas,
      total_a_pagar: lineas.reduce((s, l) => s + l.com_vivo, 0),
    };
  }

  static async calcularEstebanVivoTodos(mes: number, ano: number): Promise<{
    detalle: Array<{ concesionario_id: string; razon_social: string } & NonNullable<Awaited<ReturnType<typeof LiquidacionesService.calcularEstebanVivoConcesionario>>>>;
    total_a_pagar: number;
  }> {
    const concesionarios = await this.listarConcesionariosEstebanVivo();
    const detalle = (
      await Promise.all(
        concesionarios.map(async (c) => {
          const calculo = await this.calcularEstebanVivoConcesionario(c.concesionario_id, mes, ano);
          return calculo ? { concesionario_id: c.concesionario_id, razon_social: c.razon_social, ...calculo } : null;
        })
      )
    ).filter((d): d is NonNullable<typeof d> => d !== null);
    return {
      detalle,
      total_a_pagar: detalle.reduce((s, d) => s + d.total_a_pagar, 0),
    };
  }

  // Iris Chiterer: se queda con un % FLAT de lo declarado por un
  // concesionario en el período (hoy, Terra Uno S.A. — 8%, ver
  // [[project_concesionario_por_punto_no_por_locacion]]) — mismo espíritu
  // que Esteban Vivo (comunicación aislada, solapa propia) pero sin
  // cascada, un solo paso.
  static async obtenerCondicionIrisChiterer(concesionarioId: string): Promise<{ porcentaje: number } | null> {
    const fila = await this.queryGet('SELECT * FROM condiciones_iris_chiterer WHERE concesionario_id = ?', [concesionarioId]);
    if (!fila) return null;
    return { porcentaje: Number(fila.porcentaje) };
  }

  static async guardarCondicionIrisChiterer(concesionarioId: string, porcentaje: number): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_iris_chiterer WHERE concesionario_id = ?', [concesionarioId]);
    if (existente && existente.id) {
      await this.runQuery('UPDATE condiciones_iris_chiterer SET porcentaje = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        porcentaje,
        existente.id,
      ]);
      AuditoriaService.registrarOperacion('condiciones_iris_chiterer', 'UPDATE', existente.id, existente, { porcentaje });
    } else {
      const id = uuid();
      await this.runQuery('INSERT INTO condiciones_iris_chiterer (id, concesionario_id, porcentaje) VALUES (?, ?, ?)', [
        id,
        concesionarioId,
        porcentaje,
      ]);
      AuditoriaService.registrarOperacion('condiciones_iris_chiterer', 'INSERT', id, null, { concesionarioId, porcentaje });
    }
  }

  static async listarConcesionariosIrisChiterer(): Promise<Array<{ concesionario_id: string; razon_social: string }>> {
    return this.queryAll(`
      SELECT ci.concesionario_id, p.razon_social
      FROM condiciones_iris_chiterer ci
      JOIN proveedores p ON p.id = ci.concesionario_id
      ORDER BY p.razon_social
    `);
  }

  static async calcularIrisChitererConcesionario(concesionarioId: string, mes: number, ano: number): Promise<{
    porcentaje: number;
    lineas: Array<{ anunciante: string; numero_orden: string; declarado: number; cut: number }>;
    total_a_pagar: number;
  } | null> {
    const condicion = await this.obtenerCondicionIrisChiterer(concesionarioId);
    if (!condicion) return null;
    const filas = await this.listarPeriodo(concesionarioId, mes, ano);
    const porOrden = new Map<string, { anunciante: string; numeroOrden: string; declarado: number }>();
    filas
      .filter((f) => !f.excluida)
      .forEach((f) => {
        const clave = f.orden_id;
        if (!porOrden.has(clave)) {
          porOrden.set(clave, {
            anunciante: f.nombre_anunciante || f.anunciante,
            numeroOrden: f.numero_orden_agencia || f.numero_orden,
            declarado: 0,
          });
        }
        porOrden.get(clave)!.declarado += Number(f.monto) || 0;
      });
    const lineas = Array.from(porOrden.values())
      .filter((l) => l.declarado !== 0)
      .map((l) => ({
        anunciante: l.anunciante,
        numero_orden: l.numeroOrden,
        declarado: l.declarado,
        cut: l.declarado * (condicion.porcentaje / 100),
      }));
    return {
      porcentaje: condicion.porcentaje,
      lineas,
      total_a_pagar: lineas.reduce((s, l) => s + l.cut, 0),
    };
  }

  static async calcularIrisChitererTodos(mes: number, ano: number): Promise<{
    detalle: Array<{ concesionario_id: string; razon_social: string } & NonNullable<Awaited<ReturnType<typeof LiquidacionesService.calcularIrisChitererConcesionario>>>>;
    total_a_pagar: number;
  }> {
    const concesionarios = await this.listarConcesionariosIrisChiterer();
    const detalle = (
      await Promise.all(
        concesionarios.map(async (c) => {
          const calculo = await this.calcularIrisChitererConcesionario(c.concesionario_id, mes, ano);
          return calculo ? { concesionario_id: c.concesionario_id, razon_social: c.razon_social, ...calculo } : null;
        })
      )
    ).filter((d): d is NonNullable<typeof d> => d !== null);
    return {
      detalle,
      total_a_pagar: detalle.reduce((s, d) => s + d.total_a_pagar, 0),
    };
  }

  // World Padel Pilar (WFPP SRL) — cuenta corriente de comerciales (trueque
  // de spots, no plata). Convive con la liquidación en $ normal, vive
  // embebida en "Liquidar" del mismo concesionario (no en una solapa
  // aparte). Ver [[project_world_padel_cuenta_corriente_comerciales]].
  static async obtenerCondicionComerciales(
    concesionarioId: string
  ): Promise<{ porcentajeConcesionario: number; porcentajeTopview: number } | null> {
    const fila = await this.queryGet('SELECT * FROM condiciones_comerciales WHERE concesionario_id = ?', [concesionarioId]);
    if (!fila) return null;
    return {
      porcentajeConcesionario: Number(fila.porcentaje_concesionario),
      porcentajeTopview: Number(fila.porcentaje_topview),
    };
  }

  static async guardarCondicionComerciales(
    concesionarioId: string,
    datos: { porcentajeConcesionario: number; porcentajeTopview: number }
  ): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_comerciales WHERE concesionario_id = ?', [concesionarioId]);
    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE condiciones_comerciales SET porcentaje_concesionario = ?, porcentaje_topview = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [datos.porcentajeConcesionario, datos.porcentajeTopview, existente.id]
      );
      AuditoriaService.registrarOperacion('condiciones_comerciales', 'UPDATE', existente.id, existente, datos);
    } else {
      const id = uuid();
      await this.runQuery(
        'INSERT INTO condiciones_comerciales (id, concesionario_id, porcentaje_concesionario, porcentaje_topview) VALUES (?, ?, ?, ?)',
        [id, concesionarioId, datos.porcentajeConcesionario, datos.porcentajeTopview]
      );
      AuditoriaService.registrarOperacion('condiciones_comerciales', 'INSERT', id, null, { concesionarioId, ...datos });
    }
  }

  // Cuenta, para un concesionario/período, cuántos "comerciales" (spots,
  // sum(cantidad)) puso cada lado — resolviendo el concesionario por la
  // misma cadena punto → soporte → locación (+ reparto) que
  // listarPeriodo, pero SIN depender de replicaciones_facturacion (acá
  // importa en qué mes corrió la campaña, no el ciclo de facturación real
  // — las que vende el concesionario directo ni siquiera se facturan).
  private static async contarComercialesPeriodo(
    concesionarioId: string,
    mes: number,
    ano: number
  ): Promise<{ ventasTopview: number; ventasConcesionario: number }> {
    const periodoBuscado = `? || '-' || printf('%02d', ?)`;
    const filas = await this.queryAll(
      `
      SELECT
        CASE WHEN o.vendido_por_concesionario = 1 THEN 1 ELSE 0 END as es_concesionario,
        SUM(d.cantidad) as total
      FROM ordenes_publicidad_detalles d
      JOIN locaciones l ON l.id = d.locacion_id
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      LEFT JOIN locaciones_capacidad lc ON lc.locacion_id = d.locacion_id AND lc.producto_id = d.producto_id
      LEFT JOIN locaciones_puntos lp ON lp.capacidad_id = lc.id AND lp.nombre = d.punto_instalacion
      LEFT JOIN locaciones_capacidad_reparto rep ON rep.capacidad_id = lc.id AND rep.concesionario_id = ?
      WHERE (o.habilitado != 0 OR o.habilitado IS NULL)
        AND (${periodoBuscado}) >= substr(o.periodo_desde, 1, 7)
        AND (${periodoBuscado}) <= substr(o.periodo_hasta, 1, 7)
        AND (
          rep.concesionario_id = ?
          OR (
            NOT EXISTS (SELECT 1 FROM locaciones_capacidad_reparto r2 WHERE r2.capacidad_id = lc.id)
            AND COALESCE(lp.concesionario_id, lc.concesionario_id, l.concesionario_id) = ?
          )
        )
      GROUP BY es_concesionario
      `,
      [concesionarioId, ano, mes, ano, mes, concesionarioId, concesionarioId]
    );
    const topview = filas.find((f) => f.es_concesionario === 0);
    const concesionario = filas.find((f) => f.es_concesionario === 1);
    return {
      ventasTopview: topview ? Number(topview.total) || 0 : 0,
      ventasConcesionario: concesionario ? Number(concesionario.total) || 0 : 0,
    };
  }

  static async calcularCuentaCorrienteComerciales(
    concesionarioId: string,
    mes: number,
    ano: number
  ): Promise<{
    porcentaje_concesionario: number;
    porcentaje_topview: number;
    meses: Array<{
      mes: number;
      ano: number;
      ventas_topview: number;
      ventas_concesionario: number;
      diferencia_mes: number;
      saldo_acumulado: number;
    }>;
    saldo_acumulado: number;
  } | null> {
    const condicion = await this.obtenerCondicionComerciales(concesionarioId);
    if (!condicion) return null;

    const primerMes = await this.queryGet(
      `
      SELECT MIN(substr(o.periodo_desde, 1, 7)) as inicio
      FROM ordenes_publicidad_detalles d
      JOIN locaciones l ON l.id = d.locacion_id
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      LEFT JOIN locaciones_capacidad lc ON lc.locacion_id = d.locacion_id AND lc.producto_id = d.producto_id
      LEFT JOIN locaciones_puntos lp ON lp.capacidad_id = lc.id AND lp.nombre = d.punto_instalacion
      LEFT JOIN locaciones_capacidad_reparto rep ON rep.capacidad_id = lc.id AND rep.concesionario_id = ?
      WHERE (o.habilitado != 0 OR o.habilitado IS NULL)
        AND (
          rep.concesionario_id = ?
          OR (
            NOT EXISTS (SELECT 1 FROM locaciones_capacidad_reparto r2 WHERE r2.capacidad_id = lc.id)
            AND COALESCE(lp.concesionario_id, lc.concesionario_id, l.concesionario_id) = ?
          )
        )
      `,
      [concesionarioId, concesionarioId, concesionarioId]
    );

    const base = { porcentaje_concesionario: condicion.porcentajeConcesionario, porcentaje_topview: condicion.porcentajeTopview };
    if (!primerMes || !primerMes.inicio) {
      return { ...base, meses: [], saldo_acumulado: 0 };
    }

    const [anoInicio, mesInicio] = String(primerMes.inicio).split('-').map(Number);
    const meses: Array<{
      mes: number;
      ano: number;
      ventas_topview: number;
      ventas_concesionario: number;
      diferencia_mes: number;
      saldo_acumulado: number;
    }> = [];
    let saldo = 0;
    let anoActual = anoInicio;
    let mesActual = mesInicio;
    // Tope defensivo (10 años) para nunca loopear infinito si algo raro
    // pasa con las fechas de las órdenes.
    let iteraciones = 0;
    while ((anoActual < ano || (anoActual === ano && mesActual <= mes)) && iteraciones < 120) {
      const { ventasTopview, ventasConcesionario } = await this.contarComercialesPeriodo(concesionarioId, mesActual, anoActual);
      const totalImplicito = condicion.porcentajeConcesionario > 0 ? ventasConcesionario / (condicion.porcentajeConcesionario / 100) : 0;
      const cuotaTopview = totalImplicito * (condicion.porcentajeTopview / 100);
      const diferenciaMes = cuotaTopview - ventasTopview;
      saldo += diferenciaMes;
      meses.push({
        mes: mesActual,
        ano: anoActual,
        ventas_topview: ventasTopview,
        ventas_concesionario: ventasConcesionario,
        diferencia_mes: diferenciaMes,
        saldo_acumulado: saldo,
      });
      mesActual++;
      if (mesActual > 12) {
        mesActual = 1;
        anoActual++;
      }
      iteraciones++;
    }

    return { ...base, meses, saldo_acumulado: saldo };
  }

  // Reutilizado por Oxant (necesita el Canon de 3 concesionarios distintos
  // para el mismo período) y equivalente al cálculo que ya hace
  // GET /api/liquidaciones para un solo concesionario — mismo criterio
  // (declarado por sección × % de Canon), sin duplicarlo ahí para no tocar
  // ese endpoint ya validado.
  static async calcularTotalFinalConcesionario(concesionarioId: string, mes: number, ano: number): Promise<number> {
    const filas = await this.listarPeriodo(concesionarioId, mes, ano);
    const manuales = await this.listarManuales(concesionarioId, mes, ano);
    const condicion = await this.obtenerCondicion(concesionarioId);
    const declaradoPublicidad =
      filas.filter((f) => !f.excluida && f.seccion === 'publicidad').reduce((s, f) => s + (Number(f.monto) || 0), 0) +
      manuales.reduce((s, m) => s + (m.tipo === 'resta' ? -(Number(m.monto) || 0) : Number(m.monto) || 0), 0);
    const declaradoStand = filas
      .filter((f) => !f.excluida && f.seccion === 'stand')
      .reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const canonPublicidad = declaradoPublicidad * (condicion.porcentajeComision / 100);
    const canonStand = declaradoStand * (condicion.porcentajeComision / 100);
    return canonPublicidad + canonStand;
  }

  // Oxant cobra sobre la SUMA del Canon de varios concesionarios a la vez
  // (hoy CECNOR SA, WFPP SRL, PILAR SHOPS S.A. — ver oxant_concesionarios),
  // no por concesionario individual. Confirmado contra una liquidación real
  // de Oxant: % de comisión sobre esa suma + IVA propio de Oxant sobre la
  // comisión (no el IVA/percepciones de cada concesionario).
  static async obtenerCondicionOxant(): Promise<{ porcentajeComision: number; ivaPorcentaje: number }> {
    const fila = await this.queryGet('SELECT * FROM condiciones_oxant LIMIT 1');
    return {
      porcentajeComision: fila ? Number(fila.porcentaje_comision) : 6,
      ivaPorcentaje: fila ? Number(fila.iva_porcentaje) : 21,
    };
  }

  static async guardarCondicionOxant(datos: { porcentajeComision: number; ivaPorcentaje: number }): Promise<void> {
    const existente = await this.queryGet('SELECT * FROM condiciones_oxant LIMIT 1');
    if (existente && existente.id) {
      await this.runQuery(
        'UPDATE condiciones_oxant SET porcentaje_comision = ?, iva_porcentaje = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [datos.porcentajeComision, datos.ivaPorcentaje, existente.id]
      );
      AuditoriaService.registrarOperacion('condiciones_oxant', 'UPDATE', existente.id, existente, datos);
    } else {
      const id = uuid();
      await this.runQuery('INSERT INTO condiciones_oxant (id, porcentaje_comision, iva_porcentaje) VALUES (?, ?, ?)', [
        id,
        datos.porcentajeComision,
        datos.ivaPorcentaje,
      ]);
      AuditoriaService.registrarOperacion('condiciones_oxant', 'INSERT', id, null, datos);
    }
  }

  static async listarConcesionariosOxant(): Promise<Array<{ concesionario_id: string; razon_social: string }>> {
    return this.queryAll(`
      SELECT oc.concesionario_id, p.razon_social
      FROM oxant_concesionarios oc
      JOIN proveedores p ON p.id = oc.concesionario_id
      ORDER BY p.razon_social
    `);
  }

  static async calcularOxant(mes: number, ano: number): Promise<{
    porcentaje_comision: number;
    iva_porcentaje: number;
    detalle: Array<{ concesionario_id: string; razon_social: string; canon: number }>;
    total_canon: number;
    comision: number;
    iva: number;
    total_a_pagar: number;
  }> {
    const condicion = await this.obtenerCondicionOxant();
    const concesionarios = await this.listarConcesionariosOxant();
    const detalle = await Promise.all(
      concesionarios.map(async (c) => ({
        concesionario_id: c.concesionario_id,
        razon_social: c.razon_social,
        canon: await this.calcularTotalFinalConcesionario(c.concesionario_id, mes, ano),
      }))
    );
    const totalCanon = detalle.reduce((s, d) => s + d.canon, 0);
    const comision = totalCanon * (condicion.porcentajeComision / 100);
    const iva = comision * (condicion.ivaPorcentaje / 100);
    return {
      porcentaje_comision: condicion.porcentajeComision,
      iva_porcentaje: condicion.ivaPorcentaje,
      detalle,
      total_canon: totalCanon,
      comision,
      iva,
      total_a_pagar: comision + iva,
    };
  }

  static async agregarPercepcion(
    concesionarioId: string,
    nombre: string,
    porcentaje: number,
    tipo?: 'suma' | 'resta'
  ): Promise<any> {
    if (!nombre || !nombre.trim()) throw new Error('El nombre de la percepción es obligatorio.');
    const id = uuid();
    await this.runQuery(
      'INSERT INTO condiciones_percepciones (id, concesionario_id, nombre, porcentaje, tipo) VALUES (?, ?, ?, ?, ?)',
      [id, concesionarioId, nombre.trim(), porcentaje || 0, tipo === 'resta' ? 'resta' : 'suma']
    );
    AuditoriaService.registrarOperacion('condiciones_percepciones', 'INSERT', id, null, { concesionarioId, nombre, porcentaje, tipo });
    return this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
  }

  static async actualizarPercepcion(id: string, nombre: string, porcentaje: number, tipo?: 'suma' | 'resta'): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM condiciones_percepciones WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa percepción no existe.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre de la percepción es obligatorio.');
    await this.runQuery(
      'UPDATE condiciones_percepciones SET nombre = ?, porcentaje = ?, tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nombre.trim(), porcentaje || 0, tipo === 'resta' ? 'resta' : 'suma', id]
    );
    AuditoriaService.registrarOperacion('condiciones_percepciones', 'UPDATE', id, existente, { nombre, porcentaje, tipo });
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
  // Resolución de "a quién le corresponde esta línea" — de más a menos
  // específico: locaciones_puntos.concesionario_id (un punto con dueño
  // propio) → locaciones_capacidad.concesionario_id (el soporte entero de
  // esa locación) → locaciones.concesionario_id (como siempre, para
  // locaciones simples con un solo dueño). Además, si el SOPORTE tiene
  // reparto cargado (locaciones_capacidad_reparto — ej. Circuito Pantallas
  // LED Verticales de Bahía Nordelta, que se vende siempre completo pero se
  // reparte entre 2 dueños), la línea entra en la liquidación de CADA
  // concesionario del reparto, con el monto multiplicado por su % — en vez
  // de por el dueño único. Ver [[project_concesionario_por_punto_no_por_locacion]].
  //
  // Órdenes "No registradas" (facturado=0, ej. Pequeños Anunciantes en
  // efectivo) NUNCA tienen fila en replicaciones_facturacion — esa tabla es
  // del ciclo de facturación real (Colppy), que a ellas no les aplica. Pero
  // igual usan un soporte físico real, así que Topview le sigue debiendo el
  // Canon al concesionario por esas líneas. Para esas, el mes/año se
  // resuelve directo contra el período de la orden (periodo_desde/hasta) en
  // vez de contra replicaciones_facturacion.
  static async listarPeriodo(concesionarioId: string, mes: number, ano: number): Promise<any[]> {
    const esInicioTardio = `
      CASE
        WHEN CAST(strftime('%Y', o.periodo_desde) AS INTEGER) = ?
         AND CAST(strftime('%m', o.periodo_desde) AS INTEGER) = ?
         AND CAST(strftime('%d', o.periodo_desde) AS INTEGER) > 15
        THEN 1 ELSE 0
      END
    `;
    const periodoBuscado = `? || '-' || printf('%02d', ?)`;
    const filas = await this.queryAll(
      `
      SELECT
        d.id as detalle_id,
        o.id as orden_id,
        o.numero_orden,
        o.numero_orden_agencia,
        o.razon_social as anunciante,
        o.nombre_anunciante,
        o.periodo_desde,
        o.periodo_hasta,
        d.tipo_producto,
        d.cantidad,
        d.punto_instalacion,
        l.id as locacion_id,
        l.nombre as locacion_nombre,
        ld.id as liquidacion_id,
        CASE WHEN rep.concesionario_id IS NOT NULL THEN COALESCE(ld.monto, 0) * rep.porcentaje / 100.0 ELSE COALESCE(ld.monto, 0) END as monto,
        ld.estado_especial as estado_especial,
        CASE WHEN d.tipo_producto = 'Stand' THEN 'stand' ELSE 'publicidad' END as seccion,
        ${esInicioTardio} as inicio_tardio,
        COALESCE(ld.excluida, ${esInicioTardio}) as excluida
      FROM ordenes_publicidad_detalles d
      JOIN locaciones l ON l.id = d.locacion_id
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      LEFT JOIN replicaciones_facturacion r ON r.orden_id = o.id AND r.numero_mes = ? AND r.ano = ?
      LEFT JOIN liquidaciones_detalle ld ON ld.orden_detalle_id = d.id AND ld.mes = ? AND ld.ano = ?
      LEFT JOIN locaciones_capacidad lc ON lc.locacion_id = d.locacion_id AND lc.producto_id = d.producto_id
      LEFT JOIN locaciones_puntos lp ON lp.capacidad_id = lc.id AND lp.nombre = d.punto_instalacion
      LEFT JOIN locaciones_capacidad_reparto rep ON rep.capacidad_id = lc.id AND rep.concesionario_id = ?
      WHERE (o.habilitado != 0 OR o.habilitado IS NULL)
        AND (
          r.orden_id IS NOT NULL
          OR (
            o.facturado = 0
            AND (${periodoBuscado}) >= substr(o.periodo_desde, 1, 7)
            AND (${periodoBuscado}) <= substr(o.periodo_hasta, 1, 7)
          )
        )
        AND (
          rep.concesionario_id = ?
          OR (
            NOT EXISTS (SELECT 1 FROM locaciones_capacidad_reparto r2 WHERE r2.capacidad_id = lc.id)
            AND COALESCE(lp.concesionario_id, lc.concesionario_id, l.concesionario_id) = ?
          )
        )
      ORDER BY l.nombre, o.razon_social
      `,
      [ano, mes, ano, mes, mes, ano, mes, ano, concesionarioId, ano, mes, ano, mes, concesionarioId, concesionarioId]
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
    tipo?: 'suma' | 'resta';
  }): Promise<any> {
    if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');
    const id = uuid();
    await this.runQuery(
      'INSERT INTO liquidaciones_manuales (id, concesionario_id, mes, ano, descripcion, monto, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, datos.concesionario_id, datos.mes, datos.ano, datos.descripcion.trim(), datos.monto || 0, datos.tipo === 'resta' ? 'resta' : 'suma']
    );
    AuditoriaService.registrarOperacion('liquidaciones_manuales', 'INSERT', id, null, datos);
    return this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
  }

  static async actualizarLineaManual(
    id: string,
    datos: { descripcion: string; monto: number; tipo?: 'suma' | 'resta' }
  ): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM liquidaciones_manuales WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Esa línea manual no existe.');
    if (!datos.descripcion || !datos.descripcion.trim()) throw new Error('La descripción es obligatoria.');
    await this.runQuery(
      'UPDATE liquidaciones_manuales SET descripcion = ?, monto = ?, tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [datos.descripcion.trim(), datos.monto || 0, datos.tipo === 'resta' ? 'resta' : 'suma', id]
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
