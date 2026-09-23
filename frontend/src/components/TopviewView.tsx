import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, formatFecha, scrollAlFormulario } from '../utils/api';
import ProduccionTopviewTab from './ProduccionTopviewTab';
import LocacionesTab from './LocacionesTab';
import LiquidacionesTab, { SeleccionLiquidacion } from './LiquidacionesTab';
import { InputMiles, InputPorcentaje } from './CamposMonto';

interface OrdenPublicidad {
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
  descuento_monto: number;
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
  cantidades_por_producto?: Record<string, number>;
  numero_factura_colppy: string | null;
  numero_nc_colppy: string | null;
  cobrado: number;
  fecha_cobro: string | null;
}

interface Agencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  proveedor_id: string | null;
  cliente_id: string | null;
}

interface Intermediario {
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

interface Cliente {
  id: string;
  razon_social: string;
  agencia_id?: string | null;
}

interface TopviewViewProps {
  token: string;
  usuario: any;
}

const TIPOS_ANUNCIANTE = ['Pequeños Anunciantes', 'Pautas Estado', 'Pautas Anuales', 'Pautas Mensuales', 'Pautas en dólares'];
// No es un gate de facturación acá adentro — es un tracker manual de en qué
// paso está la orden respecto del proceso real (Colppy sigue siendo quien
// factura de verdad hoy): la cargaste en el sistema, la revisaste, y la
// facturaste en Colppy. Ninguno de los 3 bloquea nada dentro de la app.
const ESTADOS_ORDEN = ['Cargada', 'Revisada', 'Facturada'];
const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];


interface LineaProducto {
  id?: string;
  producto_id: string;
  cantidad: string;
  ubicacion: string;
  especificaciones: string;
  locacion_id: string;
  punto_instalacion: string;
  precio: string;
}

interface LineaEmail {
  email: string;
  nombre: string;
  cargo: string;
  principal: boolean;
}

interface LineaIntermediario {
  intermediario_id: string;
  porcentaje_comision: string;
  tipo_calculo: 'base' | 'cascada';
  factura_formal: boolean;
}

interface LineaArreglo {
  tipo: string;
  descripcion: string;
  monto: string;
  tercero_nombre: string;
}

const ORDEN_VACIA = {
  tipo_anunciante: TIPOS_ANUNCIANTE[0],
  nombre_anunciante: '',
  numero_orden_agencia: '',
  incluir_numero_orden_agencia: true,
  leyenda_factura: '',
  cliente_id: '',
  agencia_id: '',
  vendedor_id: '',
  periodo_desde: '',
  periodo_hasta: '',
  fecha_facturacion: '',
  email_contacto: '',
  costo_produccion: '',
  monto_neto: '',
  descuento_porcentaje: '0',
  descuento_en_cascada: false,
  descuento_facturas_porcentaje: '0',
  descuento_facturas_en_cascada: false,
  mes_ingreso: '',
  ano_ingreso: '',
  facturado: true,
  notas: '',
  vigencia_hasta_nota: '',
};

function TopviewView({ token, usuario }: TopviewViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('topview_crear');
  const puedeEditar = permisos.has('topview_editar');
  const puedeVerComisionistas = permisos.has('topview_comisionistas_ver');
  const puedeGestionarComisionistas = permisos.has('topview_comisionistas_crear');
  const puedeEditarComisionistas = permisos.has('topview_comisionistas_editar');
  const puedeGestionarCondicionAgencia = permisos.has('topview_condiciones_agencia_crear');
  const puedeVerVendedores = permisos.has('topview_vendedores_ver');
  const puedeGestionarVendedores = permisos.has('topview_vendedores_crear');
  const puedeVerLiquidaciones = permisos.has('liquidaciones_ver');
  const puedeCargarLiquidaciones = permisos.has('liquidaciones_cargar');

  const [seccion, setSeccion] = useState<
    | 'ordenes'
    | 'produccion'
    | 'agencias'
    | 'locaciones'
    | 'intermediarios'
    | 'condiciones'
    | 'comisiones'
    | 'vendedores'
    | 'liquidaciones'
  >('ordenes');

  // Acceso directo Órdenes ↔ Liquidaciones: cada uno le pasa al otro qué
  // abrir, el que recibe lo consume y avisa para limpiarlo (no queda
  // "pegado" si después el usuario navega por su cuenta).
  const [ordenIdParaAbrir, setOrdenIdParaAbrir] = useState<string | null>(null);
  const [liquidacionParaAbrir, setLiquidacionParaAbrir] = useState<SeleccionLiquidacion | null>(null);

  return (
    <section className="view-card">
      <div className="view-header">
        <img src="/img/logo-topview.png" alt="Topview" style={{ height: '2.5rem' }} />
      </div>

      <div className="reportes-tabs">
        <button
          className={`reportes-tab ${seccion === 'ordenes' ? 'active' : ''}`}
          onClick={() => setSeccion('ordenes')}
        >
          Órdenes
        </button>
        <button
          className={`reportes-tab ${seccion === 'produccion' ? 'active' : ''}`}
          onClick={() => setSeccion('produccion')}
        >
          Órdenes de Producción
        </button>
        <button
          className={`reportes-tab ${seccion === 'agencias' ? 'active' : ''}`}
          onClick={() => setSeccion('agencias')}
        >
          Agencias
        </button>
        <button
          className={`reportes-tab ${seccion === 'locaciones' ? 'active' : ''}`}
          onClick={() => setSeccion('locaciones')}
        >
          Locaciones
        </button>
        {puedeVerComisionistas && (
          <button
            className={`reportes-tab ${seccion === 'intermediarios' ? 'active' : ''}`}
            onClick={() => setSeccion('intermediarios')}
          >
            Comisionistas
          </button>
        )}
        <button
          className={`reportes-tab ${seccion === 'condiciones' ? 'active' : ''}`}
          onClick={() => setSeccion('condiciones')}
        >
          Condiciones
        </button>
        {puedeVerComisionistas && (
          <button
            className={`reportes-tab ${seccion === 'comisiones' ? 'active' : ''}`}
            onClick={() => setSeccion('comisiones')}
          >
            Comisiones en efectivo
          </button>
        )}
        {puedeVerVendedores && (
          <button
            className={`reportes-tab ${seccion === 'vendedores' ? 'active' : ''}`}
            onClick={() => setSeccion('vendedores')}
          >
            Vendedores
          </button>
        )}
        {puedeVerLiquidaciones && (
          <button
            className={`reportes-tab ${seccion === 'liquidaciones' ? 'active' : ''}`}
            onClick={() => setSeccion('liquidaciones')}
          >
            Liquidaciones
          </button>
        )}
      </div>

      {seccion === 'ordenes' && (
        <OrdenesTab
          token={token}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          puedeVerLiquidaciones={puedeVerLiquidaciones}
          ordenIdParaAbrir={ordenIdParaAbrir}
          onOrdenAbierta={() => setOrdenIdParaAbrir(null)}
          onVerLiquidacion={(concesionarioId, mesSel, anoSel) => {
            setLiquidacionParaAbrir({ concesionarioId, mes: mesSel, ano: anoSel });
            setSeccion('liquidaciones');
          }}
        />
      )}
      {seccion === 'produccion' && (
        <ProduccionTopviewTab token={token} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />
      )}
      {seccion === 'agencias' && <AgenciasTab token={token} puedeCrear={puedeCrear} />}
      {seccion === 'locaciones' && <LocacionesTab token={token} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />}
      {seccion === 'intermediarios' && puedeVerComisionistas && (
        <IntermediariosTab token={token} puedeCrear={puedeGestionarComisionistas} />
      )}
      {seccion === 'condiciones' && (
        <CondicionesTab
          token={token}
          puedeCrear={puedeGestionarCondicionAgencia}
          puedeVerComisionistas={puedeVerComisionistas}
          puedeGestionarComisionistas={puedeGestionarComisionistas}
        />
      )}
      {seccion === 'comisiones' && puedeVerComisionistas && (
        <ComisionesEfectivoTab token={token} puedeEditar={puedeEditarComisionistas} />
      )}
      {seccion === 'vendedores' && puedeVerVendedores && (
        <VendedoresTab token={token} puedeCrear={puedeGestionarVendedores} />
      )}
      {seccion === 'liquidaciones' && puedeVerLiquidaciones && (
        <LiquidacionesTab
          token={token}
          puedeCargar={puedeCargarLiquidaciones}
          seleccionInicial={liquidacionParaAbrir}
          onSeleccionConsumida={() => setLiquidacionParaAbrir(null)}
          onVerOrden={(ordenId) => {
            setOrdenIdParaAbrir(ordenId);
            setSeccion('ordenes');
          }}
        />
      )}
    </section>
  );
}

