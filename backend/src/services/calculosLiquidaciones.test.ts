import { describe, it, expect } from 'vitest';
import { calcularLineaEstebanVivo, calcularOxantMontos, calcularCutIrisChiterer } from './calculosLiquidaciones';

describe('calcularLineaEstebanVivo', () => {
  it('cascada real 10/30/20/25% (condición cargada en producción para los 2 concesionarios)', () => {
    // declarado $10.000 -10% comisión vendedor = $9.000
    // -30% canon (sobre 9.000) = $2.700 -> queda $6.300
    // -20% gastos Topview (sobre 6.300) = $1.260 -> queda $5.040
    // -25% Vivo (sobre 5.040) = $1.260
    const r = calcularLineaEstebanVivo(10000, { comisionVendedor: 10, canon: 30, gastosTop: 20, vivo: 25 });
    expect(r.comisionVendedor).toBe(1000);
    expect(r.neto1).toBe(9000);
    expect(r.canon).toBe(2700);
    expect(r.neto2).toBe(6300);
    expect(r.gastosTop).toBe(1260);
    expect(r.neto3).toBe(5040);
    expect(r.comVivo).toBe(1260);
  });

  it('cada paso resta sobre el remanente del anterior, no sobre el declarado original', () => {
    // Si los 4 pasos fueran todos sobre el declarado original, canon sería
    // 30% de 10000=3000 (no 2700) y comVivo 25% de 10000=2500 (no 1260).
    const r = calcularLineaEstebanVivo(10000, { comisionVendedor: 10, canon: 30, gastosTop: 20, vivo: 25 });
    expect(r.canon).not.toBe(3000);
    expect(r.comVivo).not.toBe(2500);
  });

  it('porcentajes en 0 no descuentan nada', () => {
    const r = calcularLineaEstebanVivo(5000, { comisionVendedor: 0, canon: 0, gastosTop: 0, vivo: 0 });
    expect(r.comVivo).toBe(0);
    expect(r.neto3).toBe(5000);
  });
});

describe('calcularOxantMontos', () => {
  it('condición real cargada en producción: 6% de comisión + 21% de IVA propio sobre la comisión', () => {
    // total_canon $100.000 -> comisión 6% = $6.000 -> IVA 21% de la comisión (no del canon) = $1.260
    const r = calcularOxantMontos(100000, 6, 21);
    expect(r.comision).toBe(6000);
    expect(r.iva).toBe(1260); // 21% de 6000, no de 100000
    expect(r.total_a_pagar).toBe(7260);
  });

  it('sin canon, no hay nada que pagar', () => {
    const r = calcularOxantMontos(0, 6, 21);
    expect(r.total_a_pagar).toBe(0);
  });
});

describe('calcularCutIrisChiterer', () => {
  it('corte flat, sin cascada', () => {
    expect(calcularCutIrisChiterer(10000, 8)).toBe(800);
  });

  it('es lineal: declarado x2 = corte x2', () => {
    expect(calcularCutIrisChiterer(20000, 8)).toBe(1600);
  });
});
