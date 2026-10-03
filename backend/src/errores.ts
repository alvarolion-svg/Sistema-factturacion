// Mensaje legible de cualquier cosa que se haya tirado con `throw` (en un
// catch el error llega como unknown, no como Error garantizado).
export function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Error de regla de negocio / dato inválido (se responde 400, no 500): el
// mensaje es para mostrarle al usuario tal cual.
export class ErrorNegocio extends Error {}

export function estadoHttpDe(err: unknown): number {
  return err instanceof ErrorNegocio ? 400 : 500;
}
