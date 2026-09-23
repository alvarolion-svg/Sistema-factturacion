import { v4 as uuid } from 'uuid';
import db from '../database';
import { OrdenPublicidad, ReplicacionFacturacion } from '../types';
import { AuditoriaService } from './auditoria';
import { TesoreriaService } from './tesoreria';

const PRODUCTO_SERVICIO_TOPVIEW_ID = 'topview-serv-1';

interface DatosOrden {
  tipo_anunciante: string;
  nombre_anunciante: string;
  numero_orden_agencia?: string;
  incluir_numero_orden_agencia?: boolean;
  leyenda_factura?: string;
  cliente_id: string;
  agencia_id?: string;
  vendedor_id?: string;
  periodo_desde: string;
  periodo_hasta: string;
  fecha_facturacion: string;
  email_contacto: string;
  costo_produccion: number;
  monto_neto: number;
  descuento_porcentaje: number;
  descuento_en_cascada?: boolean;
  descuento_facturas_porcentaje: number;
  descuento_facturas_en_cascada?: boolean;
  mes_ingreso?: number;
  ano_ingreso?: number;
  vigencia_hasta_nota?: string;
  detalles_productos: Array<{
    id?: string;
    producto_id: string;
    cantidad: number;
    ubicacion?: string;
    especificaciones?: string;
    locacion_id?: string;
    punto_instalacion?: string;
    precio?: number;
  }>;
  emails_contacto?: Array<{ email: string; nombre: string; cargo?: string; principal: boolean }>;
  intermediarios?: Array<{
    intermediario_id: string;
    porcentaje_comision: number;
    tipo_calculo?: 'base' | 'cascada';
    factura_formal?: boolean;
  }>;
  notas?: string;
  facturado?: boolean;
  arreglos_no_registrables?: Array<{
    tipo?: string;
    descripcion?: string;
    monto?: number;
    tercero_nombre?: string;
  }>;
}

