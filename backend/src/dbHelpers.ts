import db from './database';

// Helpers con promesas sobre la conexión sqlite compartida. dbGet devuelve
// undefined si no hay fila (a diferencia del queryGet de topview.ts, que
// devuelve {} — no mezclar los criterios al migrar código).
export type Parametro = string | number | boolean | null | undefined;

export function dbAll<T = Record<string, unknown>>(sql: string, params: Parametro[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, filas) => (err ? reject(err) : resolve((filas as T[]) || [])));
  });
}

export function dbGet<T = Record<string, unknown>>(sql: string, params: Parametro[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, fila) => (err ? reject(err) : resolve(fila as T | undefined)));
  });
}

export function dbRun(sql: string, params: Parametro[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
