// Funciones puras de cálculo usadas por topview.ts (crearOrdenUnica y
// actualizarOrden) — sin ningún import de la base a propósito, para que se
// puedan testear (ver calculosTopview.test.ts) sin tocar facturacion.db ni
// levantar una conexión real.

// Suma un mes a una fecha 'YYYY-MM-DD', recortando el día al último real del
// mes destino (ej. 31/8 + 1 mes = 30/9, no 1/10) — usado para clonar
// mensualmente una orden según su "vigencia hasta". Si la fecha de origen ya
// era el último día de SU mes (ej. 30/9, mes de 30 días), el resultado es el
// último día del mes destino (31/10), no un corrimiento mecánico del número
// de día — si no, un período "todo septiembre" (1/9 al 30/9) clonaba a
// "1/10 al 30/10" en vez de "1/10 al 31/10" (bug real, 2026-09-28).
export function addMonthClamped(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  let nuevoAno = y;
  let nuevoMes = m + 1;
  if (nuevoMes > 12) {
    nuevoMes = 1;
    nuevoAno += 1;
  }
  const ultimoDiaMesActual = new Date(y, m, 0).getDate();
  const ultimoDiaMesNuevo = new Date(nuevoAno, nuevoMes, 0).getDate();
  const nuevoDia = d === ultimoDiaMesActual ? ultimoDiaMesNuevo : Math.min(d, ultimoDiaMesNuevo);
  return `${nuevoAno}-${String(nuevoMes).padStart(2, '0')}-${String(nuevoDia).padStart(2, '0')}`;
}

// Simétrico a addMonthClamped, pero restando un mes — usado para completar
// meses anteriores a la base del sistema (timeline hacia atrás).
export function subtractMonthClamped(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  let nuevoAno = y;
  let nuevoMes = m - 1;
  if (nuevoMes < 1) {
    nuevoMes = 12;
    nuevoAno -= 1;
  }
  const ultimoDiaMesActual = new Date(y, m, 0).getDate();
  const ultimoDiaMesNuevo = new Date(nuevoAno, nuevoMes, 0).getDate();
  const nuevoDia = d === ultimoDiaMesActual ? ultimoDiaMesNuevo : Math.min(d, ultimoDiaMesNuevo);
  return `${nuevoAno}-${String(nuevoMes).padStart(2, '0')}-${String(nuevoDia).padStart(2, '0')}`;
}

export interface DescuentoCascadaInput {
  pct: number;
  cascada: boolean;
}

export interface ResultadoDescuentosCascada {
  descuentoMonto: number;
  descuentoMonto2: number;
  descuentoFacturasMonto: number;
  montoNetoAplicado: number;
  montoNetoBlanco: number;
}

// NC1 (comercial), NC2 (comercial, opcional) y FC (facturas), en ese orden.
// Cada uno puede ser directo sobre el bruto (monto_neto) o en cascada sobre
// lo que van dejando los anteriores — depende de lo pactado con cada
// agencia. Extraída de crearOrdenUnica/actualizarOrden (antes copiada a
// mano en los dos lugares) para que sea una sola fuente de verdad y se
// pueda testear sin tocar la base.
export function calcularDescuentosCascada(
  montoNeto: number,
  descuentos: [DescuentoCascadaInput, DescuentoCascadaInput, DescuentoCascadaInput]
): ResultadoDescuentosCascada {
  const montos: [number, number, number] = [0, 0, 0];
  let montoActual = montoNeto;
  descuentos.forEach(({ pct, cascada }, idx) => {
    const base = cascada ? montoActual : montoNeto;
    const monto = base * (pct / 100);
    if (cascada) montoActual -= monto;
    montos[idx] = monto;
  });
  const [descuentoMonto, descuentoMonto2, descuentoFacturasMonto] = montos;
  return {
    descuentoMonto,
    descuentoMonto2,
    descuentoFacturasMonto,
    montoNetoAplicado: montoNeto - descuentoMonto - descuentoMonto2,
    montoNetoBlanco: montoNeto - descuentoMonto - descuentoMonto2 - descuentoFacturasMonto,
  };
}

