import { dbAll, Parametro } from '../dbHelpers';

export interface FiltrosReporte {
  fecha_inicio?: string;
  fecha_fin?: string;
  estado?: string;
  mes?: number | string;
  ano?: number | string;
  usuario_id?: string;
  tabla?: string;
}

interface FilaFactura {
  total: number;
  saldo: number;
  estado: string;
  validada_arca: number | null;
}

interface FilaCuenta {
  saldo: number;
}

interface FilaConDeuda {
  deuda: number | null;
}

export class ReportesService {
  private static exigirPermiso(permisos: string[], permiso: string, mensaje: string): void {
    if (!permisos.includes(permiso)) throw new Error(mensaje);
  }

  /**
   * Reporte de ventas (filtrado por permisos)
   */
  static async reporteVentas(usuarioId: string, permisos: string[], filtros: FiltrosReporte = {}) {
    this.exigirPermiso(permisos, 'reportes_ventas', 'No tiene permiso para ver reportes de ventas');

    let query = `
        SELECT
          f.numero,
          f.fecha,
          c.razon_social as cliente,
          f.total,
          f.saldo,
          f.estado,
          COUNT(fd.id) as items,
          f.validada_arca
        FROM facturas f
        LEFT JOIN clientes c ON f.cliente_id = c.id
        LEFT JOIN facturas_detalles fd ON f.id = fd.factura_id
        WHERE 1=1
      `;

    const params: Parametro[] = [];

    // Filtro por fecha
    if (filtros.fecha_inicio && filtros.fecha_fin) {
      query += ` AND f.fecha BETWEEN ? AND ?`;
      params.push(filtros.fecha_inicio, filtros.fecha_fin);
    }

    // Filtro por estado
    if (filtros.estado) {
      query += ` AND f.estado = ?`;
      params.push(filtros.estado);
    }

    query += ` GROUP BY f.id ORDER BY f.fecha DESC`;

    const facturas = await dbAll<FilaFactura>(query, params);

    // Calcular totales
    const totales = {
      cantidad: facturas.length,
      monto_total: facturas.reduce((sum, f) => sum + f.total, 0),
      monto_cobrado: facturas.reduce((sum, f) => sum + (f.total - f.saldo), 0),
      monto_pendiente: facturas.filter((f) => f.estado !== 'Anulada').reduce((sum, f) => sum + f.saldo, 0),
      facturas_validadas: facturas.filter((f) => f.validada_arca).length,
    };

    return { datos: facturas, totales, generado_en: new Date().toISOString() };
  }

  /**
   * Reporte de compras
   */
  static async reporteCompras(usuarioId: string, permisos: string[], filtros: FiltrosReporte = {}) {
    this.exigirPermiso(permisos, 'reportes_compras', 'No tiene permiso para ver reportes de compras');

    let query = `
        SELECT
          oc.numero,
          oc.fecha,
          p.razon_social as proveedor,
          oc.total,
          oc.estado
        FROM ordenes_compra oc
        LEFT JOIN proveedores p ON oc.proveedor_id = p.id
        WHERE 1=1
      `;

    const params: Parametro[] = [];

    if (filtros.fecha_inicio && filtros.fecha_fin) {
      query += ` AND oc.fecha BETWEEN ? AND ?`;
      params.push(filtros.fecha_inicio, filtros.fecha_fin);
    }

    query += ` ORDER BY oc.fecha DESC`;

    const compras = await dbAll<{ total: number }>(query, params);

    const totales = {
      cantidad: compras.length,
      monto_total: compras.reduce((sum, c) => sum + c.total, 0),
    };

    return { datos: compras, totales, generado_en: new Date().toISOString() };
  }

  /**
   * Reporte financiero (tesorería)
   */
  static async reporteFinanciero(usuarioId: string, permisos: string[], filtros: FiltrosReporte = {}) {
    this.exigirPermiso(permisos, 'reportes_financieros', 'No tiene permiso para ver reportes financieros');

    // Estado de cuentas
    const cuentas = await dbAll<FilaCuenta>('SELECT * FROM cuentas WHERE habilitada = 1');

    // Movimientos
    const movimientos = await dbAll(`
          SELECT
            DATE(fecha) as fecha,
            COUNT(*) as cantidad,
            SUM(monto) as monto_total
          FROM movimientos
          GROUP BY DATE(fecha)
          ORDER BY fecha DESC
          LIMIT 30
        `);

    return {
      cuentas,
      movimientos,
      saldo_total: cuentas.reduce((sum, c) => sum + c.saldo, 0),
      generado_en: new Date().toISOString(),
    };
  }

