import { describe, it, expect } from 'vitest';
import {
  addMonthClamped,
  subtractMonthClamped,
  calcularDescuentosCascada,
  calcularComisionesCascada,
} from './calculosTopview';

describe('calcularDescuentosCascada', () => {
  it('caso documentado en TOPVIEW-NEGOCIO.md: NC1 10% cascada + FC 5% cascada sobre $10.000', () => {
    // $10.000 -10% ($1.000) = $9.000 -5% ($450) = $8.550
    const r = calcularDescuentosCascada(10000, [
      { pct: 10, cascada: true },
      { pct: 0, cascada: false },
      { pct: 5, cascada: true },
    ]);
    expect(r.descuentoMonto).toBe(1000);
    expect(r.descuentoMonto2).toBe(0);
    expect(r.descuentoFacturasMonto).toBe(450);
    expect(r.montoNetoAplicado).toBe(9000);
    expect(r.montoNetoBlanco).toBe(8550);
  });

  it('los 3 descuentos "base" se calculan siempre sobre el monto_neto original, no en cascada entre sí', () => {
    const r = calcularDescuentosCascada(10000, [
      { pct: 10, cascada: false },
      { pct: 5, cascada: false },
      { pct: 2, cascada: false },
    ]);
    expect(r.descuentoMonto).toBe(1000);
    expect(r.descuentoMonto2).toBe(500);
    expect(r.descuentoFacturasMonto).toBe(200);
    expect(r.montoNetoAplicado).toBe(8500); // 10000 - 1000 - 500
    expect(r.montoNetoBlanco).toBe(8300); // 10000 - 1000 - 500 - 200
  });

  it('sin descuentos, montoNetoAplicado y montoNetoBlanco quedan iguales al bruto', () => {
    const r = calcularDescuentosCascada(50000, [
      { pct: 0, cascada: false },
      { pct: 0, cascada: false },
      { pct: 0, cascada: false },
    ]);
    expect(r.montoNetoAplicado).toBe(50000);
    expect(r.montoNetoBlanco).toBe(50000);
  });

  it('un descuento "base" no reduce el remanente ni para sí mismo ni para el siguiente "cascada"', () => {
    // NC1 base (10%) no toca el remanente en absoluto — NC2 cascada (20%)
    // sigue viendo el monto_neto completo como su base, no 9.000.
    const r = calcularDescuentosCascada(10000, [
      { pct: 10, cascada: false },
      { pct: 20, cascada: true },
      { pct: 0, cascada: false },
    ]);
    expect(r.descuentoMonto).toBe(1000);
    expect(r.descuentoMonto2).toBe(2000); // 20% de 10000, NC1 "base" no descontó nada del remanente
  });
});

describe('calcularComisionesCascada', () => {
  it('caso real IPG/AMEX: LatamNet 15% base + Pupy 5% base + Juan 5% cascada sobre el remanente de ambos', () => {
    const r = calcularComisionesCascada(10000, [
      { intermediario_id: 'latamnet', porcentaje_comision: 15, tipo_calculo: 'base' },
      { intermediario_id: 'pupy', porcentaje_comision: 5, tipo_calculo: 'base' },
      { intermediario_id: 'juan', porcentaje_comision: 5, tipo_calculo: 'cascada' },
    ]);
    expect(r.comisionesCalculadas[0].monto_comision).toBe(1500); // 15% de 10000
    expect(r.comisionesCalculadas[1].monto_comision).toBe(500); // 5% de 10000 (base, no del remanente)
    expect(r.comisionesCalculadas[2].monto_comision).toBe(400); // 5% de (10000-1500-500)=8000
    expect(r.montoFinal).toBe(7600); // 10000-1500-500-400
  });

  it('dos comisionistas "base" cobran en paralelo del mismo neto, sin descontarse uno a otro (caso GCBA/YPF)', () => {
    const r = calcularComisionesCascada(10000, [
      { intermediario_id: 'a', porcentaje_comision: 15, tipo_calculo: 'base' },
      { intermediario_id: 'b', porcentaje_comision: 25, tipo_calculo: 'base' },
    ]);
    expect(r.comisionesCalculadas[0].monto_comision).toBe(1500);
    expect(r.comisionesCalculadas[1].monto_comision).toBe(2500); // 25% de 10000, no de 8500
    expect(r.montoFinal).toBe(6000); // 10000-1500-2500
  });

  it('dos niveles "cascada" puros: el segundo cobra sobre lo que dejó el primero', () => {
    const r = calcularComisionesCascada(10000, [
      { intermediario_id: 'a', porcentaje_comision: 10, tipo_calculo: 'cascada' },
      { intermediario_id: 'b', porcentaje_comision: 5, tipo_calculo: 'cascada' },
    ]);
    expect(r.comisionesCalculadas[0].monto_comision).toBe(1000);
    expect(r.comisionesCalculadas[1].monto_comision).toBe(450); // 5% de (10000-1000)=9000
    expect(r.montoFinal).toBe(8550);
  });

  it('sin intermediarios, montoFinal queda igual al neto blanco', () => {
    const r = calcularComisionesCascada(12345, []);
    expect(r.comisionesCalculadas).toEqual([]);
    expect(r.montoFinal).toBe(12345);
  });

  it('sin tipo_calculo especificado, default es cascada', () => {
    const r = calcularComisionesCascada(10000, [{ intermediario_id: 'a', porcentaje_comision: 10 }]);
    expect(r.comisionesCalculadas[0].tipo_calculo).toBe('cascada');
  });
});

describe('addMonthClamped', () => {
  it('bug real 2026-09-28: 31/8 + 1 mes = 30/9, no 1/10', () => {
    expect(addMonthClamped('2026-08-31')).toBe('2026-09-30');
  });

  it('recorta al último día del mes destino cuando el origen es fin de mes (31 ene -> 28 feb, 2026 no bisiesto)', () => {
    expect(addMonthClamped('2026-01-31')).toBe('2026-02-28');
  });

  it('un día que no es fin de mes se mantiene igual', () => {
    expect(addMonthClamped('2026-01-15')).toBe('2026-02-15');
  });

  it('diciembre pasa el año', () => {
    expect(addMonthClamped('2026-12-15')).toBe('2027-01-15');
  });
});

describe('subtractMonthClamped', () => {
  it('es la inversa de addMonthClamped en el caso del bug real (30/9 -> 31/8)', () => {
    expect(subtractMonthClamped('2026-09-30')).toBe('2026-08-31');
  });

  it('enero pasa al diciembre del año anterior', () => {
    expect(subtractMonthClamped('2026-01-15')).toBe('2025-12-15');
  });
});
