import { v4 as uuid } from 'uuid';
import db from '../database';
import { Usuario, Sesion, LoginResponse, Permiso } from '../types';

// Simulación de bcrypt (en producción usar librería real)
const simpleHash = (str: string): string => Buffer.from(str).toString('base64');
const simpleCompare = (plain: string, hash: string): boolean =>
  simpleHash(plain) === hash;

export class AutenticacionService {
  /**
   * Login de usuario
   */
  static async login(email: string, password: string, ip?: string): Promise<LoginResponse> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email], (err, usuario: any) => {
        if (err) return reject(err);
        if (!usuario) return reject(new Error('Usuario o contraseña incorrectos'));

        // Comparar contraseña (en producción usar bcrypt)
        if (!simpleCompare(password, usuario.password)) {
          return reject(new Error('Usuario o contraseña incorrectos'));
        }

        // Obtener rol
        db.get('SELECT * FROM roles WHERE id = ?', [usuario.rol_id], (err, rol: any) => {
          if (err) return reject(err);

          // Obtener permisos del rol
          db.all(
            `
            SELECT p.* FROM permisos p
            JOIN rol_permisos rp ON p.id = rp.permiso_id
            WHERE rp.rol_id = ?
          `,
            [usuario.rol_id],
            (err, permisos: Permiso[]) => {
              if (err) return reject(err);

              // Crear sesión
              const sesionId = uuid();
              const token = this.generarToken(usuario.id, usuario.email, usuario.rol_id, permisos);
              const fechaExpiracion = new Date();
              fechaExpiracion.setHours(fechaExpiracion.getHours() + 24);

              db.run(
                `
                INSERT INTO sesiones (id, usuario_id, token, ip, fecha_expiracion, activa)
                VALUES (?, ?, ?, ?, ?, 1)
              `,
                [sesionId, usuario.id, token, ip || null, fechaExpiracion.toISOString()],
                (err) => {
                  if (err) return reject(err);

                  // Actualizar último login
                  db.run('UPDATE usuarios SET ultimo_login = datetime("now") WHERE id = ?', [usuario.id]);

                  resolve({
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
                  });
                }
              );
            }
          );
        });
      });
    });
  }

  /**
   * Logout de usuario
   */
  static async logout(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('UPDATE sesiones SET activa = 0 WHERE token = ?', [token], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Obtiene un usuario con su rol y permisos completos (mismo formato que devuelve el login)
   */
  static async obtenerUsuarioCompleto(usuarioId: string): Promise<Usuario> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM usuarios WHERE id = ? AND activo = 1', [usuarioId], (err, usuario: any) => {
        if (err) return reject(err);
        if (!usuario) return reject(new Error('Usuario no encontrado'));

        db.get('SELECT * FROM roles WHERE id = ?', [usuario.rol_id], (err, rol: any) => {
          if (err) return reject(err);

          db.all(
            `
            SELECT p.* FROM permisos p
            JOIN rol_permisos rp ON p.id = rp.permiso_id
            WHERE rp.rol_id = ?
          `,
            [usuario.rol_id],
            (err, permisos: Permiso[]) => {
              if (err) return reject(err);

              resolve({
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
              } as any);
            }
          );
        });
      });
    });
  }

  /**
   * Verificar token y obtener usuario
   */
  static async verificarToken(token: string): Promise<Usuario & { permisos: string[] }> {
    return new Promise((resolve, reject) => {
      db.get(
        `
        SELECT s.*, u.*, r.nombre as rol_nombre
        FROM sesiones s
        JOIN usuarios u ON s.usuario_id = u.id
        LEFT JOIN roles r ON u.rol_id = r.id
        WHERE s.token = ? AND s.activa = 1 AND s.fecha_expiracion > datetime('now')
      `,
        [token],
        (err, sesion: any) => {
          if (err) return reject(err);
          if (!sesion) return reject(new Error('Token inválido o expirado'));

          // Obtener permisos
          db.all(
            `
            SELECT p.codigo FROM permisos p
            JOIN rol_permisos rp ON p.id = rp.permiso_id
            WHERE rp.rol_id = ?
          `,
            [sesion.rol_id],
            (err, permisos: any[]) => {
              if (err) return reject(err);

              resolve({
                id: sesion.usuario_id,
                nombre: sesion.nombre,
                email: sesion.email,
                rol_id: sesion.rol_id,
                departamento: sesion.departamento,
                activo: sesion.activo,
                created_at: sesion.created_at,
                updated_at: sesion.updated_at,
                permisos: permisos.map((p) => p.codigo),
              });
            }
          );
        }
      );
    });
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
    return new Promise((resolve, reject) => {
      const id = uuid();
      const passwordHash = simpleHash(datos.password);

      db.run(
        `
        INSERT INTO usuarios (id, nombre, email, password, rol_id, departamento)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [id, datos.nombre, datos.email, passwordHash, datos.rol_id, datos.departamento || null],
        (err) => {
          if (err) return reject(err);

          // Obtener rol y permisos
          db.get('SELECT * FROM roles WHERE id = ?', [datos.rol_id], (err, rol: any) => {
            if (err) return reject(err);

            db.all(
              `
              SELECT p.* FROM permisos p
              JOIN rol_permisos rp ON p.id = rp.permiso_id
              WHERE rp.rol_id = ?
            `,
              [datos.rol_id],
              (err, permisos: Permiso[]) => {
                if (err) return reject(err);

                resolve({
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
                });
              }
            );
          });
        }
      );
    });
  }

  /**
   * Cambiar rol de usuario
   */
  static async cambiarRol(usuarioId: string, nuevoRolId: string): Promise<Usuario> {
    return new Promise((resolve, reject) => {
      db.run('UPDATE usuarios SET rol_id = ? WHERE id = ?', [nuevoRolId, usuarioId], (err) => {
        if (err) return reject(err);

        db.get('SELECT * FROM usuarios WHERE id = ?', [usuarioId], (err, usuario: any) => {
          if (err) return reject(err);

          db.get('SELECT * FROM roles WHERE id = ?', [nuevoRolId], (err, rol: any) => {
            if (err) return reject(err);

            db.all(
              `
              SELECT p.* FROM permisos p
              JOIN rol_permisos rp ON p.id = rp.permiso_id
              WHERE rp.rol_id = ?
            `,
              [nuevoRolId],
              (err, permisos: Permiso[]) => {
                if (err) return reject(err);

                resolve({
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
                });
              }
            );
          });
        });
      });
    });
  }

  /**
   * Listar usuarios
   */
  static async listarUsuarios(): Promise<Usuario[]> {
    return new Promise((resolve, reject) => {
      db.all(
        `
        SELECT u.*, r.nombre as rol_nombre
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id
        ORDER BY u.nombre
      `,
        (err, usuarios: any[]) => {
          if (err) return reject(err);
          resolve(
            usuarios.map((u) => ({
              id: u.id,
              nombre: u.nombre,
              email: u.email,
              rol_id: u.rol_id,
              rol_nombre: u.rol_nombre,
              departamento: u.departamento,
              activo: u.activo,
              created_at: u.created_at,
              updated_at: u.updated_at,
            }))
          );
        }
      );
    });
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
