import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../database';
import { dbAll, dbGet, dbRun } from '../dbHelpers';
import { Usuario, Sesion, LoginResponse, Permiso, Rol } from '../types';

const BCRYPT_SALT_ROUNDS = 10;

// Lo que verificarToken pone en req.usuario: el usuario con sus permisos como lista de códigos.
export type UsuarioAutenticado = Omit<Usuario, 'permisos'> & { permisos: string[] };

// Fila de la tabla usuarios tal como la devuelve sqlite (`activo` llega como
// 1/0 aunque el tipo Usuario lo declare boolean — se devuelve tal cual, igual
// que antes, para no cambiar lo que ve el frontend).
interface UsuarioFila {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol_id: string;
  departamento?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

const SQL_PERMISOS_DE_ROL = `
  SELECT p.* FROM permisos p
  JOIN rol_permisos rp ON p.id = rp.permiso_id
  WHERE rp.rol_id = ?
`;

export class AutenticacionService {
  /**
   * Migración única: las contraseñas viejas se guardaron con
   * Buffer.from(str).toString('base64') (reversible, no es un hash real).
   * Un hash de bcrypt siempre arranca con "$2" — cualquier fila que no
   * empiece así todavía tiene el formato viejo. Se decodifica el Base64
   * (recupera la contraseña en texto plano, algo que el formato viejo nunca
   * protegió) y se reemplaza por un hash de bcrypt. Corre una vez al
   * arrancar el server (index.ts) y es idempotente — en runs siguientes no
   * encuentra filas para migrar.
   */
  static async migrarPasswordsViejas(): Promise<number> {
    const usuarios = await dbAll<{ id: string; password: string }>(`SELECT id, password FROM usuarios WHERE password NOT LIKE '$2%'`);

    for (const u of usuarios) {
      const passwordPlana = Buffer.from(u.password, 'base64').toString('utf8');
      const nuevoHash = await bcrypt.hash(passwordPlana, BCRYPT_SALT_ROUNDS);
      await dbRun('UPDATE usuarios SET password = ? WHERE id = ?', [nuevoHash, u.id]);
    }

    return usuarios.length;
  }

  /**
   * Login de usuario
   */
  static async login(email: string, password: string, ip?: string): Promise<LoginResponse> {
    const usuario = await dbGet<UsuarioFila>('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]);
    if (!usuario) throw new Error('Usuario o contraseña incorrectos');

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    const rol = await dbGet<Rol>('SELECT * FROM roles WHERE id = ?', [usuario.rol_id]);
    const permisos = await dbAll<Permiso>(SQL_PERMISOS_DE_ROL, [usuario.rol_id]);

    // Crear sesión
    const sesionId = uuid();
    const token = this.generarToken(usuario.id, usuario.email, usuario.rol_id, permisos);
    const fechaExpiracion = new Date();
    fechaExpiracion.setHours(fechaExpiracion.getHours() + 24);

    await dbRun(
      `
        INSERT INTO sesiones (id, usuario_id, token, ip, fecha_expiracion, activa)
        VALUES (?, ?, ?, ?, ?, 1)
      `,
      [sesionId, usuario.id, token, ip || null, fechaExpiracion.toISOString()]
    );

    // Actualizar último login (sin esperar el resultado, como siempre)
    db.run('UPDATE usuarios SET ultimo_login = datetime("now") WHERE id = ?', [usuario.id]);

    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol_id: usuario.rol_id,
        departamento: usuario.departamento,
        rol,
        permisos,
        activo: usuario.activo,
        created_at: usuario.created_at,
        updated_at: usuario.updated_at,
      },
      sesion: {
        id: sesionId,
        usuario_id: usuario.id,
        token,
        fecha_inicio: new Date().toISOString(),
        fecha_expiracion: fechaExpiracion.toISOString(),
        activa: true,
      },
    };
  }

  /**
   * Logout de usuario
   */
  static async logout(token: string): Promise<void> {
    await dbRun('UPDATE sesiones SET activa = 0 WHERE token = ?', [token]);
  }

