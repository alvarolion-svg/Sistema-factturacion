import { v4 as uuid } from 'uuid';
import db from '../database';
import { Movimiento } from '../types';

export class TesoreriaService {
  /**
   * Registra un movimiento de dinero entre cuentas
   */
  static registrarMovimiento(
    tipoDocumento: string,
    documentoId: string,
    descripcion: string,
    cuentaOrigenId: string,
    cuentaDestinoId: string,
    monto: number
  ): Promise<Movimiento> {
    return new Promise((resolve, reject) => {
      const movimientoId = uuid();

      // Obtener saldos actuales
      db.get('SELECT saldo FROM cuentas WHERE id = ?', [cuentaOrigenId], (err, origen: any) => {
        if (err) return reject(err);

        db.get('SELECT saldo FROM cuentas WHERE id = ?', [cuentaDestinoId], (err, destino: any) => {
          if (err) return reject(err);

          const saldoAnteriorOrigen = origen?.saldo || 0;
          const saldoNuevoOrigen = saldoAnteriorOrigen - monto;
          const saldoNuevoDestino = (destino?.saldo || 0) + monto;

          // Actualizar saldos de cuentas
          db.run('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoNuevoOrigen, cuentaOrigenId], (err) => {
            if (err) return reject(err);

            db.run('UPDATE cuentas SET saldo = ? WHERE id = ?', [saldoNuevoDestino, cuentaDestinoId], (err) => {
              if (err) return reject(err);

              // Registrar movimiento
              db.run(
                `
                INSERT INTO movimientos (
                  id, tipo_documento, documento_id, descripcion,
                  cuenta_origen_id, cuenta_destino_id, monto,
                  saldo_anterior, saldo_nuevo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
                [
                  movimientoId,
                  tipoDocumento,
                  documentoId,
                  descripcion,
                  cuentaOrigenId,
                  cuentaDestinoId,
                  monto,
                  saldoAnteriorOrigen,
                  saldoNuevoOrigen,
                ],
                (err) => {
                  if (err) return reject(err);

                  resolve({
                    id: movimientoId,
                    fecha: new Date().toISOString(),
                    tipo_documento: tipoDocumento,
                    documento_id: documentoId,
                    descripcion,
                    cuenta_origen_id: cuentaOrigenId,
                    cuenta_destino_id: cuentaDestinoId,
                    monto,
                    saldo_anterior: saldoAnteriorOrigen,
                    saldo_nuevo: saldoNuevoOrigen,
                    created_at: new Date().toISOString(),
                  });
                }
              );
            });
          });
        });
      });
    });
  }

  /**
   * Actualiza la cuenta corriente de un cliente
   */
  static actualizarCCCliente(clienteId: string, monto: number, tipo: 'debe' | 'haber'): Promise<number> {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT saldo FROM cc_clientes WHERE cliente_id = ?',
        [clienteId],
        (err, cc: any) => {
          if (err) return reject(err);

          const saldoActual = cc?.saldo || 0;
          const nuevoSaldo = tipo === 'debe' ? saldoActual + monto : saldoActual - monto;

          db.run(
            `
            INSERT INTO cc_clientes (id, cliente_id, saldo)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET saldo = excluded.saldo, updated_at = CURRENT_TIMESTAMP
          `,
            [uuid(), clienteId, nuevoSaldo],
            (err) => {
              if (err) return reject(err);
              resolve(nuevoSaldo);
            }
          );
        }
      );
    });
  }

  /**
   * Obtiene el estado de tesorería completo
   */
  static obtenerEstadoTesoreria(): Promise<any> {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM cuentas WHERE habilitada = 1', (err, cuentas) => {
        if (err) return reject(err);

        const totalARS = (cuentas as any[])
          .filter((c) => c.moneda === 'ARS')
          .reduce((sum, c) => sum + c.saldo, 0);

        const totalUSD = (cuentas as any[])
          .filter((c) => c.moneda === 'USD')
          .reduce((sum, c) => sum + c.saldo, 0);

        resolve({
          cuentas,
          totales: {
            ARS: totalARS,
            USD: totalUSD,
          },
        });
      });
    });
  }
}
