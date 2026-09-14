// ==================== MAESTROS ====================

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  precio_venta: number;
  costo?: number;
  stock: number;
  habilitado: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proveedor {
  id: string;
  razon_social: string;
  cuit?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  condicion_iva: string;
  habilitado: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  razon_social: string;
  cuit?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  condicion_iva: string;
  habilitado: boolean;
  created_at: string;
  updated_at: string;
}

// ==================== VENTAS ====================

export interface Factura {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  fecha_vencimiento?: string;
  tipo_comprobante: string;
  estado: 'Abierta' | 'Cobrada' | 'Anulada';
  validada_arca: boolean;
  subtotal: number;
  iva: number;
  total: number;
  saldo: number;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

export interface FacturaDetalle {
  id: string;
  factura_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}

export interface NotaCredito {
  id: string;
  numero: string;
  factura_id: string;
  cliente_id: string;
  fecha: string;
  motivo: string;
  subtotal: number;
  iva: number;
  total: number;
  estado: string;
  created_at: string;
  updated_at: string;
}

// ==================== TESORERÍA ====================

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: 'Caja' | 'Banco' | 'Tarjeta';
  moneda: 'ARS' | 'USD';
  saldo: number;
  habilitada: boolean;
  created_at: string;
  updated_at: string;
}

export interface CuentaCorrienteCliente {
  id: string;
  cliente_id: string;
  saldo: number;
  created_at: string;
  updated_at: string;
}

export interface Movimiento {
  id: string;
  fecha: string;
  tipo_documento: string;
  documento_id: string;
  descripcion?: string;
  cuenta_origen_id?: string;
  cuenta_destino_id?: string;
  monto: number;
  saldo_anterior?: number;
  saldo_nuevo?: number;
  created_at: string;
}

// ==================== AUDITORÍA ====================

export interface AuditoriaRecord {
  id: string;
  tabla: string;
  tipo_operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  registro_id: string;
  datos_anteriores?: string;
  datos_nuevos?: string;
  usuario?: string;
  ip?: string;
  created_at: string;
}

// ==================== RESPUESTAS ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