  /**
   * Obtiene un usuario con su rol y permisos completos (mismo formato que devuelve el login)
   */
  static async obtenerUsuarioCompleto(usuarioId: string): Promise<Usuario> {
    const usuario = await dbGet<UsuarioFila>('SELECT * FROM usuarios WHERE id = ? AND activo = 1', [usuarioId]);
    if (!usuario) throw new Error('Usuario no encontrado');

    const rol = await dbGet<Rol>('SELECT * FROM roles WHERE id = ?', [usuario.rol_id]);
    const permisos = await dbAll<Permiso>(SQL_PERMISOS_DE_ROL, [usuario.rol_id]);

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol_id: usuario.rol_id,
      departamento: usuario.departamento,
      rol,
      permisos,
      activo: usuario.activo,
      created_at: usuario.created_at,
      updated_at: usuario.updated_at,
    };
  }

  /**
   * Verificar token y obtener usuario
   */
  static async verificarToken(token: string): Promise<UsuarioAutenticado> {
    const sesion = await dbGet<UsuarioFila & { usuario_id: string }>(
      `
        SELECT s.*, u.*, r.nombre as rol_nombre
        FROM sesiones s
        JOIN usuarios u ON s.usuario_id = u.id
        LEFT JOIN roles r ON u.rol_id = r.id
        WHERE s.token = ? AND s.activa = 1 AND s.fecha_expiracion > datetime('now')
      `,
      [token]
    );
    if (!sesion) throw new Error('Token inválido o expirado');

    // Obtener permisos
    const permisos = await dbAll<{ codigo: string }>(
      `
            SELECT p.codigo FROM permisos p
            JOIN rol_permisos rp ON p.id = rp.permiso_id
            WHERE rp.rol_id = ?
          `,
      [sesion.rol_id]
    );

    return {
      id: sesion.usuario_id,
      nombre: sesion.nombre,
      email: sesion.email,
      rol_id: sesion.rol_id,
      departamento: sesion.departamento,
      activo: sesion.activo,
      created_at: sesion.created_at,
      updated_at: sesion.updated_at,
      permisos: permisos.map((p) => p.codigo),
    };
  }

  /**
   * Crear usuario
   */
  static async crearUsuario(datos: {
    nombre: string;
    email: string;
    password: string;
    rol_id: string;
    departamento?: string;
  }): Promise<Usuario> {
    const passwordHash = await bcrypt.hash(datos.password, BCRYPT_SALT_ROUNDS);
    const id = uuid();

    await dbRun(
      `
        INSERT INTO usuarios (id, nombre, email, password, rol_id, departamento)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, datos.nombre, datos.email, passwordHash, datos.rol_id, datos.departamento || null]
    );

    // Obtener rol y permisos
    const rol = await dbGet<Rol>('SELECT * FROM roles WHERE id = ?', [datos.rol_id]);
    const permisos = await dbAll<Permiso>(SQL_PERMISOS_DE_ROL, [datos.rol_id]);

    return {
      id,
      nombre: datos.nombre,
      email: datos.email,
      rol_id: datos.rol_id,
      departamento: datos.departamento,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rol,
      permisos,
    };
  }

  /**
   * Cambiar rol de usuario
   */
  static async cambiarRol(usuarioId: string, nuevoRolId: string): Promise<Usuario> {
    await dbRun('UPDATE usuarios SET rol_id = ? WHERE id = ?', [nuevoRolId, usuarioId]);

    const usuario = await dbGet<UsuarioFila>('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) throw new Error('Usuario no encontrado');
    const rol = await dbGet<Rol>('SELECT * FROM roles WHERE id = ?', [nuevoRolId]);
    const permisos = await dbAll<Permiso>(SQL_PERMISOS_DE_ROL, [nuevoRolId]);

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol_id: nuevoRolId,
      departamento: usuario.departamento,
      activo: usuario.activo,
      created_at: usuario.created_at,
      updated_at: new Date().toISOString(),
      rol,
      permisos,
    };
  }

  /**
   * Listar usuarios
   */
  static async listarUsuarios(): Promise<Usuario[]> {
    const usuarios = await dbAll<UsuarioFila & { rol_nombre: string | null }>(`
        SELECT u.*, r.nombre as rol_nombre
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id
        ORDER BY u.nombre
      `);
    return usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol_id: u.rol_id,
      rol_nombre: u.rol_nombre,
      departamento: u.departamento,
      activo: u.activo,
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
  }

  /**
   * Generar token JWT (simulado)
   */
  private static generarToken(usuarioId: string, email: string, rolId: string, permisos: Permiso[]): string {
    const payload = {
      usuario_id: usuarioId,
      email,
      rol_id: rolId,
      permisos: permisos.map((p) => p.codigo),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 horas
    };

    // En producción usar JWT real, esto es una versión simplificada
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Verificar permiso
   */
  static tienePermiso(permisos: string[], permisoRequerido: string): boolean {
    return permisos.includes(permisoRequerido);
  }

  /**
   * Verificar permiso exacto
   */
  static tienePermisoExacto(permisos: string[], permiso: string): boolean {
    return permisos.includes(permiso);
  }
}
