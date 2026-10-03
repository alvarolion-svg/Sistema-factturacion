// Mensaje legible de cualquier cosa que se haya tirado con `throw` (en un
// catch el error llega como unknown, no como Error garantizado).
export function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Error de regla de negocio / dato inválido (se responde 400, no 500): el
// mensaje es para mostrarle al usuario tal cual.
export class ErrorNegocio extends Error {}

// La persona no tiene permiso para lo que pidió (se responde 403).
export class ErrorPermiso extends ErrorNegocio {}

export function estadoHttpDe(err: unknown): number {
  if (err instanceof ErrorPermiso) return 403;
  return err instanceof ErrorNegocio ? 400 : 500;
}
