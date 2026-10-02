import { v4 as uuid } from 'uuid';
import db from '../database';
import { OrdenPublicidad, ReplicacionFacturacion } from '../types';
import { AuditoriaService } from './auditoria';
import { TesoreriaService } from './tesoreria';
import { TelegramService } from './telegram';
import {
  addMonthClamped,
  subtractMonthClamped,
  calcularDescuentosCascada,
  calcularComisionesCascada,
  compararLineasPorSoporte,
} from './calculosTopview';

export { addMonthClamped, subtractMonthClamped, calcularDescuentosCascada, calcularComisionesCascada };

const PRODUCTO_SERVICIO_TOPVIEW_ID = 'topview-serv-1';
// "Ingreso final" de una orden — monto_final si está registrada (pasa por
// Colppy/comisiones), monto_neto si no (nunca las tocan). Único criterio de
// "cuánto entró realmente" en todos los reportes/rankings que lo usan; antes
// estaba copiado a mano en cada query, ahora es una sola fuente de verdad.
const SQL_INGRESO_FINAL = 'CASE WHEN facturado = 0 THEN monto_neto ELSE monto_final END';
// Campaña vendida directamente por el concesionario, no por Topview (ej.
// World Padel Pilar) — señal única en tipo_anunciante, sin columna aparte.
// Ver [[project_world_padel_cuenta_corriente_comerciales]].
const TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO = 'Pauta Concesionario';

