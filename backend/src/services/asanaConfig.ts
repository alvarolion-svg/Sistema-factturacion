import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../dbHelpers';

interface FilaConfig {
  valor: string;
}

interface RespuestaAsana<T> {
  data?: T;
}

export interface SeccionMes {
  id: string;
  ano: number;
  mes: number;
  seccion_gid: string;
  seccion_nombre: string | null;
}

/**
 * Configuración de a dónde va cada tarea de Asana — proyecto activo +
 * sección de cada mes/año. Se administra desde la solapa "Asana" (en vez de
 * quedar hardcodeada en asana.ts) para poder ir agregando el mes/año que
 * corresponda sin tocar código.
 */
export class AsanaConfigService {
  static async obtenerProyecto(): Promise<{ gid: string | null; nombre: string | null }> {
    const filaGid = await dbGet<FilaConfig>(`SELECT valor FROM asana_config WHERE clave = 'proyecto_gid'`);
    const filaNombre = await dbGet<FilaConfig>(`SELECT valor FROM asana_config WHERE clave = 'proyecto_nombre'`);
    return { gid: filaGid?.valor || null, nombre: filaNombre?.valor || null };
  }

  static async setProyecto(gid: string, nombre: string): Promise<void> {
    await dbRun(`INSERT INTO asana_config (clave, valor) VALUES ('proyecto_gid', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`, [
      gid,
    ]);
    await dbRun(
      `INSERT INTO asana_config (clave, valor) VALUES ('proyecto_nombre', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
      [nombre]
    );
  }

  static async listarSecciones(): Promise<SeccionMes[]> {
    return dbAll<SeccionMes>(`SELECT * FROM asana_secciones_mes ORDER BY ano, mes`);
  }

  static async obtenerSeccion(ano: number, mes: number): Promise<SeccionMes | null> {
    const fila = await dbGet<SeccionMes>(`SELECT * FROM asana_secciones_mes WHERE ano = ? AND mes = ?`, [ano, mes]);
    return fila || null;
  }

  static async guardarSeccion(ano: number, mes: number, seccionGid: string, seccionNombre: string): Promise<void> {
    const existente = await this.obtenerSeccion(ano, mes);
    if (existente) {
      await dbRun(`UPDATE asana_secciones_mes SET seccion_gid = ?, seccion_nombre = ? WHERE id = ?`, [
        seccionGid,
        seccionNombre,
        existente.id,
      ]);
    } else {
      await dbRun(`INSERT INTO asana_secciones_mes (id, ano, mes, seccion_gid, seccion_nombre) VALUES (?, ?, ?, ?, ?)`, [
        uuid(),
        ano,
        mes,
        seccionGid,
        seccionNombre,
      ]);
    }
  }

  static async eliminarSeccion(id: string): Promise<void> {
    await dbRun(`DELETE FROM asana_secciones_mes WHERE id = ?`, [id]);
  }

  private static headers(): Record<string, string> {
    const token = process.env.ASANA_ACCESS_TOKEN;
    if (!token) {
      throw new Error('Falta configurar ASANA_ACCESS_TOKEN en el .env del backend.');
    }
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  /**
   * Lista los proyectos reales del workspace de Asana (para elegir el
   * proyecto activo desde un desplegable en vez de tipear un GID a ciegas).
   */
  static async listarProyectosDisponibles(): Promise<Array<{ gid: string; name: string }>> {
    const headers = this.headers();
    const respMe = await fetch('https://app.asana.com/api/1.0/users/me?opt_fields=workspaces.gid', { headers });
    if (!respMe.ok) throw new Error(`Asana rechazó consultar el workspace (${respMe.status}): ${await respMe.text()}`);
    const me = (await respMe.json()) as RespuestaAsana<{ workspaces?: Array<{ gid: string }> }>;
    const workspaceGid = me.data?.workspaces?.[0]?.gid;
    if (!workspaceGid) throw new Error('No se encontró un workspace de Asana para este token.');

    const respProyectos = await fetch(
      `https://app.asana.com/api/1.0/projects?workspace=${workspaceGid}&opt_fields=name&limit=100`,
      { headers }
    );
    if (!respProyectos.ok) throw new Error(`Asana rechazó listar proyectos (${respProyectos.status}): ${await respProyectos.text()}`);
    const proyectos = (await respProyectos.json()) as RespuestaAsana<Array<{ gid: string; name: string }>>;
    return (proyectos.data || []).map((p) => ({ gid: p.gid, name: p.name }));
  }

  /**
   * Lista las secciones reales de un proyecto de Asana (para elegir la
   * sección de un mes desde un desplegable en vez de tipear un GID).
   */
  static async listarSeccionesDisponibles(proyectoGid: string): Promise<Array<{ gid: string; name: string }>> {
    const headers = this.headers();
    const resp = await fetch(`https://app.asana.com/api/1.0/projects/${proyectoGid}/sections?opt_fields=name`, { headers });
    if (!resp.ok) throw new Error(`Asana rechazó listar las secciones (${resp.status}): ${await resp.text()}`);
    const data = (await resp.json()) as RespuestaAsana<Array<{ gid: string; name: string }>>;
    return (data.data || []).map((s) => ({ gid: s.gid, name: s.name }));
  }
}