export class TopviewService {
  /**
   * Crear una orden de publicidad con cálculo automático de costos
   */
  static async crearOrden(datos: DatosOrden): Promise<OrdenPublicidad> {
    return new Promise((resolve, reject) => {
      if (!datos.cliente_id) return reject(new Error('Elegí un cliente: la orden se factura a nombre suyo.'));
      if (!datos.periodo_desde || !datos.periodo_hasta) {
        return reject(new Error('El período (desde/hasta) es obligatorio.'));
      }

      // Defensivo: si llega sin detalles_productos (ej. un llamado directo a la
      // API sin pasar por el formulario) no debe tirar abajo el proceso entero.
      datos.detalles_productos = datos.detalles_productos || [];

      // La razón social no se tipea a mano: se toma siempre del cliente elegido
      // (es a quien realmente se factura), para que nunca quede desincronizada.
      db.get('SELECT razon_social FROM clientes WHERE id = ?', [datos.cliente_id], async (err, cliente: any) => {
        if (err) return reject(err);
        if (!cliente) return reject(new Error('El cliente elegido no existe.'));

        const razonSocial = cliente.razon_social;
        (datos as any).razon_social = razonSocial;
        const ordenId = uuid();
        const numeroOrden = `OPB-${Date.now()}`;

        // factura_formal (Tipo 1 con factura / Tipo 2 efectivo) ya NO es fija
        // por comisionista — un mismo comisionista puede tener negocios de
        // ambos tipos. Viaja por línea, copiada de la condición elegida al
        // cargar la orden (ver handleChangeIntermediario en el frontend), y
        // acá se toma tal cual la manda el formulario.
        type IntermediarioLinea = NonNullable<typeof datos.intermediarios>[number];
        const intermediariosConFacturaFormal: IntermediarioLinea[] = (datos.intermediarios || []).map((inter) => ({
          ...inter,
          factura_formal: !!inter.factura_formal,
        }));

        // Descuentos NC (comercial) y FC (facturas): cada uno puede ser directo sobre
        // el bruto o en cascada sobre lo que van dejando los anteriores — depende de
        // lo pactado con cada agencia. Misma lógica que las comisiones a
        // comisionistas (más abajo), para que ambos mecanismos se comporten igual.
        const descuentosOrdenados: Array<{ pct: number; cascada: boolean }> = [
          { pct: datos.descuento_porcentaje, cascada: !!datos.descuento_en_cascada },
          { pct: datos.descuento_facturas_porcentaje, cascada: !!datos.descuento_facturas_en_cascada },
        ];
        let descuentoMonto = 0;
        let descuentoFacturasMonto = 0;
        {
          let montoActual = datos.monto_neto;
          descuentosOrdenados.forEach(({ pct, cascada }, idx) => {
            const base = cascada ? montoActual : datos.monto_neto;
            const monto = base * (pct / 100);
            if (cascada) montoActual -= monto;
            if (idx === 0) descuentoMonto = monto;
            else descuentoFacturasMonto = monto;
          });
        }
        const montoNetoAplicado = datos.monto_neto - descuentoMonto;
        // "Neto blanco": lo que queda después de NC/FC, antes de comisiones a intermediarios.
        const montoNetoBlanco = datos.monto_neto - descuentoMonto - descuentoFacturasMonto;

        // Comisiones a comisionistas: 'cascada' aplica sobre lo que va quedando
        // (cada nivel sobre el remanente del anterior); 'base' aplica directo sobre
        // el mismo neto blanco (varios comisionistas cobrando cada uno su % directo
        // del bruto, sin descontarse entre sí — ej. un comisionista con factura +
        // otro en efectivo, cobrando 15%+25% en paralelo, no 15% y luego 25% del resto).
        // Se calcula una sola vez acá y se reutiliza tanto para persistir monto_final
        // como para las filas de ordenes_intermediarios, para que nunca diverjan.
        const comisionesCalculadas: Array<{
          intermediario_id: string;
          porcentaje_comision: number;
          tipo_calculo: 'base' | 'cascada';
          factura_formal?: boolean;
          monto_comision: number;
        }> = [];
        let montoFinal = montoNetoBlanco;
        {
          let montoActual = montoNetoBlanco;
          (intermediariosConFacturaFormal || []).forEach((inter) => {
            const tipoCalculo = inter.tipo_calculo || 'cascada';
            let montoComision: number;
            if (tipoCalculo === 'base') {
              montoComision = montoNetoBlanco * (inter.porcentaje_comision / 100);
            } else {
              montoComision = montoActual * (inter.porcentaje_comision / 100);
              montoActual -= montoComision;
            }
            montoFinal -= montoComision;
            comisionesCalculadas.push({ ...inter, tipo_calculo: tipoCalculo, monto_comision: montoComision });
          });
        }

        // Mes/año de ingreso: si no se especifica, se toma por defecto el mes/año de
        // inicio del período — pero es un campo discrecional, editable en la carga.
        const [anoDesde, mesDesde] = datos.periodo_desde.split('-').map(Number);
        const mesIngreso = datos.mes_ingreso || mesDesde;
        const anoIngreso = datos.ano_ingreso || anoDesde;

        // Insertar orden
        db.run(
          `
        INSERT INTO ordenes_publicidad (
          id, numero_orden, numero_orden_agencia, incluir_numero_orden_agencia, leyenda_factura,
          tipo_anunciante, razon_social, nombre_anunciante,
          cliente_id, agencia_id, vendedor_id, periodo_desde, periodo_hasta, fecha_facturacion, email_contacto,
          costo_produccion, monto_neto, descuento_porcentaje, descuento_en_cascada, descuento_monto,
          monto_neto_aplicado, descuento_facturas_porcentaje, descuento_facturas_monto,
          descuento_facturas_en_cascada, monto_final, notas, facturado, mes_ingreso, ano_ingreso,
          vigencia_hasta_nota, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
          [
            ordenId,
            numeroOrden,
            datos.numero_orden_agencia || null,
            datos.incluir_numero_orden_agencia === false ? 0 : 1,
            datos.leyenda_factura || null,
            datos.tipo_anunciante,
            razonSocial,
            datos.nombre_anunciante,
            datos.cliente_id,
            datos.agencia_id || null,
            datos.vendedor_id || null,
            datos.periodo_desde,
            datos.periodo_hasta,
            datos.fecha_facturacion,
            datos.email_contacto,
            datos.costo_produccion,
            datos.monto_neto,
            datos.descuento_porcentaje,
            datos.descuento_en_cascada ? 1 : 0,
            descuentoMonto,
            montoNetoAplicado,
            datos.descuento_facturas_porcentaje,
            descuentoFacturasMonto,
            datos.descuento_facturas_en_cascada ? 1 : 0,
            montoFinal,
            datos.notas || null,
            datos.facturado === false ? 0 : 1,
            mesIngreso,
            anoIngreso,
            datos.vigencia_hasta_nota || null,
            'Cargada',
          ],
          async (err) => {
            if (err) return reject(err);

          // Insertar comisiones ya calculadas más arriba en ordenes_intermediarios
          comisionesCalculadas.forEach((inter, index) => {
            const intermedId = uuid();
            db.run(
              `
                INSERT INTO ordenes_intermediarios (
                  id, orden_id, intermediario_id, numero_nivel, porcentaje_comision,
                  monto_comision, tipo_calculo, factura_formal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                intermedId,
                ordenId,
                inter.intermediario_id,
                index + 1,
                inter.porcentaje_comision,
                inter.monto_comision,
                inter.tipo_calculo,
                inter.factura_formal ? 1 : 0,
              ],
              (err) => {
                if (err) return reject(err);
              }
            );
          });

          // Insertar detalles de productos. tipo_producto queda como copia de
          // solo lectura del nombre del producto (para no tener que hacer
          // join en cada pantalla que ya lo muestra directo).
          let detallesInsertados = 0;
          if (datos.detalles_productos.length > 0) {
            datos.detalles_productos.forEach((detalle) => {
              const detalleId = uuid();
              db.get('SELECT nombre FROM productos WHERE id = ?', [detalle.producto_id], (err, producto: any) => {
                if (err) return reject(err);
                if (!producto) return reject(new Error('El producto/soporte elegido no existe.'));

                db.run(
                  `
                INSERT INTO ordenes_publicidad_detalles (
                  id, orden_id, tipo_producto, producto_id, cantidad, ubicacion, especificaciones, locacion_id, punto_instalacion, precio
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
                  [
                    detalleId,
                    ordenId,
                    producto.nombre,
                    detalle.producto_id,
                    detalle.cantidad,
                    detalle.ubicacion || null,
                    detalle.especificaciones || null,
                    detalle.locacion_id || null,
                    detalle.punto_instalacion || null,
                    detalle.precio || 0,
                  ],
                  (err) => {
                    if (err) return reject(err);
                    detallesInsertados++;

                  // Si todos los detalles se insertaron
                  if (detallesInsertados === datos.detalles_productos.length) {
                    this.insertarContactosEmail(ordenId, datos.emails_contacto || []);
                    this.insertarArreglosNoRegistrables(ordenId, datos.arreglos_no_registrables || []);
                    if (datos.facturado !== false) {
                      this.crearReplicacionesFacturacion(ordenId, datos.periodo_desde, datos.periodo_hasta);
                    }
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
            });
          } else {
            this.insertarContactosEmail(ordenId, datos.emails_contacto || []);
            this.insertarArreglosNoRegistrables(ordenId, datos.arreglos_no_registrables || []);
            if (datos.facturado !== false) {
              this.crearReplicacionesFacturacion(ordenId, datos.periodo_desde, datos.periodo_hasta);
            }
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
    });
  }

  /**
   * Actualizar una orden existente: recalcula descuentos/comisiones con la
   * misma lógica que al crear, y reemplaza comisionistas/detalles de
   * productos/contactos/arreglos con lo que venga del formulario. Las
   * facturas, gastos y comisiones en efectivo YA generados no se tocan —
   * quedan como historial de lo que se facturó en su momento; solo se
   * reconcilian las replicaciones pendientes (todavía sin facturar) con el
   * período nuevo.
   */
  static async actualizarOrden(ordenId: string, datos: DatosOrden): Promise<OrdenPublicidad> {
    if (!datos.cliente_id) throw new Error('Elegí un cliente: la orden se factura a nombre suyo.');
    if (!datos.periodo_desde || !datos.periodo_hasta) throw new Error('El período (desde/hasta) es obligatorio.');
    datos.detalles_productos = datos.detalles_productos || [];

    const existente: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], (err, row) => (err ? reject(err) : resolve(row)));
    });
    if (!existente) throw new Error('Orden no encontrada.');

    const cliente: any = await new Promise((resolve, reject) => {
      db.get('SELECT razon_social FROM clientes WHERE id = ?', [datos.cliente_id], (err, row) => (err ? reject(err) : resolve(row)));
    });
    if (!cliente) throw new Error('El cliente elegido no existe.');
    const razonSocial = cliente.razon_social;

    type IntermediarioLinea = NonNullable<typeof datos.intermediarios>[number];
    const intermediariosConFacturaFormal: IntermediarioLinea[] = (datos.intermediarios || []).map((inter) => ({
      ...inter,
      factura_formal: !!inter.factura_formal,
    }));

    const descuentosOrdenados: Array<{ pct: number; cascada: boolean }> = [
      { pct: datos.descuento_porcentaje, cascada: !!datos.descuento_en_cascada },
      { pct: datos.descuento_facturas_porcentaje, cascada: !!datos.descuento_facturas_en_cascada },
    ];
    let descuentoMonto = 0;
    let descuentoFacturasMonto = 0;
    {
      let montoActual = datos.monto_neto;
      descuentosOrdenados.forEach(({ pct, cascada }, idx) => {
        const base = cascada ? montoActual : datos.monto_neto;
        const monto = base * (pct / 100);
        if (cascada) montoActual -= monto;
        if (idx === 0) descuentoMonto = monto;
        else descuentoFacturasMonto = monto;
      });
    }
    const montoNetoAplicado = datos.monto_neto - descuentoMonto;
    const montoNetoBlanco = datos.monto_neto - descuentoMonto - descuentoFacturasMonto;

    const comisionesCalculadas: Array<{
      intermediario_id: string;
      porcentaje_comision: number;
      tipo_calculo: 'base' | 'cascada';
      factura_formal?: boolean;
      monto_comision: number;
    }> = [];
    let montoFinal = montoNetoBlanco;
    {
      let montoActual = montoNetoBlanco;
      intermediariosConFacturaFormal.forEach((inter) => {
        const tipoCalculo = inter.tipo_calculo || 'cascada';
        let montoComision: number;
        if (tipoCalculo === 'base') {
          montoComision = montoNetoBlanco * (inter.porcentaje_comision / 100);
        } else {
          montoComision = montoActual * (inter.porcentaje_comision / 100);
          montoActual -= montoComision;
        }
        montoFinal -= montoComision;
        comisionesCalculadas.push({ ...inter, tipo_calculo: tipoCalculo, monto_comision: montoComision });
      });
    }

    const [anoDesde, mesDesde] = datos.periodo_desde.split('-').map(Number);
    const mesIngreso = datos.mes_ingreso || mesDesde;
    const anoIngreso = datos.ano_ingreso || anoDesde;

    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE ordenes_publicidad SET
          numero_orden_agencia = ?, incluir_numero_orden_agencia = ?, leyenda_factura = ?,
          tipo_anunciante = ?, razon_social = ?, nombre_anunciante = ?,
          cliente_id = ?, agencia_id = ?, vendedor_id = ?, periodo_desde = ?, periodo_hasta = ?,
          fecha_facturacion = ?, email_contacto = ?, costo_produccion = ?, monto_neto = ?,
          descuento_porcentaje = ?, descuento_en_cascada = ?, descuento_monto = ?,
          monto_neto_aplicado = ?, descuento_facturas_porcentaje = ?, descuento_facturas_monto = ?,
          descuento_facturas_en_cascada = ?, monto_final = ?, notas = ?, facturado = ?,
          mes_ingreso = ?, ano_ingreso = ?, vigencia_hasta_nota = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          datos.numero_orden_agencia || null,
          datos.incluir_numero_orden_agencia === false ? 0 : 1,
          datos.leyenda_factura || null,
          datos.tipo_anunciante,
          razonSocial,
          datos.nombre_anunciante,
          datos.cliente_id,
          datos.agencia_id || null,
          datos.vendedor_id || null,
          datos.periodo_desde,
          datos.periodo_hasta,
          datos.fecha_facturacion,
          datos.email_contacto,
          datos.costo_produccion,
          datos.monto_neto,
          datos.descuento_porcentaje,
          datos.descuento_en_cascada ? 1 : 0,
          descuentoMonto,
          montoNetoAplicado,
          datos.descuento_facturas_porcentaje,
          descuentoFacturasMonto,
          datos.descuento_facturas_en_cascada ? 1 : 0,
          montoFinal,
          datos.notas || null,
          datos.facturado === false ? 0 : 1,
          mesIngreso,
          anoIngreso,
          datos.vigencia_hasta_nota || null,
          ordenId,
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM ordenes_intermediarios WHERE orden_id = ?', [ordenId], (err) => (err ? reject(err) : resolve()));
    });
    for (const [index, inter] of comisionesCalculadas.entries()) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO ordenes_intermediarios (id, orden_id, intermediario_id, numero_nivel, porcentaje_comision, monto_comision, tipo_calculo, factura_formal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            ordenId,
            inter.intermediario_id,
            index + 1,
            inter.porcentaje_comision,
            inter.monto_comision,
            inter.tipo_calculo,
            inter.factura_formal ? 1 : 0,
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    // Se actualiza in place por id la línea que ya existía (para no romper
    // la referencia que Liquidaciones cuelga de este mismo id — ver
    // liquidaciones_detalle.orden_detalle_id — cada vez que se edita
    // cualquier otra cosa de la orden), se inserta nueva la que no traía id,
    // y se borra (junto con lo ya liquidado en esa línea) la que el usuario
    // sacó del formulario.
    const idsExistentes: string[] = (
      await new Promise<any[]>((resolve, reject) => {
        db.all('SELECT id FROM ordenes_publicidad_detalles WHERE orden_id = ?', [ordenId], (err, rows) =>
          err ? reject(err) : resolve(rows as any[])
        );
      })
    ).map((r) => r.id);

    const idsConservados = new Set<string>();
    for (const detalle of datos.detalles_productos) {
      const producto: any = await new Promise((resolve, reject) => {
        db.get('SELECT nombre FROM productos WHERE id = ?', [detalle.producto_id], (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!producto) throw new Error('El producto/soporte elegido no existe.');

      const idExistente = detalle.id && idsExistentes.includes(detalle.id) ? detalle.id : null;
      if (idExistente) {
        idsConservados.add(idExistente);
        await new Promise<void>((resolve, reject) => {
          db.run(
            `UPDATE ordenes_publicidad_detalles SET
              tipo_producto = ?, producto_id = ?, cantidad = ?, ubicacion = ?, especificaciones = ?,
              locacion_id = ?, punto_instalacion = ?, precio = ?
             WHERE id = ?`,
            [
              producto.nombre,
              detalle.producto_id,
              detalle.cantidad,
              detalle.ubicacion || null,
              detalle.especificaciones || null,
              detalle.locacion_id || null,
              detalle.punto_instalacion || null,
              detalle.precio || 0,
              idExistente,
            ],
            (err) => (err ? reject(err) : resolve())
          );
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO ordenes_publicidad_detalles (id, orden_id, tipo_producto, producto_id, cantidad, ubicacion, especificaciones, locacion_id, punto_instalacion, precio)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuid(),
              ordenId,
              producto.nombre,
              detalle.producto_id,
              detalle.cantidad,
              detalle.ubicacion || null,
              detalle.especificaciones || null,
              detalle.locacion_id || null,
              detalle.punto_instalacion || null,
              detalle.precio || 0,
            ],
            (err) => (err ? reject(err) : resolve())
          );
        });
      }
    }

    const idsAEliminar = idsExistentes.filter((id) => !idsConservados.has(id));
    if (idsAEliminar.length > 0) {
      const marcadores = idsAEliminar.map(() => '?').join(',');
      await new Promise<void>((resolve, reject) => {
        db.run(
          `DELETE FROM liquidaciones_detalle WHERE orden_detalle_id IN (${marcadores})`,
          idsAEliminar,
          (err) => (err ? reject(err) : resolve())
        );
      });
      await new Promise<void>((resolve, reject) => {
        db.run(
          `DELETE FROM ordenes_publicidad_detalles WHERE id IN (${marcadores})`,
          idsAEliminar,
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM contactos_email WHERE orden_id = ?', [ordenId], (err) => (err ? reject(err) : resolve()));
    });
    this.insertarContactosEmail(ordenId, datos.emails_contacto || []);

    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM arreglos_no_registrables WHERE orden_id = ?', [ordenId], (err) => (err ? reject(err) : resolve()));
    });
    this.insertarArreglosNoRegistrables(ordenId, datos.arreglos_no_registrables || []);

    // Una orden no registrada (facturado: false) nunca debería tener meses
    // "Pendiente" de facturar — si se edita y queda así, se borran (los
    // "Generada" con factura real ya emitida quedan intactos, eso no se toca).
    if (datos.facturado === false) {
      await new Promise<void>((resolve, reject) => {
        db.run(`DELETE FROM replicaciones_facturacion WHERE orden_id = ? AND estado = 'Pendiente'`, [ordenId], (err) =>
          err ? reject(err) : resolve()
        );
      });
    } else {
      await this.reconciliarReplicaciones(ordenId, datos.periodo_desde, datos.periodo_hasta);
    }

    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, existente, datos);

    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], (err, row) => (err ? reject(err) : resolve(row as any)));
    });
  }

  /**
   * Recalcula las replicaciones PENDIENTES (no facturadas) de una orden según
   * su período actual — borra las pendientes viejas y agrega las que falten
   * para los meses nuevos. Los meses que ya tienen factura generada quedan
   * intactos (no se duplican ni se borran).
   */
  private static async reconciliarReplicaciones(ordenId: string, fechaDesde: string, fechaHasta: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      db.run(`DELETE FROM replicaciones_facturacion WHERE orden_id = ? AND estado = 'Pendiente'`, [ordenId], (err) =>
        err ? reject(err) : resolve()
      );
    });
    const existentes: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT numero_mes, ano FROM replicaciones_facturacion WHERE orden_id = ?', [ordenId], (err, rows) =>
        err ? reject(err) : resolve(rows as any[])
      );
    });
    const yaExisten = new Set((existentes || []).map((r) => `${r.ano}-${r.numero_mes}`));
    const [anoDesde, mesDesde] = fechaDesde.split('-').map(Number);
    const [anoHasta, mesHasta] = fechaHasta.split('-').map(Number);
    for (let ano = anoDesde; ano <= anoHasta; ano++) {
      const mesInicio = ano === anoDesde ? mesDesde : 1;
      const mesFin = ano === anoHasta ? mesHasta : 12;
      for (let mes = mesInicio; mes <= mesFin; mes++) {
        if (yaExisten.has(`${ano}-${mes}`)) continue;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO replicaciones_facturacion (id, orden_id, numero_mes, ano, estado) VALUES (?, ?, ?, ?, 'Pendiente')`,
            [uuid(), ordenId, mes, ano],
            (err) => (err ? reject(err) : resolve())
          );
        });
      }
    }
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
   * Insertar arreglos no registrables (acuerdos informales que afectan el precio)
   */
  private static insertarArreglosNoRegistrables(
    ordenId: string,
    arreglos: Array<{ tipo?: string; descripcion?: string; monto?: number; tercero_nombre?: string }>
  ): void {
    arreglos.forEach((arreglo) => {
      const arregloId = uuid();
      db.run(
        `
        INSERT INTO arreglos_no_registrables (id, orden_id, tipo, descripcion, monto, tercero_nombre)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          arregloId,
          ordenId,
          arreglo.tipo || null,
          arreglo.descripcion || null,
          arreglo.monto || 0,
          arreglo.tercero_nombre || null,
        ]
      );
    });
  }

  /**
   * Crear replicaciones de facturación automáticamente
   */
  private static crearReplicacionesFacturacion(ordenId: string, fechaDesde: string, fechaHasta: string): void {
    // Se parsean año/mes directo del string "YYYY-MM-DD" en vez de con `new Date(...)`,
    // que interpreta fechas sin hora como UTC y puede correr al mes anterior según el
    // huso horario del servidor.
    const [anoDesde, mesDesde] = fechaDesde.split('-').map(Number);
    const [anoHasta, mesHasta] = fechaHasta.split('-').map(Number);

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

      resolve(orden);
    });
  }

  /**
   * Obtener orden con detalles completos
   */
  static async obtenerOrden(ordenId: string): Promise<any> {
    const orden = await this.queryGet('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId]);
    if (!orden || !orden.id) throw new Error('Orden no encontrada');

    const [detalles, documentos, contactos, replicaciones, arreglos, intermediarios] = await Promise.all([
      this.queryAll(
        `SELECT d.*, l.nombre as locacion_nombre, l.concesionario_id, p.razon_social as concesionario_nombre
         FROM ordenes_publicidad_detalles d
         LEFT JOIN locaciones l ON l.id = d.locacion_id
         LEFT JOIN proveedores p ON p.id = l.concesionario_id
         WHERE d.orden_id = ?`,
        [ordenId]
      ),
      this.queryAll('SELECT * FROM documentos_adjuntos WHERE orden_id = ?', [ordenId]),
      this.queryAll('SELECT * FROM contactos_email WHERE orden_id = ?', [ordenId]),
      this.queryAll(
        `SELECT r.*, f.numero as factura_numero FROM replicaciones_facturacion r
         LEFT JOIN facturas f ON f.id = r.factura_id
         WHERE r.orden_id = ? ORDER BY r.ano, r.numero_mes`,
        [ordenId]
      ),
      this.queryAll('SELECT * FROM arreglos_no_registrables WHERE orden_id = ?', [ordenId]),
      this.queryAll('SELECT * FROM ordenes_intermediarios WHERE orden_id = ? ORDER BY numero_nivel', [ordenId]),
    ]);

    return {
      ...orden,
      detalles,
      documentos,
      contactos,
      replicaciones,
      arreglos_no_registrables: arreglos,
      intermediarios,
    };
  }

  /**
   * Adjuntar documento
   */
  static async adjuntarDocumento(
    ordenId: string,
    nombreArchivo: string,
    tipoArchivo: string,
    urlDrive?: string,
    descripcion?: string,
    rutaArchivo?: string,
    usuarioId?: string,
    ip?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const docId = uuid();

      db.run(
        `
        INSERT INTO documentos_adjuntos (id, orden_id, nombre_archivo, tipo_archivo, url_drive, ruta_archivo, descripcion)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [docId, ordenId, nombreArchivo, tipoArchivo, urlDrive || null, rutaArchivo || null, descripcion || null],
        (err) => {
          if (err) return reject(err);

          AuditoriaService.registrarOperacion(
            'documentos_adjuntos',
            'INSERT',
            docId,
            null,
            { orden_id: ordenId, nombre_archivo: nombreArchivo },
            usuarioId,
            ip
          );

          resolve({
            id: docId,
            orden_id: ordenId,
            nombre_archivo: nombreArchivo,
            tipo_archivo: tipoArchivo,
            url_drive: urlDrive,
            ruta_archivo: rutaArchivo,
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

        // La frase base de la leyenda ("Exhibición publicidad...") sale de la
        // descripción del producto-servicio genérico, no está fija en código —
        // así, si en Productos se edita ese texto (o el día de mañana se arma
        // otro producto tipo "servicio" para otro caso), el default de la
        // factura lo sigue automáticamente.
        db.get('SELECT descripcion FROM productos WHERE id = ?', [PRODUCTO_SERVICIO_TOPVIEW_ID], (err, productoServicio: any) => {
          if (err) return reject(err);
          const baseDescripcion = (productoServicio?.descripcion || '').trim() || 'Exhibición publicidad';

        // Obtener replicaciones pendientes
        db.all(
          'SELECT * FROM replicaciones_facturacion WHERE orden_id = ? AND estado = "Pendiente"',
          [ordenId],
          async (err, replicaciones: any[]) => {
            if (err) return reject(err);

            const facturasGeneradas: any[] = [];

            for (const replicacion of replicaciones) {
              const numeroFactura = `FAC-${orden.numero_orden}-${replicacion.numero_mes}/${replicacion.ano}`;
              // Se factura al cliente siempre el bruto de la pauta (monto_neto): los
              // descuentos NC/FC y las comisiones a intermediarios son ejercicio comercial
              // interno de Topview, no reducen lo que paga el cliente.
              const total = orden.monto_neto * 1.21;

              // Leyenda del detalle: NO desglosa la pauta (eso vive en
              // ordenes_publicidad_detalles). Replica la convención real de Topview:
              // con N° de orden de agencia → "{baseDescripcion} S/ OP {numero}";
              // sin él → "{baseDescripcion} {desde} a {hasta}" del mes facturado.
              // leyenda_factura, si se cargó, reemplaza esta leyenda automática entera.
              const primerDiaMes = new Date(replicacion.ano, replicacion.numero_mes - 1, 1);
              const ultimoDiaMes = new Date(replicacion.ano, replicacion.numero_mes, 0);
              const formatoDDMM = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;

              let descripcionLinea: string;
              if (orden.leyenda_factura && orden.leyenda_factura.trim()) {
                descripcionLinea = orden.leyenda_factura.trim();
              } else if (orden.incluir_numero_orden_agencia && orden.numero_orden_agencia) {
                descripcionLinea = `${baseDescripcion} S/ OP ${orden.numero_orden_agencia}`;
              } else {
                descripcionLinea = `${baseDescripcion} ${formatoDDMM(primerDiaMes)} a ${formatoDDMM(ultimoDiaMes)}`;
              }

              const facturaId = uuid();
              const fechaFactura = new Date(replicacion.ano, replicacion.numero_mes - 1, 1).toISOString().split('T')[0];

              await this.runQuery(
                `
                INSERT INTO facturas (
                  id, numero, cliente_id, fecha, tipo_comprobante,
                  estado, subtotal, iva, total, saldo
                ) VALUES (?, ?, ?, ?, 'Factura A', 'Abierta', ?, ?, ?, ?)
              `,
                [facturaId, numeroFactura, orden.cliente_id, fechaFactura, orden.monto_neto, orden.monto_neto * 0.21, total, total]
              );

              await this.runQuery(
                `
                INSERT INTO facturas_detalles (
                  id, factura_id, producto_id, cantidad, precio_unitario, subtotal, descripcion
                ) VALUES (?, ?, ?, 1, ?, ?, ?)
              `,
                [uuid(), facturaId, PRODUCTO_SERVICIO_TOPVIEW_ID, orden.monto_neto, orden.monto_neto, descripcionLinea]
              );

              await this.runQuery(
                'UPDATE replicaciones_facturacion SET factura_id = ?, estado = "Generada", fecha_generacion = datetime("now") WHERE id = ?',
                [facturaId, replicacion.id]
              );

              if (orden.cliente_id) {
                await TesoreriaService.actualizarCCCliente(orden.cliente_id, total, 'debe');
              }
              await this.generarGastosParaPeriodo(orden, replicacion, fechaFactura, facturaId);

              facturasGeneradas.push(facturaId);
            }

            resolve(facturasGeneradas);
          }
        );
        });
      });
    });
  }

  /**
   * Genera los gastos "Pendiente" del período (agencia por % factura a
   * esperar, comisionistas con factura) — uno por proveedor por mes, sin
   * duplicar si ya se generó antes para esa orden/mes/origen.
   */
  private static async generarGastosParaPeriodo(
    orden: any,
    replicacion: any,
    fechaFactura: string,
    facturaId: string
  ): Promise<void> {
    const periodoLegible = `${String(replicacion.numero_mes).padStart(2, '0')}/${replicacion.ano}`;
    const tareas: Promise<void>[] = [];

    if (orden.agencia_id && orden.descuento_facturas_monto > 0) {
      tareas.push(
        new Promise((resolve, reject) => {
          db.get('SELECT * FROM agencias WHERE id = ?', [orden.agencia_id], (err, agencia: any) => {
            if (err) return reject(err);
            if (!agencia || !agencia.proveedor_id) return resolve();
            this.insertarGastoPendiente({
              proveedorId: agencia.proveedor_id,
              tipoGasto: 'Comisión de agencia (factura a esperar)',
              fecha: fechaFactura,
              monto: orden.descuento_facturas_monto,
              ordenId: orden.id,
              numeroMes: replicacion.numero_mes,
              ano: replicacion.ano,
              origen: 'agencia_fc',
              descripcion: `${agencia.nombre} — Orden N° ${orden.numero_orden} — Período ${periodoLegible}`,
            })
              .then(resolve)
              .catch(reject);
          });
        })
      );
    }

    tareas.push(
      new Promise((resolve, reject) => {
        db.all(
          `SELECT oi.monto_comision, i.proveedor_id, i.nombre
           FROM ordenes_intermediarios oi
           JOIN intermediarios i ON i.id = oi.intermediario_id
           WHERE oi.orden_id = ? AND oi.factura_formal = 1`,
          [orden.id],
          (err, rows: any[]) => {
            if (err) return reject(err);
            Promise.all(
              (rows || [])
                .filter((r) => r.proveedor_id && r.monto_comision > 0)
                .map((r) =>
                  this.insertarGastoPendiente({
                    proveedorId: r.proveedor_id,
                    tipoGasto: `Comisión de comisionista (${r.nombre})`,
                    fecha: fechaFactura,
                    monto: r.monto_comision,
                    ordenId: orden.id,
                    numeroMes: replicacion.numero_mes,
                    ano: replicacion.ano,
                    origen: 'comisionista_factura',
                    descripcion: `${r.nombre} — Orden N° ${orden.numero_orden} — Período ${periodoLegible}`,
                  })
                )
            )
              .then(() => resolve())
              .catch(reject);
          }
        );
      })
    );

    tareas.push(
      new Promise((resolve, reject) => {
        db.all(
          `SELECT oi.intermediario_id, oi.monto_comision, i.nombre
           FROM ordenes_intermediarios oi
           JOIN intermediarios i ON i.id = oi.intermediario_id
           WHERE oi.orden_id = ? AND (oi.factura_formal = 0 OR oi.factura_formal IS NULL)`,
          [orden.id],
          (err, rows: any[]) => {
            if (err) return reject(err);
            Promise.all(
              (rows || [])
                .filter((r) => r.monto_comision > 0)
                .map((r) =>
                  this.insertarComisionEfectivoPendiente({
                    intermediarioId: r.intermediario_id,
                    ordenId: orden.id,
                    facturaId,
                    monto: r.monto_comision,
                    numeroMes: replicacion.numero_mes,
                    ano: replicacion.ano,
                    descripcion: `${r.nombre} — Orden N° ${orden.numero_orden} — Período ${periodoLegible}`,
                  })
                )
            )
              .then(() => resolve())
              .catch(reject);
          }
        );
      })
    );

    await Promise.all(tareas);
  }

  private static insertarGastoPendiente(datos: {
    proveedorId: string;
    tipoGasto: string;
    fecha: string;
    monto: number;
    ordenId: string;
    numeroMes: number;
    ano: number;
    origen: string;
    descripcion: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM gastos WHERE orden_id = ? AND numero_mes = ? AND ano = ? AND origen = ? AND proveedor_id = ?`,
        [datos.ordenId, datos.numeroMes, datos.ano, datos.origen, datos.proveedorId],
        (err, existente) => {
          if (err) return reject(err);
          if (existente) return resolve();

          const id = uuid();
          const numero = `GASTO-${id.slice(0, 8).toUpperCase()}`;
          const iva = datos.monto * 0.21;
          const total = datos.monto + iva;

          db.run(
            `INSERT INTO gastos (
              id, numero, proveedor_id, tipo_gasto, fecha, estado, monto, iva, total,
              descripcion, orden_id, numero_mes, ano, origen
            ) VALUES (?, ?, ?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              numero,
              datos.proveedorId,
              datos.tipoGasto,
              datos.fecha,
              datos.monto,
              iva,
              total,
              datos.descripcion,
              datos.ordenId,
              datos.numeroMes,
              datos.ano,
              datos.origen,
            ],
            (err) => {
              if (err) return reject(err);
              AuditoriaService.registrarOperacion('gastos', 'INSERT', id, null, datos);
              resolve();
            }
          );
        }
      );
    });
  }

  private static insertarComisionEfectivoPendiente(datos: {
    intermediarioId: string;
    ordenId: string;
    facturaId: string;
    monto: number;
    numeroMes: number;
    ano: number;
    descripcion: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM comisiones_efectivo WHERE orden_id = ? AND intermediario_id = ? AND numero_mes = ? AND ano = ?`,
        [datos.ordenId, datos.intermediarioId, datos.numeroMes, datos.ano],
        (err, existente) => {
          if (err) return reject(err);
          if (existente) return resolve();

          const id = uuid();

          db.run(
            `INSERT INTO comisiones_efectivo (
              id, orden_id, intermediario_id, factura_id, numero_mes, ano, monto, descripcion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              datos.ordenId,
              datos.intermediarioId,
              datos.facturaId,
              datos.numeroMes,
              datos.ano,
              datos.monto,
              datos.descripcion,
            ],
            (err) => {
              if (err) return reject(err);
              AuditoriaService.registrarOperacion('comisiones_efectivo', 'INSERT', id, null, datos);
              resolve();
            }
          );
        }
      );
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
      let query = "SELECT * FROM ordenes_publicidad WHERE (habilitado != 0 OR habilitado IS NULL)";
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

      db.all(query, params, async (err, ordenes: any[]) => {
        if (err) return reject(err);
        if (!ordenes || ordenes.length === 0) return resolve([]);

        try {
          // Cantidad por producto de cada orden, para la vista tipo planilla
          // (una columna por soporte) sin tener que traer el detalle completo orden por orden.
          const filasCantidades = await this.queryAll(
            `SELECT orden_id, producto_id, SUM(cantidad) as cantidad
             FROM ordenes_publicidad_detalles
             WHERE producto_id IS NOT NULL
             GROUP BY orden_id, producto_id`
          );
          const cantidadesPorOrden: Record<string, Record<string, number>> = {};
          filasCantidades.forEach((f) => {
            if (!cantidadesPorOrden[f.orden_id]) cantidadesPorOrden[f.orden_id] = {};
            cantidadesPorOrden[f.orden_id][f.producto_id] = f.cantidad;
          });

          ordenes.forEach((o) => {
            o.cantidades_por_producto = cantidadesPorOrden[o.id] || {};
          });
          resolve(ordenes);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Actualizar estado de orden
   */
  static async actualizarEstado(
    ordenId: string,
    nuevoEstado: string,
    datosColppy?: { numero_factura_colppy?: string; numero_nc_colppy?: string }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE ordenes_publicidad SET estado = ?,
          numero_factura_colppy = COALESCE(?, numero_factura_colppy),
          numero_nc_colppy = COALESCE(?, numero_nc_colppy),
          updated_at = datetime("now")
        WHERE id = ?`,
        [nuevoEstado, datosColppy?.numero_factura_colppy ?? null, datosColppy?.numero_nc_colppy ?? null, ordenId],
        (err) => {
          if (err) return reject(err);
          AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { estado: nuevoEstado, ...datosColppy });
          resolve();
        }
      );
    });
  }

  // Editar los números de Colppy sin necesariamente cambiar el estado (ej. corregir
  // un número ya cargado, o cargarlo después de haber marcado "Facturada").
  static async actualizarFacturacionColppy(
    ordenId: string,
    datos: { numero_factura_colppy?: string; numero_nc_colppy?: string }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE ordenes_publicidad SET numero_factura_colppy = ?, numero_nc_colppy = ?, updated_at = datetime("now") WHERE id = ?',
        [datos.numero_factura_colppy || null, datos.numero_nc_colppy || null, ordenId],
        (err) => {
          if (err) return reject(err);
          AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, datos);
          resolve();
        }
      );
    });
  }

  // Cobro de una orden NO registrada (ver comentario en database.ts) — al
  // marcarla cobrada se estampa la fecha de hoy si no se pasa una explícita;
  // al desmarcarla se limpia la fecha para no dejar un dato inconsistente.
  static async actualizarCobro(ordenId: string, cobrado: boolean, fechaCobro?: string): Promise<void> {
    const fecha = cobrado ? fechaCobro || new Date().toISOString().split('T')[0] : null;
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE ordenes_publicidad SET cobrado = ?, fecha_cobro = ?, updated_at = datetime("now") WHERE id = ?',
        [cobrado ? 1 : 0, fecha, ordenId],
        (err) => {
          if (err) return reject(err);
          AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { cobrado, fecha_cobro: fecha });
          resolve();
        }
      );
    });
  }

  /**
   * Baja lógica de una orden: nunca se borra el registro (puede tener facturas,
   * gastos o comisiones ya generados) — se oculta de la lista activa.
   */
  static async eliminarOrden(ordenId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('UPDATE ordenes_publicidad SET habilitado = 0, updated_at = datetime("now") WHERE id = ?', [ordenId], (err) => {
        if (err) return reject(err);
        AuditoriaService.registrarOperacion('ordenes_publicidad', 'DELETE', ordenId, null, { habilitado: 0 });
        resolve();
      });
    });
  }

  private static queryAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, filas: any[]) => {
        if (err) return reject(err);
        resolve(filas || []);
      });
    });
  }

  private static queryGet(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, fila: any) => {
        if (err) return reject(err);
        resolve(fila || {});
      });
    });
  }

  private static runQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Reporte de órdenes con análisis de rentabilidad, más los desgloses que
   * alimentan los gráficos de Reportes → Topview (mensual, por soporte,
   * top clientes, comisión tipo 1/2).
   *
   * `incluirNetos` gatea todo lo que sea neto post-comisión (monto_final,
   * ganancia, margen, y el desglose de comisión tipo 1/2 por comisionista)
   * — reservado a quien tenga el permiso `topview_netos_ver` (Administrador).
   * De Gerente para abajo solo se manda la facturación bruta (monto_neto):
   * el dato ni sale del servidor, no es solo ocultarlo en la pantalla.
   */
  static async reporteOrdenes(incluirNetos: boolean = true): Promise<any> {
    const analisis = await this.queryAll(`
      SELECT
        tipo_anunciante,
        COUNT(*) as cantidad,
        SUM(costo_produccion) as costo_total,
        SUM(monto_neto) as monto_neto_total,
        SUM(monto_final) as monto_final_total,
        SUM(monto_final - costo_produccion) as ganancia_total,
        ROUND(((SUM(monto_final - costo_produccion) / SUM(monto_final)) * 100), 2) as margen_ganancia
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL)
      GROUP BY tipo_anunciante
    `);

    const totales = await this.queryGet(`
      SELECT
        COUNT(*) as total_ordenes,
        SUM(costo_produccion) as costo_total,
        SUM(monto_neto) as monto_neto_total,
        SUM(monto_final) as monto_final_total,
        SUM(monto_final - costo_produccion) as ganancia_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL)
    `);

    // Facturación real por mes (según fecha_facturacion, no el período de la
    // campaña) — incluye todas las órdenes habilitadas sin importar el estado
    // actual, porque una orden ya Finalizada igual facturó en su momento.
    const porMes = await this.queryAll(`
      SELECT strftime('%Y-%m', fecha_facturacion) as mes,
        SUM(monto_neto) as monto_neto_total,
        SUM(monto_final) as monto_final_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND fecha_facturacion IS NOT NULL
      GROUP BY mes
      ORDER BY mes
    `);

    // Venta real por mes (según mes/año de ingreso — el mes comercial en el
    // que se cargó/informó la pauta), distinto de la facturación de arriba:
    // una orden puede venderse en un mes y facturarse recién el siguiente
    // ("Mes de ingreso (venta)" vs "Fecha de facturación" en el form de
    // Órdenes). mes_ingreso/ano_ingreso quedan siempre completos al guardar
    // una orden (por defecto, el mes/año de periodo_desde si no se cargan a
    // mano — ver TopviewService.crearOrden), pero las órdenes creadas antes
    // de que existiera esta columna pueden tenerla en NULL, así que se repite
    // acá el mismo fallback a periodo_desde por las dudas.
    const porMesVenta = await this.queryAll(`
      SELECT printf('%04d-%02d',
          COALESCE(ano_ingreso, CAST(strftime('%Y', periodo_desde) AS INTEGER)),
          COALESCE(mes_ingreso, CAST(strftime('%m', periodo_desde) AS INTEGER))
        ) as mes,
        SUM(monto_neto) as monto_neto_total,
        SUM(monto_final) as monto_final_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL)
      GROUP BY mes
      ORDER BY mes
    `);

    // Mix de soportes vendidos (excluye el placeholder de servicio genérico).
    const porSoporte = await this.queryAll(`
      SELECT p.nombre as producto, SUM(d.cantidad) as cantidad
      FROM ordenes_publicidad_detalles d
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      JOIN productos p ON p.id = d.producto_id
      WHERE (o.habilitado != 0 OR o.habilitado IS NULL) AND p.tipo = 'fisico'
      GROUP BY p.id
      ORDER BY cantidad DESC
    `);

    // Sin permiso de netos, el ranking usa la bruta (monto_neto) en vez del
    // neto post-comisión — nunca se manda monto_final campo por campo.
    const campoTopClientes = incluirNetos ? 'monto_final' : 'monto_neto';
    const topClientes = await this.queryAll(`
      SELECT razon_social, SUM(${campoTopClientes}) as monto_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL)
      GROUP BY razon_social
      ORDER BY monto_total DESC
      LIMIT 10
    `);

    const porComisionistaTipo = incluirNetos
      ? await this.queryAll(`
          SELECT i.nombre,
            COALESCE(SUM(CASE WHEN oi.factura_formal = 1 THEN oi.monto_comision ELSE 0 END), 0) as comision_tipo1,
            COALESCE(SUM(CASE WHEN oi.factura_formal = 0 OR oi.factura_formal IS NULL THEN oi.monto_comision ELSE 0 END), 0) as comision_tipo2
          FROM intermediarios i
          LEFT JOIN ordenes_intermediarios oi ON oi.intermediario_id = i.id
          WHERE i.habilitado = 1
          GROUP BY i.id
          HAVING comision_tipo1 > 0 OR comision_tipo2 > 0
          ORDER BY (comision_tipo1 + comision_tipo2) DESC
        `)
      : [];

    // Recortar campos post-comisión de lo que sí se manda siempre (totales y
    // por_anunciante) cuando no hay permiso de netos — se borran, no se
    // ocultan solo en la pantalla.
    const totalesFiltrados = incluirNetos
      ? totales || {}
      : { total_ordenes: totales?.total_ordenes ?? 0, monto_neto_total: totales?.monto_neto_total ?? 0 };
    const analisisFiltrado = (analisis || []).map((a: any) =>
      incluirNetos
        ? a
        : { tipo_anunciante: a.tipo_anunciante, cantidad: a.cantidad, monto_neto_total: a.monto_neto_total }
    );
    const porMesFiltrado = (porMes || []).map((m: any) =>
      incluirNetos ? m : { mes: m.mes, monto_neto_total: m.monto_neto_total }
    );
    const porMesVentaFiltrado = (porMesVenta || []).map((m: any) =>
      incluirNetos ? m : { mes: m.mes, monto_neto_total: m.monto_neto_total }
    );

    return {
      por_anunciante: analisisFiltrado,
      totales: totalesFiltrados,
      por_mes: porMesFiltrado,
      por_mes_venta: porMesVentaFiltrado,
      por_soporte: porSoporte || [],
      top_clientes: topClientes || [],
      por_comisionista_tipo: porComisionistaTipo,
      incluye_netos: incluirNetos,
      generado_en: new Date().toISOString(),
    };
  }
}
