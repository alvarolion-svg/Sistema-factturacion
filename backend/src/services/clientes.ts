import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';

export interface Cliente {
  id: string;
  razon_social: string;
  cuit?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  condicion_iva?: string;
  habilitado: boolean;
  created_at: string;
  updated_at: string;
}

export const clientesService = {
  // Listar todos los clientes
  listar: (): Promise<Cliente[]> => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM clientes WHERE habilitado = 1 ORDER BY razon_social', (err, rows) => {
        if (err) reject(err);
        else resolve(rows as Cliente[]);
      });
    });
  },

  // Obtener cliente por ID
  obtenerPorId: (id: string): Promise<Cliente | null> => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve((row as Cliente) || null);
      });
    });
  },

  // Crear cliente
  crear: (datos: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<Cliente> => {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO clientes (id, razon_social, cuit, email, telefono, direccion, ciudad, condicion_iva, habilitado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          datos.razon_social,
          datos.cuit || null,
          datos.email || null,
          datos.telefono || null,
          datos.direccion || null,
          datos.ciudad || null,
          datos.condicion_iva || 'Responsable Inscripto',
          1,
          now,
          now
        ],
        function(err) {
          if (err) reject(err);
          else {
            resolve({
              id,
              razon_social: datos.razon_social,
              cuit: datos.cuit,
              email: datos.email,
              telefono: datos.telefono,
              direccion: datos.direccion,
              ciudad: datos.ciudad,
              condicion_iva: datos.condicion_iva || 'Responsable Inscripto',
              habilitado: true,
              created_at: now,
              updated_at: now
            });
          }
        }
      );
    });
  },

  // Actualizar cliente
  actualizar: (id: string, datos: Partial<Cliente>): Promise<Cliente> => {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const campos = [];
      const valores = [];

      if (datos.razon_social !== undefined) {
        campos.push('razon_social = ?');
        valores.push(datos.razon_social);
      }
      if (datos.cuit !== undefined) {
        campos.push('cuit = ?');
        valores.push(datos.cuit);
      }
      if (datos.email !== undefined) {
        campos.push('email = ?');
        valores.push(datos.email);
      }
      if (datos.telefono !== undefined) {
        campos.push('telefono = ?');
        valores.push(datos.telefono);
      }
      if (datos.direccion !== undefined) {
        campos.push('direccion = ?');
        valores.push(datos.direccion);
      }
      if (datos.ciudad !== undefined) {
        campos.push('ciudad = ?');
        valores.push(datos.ciudad);
      }
      if (datos.condicion_iva !== undefined) {
        campos.push('condicion_iva = ?');
        valores.push(datos.condicion_iva);
      }

      campos.push('updated_at = ?');
      valores.push(now);
      valores.push(id);

      db.run(
        `UPDATE clientes SET ${campos.join(', ')} WHERE id = ?`,
        valores,
        function(err) {
          if (err) {
            reject(err);
          } else {
            clientesService.obtenerPorId(id).then(cliente => {
              if (cliente) resolve(cliente);
              else reject(new Error('Cliente no encontrado después de actualizar'));
            }).catch(reject);
          }
        }
      );
    });
  },

  // Eliminar cliente (soft delete)
  eliminar: (id: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE clientes SET habilitado = 0 WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  // Buscar clientes por razón social
  buscar: (termino: string): Promise<Cliente[]> => {
    return new Promise((resolve, reject) => {
      const searchTerm = `%${termino}%`;
      db.all(
        'SELECT * FROM clientes WHERE habilitado = 1 AND razon_social LIKE ? ORDER BY razon_social',
        [searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as Cliente[]);
        }
      );
    });
  }
};
