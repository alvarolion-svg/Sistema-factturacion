// Tipos compartidos entre las pestañas de Topview (antes vivían todos
// arriba de TopviewView.tsx, cuando era un solo archivo de ~6700 líneas).

export interface OrdenPublicidad {
  id: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  incluir_numero_orden_agencia: boolean;
  leyenda_factura: string | null;
  tipo_anunciante: string;
  razon_social: string;
  nombre_anunciante: string;
  cliente_id: string | null;
  agencia_id: string | null;
  vendedor_id: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  fecha_facturacion: string | null;
  email_contacto: string | null;
  costo_produccion: number;
  monto_neto: number;
  descuento_porcentaje: number;
  descuento_en_cascada: boolean;
  descuento_monto: number;
  descuento_porcentaje_2: number;
  descuento_en_cascada_2: boolean;
  descuento_monto_2: number;
  monto_neto_aplicado: number;
  descuento_facturas_porcentaje: number;
  descuento_facturas_monto: number;
  descuento_facturas_en_cascada: boolean;
  monto_final: number;
  estado: string;
  facturado: number;
  notas: string | null;
  mes_ingreso: number | null;
  ano_ingreso: number | null;
  vigencia_hasta_nota: string | null;
  vigencia_hasta_mes: number | null;
  vigencia_hasta_ano: number | null;
  cantidades_por_producto?: Record<string, number>;
  numero_factura_colppy: string | null;
  numero_nc_colppy: string | null;
  cobrado: number;
  fecha_cobro: string | null;
  asana_task_gid?: string | null;
  asana_asignado?: boolean | number | null;
}

export interface Agencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  proveedor_id: string | null;
  cliente_id: string | null;
}

export interface Intermediario {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  factura_formal: number;
  proveedor_id: string | null;
}

export interface Cliente {
  id: string;
  razon_social: string;
  agencia_id?: string | null;
}
