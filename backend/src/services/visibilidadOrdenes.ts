// Qué campos de una orden puede ver cada persona. El servidor es quien filtra:
// ocultar algo solo en la pantalla no alcanza.

// Netos post-comisión y comisionistas: ven todo quien tiene alguno de estos
// permisos (los que ya los veían antes de que existieran los roles por puesto:
// editores, comisionistas, netos). Un Facturador, por ejemplo, no tiene ninguno.
export function veNetosYComisiones(permisos: string[]): boolean {
  return ['topview_netos_ver', 'topview_comisionistas_ver', 'topview_editar'].some((p) => permisos.includes(p));
}

const CAMPOS_COMISIONES = ['monto_final', 'intermediarios', 'comisiones_desagregado', 'arreglos_no_registrables'];

export function limpiarOrdenParaVista<T extends Record<string, unknown>>(orden: T, permisos: string[]): T {
  if (veNetosYComisiones(permisos)) return orden;
  const copia: Record<string, unknown> = { ...orden };
  CAMPOS_COMISIONES.forEach((c) => delete copia[c]);
  return copia as T;
}

export function limpiarListaParaVista<T extends Record<string, unknown>>(ordenes: T[], permisos: string[]): T[] {
  return veNetosYComisiones(permisos) ? ordenes : ordenes.map((o) => limpiarOrdenParaVista(o, permisos));
}