export interface IntermediarioCascadaInput {
  intermediario_id: string;
  porcentaje_comision: number;
  tipo_calculo?: 'base' | 'cascada';
  factura_formal?: boolean;
}

export interface ComisionCascadaCalculada extends IntermediarioCascadaInput {
  tipo_calculo: 'base' | 'cascada';
  monto_comision: number;
}

export interface ResultadoComisionesCascada {
  comisionesCalculadas: ComisionCascadaCalculada[];
  montoFinal: number;
}

// Comisiones a comisionistas: 'cascada' aplica sobre lo que va quedando
// DESPUÉS de todas las comisiones anteriores (sean cascada o base) — un
// nivel "base" también resta de ese remanente, solo que su propio % se
// calcula sobre el neto blanco fijo, no sobre el remanente. 'base' sirve
// para comisionistas que cobran cada uno su % directo del mismo neto
// blanco, en paralelo entre sí (ej. GCBA/YPF: comisionista 15% + 25%, ambos
// sobre el mismo neto, sin descontarse uno a otro). Un tercer nivel en
// cascada después de dos "base" cobra sobre lo que quedó después de restar
// ambos — validado contra el caso real IPG/AMEX (LatamNet 15% base + Pupy
// 5% base + Juan 5% cascada sobre el remanente de los dos anteriores, no
// sobre el neto blanco entero). Extraída de crearOrdenUnica/actualizarOrden
// (antes copiada a mano en los dos lugares).
export function calcularComisionesCascada(
  montoNetoBlanco: number,
  intermediarios: IntermediarioCascadaInput[]
): ResultadoComisionesCascada {
  const comisionesCalculadas: ComisionCascadaCalculada[] = [];
  let montoFinal = montoNetoBlanco;
  let montoActual = montoNetoBlanco;
  intermediarios.forEach((inter) => {
    const tipoCalculo = inter.tipo_calculo || 'cascada';
    const montoComision =
      tipoCalculo === 'base'
        ? montoNetoBlanco * (inter.porcentaje_comision / 100)
        : montoActual * (inter.porcentaje_comision / 100);
    montoActual -= montoComision;
    montoFinal -= montoComision;
    comisionesCalculadas.push({ ...inter, tipo_calculo: tipoCalculo, monto_comision: montoComision });
  });
  return { comisionesCalculadas, montoFinal };
}

// Orden de lectura de las líneas de una orden (Asana): primero el Circuito de
// Pantallas LED Verticales, después Video Wall, después Pantalla Gran Formato,
// y cualquier otro soporte al final. Dentro de cada soporte, alfabético por
// locación (y por punto de instalación si la locación se repite).
const ORDEN_SOPORTES = ['Circuito Pantallas LED Verticales', 'Video Wall', 'Pantalla Gran Formato'];

export function compararLineasPorSoporte(
  a: { tipo_producto?: string | null; locacion_nombre?: string | null; punto_instalacion?: string | null },
  b: { tipo_producto?: string | null; locacion_nombre?: string | null; punto_instalacion?: string | null }
): number {
  const rango = (t?: string | null) => {
    const i = ORDEN_SOPORTES.indexOf(t || '');
    return i === -1 ? ORDEN_SOPORTES.length : i;
  };
  const alfa = (x?: string | null, y?: string | null) => (x || '').localeCompare(y || '', 'es', { sensitivity: 'base' });
  return (
    rango(a.tipo_producto) - rango(b.tipo_producto) ||
    alfa(a.tipo_producto, b.tipo_producto) ||
    alfa(a.locacion_nombre, b.locacion_nombre) ||
    alfa(a.punto_instalacion, b.punto_instalacion)
  );
}
