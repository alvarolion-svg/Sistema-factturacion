import { v4 as uuid } from 'uuid';
import db from '../database';
import { AuditoriaService } from './auditoria';

interface PuntoInput {
  nombre: string;
  cantidad: number;
}

interface AgregarSoporteInput {
  producto_id: string;
  cantidad: number;
  puntos?: PuntoInput[];
}

// Catálogo de lugares físicos donde Topview tiene soportes instalados. Cada
// locación tiene un concesionario (proveedor al que se le paga por el
// espacio) y un inventario de soportes con cantidad — opcionalmente
// desglosado en puntos de instalación con nombre propio (ver comentario en
// database.ts). De acá sale, sin cargar nada dos veces, tanto lo que se
// puede elegir al armar una línea de orden como los futuros reportes de
// liquidaciones y demanda/ocupación.
export class LocacionesService {
  private static queryAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, filas: any[]) => (err ? reject(err) : resolve(filas || [])));
    });
  }

  private static queryGet(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, fila: any) => (err ? reject(err) : resolve(fila || {})));
    });
  }

  private static runQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  }

  // Trae todo anidado (soportes + puntos) de una sola pasada — el catálogo
  // de locaciones es chico, no hace falta pedir el detalle una por una.
  static async listarLocaciones(): Promise<any[]> {
    const locaciones = await this.queryAll(`
      SELECT l.*, p.razon_social as concesionario_nombre
      FROM locaciones l
      LEFT JOIN proveedores p ON p.id = l.concesionario_id
      WHERE l.habilitado != 0 OR l.habilitado IS NULL
      ORDER BY l.nombre
    `);
    const capacidades = await this.queryAll(`
      SELECT c.*, pr.nombre as producto_nombre, pr.codigo as producto_codigo
      FROM locaciones_capacidad c
      JOIN productos pr ON pr.id = c.producto_id
      ORDER BY pr.nombre
    `);
    const puntos = await this.queryAll(`SELECT * FROM locaciones_puntos ORDER BY nombre`);

    const puntosPorCapacidad = new Map<string, any[]>();
    puntos.forEach((p) => {
      if (!puntosPorCapacidad.has(p.capacidad_id)) puntosPorCapacidad.set(p.capacidad_id, []);
      puntosPorCapacidad.get(p.capacidad_id)!.push(p);
    });

    const capacidadesPorLocacion = new Map<string, any[]>();
    capacidades.forEach((c) => {
      const susPuntos = puntosPorCapacidad.get(c.id) || [];
      const cantidad = susPuntos.length > 0 ? susPuntos.reduce((s, p) => s + p.cantidad, 0) : c.cantidad;
      if (!capacidadesPorLocacion.has(c.locacion_id)) capacidadesPorLocacion.set(c.locacion_id, []);
      capacidadesPorLocacion.get(c.locacion_id)!.push({ ...c, cantidad, puntos: susPuntos });
    });

    return locaciones.map((l) => {
      const soportes = capacidadesPorLocacion.get(l.id) || [];
      return { ...l, soportes, cantidad_soportes: soportes.length };
    });
  }

  static async obtenerLocacion(id: string): Promise<any> {
    const locacion = await this.queryGet(
      `
      SELECT l.*, p.razon_social as concesionario_nombre
      FROM locaciones l
      LEFT JOIN proveedores p ON p.id = l.concesionario_id
      WHERE l.id = ?
    `,
      [id]
    );
    if (!locacion || !locacion.id) throw new Error('Locación no encontrada.');

    const capacidades = await this.queryAll(
      `
      SELECT c.*, pr.nombre as producto_nombre, pr.codigo as producto_codigo
      FROM locaciones_capacidad c
      JOIN productos pr ON pr.id = c.producto_id
      WHERE c.locacion_id = ?
      ORDER BY pr.nombre
    `,
      [id]
    );
    const puntos = await this.queryAll(
      `
      SELECT lp.* FROM locaciones_puntos lp
      JOIN locaciones_capacidad c ON c.id = lp.capacidad_id
      WHERE c.locacion_id = ?
      ORDER BY lp.nombre
    `,
      [id]
    );
    const puntosPorCapacidad = new Map<string, any[]>();
    puntos.forEach((p) => {
      if (!puntosPorCapacidad.has(p.capacidad_id)) puntosPorCapacidad.set(p.capacidad_id, []);
      puntosPorCapacidad.get(p.capacidad_id)!.push(p);
    });

    const soportes = capacidades.map((c) => {
      const susPuntos = puntosPorCapacidad.get(c.id) || [];
      const cantidad = susPuntos.length > 0 ? susPuntos.reduce((s, p) => s + p.cantidad, 0) : c.cantidad;
      return { ...c, cantidad, puntos: susPuntos };
    });

    return { ...locacion, soportes };
  }

  static async crearLocacion(datos: { nombre: string; tipo?: string; concesionario_id?: string; notas?: string }): Promise<any> {
    if (!datos.nombre || !datos.nombre.trim()) throw new Error('El nombre de la locación es obligatorio.');
    const id = uuid();
    await this.runQuery(
      `INSERT INTO locaciones (id, nombre, tipo, concesionario_id, notas) VALUES (?, ?, ?, ?, ?)`,
      [id, datos.nombre.trim(), datos.tipo || null, datos.concesionario_id || null, datos.notas || null]
    );
    AuditoriaService.registrarOperacion('locaciones', 'INSERT', id, null, datos);
    return this.obtenerLocacion(id);
  }

  static async actualizarLocacion(
    id: string,
    datos: { nombre?: string; tipo?: string; concesionario_id?: string; notas?: string }
  ): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM locaciones WHERE id = ?', [id]);
    if (!existente || !existente.id) throw new Error('Locación no encontrada.');

    // Solo se actualizan los campos realmente enviados — un PUT parcial (por
    // ejemplo, para asignar nomás el concesionario) no debe borrar el resto.
    const campos: string[] = [];
    const valores: any[] = [];
    if (datos.nombre !== undefined) {
      campos.push('nombre = ?');
      valores.push(datos.nombre);
    }
    if (datos.tipo !== undefined) {
      campos.push('tipo = ?');
      valores.push(datos.tipo || null);
    }
    if (datos.concesionario_id !== undefined) {
      campos.push('concesionario_id = ?');
      valores.push(datos.concesionario_id || null);
    }
    if (datos.notas !== undefined) {
      campos.push('notas = ?');
      valores.push(datos.notas || null);
    }
    campos.push('updated_at = CURRENT_TIMESTAMP');
    valores.push(id);

    await this.runQuery(`UPDATE locaciones SET ${campos.join(', ')} WHERE id = ?`, valores);
    AuditoriaService.registrarOperacion('locaciones', 'UPDATE', id, existente, datos);
    return this.obtenerLocacion(id);
  }

  static async eliminarLocacion(id: string): Promise<void> {
    await this.runQuery('UPDATE locaciones SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    AuditoriaService.registrarOperacion('locaciones', 'DELETE', id, null, { habilitado: 0 });
  }

  static async agregarSoporte(locacionId: string, datos: AgregarSoporteInput): Promise<any> {
    if (!datos.producto_id) throw new Error('El soporte es obligatorio.');
    const capacidadId = uuid();
    const cantidadTope = datos.puntos && datos.puntos.length > 0 ? 0 : Number(datos.cantidad) || 0;
    await this.runQuery(
      `INSERT INTO locaciones_capacidad (id, locacion_id, producto_id, cantidad) VALUES (?, ?, ?, ?)`,
      [capacidadId, locacionId, datos.producto_id, cantidadTope]
    );
    for (const punto of datos.puntos || []) {
      await this.runQuery(
        `INSERT INTO locaciones_puntos (id, capacidad_id, nombre, cantidad) VALUES (?, ?, ?, ?)`,
        [uuid(), capacidadId, punto.nombre, Number(punto.cantidad) || 1]
      );
    }
    AuditoriaService.registrarOperacion('locaciones_capacidad', 'INSERT', capacidadId, null, { locacionId, ...datos });
    return this.obtenerLocacion(locacionId);
  }

  // Cambia cantidad y/o puntos de un soporte ya cargado en una locación —
  // los puntos se reemplazan enteros (se borran los viejos y se insertan los
  // nuevos) porque no tiene sentido tratar de "mergear" nombres puntuales.
  static async actualizarSoporte(capacidadId: string, datos: AgregarSoporteInput): Promise<any> {
    const existente = await this.queryGet('SELECT * FROM locaciones_capacidad WHERE id = ?', [capacidadId]);
    if (!existente || !existente.id) throw new Error('Ese soporte no está cargado en la locación.');
    if (!datos.producto_id) throw new Error('El soporte es obligatorio.');

    const cantidadTope = datos.puntos && datos.puntos.length > 0 ? 0 : Number(datos.cantidad) || 0;
    await this.runQuery(
      `UPDATE locaciones_capacidad SET producto_id = ?, cantidad = ? WHERE id = ?`,
      [datos.producto_id, cantidadTope, capacidadId]
    );
    await this.runQuery('DELETE FROM locaciones_puntos WHERE capacidad_id = ?', [capacidadId]);
    for (const punto of datos.puntos || []) {
      await this.runQuery(
        `INSERT INTO locaciones_puntos (id, capacidad_id, nombre, cantidad) VALUES (?, ?, ?, ?)`,
        [uuid(), capacidadId, punto.nombre, Number(punto.cantidad) || 1]
      );
    }
    AuditoriaService.registrarOperacion('locaciones_capacidad', 'UPDATE', capacidadId, existente, datos);
    return this.obtenerLocacion(existente.locacion_id);
  }

  static async eliminarSoporte(capacidadId: string): Promise<void> {
    const capacidad = await this.queryGet('SELECT * FROM locaciones_capacidad WHERE id = ?', [capacidadId]);
    if (!capacidad || !capacidad.id) throw new Error('Ese soporte no está cargado en la locación.');
    await this.runQuery('DELETE FROM locaciones_puntos WHERE capacidad_id = ?', [capacidadId]);
    await this.runQuery('DELETE FROM locaciones_capacidad WHERE id = ?', [capacidadId]);
    AuditoriaService.registrarOperacion('locaciones_capacidad', 'DELETE', capacidadId, capacidad, null);
  }
}