interface DatosOrden {
  tipo_anunciante: string;
  nombre_anunciante: string;
  numero_orden_agencia?: string;
  numeros_orden_agencia_por_mes?: string[];
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
  descuento_porcentaje_2?: number;
  descuento_en_cascada_2?: boolean;
  descuento_facturas_porcentaje: number;
  descuento_facturas_en_cascada?: boolean;
  mes_ingreso?: number;
  ano_ingreso?: number;
  vigencia_hasta_nota?: string;
  // Estructurado (mes/año), separado de la nota libre de arriba — dispara el
  // clonado mensual automático en crearOrden si es posterior al mes de
  // ingreso de esta orden. La nota libre sigue siendo solo un comentario.
  vigencia_hasta_mes?: number;
  vigencia_hasta_ano?: number;
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
  // Si esta orden dispara el aviso automático a Telegram (nueva orden /
  // arranca hoy) — default true, se destilda en las que no ameritan avisar.
  avisar_telegram?: boolean;
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
  /**
   * Crear una orden — sin el clonado automático por "vigencia hasta" (ver
   * crearOrden, que envuelve esta función y arma los clones mensuales).
   */
  private static async crearOrdenUnica(datos: DatosOrden): Promise<OrdenPublicidad> {
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

        // Descuentos NC1/NC2/FC y comisiones a comisionistas — ver
        // calcularDescuentosCascada/calcularComisionesCascada más arriba en
        // este archivo para el detalle de la lógica (misma que actualizarOrden).
        const { descuentoMonto, descuentoMonto2, descuentoFacturasMonto, montoNetoAplicado, montoNetoBlanco } =
          calcularDescuentosCascada(datos.monto_neto, [
            { pct: datos.descuento_porcentaje, cascada: !!datos.descuento_en_cascada },
            { pct: datos.descuento_porcentaje_2 || 0, cascada: !!datos.descuento_en_cascada_2 },
            { pct: datos.descuento_facturas_porcentaje, cascada: !!datos.descuento_facturas_en_cascada },
          ]);

        const { comisionesCalculadas, montoFinal } = calcularComisionesCascada(
          montoNetoBlanco,
          intermediariosConFacturaFormal || []
        );

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
          descuento_porcentaje_2, descuento_en_cascada_2, descuento_monto_2,
          monto_neto_aplicado, descuento_facturas_porcentaje, descuento_facturas_monto,
          descuento_facturas_en_cascada, monto_final, notas, facturado, mes_ingreso, ano_ingreso,
          vigencia_hasta_nota, vigencia_hasta_mes, vigencia_hasta_ano, estado, avisar_telegram
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            datos.descuento_porcentaje_2 || 0,
            datos.descuento_en_cascada_2 ? 1 : 0,
            descuentoMonto2,
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
            datos.vigencia_hasta_mes || null,
            datos.vigencia_hasta_ano || null,
            'Cargada',
            datos.avisar_telegram === false ? 0 : 1,
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
                    if (datos.facturado !== false && datos.tipo_anunciante !== TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO) {
                      this.crearReplicacionesFacturacion(ordenId, mesIngreso, anoIngreso);
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
            if (datos.facturado !== false && datos.tipo_anunciante !== TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO) {
              this.crearReplicacionesFacturacion(ordenId, mesIngreso, anoIngreso);
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
   * Crea la orden pedida y, si se cargó "vigencia hasta" (mes/año) posterior
   * al mes de ingreso de esta orden, clona automáticamente el mismo desglose
   * (locación/producto/monto) mes a mes hasta ese mes inclusive — el número
   * de orden de agencia de cada clon queda en "REVISAR" para completarlo
   * cuando se sepa el real de cada mes. La orden devuelta es siempre la
   * pedida, nunca uno de los clones.
   */
  static async crearOrden(
    datos: DatosOrden
  ): Promise<{ orden: OrdenPublicidad; clonado: { creadas: number; saltadas: Array<{ mes: number; ano: number }> } | null }> {
    const ordenCreada = await this.crearOrdenUnica(datos);
    const clonado = await this.generarClonesVigencia(datos, ordenCreada.id);
    return { orden: ordenCreada, clonado };
  }

  // Solo para deshacer una creación fallida (ver crearOrdenesPorMes): borra la
  // orden recién creada con todo lo que se le generó. Nunca para órdenes con
  // facturas o historial real — por eso las demás bajas son lógicas.
  private static async borrarOrdenCreadaDefinitivamente(ordenId: string): Promise<void> {
    for (const tabla of [
      'replicaciones_facturacion',
      'ordenes_intermediarios',
      'ordenes_publicidad_detalles',
      'contactos_email',
      'arreglos_no_registrables',
    ]) {
      await this.runQuery(`DELETE FROM ${tabla} WHERE orden_id = ?`, [ordenId]);
    }
    await this.runQuery('DELETE FROM ordenes_publicidad WHERE id = ?', [ordenId]);
  }

  /**
   * Alternativa a "Repetir automáticamente hasta": en vez de cargar un solo
   * mes y clonar hacia adelante (con REVISAR para completar después), el
   * usuario carga el período completo de una (ej. 01/10 a 31/12) y esto lo
   * parte en una orden real por mes — ninguna queda en REVISAR porque el
   * usuario ya validó el período completo en el momento de cargarlo. El
   * número de orden de agencia solo se copia en la primera; los meses
   * siguientes quedan vacíos (decisión explícita del usuario: cada mes
   * puede tener su propio N° real más adelante, no asumir que se repite).
   * periodo_desde/fecha_facturacion avanzan mes a mes con addMonthClamped
   * (mismo criterio que generarClonesVigencia), el último tramo se recorta
   * exacto al periodo_hasta pedido aunque no caiga justo en un borde de mes.
   */
  static async crearOrdenesPorMes(datos: DatosOrden): Promise<{ ordenes: OrdenPublicidad[] }> {
    if (!datos.periodo_desde || !datos.periodo_hasta) {
      throw new Error('El período (desde/hasta) es obligatorio.');
    }
    if (!datos.fecha_facturacion) {
      throw new Error('La fecha de facturación es obligatoria para partir la orden por mes.');
    }
    const restarUnDia = (fecha: string): string => {
      const [y, m, d] = fecha.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      return dt.toISOString().slice(0, 10);
    };

    const [anoDesde, mesDesde] = datos.periodo_desde.split('-').map(Number);
    let mesActual = datos.mes_ingreso || mesDesde;
    let anoActual = datos.ano_ingreso || anoDesde;
    let desdeActual = datos.periodo_desde;
    let fechaFacturacionActual = datos.fecha_facturacion;

    const ordenes: OrdenPublicidad[] = [];
    let primera = true;
    let indice = 0;
    // Todo o nada: si falla la creación de cualquier mes, se borran los que ya
    // se habían creado (las órdenes se crean de a una, sin transacción única).
    try {
      while (true) {
        const siguienteDesde = addMonthClamped(desdeActual);
        let hastaActual = restarUnDia(siguienteDesde);
        const esUltimo = hastaActual >= datos.periodo_hasta;
        if (esUltimo) hastaActual = datos.periodo_hasta;

        const orden = await this.crearOrdenUnica({
          ...datos,
          periodo_desde: desdeActual,
          periodo_hasta: hastaActual,
          fecha_facturacion: fechaFacturacionActual,
          mes_ingreso: mesActual,
          ano_ingreso: anoActual,
          numero_orden_agencia: primera ? datos.numero_orden_agencia : datos.numeros_orden_agencia_por_mes?.[indice] || undefined,
          vigencia_hasta_mes: undefined,
          vigencia_hasta_ano: undefined,
        });
        ordenes.push(orden);

        if (esUltimo) break;
        desdeActual = siguienteDesde;
        fechaFacturacionActual = addMonthClamped(fechaFacturacionActual);
        mesActual += 1;
        if (mesActual > 12) {
          mesActual = 1;
          anoActual += 1;
        }
        primera = false;
        indice += 1;
      }
    } catch (err: any) {
      for (const creada of ordenes) {
        await this.borrarOrdenCreadaDefinitivamente(creada.id);
      }
      throw new Error(
        `${err.message}${ordenes.length > 0 ? ` (no se creó ninguna orden: se deshizo ${ordenes.length === 1 ? 'la 1 ya creada' : `las ${ordenes.length} ya creadas`})` : ''}`
      );
    }
    return { ordenes };
  }

  /**
   * A partir de una orden base (recién creada o recién editada) con
   * "vigencia hasta" (mes/año) cargada, genera los clones mensuales
   * faltantes hasta ese mes inclusive — con numero_orden_agencia en
   * "REVISAR" para completar cuando se sepa el real de cada mes. Antes de
   * crear cada clon, chequea si ya existe una orden del mismo cliente +
   * mismo nombre de anunciante para ese mes/año (para no duplicar una
   * orden que el usuario ya haya cargado a mano para ese mes) — si existe,
   * la saltea y la reporta en "saltadas" en vez de crearla. Devuelve null
   * si la orden no tiene vigencia_hasta cargada.
   */
  // Un mismo cliente/anunciante puede tener varias órdenes simultáneas en el
  // mismo mes (ej. "Zona Norte" y "Zona Sur" de un mismo circuito) — el
  // chequeo de "ya existe orden este mes" no puede alcanzar con cliente +
  // anunciante + mes, porque saltearía/confundiría una con la otra. Si la
  // orden de origen tiene locación cargada en sus líneas, exige que la
  // candidata comparta al menos una locación; si no tiene ninguna (queda
  // como estaba antes), cae al criterio viejo.
  private static async buscarOrdenExistenteEnMes(
    clienteId: string,
    nombreAnunciante: string,
    mes: number,
    ano: number,
    idExcluir: string,
    locacionIds: string[]
  ): Promise<{ id: string } | undefined> {
    const locacionesUnicas = Array.from(new Set(locacionIds.filter((id): id is string => !!id)));
    if (locacionesUnicas.length === 0) {
      return this.queryGet(
        `SELECT id FROM ordenes_publicidad
         WHERE (habilitado != 0 OR habilitado IS NULL) AND cliente_id = ? AND nombre_anunciante = ?
           AND mes_ingreso = ? AND ano_ingreso = ? AND id != ?`,
        [clienteId, nombreAnunciante, mes, ano, idExcluir]
      );
    }
    const marcadores = locacionesUnicas.map(() => '?').join(',');
    return this.queryGet(
      `SELECT o.id FROM ordenes_publicidad o
       WHERE (o.habilitado != 0 OR o.habilitado IS NULL) AND o.cliente_id = ? AND o.nombre_anunciante = ?
         AND o.mes_ingreso = ? AND o.ano_ingreso = ? AND o.id != ?
         AND EXISTS (
           SELECT 1 FROM ordenes_publicidad_detalles d
           WHERE d.orden_id = o.id AND d.locacion_id IN (${marcadores})
         )`,
      [clienteId, nombreAnunciante, mes, ano, idExcluir, ...locacionesUnicas]
    );
  }

  private static async generarClonesVigencia(
    datos: DatosOrden,
    ordenIdBase: string
  ): Promise<{ creadas: number; saltadas: Array<{ mes: number; ano: number }> } | null> {
    if (!datos.vigencia_hasta_mes || !datos.vigencia_hasta_ano) return null;

    const [anoDesde, mesDesde] = datos.periodo_desde.split('-').map(Number);
    let mesActual = datos.mes_ingreso || mesDesde;
    let anoActual = datos.ano_ingreso || anoDesde;
    let periodoDesdeActual = datos.periodo_desde;
    let periodoHastaActual = datos.periodo_hasta;
    let fechaFacturacionActual = datos.fecha_facturacion;

    let creadas = 0;
    const saltadas: Array<{ mes: number; ano: number }> = [];

    while (
      anoActual < datos.vigencia_hasta_ano ||
      (anoActual === datos.vigencia_hasta_ano && mesActual < datos.vigencia_hasta_mes)
    ) {
      periodoDesdeActual = addMonthClamped(periodoDesdeActual);
      periodoHastaActual = addMonthClamped(periodoHastaActual);
      fechaFacturacionActual = addMonthClamped(fechaFacturacionActual);
      mesActual += 1;
      if (mesActual > 12) {
        mesActual = 1;
        anoActual += 1;
      }

      const yaExiste = await this.buscarOrdenExistenteEnMes(
        datos.cliente_id,
        datos.nombre_anunciante,
        mesActual,
        anoActual,
        ordenIdBase,
        (datos.detalles_productos || []).map((d) => d.locacion_id || '')
      );
      if (yaExiste?.id) {
        saltadas.push({ mes: mesActual, ano: anoActual });
        continue;
      }

      await this.crearOrdenUnica({
        ...datos,
        numero_orden_agencia: 'REVISAR',
        periodo_desde: periodoDesdeActual,
        periodo_hasta: periodoHastaActual,
        fecha_facturacion: fechaFacturacionActual,
        mes_ingreso: mesActual,
        ano_ingreso: anoActual,
        vigencia_hasta_mes: undefined,
        vigencia_hasta_ano: undefined,
      });
      creadas += 1;
    }

    return { creadas, saltadas };
  }

  /**
   * Clona una orden puntual a un mes/año destino arbitrario (no solo el
   * siguiente/anterior) — mismo cliente/anunciante, mismo desglose de
   * productos/comisionistas/contactos. Es el "clic en cualquier celda vacía"
   * del timeline de continuidad: un cliente puede decidir mes a mes si sigue
   * o no, así que cualquier mes vacío (adelante, atrás, o un hueco en el
   * medio) tiene que poder completarse, no solo el inmediato siguiente al
   * último cargado. Copia todo tal cual, corre período/fecha de facturación
   * la cantidad de meses que corresponda (con addMonthClamped/
   * subtractMonthClamped, paso a paso para que el recorte de fin de mes se
   * acumule bien), y deja numero_orden_agencia en "REVISAR" para completarlo
   * a mano — desaparece solo cuando se edita con el número real (misma
   * convención que el clonado automático por vigencia_hasta). Si ya existe
   * una orden de ese cliente/anunciante para el mes destino (cargada a mano
   * o por otro clonado), no duplica: devuelve esa orden con `yaExistia: true`
   * para que el timeline simplemente la abra.
   */
  static async clonarOrdenAMes(ordenId: string, mesDestino: number, anoDestino: number): Promise<{ orden: any; yaExistia: boolean }> {
    const orden: any = await this.queryGet('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId]);
    if (!orden) throw new Error('Orden no encontrada.');

    const [detalles, contactos, intermediarios, arreglos] = await Promise.all([
      this.queryAll('SELECT * FROM ordenes_publicidad_detalles WHERE orden_id = ?', [ordenId]),
      this.queryAll('SELECT * FROM contactos_email WHERE orden_id = ?', [ordenId]),
      this.queryAll('SELECT * FROM ordenes_intermediarios WHERE orden_id = ? ORDER BY numero_nivel', [ordenId]),
      this.queryAll('SELECT * FROM arreglos_no_registrables WHERE orden_id = ?', [ordenId]),
    ]);

    const [anoDesde, mesDesde] = orden.periodo_desde.split('-').map(Number);
    const mesOrigen = orden.mes_ingreso || mesDesde;
    const anoOrigen = orden.ano_ingreso || anoDesde;
    const diffMeses = (anoDestino - anoOrigen) * 12 + (mesDestino - mesOrigen);
    if (diffMeses === 0) throw new Error('Esa orden ya está en ese mes.');

    const paso = diffMeses > 0 ? addMonthClamped : subtractMonthClamped;
    let periodoDesde = orden.periodo_desde;
    let periodoHasta = orden.periodo_hasta;
    let fechaFacturacion = orden.fecha_facturacion;
    for (let i = 0; i < Math.abs(diffMeses); i++) {
      periodoDesde = paso(periodoDesde);
      periodoHasta = paso(periodoHasta);
      if (fechaFacturacion) fechaFacturacion = paso(fechaFacturacion);
    }

    const yaExiste = await this.buscarOrdenExistenteEnMes(
      orden.cliente_id,
      orden.nombre_anunciante,
      mesDestino,
      anoDestino,
      ordenId,
      detalles.map((d: any) => d.locacion_id || '')
    );
    if (yaExiste?.id) {
      const existente = await this.obtenerOrden(yaExiste.id);
      return { orden: existente, yaExistia: true };
    }

    const datosClon: DatosOrden = {
      tipo_anunciante: orden.tipo_anunciante,
      nombre_anunciante: orden.nombre_anunciante,
      numero_orden_agencia: 'REVISAR',
      incluir_numero_orden_agencia: !!orden.incluir_numero_orden_agencia,
      leyenda_factura: orden.leyenda_factura,
      cliente_id: orden.cliente_id,
      agencia_id: orden.agencia_id || undefined,
      vendedor_id: orden.vendedor_id || undefined,
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
      fecha_facturacion: fechaFacturacion,
      email_contacto: orden.email_contacto || '',
      costo_produccion: orden.costo_produccion || 0,
      monto_neto: orden.monto_neto,
      descuento_porcentaje: orden.descuento_porcentaje || 0,
      descuento_en_cascada: !!orden.descuento_en_cascada,
      descuento_porcentaje_2: orden.descuento_porcentaje_2 || 0,
      descuento_en_cascada_2: !!orden.descuento_en_cascada_2,
      descuento_facturas_porcentaje: orden.descuento_facturas_porcentaje || 0,
      descuento_facturas_en_cascada: !!orden.descuento_facturas_en_cascada,
      mes_ingreso: mesDestino,
      ano_ingreso: anoDestino,
      detalles_productos: (detalles || []).map((d: any) => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        ubicacion: d.ubicacion,
        especificaciones: d.especificaciones,
        locacion_id: d.locacion_id,
        punto_instalacion: d.punto_instalacion,
        precio: d.precio,
      })),
      emails_contacto: (contactos || []).map((c: any) => ({
        email: c.email,
        nombre: c.nombre_contacto,
        cargo: c.cargo,
        principal: !!c.principal,
      })),
      intermediarios: (intermediarios || []).map((i: any) => ({
        intermediario_id: i.intermediario_id,
        porcentaje_comision: i.porcentaje_comision,
        tipo_calculo: i.tipo_calculo,
        factura_formal: !!i.factura_formal,
      })),
      notas: orden.notas || '',
      facturado: orden.facturado === undefined || orden.facturado === null ? true : !!orden.facturado,
      arreglos_no_registrables: (arreglos || []).map((a: any) => ({
        tipo: a.tipo,
        descripcion: a.descripcion,
        monto: a.monto,
        tercero_nombre: a.tercero_nombre,
      })),
    };

    const nueva = await this.crearOrdenUnica(datosClon);
    return { orden: nueva, yaExistia: false };
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
  static async actualizarOrden(
    ordenId: string,
    datos: DatosOrden
  ): Promise<{ orden: OrdenPublicidad; clonado: { creadas: number; saltadas: Array<{ mes: number; ano: number }> } | null }> {
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

    // Ver calcularDescuentosCascada/calcularComisionesCascada más arriba en
    // este archivo (misma lógica que crearOrdenUnica).
    const { descuentoMonto, descuentoMonto2, descuentoFacturasMonto, montoNetoAplicado, montoNetoBlanco } =
      calcularDescuentosCascada(datos.monto_neto, [
        { pct: datos.descuento_porcentaje, cascada: !!datos.descuento_en_cascada },
        { pct: datos.descuento_porcentaje_2 || 0, cascada: !!datos.descuento_en_cascada_2 },
        { pct: datos.descuento_facturas_porcentaje, cascada: !!datos.descuento_facturas_en_cascada },
      ]);

    const { comisionesCalculadas, montoFinal } = calcularComisionesCascada(
      montoNetoBlanco,
      intermediariosConFacturaFormal
    );

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
          descuento_porcentaje_2 = ?, descuento_en_cascada_2 = ?, descuento_monto_2 = ?,
          monto_neto_aplicado = ?, descuento_facturas_porcentaje = ?, descuento_facturas_monto = ?,
          descuento_facturas_en_cascada = ?, monto_final = ?, notas = ?, facturado = ?,
          mes_ingreso = ?, ano_ingreso = ?, vigencia_hasta_nota = ?,
          vigencia_hasta_mes = ?, vigencia_hasta_ano = ?, avisar_telegram = ?,
          updated_at = CURRENT_TIMESTAMP
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
          datos.descuento_porcentaje_2 || 0,
          datos.descuento_en_cascada_2 ? 1 : 0,
          descuentoMonto2,
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
          datos.vigencia_hasta_mes || null,
          datos.vigencia_hasta_ano || null,
          datos.avisar_telegram === false ? 0 : 1,
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

    // Una orden no registrada (facturado: false) o vendida directamente por
    // el concesionario nunca debería tener meses "Pendiente" de facturar —
    // si se edita y queda así, se borran (los "Generada" con factura real ya
    // emitida quedan intactos, eso no se toca).
    if (datos.facturado === false || datos.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO) {
      await new Promise<void>((resolve, reject) => {
        db.run(`DELETE FROM replicaciones_facturacion WHERE orden_id = ? AND estado = 'Pendiente'`, [ordenId], (err) =>
          err ? reject(err) : resolve()
        );
      });
    } else {
      await this.reconciliarReplicaciones(ordenId, mesIngreso, anoIngreso);
    }

    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, existente, datos);

    // A diferencia de crearOrden, acá la orden base YA existía antes de esta
    // edición — el clonado solo genera los meses que faltan hacia adelante,
    // nunca reemplaza ni toca la orden editada en sí.
    const clonado = await this.generarClonesVigencia({ ...datos, mes_ingreso: mesIngreso, ano_ingreso: anoIngreso }, ordenId);

    const orden: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId], (err, row) => (err ? reject(err) : resolve(row)));
    });
    return { orden, clonado };
  }

  /**
   * Recalcula la replicación PENDIENTE (no facturada) de una orden según su
   * mes de ingreso actual — 1 orden es siempre 1 factura, sin importar
   * cuántos días dure el período (30/31 días, 45, 7, 2 meses, lo que sea).
   * Borra la pendiente vieja si el mes cambió y agrega la del mes nuevo. Si
   * ese mes ya tiene una factura generada, no se toca ni se duplica.
   */
  private static async reconciliarReplicaciones(ordenId: string, mesIngreso: number, anoIngreso: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      db.run(`DELETE FROM replicaciones_facturacion WHERE orden_id = ? AND estado = 'Pendiente'`, [ordenId], (err) =>
        err ? reject(err) : resolve()
      );
    });
    const yaExiste = await this.queryGet(
      `SELECT id FROM replicaciones_facturacion WHERE orden_id = ? AND ano = ? AND numero_mes = ?`,
      [ordenId, anoIngreso, mesIngreso]
    );
    if (!yaExiste?.id) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO replicaciones_facturacion (id, orden_id, numero_mes, ano, estado) VALUES (?, ?, ?, ?, 'Pendiente')`,
          [uuid(), ordenId, mesIngreso, anoIngreso],
          (err) => (err ? reject(err) : resolve())
        );
      });
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
   * Crear la replicación de facturación de una orden nueva — siempre 1 sola
   * fila, en el mes/año de ingreso: 1 orden es 1 factura, sin importar
   * cuántos días dure el período (30/31, 45, 7, 2 meses, lo que sea).
   */
  private static crearReplicacionesFacturacion(ordenId: string, mesIngreso: number, anoIngreso: number): void {
    db.run(
      `INSERT INTO replicaciones_facturacion (id, orden_id, numero_mes, ano, estado) VALUES (?, ?, ?, ?, 'Pendiente')`,
      [uuid(), ordenId, mesIngreso, anoIngreso]
    );
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
   * Obtener orden con detalles completos.
   *
   * `incluirComisiones` gatea `comisiones_desagregado` (el detalle de cada
   * comisión a comisionistas — nombre, %, tipo de cálculo y monto — entre
   * "Se factura al cliente" y "Neto Topview") — reservado a quien tenga el
   * permiso `topview_netos_ver` (Administrador/socios), mismo criterio que
   * reporteOrdenes. Ojo: esto es DISTINTO del array `intermediarios` que ya
   * se devuelve siempre (ese alimenta el formulario de edición para
   * cualquiera con topview_editar — nunca gatearlo, romper eso borraría
   * comisiones reales al guardar con el array vacío).
   */
  static async obtenerOrden(ordenId: string, incluirComisiones: boolean = false): Promise<any> {
    const orden = await this.queryGet('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId]);
    if (!orden || !orden.id) throw new Error('Orden no encontrada');

    // Datos de facturación del cliente (a quien se le emite la factura, no
    // necesariamente el anunciante real) — usados por el export de la orden.
    const cliente = orden.cliente_id
      ? await this.queryGet(
          'SELECT razon_social, cuit, condicion_iva, direccion, ciudad, codigo_postal, provincia, pais FROM clientes WHERE id = ?',
          [orden.cliente_id]
        )
      : null;

    const [detalles, documentos, contactos, replicaciones, arreglos, intermediarios] = await Promise.all([
      this.queryAll(
        `SELECT d.*, l.nombre as locacion_nombre, l.concesionario_id, p.razon_social as concesionario_nombre
         FROM ordenes_publicidad_detalles d
         LEFT JOIN locaciones l ON l.id = d.locacion_id
         LEFT JOIN proveedores p ON p.id = l.concesionario_id
         WHERE d.orden_id = ?`,
        [ordenId]
      ).then((filas) => [...filas].sort(compararLineasPorSoporte)),
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

    const comisionesDesagregado = incluirComisiones
      ? await this.queryAll(
          `SELECT oi.numero_nivel, oi.porcentaje_comision, oi.monto_comision, oi.tipo_calculo, oi.factura_formal, i.nombre as intermediario_nombre
           FROM ordenes_intermediarios oi
           JOIN intermediarios i ON i.id = oi.intermediario_id
           WHERE oi.orden_id = ?
           ORDER BY oi.numero_nivel`,
          [ordenId]
        )
      : undefined;

    return {
      ...orden,
      cliente,
      detalles,
      documentos,
      contactos,
      replicaciones,
      arreglos_no_registrables: arreglos,
      intermediarios,
      comisiones_desagregado: comisionesDesagregado,
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

  // Listado para el dashboard de Ejecución (solapa "Ejecución", independiente
  // del listado comercial de Órdenes) — mira nivel de ejecución operativa,
  // no venta: suma el conteo de documentos adjuntos. "Datos incompletos" se
  // decide en el frontend mirando monto_neto = 0 (no precio=0 por línea: la
  // mayoría de las órdenes grandes cargan el total a mano en vez de por
  // línea, así que precio=0 por línea es normal, no un error — se probó
  // contra datos reales y daba falso positivo en 44 de 53 órdenes).
  static async listarEjecucion(
    filtros: { mes?: number; ano?: number; tipo_anunciante?: string } = {}
  ): Promise<any[]> {
    const mes = filtros.mes ?? null;
    const ano = filtros.ano ?? null;
    const tipo = filtros.tipo_anunciante ?? null;
    return this.queryAll(
      `SELECT o.*,
          (SELECT COUNT(*) FROM documentos_adjuntos d WHERE d.orden_id = o.id) AS documentos_count
       FROM ordenes_publicidad o
       WHERE (o.habilitado != 0 OR o.habilitado IS NULL)
         AND (? IS NULL OR o.mes_ingreso = ?)
         AND (? IS NULL OR o.ano_ingreso = ?)
         AND (? IS NULL OR o.tipo_anunciante = ?)
       ORDER BY o.created_at DESC`,
      [mes, mes, ano, ano, tipo, tipo]
    );
  }

  /**
   * Actualizar estado de orden
   */
  static async actualizarEstado(
    ordenId: string,
    nuevoEstado: string,
    datosColppy?: { numero_factura_colppy?: string; numero_nc_colppy?: string }
  ): Promise<void> {
    await this.runQuery(
      `UPDATE ordenes_publicidad SET estado = ?,
          numero_factura_colppy = COALESCE(?, numero_factura_colppy),
          numero_nc_colppy = COALESCE(?, numero_nc_colppy),
          updated_at = datetime("now")
        WHERE id = ?`,
      [nuevoEstado, datosColppy?.numero_factura_colppy ?? null, datosColppy?.numero_nc_colppy ?? null, ordenId]
    );
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { estado: nuevoEstado, ...datosColppy });
  }

  // Editar los números de Colppy sin necesariamente cambiar el estado (ej. corregir
  // un número ya cargado, o cargarlo después de haber marcado "Facturada").
  static async actualizarFacturacionColppy(
    ordenId: string,
    datos: { numero_factura_colppy?: string; numero_nc_colppy?: string }
  ): Promise<void> {
    await this.runQuery(
      'UPDATE ordenes_publicidad SET numero_factura_colppy = ?, numero_nc_colppy = ?, updated_at = datetime("now") WHERE id = ?',
      [datos.numero_factura_colppy || null, datos.numero_nc_colppy || null, ordenId]
    );
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, datos);
  }

  // Cobro de una orden NO registrada (ver comentario en database.ts) — al
  // marcarla cobrada se estampa la fecha de hoy si no se pasa una explícita;
  // al desmarcarla se limpia la fecha para no dejar un dato inconsistente.
  static async actualizarCobro(ordenId: string, cobrado: boolean, fechaCobro?: string): Promise<void> {
    const fecha = cobrado ? fechaCobro || new Date().toISOString().split('T')[0] : null;
    await this.runQuery(
      'UPDATE ordenes_publicidad SET cobrado = ?, fecha_cobro = ?, updated_at = datetime("now") WHERE id = ?',
      [cobrado ? 1 : 0, fecha, ordenId]
    );
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { cobrado, fecha_cobro: fecha });
  }

  // Certificación de exhibición (fotos/link) entregada al cliente — se tilda
  // a mano desde el dashboard de Ejecución, sin integración automática.
  static async actualizarCertificacion(ordenId: string, enviada: boolean): Promise<void> {
    const fecha = enviada ? new Date().toISOString() : null;
    await this.runQuery(
      'UPDATE ordenes_publicidad SET certificacion_enviada = ?, certificacion_enviada_en = ?, updated_at = datetime("now") WHERE id = ?',
      [enviada ? 1 : 0, fecha, ordenId]
    );
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'UPDATE', ordenId, null, { certificacion_enviada: enviada });
  }

  // Aviso manual a Operaciones (botón "Avisar a Operaciones" en la orden, o
  // el envío masivo desde la lista) — a diferencia del aviso automático al
  // crear la orden (ver index.ts), este se puede disparar las veces que
  // haga falta (ej. el automático falló, o es una orden vieja de antes de
  // que existiera el aviso). Si realmente se manda, pisa
  // telegram_avisado_carga_en igual que el automático — es la misma señal
  // para el dashboard de Ejecución, no importa qué botón lo disparó.
  // Arma el bloque "dónde sale la campaña" para los avisos de Telegram —
  // compartido entre el aviso manual (avisarOrdenATelegram) y los avisos
  // automáticos al crear una orden (index.ts), que antes no lo incluían.
  // Agrupado por soporte (con la cantidad total, ej. "58" pantallas en 11
  // locaciones distintas) en vez de una línea por cada línea de detalle: una
  // orden grande (ej. BNA, 23 líneas) era ilegible en el chat tal cual. Cada
  // línea del grupo lleva su propia cantidad (no alcanza con el total:
  // Operaciones necesita saber cuántas van en cada locación puntual) y el
  // punto de instalación cuando la misma locación se repite dentro del
  // soporte (ej. GCBA Parkings: "Pisman" son 3 instalaciones físicas
  // distintas, cada una en una dirección) — si no se repite, el nombre de la
  // locación solo ya alcanza.
  static async construirBloqueUbicacion(ordenId: string): Promise<string> {
    const detalles = await this.queryAll(
      `SELECT d.tipo_producto, d.cantidad, d.punto_instalacion, d.locacion_id, p.codigo as producto_codigo,
              l.nombre as locacion_nombre
       FROM ordenes_publicidad_detalles d
       LEFT JOIN locaciones l ON l.id = d.locacion_id
       LEFT JOIN productos p ON p.id = d.producto_id
       WHERE d.orden_id = ?`,
      [ordenId]
    );
    // "Circuito Pantallas LED Verticales" (SOP-LEDV) se vende siempre completo
    // por locación — la cantidad real de pantallas vive en el catálogo de la
    // locación (locaciones_capacidad/locaciones_puntos), NO en la línea de la
    // orden: ahí casi siempre queda "1" (se cargó/vendió, no se tipeó cuántas
    // pantallas tiene el circuito). Mismo criterio que usa el módulo de
    // Disponibilidad para sincronizar capacidad. Para cualquier otro soporte
    // (PPLs, Caja Backlight, etc.) la cantidad de la orden SÍ es la real.
    const locacionesCircuito = Array.from(
      new Set((detalles as any[]).filter((d) => d.producto_codigo === 'SOP-LEDV' && d.locacion_id).map((d) => d.locacion_id))
    );
    const capacidadReal = new Map<string, number>();
    if (locacionesCircuito.length > 0) {
      const marcadores = locacionesCircuito.map(() => '?').join(',');
      const filas = await this.queryAll(
        `SELECT lc.locacion_id,
                CASE WHEN COUNT(lp.id) > 0 THEN SUM(lp.cantidad) ELSE MAX(lc.cantidad) END as real
         FROM locaciones_capacidad lc LEFT JOIN locaciones_puntos lp ON lp.capacidad_id = lc.id
         WHERE lc.locacion_id IN (${marcadores}) AND lc.producto_id = 'soporte-4'
         GROUP BY lc.locacion_id`,
        locacionesCircuito
      );
      filas.forEach((f: any) => capacidadReal.set(f.locacion_id, f.real));
    }
    (detalles as any[]).forEach((d) => {
      if (d.producto_codigo === 'SOP-LEDV' && capacidadReal.has(d.locacion_id)) {
        d.cantidad = capacidadReal.get(d.locacion_id);
      }
    });
    const grupos = new Map<string, { total: number; locaciones: Array<{ nombre: string; punto: string | null; cantidad: number }> }>();
    for (const d of [...(detalles as any[])].sort(compararLineasPorSoporte)) {
      if (!d.locacion_nombre) continue;
      if (!grupos.has(d.tipo_producto)) grupos.set(d.tipo_producto, { total: 0, locaciones: [] });
      const g = grupos.get(d.tipo_producto)!;
      const cantidad = Number(d.cantidad) || 0;
      g.total += cantidad;
      g.locaciones.push({ nombre: d.locacion_nombre, punto: d.punto_instalacion || null, cantidad });
    }
    return Array.from(grupos.entries())
      .map(([tipo, g]) => {
        const lineas = g.locaciones.map((l) => {
          // El punto de instalación va siempre que exista (se repita o no la
          // locación): el aviso es para que Operaciones vaya a sacar fotos
          // a la instalación exacta, no alcanza con saber la locación sola.
          const base = l.punto ? `${l.nombre} — ${l.punto}` : l.nombre;
          return `${base} (x${l.cantidad})`;
        });
        if (lineas.length === 1) return `${tipo} — ${lineas[0]}`;
        return `${tipo} — Total: ${g.total}\n` + lineas.map((l) => `• — ${l}`).join('\n');
      })
      .join('\n\n');
  }

  static async avisarOrdenATelegram(ordenId: string): Promise<boolean> {
    const orden: any = await this.queryGet(
      'SELECT nombre_anunciante, tipo_anunciante, periodo_desde, periodo_hasta FROM ordenes_publicidad WHERE id = ?',
      [ordenId]
    );
    if (!orden) throw new Error('Orden no encontrada.');
    const bloqueUbicacion = await this.construirBloqueUbicacion(ordenId);
    const formatFecha = (f: string) => (f ? f.split('-').reverse().join('/') : '-');
    const texto =
      `📢 <b>Aviso de orden</b>\n${orden.nombre_anunciante}\n${formatFecha(orden.periodo_desde)} al ${formatFecha(orden.periodo_hasta)}` +
      (bloqueUbicacion ? `\n\n${bloqueUbicacion}` : '');
    const { enviado } = await TelegramService.enviarAGrupo('Operaciones', texto, ordenId);
    if (enviado) {
      await this.runQuery('UPDATE ordenes_publicidad SET telegram_avisado_carga_en = datetime("now") WHERE id = ?', [ordenId]);
    }
    return enviado;
  }

  /**
   * Baja lógica de una orden: nunca se borra el registro (puede tener facturas,
   * gastos o comisiones ya generados) — se oculta de la lista activa.
   */
  static async eliminarOrden(ordenId: string): Promise<void> {
    await this.runQuery('UPDATE ordenes_publicidad SET habilitado = 0, updated_at = datetime("now") WHERE id = ?', [ordenId]);
    AuditoriaService.registrarOperacion('ordenes_publicidad', 'DELETE', ordenId, null, { habilitado: 0 });
  }

  /**
   * Chequeo diario (ver index.ts, corre solo mientras el backend esté
   * levantado) — junta en UN solo mensaje todas las órdenes cuyo período
   * arranca hoy y todavía no fueron avisadas, y las marca. Idempotente: si
   * se llama varias veces el mismo día (ej. el backend se reinició), no
   * duplica el aviso porque solo trae las que tienen
   * telegram_avisado_inicio_en todavía en NULL.
   */
  static async avisarCampanasQueArrancanHoy(): Promise<{ avisadas: number }> {
    const hoy = new Date();
    const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const ordenes = await this.queryAll(
      `SELECT id, nombre_anunciante, tipo_anunciante, periodo_desde, periodo_hasta
       FROM ordenes_publicidad
       WHERE periodo_desde = ?
         AND (habilitado != 0 OR habilitado IS NULL)
         AND (avisar_telegram != 0 OR avisar_telegram IS NULL)
         AND telegram_avisado_inicio_en IS NULL`,
      [fechaHoy]
    );
    if (ordenes.length === 0) return { avisadas: 0 };

    const formatFecha = (f: string) => f.split('-').reverse().join('/');
    const lineas = ordenes.map((o: any) => `• <b>${o.nombre_anunciante}</b> — hasta ${formatFecha(o.periodo_hasta)}`);
    const texto = `📅 <b>Campañas que arrancan hoy</b> (${ordenes.length}):\n\n${lineas.join('\n')}`;

    await TelegramService.enviarAGrupo('Operaciones', texto);

    for (const o of ordenes as any[]) {
      await this.runQuery('UPDATE ordenes_publicidad SET telegram_avisado_inicio_en = datetime("now") WHERE id = ?', [o.id]);
    }
    return { avisadas: ordenes.length };
  }

  /**
   * Disparador 3 (ver index.ts para el chequeo horario, mismo patrón que
   * avisarCampanasQueArrancanHoy): recordatorio al grupo "Comercial" cuando
   * una pauta está por terminar, para preguntarle al cliente si renueva.
   *
   * "Está por terminar" se mide sobre la ÚLTIMA orden de su cadena, no por
   * orden individual — si "Repetir automáticamente hasta" o "Partir en una
   * orden por mes" generaron varias órdenes (una por mes) para el mismo
   * cliente+anunciante+locación, solo la de periodo_hasta más lejano dispara
   * el aviso (si Octubre/Noviembre/Diciembre son la misma cadena, solo
   * Diciembre avisa). Dos cadenas del mismo cliente en locaciones distintas
   * (ej. NAYA Zona Norte y Zona Sur, con vencimientos distintos) avisan cada
   * una la suya, porque no comparten ninguna locación — mismo criterio que
   * ya usa buscarOrdenExistenteEnMes para no duplicar clones.
   *
   * Ventana de 10 días (no día exacto): si el backend no estuvo levantado el
   * día justo, lo agarra apenas se prenda de nuevo, mientras la orden no haya
   * terminado todavía. Idempotente vía telegram_avisado_vencimiento_en.
   */
  static async avisarPautasPorTerminar(diasAnticipacion = 10): Promise<{ avisadas: number }> {
    const hoy = new Date();
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + diasAnticipacion);
    const aFecha = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const candidatas = await this.queryAll(
      `SELECT o.id, o.nombre_anunciante, o.periodo_desde, o.periodo_hasta, o.vendedor_id
       FROM ordenes_publicidad o
       WHERE (o.habilitado != 0 OR o.habilitado IS NULL)
         AND o.periodo_hasta >= ? AND o.periodo_hasta <= ?
         AND o.telegram_avisado_vencimiento_en IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM ordenes_publicidad o2
           WHERE o2.id != o.id
             AND (o2.habilitado != 0 OR o2.habilitado IS NULL)
             AND o2.cliente_id = o.cliente_id
             AND o2.nombre_anunciante = o.nombre_anunciante
             AND o2.periodo_hasta > o.periodo_hasta
             AND EXISTS (
               SELECT 1 FROM ordenes_publicidad_detalles d1
               JOIN ordenes_publicidad_detalles d2 ON d2.locacion_id = d1.locacion_id
               WHERE d1.orden_id = o.id AND d2.orden_id = o2.id
             )
         )`,
      [aFecha(hoy), aFecha(limite)]
    );
    if (candidatas.length === 0) return { avisadas: 0 };

    const formatFecha = (f: string) => (f ? f.split('-').reverse().join('/') : '-');
    let avisadas = 0;
    for (const o of candidatas as any[]) {
      const vendedor: any = o.vendedor_id
        ? await this.queryGet('SELECT nombre, apellido FROM vendedores WHERE id = ?', [o.vendedor_id])
        : null;
      const nombreVendedor = vendedor ? `${vendedor.nombre} ${vendedor.apellido || ''}`.trim() : '(sin vendedor asignado)';
      const bloqueUbicacion = await this.construirBloqueUbicacion(o.id);
      const texto =
        `🆕 <b>${nombreVendedor}</b> — Pauta de ${o.nombre_anunciante} por terminar, preguntar al cliente si renueva\n` +
        `${formatFecha(o.periodo_desde)} al ${formatFecha(o.periodo_hasta)}` +
        (bloqueUbicacion ? `\n\n${bloqueUbicacion}` : '');
      const { enviado } = await TelegramService.enviarAGrupo('Comercial', texto, o.id);
      if (enviado) {
        await this.runQuery('UPDATE ordenes_publicidad SET telegram_avisado_vencimiento_en = datetime("now") WHERE id = ?', [o.id]);
        avisadas += 1;
      }
    }
    return { avisadas };
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
   * Excluye las órdenes "Pauta Concesionario" (ventas directas del concesionario,
   * Topview no las cobra — no son venta suya).
   *
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
        SUM(${SQL_INGRESO_FINAL}) as valor_final_total,
        SUM(monto_final - costo_produccion) as ganancia_total,
        ROUND(((SUM(monto_final - costo_produccion) / SUM(monto_final)) * 100), 2) as margen_ganancia
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
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
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
    `);

    // Facturación real por mes (según fecha_facturacion, no el período de la
    // campaña) — incluye todas las órdenes habilitadas sin importar el estado
    // actual, porque una orden ya Finalizada igual facturó en su momento.
    const porMes = await this.queryAll(`
      SELECT strftime('%Y-%m', fecha_facturacion) as mes,
        SUM(monto_neto) as monto_neto_total,
        SUM(monto_neto_aplicado) as monto_neto_aplicado_total,
        SUM(monto_final) as monto_final_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}' AND fecha_facturacion IS NOT NULL
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
        SUM(monto_neto_aplicado) as monto_neto_aplicado_total,
        SUM(monto_final) as monto_final_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
      GROUP BY mes
      ORDER BY mes
    `);

    // Registrado (facturado por Colppy) vs no registrado, mes a mes — misma
    // definición que el desglose de la pestaña Órdenes (esOrdenFacturado en el
    // frontend: facturado NULL/undefined/truthy = registrado, facturado=0 = no
    // registrado). "Registrado" usa el neto post-comisión (monto_final, lo que
    // de verdad queda) y "No registrado" el bruto (monto_neto, nunca pasa por
    // comisiones/Colppy) — son los mismos dos campos que ya se suman en el
    // resumen de Órdenes, acá solo agrupados por mes de ingreso.
    const porMesRegistro = await this.queryAll(`
      SELECT printf('%04d-%02d',
          COALESCE(ano_ingreso, CAST(strftime('%Y', periodo_desde) AS INTEGER)),
          COALESCE(mes_ingreso, CAST(strftime('%m', periodo_desde) AS INTEGER))
        ) as mes,
        -- Mismo criterio que SQL_INGRESO_FINAL, partido en las dos columnas
        -- del gráfico (registrado/no registrado) en vez de una sola "valor".
        SUM(CASE WHEN facturado = 0 THEN monto_neto ELSE 0 END) as no_registrado_total,
        SUM(CASE WHEN facturado IS NULL OR facturado != 0 THEN monto_final ELSE 0 END) as registrado_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
      GROUP BY mes
      ORDER BY mes
    `);

    // Mismo total que porMesRegistro (cada orden aporta el mismo "valor" —
    // monto_final si está registrada, monto_neto si no — la única diferencia
    // es que acá se agrupa por tipo de anunciante en vez de por registrado/no
    // registrado), para que ambos gráficos muestren la misma torta mensual
    // partida de dos formas distintas.
    const porMesSegmento = await this.queryAll(`
      SELECT printf('%04d-%02d',
          COALESCE(ano_ingreso, CAST(strftime('%Y', periodo_desde) AS INTEGER)),
          COALESCE(mes_ingreso, CAST(strftime('%m', periodo_desde) AS INTEGER))
        ) as mes,
        tipo_anunciante,
        SUM(${SQL_INGRESO_FINAL}) as valor
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
      GROUP BY mes, tipo_anunciante
      ORDER BY mes
    `);

    // Mix de soportes vendidos (excluye el placeholder de servicio genérico).
    const porSoporte = await this.queryAll(`
      SELECT p.nombre as producto, SUM(d.cantidad) as cantidad
      FROM ordenes_publicidad_detalles d
      JOIN ordenes_publicidad o ON o.id = d.orden_id
      JOIN productos p ON p.id = d.producto_id
      WHERE (o.habilitado != 0 OR o.habilitado IS NULL) AND o.tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}' AND p.tipo = 'fisico'
      GROUP BY p.id
      ORDER BY cantidad DESC
    `);

    // Sin permiso de netos, el ranking usa la bruta (monto_neto) en vez del
    // ingreso final — nunca se manda monto_final campo por campo. Con permiso,
    // usa el mismo "ingreso final" mixto que el resto de los gráficos de esta
    // pantalla (monto_final si está registrada, monto_neto si no — lo que no
    // pasa por Colppy nunca pasa por comisiones tampoco).
    const campoTopClientes = incluirNetos ? SQL_INGRESO_FINAL : 'monto_neto';
    const topClientes = await this.queryAll(`
      SELECT razon_social, SUM(${campoTopClientes}) as monto_total
      FROM ordenes_publicidad
      WHERE (habilitado != 0 OR habilitado IS NULL) AND tipo_anunciante != '${TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}'
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
      incluirNetos
        ? m
        : { mes: m.mes, monto_neto_total: m.monto_neto_total, monto_neto_aplicado_total: m.monto_neto_aplicado_total }
    );
    const porMesVentaFiltrado = (porMesVenta || []).map((m: any) =>
      incluirNetos
        ? m
        : { mes: m.mes, monto_neto_total: m.monto_neto_total, monto_neto_aplicado_total: m.monto_neto_aplicado_total }
    );

    return {
      por_anunciante: analisisFiltrado,
      totales: totalesFiltrados,
      por_mes: porMesFiltrado,
      por_mes_venta: porMesVentaFiltrado,
      // Solo con permiso de netos: "registrado" viaja en monto_final (post-comisión).
      por_mes_registro: incluirNetos ? porMesRegistro || [] : [],
      por_mes_segmento: incluirNetos ? porMesSegmento || [] : [],
      por_soporte: porSoporte || [],
      top_clientes: topClientes || [],
      por_comisionista_tipo: porComisionistaTipo,
      incluye_netos: incluirNetos,
      generado_en: new Date().toISOString(),
    };
  }
}
