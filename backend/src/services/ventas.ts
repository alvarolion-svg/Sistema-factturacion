import { v4 as uuid } from 'uuid';
import db from '../database';
import { Factura, NotaCredito } from '../types';
import { AuditoriaService } from './auditoria';
import { TesoreriaService } from './tesoreria';

export class VentasService {
  /**
   * Crea una factura con validación ARCA
   */
  static crearFactura(
    clienteId: string,
    fecha: string,
    tipoComprobante: string,
    detalles: Array<{ producto_id: string; cantidad: number; precio_unitario: number }>,
    validarARCA: boolean
  ): Promise<Factura> {
    return new Promise((resolve, reject) => {
      const facturaId = uuid();
      const numero = this.generarNumeroFactura();

      let subtotal = 0;
      let iva = 0;

      // Calcular totales
      detalles.forEach((d) => {
        const subtotalLinea = d.cantidad * d.precio_unitario;
        subtotal += subtotalLinea;
        iva += subtotalLinea * 0.21; // IVA 21%
      });

      const total = subtotal + iva;

      // Crear factura
      db.run(
        `
        INSERT INTO facturas (
          id, numero, cliente_id, fecha, tipo_comprobante,
          estado, validada_arca, subtotal, iva, total, saldo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [facturaId, numero, clienteId, fecha, tipoComprobante, 'Abierta', validarARCA, subtotal, iva, total, total],
        (err) => {
          if (err) return reject(err);

          // Insertar detalles
          let detallesInsertados = 0;

          detalles.forEach((d) => {
            const detalleId = uuid();
            const subtotalLinea = d.cantidad * d.precio_unitario;

            db.run(
              `
              INSERT INTO facturas_detalles (
                id, factura_id, producto_id, cantidad, precio_unitario, subtotal
              ) VALUES (?, ?, ?, ?, ?, ?)
            `,
              [detalleId, facturaId, d.producto_id, d.cantidad, d.precio_unitario, subtotalLinea],
              (err) => {
                if (err) return reject(err);
                detallesInsertados++;

                if (detallesInsertados === detalles.length) {
                  // Actualizar cuenta corriente del cliente
                  TesoreriaService.actualizarCCCliente(clienteId, total, 'debe').then(() => {
                    // Registrar auditoría
                    AuditoriaService.registrarOperacion(
                      'facturas',
                      'INSERT',
                      facturaId,
                      null,
                      { numero, cliente_id: clienteId, total, estado: 'Abierta', validada_arca: validarARCA }
                    );

                    resolve({
                      id: facturaId,
                      numero,
                      cliente_id: clienteId,
                      fecha,
                      tipo_comprobante: tipoComprobante,
                      estado: 'Abierta',
                      validada_arca: validarARCA,
                      subtotal,
                      iva,
                      total,
                      saldo: total,
                      observaciones: '',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    });
                  });
                }
              }
            );
          });
        }
      );
    });
  }

  /**
   * Registra un cobro de una factura
   * El dinero entra en una cuenta bancaria, la CC del cliente se reduce a 0
   */
  static registrarCobro(
    facturaId: string,
    monto: number,
    cuentaBancoId: string
  ): Promise<{ factura: any; movimiento: any }> {
    return new Promise((resolve, reject) => {
      // Obtener factura
      db.get('SELECT * FROM facturas WHERE id = ?', [facturaId], (err, factura: any) => {
        if (err) return reject(err);
        if (!factura) return reject(new Error('Factura no encontrada'));

        if (monto > factura.saldo) {
          return reject(new Error('El monto supera el saldo de la factura'));
        }

        const nuevoSaldo = factura.saldo - monto;
        const estado = nuevoSaldo === 0 ? 'Cobrada' : 'Abierta';

        // Actualizar factura
        db.run(
          'UPDATE facturas SET saldo = ?, estado = ? WHERE id = ?',
          [nuevoSaldo, estado, facturaId],
          (err) => {
            if (err) return reject(err);

            // Registrar movimiento en tesorería
            TesoreriaService.registrarMovimiento('FACTURA', facturaId, `Cobro factura ${factura.numero}`, '', cuentaBancoId, monto)
              .then((movimiento) => {
                // Actualizar CC del cliente
                TesoreriaService.actualizarCCCliente(factura.cliente_id, monto, 'haber').then(() => {
                  // Registrar auditoría
                  AuditoriaService.registrarOperacion('facturas', 'UPDATE', facturaId, factura, {
                    ...factura,
                    saldo: nuevoSaldo,
                    estado,
                  });

                  resolve({
                    factura: { ...factura, saldo: nuevoSaldo, estado },
                    movimiento,
                  });
                });
              })
              .catch(reject);
          }
        );
      });
    });
  }

  /**
   * Anula una factura validada en ARCA mediante Nota de Crédito
   */
  static crearNotaCredito(facturaId: string, motivo: string): Promise<NotaCredito> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM facturas WHERE id = ?', [facturaId], (err, factura: any) => {
        if (err) return reject(err);
        if (!factura) return reject(new Error('Factura no encontrada'));
        if (!factura.validada_arca) {
          return reject(new Error('Solo se puede hacer NC en facturas validadas con ARCA'));
        }

        const ncId = uuid();
        const numero = this.generarNumeroNotaCredito();

        // Crear nota de crédito
        db.run(
          `
          INSERT INTO notas_credito (
            id, numero, factura_id, cliente_id, fecha, motivo,
            subtotal, iva, total, estado
          ) VALUES (?, ?, ?, ?, date('now'), ?, ?, ?, ?, 'Emitida')
        `,
          [ncId, numero, facturaId, factura.cliente_id, motivo, factura.subtotal, factura.iva, factura.total],
          (err) => {
            if (err) return reject(err);

            // Marcar factura como anulada
            db.run('UPDATE facturas SET estado = ? WHERE id = ?', ['Anulada', facturaId], (err) => {
              if (err) return reject(err);

              // Actualizar CC: devolver el monto
              TesoreriaService.actualizarCCCliente(factura.cliente_id, factura.total, 'haber').then(() => {
                // Registrar auditoría
                AuditoriaService.registrarOperacion('notas_credito', 'INSERT', ncId, null, {
                  numero,
                  factura_id: facturaId,
                  total: factura.total,
                  motivo,
                });

                resolve({
                  id: ncId,
                  numero,
                  factura_id: facturaId,
                  cliente_id: factura.cliente_id,
                  fecha: new Date().toISOString().split('T')[0],
                  motivo,
                  subtotal: factura.subtotal,
                  iva: factura.iva,
                  total: factura.total,
                  estado: 'Emitida',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              });
            });
          }
        );
      });
    });
  }

  /**
   * Elimina una factura sin validar ARCA
   * Devuelve el dinero y actualiza CC
   */
  static eliminarFacturaSinValidar(facturaId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM facturas WHERE id = ?', [facturaId], (err, factura: any) => {
        if (err) return reject(err);
        if (!factura) return reject(new Error('Factura no encontrada'));
        if (factura.validada_arca) {
          return reject(new Error('No se puede eliminar una factura validada con ARCA. Use Nota de Crédito.'));
        }

        // Devolver dinero a CC del cliente
        TesoreriaService.actualizarCCCliente(factura.cliente_id, factura.total, 'haber').then(() => {
          // Eliminar detalles
          db.run('DELETE FROM facturas_detalles WHERE factura_id = ?', [facturaId], (err) => {
            if (err) return reject(err);

            // Eliminar factura
            db.run('DELETE FROM facturas WHERE id = ?', [facturaId], (err) => {
              if (err) return reject(err);

              // Registrar auditoría
              AuditoriaService.registrarOperacion('facturas', 'DELETE', facturaId, factura, null);

              resolve();
            });
          });
        });
      });
    });
  }

  private static generarNumeroFactura(): string {
    return `FA-${Date.now()}`;
  }

  private static generarNumeroNotaCredito(): string {
    return `NC-${Date.now()}`;
  }
}
