import { v4 as uuid } from 'uuid';
import db from '../database';
import { OrdenPublicidad, ReplicacionFacturacion } from '../types';
import { AuditoriaService } from './auditoria';

export class TopviewService {
  /**
   * Crear una orden de publicidad con cálculo automático de costos
   */
  static async crearOrden(datos: {
    tipo_anunciante: string;
    razon_social: string;
    nombre_anunciante: string;
    cliente_id?: string;
    agencia_id?: string;
    periodo_desde: string;
    periodo_hasta: string;
    fecha_facturacion: string;
    email_contacto: string;
    costo_produccion: number;
    monto_neto: number;
    descuento_porcentaje: number;
    descuento_facturas_porcentaje: number;
    detalles_productos: Array<{
      tipo_producto: string;
      cantidad: number;
      ubicacion?: string;
      especificaciones?: string;
    }>;
    emails_contacto?: Array<{ email: string; nombre: string; cargo?: string; principal: boolean }>;
    intermediarios?: Array<{
      intermediario_id: string;
      porcentaje_comision: number;
      tipo_calculo?: 'base' | 'cascada';
      factura_formal?: boolean;
    }>;
    notas?: string;
  }): Promise<OrdenPublicidad> {
    return new Promise((resolve, reject) => {
      const ordenId = uuid();
      const numeroOrden = `OPB-${Date.now()}`;

      // Calcular descuentos en cascada
      const descuentoMonto = datos.monto_neto * (datos.descuento_porcentaje / 100);
      const montoNetoAplicado = datos.monto_neto - descuentoMonto;
      const descuentoFacturasMonto = montoNetoAplicado * (datos.descuento_facturas_porcentaje / 100);
      const montoFinal = montoNetoAplicado - descuentoFacturasMonto;

      // Insertar orden
      db.run(
        `
        INSERT INTO ordenes_publicidad (
          id, numero_orden, tipo_anunciante, razon_social, nombre_anunciante,
          cliente_id, agencia_id, periodo_desde, periodo_hasta, fecha_facturacion, email_contacto,
          costo_produccion, monto_neto, descuento_porcentaje, descuento_monto,
          monto_neto_aplicado, descuento_facturas_porcentaje, descuento_facturas_monto,
          monto_final, notas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          ordenId,
          numeroOrden,
          datos.tipo_anunciante,
          datos.razon_social,
          datos.nombre_anunciante,
          datos.cliente_id || null,
          datos.agencia_id || null,
          datos.periodo_desde,
          datos.periodo_hasta,
          datos.fecha_facturacion,
          datos.email_contacto,
          datos.costo_produccion,
          datos.monto_neto,
          datos.descuento_porcentaje,
          descuentoMonto,
          montoNetoAplicado,
          datos.descuento_facturas_porcentaje,
          descuentoFacturasMonto,
          montoFinal,
          datos.notas || null,
        ],
        async (err) => {
          if (err) return reject(err);

          // Si hay intermediarios en formato nuevo, insertarlos en ordenes_intermediarios
          if (datos.intermediarios && datos.intermediarios.length > 0) {
            let montoActual = montoFinal;

            datos.intermediarios.forEach((inter, index) => {
              const nivel = index + 1;
              const tipoCalculo = inter.tipo_calculo || 'cascada';
              let montoComision: number;

              if (tipoCalculo === 'base') {
                // Aplica sobre el monto final para facturar
                montoComision = montoFinal * (inter.porcentaje_comision / 100);
              } else {
                // Aplica en cascada sobre lo que queda
                montoComision = montoActual * (inter.porcentaje_comision / 100);
                montoActual -= montoComision;
              }

              const intermedId = uuid();
              db.run(
                `
                INSERT INTO ordenes_intermediarios (
                  id, orden_id, intermediario_id, numero_nivel, porcentaje_comision,
                  monto_comision, tipo_calculo, factura_formal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `,
                [intermedId, ordenId, inter.intermediario_id, nivel, inter.porcentaje_comision, montoComision, tipoCalculo, inter.factura_formal ? 1 : 0],
                (err) => {
                  if (err) return reject(err);
                }
              );
            });
          }

          // Insertar detalles de productos
          let detallesInsertados = 0;
          if (datos.detalles_productos.length > 0) {
            datos.detalles_productos.forEach((detalle) => {
              const detalleId = uuid();
              db.run(
                `
                INSERT INTO ordenes_publicidad_detalles (
                  id, orden_id, tipo_producto, cantidad, ubicacion, especificaciones
                ) VALUES (?, ?, ?, ?, ?, ?)
              `,
                [
                  detalleId,
                  ordenId,
                  detalle.tipo_producto,
                  detalle.cantidad,
                  detalle.ubicacion || null,
                  detalle.especificaciones || null,
                ],
                (err) => {
                  if (err) return reject(err);
                  detallesInsertados++;

                  // Si todos los detalles se insertaron
                  if (detallesInsertados === datos.detalles_productos.length) {
                    this.insertarContactosEmail(ordenId, datos.emails_contacto || []);
                    this.crearReplicacionesFacturacion(ordenId, datos.periodo_desde, datos.periodo_hasta);
                    this.completarCreacionOrden(
                      ordenId,
                      numeroOrden,
                      datos,
                      descuentoMonto,
                      montoNetoAplicado,
                      descuentoFacturasMonto,
                      montoFinal,
                      resolve,
                      reject
                    );
                  }
                }
              );
            });
          } else {
            this.crearReplicacionesFacturacion(ordenId, datos.periodo_desde, datos.periodo_hasta);
            this.completarCreacionOrden(
              ordenId,
              numeroOrden,
              datos,
              descuentoMonto,
              montoNetoAplicado,
              descuentoFacturasMonto,
              montoFinal,
              resolve,
              reject
            );
          }
        }
      );
    });
  }

  /**
   * Insertar contactos de email
   */
  private static insertarContactosEmail(
    ordenId: string,
    emails: Array<{ email: string; nombre: string; cargo?: string; principal: boolean }>
  ): void {
    emails.forEach((contacto) => {
      const contactoId = uuid();
      db.run(
        `
        INSERT INTO contactos_email (id, orden_id, email, nombre_contacto, cargo, principal)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [contactoId, ordenId, contacto.email, contacto.nombre, contacto.cargo || null, contacto.principal ? 1 : 0]
      );
    });
  }

  /**
   * Crear replicaciones de facturación automáticamente
   */
  private static crearReplicacionesFacturacion(ordenId: string, fechaDesde: string, fechaHasta: string): void {
    const desdeDate = new Date(fechaDesde);
    const hastaDate = new Date(fechaHasta);

    const mesDesde = desdeDate.getMonth() + 1;
    const anoDesde = desdeDate.getFullYear();
    const mesHasta = hastaDate.getMonth() + 1;
    const anoHasta = hastaDate.getFullYear();

    for (let ano = anoDesde; ano <= anoHasta; ano++) {
      const mesInicio = ano === anoDesde ? mesDesde : 1;
      const mesFin = ano === anoHasta ? mesHasta : 12;

      for (let mes = mesInicio; mes <= mesFin; mes++) {
        const repId = uuid();
        db.run(
          `
          INSERT INTO replicaciones_facturacion (id, orden_id, numero_mes, ano, estado)
          VALUES (?, ?, ?, ?, 'Pendiente')
        `,
          [repId, ordenId, mes, ano]
        );
      }
    }
  }

  /**
   * Completar la creación de la orden
   */
  private static completarCreacionOrden(
    ordenId: string,
    numeroOrden: string,
    datos: any,
    descuentoMonto: number,
    montoNetoAplicado: number,
    descuentoFacturasMonto: number,
    montoFinal: number,
    resolve: any,
    reject: any
  ): void {
    db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], (err, orden: any) => {
      if (err) return reject(err);

      AuditoriaService.registrarOperacion('ordenes_publicidad', 'INSERT', ordenId, null, datos);

      resolve({
        id: ordenId,
        numero_orden: numeroOrden,
        tipo_anunciante: datos.tipo_anunciante,
        razon_social: datos.razon_social,
        nombre_anunciante: datos.nombre_anunciante,
        periodo_desde: datos.periodo_desde,
        periodo_hasta: datos.periodo_hasta,
        fecha_facturacion: datos.fecha_facturacion,
        email_contacto: datos.email_contacto,
        costo_produccion: datos.costo_produccion,
        monto_neto: datos.monto_neto,
        descuento_porcentaje: datos.descuento_porcentaje,
        descuento_monto: descuentoMonto,
        monto_neto_aplicado: montoNetoAplicado,
        descuento_facturas_porcentaje: datos.descuento_facturas_porcentaje,
        descuento_facturas_monto: descuentoFacturasMonto,
        monto_final: montoFinal,
        estado: 'Activa',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  }

  /**
   * Obtener orden con detalles completos
   */
  static async obtenerOrden(ordenId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], async (err, orden: any) => {
        if (err) return reject(err);
        if (!orden) return reject(new Error('Orden no encontrada'));

        // Obtener detalles
        db.all(
          'SELECT * FROM ordenes_publicidad_detalles WHERE orden_id = ?',
          [ordenId],
          (err, detalles: any[]) => {
            if (err) return reject(err);

            // Obtener documentos
            db.all(
              'SELECT * FROM documentos_adjuntos WHERE orden_id = ?',
              [ordenId],
              (err, documentos: any[]) => {
                if (err) return reject(err);

                // Obtener contactos
                db.all(
                  'SELECT * FROM contactos_email WHERE orden_id = ?',
                  [ordenId],
                  (err, contactos: any[]) => {
                    if (err) return reject(err);

                    // Obtener replicaciones
                    db.all(
                      'SELECT * FROM replicaciones_facturacion WHERE orden_id = ? ORDER BY ano, numero_mes',
                      [ordenId],
                      (err, replicaciones: any[]) => {
                        if (err) return reject(err);

                        resolve({
                          ...orden,
                          detalles: detalles || [],
                          documentos: documentos || [],
                          contactos: contactos || [],
                          replicaciones: replicaciones || [],
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  /**
   * Adjuntar documento
   */
  static async adjuntarDocumento(
    ordenId: string,
    nombreArchivo: string,
    tipoArchivo: string,
    urlDrive?: string,
    descripcion?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const docId = uuid();

      db.run(
        `
        INSERT INTO documentos_adjuntos (id, orden_id, nombre_archivo, tipo_archivo, url_drive, descripcion)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [docId, ordenId, nombreArchivo, tipoArchivo, urlDrive || null, descripcion || null],
        (err) => {
          if (err) return reject(err);

          AuditoriaService.registrarOperacion('documentos_adjuntos', 'INSERT', docId, null, {
            orden_id: ordenId,
            nombre_archivo: nombreArchivo,
          });

          resolve({
            id: docId,
            orden_id: ordenId,
            nombre_archivo: nombreArchivo,
            tipo_archivo: tipoArchivo,
            url_drive: urlDrive,
            descripcion: descripcion,
            fecha_carga: new Date().toISOString(),
          });
        }
      );
    });
  }

  /**
   * Generar facturas para las replicaciones pendientes
   */
  static async generarFacturasReplicadas(ordenId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], async (err, orden: any) => {
        if (err) return reject(err);

        // Obtener replicaciones pendientes
        db.all(
          'SELECT * FROM replicaciones_facturacion WHERE orden_id = ? AND estado = "Pendiente"',
          [ordenId],
          async (err, replicaciones: any[]) => {
            if (err) return reject(err);

            const facturasGeneradas: any[] = [];

            for (const replicacion of replicaciones) {
              const numeroFactura = `FAC-${orden.numero_orden}-${replicacion.numero_mes}/${replicacion.ano}`;

              // Crear factura
              const factura = await new Promise((resolveFac, rejectFac) => {
                const facturaId = uuid();
                const fechaFactura = new Date(replicacion.ano, replicacion.numero_mes - 1, 1)
                  .toISOString()
                  .split('T')[0];

                db.run(
                  `
                  INSERT INTO facturas (
                    id, numero, cliente_id, fecha, tipo_comprobante,
                    estado, subtotal, iva, total, saldo
                  ) VALUES (?, ?, ?, ?, 'Factura A', 'Abierta', ?, ?, ?, ?)
                `,
                  [
                    facturaId,
                    numeroFactura,
                    orden.cliente_id,
                    fechaFactura,
                    orden.monto_final,
                    orden.monto_final * 0.21,
                    orden.monto_final * 1.21,
                    orden.monto_final * 1.21,
                  ],
                  (err) => {
                    if (err) return rejectFac(err);

                    // Actualizar replicación
                    db.run(
                      'UPDATE replicaciones_facturacion SET factura_id = ?, estado = "Generada", fecha_generacion = datetime("now") WHERE id = ?',
                      [facturaId, replicacion.id],
                      (err) => {
                        if (err) return rejectFac(err);
                        resolveFac(facturaId);
                      }
                    );
                  }
                );
              });

              facturasGeneradas.push(factura);
            }

            resolve(facturasGeneradas);
          }
        );
      });
    });
  }

  /**
   * Listar órdenes con filtros
   */
  static async listarOrdenes(filtros: {
    tipo_anunciante?: string;
    estado?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
  } = {}): Promise<OrdenPublicidad[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM ordenes_publicidad WHERE 1=1';
      const params: any[] = [];

      if (filtros.tipo_anunciante) {
        query += ' AND tipo_anunciante = ?';
        params.push(filtros.tipo_anunciante);
      }

      if (filtros.estado) {
        query += ' AND estado = ?';
        params.push(filtros.estado);
      }

      if (filtros.fecha_desde && filtros.fecha_hasta) {
        query += ' AND periodo_desde >= ? AND periodo_hasta <= ?';
        params.push(filtros.fecha_desde, filtros.fecha_hasta);
      }

      query += ' ORDER BY created_at DESC';

      db.all(query, params, (err, ordenes: OrdenPublicidad[]) => {
        if (err) return reject(err);
        resolve(ordenes || []);
      });
    });
  }

  /**
   * Actualizar estado de orden
   */
  static async actualizarEstado(ordenId: string, nuevoEstado: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE ordenes_publicidad SET estado = ?, updated_at = datetime("now") WHERE id = ?',
        [nuevoEstado, ordenId],
        (err) => {
          if (err) return reject(err);
          AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { estado: nuevoEstado });
          resolve();
        }
      );
    });
  }

  /**
   * Reporte de órdenes con análisis de rentabilidad
   */
  static async reporteOrdenes(): Promise<any> {
    return new Promise((resolve, reject) => {
      db.all(
        `
        SELECT
          tipo_anunciante,
          COUNT(*) as cantidad,
          SUM(costo_produccion) as costo_total,
          SUM(monto_neto) as monto_neto_total,
          SUM(monto_final) as monto_final_total,
          SUM(monto_final - costo_produccion) as ganancia_total,
          ROUND(((SUM(monto_final - costo_produccion) / SUM(monto_final)) * 100), 2) as margen_ganancia
        FROM ordenes_publicidad
        WHERE estado = 'Activa'
        GROUP BY tipo_anunciante
      `,
        (err, analisis: any[]) => {
          if (err) return reject(err);

          // Total general
          db.get(
            `
            SELECT
              COUNT(*) as total_ordenes,
              SUM(costo_produccion) as costo_total,
              SUM(monto_neto) as monto_neto_total,
              SUM(monto_final) as monto_final_total,
              SUM(monto_final - costo_produccion) as ganancia_total
            FROM ordenes_publicidad
            WHERE estado = 'Activa'
          `,
            (err, totales: any) => {
              if (err) return reject(err);

              resolve({
                por_anunciante: analisis || [],
                totales: totales || {},
                generado_en: new Date().toISOString(),
              });
            }
          );
        }
      );
    });
  }
}
