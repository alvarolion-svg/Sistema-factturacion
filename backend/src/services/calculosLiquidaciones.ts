// Funciones puras de cálculo de liquidaciones a concesionarios/terceros —
// sin ningún import de la base, mismo criterio que calculosTopview.ts, para
// poder testearlas sin tocar facturacion.db.

export interface PorcentajesEstebanVivo {
  comisionVendedor: number;
  canon: number;
  gastosTop: number;
  vivo: number;
}

export interface LineaEstebanVivoCalculada {
  comisionVendedor: number;
  neto1: number;
  canon: number;
  neto2: number;
  gastosTop: number;
  neto3: number;
  comVivo: number;
}

// Cascada propia de Esteban Vivo (no comisionista, un tercero que se cuelga
// de la liquidación de Parque C. Avellaneda/Pueblo Caamaño): declarado ->
// -comisión vendedor% -> -canon% (sobre lo que queda) -> -gastos Topview%
// (sobre lo que queda) -> -% Vivo (sobre lo que queda). Cada paso resta
// sobre el remanente del anterior, no sobre el declarado original — es una
// cascada de 4 niveles fija, sin opción de "base". Extraída de
// LiquidacionesService.calcularEstebanVivoConcesionario (antes inline ahí).
export function calcularLineaEstebanVivo(declarado: number, pct: PorcentajesEstebanVivo): LineaEstebanVivoCalculada {
  const comisionVendedor = declarado * (pct.comisionVendedor / 100);
  const neto1 = declarado - comisionVendedor;
  const canon = neto1 * (pct.canon / 100);
  const neto2 = neto1 - canon;
  const gastosTop = neto2 * (pct.gastosTop / 100);
  const neto3 = neto2 - gastosTop;
  const comVivo = neto3 * (pct.vivo / 100);
  return { comisionVendedor, neto1, canon, neto2, gastosTop, neto3, comVivo };
}

export interface ResultadoOxant {
  comision: number;
  iva: number;
  total_a_pagar: number;
}

// Oxant: comisión sobre la suma del Canon de todos sus concesionarios
// (CECNOR/WFPP/Pilar Shops), más IVA propio sobre esa comisión — no sobre
// el canon. Extraída de LiquidacionesService.calcularOxant.
export function calcularOxantMontos(totalCanon: number, porcentajeComision: number, ivaPorcentaje: number): ResultadoOxant {
  const comision = totalCanon * (porcentajeComision / 100);
  const iva = comision * (ivaPorcentaje / 100);
  return { comision, iva, total_a_pagar: comision + iva };
}

// Iris Chiterer: corte flat sobre lo declarado por Terra Uno S.A., sin
// cascada (a diferencia de Esteban Vivo). Extraída de
// LiquidacionesService.calcularIrisChitererConcesionario.
export function calcularCutIrisChiterer(declarado: number, porcentaje: number): number {
  return declarado * (porcentaje / 100);
}
