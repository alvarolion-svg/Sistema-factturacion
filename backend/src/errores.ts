// Mensaje legible de cualquier cosa que se haya tirado con `throw` (en un
// catch el error llega como unknown, no como Error garantizado).
export function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