function OrdenesTab({
  token,
  puedeCrear,
  puedeEditar,
  puedeVerLiquidaciones,
  ordenIdParaAbrir,
  onOrdenAbierta,
  onVerLiquidacion,
}: {
  token: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeVerLiquidaciones?: boolean;
  ordenIdParaAbrir?: string | null;
  onOrdenAbierta?: () => void;
  onVerLiquidacion?: (concesionarioId: string, mes: string, ano: string) => void;
}) {
  const [ordenes, setOrdenes] = useState<OrdenPublicidad[] | null>(null);
  const [error, setError] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarAgencia, setMostrarAgencia] = useState(false);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [agencias, setAgencias] = useState<Agencia[]>([]);
  const [intermediarios, setIntermediarios] = useState<Intermediario[]>([]);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [tiposAnunciantes, setTiposAnunciantes] = useState<{ id: string; nombre: string }[]>([]);
  const [productos, setProductos] = useState<{ id: string; nombre: string; codigo: string; tipo?: string }[] | null>(null);
  const [locaciones, setLocaciones] = useState<any[]>([]);

  const [ordenForm, setOrdenForm] = useState(ORDEN_VACIA);
  const [lineasProductos, setLineasProductos] = useState<LineaProducto[]>([
    { producto_id: '', cantidad: '1', ubicacion: '', especificaciones: '', locacion_id: '', punto_instalacion: '', precio: '' },
  ]);
  const [lineasEmails, setLineasEmails] = useState<LineaEmail[]>([
    { email: '', nombre: '', cargo: '', principal: true },
  ]);
  const [lineasIntermediarios, setLineasIntermediarios] = useState<LineaIntermediario[]>([]);
  const [lineasArreglos, setLineasArreglos] = useState<LineaArreglo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [condicionesAgencia, setCondicionesAgencia] = useState<any[]>([]);
  const [condicionAgenciaId, setCondicionAgenciaId] = useState('');

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [generandoFacturas, setGenerandoFacturas] = useState(false);
  const [errorFacturas, setErrorFacturas] = useState('');
  const [mensajeFacturas, setMensajeFacturas] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [subiendoDocumento, setSubiendoDocumento] = useState(false);
  const [errorDocumento, setErrorDocumento] = useState('');
  const [descripcionDocumento, setDescripcionDocumento] = useState('');
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const cargarOrdenes = () => {
    setError('');
    setOrdenes(null);
    axios
      .get('/api/ordenes-publicidad', authHeaders(token))
      .then((res) => setOrdenes(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las órdenes.'));
        setOrdenes([]);
      });
  };

  useEffect(() => {
    cargarOrdenes();
    // La lista necesita el catálogo de productos para armar las columnas de
    // cantidad por soporte, aunque el formulario de alta no esté abierto.
    axios
      .get('/api/productos', authHeaders(token))
      .then((res) => setProductos(res.data))
      .catch(() => setProductos([]));
    axios
      .get('/api/locaciones', authHeaders(token))
      .then((res) => setLocaciones(res.data || []))
      .catch(() => setLocaciones([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarMaestros = () => {
    setClientes(null);
    setProductos(null);
    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => setClientes(res.data))
      .catch(() => setClientes([]));
    axios
      .get('/api/topview/agencias', authHeaders(token))
      .then((res) => setAgencias(res.data))
      .catch(() => setAgencias([]));
    axios
      .get('/api/topview/intermediarios', authHeaders(token))
      .then((res) => setIntermediarios(res.data))
      .catch(() => setIntermediarios([]));
    axios
      .get('/api/topview/vendedores', authHeaders(token))
      .then((res) => setVendedores(res.data))
      .catch(() => setVendedores([]));
    axios
      .get('/api/topview/tipos-anunciantes', authHeaders(token))
      .then((res) => setTiposAnunciantes(res.data))
      .catch(() => setTiposAnunciantes([]));
    axios
      .get('/api/productos', authHeaders(token))
      .then((res) => setProductos(res.data))
      .catch(() => setProductos([]));
    axios
      .get('/api/locaciones', authHeaders(token))
      .then((res) => setLocaciones(res.data || []))
      .catch(() => setLocaciones([]));
  };

  const handleNueva = () => {
    setOrdenForm(ORDEN_VACIA);
    setLineasProductos([{ producto_id: '', cantidad: '1', ubicacion: '', especificaciones: '', locacion_id: '', punto_instalacion: '', precio: '' }]);
    setLineasEmails([{ email: '', nombre: '', cargo: '', principal: true }]);
    setLineasIntermediarios([]);
    setLineasArreglos([]);
    setErrorForm('');
    setDetalleId(null);
    setEditandoOrdenId(null);
    setMostrarForm(true);
    scrollAlFormulario();
    setMostrarAgencia(false);
    cargarMaestros();
  };

  const [clonandoId, setClonandoId] = useState<string | null>(null);
  const [editandoOrdenId, setEditandoOrdenId] = useState<string | null>(null);

  // Vuelca los datos completos de una orden (traída de la API) al formulario
  // de alta — se usa tanto para Clonar (arranca una orden nueva a partir de
  // otra) como para Editar (modifica la misma orden in situ).
  const cargarOrdenAlFormulario = (o: any) => {
    setOrdenForm({
      tipo_anunciante: o.tipo_anunciante || TIPOS_ANUNCIANTE[0],
      nombre_anunciante: o.nombre_anunciante || '',
      numero_orden_agencia: o.numero_orden_agencia || '',
      incluir_numero_orden_agencia: !!o.incluir_numero_orden_agencia,
      leyenda_factura: o.leyenda_factura || '',
      cliente_id: o.cliente_id || '',
      agencia_id: o.agencia_id || '',
      vendedor_id: o.vendedor_id || '',
      periodo_desde: o.periodo_desde || '',
      periodo_hasta: o.periodo_hasta || '',
      fecha_facturacion: o.fecha_facturacion || '',
      email_contacto: o.email_contacto || '',
      costo_produccion: o.costo_produccion !== null && o.costo_produccion !== undefined ? String(o.costo_produccion) : '',
      monto_neto: o.monto_neto !== null && o.monto_neto !== undefined ? String(o.monto_neto) : '',
      descuento_porcentaje: String(o.descuento_porcentaje ?? 0),
      descuento_en_cascada: !!o.descuento_en_cascada,
      descuento_facturas_porcentaje: String(o.descuento_facturas_porcentaje ?? 0),
      descuento_facturas_en_cascada: !!o.descuento_facturas_en_cascada,
      mes_ingreso: o.mes_ingreso ? String(o.mes_ingreso) : '',
      ano_ingreso: o.ano_ingreso ? String(o.ano_ingreso) : '',
      facturado: o.facturado === undefined ? true : !!o.facturado,
      notas: o.notas || '',
      vigencia_hasta_nota: o.vigencia_hasta_nota || '',
    });
    setLineasProductos(
      (o.detalles || []).length > 0
        ? o.detalles.map((d: any) => ({
            id: d.id,
            producto_id: d.producto_id || '',
            cantidad: String(d.cantidad ?? 1),
            ubicacion: d.ubicacion || '',
            especificaciones: d.especificaciones || '',
            locacion_id: d.locacion_id || '',
            punto_instalacion: d.punto_instalacion || '',
            precio: d.precio ? String(d.precio) : '',
          }))
        : [{ producto_id: '', cantidad: '1', ubicacion: '', especificaciones: '', locacion_id: '', punto_instalacion: '', precio: '' }]
    );
    setLineasEmails(
      (o.contactos || []).length > 0
        ? o.contactos.map((c: any) => ({
            email: c.email || '',
            nombre: c.nombre || '',
            cargo: c.cargo || '',
            principal: !!c.principal,
          }))
        : [{ email: '', nombre: '', cargo: '', principal: true }]
    );
    setLineasIntermediarios(
      (o.intermediarios || []).map((i: any) => ({
        intermediario_id: i.intermediario_id || '',
        porcentaje_comision: String(i.porcentaje_comision ?? 0),
        tipo_calculo: i.tipo_calculo === 'base' ? 'base' : 'cascada',
        factura_formal: !!i.factura_formal,
      }))
    );
    setLineasArreglos(
      (o.arreglos_no_registrables || []).map((a: any) => ({
        tipo: a.tipo || '',
        descripcion: a.descripcion || '',
        monto: String(a.monto ?? 0),
        tercero_nombre: a.tercero_nombre || '',
      }))
    );
    setErrorForm('');
    setMostrarAgencia(!!o.agencia_id);
  };

  // Clona una orden existente como punto de partida de una nueva: trae todos
  // los datos (cliente, período, montos, productos, comisionistas, etc.) al
  // formulario de alta para no volver a tipear todo cuando llegan varias
  // órdenes iguales — el usuario ajusta lo que cambia (N° de orden, vigencia,
  // qué se compró) antes de guardar. No toca la orden original.
  const handleClonar = async (id: string) => {
    setClonandoId(id);
    setError('');
    try {
      const res = await axios.get(`/api/ordenes-publicidad/${id}`, authHeaders(token));
      cargarMaestros();
      cargarOrdenAlFormulario(res.data);
      setEditandoOrdenId(null);
      setDetalleId(null);
      setMostrarForm(true);
      scrollAlFormulario();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo clonar la orden.'));
    } finally {
      setClonandoId(null);
    }
  };

  // Edita la orden que se está viendo en el detalle: mismos datos que Clonar,
  // pero al guardar actualiza esta orden en vez de crear una nueva. Las
  // facturas ya generadas no se tocan — solo se reconcilian los meses
  // todavía pendientes de facturar con el período que quede.
  const handleEditarOrden = () => {
    if (!detalleId || !detalle) return;
    cargarMaestros();
    cargarOrdenAlFormulario(detalle);
    setEditandoOrdenId(detalleId);
    setDetalleId(null);
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const [modificandoId, setModificandoId] = useState<string | null>(null);

  // Igual que Editar, pero disparado desde el botón "Modificar" de la lista
  // (sin pasar antes por el detalle) — hay que traer la orden completa primero.
  const handleModificarDesdeLista = async (id: string) => {
    setModificandoId(id);
    setError('');
    try {
      const res = await axios.get(`/api/ordenes-publicidad/${id}`, authHeaders(token));
      cargarMaestros();
      cargarOrdenAlFormulario(res.data);
      setEditandoOrdenId(id);
      setDetalleId(null);
      setMostrarForm(true);
      scrollAlFormulario();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo abrir la orden para editar.'));
    } finally {
      setModificandoId(null);
    }
  };

  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  // Baja lógica: la orden desaparece de la lista pero nunca se borra el
  // registro (puede tener facturas/gastos/comisiones ya generados).
  const handleEliminarOrden = async (id: string, numeroOrden: string) => {
    if (!window.confirm(`¿Dar de baja la orden ${numeroOrden}? No se borra el historial de facturación, pero deja de aparecer en la lista.`)) {
      return;
    }
    setEliminandoId(id);
    setError('');
    try {
      await axios.delete(`/api/ordenes-publicidad/${id}`, authHeaders(token));
      cargarOrdenes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja la orden.'));
    } finally {
      setEliminandoId(null);
    }
  };

  const [cambiandoEstadoId, setCambiandoEstadoId] = useState<string | null>(null);

  const handleCambiarEstadoLista = async (id: string, nuevoEstado: string) => {
    setCambiandoEstadoId(id);
    setError('');
    try {
      await axios.put(`/api/ordenes-publicidad/${id}/estado`, { nuevoEstado }, authHeaders(token));
      cargarOrdenes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo cambiar el estado.'));
    } finally {
      setCambiandoEstadoId(null);
    }
  };

  // Números reales de Colppy (factura/NC) — solo tienen sentido una vez que la
  // orden está "Facturada" de verdad allá; se editan sueltos del estado, para
  // poder corregirlos después sin tener que volver a tocar el desplegable.
  const [guardandoColppyId, setGuardandoColppyId] = useState<string | null>(null);

  const handleGuardarColppy = async (o: OrdenPublicidad, campo: 'factura' | 'nc', valor: string) => {
    const valorPrevio = campo === 'factura' ? o.numero_factura_colppy || '' : o.numero_nc_colppy || '';
    if (valor === valorPrevio) return;
    setGuardandoColppyId(o.id);
    setError('');
    try {
      await axios.put(
        `/api/ordenes-publicidad/${o.id}/facturacion-colppy`,
        {
          numero_factura_colppy: campo === 'factura' ? valor : o.numero_factura_colppy,
          numero_nc_colppy: campo === 'nc' ? valor : o.numero_nc_colppy,
        },
        authHeaders(token)
      );
      cargarOrdenes();
      if (detalleId) cargarDetalle(detalleId);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el número de Colppy.'));
    } finally {
      setGuardandoColppyId(null);
    }
  };

  // Los campos de Colppy se muestran como texto una vez cargados (no como
  // caja de edición siempre abierta) para no invitar a tocarlos por error —
  // solo se abren para editar cuando el usuario lo pide explícitamente.
  const [editandoColppy, setEditandoColppy] = useState<{ id: string; campo: 'factura' | 'nc' } | null>(null);

  const renderCampoColppy = (o: OrdenPublicidad, campo: 'factura' | 'nc') => {
    const valor = campo === 'factura' ? o.numero_factura_colppy : o.numero_nc_colppy;
    if (!puedeEditar) return valor || '-';

    const estaEditando = editandoColppy?.id === o.id && editandoColppy.campo === campo;
    if (!valor && !estaEditando) {
      // La NC casi nunca aplica (la mayoría de las órdenes no llevan) — mejor
      // cerrada con "No lleva" que una caja vacía invitando a tocarla. La
      // factura en cambio sí se espera siempre que está "Facturada", por eso
      // esa sigue abierta para cargar rápido el primer valor.
      if (campo === 'nc') {
        return (
          <>
            <span style={{ color: '#888' }}>No lleva</span>{' '}
            <button type="button" className="btn-link" onClick={() => setEditandoColppy({ id: o.id, campo })}>
              Editar
            </button>
          </>
        );
      }
      return (
        <input
          style={{ width: '9rem' }}
          placeholder="N° factura"
          defaultValue=""
          onBlur={(e) => handleGuardarColppy(o, campo, e.target.value)}
          disabled={guardandoColppyId === o.id}
        />
      );
    }
    if (estaEditando) {
      return (
        <input
          autoFocus
          style={{ width: '9rem' }}
          placeholder={campo === 'factura' ? 'N° factura' : 'N° NC (si hubo)'}
          defaultValue={valor || ''}
          onBlur={(e) => {
            handleGuardarColppy(o, campo, e.target.value);
            setEditandoColppy(null);
          }}
          disabled={guardandoColppyId === o.id}
        />
      );
    }
    return (
      <>
        {valor}{' '}
        <button type="button" className="btn-link" onClick={() => setEditandoColppy({ id: o.id, campo })}>
          Editar
        </button>
      </>
    );
  };

  // Cobro de las órdenes no registradas — solo aplica cuando no hay factura
  // real de por medio (ver comentario en database.ts). Es un toggle simple,
  // no un campo de texto como Colppy, porque acá lo único que importa es
  // "¿entró la plata?" y desde cuándo.
  const [guardandoCobroId, setGuardandoCobroId] = useState<string | null>(null);

  const handleCambiarCobro = async (o: OrdenPublicidad, cobrado: boolean) => {
    setGuardandoCobroId(o.id);
    setError('');
    try {
      await axios.put(`/api/ordenes-publicidad/${o.id}/cobro`, { cobrado }, authHeaders(token));
      cargarOrdenes();
      if (detalleId) cargarDetalle(detalleId);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo actualizar el cobro.'));
    } finally {
      setGuardandoCobroId(null);
    }
  };

  // Filtro mensual de la lista: por "Fecha de facturación" (el dato real de
  // cuándo se emite la factura de este mes), no por período de la campaña —
  // es la pregunta "qué tengo que facturar este mes", no "qué órdenes están vigentes".
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroAno, setFiltroAno] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // "Facturado" (checkbox "Esta orden genera facturación") separa lo que
  // realmente entra en el circuito fiscal de lo que no — clientes con
  // historial real de facturación pueden tener también órdenes sueltas
  // marcadas como no facturables, y mezclarlas en un mismo total confunde.
  const [filtroFacturado, setFiltroFacturado] = useState('');
  const [filtroTipoAnunciante, setFiltroTipoAnunciante] = useState('');
  // El mes/año de arriba puede filtrar por "Fecha de facturación" (cuándo se
  // factura) o por "Mes de ingreso (venta)" (cuándo se cargó/vendió la
  // pauta) — son preguntas distintas: una orden vendida en agosto puede
  // facturarse recién en septiembre. Default: facturación, igual que
  // siempre. Mismo criterio que separa "Venta mensual" de "Facturación
  // bruta mensual" en Reportes → Topview.
  const [filtroMesTipo, setFiltroMesTipo] = useState<'facturacion' | 'ingreso'>('facturacion');

  // Mes/año de ingreso resuelto igual que al guardar la orden: si no se
  // cargó a mano, se toma el mes/año de "Período desde".
  const mesAnoIngresoDe = (o: OrdenPublicidad): [number, number] => {
    const [anoDesde, mesDesde] = o.periodo_desde.split('-').map(Number);
    return [o.ano_ingreso || anoDesde, o.mes_ingreso || mesDesde];
  };

  const anosDisponibles = Array.from(
    new Set(
      filtroMesTipo === 'ingreso'
        ? (ordenes || []).map((o) => mesAnoIngresoDe(o)[0])
        : (ordenes || [])
            .map((o) => o.fecha_facturacion)
            .filter((f): f is string => !!f)
            .map((f) => Number(f.split('-')[0]))
    )
  ).sort((a, b) => Number(b) - Number(a));

  const esOrdenFacturado = (o: OrdenPublicidad) => o.facturado === undefined || o.facturado === null || !!o.facturado;

  // "Facturada" significa "ya se facturó de verdad en Colppy" — una orden
  // no registrada (facturado: false) nunca pasa por Colppy, así que ofrecer
  // esa opción sería engañoso y rompería el desglose registrado/no
  // registrado. Si por algún motivo ya estuviera así guardada, la dejamos
  // en la lista para no mostrar el selector vacío.
  const estadosDisponibles = (o: OrdenPublicidad) =>
    esOrdenFacturado(o) || o.estado === 'Facturada' ? ESTADOS_ORDEN : ESTADOS_ORDEN.filter((e) => e !== 'Facturada');

  // Filtrado por mes/año/búsqueda, SIN el filtro de facturado — es la base
  // sobre la que se calcula el desglose de totales (registrado/no registrado),
  // que se muestra siempre entero sin importar qué esté eligiendo el usuario
  // en "Facturación" (ese selector solo recorta qué filas ve en la tabla).
  const ordenesFiltradasBase = (ordenes || [])
    .filter((o) => {
      if (!filtroMes && !filtroAno) return true;
      if (filtroMesTipo === 'ingreso') {
        const [ano, mes] = mesAnoIngresoDe(o);
        if (filtroMes && mes !== Number(filtroMes)) return false;
        if (filtroAno && ano !== Number(filtroAno)) return false;
        return true;
      }
      if (!o.fecha_facturacion) return false;
      const [ano, mes] = o.fecha_facturacion.split('-');
      if (filtroMes && Number(mes) !== Number(filtroMes)) return false;
      if (filtroAno && Number(ano) !== Number(filtroAno)) return false;
      return true;
    })
    .filter((o) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.trim().toLowerCase();
      const campos = [
        o.numero_orden,
        o.numero_orden_agencia,
        o.razon_social,
        o.nombre_anunciante,
        o.tipo_anunciante,
        o.vigencia_hasta_nota,
        o.numero_factura_colppy,
        o.numero_nc_colppy,
      ];
      return campos.some((c) => (c || '').toLowerCase().includes(q));
    })
    .filter((o) => !filtroTipoAnunciante || o.tipo_anunciante === filtroTipoAnunciante)
    // Mismo orden que en el armado de la pauta (Pequeños Anunciantes, Pautas
    // Estado, Pautas Anuales, Pautas Mensuales, Pautas en dólares); dentro de
    // cada tipo, las no registradas van al final — sigue el mismo correlato
    // que el xls de referencia (ej. la sección CHICOS trae primero las
    // regulares y al final las "No se factura"). sort() es estable, así que
    // dentro de cada combinación tipo+facturado se mantiene el orden que ya
    // traían (más nuevas primero).
    .sort((a, b) => {
      const grupo = TIPOS_ANUNCIANTE.indexOf(a.tipo_anunciante) - TIPOS_ANUNCIANTE.indexOf(b.tipo_anunciante);
      if (grupo !== 0) return grupo;
      return Number(!esOrdenFacturado(a)) - Number(!esOrdenFacturado(b));
    });

  const ordenesFiltradas = !filtroFacturado
    ? ordenesFiltradasBase
    : ordenesFiltradasBase.filter((o) => (filtroFacturado === 'si' ? esOrdenFacturado(o) : !esOrdenFacturado(o)));

  const columnasExport = (soportes: typeof productos) => [
    'N° orden (agencia)',
    'Cliente/Agencia',
    'Anunciante',
    'Vigencia hasta',
    'Tipo',
    'Desde',
    'Hasta',
    'Fecha Fac',
    ...(soportes || []).map((p) => p.codigo?.replace('SOP-', '') || p.nombre),
    '$ Neto s/desc',
    '% NC',
    '% FC',
    '$ Neto blanco',
    'Neto Topview (post-comisión)',
    'Estado',
    'N° Factura Colppy',
    'N° NC Colppy',
  ];

  const filaExport = (o: OrdenPublicidad, soportes: typeof productos, paraExcel: boolean) => {
    const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_facturas_monto || 0);
    return [
      o.numero_orden_agencia || '',
      o.razon_social,
      o.nombre_anunciante,
      o.vigencia_hasta_nota || '',
      o.tipo_anunciante,
      formatFecha(o.periodo_desde),
      formatFecha(o.periodo_hasta),
      o.fecha_facturacion ? formatFecha(o.fecha_facturacion) : '',
      ...(soportes || []).map((p) => o.cantidades_por_producto?.[p.id] || (paraExcel ? 0 : '-')),
      paraExcel ? o.monto_neto || 0 : formatMoney(o.monto_neto),
      paraExcel ? o.descuento_porcentaje || 0 : o.descuento_porcentaje ? `${o.descuento_porcentaje}%` : '-',
      paraExcel
        ? o.descuento_facturas_porcentaje || 0
        : o.descuento_facturas_porcentaje
        ? `${o.descuento_facturas_porcentaje}%`
        : '-',
      paraExcel ? netoBlanco : formatMoney(netoBlanco),
      paraExcel ? o.monto_final || 0 : formatMoney(o.monto_final),
      o.estado,
      o.numero_factura_colppy || '',
      o.numero_nc_colppy || '',
    ];
  };

  const nombreArchivoExport = (ext: string) => {
    const sufijo = filtroMes || filtroAno ? `${filtroMes ? NOMBRES_MES[Number(filtroMes) - 1] : 'todos'}_${filtroAno || 'todos'}` : 'todas';
    return `ordenes_topview_${sufijo}.${ext}`;
  };

  // Formato calcado de la planilla de referencia del usuario (AGO): headers
  // celestes centrados, montos en formato contable "$", fechas dd/mm/aaaa,
  // porcentajes como "15.00%" (los % se guardan como 15, no como 0.15).
  const EXCEL_MONEY_FORMAT = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';
  const EXCEL_PERCENT_FORMAT = '0.00"%"';
  const EXCEL_DATE_FORMAT = 'dd/mm/yyyy';
  const EXCEL_QTY_FORMAT = '#,##0';

  const fechaLocalDate = (fecha: string | null | undefined): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || '');
    if (!m) return null;
    const [, anio, mes, dia] = m;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  };

  const handleExportarExcel = async () => {
    const soportes = productosSoportes;
    const columnas = columnasExport(soportes);

    const idxDesde = 5;
    const idxFechaFac = 7;
    const idxSoportesStart = 8;
    const idxSoportesEnd = idxSoportesStart + soportes.length - 1;
    const idxNeto = idxSoportesEnd + 1;
    const idxNC = idxNeto + 1;
    const idxFC = idxNC + 1;
    const idxNetoBlanco = idxFC + 1;
    const idxNetoFinal = idxNetoBlanco + 1;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Órdenes');

    ws.columns = columnas.map((titulo) => ({ header: titulo, width: Math.max(titulo.length + 2, 12) }));
    ws.getColumn(1).width = 18; // N° orden (agencia)
    ws.getColumn(2).width = 32; // Cliente/Agencia
    ws.getColumn(3).width = 28; // Anunciante
    ws.getColumn(4).width = 20; // Vigencia hasta

    ordenesFiltradas.forEach((o) => {
      const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_facturas_monto || 0);
      ws.addRow([
        o.numero_orden_agencia || '',
        o.razon_social,
        o.nombre_anunciante,
        o.vigencia_hasta_nota || '',
        o.tipo_anunciante,
        fechaLocalDate(o.periodo_desde),
        fechaLocalDate(o.periodo_hasta),
        fechaLocalDate(o.fecha_facturacion),
        ...(soportes || []).map((p) => o.cantidades_por_producto?.[p.id] || 0),
        o.monto_neto || 0,
        o.descuento_porcentaje || 0,
        o.descuento_facturas_porcentaje || 0,
        netoBlanco,
        o.monto_final || 0,
        o.estado,
        o.numero_factura_colppy || '',
        o.numero_nc_colppy || '',
      ]);
    });

    const headerRow = ws.getRow(1);
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
    });

    for (let i = idxDesde; i <= idxFechaFac; i++) ws.getColumn(i + 1).numFmt = EXCEL_DATE_FORMAT;
    for (let i = idxSoportesStart; i <= idxSoportesEnd; i++) ws.getColumn(i + 1).numFmt = EXCEL_QTY_FORMAT;
    [idxNeto, idxNetoBlanco, idxNetoFinal].forEach((i) => (ws.getColumn(i + 1).numFmt = EXCEL_MONEY_FORMAT));
    [idxNC, idxFC].forEach((i) => (ws.getColumn(i + 1).numFmt = EXCEL_PERCENT_FORMAT));

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoExport('xlsx');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportarPDF = () => {
    const columnas = columnasExport(productosSoportes);
    const filas = ordenesFiltradas.map((o) => filaExport(o, productosSoportes, false));
    const doc = new jsPDF({ orientation: 'landscape' });
    autoTable(doc, {
      head: [columnas],
      body: filas as any,
      styles: { fontSize: 6, cellPadding: 1.5 },
      headStyles: { fillColor: [232, 24, 56] },
    });
    doc.save(nombreArchivoExport('pdf'));
  };

  const handleChangeOrden = (campo: keyof typeof ORDEN_VACIA, valor: string | boolean) => {
    setOrdenForm((prev) => ({ ...prev, [campo]: valor }));
  };

  // Si el cliente elegido es en sí mismo una agencia (ya facturamos ahí,
  // no tiene sentido pedir de nuevo la misma agencia), se autocompleta el
  // campo Agencia para no repetir la selección — pero queda editable por si
  // el caso puntual es al revés: se factura directo pero igual intermedia
  // otra agencia distinta.
  const handleChangeCliente = (clienteId: string) => {
    const cliente = clientes?.find((c) => c.id === clienteId);
    setOrdenForm((prev) => ({
      ...prev,
      cliente_id: clienteId,
      agencia_id: cliente?.agencia_id || '',
    }));
    if (cliente?.agencia_id) setMostrarAgencia(true);
  };

  // Al elegir la agencia, se traen sus condiciones guardadas (si tiene) para
  // sugerirlas — no se aplican solas, hay que elegirlas del desplegable.
  useEffect(() => {
    setCondicionAgenciaId('');
    if (!ordenForm.agencia_id) {
      setCondicionesAgencia([]);
      return;
    }
    axios
      .get(`/api/topview/condiciones-agencia?agencia_id=${ordenForm.agencia_id}`, authHeaders(token))
      .then((res) => setCondicionesAgencia(res.data || []))
      .catch(() => setCondicionesAgencia([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenForm.agencia_id]);

  const handleAplicarCondicionAgencia = (id: string) => {
    setCondicionAgenciaId(id);
    const c = condicionesAgencia.find((x) => x.id === id);
    if (!c) return;
    setOrdenForm((prev) => ({
      ...prev,
      descuento_porcentaje: String(c.porcentaje_nc ?? 0),
      descuento_en_cascada: !!c.nc_en_cascada,
      descuento_facturas_porcentaje: String(c.porcentaje_factura ?? 0),
      descuento_facturas_en_cascada: !!c.factura_en_cascada,
    }));
  };

  // Cálculo en vivo: descuento comercial (NC) + descuento de facturas (FC), cada uno
  // plano sobre el bruto o en cascada sobre el remanente del anterior según su toggle
  // — misma lógica que el backend — + comisiones de intermediarios.
  // Si "Monto neto" se cargó a mano, se respeta tal cual (override manual).
  // Si se dejó vacío/0, se arma solo sumando el precio de cada línea de
  // producto/soporte — así se puede construir el total soporte por soporte
  // en vez de escribir un número suelto arriba.
  const sumaPreciosLineas = lineasProductos.reduce((acc, l) => acc + (Number(l.precio) || 0), 0);
  const montoNetoManual = Number(ordenForm.monto_neto) || 0;
  const montoNeto = montoNetoManual || sumaPreciosLineas;
  let descuentoMonto = 0;
  let descuentoFacturasMonto = 0;
  {
    let montoActual = montoNeto;
    [
      { pct: Number(ordenForm.descuento_porcentaje) || 0, cascada: ordenForm.descuento_en_cascada },
      { pct: Number(ordenForm.descuento_facturas_porcentaje) || 0, cascada: ordenForm.descuento_facturas_en_cascada },
    ].forEach(({ pct, cascada }, idx) => {
      const base = cascada ? montoActual : montoNeto;
      const monto = base * (pct / 100);
      if (cascada) montoActual -= monto;
      if (idx === 0) descuentoMonto = monto;
      else descuentoFacturasMonto = monto;
    });
  }
  const montoNetoAplicado = montoNeto - descuentoMonto;
  const montoFinal = montoNeto - descuentoMonto - descuentoFacturasMonto;

  // 'base': cada comisionista cobra su % directo del mismo monto final (varios
  // actores en paralelo, ej. comisión con factura + comisión en efectivo, que no
  // se descuentan entre sí). 'cascada': cada nivel cobra su % sobre lo que va
  // quedando después del nivel anterior. El neto percibido siempre resta TODAS
  // las comisiones (de ambos tipos), aunque sólo las 'cascada' reducen la base
  // del siguiente nivel en cascada.
  const comisiones = lineasIntermediarios.reduce((acc, inter, idx) => {
    const pct = Number(inter.porcentaje_comision) / 100 || 0;
    const montoActualCascada = idx === 0 ? montoFinal : acc[idx - 1].montoActualCascada;
    const montoAcumuladoPrevio = idx === 0 ? 0 : acc[idx - 1].montoAcumuladoComisiones;
    let montoComision: number;
    let montoActualCascadaNuevo: number;
    if (inter.tipo_calculo === 'base') {
      montoComision = montoFinal * pct;
      montoActualCascadaNuevo = montoActualCascada;
    } else {
      montoComision = montoActualCascada * pct;
      montoActualCascadaNuevo = montoActualCascada - montoComision;
    }
    acc.push({ montoComision, montoActualCascada: montoActualCascadaNuevo, montoAcumuladoComisiones: montoAcumuladoPrevio + montoComision });
    return acc;
  }, [] as Array<{ montoComision: number; montoActualCascada: number; montoAcumuladoComisiones: number }>);

  const montoPercibido = montoFinal - (comisiones.length > 0 ? comisiones[comisiones.length - 1].montoAcumuladoComisiones : 0);

  const handleAgregarProducto = () => {
    setLineasProductos((prev) => [
      ...prev,
      { producto_id: '', cantidad: '1', ubicacion: '', especificaciones: '', locacion_id: '', punto_instalacion: '', precio: '' },
    ]);
  };
  const handleQuitarProducto = (i: number) => {
    setLineasProductos((prev) => prev.filter((_, idx) => idx !== i));
  };
  const handleChangeProducto = (i: number, campo: keyof LineaProducto, valor: string) => {
    setLineasProductos((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], [campo]: valor };
      // Si cambia el producto o la locación, el punto elegido antes puede
      // no aplicar más — se resetea para no arrastrar una combinación inválida.
      if (campo === 'producto_id' || campo === 'locacion_id') copia[i].punto_instalacion = '';
      return copia;
    });
  };

  const handleAgregarEmail = () => {
    setLineasEmails((prev) => [...prev, { email: '', nombre: '', cargo: '', principal: false }]);
  };
  const handleQuitarEmail = (i: number) => {
    setLineasEmails((prev) => prev.filter((_, idx) => idx !== i));
  };
  const handleChangeEmail = (i: number, campo: keyof LineaEmail, valor: string | boolean) => {
    setLineasEmails((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], [campo]: valor } as LineaEmail;
      return copia;
    });
  };

  const handleAgregarIntermediario = () => {
    setLineasIntermediarios((prev) => [
      ...prev,
      { intermediario_id: '', porcentaje_comision: '0', tipo_calculo: 'cascada', factura_formal: false },
    ]);
  };
  const handleQuitarIntermediario = (i: number) => {
    setLineasIntermediarios((prev) => prev.filter((_, idx) => idx !== i));
  };
  const handleChangeFacturaFormalIntermediario = (i: number, esTipo1: boolean) => {
    setLineasIntermediarios((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], factura_formal: esTipo1 };
      return copia;
    });
  };
  const handleChangeIntermediario = (i: number, campo: keyof LineaIntermediario, valor: string) => {
    setLineasIntermediarios((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], [campo]: valor } as LineaIntermediario;
      // Al elegir el comisionista, arranca con la Clasificación por defecto de
      // su ficha — si más abajo tiene una condición guardada, esa la pisa.
      if (campo === 'intermediario_id' && valor) {
        const maestro = intermediarios.find((int) => int.id === valor);
        copia[i] = { ...copia[i], factura_formal: !!maestro?.factura_formal };
      }
      return copia;
    });

    // Al elegir el comisionista, si tiene una condición guardada se sugiere su
    // % y forma de cálculo habituales — quedan igual de editables para ese renglón.
    if (campo === 'intermediario_id' && valor) {
      axios
        .get(`/api/topview/condiciones-intermediario?intermediario_id=${valor}`, authHeaders(token))
        .then((res) => {
          const cond = (res.data || [])[0];
          if (!cond) return;
          setLineasIntermediarios((prev) => {
            const copia = [...prev];
            if (copia[i]?.intermediario_id !== valor) return prev;
            copia[i] = {
              ...copia[i],
              porcentaje_comision: String(cond.porcentaje_comision ?? 0),
              tipo_calculo: cond.tipo_calculo === 'base' ? 'base' : 'cascada',
              factura_formal: !!cond.factura_formal,
            };
            return copia;
          });
        })
        .catch(() => {});
    }
  };

  const handleAgregarArreglo = () => {
    setLineasArreglos((prev) => [...prev, { tipo: 'Comisión', descripcion: '', monto: '0', tercero_nombre: '' }]);
  };
  const handleQuitarArreglo = (i: number) => {
    setLineasArreglos((prev) => prev.filter((_, idx) => idx !== i));
  };
  const handleChangeArreglo = (i: number, campo: keyof LineaArreglo, valor: string) => {
    setLineasArreglos((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], [campo]: valor };
      return copia;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ordenForm.cliente_id) {
      setErrorForm('Elegí un cliente: la orden se factura a nombre suyo.');
      return;
    }
    if (!ordenForm.nombre_anunciante.trim()) {
      setErrorForm('El nombre del anunciante es obligatorio.');
      return;
    }
    if (!ordenForm.periodo_desde || !ordenForm.periodo_hasta) {
      setErrorForm('Elegí el período de la campaña.');
      return;
    }
    if (!(montoNeto >= 0)) {
      setErrorForm('El monto neto no puede ser negativo.');
      return;
    }

    const productosValidos = lineasProductos.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    if (productosValidos.length === 0) {
      setErrorForm('Agregá al menos un producto/soporte.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    try {
      const payload = {
          tipo_anunciante: ordenForm.tipo_anunciante,
          nombre_anunciante: ordenForm.nombre_anunciante,
          numero_orden_agencia: ordenForm.numero_orden_agencia || undefined,
          incluir_numero_orden_agencia: ordenForm.incluir_numero_orden_agencia,
          leyenda_factura: ordenForm.leyenda_factura.trim() || undefined,
          cliente_id: ordenForm.cliente_id,
          agencia_id: ordenForm.agencia_id || undefined,
          vendedor_id: ordenForm.vendedor_id || undefined,
          periodo_desde: ordenForm.periodo_desde,
          periodo_hasta: ordenForm.periodo_hasta,
          fecha_facturacion: ordenForm.fecha_facturacion || ordenForm.periodo_hasta,
          email_contacto: ordenForm.email_contacto,
          costo_produccion: Number(ordenForm.costo_produccion) || 0,
          monto_neto: montoNeto,
          descuento_porcentaje: Number(ordenForm.descuento_porcentaje) || 0,
          descuento_en_cascada: ordenForm.descuento_en_cascada,
          descuento_facturas_porcentaje: Number(ordenForm.descuento_facturas_porcentaje) || 0,
          descuento_facturas_en_cascada: ordenForm.descuento_facturas_en_cascada,
          mes_ingreso: ordenForm.mes_ingreso ? Number(ordenForm.mes_ingreso) : undefined,
          ano_ingreso: ordenForm.ano_ingreso ? Number(ordenForm.ano_ingreso) : undefined,
          facturado: ordenForm.facturado,
          notas: ordenForm.notas,
          vigencia_hasta_nota: ordenForm.vigencia_hasta_nota.trim() || undefined,
          detalles_productos: productosValidos.map((l) => ({
            id: l.id || undefined,
            producto_id: l.producto_id,
            cantidad: Number(l.cantidad),
            ubicacion: l.ubicacion,
            especificaciones: l.especificaciones,
            locacion_id: l.locacion_id || undefined,
            punto_instalacion: l.punto_instalacion || undefined,
            precio: Number(l.precio) || 0,
          })),
          emails_contacto: lineasEmails.filter((l) => l.email.trim()),
          intermediarios: lineasIntermediarios
            .filter((l) => l.intermediario_id)
            .map((l) => ({
              intermediario_id: l.intermediario_id,
              porcentaje_comision: Number(l.porcentaje_comision) || 0,
              tipo_calculo: l.tipo_calculo,
              factura_formal: l.factura_formal,
            })),
          arreglos_no_registrables: lineasArreglos
            .filter((l) => l.descripcion.trim())
            .map((l) => ({
              tipo: l.tipo,
              descripcion: l.descripcion,
              monto: Number(l.monto) || 0,
              tercero_nombre: l.tercero_nombre,
            })),
      };

      if (editandoOrdenId) {
        await axios.put(`/api/ordenes-publicidad/${editandoOrdenId}`, payload, authHeaders(token));
        setMostrarForm(false);
        cargarOrdenes();
        cargarDetalle(editandoOrdenId);
        setEditandoOrdenId(null);
      } else {
        await axios.post('/api/ordenes-publicidad', payload, authHeaders(token));
        setMostrarForm(false);
        cargarOrdenes();
      }
    } catch (err: any) {
      setErrorForm(mensajeError(err, editandoOrdenId ? 'No se pudo guardar los cambios de la orden.' : 'No se pudo crear la orden.'));
    } finally {
      setGuardando(false);
    }
  };

  const cargarDetalle = (id: string) => {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    setErrorFacturas('');
    setMensajeFacturas('');
    setErrorDocumento('');
    setDescripcionDocumento('');
    axios
      .get(`/api/ordenes-publicidad/${id}`, authHeaders(token))
      .then((res) => setDetalle(res.data))
      .catch((err) => setErrorDetalle(mensajeError(err, 'No se pudo cargar la orden.')))
      .finally(() => setCargandoDetalle(false));
  };

  // Acceso directo desde Liquidaciones: si llega un id (vía "Ver orden" en
  // esa pantalla), lo abre acá y avisa para que el padre limpie el pedido.
  useEffect(() => {
    if (ordenIdParaAbrir) {
      cargarDetalle(ordenIdParaAbrir);
      onOrdenAbierta?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenIdParaAbrir]);

  const handleGenerarFacturas = async () => {
    if (!detalleId) return;
    setGenerandoFacturas(true);
    setErrorFacturas('');
    try {
      const res = await axios.post(`/api/ordenes-publicidad/${detalleId}/facturas`, {}, authHeaders(token));
      cargarDetalle(detalleId);
      cargarOrdenes();
      setMensajeFacturas(res.data?.message || 'Facturas generadas.');
    } catch (err: any) {
      setErrorFacturas(mensajeError(err, 'No se pudieron generar las facturas.'));
    } finally {
      setGenerandoFacturas(false);
    }
  };

  const handleSubirDocumento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detalleId) return;

    const archivo = inputArchivoRef.current?.files?.[0];
    if (!archivo) {
      setErrorDocumento('Elegí un archivo primero.');
      return;
    }

    const formData = new FormData();
    formData.append('archivo', archivo);
    if (descripcionDocumento) formData.append('descripcion', descripcionDocumento);

    setSubiendoDocumento(true);
    setErrorDocumento('');

    try {
      await axios.post(`/api/ordenes-publicidad/${detalleId}/documentos/subir`, formData, {
        headers: { ...authHeaders(token).headers, 'Content-Type': 'multipart/form-data' },
      });
      setDescripcionDocumento('');
      if (inputArchivoRef.current) inputArchivoRef.current.value = '';
      cargarDetalle(detalleId);
    } catch (err: any) {
      setErrorDocumento(mensajeError(err, 'No se pudo subir el archivo.'));
    } finally {
      setSubiendoDocumento(false);
    }
  };

  const handleDescargarDocumento = (docId: string, nombreArchivo: string) => {
    axios
      .get(`/api/ordenes-publicidad/documentos/${docId}/descargar`, {
        ...authHeaders(token),
        responseType: 'blob',
      })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', nombreArchivo);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => setErrorDocumento('No se pudo descargar el archivo.'));
  };

  const handleCambiarEstado = async (nuevoEstado: string) => {
    if (!detalleId) return;
    setCambiandoEstado(true);
    try {
      await axios.put(`/api/ordenes-publicidad/${detalleId}/estado`, { nuevoEstado }, authHeaders(token));
      cargarDetalle(detalleId);
      cargarOrdenes();
    } catch (err: any) {
      setErrorDetalle(mensajeError(err, 'No se pudo cambiar el estado.'));
    } finally {
      setCambiandoEstado(false);
    }
  };

  if (detalleId) {
    const replicaciones = detalle?.replicaciones || [];
    const pendientes = replicaciones.filter((r: any) => r.estado === 'Pendiente').length;

    // Una orden puede tener líneas en varias locaciones de distintos
    // concesionarios (hasta 11 se vieron en los datos reales) — se ofrece
    // un acceso directo por cada concesionario distinto que aparezca acá,
    // no uno solo. El mes usado es el de ingreso de la orden (o el de
    // inicio del período si no hay mes de ingreso cargado).
    const concesionariosDeLaOrden: { id: string; nombre: string }[] = detalle
      ? Array.from(
          new Map<string, { id: string; nombre: string }>(
            (detalle.detalles || [])
              .filter((d: any) => d.concesionario_id)
              .map((d: any) => [d.concesionario_id, { id: d.concesionario_id, nombre: d.concesionario_nombre }])
          ).values()
        )
      : [];
    const [anoPeriodo, mesPeriodo] = detalle?.periodo_desde ? detalle.periodo_desde.split('-') : [];
    const mesLiquidacion = detalle?.mes_ingreso ? String(detalle.mes_ingreso) : mesPeriodo;
    const anoLiquidacion = detalle?.ano_ingreso ? String(detalle.ano_ingreso) : anoPeriodo;

    return (
      <>
        <div className="view-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
          {puedeEditar && detalle && (
            <button className="btn-secondary" onClick={handleEditarOrden}>
              Editar orden
            </button>
          )}
          {puedeVerLiquidaciones &&
            onVerLiquidacion &&
            mesLiquidacion &&
            anoLiquidacion &&
            concesionariosDeLaOrden.length === 1 && (
              <button
                className="btn-link"
                onClick={() => onVerLiquidacion(concesionariosDeLaOrden[0].id, mesLiquidacion, anoLiquidacion)}
              >
                Ver liquidación de {concesionariosDeLaOrden[0].nombre}
              </button>
            )}
          {/* Una orden puede tocar muchos concesionarios a la vez (hasta 11 en
              datos reales) — con más de uno, un botón por cada uno rompía el
              layout del encabezado, así que se junta en un desplegable. */}
          {puedeVerLiquidaciones &&
            onVerLiquidacion &&
            mesLiquidacion &&
            anoLiquidacion &&
            concesionariosDeLaOrden.length > 1 && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal' }}>
                Ver liquidación de
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onVerLiquidacion(e.target.value, mesLiquidacion, anoLiquidacion);
                  }}
                >
                  <option value="">Elegir concesionario ({concesionariosDeLaOrden.length})...</option>
                  {concesionariosDeLaOrden.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
        </div>

        {cargandoDetalle && <p className="empty-state">Cargando orden...</p>}
        {errorDetalle && <div className="error-message">{errorDetalle}</div>}

        {detalle && (
          <>
            <h2 className="detalle-titulo">
              {detalle.numero_orden}{' '}
              <span className={`estado-badge estado-${detalle.estado.toLowerCase()}`}>{detalle.estado}</span>
            </h2>

            <dl className="detalle-grid">
              {detalle.estado === 'Facturada' && (
                <>
                  <dt>N° Factura Colppy</dt>
                  <dd>{renderCampoColppy(detalle, 'factura')}</dd>

                  <dt>N° NC Colppy</dt>
                  <dd>{renderCampoColppy(detalle, 'nc')}</dd>

                  <dt>N° Factura (sistema)</dt>
                  <dd>
                    {replicaciones.filter((r: any) => r.factura_numero).length > 0 ? (
                      replicaciones
                        .filter((r: any) => r.factura_numero)
                        .map((r: any) => `${r.factura_numero} (${r.numero_mes}/${r.ano})`)
                        .join(', ')
                    ) : (
                      <span className="estado-badge estado-pendiente">Pendiente</span>
                    )}
                  </dd>
                </>
              )}

              {!esOrdenFacturado(detalle) && (
                <>
                  <dt>Cobrado</dt>
                  <dd>
                    {puedeEditar ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!detalle.cobrado}
                          onChange={(e) => handleCambiarCobro(detalle, e.target.checked)}
                          disabled={guardandoCobroId === detalle.id}
                        />
                        {detalle.cobrado ? `Sí, el ${formatFecha(detalle.fecha_cobro)}` : 'Todavía no'}
                      </label>
                    ) : detalle.cobrado ? (
                      `Sí, el ${formatFecha(detalle.fecha_cobro)}`
                    ) : (
                      'Todavía no'
                    )}
                  </dd>
                </>
              )}

              <dt>Anunciante</dt>
              <dd>{detalle.nombre_anunciante} ({detalle.razon_social})</dd>

              {detalle.numero_orden_agencia && (
                <>
                  <dt>Número de orden (agencia)</dt>
                  <dd>
                    {detalle.numero_orden_agencia}
                    {!detalle.incluir_numero_orden_agencia && ' (no se incluye en la factura)'}
                  </dd>
                </>
              )}

              <dt>Leyenda en la factura</dt>
              <dd>
                {detalle.leyenda_factura ||
                  (detalle.incluir_numero_orden_agencia && detalle.numero_orden_agencia
                    ? `Exhibición publicidad S/ OP ${detalle.numero_orden_agencia}`
                    : 'Exhibición publicidad (automática, según fechas de cada mes)')}
              </dd>

              <dt>Tipo de anunciante</dt>
              <dd>{detalle.tipo_anunciante}</dd>

              <dt>Período</dt>
              <dd>{formatFecha(detalle.periodo_desde)} — {formatFecha(detalle.periodo_hasta)}</dd>

              {detalle.vigencia_hasta_nota && (
                <>
                  <dt>Vigencia hasta</dt>
                  <dd>{detalle.vigencia_hasta_nota}</dd>
                </>
              )}

              <dt>Mes de ingreso (venta)</dt>
              <dd>
                {detalle.mes_ingreso ? NOMBRES_MES[detalle.mes_ingreso - 1] : '-'} {detalle.ano_ingreso || ''}
              </dd>

              <dt>Se factura al cliente</dt>
              <dd><strong>{formatMoney(detalle.monto_neto)}</strong> + IVA (el bruto de la pauta)</dd>

              <dt>Descuento comercial (NC)</dt>
              <dd>{detalle.descuento_porcentaje}% ({formatMoney(detalle.descuento_monto)})</dd>

              <dt>Descuento facturas (FC)</dt>
              <dd>
                {detalle.descuento_facturas_porcentaje}% ({formatMoney(detalle.descuento_facturas_monto)}) —{' '}
                {detalle.descuento_facturas_en_cascada ? 'en cascada sobre el remanente' : 'directo sobre el bruto'}
              </dd>

              <dt>Neto Topview (después de NC/FC y comisiones)</dt>
              <dd>{formatMoney(detalle.monto_final)}</dd>
            </dl>

            {puedeEditar && (
              <div className="form-group" style={{ maxWidth: 240, marginBottom: '1.5rem' }}>
                <label htmlFor="cambiar_estado">Cambiar estado</label>
                <select
                  id="cambiar_estado"
                  value={detalle.estado}
                  onChange={(e) => handleCambiarEstado(e.target.value)}
                  disabled={cambiandoEstado}
                >
                  {estadosDisponibles(detalle).map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <h3 className="reportes-subtitulo">Productos / soportes</h3>
            {detalle.detalles.length === 0 ? (
              <p className="empty-state">Sin productos cargados.</p>
            ) : (
              (() => {
                // Se agrupa por locación (colapsable) para no repetir el
                // mismo lugar en cada línea — lo que no tiene locación
                // cargada (texto libre viejo) queda en una tabla aparte, sin
                // agrupar, para no perder ni inventar nada.
                const conLocacion = detalle.detalles.filter((d: any) => d.locacion_id);
                const sinLocacion = detalle.detalles.filter((d: any) => !d.locacion_id);
                const porLocacion = new Map<string, { nombre: string; items: any[] }>();
                conLocacion.forEach((d: any) => {
                  if (!porLocacion.has(d.locacion_id)) porLocacion.set(d.locacion_id, { nombre: d.locacion_nombre, items: [] });
                  porLocacion.get(d.locacion_id)!.items.push(d);
                });
                return (
                  <>
                    {Array.from(porLocacion.entries()).map(([locId, grupo]) => (
                      <details key={locId} style={{ border: '1px solid #eee', borderRadius: '6px', padding: '0 0.75rem', marginBottom: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer', padding: '0.6rem 0', listStyle: 'none' }}>
                          <strong>{grupo.nombre}</strong> — {grupo.items.length} ítem{grupo.items.length > 1 ? 's' : ''}
                        </summary>
                        <table className="data-table" style={{ marginBottom: '0.75rem' }}>
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Cantidad</th>
                              <th>Posición</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.items.map((d: any) => (
                              <tr key={d.id}>
                                <td>{d.tipo_producto}</td>
                                <td>{d.cantidad}</td>
                                <td>{d.punto_instalacion || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    ))}
                    {sinLocacion.length > 0 && (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Ubicación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sinLocacion.map((d: any) => (
                            <tr key={d.id}>
                              <td>{d.tipo_producto}</td>
                              <td>{d.cantidad}</td>
                              <td>{d.ubicacion || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                );
              })()
            )}

            {detalle.arreglos_no_registrables && detalle.arreglos_no_registrables.length > 0 && (
              <>
                <h3 className="reportes-subtitulo">Arreglos no registrables</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Con quién</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.arreglos_no_registrables.map((a: any) => (
                      <tr key={a.id}>
                        <td>{a.descripcion || '-'}</td>
                        <td>{a.tercero_nombre || '-'}</td>
                        <td>{formatMoney(a.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h3 className="reportes-subtitulo">Documentos</h3>
            {errorDocumento && <div className="error-message">{errorDocumento}</div>}

            {(!detalle.documentos || detalle.documentos.length === 0) ? (
              <p className="empty-state">Todavía no hay documentos adjuntos a esta orden.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.documentos.map((d: any) => (
                    <tr key={d.id}>
                      <td>{d.nombre_archivo}</td>
                      <td>{d.descripcion || '-'}</td>
                      <td>{formatFecha(d.fecha_carga)}</td>
                      <td>
                        {d.ruta_archivo ? (
                          <button className="btn-link" onClick={() => handleDescargarDocumento(d.id, d.nombre_archivo)}>
                            Descargar
                          </button>
                        ) : d.url_drive ? (
                          <a href={d.url_drive} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {puedeEditar && (
              <form className="cliente-form" onSubmit={handleSubirDocumento} style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="doc_archivo">Subir un archivo (PDF, Word, Excel o imagen — máx. 15MB)</label>
                  <input id="doc_archivo" type="file" ref={inputArchivoRef} disabled={subiendoDocumento} />
                </div>
                <div className="form-group">
                  <label htmlFor="doc_descripcion">Descripción (opcional)</label>
                  <input
                    id="doc_descripcion"
                    value={descripcionDocumento}
                    onChange={(e) => setDescripcionDocumento(e.target.value)}
                    disabled={subiendoDocumento}
                  />
                </div>
                <div className="cliente-form-actions">
                  <button type="submit" className="btn-primary" disabled={subiendoDocumento}>
                    {subiendoDocumento ? 'Subiendo...' : 'Subir documento'}
                  </button>
                </div>
              </form>
            )}

            <h3 className="reportes-subtitulo">Facturación mensual</h3>
            {!esOrdenFacturado(detalle) ? (
              <p className="empty-state">
                Esta orden es no registrada (no genera facturación) — no aplica facturación mensual interna. El cobro
                se trackea arriba, en "Cobrado".
              </p>
            ) : (
              <>
                {errorFacturas && <div className="error-message">{errorFacturas}</div>}
                {mensajeFacturas && <div className="success-message">{mensajeFacturas}</div>}
                {replicaciones.length === 0 ? (
                  <p className="empty-state">No hay meses de facturación generados para esta orden.</p>
                ) : (
                  <>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mes</th>
                          <th>Año</th>
                          <th>Estado (factura interna)</th>
                          <th title="Estado general de la orden contra Colppy — es el mismo para todos los meses, no es por mes">
                            Colppy
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {replicaciones.map((r: any) => (
                          <tr key={r.id}>
                            <td>{r.numero_mes}</td>
                            <td>{r.ano}</td>
                            <td>
                              <span className={`estado-badge estado-${r.estado.toLowerCase()}`}>{r.estado}</span>
                            </td>
                            <td>
                              <span className={`estado-badge estado-${detalle.estado.toLowerCase()}`}>{detalle.estado}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {replicaciones.some((r: any) => r.estado === 'Generada') && detalle.estado === 'Facturada' && (
                      <p className="empty-state" style={{ color: '#b45309' }}>
                        Atención: esta orden tiene factura interna generada Y está marcada "Facturada" en Colppy —
                        revisar que no se haya facturado dos veces.
                      </p>
                    )}

                    {puedeEditar && pendientes > 0 && (
                      <button
                        className="btn-primary"
                        style={{ marginTop: '1rem' }}
                        onClick={handleGenerarFacturas}
                        disabled={generandoFacturas}
                      >
                        {generandoFacturas ? 'Generando...' : `Generar ${pendientes} factura(s) pendiente(s)`}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </>
    );
  }

  // Soportes físicos de Topview (excluye el "Servicio de Publicidad Exterior",
  // que es el placeholder genérico de facturación, no un soporte vendible) —
  // una columna por soporte en la lista, reflejando la planilla de referencia.
  const productosSoportes = (productos || []).filter(
    (p) => p.tipo === 'fisico' && p.codigo !== 'SOP-STAND' && p.codigo !== 'SOP-VARIOS'
  );

  const calcularTotales = (lista: OrdenPublicidad[]) =>
    lista.reduce(
      (acc, o) => {
        const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_facturas_monto || 0);
        acc.montoNeto += o.monto_neto || 0;
        acc.netoBlanco += netoBlanco;
        acc.montoFinal += o.monto_final || 0;
        productosSoportes.forEach((p) => {
          acc.porProducto[p.id] = (acc.porProducto[p.id] || 0) + (o.cantidades_por_producto?.[p.id] || 0);
        });
        return acc;
      },
      { montoNeto: 0, netoBlanco: 0, montoFinal: 0, porProducto: {} as Record<string, number> }
    );

  const totalesFila = calcularTotales(ordenesFiltradas);

  // Desglose fijo (no depende del selector "Facturación", que solo recorta
  // filas visibles) — para poder ver siempre por separado lo que sí entra al
  // circuito fiscal de lo que no, y la suma de los dos.
  const ordenesRegistradas = ordenesFiltradasBase.filter(esOrdenFacturado);
  const ordenesNoRegistradas = ordenesFiltradasBase.filter((o) => !esOrdenFacturado(o));
  const totalesRegistrado = calcularTotales(ordenesRegistradas);
  const totalesNoRegistrado = calcularTotales(ordenesNoRegistradas);
  const noRegistradasCobradas = ordenesNoRegistradas.filter((o) => !!o.cobrado);
  const noRegistradasPendientes = ordenesNoRegistradas.filter((o) => !o.cobrado);
  const totalesNoRegistradoCobrado = calcularTotales(noRegistradasCobradas);
  const totalesNoRegistradoPendiente = calcularTotales(noRegistradasPendientes);

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button
            className="btn-primary"
            onClick={
              mostrarForm
                ? () => {
                    setMostrarForm(false);
                    setEditandoOrdenId(null);
                  }
                : handleNueva
            }
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva orden'}
          </button>
        )}
      </div>

      {error && ordenes && ordenes.length > 0 && <div className="error-message">{error}</div>}

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {editandoOrdenId && (
            <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem', fontWeight: 600 }}>
              Editando orden existente — las facturas ya generadas no se modifican.
            </div>
          )}
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="orden_cliente">Cliente * (a quien se factura)</label>
            <select
              id="orden_cliente"
              value={ordenForm.cliente_id}
              onChange={(e) => handleChangeCliente(e.target.value)}
              disabled={guardando}
            >
              <option value="">
                {clientes === null ? 'Cargando...' : clientes.length === 0 ? 'No hay clientes cargados' : 'Elegir cliente'}
              </option>
              {(clientes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="orden_tipo">Tipo de anunciante</label>
            <select
              id="orden_tipo"
              value={ordenForm.tipo_anunciante}
              onChange={(e) => handleChangeOrden('tipo_anunciante', e.target.value)}
              disabled={guardando}
            >
              {(tiposAnunciantes.length > 0 ? tiposAnunciantes.map((t) => t.nombre) : TIPOS_ANUNCIANTE).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="orden_anunciante">Nombre del anunciante *</label>
            <input
              id="orden_anunciante"
              value={ordenForm.nombre_anunciante}
              onChange={(e) => handleChangeOrden('nombre_anunciante', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="orden_numero_agencia">Número de orden (agencia)</label>
            <input
              id="orden_numero_agencia"
              value={ordenForm.numero_orden_agencia}
              onChange={(e) => handleChangeOrden('numero_orden_agencia', e.target.value)}
              placeholder="Ej: 202608-0296"
              disabled={guardando}
            />
            <label htmlFor="orden_incluir_numero_agencia" style={{ fontWeight: 'normal', display: 'block', marginTop: '0.4rem' }}>
              <input
                id="orden_incluir_numero_agencia"
                type="checkbox"
                checked={ordenForm.incluir_numero_orden_agencia}
                onChange={(e) => handleChangeOrden('incluir_numero_orden_agencia', e.target.checked)}
                disabled={guardando}
              />
              {' '}Incluir este N° de orden en el detalle de la factura
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="orden_leyenda_factura">Leyenda para el detalle de la factura (opcional)</label>
            <input
              id="orden_leyenda_factura"
              value={ordenForm.leyenda_factura}
              onChange={(e) => handleChangeOrden('leyenda_factura', e.target.value)}
              placeholder="Se sugiere automáticamente, dejalo vacío para usarla"
              disabled={guardando}
            />
            <p className="totales-preview">
              Así va a quedar en la factura de este mes:{' '}
              <strong>
                {ordenForm.leyenda_factura.trim()
                  ? ordenForm.leyenda_factura.trim()
                  : ordenForm.incluir_numero_orden_agencia && ordenForm.numero_orden_agencia
                  ? `Exhibición publicidad S/ OP ${ordenForm.numero_orden_agencia}`
                  : ordenForm.periodo_desde && ordenForm.periodo_hasta
                  ? `Exhibición publicidad ${ordenForm.periodo_desde.split('-')[2]}-${ordenForm.periodo_desde.split('-')[1]} a ${ordenForm.periodo_hasta.split('-')[2]}-${ordenForm.periodo_hasta.split('-')[1]}`
                  : 'Exhibición publicidad (elegí el período)'}
              </strong>
              {!ordenForm.leyenda_factura.trim() &&
                !(ordenForm.incluir_numero_orden_agencia && ordenForm.numero_orden_agencia) && (
                  <> — se recalcula solo con las fechas de cada mes en las facturas siguientes.</>
                )}
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="orden_vendedor">Vendedor (opcional)</label>
            <select
              id="orden_vendedor"
              value={ordenForm.vendedor_id}
              onChange={(e) => handleChangeOrden('vendedor_id', e.target.value)}
              disabled={guardando}
            >
              <option value="">Sin vendedor asignado</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="lineas-factura">
              <label>Contactos (emails a los que se les envía la factura)</label>
              {lineasEmails.map((linea, i) => (
                <div className="linea-factura" key={i} style={{ gridTemplateColumns: '1fr auto' }}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={linea.email}
                    onChange={(e) => handleChangeEmail(i, 'email', e.target.value)}
                    disabled={guardando}
                  />
                  {lineasEmails.length > 1 && (
                    <button
                      type="button"
                      className="btn-link btn-link-danger"
                      onClick={() => handleQuitarEmail(i)}
                      disabled={guardando}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-link" onClick={handleAgregarEmail} disabled={guardando}>
                + Agregar contacto
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="orden_vigencia_hasta">Vigencia hasta (nota libre, opcional)</label>
              <input
                id="orden_vigencia_hasta"
                value={ordenForm.vigencia_hasta_nota}
                onChange={(e) => handleChangeOrden('vigencia_hasta_nota', e.target.value)}
                disabled={guardando}
                placeholder='Ej: "Diciembre" o "Noviembre (oct y nov 2.8M)"'
              />
              <small>Hasta qué mes seguís facturando esta pauta — es solo una referencia, no dispara nada automático.</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="orden_tiene_agencia">
              <input
                id="orden_tiene_agencia"
                type="checkbox"
                checked={mostrarAgencia}
                onChange={(e) => {
                  setMostrarAgencia(e.target.checked);
                  if (!e.target.checked) handleChangeOrden('agencia_id', '');
                }}
                disabled={guardando}
              />
              {' '}Interviene una agencia distinta del cliente facturado (caso puntual)
            </label>
            {mostrarAgencia && (
              <>
                <select
                  id="orden_agencia"
                  value={ordenForm.agencia_id}
                  onChange={(e) => handleChangeOrden('agencia_id', e.target.value)}
                  disabled={guardando}
                  style={{ marginTop: '0.5rem' }}
                >
                  <option value="">Elegir agencia</option>
                  {agencias.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
                {clientes?.find((c) => c.id === ordenForm.cliente_id)?.agencia_id && (
                  <small className="ayuda-error" style={{ color: '#666' }}>
                    Autocompletada porque el cliente elegido ya es esta agencia. Cambiala si el caso puntual es otro.
                  </small>
                )}
              </>
            )}
          </div>

          {condicionesAgencia.length > 0 && (
            <div className="form-group">
              <label htmlFor="orden_condicion_agencia">Condición de descuento de la agencia</label>
              <select
                id="orden_condicion_agencia"
                value={condicionAgenciaId}
                onChange={(e) => handleAplicarCondicionAgencia(e.target.value)}
                disabled={guardando}
              >
                <option value="">Cargar % a mano</option>
                {condicionesAgencia.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} (NC {c.porcentaje_nc}% / Factura {c.porcentaje_factura}%)
                  </option>
                ))}
              </select>
              <small className="ayuda-error" style={{ color: '#666' }}>
                Completa los % de abajo con la condición guardada — podés cambiarlos para este caso puntual.
              </small>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="orden_desde">Período desde *</label>
              <input
                id="orden_desde"
                type="date"
                value={ordenForm.periodo_desde}
                onChange={(e) => handleChangeOrden('periodo_desde', e.target.value)}
                disabled={guardando}
              />
            </div>

            <div className="form-group">
              <label htmlFor="orden_hasta">Período hasta *</label>
              <input
                id="orden_hasta"
                type="date"
                value={ordenForm.periodo_hasta}
                onChange={(e) => handleChangeOrden('periodo_hasta', e.target.value)}
                disabled={guardando}
              />
            </div>

            <div className="form-group">
              <label htmlFor="orden_fecha_facturacion">Fecha de facturación</label>
              <input
                id="orden_fecha_facturacion"
                type="date"
                value={ordenForm.fecha_facturacion}
                onChange={(e) => handleChangeOrden('fecha_facturacion', e.target.value)}
                disabled={guardando}
              />
              <small className="ayuda-error" style={{ color: '#666' }}>
                Manual. Vacía = "Período hasta".
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="orden_mes_ingreso">Mes de ingreso (venta)</label>
              <select
                id="orden_mes_ingreso"
                value={ordenForm.mes_ingreso}
                onChange={(e) => handleChangeOrden('mes_ingreso', e.target.value)}
                disabled={guardando}
              >
                <option value="">
                  {ordenForm.periodo_desde
                    ? `Por defecto: ${NOMBRES_MES[Number(ordenForm.periodo_desde.split('-')[1]) - 1]}`
                    : 'Por defecto: mes de "Período desde"'}
                </option>
                {NOMBRES_MES.map((nombre, i) => (
                  <option key={nombre} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="orden_ano_ingreso">Año de ingreso</label>
              <input
                id="orden_ano_ingreso"
                type="number"
                placeholder={ordenForm.periodo_desde ? ordenForm.periodo_desde.split('-')[0] : 'Año'}
                value={ordenForm.ano_ingreso}
                onChange={(e) => handleChangeOrden('ano_ingreso', e.target.value)}
                disabled={guardando}
              />
              <small className="ayuda-error" style={{ color: '#666' }}>
                Mes/año a efectos comerciales — puede diferir del período de vigencia.
              </small>
            </div>
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Productos / soportes *</label>
            {lineasProductos.map((linea, i) => {
              const locacionElegida = locaciones.find((loc) => loc.id === linea.locacion_id);
              const soporteEnLocacion = (locacionElegida?.soportes || []).find((s: any) => s.producto_id === linea.producto_id);
              const puntosDisponibles = soporteEnLocacion?.puntos || [];
              return (
              <div className="linea-factura" key={i} style={{ gridTemplateColumns: '1.8fr 70px 1.3fr 1.2fr 1fr 1.6fr auto' }}>
                <select
                  value={linea.producto_id}
                  onChange={(e) => handleChangeProducto(i, 'producto_id', e.target.value)}
                  disabled={guardando}
                >
                  <option value="">
                    {productos === null
                      ? 'Cargando...'
                      : productos.length === 0
                      ? 'No hay productos cargados'
                      : 'Elegir producto'}
                  </option>
                  {(productos || [])
                    .filter((p) => p.tipo !== 'servicio')
                    .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Cantidad"
                  value={linea.cantidad}
                  onChange={(e) => handleChangeProducto(i, 'cantidad', e.target.value)}
                  disabled={guardando}
                />
                <select
                  value={linea.locacion_id}
                  onChange={(e) => handleChangeProducto(i, 'locacion_id', e.target.value)}
                  disabled={guardando}
                  title="Locación (catálogo)"
                >
                  <option value="">Sin locación</option>
                  {locaciones.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={linea.punto_instalacion}
                  onChange={(e) => handleChangeProducto(i, 'punto_instalacion', e.target.value)}
                  disabled={guardando || puntosDisponibles.length === 0}
                  title="Posición"
                >
                  <option value="">{puntosDisponibles.length === 0 ? 'Sin posiciones' : 'Elegir posición'}</option>
                  {puntosDisponibles.map((p: any) => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <InputMiles
                  placeholder="Precio ($)"
                  value={linea.precio}
                  onChange={(v) => handleChangeProducto(i, 'precio', v)}
                  disabled={guardando}
                />
                <input
                  type="text"
                  placeholder="Nota de ubicación (opcional)"
                  value={linea.ubicacion}
                  onChange={(e) => handleChangeProducto(i, 'ubicacion', e.target.value)}
                  disabled={guardando}
                />
                {lineasProductos.length > 1 && (
                  <button
                    type="button"
                    className="btn-link btn-link-danger"
                    onClick={() => handleQuitarProducto(i)}
                    disabled={guardando}
                  >
                    Quitar
                  </button>
                )}
              </div>
              );
            })}
            <button type="button" className="btn-link" onClick={handleAgregarProducto} disabled={guardando}>
              + Agregar producto
            </button>
          </div>

          <div className="form-group form-group-checkbox">
            <label htmlFor="orden_facturado">
              <input
                id="orden_facturado"
                type="checkbox"
                checked={ordenForm.facturado}
                onChange={(e) => handleChangeOrden('facturado', e.target.checked)}
                disabled={guardando}
              />
              {' '}Esta orden genera facturación
            </label>
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Montos y descuentos en cascada</label>

            <div className="linea-factura" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <InputMiles
                placeholder="Monto neto (vacío = suma de líneas)"
                value={ordenForm.monto_neto}
                onChange={(v) => handleChangeOrden('monto_neto', v)}
                disabled={guardando}
              />
              <InputPorcentaje
                placeholder="Descuento comercial (NC)"
                value={ordenForm.descuento_porcentaje}
                onChange={(v) => handleChangeOrden('descuento_porcentaje', v)}
                disabled={guardando}
              />
              <InputPorcentaje
                placeholder="Descuento facturas (FC)"
                value={ordenForm.descuento_facturas_porcentaje}
                onChange={(v) => handleChangeOrden('descuento_facturas_porcentaje', v)}
                disabled={guardando}
              />
            </div>
            <small style={{ color: '#666' }}>
              "Monto neto" es solo la exhibición. La producción (impresión, colocación, cambio o reposición de
              gráfica) se carga como su propia orden en "Órdenes de Producción", no acá. Si lo dejás vacío, se arma
              solo sumando el precio de cada línea en "Productos / soportes" de arriba.
            </small>

            <label htmlFor="orden_desc_cascada" style={{ fontWeight: 'normal', marginTop: '0.5rem', display: 'block' }}>
              <input
                id="orden_desc_cascada"
                type="checkbox"
                checked={ordenForm.descuento_en_cascada}
                onChange={(e) => handleChangeOrden('descuento_en_cascada', e.target.checked)}
                disabled={guardando}
              />
              {' '}Descuento comercial en cascada (reduce la base antes de calcular el de facturas — solo importa si además el de facturas está en cascada más abajo; si no, da lo mismo tildado o no)
            </label>

            <label htmlFor="orden_desc_facturas_cascada" style={{ fontWeight: 'normal', marginTop: '0.5rem', display: 'block' }}>
              <input
                id="orden_desc_facturas_cascada"
                type="checkbox"
                checked={ordenForm.descuento_facturas_en_cascada}
                onChange={(e) => handleChangeOrden('descuento_facturas_en_cascada', e.target.checked)}
                disabled={guardando}
              />
              {' '}Descuento de facturas en cascada sobre el remanente (si no, se calcula directo sobre el mismo neto que el descuento comercial — depende de lo negociado con cada agencia/cliente)
            </label>

            <p className="totales-preview">
              Monto neto: {formatMoney(montoNeto)} · Menos desc. comercial: -{formatMoney(descuentoMonto)} · Menos
              desc. facturas: -{formatMoney(descuentoFacturasMonto)} · Monto final:{' '}
              <strong>{formatMoney(montoFinal)}</strong>
            </p>
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Comisionistas</label>
            {lineasIntermediarios.map((linea, i) => (
              <div className="linea-factura" key={i} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
                <select
                  value={linea.intermediario_id}
                  onChange={(e) => handleChangeIntermediario(i, 'intermediario_id', e.target.value)}
                  disabled={guardando}
                >
                  <option value="">Elegir comisionista</option>
                  {intermediarios.map((int) => (
                    <option key={int.id} value={int.id}>
                      {int.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="% comisión"
                  value={linea.porcentaje_comision}
                  onChange={(e) => handleChangeIntermediario(i, 'porcentaje_comision', e.target.value)}
                  disabled={guardando}
                />
                <select
                  value={linea.tipo_calculo}
                  onChange={(e) => handleChangeIntermediario(i, 'tipo_calculo', e.target.value)}
                  disabled={guardando}
                >
                  <option value="cascada">Cascada</option>
                  <option value="base">Directo</option>
                </select>
                <select
                  value={linea.factura_formal ? 'tipo1' : 'tipo2'}
                  onChange={(e) => handleChangeFacturaFormalIntermediario(i, e.target.value === 'tipo1')}
                  disabled={guardando}
                >
                  <option value="tipo1">Tipo 1 — Con factura</option>
                  <option value="tipo2">Tipo 2 — En efectivo</option>
                </select>
                <button
                  type="button"
                  className="btn-link btn-link-danger"
                  onClick={() => handleQuitarIntermediario(i)}
                  disabled={guardando}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className="btn-link" onClick={handleAgregarIntermediario} disabled={guardando}>
              + Agregar comisionista
            </button>

            {comisiones.length > 0 && (
              <p className="totales-preview">
                {comisiones.map((c, i) => (
                  <span key={i}>
                    Comisión {i + 1}: {formatMoney(c.montoComision)}
                    {i < comisiones.length - 1 ? ' · ' : ' · '}
                  </span>
                ))}
                Neto percibido: <strong>{formatMoney(montoPercibido)}</strong>
              </p>
            )}
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Arreglos no registrables (acuerdos informales que afectan el precio)</label>
            {lineasArreglos.map((linea, i) => (
              <div className="linea-factura" key={i} style={{ gridTemplateColumns: '2fr 1fr 1fr auto' }}>
                <input
                  type="text"
                  placeholder="Descripción del arreglo"
                  value={linea.descripcion}
                  onChange={(e) => handleChangeArreglo(i, 'descripcion', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="text"
                  placeholder="Con quién (tercero)"
                  value={linea.tercero_nombre}
                  onChange={(e) => handleChangeArreglo(i, 'tercero_nombre', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Monto"
                  value={linea.monto}
                  onChange={(e) => handleChangeArreglo(i, 'monto', e.target.value)}
                  disabled={guardando}
                />
                <button
                  type="button"
                  className="btn-link btn-link-danger"
                  onClick={() => handleQuitarArreglo(i)}
                  disabled={guardando}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className="btn-link" onClick={handleAgregarArreglo} disabled={guardando}>
              + Agregar arreglo no registrable
            </button>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="orden_notas">Notas internas</label>
            <input
              id="orden_notas"
              value={ordenForm.notas}
              onChange={(e) => handleChangeOrden('notas', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoOrdenId ? 'Guardar cambios' : 'Crear orden'}
            </button>
          </div>
        </form>
      )}

      {ordenes === null && !error && <p className="empty-state">Cargando órdenes...</p>}
      {error && ordenes && ordenes.length === 0 && <div className="error-message">{error}</div>}
      {ordenes && ordenes.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay órdenes cargadas.
          {puedeCrear ? ' Usá "+ Nueva orden" para crear la primera.' : ''}
        </p>
      )}

      {ordenes && ordenes.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="busqueda_ordenes">Buscar</label>
            <input
              id="busqueda_ordenes"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Cliente, anunciante, N° de orden..."
              style={{ width: '13rem' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_mes_tipo">Filtrar por</label>
            <select
              id="filtro_mes_tipo"
              value={filtroMesTipo}
              onChange={(e) => setFiltroMesTipo(e.target.value as 'facturacion' | 'ingreso')}
              style={{ width: '9.5rem' }}
            >
              <option value="facturacion">Fecha de facturación</option>
              <option value="ingreso">Mes de ingreso (venta)</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_mes">Mes</label>
            <select
              id="filtro_mes"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              style={{ width: '9rem' }}
            >
              <option value="">Todos los meses</option>
              {NOMBRES_MES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_ano">Año</label>
            <select
              id="filtro_ano"
              value={filtroAno}
              onChange={(e) => setFiltroAno(e.target.value)}
              style={{ width: '7rem' }}
            >
              <option value="">Todos los años</option>
              {anosDisponibles.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_facturado">Facturación</label>
            <select
              id="filtro_facturado"
              value={filtroFacturado}
              onChange={(e) => setFiltroFacturado(e.target.value)}
              style={{ width: '10rem' }}
            >
              <option value="">Todas</option>
              <option value="si">Solo registradas (facturables)</option>
              <option value="no">Solo no registradas</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_tipo_anunciante">Tipo de anunciante</label>
            <select
              id="filtro_tipo_anunciante"
              value={filtroTipoAnunciante}
              onChange={(e) => setFiltroTipoAnunciante(e.target.value)}
              style={{ width: '10rem' }}
            >
              <option value="">Todos</option>
              {TIPOS_ANUNCIANTE.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>
          {(filtroMes || filtroAno || busqueda || filtroFacturado || filtroTipoAnunciante || filtroMesTipo !== 'facturacion') && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setFiltroMes('');
                setFiltroAno('');
                setBusqueda('');
                setFiltroFacturado('');
                setFiltroTipoAnunciante('');
                setFiltroMesTipo('facturacion');
              }}
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {ordenes && ordenes.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={handleExportarExcel} disabled={ordenesFiltradas.length === 0}>
            Exportar Excel
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportarPDF} disabled={ordenesFiltradas.length === 0}>
            Exportar PDF
          </button>
        </div>
      )}

      {ordenes && ordenes.length > 0 && (
        <p className="empty-state" style={{ textAlign: 'left' }}>
          Registrado ({ordenesRegistradas.length} órdenes): <strong>{formatMoney(totalesRegistrado.montoNeto)}</strong>
          {' · '}
          No registrado ({ordenesNoRegistradas.length} órdenes):{' '}
          <strong>{formatMoney(totalesNoRegistrado.montoNeto)}</strong>
          {ordenesNoRegistradas.length > 0 && (
            <span style={{ fontSize: '0.85em', color: '#666' }}>
              {' '}
              (cobrado {noRegistradasCobradas.length}: {formatMoney(totalesNoRegistradoCobrado.montoNeto)} · pendiente{' '}
              {noRegistradasPendientes.length}: {formatMoney(totalesNoRegistradoPendiente.montoNeto)})
            </span>
          )}
          {' · '}
          Total general: <strong>{formatMoney(totalesRegistrado.montoNeto + totalesNoRegistrado.montoNeto)}</strong>
        </p>
      )}

      {ordenes && ordenes.length > 0 && ordenesFiltradas.length === 0 && (
        <p className="empty-state">Ninguna orden coincide con el filtro elegido.</p>
      )}

      {ordenesFiltradas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>N° orden (agencia)</th>
              <th>Cliente/Agencia</th>
              <th>Anunciante</th>
              <th>Vigencia hasta</th>
              <th>Tipo</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Fecha Fac</th>
              {productosSoportes.map((p) => (
                <th key={p.id} title={p.nombre}>
                  {p.codigo?.replace('SOP-', '') || p.nombre}
                </th>
              ))}
              <th>$ Neto s/desc</th>
              <th>% NC</th>
              <th>% FC</th>
              <th>$ Neto blanco</th>
              <th>Neto Topview (post-comisión)</th>
              <th>Estado</th>
              <th>N° Factura Colppy</th>
              <th>N° NC Colppy</th>
              <th>Cobrado</th>
              {(puedeCrear || puedeEditar) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {ordenesFiltradas.map((o) => {
              const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_facturas_monto || 0);
              return (
              <tr key={o.id}>
                <td>
                  <button className="btn-link" onClick={() => cargarDetalle(o.id)}>
                    {o.numero_orden_agencia || '(sin número)'}
                  </button>
                </td>
                <td>{o.razon_social}</td>
                <td>{o.nombre_anunciante}</td>
                <td>{o.vigencia_hasta_nota || '-'}</td>
                <td>{o.tipo_anunciante}</td>
                <td>{formatFecha(o.periodo_desde)}</td>
                <td>{formatFecha(o.periodo_hasta)}</td>
                <td>{o.fecha_facturacion ? formatFecha(o.fecha_facturacion) : '-'}</td>
                {productosSoportes.map((p) => (
                  <td key={p.id}>{o.cantidades_por_producto?.[p.id] || '-'}</td>
                ))}
                <td>{formatMoney(o.monto_neto)}</td>
                <td>{o.descuento_porcentaje ? `${o.descuento_porcentaje}%` : '-'}</td>
                <td>{o.descuento_facturas_porcentaje ? `${o.descuento_facturas_porcentaje}%` : '-'}</td>
                <td>{formatMoney(netoBlanco)}</td>
                <td>{formatMoney(o.monto_final)}</td>
                <td>
                  {puedeEditar ? (
                    <select
                      value={o.estado}
                      onChange={(e) => handleCambiarEstadoLista(o.id, e.target.value)}
                      disabled={cambiandoEstadoId === o.id}
                      className={`estado-badge estado-${o.estado.toLowerCase()}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      {estadosDisponibles(o).map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`estado-badge estado-${o.estado.toLowerCase()}`}>{o.estado}</span>
                  )}
                </td>
                <td>{o.estado === 'Facturada' ? renderCampoColppy(o, 'factura') : o.numero_factura_colppy || '-'}</td>
                <td>{o.estado === 'Facturada' ? renderCampoColppy(o, 'nc') : o.numero_nc_colppy || '-'}</td>
                <td>
                  {esOrdenFacturado(o) ? (
                    '-'
                  ) : puedeEditar ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!!o.cobrado}
                        onChange={(e) => handleCambiarCobro(o, e.target.checked)}
                        disabled={guardandoCobroId === o.id}
                      />
                      {o.cobrado ? formatFecha(o.fecha_cobro) : 'Pendiente'}
                    </label>
                  ) : o.cobrado ? (
                    `Cobrado (${formatFecha(o.fecha_cobro)})`
                  ) : (
                    'Pendiente'
                  )}
                </td>
                {(puedeCrear || puedeEditar) && (
                  <td>
                    {puedeEditar && (
                      <>
                        <button
                          className="btn-link"
                          onClick={() => handleModificarDesdeLista(o.id)}
                          disabled={modificandoId === o.id}
                        >
                          {modificandoId === o.id ? 'Abriendo...' : 'Modificar'}
                        </button>
                        {' · '}
                      </>
                    )}
                    {puedeCrear && (
                      <button
                        className="btn-link"
                        onClick={() => handleClonar(o.id)}
                        disabled={clonandoId === o.id}
                      >
                        {clonandoId === o.id ? 'Clonando...' : 'Clonar'}
                      </button>
                    )}
                    {puedeEditar && (
                      <>
                        {' · '}
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => handleEliminarOrden(o.id, o.numero_orden)}
                          disabled={eliminandoId === o.id}
                        >
                          {eliminandoId === o.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600, borderTop: '2px solid #ccc' }}>
              <td colSpan={8}>Totales ({ordenesFiltradas.length} órdenes)</td>
              {productosSoportes.map((p) => (
                <td key={p.id}>{totalesFila.porProducto[p.id] || '-'}</td>
              ))}
              <td>{formatMoney(totalesFila.montoNeto)}</td>
              <td></td>
              <td></td>
              <td>{formatMoney(totalesFila.netoBlanco)}</td>
              <td>{formatMoney(totalesFila.montoFinal)}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              {(puedeCrear || puedeEditar) && <td></td>}
            </tr>
          </tfoot>
        </table>
        </div>
      )}
    </>
  );
}

const AGENCIA_VACIA = { nombre: '', descripcion: '', contacto: '', email: '', telefono: '', proveedor_id: '', cliente_id: '' };

function AgenciasTab({ token, puedeCrear }: { token: string; puedeCrear: boolean }) {
  const [agencias, setAgencias] = useState<Agencia[] | null>(null);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; razon_social: string }[]>([]);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(AGENCIA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [vinculandoCliente, setVinculandoCliente] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');

  const cargar = () => {
    setError('');
    setAgencias(null);
    axios
      .get('/api/topview/agencias', authHeaders(token))
      .then((res) => setAgencias(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las agencias.'));
        setAgencias([]);
      });
    axios
      .get('/api/proveedores', authHeaders(token))
      .then((res) => setProveedores(res.data || []))
      .catch(() => setProveedores([]));
    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => setClientes(res.data || []))
      .catch(() => setClientes([]));
  };

  // El buscador es un input con datalist: se escribe el nombre, y cuando el
  // texto matchea exacto a un cliente de la lista se resuelve el id acá.
  const handleBuscarCliente = async (texto: string) => {
    setBusquedaCliente(texto);
    const cliente = clientes.find((c) => c.razon_social === texto);
    if (!cliente) return;

    setVinculandoCliente(true);
    setErrorForm('');
    try {
      const res = await axios.post('/api/proveedores/desde-cliente', { cliente_id: cliente.id }, authHeaders(token));
      const proveedor = res.data;
      setProveedores((prev) => (prev.some((p) => p.id === proveedor.id) ? prev : [...prev, proveedor]));
      setForm((prev) => ({ ...prev, cliente_id: cliente.id, proveedor_id: proveedor.id }));
      setBusquedaCliente('');
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo vincular el cliente.'));
    } finally {
      setVinculandoCliente(false);
    }
  };

  const handleQuitarVinculoCliente = () => {
    setForm((prev) => ({ ...prev, cliente_id: '' }));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNueva = () => {
    setForm(AGENCIA_VACIA);
    setEditandoId(null);
    setErrorForm('');
    setBusquedaCliente('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (a: any) => {
    setForm({
      nombre: a.nombre,
      descripcion: a.descripcion || '',
      contacto: a.contacto || '',
      email: a.email || '',
      telefono: a.telefono || '',
      proveedor_id: a.proveedor_id || '',
      cliente_id: a.cliente_id || '',
    });
    setEditandoId(a.id);
    setErrorForm('');
    setBusquedaCliente('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      if (editandoId) {
        await axios.put(`/api/topview/agencias/${editandoId}`, form, authHeaders(token));
      } else {
        await axios.post('/api/topview/agencias', form, authHeaders(token));
      }
      setForm(AGENCIA_VACIA);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar la agencia.'));
    } finally {
      setGuardando(false);
    }
  };

  const nombreProveedor = (id: string | null) => proveedores.find((p) => p.id === id)?.razon_social;
  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.razon_social;

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNueva}>
            {mostrarForm ? 'Cancelar' : '+ Nueva agencia'}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label>Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Contacto</label>
            <input
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="agencia_buscar_cliente">¿Esta agencia ya es cliente? Buscala y vinculá las dos fichas</label>
            <input
              id="agencia_buscar_cliente"
              list="agencia-clientes-datalist"
              value={busquedaCliente}
              onChange={(e) => handleBuscarCliente(e.target.value)}
              placeholder="Escribí para buscar por razón social..."
              disabled={guardando || vinculandoCliente}
            />
            <datalist id="agencia-clientes-datalist">
              {clientes.map((c) => (
                <option key={c.id} value={c.razon_social} />
              ))}
            </datalist>
            {form.cliente_id && (
              <p className="totales-preview">
                Vinculada a <strong>{nombreCliente(form.cliente_id)}</strong> (misma ficha de cliente) —{' '}
                <button type="button" className="btn-link" onClick={handleQuitarVinculoCliente} disabled={guardando}>
                  quitar vínculo
                </button>
              </p>
            )}
            <small className="ayuda-error" style={{ color: '#666' }}>
              Muchas agencias son también clientes (les facturamos la pauta) y cobran su comisión como proveedor —
              esto marca el tag "Agencia" en su ficha de cliente y crea (o reutiliza, por CUIT) el proveedor de abajo
              con los mismos datos.
            </small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Proveedor para facturas (opcional)</label>
            <select
              value={form.proveedor_id}
              onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
              disabled={guardando}
            >
              <option value="">Sin vincular — no genera gastos pendientes</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
            <small className="ayuda-error" style={{ color: '#666' }}>
              Si esta agencia cobra parte de su remuneración esperando su factura de servicio, vinculala a su
              proveedor para que cada orden genere el gasto pendiente automáticamente.
            </small>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar agencia'}
            </button>
          </div>
        </form>
      )}

      {agencias === null && !error && <p className="empty-state">Cargando...</p>}
      {error && agencias && agencias.length === 0 && <div className="error-message">{error}</div>}
      {agencias && agencias.length === 0 && !error && <p className="empty-state">No hay agencias cargadas.</p>}
      {agencias && agencias.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Cliente</th>
              <th>Proveedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agencias.map((a: any) => (
              <tr key={a.id}>
                <td>{a.nombre}</td>
                <td>{a.contacto || '-'}</td>
                <td>{a.email || '-'}</td>
                <td>{a.telefono || '-'}</td>
                <td>{nombreCliente(a.cliente_id) || '-'}</td>
                <td>{nombreProveedor(a.proveedor_id) || '-'}</td>
                <td>
                  {puedeCrear && (
                    <button className="btn-link" onClick={() => handleEditar(a)}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

interface OrdenComisionista {
  orden_id: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  nombre_anunciante: string;
  monto_comision: number;
  factura_formal: boolean;
  mes_ingreso: number;
  ano_ingreso: number;
}

interface ReporteIntermediario {
  id: string;
  nombre: string;
  tipo: string;
  ordenes: OrdenComisionista[];
}

const INTERMEDIARIO_VACIO = {
  nombre: '',
  tipo: '',
  contacto: '',
  email: '',
  telefono: '',
  factura_formal: false,
  proveedor_id: '',
};

const CLASIFICACION_LABEL = (facturaFormal: boolean | number) =>
  facturaFormal ? 'Tipo 1 (facturas)' : 'Tipo 2 (efectivo)';

function IntermediariosTab({ token, puedeCrear }: { token: string; puedeCrear: boolean }) {
  const [intermediarios, setIntermediarios] = useState<Intermediario[] | null>(null);
  const [reporte, setReporte] = useState<ReporteIntermediario[] | null>(null);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string }[]>([]);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(INTERMEDIARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [filtroMesCom, setFiltroMesCom] = useState('');
  const [filtroAnoCom, setFiltroAnoCom] = useState('');
  const [filtroTipoCom, setFiltroTipoCom] = useState(''); // '' = ambas, '1' = con factura, '2' = efectivo
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const cargar = () => {
    setError('');
    setIntermediarios(null);
    axios
      .get('/api/topview/intermediarios', authHeaders(token))
      .then((res) => setIntermediarios(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los comisionistas.'));
        setIntermediarios([]);
      });

    setReporte(null);
    axios
      .get('/api/topview/intermediarios/reporte', authHeaders(token))
      .then((res) => setReporte(res.data))
      .catch(() => setReporte([]));

    axios
      .get('/api/proveedores', authHeaders(token))
      .then((res) => setProveedores(res.data || []))
      .catch(() => setProveedores([]));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNuevo = () => {
    setForm(INTERMEDIARIO_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (i: Intermediario) => {
    setForm({
      nombre: i.nombre,
      tipo: i.tipo,
      contacto: i.contacto || '',
      email: i.email || '',
      telefono: i.telefono || '',
      factura_formal: !!i.factura_formal,
      proveedor_id: i.proveedor_id || '',
    });
    setEditandoId(i.id);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      if (editandoId) {
        await axios.put(`/api/topview/intermediarios/${editandoId}`, form, authHeaders(token));
      } else {
        await axios.post('/api/topview/intermediarios', form, authHeaders(token));
      }
      setForm(INTERMEDIARIO_VACIO);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      const mensaje = err?.response?.data?.error;
      if (mensaje && mensaje.includes('UNIQUE constraint failed: intermediarios.nombre')) {
        setErrorForm('Ya existe un comisionista cargado con ese nombre.');
      } else {
        setErrorForm(mensajeError(err, 'No se pudo guardar el comisionista.'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (i: Intermediario) => {
    if (!window.confirm(`¿Dar de baja a "${i.nombre}"? Dejará de estar disponible para nuevas órdenes.`)) return;
    try {
      await axios.delete(`/api/topview/intermediarios/${i.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja el comisionista.'));
    }
  };

  const nombreProveedor = (id: string | null) => proveedores.find((p) => p.id === id)?.razon_social;

  const anosDisponiblesCom = Array.from(
    new Set((reporte || []).flatMap((r) => r.ordenes.map((o) => o.ano_ingreso)))
  ).sort((a, b) => b - a);

  // Todo el cálculo (filtro por mes/año/tipo, totales, "sin órdenes") se
  // arma acá, del lado del cliente, a partir del detalle orden por orden
  // que ya mandó el backend — mismo patrón que el filtro de la lista de
  // Órdenes.
  const reporteFiltrado = (reporte || [])
    .map((r) => {
      const ordenesFiltradas = r.ordenes.filter((o) => {
        if (filtroMesCom && Number(o.mes_ingreso) !== Number(filtroMesCom)) return false;
        if (filtroAnoCom && Number(o.ano_ingreso) !== Number(filtroAnoCom)) return false;
        if (filtroTipoCom === '1' && !o.factura_formal) return false;
        if (filtroTipoCom === '2' && o.factura_formal) return false;
        return true;
      });
      const comision_tipo1 = ordenesFiltradas.filter((o) => o.factura_formal).reduce((acc, o) => acc + o.monto_comision, 0);
      const comision_tipo2 = ordenesFiltradas.filter((o) => !o.factura_formal).reduce((acc, o) => acc + o.monto_comision, 0);
      return {
        ...r,
        ordenesFiltradas,
        cantidad_ordenes: ordenesFiltradas.length,
        comision_tipo1,
        comision_tipo2,
        comision_total: comision_tipo1 + comision_tipo2,
      };
    })
    .sort((a, b) => b.comision_total - a.comision_total);

  const hayFiltroPeriodo = !!(filtroMesCom || filtroAnoCom);

  const nombreArchivoExportCom = (ext: string) => {
    const sufijo =
      filtroMesCom || filtroAnoCom
        ? `${filtroMesCom ? NOMBRES_MES[Number(filtroMesCom) - 1] : 'todos'}_${filtroAnoCom || 'todos'}`
        : 'todas';
    return `comisionistas_${sufijo}.${ext}`;
  };

  const handleExportarComisionistasExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Comisionistas');
    ws.columns = [
      { header: 'Nombre', width: 24 },
      { header: 'Tipo', width: 18 },
      { header: 'Órdenes', width: 10 },
      { header: 'Comisión Tipo 1 (facturas)', width: 22 },
      { header: 'Comisión Tipo 2 (efectivo)', width: 22 },
      { header: 'Comisión total', width: 18 },
    ];
    reporteFiltrado.forEach((r) => {
      ws.addRow([r.nombre, r.tipo, r.cantidad_ordenes, r.comision_tipo1, r.comision_tipo2, r.comision_total]);
    });
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
    });
    const formatoMoneda = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';
    [4, 5, 6].forEach((i) => (ws.getColumn(i).numFmt = formatoMoneda));
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoExportCom('xlsx');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportarComisionistasPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    autoTable(doc, {
      head: [['Nombre', 'Tipo', 'Órdenes', 'Comisión Tipo 1', 'Comisión Tipo 2', 'Comisión total']],
      body: reporteFiltrado.map((r) => [
        r.nombre,
        r.tipo,
        String(r.cantidad_ordenes),
        formatMoney(r.comision_tipo1),
        formatMoney(r.comision_tipo2),
        formatMoney(r.comision_total),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [232, 24, 56] },
    });
    doc.save(nombreArchivoExportCom('pdf'));
  };

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo comisionista'}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label>Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Tipo (opcional)</label>
            <input
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              placeholder="Ej: Red LATAM, Plataforma Digital, Persona Física"
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Contacto</label>
            <input
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Clasificación por defecto *</label>
            <select
              value={form.factura_formal ? 'tipo1' : 'tipo2'}
              onChange={(e) => setForm({ ...form, factura_formal: e.target.value === 'tipo1' })}
              disabled={guardando}
            >
              <option value="tipo1">Tipo 1 — Con factura</option>
              <option value="tipo2">Tipo 2 — En efectivo</option>
            </select>
            <small className="ayuda-error" style={{ color: '#666' }}>
              Se usa cuando en una orden no elegís ninguna condición guardada. Si maneja negocios de ambos tipos,
              cargale condiciones específicas en "Condiciones" — cada una con su propia clasificación.
            </small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Proveedor para facturas (opcional)</label>
            <select
              value={form.proveedor_id}
              onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
              disabled={guardando}
            >
              <option value="">Sin vincular — no genera gastos pendientes</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
            <small className="ayuda-error" style={{ color: '#666' }}>
              Vinculalo a su proveedor para que las órdenes donde este comisionista cobre con factura formal generen
              el gasto pendiente automáticamente.
            </small>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar comisionista'}
            </button>
          </div>
        </form>
      )}

      <h3 className="reportes-subtitulo">Cuánto traccionan las ventas</h3>
      {reporte === null && <p className="empty-state">Cargando...</p>}
      {reporte && reporte.length === 0 && <p className="empty-state">No hay comisionistas cargados.</p>}
      {reporte && reporte.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="filtro_mes_com">Mes</label>
              <select id="filtro_mes_com" value={filtroMesCom} onChange={(e) => setFiltroMesCom(e.target.value)}>
                <option value="">Todos los meses</option>
                {NOMBRES_MES.map((nombre, i) => (
                  <option key={nombre} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="filtro_ano_com">Año</label>
              <select id="filtro_ano_com" value={filtroAnoCom} onChange={(e) => setFiltroAnoCom(e.target.value)}>
                <option value="">Todos los años</option>
                {anosDisponiblesCom.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="filtro_tipo_com">Tipo</label>
              <select id="filtro_tipo_com" value={filtroTipoCom} onChange={(e) => setFiltroTipoCom(e.target.value)}>
                <option value="">Ambas</option>
                <option value="1">Solo Tipo 1 (facturas)</option>
                <option value="2">Solo Tipo 2 (efectivo)</option>
              </select>
            </div>
            {(filtroMesCom || filtroAnoCom || filtroTipoCom) && (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setFiltroMesCom('');
                  setFiltroAnoCom('');
                  setFiltroTipoCom('');
                }}
              >
                Limpiar filtro
              </button>
            )}
            <div style={{ flexGrow: 1 }} />
            <button type="button" onClick={handleExportarComisionistasExcel}>
              Exportar Excel
            </button>
            <button type="button" onClick={handleExportarComisionistasPDF}>
              Exportar PDF
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Órdenes</th>
                {filtroTipoCom !== '2' && <th>Comisión Tipo 1 (facturas)</th>}
                {filtroTipoCom !== '1' && <th>Comisión Tipo 2 (efectivo)</th>}
                <th>Comisión total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reporteFiltrado.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{r.nombre}</td>
                    <td>{r.tipo}</td>
                    <td>
                      {r.cantidad_ordenes}
                      {r.cantidad_ordenes === 0 && (
                        <span className="estado-badge estado-pendiente" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                          sin órdenes{hayFiltroPeriodo ? ' este período' : ''}
                        </span>
                      )}
                    </td>
                    {filtroTipoCom !== '2' && <td>{formatMoney(r.comision_tipo1)}</td>}
                    {filtroTipoCom !== '1' && <td>{formatMoney(r.comision_tipo2)}</td>}
                    <td>{formatMoney(r.comision_total)}</td>
                    <td>
                      {r.ordenesFiltradas.length > 0 && (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setExpandidoId(expandidoId === r.id ? null : r.id)}
                        >
                          {expandidoId === r.id ? 'Ocultar' : 'Ver clientes'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandidoId === r.id && r.ordenesFiltradas.length > 0 && (
                    <tr>
                      <td colSpan={7} style={{ background: '#faf7f7', padding: '0.75rem 1rem' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Anunciante</th>
                              <th>N° orden</th>
                              <th>Período</th>
                              <th>Tipo</th>
                              <th>Comisión</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.ordenesFiltradas.map((o) => (
                              <tr key={o.orden_id}>
                                <td>{o.nombre_anunciante}</td>
                                <td>{o.numero_orden_agencia || o.numero_orden}</td>
                                <td>
                                  {NOMBRES_MES[o.mes_ingreso - 1]} {o.ano_ingreso}
                                </td>
                                <td>{o.factura_formal ? 'Tipo 1' : 'Tipo 2'}</td>
                                <td>{formatMoney(o.monto_comision)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="totales-preview" style={{ marginBottom: '2rem' }}>
            Total Tipo 1 (facturas):{' '}
            <strong>{formatMoney(reporteFiltrado.reduce((acc, r) => acc + r.comision_tipo1, 0))}</strong>
            {' · '}Total Tipo 2 (efectivo):{' '}
            <strong>{formatMoney(reporteFiltrado.reduce((acc, r) => acc + r.comision_tipo2, 0))}</strong>
          </p>
        </>
      )}

      <h3 className="reportes-subtitulo">Ficha de comisionistas</h3>
      {intermediarios === null && !error && <p className="empty-state">Cargando...</p>}
      {error && intermediarios && intermediarios.length === 0 && <div className="error-message">{error}</div>}
      {intermediarios && intermediarios.length === 0 && !error && (
        <p className="empty-state">No hay comisionistas cargados.</p>
      )}
      {intermediarios && intermediarios.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Contacto</th>
              <th>Clasificación por defecto</th>
              <th>Proveedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {intermediarios.map((i) => (
              <tr key={i.id}>
                <td>{i.nombre}</td>
                <td>{i.tipo}</td>
                <td>{i.contacto || '-'}</td>
                <td>
                  <span className={`estado-badge ${i.factura_formal ? 'estado-activa' : 'estado-pendiente'}`}>
                    {CLASIFICACION_LABEL(i.factura_formal)}
                  </span>
                </td>
                <td>{nombreProveedor(i.proveedor_id) || '-'}</td>
                <td>
                  {puedeCrear && (
                    <>
                      <button className="btn-link" onClick={() => handleEditar(i)}>
                        Editar
                      </button>
                      {' · '}
                      <button className="btn-link btn-link-danger" onClick={() => handleEliminar(i)}>
                        Dar de baja
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

interface CondicionAgencia {
  id: string;
  agencia_id: string;
  nombre: string;
  porcentaje_nc: number;
  nc_en_cascada: number;
  porcentaje_factura: number;
  factura_en_cascada: number;
}

interface CondicionIntermediario {
  id: string;
  intermediario_id: string;
  nombre: string;
  porcentaje_comision: number;
  tipo_calculo: string;
  factura_formal: number;
}

const CONDICION_AGENCIA_VACIA = {
  agencia_id: '',
  nombre: '',
  porcentaje_nc: '0',
  nc_en_cascada: false,
  porcentaje_factura: '0',
  factura_en_cascada: false,
};

const CONDICION_INTERMEDIARIO_VACIA = {
  intermediario_id: '',
  nombre: '',
  porcentaje_comision: '0',
  tipo_calculo: 'cascada',
  factura_formal: false,
};

function CondicionesTab({
  token,
  puedeCrear,
  puedeVerComisionistas,
  puedeGestionarComisionistas,
}: {
  token: string;
  puedeCrear: boolean;
  puedeVerComisionistas: boolean;
  puedeGestionarComisionistas: boolean;
}) {
  const [agencias, setAgencias] = useState<Agencia[]>([]);
  const [intermediarios, setIntermediarios] = useState<Intermediario[]>([]);
  const [condicionesAgencia, setCondicionesAgencia] = useState<CondicionAgencia[] | null>(null);
  const [condicionesIntermediario, setCondicionesIntermediario] = useState<CondicionIntermediario[] | null>(null);
  const [error, setError] = useState('');

  const [mostrarFormAgencia, setMostrarFormAgencia] = useState(false);
  const [formAgencia, setFormAgencia] = useState(CONDICION_AGENCIA_VACIA);
  const [guardandoAgencia, setGuardandoAgencia] = useState(false);
  const [errorFormAgencia, setErrorFormAgencia] = useState('');

  const [mostrarFormInter, setMostrarFormInter] = useState(false);
  const [formInter, setFormInter] = useState(CONDICION_INTERMEDIARIO_VACIA);
  const [guardandoInter, setGuardandoInter] = useState(false);
  const [errorFormInter, setErrorFormInter] = useState('');

  const cargar = () => {
    setError('');
    axios.get('/api/topview/agencias', authHeaders(token)).then((res) => setAgencias(res.data || []));

    setCondicionesAgencia(null);
    axios
      .get('/api/topview/condiciones-agencia', authHeaders(token))
      .then((res) => setCondicionesAgencia(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las condiciones.'));
        setCondicionesAgencia([]);
      });

    if (!puedeVerComisionistas) return;

    axios.get('/api/topview/intermediarios', authHeaders(token)).then((res) => setIntermediarios(res.data || []));

    setCondicionesIntermediario(null);
    axios
      .get('/api/topview/condiciones-intermediario', authHeaders(token))
      .then((res) => setCondicionesIntermediario(res.data))
      .catch(() => setCondicionesIntermediario([]));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreAgencia = (id: string) => agencias.find((a) => a.id === id)?.nombre || id;
  const nombreIntermediario = (id: string) => intermediarios.find((i) => i.id === id)?.nombre || id;

  const handleSubmitAgencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAgencia.agencia_id || !formAgencia.nombre.trim()) {
      setErrorFormAgencia('Elegí una agencia y ponele un nombre a la condición.');
      return;
    }
    setGuardandoAgencia(true);
    setErrorFormAgencia('');
    try {
      await axios.post(
        '/api/topview/condiciones-agencia',
        {
          ...formAgencia,
          porcentaje_nc: Number(formAgencia.porcentaje_nc) || 0,
          porcentaje_factura: Number(formAgencia.porcentaje_factura) || 0,
        },
        authHeaders(token)
      );
      setFormAgencia(CONDICION_AGENCIA_VACIA);
      setMostrarFormAgencia(false);
      cargar();
    } catch (err: any) {
      setErrorFormAgencia(mensajeError(err, 'No se pudo guardar la condición.'));
    } finally {
      setGuardandoAgencia(false);
    }
  };

  const handleQuitarCondicionAgencia = async (id: string) => {
    try {
      await axios.delete(`/api/topview/condiciones-agencia/${id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la condición.'));
    }
  };

  const handleSubmitInter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInter.intermediario_id || !formInter.nombre.trim()) {
      setErrorFormInter('Elegí un comisionista y ponele un nombre a la condición.');
      return;
    }
    setGuardandoInter(true);
    setErrorFormInter('');
    try {
      await axios.post(
        '/api/topview/condiciones-intermediario',
        { ...formInter, porcentaje_comision: Number(formInter.porcentaje_comision) || 0 },
        authHeaders(token)
      );
      setFormInter(CONDICION_INTERMEDIARIO_VACIA);
      setMostrarFormInter(false);
      cargar();
    } catch (err: any) {
      setErrorFormInter(mensajeError(err, 'No se pudo guardar la condición.'));
    } finally {
      setGuardandoInter(false);
    }
  };

  const handleQuitarCondicionInter = async (id: string) => {
    try {
      await axios.delete(`/api/topview/condiciones-intermediario/${id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la condición.'));
    }
  };

  return (
    <>
      {error && <div className="error-message">{error}</div>}

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Condiciones de agencia
        </h3>
        {puedeCrear && (
          <button className="btn-primary" onClick={() => setMostrarFormAgencia((v) => !v)}>
            {mostrarFormAgencia ? 'Cancelar' : '+ Nueva condición de agencia'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Se sugieren al elegir la agencia en el ingreso de una orden — el % de descuento comercial (NC) y el % de
        descuento facturas a esperar (FC). Quedan editables para cada caso puntual.
      </p>

      {mostrarFormAgencia && (
        <form className="cliente-form" onSubmit={handleSubmitAgencia}>
          {errorFormAgencia && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormAgencia}
            </div>
          )}
          <div className="form-group">
            <label>Agencia *</label>
            <select
              value={formAgencia.agencia_id}
              onChange={(e) => setFormAgencia({ ...formAgencia, agencia_id: e.target.value })}
              disabled={guardandoAgencia}
            >
              <option value="">Elegir agencia</option>
              {agencias.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nombre de la condición *</label>
            <input
              value={formAgencia.nombre}
              onChange={(e) => setFormAgencia({ ...formAgencia, nombre: e.target.value })}
              placeholder="Ej: Estándar, VW, OMNET"
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group">
            <label>% Descuento comercial (NC)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formAgencia.porcentaje_nc}
              onChange={(e) => setFormAgencia({ ...formAgencia, porcentaje_nc: e.target.value })}
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group form-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={formAgencia.nc_en_cascada}
                onChange={(e) => setFormAgencia({ ...formAgencia, nc_en_cascada: e.target.checked })}
                disabled={guardandoAgencia}
              />
              {' '}NC en cascada
            </label>
          </div>
          <div className="form-group">
            <label>% Descuento facturas — a esperar (FC)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formAgencia.porcentaje_factura}
              onChange={(e) => setFormAgencia({ ...formAgencia, porcentaje_factura: e.target.value })}
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group form-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={formAgencia.factura_en_cascada}
                onChange={(e) => setFormAgencia({ ...formAgencia, factura_en_cascada: e.target.checked })}
                disabled={guardandoAgencia}
              />
              {' '}Factura en cascada
            </label>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoAgencia}>
              {guardandoAgencia ? 'Guardando...' : 'Guardar condición'}
            </button>
          </div>
        </form>
      )}

      {condicionesAgencia === null && <p className="empty-state">Cargando...</p>}
      {condicionesAgencia && condicionesAgencia.length === 0 && (
        <p className="empty-state">No hay condiciones de agencia cargadas.</p>
      )}
      {condicionesAgencia && condicionesAgencia.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Agencia</th>
              <th>Condición</th>
              <th>% NC</th>
              <th>% Factura</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condicionesAgencia.map((c) => (
              <tr key={c.id}>
                <td>{nombreAgencia(c.agencia_id)}</td>
                <td>{c.nombre}</td>
                <td>
                  {c.porcentaje_nc}% {c.nc_en_cascada ? '(cascada)' : ''}
                </td>
                <td>
                  {c.porcentaje_factura}% {c.factura_en_cascada ? '(cascada)' : ''}
                </td>
                <td>
                  {puedeCrear && (
                    <button className="btn-link btn-link-danger" onClick={() => handleQuitarCondicionAgencia(c.id)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeVerComisionistas && (
        <>
          <div className="view-header">
            <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
              Condiciones de comisionista
            </h3>
            {puedeGestionarComisionistas && (
              <button className="btn-primary" onClick={() => setMostrarFormInter((v) => !v)}>
                {mostrarFormInter ? 'Cancelar' : '+ Nueva condición de comisionista'}
              </button>
            )}
          </div>
          <p className="totales-preview" style={{ marginTop: 0 }}>
            Se sugieren al agregar el comisionista en una orden — % y forma de cálculo habituales. Quedan editables por
            renglón.
      </p>

      {mostrarFormInter && (
        <form className="cliente-form" onSubmit={handleSubmitInter}>
          {errorFormInter && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormInter}
            </div>
          )}
          <div className="form-group">
            <label>Comisionista *</label>
            <select
              value={formInter.intermediario_id}
              onChange={(e) => setFormInter({ ...formInter, intermediario_id: e.target.value })}
              disabled={guardandoInter}
            >
              <option value="">Elegir comisionista</option>
              {intermediarios.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nombre de la condición *</label>
            <input
              value={formInter.nombre}
              onChange={(e) => setFormInter({ ...formInter, nombre: e.target.value })}
              placeholder="Ej: Estándar"
              disabled={guardandoInter}
            />
          </div>
          <div className="form-group">
            <label>% Comisión</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formInter.porcentaje_comision}
              onChange={(e) => setFormInter({ ...formInter, porcentaje_comision: e.target.value })}
              disabled={guardandoInter}
            />
          </div>
          <div className="form-group">
            <label>Forma de cálculo</label>
            <select
              value={formInter.tipo_calculo}
              onChange={(e) => setFormInter({ ...formInter, tipo_calculo: e.target.value })}
              disabled={guardandoInter}
            >
              <option value="cascada">Cascada</option>
              <option value="base">Directo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Clasificación *</label>
            <select
              value={formInter.factura_formal ? 'tipo1' : 'tipo2'}
              onChange={(e) => setFormInter({ ...formInter, factura_formal: e.target.value === 'tipo1' })}
              disabled={guardandoInter}
            >
              <option value="tipo1">Tipo 1 — Con factura</option>
              <option value="tipo2">Tipo 2 — En efectivo</option>
            </select>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoInter}>
              {guardandoInter ? 'Guardando...' : 'Guardar condición'}
            </button>
          </div>
        </form>
      )}

      {condicionesIntermediario === null && <p className="empty-state">Cargando...</p>}
      {condicionesIntermediario && condicionesIntermediario.length === 0 && (
        <p className="empty-state">No hay condiciones de comisionista cargadas.</p>
      )}
      {condicionesIntermediario && condicionesIntermediario.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Comisionista</th>
              <th>Condición</th>
              <th>%</th>
              <th>Cálculo</th>
              <th>Clasificación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condicionesIntermediario.map((c) => (
              <tr key={c.id}>
                <td>{nombreIntermediario(c.intermediario_id)}</td>
                <td>{c.nombre}</td>
                <td>{c.porcentaje_comision}%</td>
                <td>{c.tipo_calculo === 'base' ? 'Directo' : 'Cascada'}</td>
                <td>
                  <span className={`estado-badge ${c.factura_formal ? 'estado-activa' : 'estado-pendiente'}`}>
                    {CLASIFICACION_LABEL(c.factura_formal)}
                  </span>
                </td>
                <td>
                  {puedeGestionarComisionistas && (
                    <button className="btn-link btn-link-danger" onClick={() => handleQuitarCondicionInter(c.id)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
        </>
      )}
    </>
  );
}

interface ComisionEfectivo {
  id: string;
  orden_id: string;
  intermediario_id: string;
  intermediario_nombre: string;
  numero_orden: string;
  factura_id: string | null;
  factura_numero: string | null;
  factura_estado: string | null;
  factura_saldo: number | null;
  numero_mes: number;
  ano: number;
  monto: number;
  pagado: number;
  fecha_pago: string | null;
  descripcion: string | null;
}

function ComisionesEfectivoTab({ token, puedeEditar }: { token: string; puedeEditar: boolean }) {
  const [comisiones, setComisiones] = useState<ComisionEfectivo[] | null>(null);
  const [error, setError] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().split('T')[0]);
  const [pagando, setPagando] = useState(false);

  const cargar = () => {
    setError('');
    setComisiones(null);
    axios
      .get('/api/comisiones-efectivo', authHeaders(token))
      .then((res) => setComisiones(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las comisiones en efectivo.'));
        setComisiones([]);
      });
  };

  useEffect(() => {
    cargar();
    setSeleccionadas(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comisionesFiltradas = useMemo(() => {
    if (!comisiones) return [];
    return soloPendientes ? comisiones.filter((c) => !c.pagado) : comisiones;
  }, [comisiones, soloPendientes]);

  const pendientes = useMemo(() => (comisiones || []).filter((c) => !c.pagado), [comisiones]);
  const totalPendiente = pendientes.reduce((acc, c) => acc + c.monto, 0);
  const totalSeleccionado = pendientes
    .filter((c) => seleccionadas.has(c.id))
    .reduce((acc, c) => acc + c.monto, 0);

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSeleccionarTodas = () => {
    setSeleccionadas((prev) =>
      prev.size === pendientes.length ? new Set() : new Set(pendientes.map((c) => c.id))
    );
  };

  const handlePagarSeleccionadas = async () => {
    if (seleccionadas.size === 0) return;
    setPagando(true);
    setError('');
    try {
      await axios.post(
        '/api/comisiones-efectivo/pagar',
        { ids: Array.from(seleccionadas), fecha_pago: fechaPago },
        authHeaders(token)
      );
      setSeleccionadas(new Set());
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudieron marcar como pagadas.'));
    } finally {
      setPagando(false);
    }
  };

  return (
    <>
      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Comisiones en efectivo
        </h3>
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Comisiones de comisionistas SIN factura formal — no pasan por Gastos porque no son fiscales. Se generan solas
        al facturar cada mes de la orden. El pago no depende de nuestra voluntad: se paga cuando ya cobramos la
        factura del cliente de ese mismo período — por eso se muestra su estado de cobro al lado.
      </p>

      {error && <div className="error-message">{error}</div>}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
        <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
        Mostrar solo pendientes
      </label>

      {comisiones === null && !error && <p className="empty-state">Cargando...</p>}
      {comisiones && comisiones.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay comisiones en efectivo generadas — se crean solas al facturar órdenes con comisionistas sin
          factura formal.
        </p>
      )}
      {comisiones && comisiones.length > 0 && comisionesFiltradas.length === 0 && (
        <p className="empty-state">No hay comisiones pendientes.</p>
      )}

      {comisionesFiltradas.length > 0 && (
        <>
          <table className="data-table" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr>
                {puedeEditar && (
                  <th>
                    <input
                      type="checkbox"
                      checked={pendientes.length > 0 && seleccionadas.size === pendientes.length}
                      onChange={toggleSeleccionarTodas}
                    />
                  </th>
                )}
                <th>Comisionista</th>
                <th>Orden</th>
                <th>Período</th>
                <th>Monto</th>
                <th>Factura cliente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {comisionesFiltradas.map((c) => (
                <tr key={c.id}>
                  {puedeEditar && (
                    <td>
                      {!c.pagado && (
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(c.id)}
                          onChange={() => toggleSeleccion(c.id)}
                        />
                      )}
                    </td>
                  )}
                  <td>{c.intermediario_nombre}</td>
                  <td>{c.numero_orden}</td>
                  <td>{NOMBRES_MES[c.numero_mes - 1]} {c.ano}</td>
                  <td>{formatMoney(c.monto)}</td>
                  <td>
                    {c.factura_numero ? (
                      <>
                        {c.factura_numero}{' '}
                        <span className={`estado-badge ${c.factura_estado === 'Cobrada' ? 'estado-activa' : 'estado-pendiente'}`}>
                          {c.factura_estado === 'Cobrada' ? 'Cobrada' : 'Sin cobrar'}
                        </span>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {c.pagado ? (
                      <span className="estado-badge estado-activa">Pagado {formatFecha(c.fecha_pago!)}</span>
                    ) : (
                      <span className="estado-badge estado-pendiente">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {puedeEditar && (
            <div className="cliente-form-actions" style={{ alignItems: 'center' }}>
              <span>
                Seleccionadas: <strong>{formatMoney(totalSeleccionado)}</strong> · Total pendiente:{' '}
                <strong>{formatMoney(totalPendiente)}</strong>
              </span>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                disabled={pagando}
              />
              <button
                className="btn-primary"
                onClick={handlePagarSeleccionadas}
                disabled={seleccionadas.size === 0 || pagando}
              >
                {pagando ? 'Guardando...' : `Marcar pagadas (${seleccionadas.size})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

interface Vendedor {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
}

interface TramoEscala {
  id: string;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  desde: number;
  hasta: number | null;
  porcentaje: number;
}

interface ReporteVendedor {
  vendedor_id: string;
  vendedor_nombre: string;
  cantidad_ordenes: number;
  base_comision: number;
  porcentaje_aplicado: number;
  comision: number;
}

const VENDEDOR_VACIO = { nombre: '', apellido: '', email: '', telefono: '' };
const TRAMO_VACIO = { vendedor_id: '', desde: '', hasta: '', porcentaje: '' };

function VendedoresTab({ token, puedeCrear }: { token: string; puedeCrear: boolean }) {
  const [vendedores, setVendedores] = useState<Vendedor[] | null>(null);
  const [escala, setEscala] = useState<TramoEscala[] | null>(null);
  const [error, setError] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(VENDEDOR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [mostrarFormTramo, setMostrarFormTramo] = useState(false);
  const [editandoTramoId, setEditandoTramoId] = useState<string | null>(null);
  const [formTramo, setFormTramo] = useState(TRAMO_VACIO);
  const [guardandoTramo, setGuardandoTramo] = useState(false);
  const [errorFormTramo, setErrorFormTramo] = useState('');

  const hoy = new Date();
  const [mesReporte, setMesReporte] = useState(hoy.getMonth() + 1);
  const [anoReporte, setAnoReporte] = useState(hoy.getFullYear());
  const [reporte, setReporte] = useState<ReporteVendedor[] | null>(null);
  const [errorReporte, setErrorReporte] = useState('');

  const cargar = () => {
    setError('');
    setVendedores(null);
    axios
      .get('/api/topview/vendedores', authHeaders(token))
      .then((res) => setVendedores(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los vendedores.'));
        setVendedores([]);
      });

    setEscala(null);
    axios
      .get('/api/topview/escala-comisiones-vendedor', authHeaders(token))
      .then((res) => setEscala(res.data))
      .catch(() => setEscala([]));

    cargarReporte();
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarReporte = () => {
    setErrorReporte('');
    setReporte(null);
    axios
      .get(`/api/topview/vendedores/reporte?mes=${mesReporte}&ano=${anoReporte}`, authHeaders(token))
      .then((res) => setReporte(res.data))
      .catch((err) => {
        setErrorReporte(mensajeError(err, 'No se pudo cargar el reporte.'));
        setReporte([]);
      });
  };

  useEffect(() => {
    cargarReporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesReporte, anoReporte]);

  const handleNuevo = () => {
    setForm(VENDEDOR_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (v: Vendedor) => {
    setForm({ nombre: v.nombre, apellido: v.apellido || '', email: v.email || '', telefono: v.telefono || '' });
    setEditandoId(v.id);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      if (editandoId) {
        await axios.put(`/api/topview/vendedores/${editandoId}`, form, authHeaders(token));
      } else {
        await axios.post('/api/topview/vendedores', form, authHeaders(token));
      }
      setForm(VENDEDOR_VACIO);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar el vendedor.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (v: Vendedor) => {
    if (!window.confirm(`¿Dar de baja a "${v.nombre}"?`)) return;
    try {
      await axios.delete(`/api/topview/vendedores/${v.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja el vendedor.'));
    }
  };

  const handleNuevoTramo = () => {
    setFormTramo(TRAMO_VACIO);
    setEditandoTramoId(null);
    setErrorFormTramo('');
    setMostrarFormTramo(true);
  };

  const handleEditarTramo = (t: TramoEscala) => {
    setFormTramo({
      vendedor_id: t.vendedor_id || '',
      desde: String(t.desde),
      hasta: t.hasta !== null ? String(t.hasta) : '',
      porcentaje: String(t.porcentaje),
    });
    setEditandoTramoId(t.id);
    setErrorFormTramo('');
    setMostrarFormTramo(true);
  };

  const handleSubmitTramo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTramo.desde || !formTramo.porcentaje) {
      setErrorFormTramo('Completá el desde y el porcentaje.');
      return;
    }
    setGuardandoTramo(true);
    setErrorFormTramo('');
    const datos = {
      vendedor_id: formTramo.vendedor_id || null,
      desde: Number(formTramo.desde),
      hasta: formTramo.hasta ? Number(formTramo.hasta) : null,
      porcentaje: Number(formTramo.porcentaje),
    };
    try {
      if (editandoTramoId) {
        await axios.put(`/api/topview/escala-comisiones-vendedor/${editandoTramoId}`, datos, authHeaders(token));
      } else {
        await axios.post('/api/topview/escala-comisiones-vendedor', datos, authHeaders(token));
      }
      setFormTramo(TRAMO_VACIO);
      setEditandoTramoId(null);
      setMostrarFormTramo(false);
      cargar();
    } catch (err: any) {
      setErrorFormTramo(mensajeError(err, 'No se pudo guardar el tramo.'));
    } finally {
      setGuardandoTramo(false);
    }
  };

  const handleEliminarTramo = async (t: TramoEscala) => {
    if (!window.confirm('¿Quitar este tramo de la escala?')) return;
    try {
      await axios.delete(`/api/topview/escala-comisiones-vendedor/${t.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar el tramo.'));
    }
  };

  const totalComisionMes = (reporte || []).reduce((acc, r) => acc + r.comision, 0);

  return (
    <>
      {error && <div className="error-message">{error}</div>}

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Vendedores
        </h3>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo vendedor'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Personal de ventas propio de Topview — distinto de los comisionistas (terceros externos). Se elige al cargar
        una orden para taguear quién la vendió.
      </p>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group">
            <label>Apellido</label>
            <input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} disabled={guardando} />
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar vendedor'}
            </button>
          </div>
        </form>
      )}

      {vendedores === null && <p className="empty-state">Cargando...</p>}
      {vendedores && vendedores.length === 0 && <p className="empty-state">No hay vendedores cargados.</p>}
      {vendedores && vendedores.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => (
              <tr key={v.id}>
                <td>{v.nombre}</td>
                <td>{v.apellido || '-'}</td>
                <td>{v.email || '-'}</td>
                <td>{v.telefono || '-'}</td>
                <td>
                  {puedeCrear && (
                    <>
                      <button className="btn-link" onClick={() => handleEditar(v)}>
                        Editar
                      </button>
                      {' · '}
                      <button className="btn-link btn-link-danger" onClick={() => handleEliminar(v)}>
                        Dar de baja
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Escala de comisión
        </h3>
        {puedeCrear && (
          <button
            className="btn-primary"
            onClick={mostrarFormTramo ? () => setMostrarFormTramo(false) : handleNuevoTramo}
          >
            {mostrarFormTramo ? 'Cancelar' : '+ Nuevo tramo'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Según el total vendido en el mes, TODO ese total comisiona al % del tramo en que cae — no es progresivo por
        tramos parciales como el IVA.
      </p>

      {mostrarFormTramo && (
        <form className="cliente-form" onSubmit={handleSubmitTramo}>
          {errorFormTramo && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormTramo}
            </div>
          )}
          <div className="form-group">
            <label>Vendedor (vacío = escala general para todos)</label>
            <select
              value={formTramo.vendedor_id}
              onChange={(e) => setFormTramo({ ...formTramo, vendedor_id: e.target.value })}
              disabled={guardandoTramo}
            >
              <option value="">Escala general</option>
              {(vendedores || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} {v.apellido || ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Desde *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formTramo.desde}
              onChange={(e) => setFormTramo({ ...formTramo, desde: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="form-group">
            <label>Hasta (vacío = sin techo)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formTramo.hasta}
              onChange={(e) => setFormTramo({ ...formTramo, hasta: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="form-group">
            <label>% Comisión *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formTramo.porcentaje}
              onChange={(e) => setFormTramo({ ...formTramo, porcentaje: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoTramo}>
              {guardandoTramo ? 'Guardando...' : 'Guardar tramo'}
            </button>
          </div>
        </form>
      )}

      {escala === null && <p className="empty-state">Cargando...</p>}
      {escala && escala.length === 0 && <p className="empty-state">No hay tramos cargados.</p>}
      {escala && escala.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>% Comisión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {escala.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.vendedor_id ? (
                    t.vendedor_nombre
                  ) : (
                    <span className="estado-badge estado-activa">Escala general</span>
                  )}
                </td>
                <td>{formatMoney(t.desde)}</td>
                <td>{t.hasta !== null ? formatMoney(t.hasta) : 'Sin techo'}</td>
                <td>{t.porcentaje}%</td>
                <td>
                  {puedeCrear && (
                    <>
                      <button className="btn-link" onClick={() => handleEditarTramo(t)}>
                        Editar
                      </button>
                      {' · '}
                      <button className="btn-link btn-link-danger" onClick={() => handleEliminarTramo(t)}>
                        Quitar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="reportes-subtitulo">Comisión del mes</h3>
      <div className="cliente-form-actions" style={{ marginBottom: '1rem' }}>
        <select value={mesReporte} onChange={(e) => setMesReporte(Number(e.target.value))}>
          {NOMBRES_MES.map((n, i) => (
            <option key={i} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={anoReporte}
          onChange={(e) => setAnoReporte(Number(e.target.value))}
          style={{ width: '6rem' }}
        />
      </div>

      {errorReporte && <div className="error-message">{errorReporte}</div>}
      {reporte === null && !errorReporte && <p className="empty-state">Cargando...</p>}
      {reporte && reporte.length === 0 && <p className="empty-state">No hay vendedores cargados.</p>}
      {reporte && reporte.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Órdenes</th>
                <th>Base (neto de comisiones y confidenciales)</th>
                <th>Tramo aplicado</th>
                <th>Comisión</th>
              </tr>
            </thead>
            <tbody>
              {reporte.map((r) => (
                <tr key={r.vendedor_id}>
                  <td>{r.vendedor_nombre}</td>
                  <td>{r.cantidad_ordenes}</td>
                  <td>{formatMoney(r.base_comision)}</td>
                  <td>{r.cantidad_ordenes > 0 ? `${r.porcentaje_aplicado}%` : '-'}</td>
                  <td>
                    <strong>{formatMoney(r.comision)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="totales-preview">
            Total a comisionar en {NOMBRES_MES[mesReporte - 1]} {anoReporte}: <strong>{formatMoney(totalComisionMes)}</strong>
          </p>
        </>
      )}
    </>
  );
}

export default TopviewView;
