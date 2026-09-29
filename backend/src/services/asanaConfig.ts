import { v4 as uuid } from 'uuid';
import db from '../database';

export interface SeccionMes {
  id: string;
  ano: number;
  mes: number;
  seccion_gid: string;
  seccion_nombre: string | null;
}

function queryGet(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows as any[]) || [])));
  });
}

function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Configuración de a dónde va cada tarea de Asana — proyecto activo +
 * sección de cada mes/año. Se administra desde la solapa "Asana" (en vez de
 * quedar hardcodeada en asana.ts) para poder ir agregando el mes/año que
 * corresponda sin tocar código.
 */
export class AsanaConfigService {
  static async obtenerProyecto(): Promise<{ gid: string | null; nombre: string | null }> {
    const filaGid = await queryGet(`SELECT valor FROM asana_config WHERE clave = 'proyecto_gid'`);
    const filaNombre = await queryGet(`SELECT valor FROM asana_config WHERE clave = 'proyecto_nombre'`);
    return { gid: filaGid?.valor || null, nombre: filaNombre?.valor || null };
  }

  static async setProyecto(gid: string, nombre: string): Promise<void> {
    await run(`INSERT INTO asana_config (clave, valor) VALUES ('proyecto_gid', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`, [
      gid,
    ]);
    await run(
      `INSERT INTO asana_config (clave, valor) VALUES ('proyecto_nombre', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
      [nombre]
    );
  }

  static async listarSecciones(): Promise<SeccionMes[]> {
    return queryAll(`SELECT * FROM asana_secciones_mes ORDER BY ano, mes`);
  }

  static async obtenerSeccion(ano: number, mes: number): Promise<SeccionMes | null> {
    const fila = await queryGet(`SELECT * FROM asana_secciones_mes WHERE ano = ? AND mes = ?`, [ano, mes]);
    return fila || null;
  }

  static async guardarSeccion(ano: number, mes: number, seccionGid: string, seccionNombre: string): Promise<void> {
    const existente = await this.obtenerSeccion(ano, mes);
    if (existente) {
      await run(`UPDATE asana_secciones_mes SET seccion_gid = ?, seccion_nombre = ? WHERE id = ?`, [
        seccionGid,
        seccionNombre,
        existente.id,
      ]);
    } else {
      await run(`INSERT INTO asana_secciones_mes (id, ano, mes, seccion_gid, seccion_nombre) VALUES (?, ?, ?, ?, ?)`, [
        uuid(),
        ano,
        mes,
        seccionGid,
        seccionNombre,
      ]);
    }
  }

  static async eliminarSeccion(id: string): Promise<void> {
    await run(`DELETE FROM asana_secciones_mes WHERE id = ?`, [id]);
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
    const me: any = await respMe.json();
    const workspaceGid = me.data?.workspaces?.[0]?.gid;
    if (!workspaceGid) throw new Error('No se encontró un workspace de Asana para este token.');

    const respProyectos = await fetch(
      `https://app.asana.com/api/1.0/projects?workspace=${workspaceGid}&opt_fields=name&limit=100`,
      { headers }
    );
    if (!respProyectos.ok) throw new Error(`Asana rechazó listar proyectos (${respProyectos.status}): ${await respProyectos.text()}`);
    const proyectos: any = await respProyectos.json();
    return (proyectos.data || []).map((p: any) => ({ gid: p.gid, name: p.name }));
  }

  /**
   * Lista las secciones reales de un proyecto de Asana (para elegir la
   * sección de un mes desde un desplegable en vez de tipear un GID).
   */
  static async listarSeccionesDisponibles(proyectoGid: string): Promise<Array<{ gid: string; name: string }>> {
    const headers = this.headers();
    const resp = await fetch(`https://app.asana.com/api/1.0/projects/${proyectoGid}/sections?opt_fields=name`, { headers });
    if (!resp.ok) throw new Error(`Asana rechazó listar las secciones (${resp.status}): ${await resp.text()}`);
    const data: any = await resp.json();
    return (data.data || []).map((s: any) => ({ gid: s.gid, name: s.name }));
  }
}
