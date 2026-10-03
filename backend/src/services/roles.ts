import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../dbHelpers';
import { ErrorNegocio } from '../errores';

const ROL_SUPERUSUARIO = '1';

export interface RolListado {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  habilitado: number;
  cantidad_permisos: number;
  cantidad_usuarios: number;
}

export interface PermisoCatalogo {
  id: string;
  codigo: string;
  descripcion: string | null;
  seccion: string;
  accion: string;
}

export interface DatosRol {
  nombre?: string;
  descripcion?: string;
  nivel?: number;
  permisos?: string[];
}

// Roles y permisos. El rol 1 (Superusuario) está blindado: no se puede editar,
// deshabilitar ni crear otro de nivel 1, y siempre tiene todos los permisos
// (los completa el arranque del backend, ver database.ts).
export class RolesService {
  static async listar(): Promise<RolListado[]> {
    return dbAll<RolListado>(`
      SELECT r.id, r.nombre, r.descripcion, r.nivel, r.habilitado,
             (SELECT COUNT(*) FROM rol_permisos rp WHERE rp.rol_id = r.id) AS cantidad_permisos,
             (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS cantidad_usuarios
      FROM roles r
      WHERE r.habilitado = 1
      ORDER BY r.nivel, r.nombre
    `);
  }

  static async listarPermisos(): Promise<PermisoCatalogo[]> {
    return dbAll<PermisoCatalogo>('SELECT id, codigo, descripcion, seccion, accion FROM permisos ORDER BY seccion, codigo');
  }

  static async obtener(id: string): Promise<RolListado & { permisos: string[] }> {
    const rol = (await this.listar()).find((r) => r.id === id);
    if (!rol) throw new ErrorNegocio('Rol no encontrado.');
    const permisos = await dbAll<{ permiso_id: string }>('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [id]);
    return { ...rol, permisos: permisos.map((p) => p.permiso_id) };
  }

  private static async validar(datos: DatosRol, idActual?: string): Promise<{ nombre: string; descripcion: string | null; nivel: number; permisos: string[] }> {
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw new ErrorNegocio('El nombre del rol es obligatorio.');
    const nivel = Number(datos.nivel);
    if (!Number.isInteger(nivel) || nivel < 2 || nivel > 99) {
      throw new ErrorNegocio('El nivel tiene que ser un número entre 2 y 99 (el 1 es solo del Superusuario).');
    }
    const repetido = await dbGet<{ id: string }>('SELECT id FROM roles WHERE lower(nombre) = lower(?) AND id != ?', [nombre, idActual || '']);
    if (repetido) throw new ErrorNegocio('Ya hay un rol con ese nombre.');
    const permisos = Array.from(new Set(datos.permisos || []));
    if (permisos.length > 0) {
      const existentes = await dbAll<{ id: string }>(`SELECT id FROM permisos WHERE id IN (${permisos.map(() => '?').join(',')})`, permisos);
      if (existentes.length !== permisos.length) throw new ErrorNegocio('Alguno de los permisos elegidos no existe.');
    }
    return { nombre, descripcion: (datos.descripcion || '').trim() || null, nivel, permisos };
  }

  private static async guardarPermisos(rolId: string, permisos: string[]): Promise<void> {
    await dbRun('DELETE FROM rol_permisos WHERE rol_id = ?', [rolId]);
    for (const permisoId of permisos) {
      await dbRun('INSERT INTO rol_permisos (id, rol_id, permiso_id) VALUES (?, ?, ?)', [`rp_${rolId}_${permisoId}`, rolId, permisoId]);
    }
    // Un rol creado o editado desde la pantalla ya no se siembra por reglas.
    await dbRun('INSERT OR IGNORE INTO roles_sembrados (rol_id) VALUES (?)', [rolId]);
  }

  static async crear(datos: DatosRol): Promise<string> {
    const v = await this.validar(datos);
    const id = uuid();
    await dbRun('INSERT INTO roles (id, nombre, descripcion, nivel) VALUES (?, ?, ?, ?)', [id, v.nombre, v.descripcion, v.nivel]);
    await this.guardarPermisos(id, v.permisos);
    return id;
  }

  static async actualizar(id: string, datos: DatosRol): Promise<void> {
    if (id === ROL_SUPERUSUARIO) throw new ErrorNegocio('El rol Superusuario no se puede modificar.');
    const existente = await dbGet<{ id: string }>('SELECT id FROM roles WHERE id = ? AND habilitado = 1', [id]);
    if (!existente) throw new ErrorNegocio('Rol no encontrado.');
    const v = await this.validar(datos, id);
    await dbRun('UPDATE roles SET nombre = ?, descripcion = ?, nivel = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [v.nombre, v.descripcion, v.nivel, id]);
    await this.guardarPermisos(id, v.permisos);
  }

  // Baja lógica: si el rol tiene usuarios asignados no se puede.
  static async eliminar(id: string): Promise<void> {
    if (id === ROL_SUPERUSUARIO) throw new ErrorNegocio('El rol Superusuario no se puede eliminar.');
    const existente = await dbGet<{ id: string }>('SELECT id FROM roles WHERE id = ? AND habilitado = 1', [id]);
    if (!existente) throw new ErrorNegocio('Rol no encontrado.');
    const usuarios = await dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM usuarios WHERE rol_id = ?', [id]);
    if ((usuarios?.c ?? 0) > 0) {
      throw new ErrorNegocio('Ese rol tiene usuarios asignados: primero cambiales el rol.');
    }
    await dbRun('UPDATE roles SET habilitado = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }
}
