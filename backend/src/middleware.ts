import { Request, Response, NextFunction } from 'express';
import { AutenticacionService } from './services/autenticacion';

export interface RequestConUsuario extends Request {
  usuario?: any;
  permisos?: string[];
}

/**
 * Middleware de autenticación
 */
export const autenticacion = async (req: RequestConUsuario, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const usuario = await AutenticacionService.verificarToken(token);
    req.usuario = usuario;
    req.permisos = usuario.permisos;

    next();
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
};

/**
 * Middleware de autorización - verifica si el usuario tiene un permiso específico
 */
export const requierePermiso = (permisoRequerido: string) => {
  return (req: RequestConUsuario, res: Response, next: NextFunction) => {
    if (!req.permisos || !req.permisos.includes(permisoRequerido)) {
      return res.status(403).json({ error: 'No tiene permiso para realizar esta acción' });
    }
    next();
  };
};

/**
 * Middleware de autorización - verifica múltiples permisos (cualquiera)
 */
export const requierePermisosCualquiera = (permisos: string[]) => {
  return (req: RequestConUsuario, res: Response, next: NextFunction) => {
    const tienePermiso = permisos.some((p) => req.permisos?.includes(p));
    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tiene permisos suficientes' });
    }
    next();
  };
};

/**
 * Middleware de rol mínimo
 */
export const requiereRol = (nivelMinimo: number) => {
  return (req: RequestConUsuario, res: Response, next: NextFunction) => {
    // Mapeo de roles a niveles
    const rolesNiveles: { [key: string]: number } = {
      'Administrador': 1,
      'Gerente': 2,
      'Contador': 3,
      'Vendedor': 4,
      'Comprador': 5,
      'Operario': 6,
    };

    const rolNivel = rolesNiveles[req.usuario?.rol_id] || 999;

    if (rolNivel > nivelMinimo) {
      return res.status(403).json({ error: 'Rol insuficiente para esta acción' });
    }

    next();
  };
};

/**
 * Middleware para registrar auditoría
 */
export const registrarAuditoria = (tabla: string, tipoOperacion: 'INSERT' | 'UPDATE' | 'DELETE') => {
  return async (req: RequestConUsuario, res: Response, next: NextFunction) => {
    // Interceptar la respuesta
    const originalSend = res.send;

    res.send = function (data: any) {
      // Registrar si fue exitoso
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const datosNuevos = typeof data === 'string' ? JSON.parse(data) : data;
        // Aquí se registraría en la tabla de auditoría
      }
      return originalSend.call(this, data);
    };

    next();
  };
};
