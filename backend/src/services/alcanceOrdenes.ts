import { dbGet } from '../dbHelpers';
import { NextFunction, Response } from 'express';
import { ErrorPermiso, ErrorNegocio, estadoHttpDe, mensajeDe } from '../errores';
import { RequestConUsuario } from '../middleware';

// "Solo lo mío" (permiso topview_solo_propias, ej. un vendedor): ve y toca
// únicamente las órdenes donde él es el vendedor. El filtro lo hace el
// servidor; ocultar botones en pantalla no alcanza.

const SIN_VENDEDOR = '__sin_vendedor__';

/** null = sin restricción; si no, el id de vendedor al que se limita. */
export function alcanceVendedor(req: RequestConUsuario): string | null {
  if (!req.permisos?.includes('topview_solo_propias')) return null;
  // Una cuenta "solo propias" sin vendedor vinculado no ve nada (no "todo").
  return req.usuario?.vendedor_id || SIN_VENDEDOR;
}

export function filtrarPropias<T extends { vendedor_id?: string | null }>(req: RequestConUsuario, filas: T[]): T[] {
  const alcance = alcanceVendedor(req);
  return alcance === null ? filas : filas.filter((f) => f.vendedor_id === alcance);
}

/** Corta con 403 si la orden no es del usuario "solo propias". Devuelve su estado. */
export async function exigirOrdenPropia(req: RequestConUsuario, ordenId: string): Promise<string | undefined> {
  const alcance = alcanceVendedor(req);
  if (alcance === null) return undefined;
  const orden = await dbGet<{ vendedor_id: string | null; estado: string }>('SELECT vendedor_id, estado FROM ordenes_publicidad WHERE id = ?', [ordenId]);
  if (!orden || orden.vendedor_id !== alcance) throw new ErrorPermiso('Esa orden no es tuya.');
  return orden.estado;
}

/**
 * Editar una orden: Socios/Administrador siempre (topview_editar). Un vendedor
 * "solo propias" con permiso de cargar, únicamente la suya y mientras esté
 * "Cargada" (si la revisan y le encuentran algo, se la devuelven a Cargada).
 */
export async function exigirPuedeEditarOrden(req: RequestConUsuario, ordenId: string): Promise<void> {
  if (req.permisos?.includes('topview_editar')) return;
  if (!req.permisos?.includes('topview_crear') || alcanceVendedor(req) === null) {
    throw new ErrorPermiso('No tiene permiso para realizar esta acción');
  }
  const estado = await exigirOrdenPropia(req, ordenId);
  if (estado !== 'Cargada') {
    throw new ErrorNegocio('La orden ya fue revisada; pedí que te la devuelvan a "Cargada" para modificarla.');
  }
}

/** Versión middleware de exigirPuedeEditarOrden (ruta con :id). */
export const requierePuedeEditarOrden = async (req: RequestConUsuario, res: Response, next: NextFunction) => {
  try {
    await exigirPuedeEditarOrden(req, req.params.id);
    next();
  } catch (err) {
    res.status(estadoHttpDe(err)).json({ error: mensajeDe(err) });
  }
};

/** Versión middleware de exigirOrdenPropia (ruta con :id). */
export const requiereOrdenPropia = async (req: RequestConUsuario, res: Response, next: NextFunction) => {
  try {
    await exigirOrdenPropia(req, req.params.id);
    next();
  } catch (err) {
    res.status(estadoHttpDe(err)).json({ error: mensajeDe(err) });
  }
};