  /**
   * Reporte impositivo
   */
  static async reporteImpositiva(usuarioId: string, permisos: string[], filtros: FiltrosReporte = {}) {
    this.exigirPermiso(permisos, 'reportes_impositiva', 'No tiene permiso para ver reportes impositivos');

    const mes = filtros.mes || new Date().getMonth() + 1;
    const ano = filtros.ano || new Date().getFullYear();
    const periodo = [String(mes).padStart(2, '0'), String(ano)];

    // IVA
    const iva = await dbAll<{ tipo: string; total: number }>(
      `
        SELECT
          tipo,
          SUM(monto_iva) as total
        FROM iva_movimientos
        WHERE strftime('%m', fecha) = ? AND strftime('%Y', fecha) = ?
        GROUP BY tipo
      `,
      periodo
    );

    // IIBB
    const iibb = await dbAll<{ total: number | null }>(
      `
            SELECT SUM(monto_iibb) as total
            FROM iibb_movimientos
            WHERE strftime('%m', fecha) = ? AND strftime('%Y', fecha) = ?
          `,
      periodo
    );

    // Percepciones
    const percepciones = await dbAll<{ tipo_percepcion: string; total: number; cantidad: number }>(
      `
                SELECT
                  tipo_percepcion,
                  SUM(monto) as total,
                  COUNT(*) as cantidad
                FROM percepciones
                WHERE strftime('%m', fecha) = ? AND strftime('%Y', fecha) = ?
                GROUP BY tipo_percepcion
              `,
      periodo
    );

    return {
      periodo: `${mes}/${ano}`,
      iva: iva.reduce((acc, item) => ({ ...acc, [item.tipo]: item.total }), {}),
      iibb: iibb[0]?.total || 0,
      percepciones: percepciones.reduce(
        (acc, item) => ({
          ...acc,
          [item.tipo_percepcion]: { total: item.total, cantidad: item.cantidad },
        }),
        {}
      ),
      generado_en: new Date().toISOString(),
    };
  }

  /**
   * Reporte de clientes (deuda, movimientos)
   */
  static async reporteClientes(usuarioId: string, permisos: string[]) {
    this.exigirPermiso(permisos, 'clientes_ver', 'No tiene permiso para ver clientes');

    const clientes = await dbAll<FilaConDeuda>(`
        SELECT
          c.id,
          c.razon_social,
          c.cuit,
          cc.saldo as deuda,
          COUNT(f.id) as cantidad_facturas,
          MAX(f.fecha) as ultima_transaccion
        FROM clientes c
        LEFT JOIN cc_clientes cc ON c.id = cc.cliente_id
        LEFT JOIN facturas f ON c.id = f.cliente_id
        GROUP BY c.id
        ORDER BY cc.saldo DESC
      `);

    const totales = {
      cantidad: clientes.length,
      deuda_total: clientes.reduce((sum, c) => sum + (c.deuda || 0), 0),
    };

    return { datos: clientes, totales, generado_en: new Date().toISOString() };
  }

  /**
   * Reporte de proveedores
   */
  static async reporteProveedores(usuarioId: string, permisos: string[]) {
    this.exigirPermiso(permisos, 'proveedores_ver', 'No tiene permiso para ver proveedores');

    const proveedores = await dbAll<FilaConDeuda>(`
        SELECT
          p.id,
          p.razon_social,
          p.cuit,
          cc.saldo as deuda,
          COUNT(oc.id) as cantidad_ordenes,
          MAX(oc.fecha) as ultima_compra
        FROM proveedores p
        LEFT JOIN cc_proveedores cc ON p.id = cc.proveedor_id
        LEFT JOIN ordenes_compra oc ON p.id = oc.proveedor_id
        GROUP BY p.id
        ORDER BY cc.saldo DESC
      `);

    const totales = {
      cantidad: proveedores.length,
      deuda_total: proveedores.reduce((sum, p) => sum + (p.deuda || 0), 0),
    };

    return { datos: proveedores, totales, generado_en: new Date().toISOString() };
  }

  /**
   * Reporte de auditoría por usuario
   */
  static async reporteAuditoria(usuarioId: string, permisos: string[], filtros: FiltrosReporte = {}) {
    this.exigirPermiso(permisos, 'auditoria_ver', 'No tiene permiso para ver auditoría');

    let query = `
        SELECT *
        FROM auditoria
        WHERE 1=1
      `;

    const params: Parametro[] = [];

    if (filtros.usuario_id) {
      query += ` AND usuario_id = ?`;
      params.push(filtros.usuario_id);
    }

    if (filtros.tabla) {
      query += ` AND tabla = ?`;
      params.push(filtros.tabla);
    }

    if (filtros.fecha_inicio && filtros.fecha_fin) {
      query += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(filtros.fecha_inicio, filtros.fecha_fin);
    }

    query += ` ORDER BY created_at DESC LIMIT 1000`;

    const registros = await dbAll(query, params);

    return { datos: registros, cantidad: registros.length, generado_en: new Date().toISOString() };
  }
}
