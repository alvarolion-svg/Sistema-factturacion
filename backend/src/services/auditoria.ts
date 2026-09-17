import { v4 as uuid } from 'uuid';
import db from '../database';
import { AuditoriaRecord } from '../types';

export class AuditoriaService {
  static registrarOperacion(
    tabla: string,
    tipoOperacion: 'INSERT' | 'UPDATE' | 'DELETE',
    registroId: string,
    datosAnteriores?: any,
    datosNuevos?: any,
    usuario?: string,
    ip?: string
  ): void {
    const id = uuid();

    db.run(
      `
      INSERT INTO auditoria (
        id, tabla, tipo_operacion, registro_id,
        datos_anteriores, datos_nuevos, usuario_id, ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        tabla,
        tipoOperacion,
        registroId,
        datosAnteriores ? JSON.stringify(datosAnteriores) : null,
        datosNuevos ? JSON.stringify(datosNuevos) : null,
        usuario || null,
        ip || null,
      ],
      (err) => {
        if (err) {
          console.error('Error al registrar auditoría:', err);
        }
      }
    );
  }

  static obtenerHistorial(tabla: string, registroId: string): Promise<AuditoriaRecord[]> {
    return new Promise((resolve, reject) => {
      db.all(
        `
        SELECT * FROM auditoria
        WHERE tabla = ? AND registro_id = ?
        ORDER BY created_at DESC
      `,
        [tabla, registroId],
        (err, rows: AuditoriaRecord[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}
