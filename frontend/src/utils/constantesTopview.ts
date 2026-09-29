// Antes estaba copiada a mano en TopviewView.tsx y ReportesView.tsx (con
// nombres distintos, mismo contenido) — única fuente para que agregar un
// tipo nuevo no dependa de acordarse de tocar los dos archivos.
export const TIPOS_ANUNCIANTE = [
  'Pequeños Anunciantes',
  'Pautas Estado',
  'Pautas Anuales',
  'Pautas Mensuales',
  'Pautas en dólares',
  'Pauta Concesionario',
];

// Campaña vendida directamente por el concesionario, no por Topview (ej.
// World Padel Pilar) — señal única en tipo_anunciante, sin tilde aparte (se
// probó con uno y se fusionó a pedido del usuario). Ver
// [[project_world_padel_cuenta_corriente_comerciales]].
export const TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO = 'Pauta Concesionario';

// No es un gate de facturación — es un tracker manual de en qué paso está
// la orden respecto del proceso real (Colppy sigue siendo quien factura de
// verdad hoy): la cargaste en el sistema, la revisaste, y la facturaste en
// Colppy. Ninguno de los 3 bloquea nada dentro de la app.
export const ESTADOS_ORDEN = ['Cargada', 'Revisada', 'Facturada'];

export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Suma un mes a 'YYYY-MM-DD', recortando el día al último real del mes
// destino — misma lógica que el backend
// (backend/src/services/calculosTopview.ts), usada acá solo para vistas
// previas en el frontend (ej. los clones por "Vigencia hasta"). Si la fecha
// de origen ya era el último día de SU mes, el resultado es el último día
// del mes destino (no un corrimiento mecánico del número de día).
// Compartida entre la ficha de comisionistas y Condiciones (ambas muestran
// la clasificación fiscal de un comisionista/condición).
export const CLASIFICACION_LABEL = (facturaFormal: boolean | number) =>
  facturaFormal ? 'Tipo 1 (facturas)' : 'Tipo 2 (efectivo)';

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
