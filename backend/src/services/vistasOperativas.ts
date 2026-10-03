import { dbAll, dbGet } from '../dbHelpers';
import { BloqueUbicacion, TopviewService } from './topview';
import { ErrorNegocio } from '../errores';

// Vistas simples para el equipo operativo. Se arman con listas EXPLÍCITAS de
// campos (nunca "SELECT *"), así un campo nuevo con plata no se cuela solo.

interface FilaCampana {
  id: string;
  nombre_anunciante: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  tipo_anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  mes_ingreso: number | null;
  ano_ingreso: number | null;
  created_at: string;
  certificacion_enviada: number | null;
  certificacion_enviada_en: string | null;
  documentos_count: number;
}

export interface Campana extends FilaCampana {
  bloques: BloqueUbicacion[];
}

const COLUMNAS_CAMPANA = `o.id, o.nombre_anunciante, o.numero_orden, o.numero_orden_agencia, o.tipo_anunciante,
  o.periodo_desde, o.periodo_hasta, o.mes_ingreso, o.ano_ingreso, o.created_at,
  o.certificacion_enviada, o.certificacion_enviada_en,
  (SELECT COUNT(*) FROM documentos_adjuntos d WHERE d.orden_id = o.id) AS documentos_count`;

const ORDEN_ACTIVA = `(o.habilitado != 0 OR o.habilitado IS NULL) AND o.tipo_anunciante != 'Pauta Concesionario'`;

const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sumarDias = (fecha: string, dias: number): string => {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export class VistasOperativasService {
  private static async conBloques(filas: FilaCampana[]): Promise<Campana[]> {
    return Promise.all(filas.map(async (f) => ({ ...f, bloques: await TopviewService.obtenerBloquesUbicacion(f.id) })));
  }

  /**
   * Novedades del día para Operaciones: lo que arranca hoy, lo que se cargó en
   * las últimas 48 horas y lo que arranca en los próximos 7 días. Sin montos.
   */
  static async novedadesDelDia(): Promise<{
    hoy: string;
    arrancan_hoy: Campana[];
    nuevas: Campana[];
    proximos_dias: Campana[];
  }> {
    const hoy = hoyLocal();
    const hasta = sumarDias(hoy, 7);
    const arrancanHoy = await dbAll<FilaCampana>(
      `SELECT ${COLUMNAS_CAMPANA} FROM ordenes_publicidad o WHERE ${ORDEN_ACTIVA} AND o.periodo_desde = ? ORDER BY o.nombre_anunciante`,
      [hoy]
    );
    const nuevas = await dbAll<FilaCampana>(
      `SELECT ${COLUMNAS_CAMPANA} FROM ordenes_publicidad o
       WHERE ${ORDEN_ACTIVA} AND o.created_at >= datetime('now', '-48 hours') AND o.periodo_desde != ? AND o.periodo_hasta >= ?
       ORDER BY o.created_at DESC`,
      [hoy, hoy]
    );
    const proximos = await dbAll<FilaCampana>(
      `SELECT ${COLUMNAS_CAMPANA} FROM ordenes_publicidad o
       WHERE ${ORDEN_ACTIVA} AND o.periodo_desde > ? AND o.periodo_desde <= ? ORDER BY o.periodo_desde, o.nombre_anunciante`,
      [hoy, hasta]
    );
    return {
      hoy,
      arrancan_hoy: await this.conBloques(arrancanHoy),
      nuevas: await this.conBloques(nuevas),
      proximos_dias: await this.conBloques(proximos),
    };
  }

  /**
   * Listado de campañas para Tráfico (por mes de ingreso). Sin montos.
   */
  static async campanas(mes?: number, ano?: number): Promise<Campana[]> {
    const filas = await dbAll<FilaCampana>(
      `SELECT ${COLUMNAS_CAMPANA} FROM ordenes_publicidad o
       WHERE ${ORDEN_ACTIVA} AND (? IS NULL OR o.mes_ingreso = ?) AND (? IS NULL OR o.ano_ingreso = ?)
       ORDER BY o.periodo_desde, o.nombre_anunciante`,
      [mes ?? null, mes ?? null, ano ?? null, ano ?? null]
    );
    return this.conBloques(filas);
  }

  /**
   * Datos completos de UNA campaña para armar la documentación (certificación,
   * fotos a redes): todo lo del detalle de la orden MENOS lo económico.
   */
  static async campana(id: string) {
    const fila = await dbGet<FilaCampana & { razon_social: string; leyenda_factura: string | null; notas: string | null; vigencia_hasta_nota: string | null; email_contacto: string | null; cliente_id: string | null }>(
      `SELECT ${COLUMNAS_CAMPANA}, o.razon_social, o.leyenda_factura, o.notas, o.vigencia_hasta_nota, o.email_contacto, o.cliente_id
       FROM ordenes_publicidad o WHERE o.id = ? AND ${ORDEN_ACTIVA}`,
      [id]
    );
    if (!fila) throw new ErrorNegocio('Campaña no encontrada.');
    const [lineas, documentos, contactos, cliente] = await Promise.all([
      dbAll(
        `SELECT d.tipo_producto, d.cantidad, d.ubicacion, d.especificaciones, d.punto_instalacion, l.nombre AS locacion_nombre
         FROM ordenes_publicidad_detalles d LEFT JOIN locaciones l ON l.id = d.locacion_id WHERE d.orden_id = ?`,
        [id]
      ),
      dbAll('SELECT id, nombre_archivo, tipo_archivo, descripcion, fecha_carga FROM documentos_adjuntos WHERE orden_id = ?', [id]),
      dbAll('SELECT email, nombre_contacto, cargo, principal FROM contactos_email WHERE orden_id = ?', [id]),
      fila.cliente_id ? dbGet('SELECT razon_social, cuit, direccion, ciudad FROM clientes WHERE id = ?', [fila.cliente_id]) : Promise.resolve(undefined),
    ]);
    return { ...fila, bloques: await TopviewService.obtenerBloquesUbicacion(id), lineas, documentos, contactos, cliente: cliente ?? null };
  }
}
