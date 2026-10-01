import { Fragment, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, formatFecha, scrollAlFormulario } from '../utils/api';
import { usePdfPreview, PdfExportMenu, abrirPestañaPrevia } from '../hooks/usePdfPreview';
import { InputMiles, InputPorcentaje } from './CamposMonto';
import { TIPOS_ANUNCIANTE, NOMBRES_MES, ESTADOS_ORDEN, TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO, addMonthClamped } from '../utils/constantesTopview';
import type { OrdenPublicidad, Agencia, Intermediario, Cliente } from '../types/topview';

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
  descuento_porcentaje_2: '0',
  descuento_en_cascada_2: false,
  descuento_facturas_porcentaje: '0',
  descuento_facturas_en_cascada: false,
  mes_ingreso: '',
  ano_ingreso: '',
  facturado: true,
  notas: '',
  vigencia_hasta_nota: '',
  vigencia_hasta_mes: '',
  vigencia_hasta_ano: '',
  avisar_telegram: true,
};
function OrdenesTab({
  token,
  puedeCrear,
  puedeEditar,
  puedeVerLiquidaciones,
  ordenIdParaAbrir,
  onOrdenAbierta,
  onVolverASeccionOrigen,
  onVerLiquidacion,
}: {
  token: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeVerLiquidaciones?: boolean;
  ordenIdParaAbrir?: string | null;
  onOrdenAbierta?: () => void;
  onVolverASeccionOrigen?: () => void;
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
  // Si la orden que se está viendo se abrió desde otra solapa (Comisionistas,
  // Liquidaciones) — "‹ Volver a la lista" vuelve ahí en vez de a la lista
  // general de Órdenes. Se apaga apenas el usuario navega por su cuenta
  // dentro de Órdenes (abre otra orden a mano, o vuelve una vez).
  const [vinoDeOtraPestana, setVinoDeOtraPestana] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const { mostrarPdf } = usePdfPreview();
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [generandoFacturas, setGenerandoFacturas] = useState(false);
  const [errorFacturas, setErrorFacturas] = useState('');
  const [mensajeFacturas, setMensajeFacturas] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [mensajeClonado, setMensajeClonado] = useState('');
  const [previewAsana, setPreviewAsana] = useState<{ name: string; notes: string } | null>(null);
  const [cargandoAsana, setCargandoAsana] = useState(false);
  const [errorAsana, setErrorAsana] = useState('');
  const [mensajeAsana, setMensajeAsana] = useState('');
  // gid de Asana de la orden que se está editando (si ya la tenía antes de
  // entrar al formulario) — sirve para avisar "ya está en Asana" cuando se
  // abre una orden hija que se generó en bloque desde la orden madre.
  const [asanaGidActual, setAsanaGidActual] = useState<string | null>(null);
  const [asanaAsignadoActual, setAsanaAsignadoActual] = useState(false);
  // Selección de órdenes tildadas en el listado, para las acciones masivas
  // de Asana (generar/asignar/borrar sobre varias a la vez) — persiste
  // aunque se cambien los filtros, así se puede ir sumando de a un filtro
  // por vez (ej. tildar "Pequeños Anunciantes" de agosto, después cambiar el
  // filtro a septiembre y tildar también esas).
  const [seleccionadasAsana, setSeleccionadasAsana] = useState<Set<string>>(new Set());
  const [cargandoAsanaMasivo, setCargandoAsanaMasivo] = useState(false);
  const [errorAsanaMasivo, setErrorAsanaMasivo] = useState('');
  const [mensajeAsanaMasivo, setMensajeAsanaMasivo] = useState('');
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
    setMensajeClonado('');
    setErrorAsana('');
    setMensajeAsana('');
    setAsanaGidActual(null);
    setAsanaAsignadoActual(false);
    setPreviewAsana(null);
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
    setAsanaGidActual(o.asana_task_gid || null);
    setAsanaAsignadoActual(!!o.asana_asignado);
    setPreviewAsana(null);
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
      descuento_porcentaje_2: String(o.descuento_porcentaje_2 ?? 0),
      descuento_en_cascada_2: !!o.descuento_en_cascada_2,
      descuento_facturas_porcentaje: String(o.descuento_facturas_porcentaje ?? 0),
      descuento_facturas_en_cascada: !!o.descuento_facturas_en_cascada,
      mes_ingreso: o.mes_ingreso ? String(o.mes_ingreso) : '',
      ano_ingreso: o.ano_ingreso ? String(o.ano_ingreso) : '',
      facturado:
        o.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO
          ? false
          : o.facturado === undefined
          ? true
          : !!o.facturado,
      notas: o.notas || '',
      vigencia_hasta_nota: o.vigencia_hasta_nota || '',
      // Se muestra el valor guardado: guardar la edición también dispara el
      // clonado automático (ver generarClonesVigencia en el backend), pero
      // es seguro repetirlo — si el mes ya tiene una orden del mismo
      // cliente/anunciante, se saltea en vez de duplicarla.
      vigencia_hasta_mes: o.vigencia_hasta_mes ? String(o.vigencia_hasta_mes) : '',
      vigencia_hasta_ano: o.vigencia_hasta_ano ? String(o.vigencia_hasta_ano) : '',
      avisar_telegram: o.avisar_telegram === undefined || o.avisar_telegram === null ? true : !!o.avisar_telegram,
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
      setMensajeClonado('');
      setErrorAsana('');
      setMensajeAsana('');
      // Es un clon nuevo (todavía sin guardar) — nunca hereda la tarea de
      // Asana de la orden original.
      setAsanaGidActual(null);
      setAsanaAsignadoActual(false);
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
    setMensajeClonado('');
    setErrorAsana('');
    setMensajeAsana('');
    scrollAlFormulario();
  };

  // Muestra qué datos de la orden se mandarían a Asana (nombre + cuerpo de la
  // tarea) sin llamar a Asana todavía — solo arma el texto en el backend.
  const handleVerPreviewAsana = (ordenId: string) => {
    setErrorAsana('');
    setMensajeAsana('');
    setCargandoAsana(true);
    axios
      .get(`/api/ordenes-publicidad/${ordenId}/asana-preview`, authHeaders(token))
      .then((res) => setPreviewAsana(res.data))
      .catch((err) => setErrorAsana(mensajeError(err, 'No se pudo armar la vista previa.')))
      .finally(() => setCargandoAsana(false));
  };

  // Crea (o actualiza, si ya se había generado antes) la tarea principal +
  // subtareas de esta orden en Asana — sin asignar a nadie todavía, para no
  // notificar hasta que se pida explícitamente con "Asignar responsables".
  const handleGenerarAsana = (ordenId: string) => {
    setErrorAsana('');
    setMensajeAsana('');
    setCargandoAsana(true);
    axios
      .post(`/api/ordenes-publicidad/${ordenId}/asana`, {}, authHeaders(token))
      .then((res) => {
        const resultados: Array<{ ordenId: string; mes: number; ano: number; url?: string; yaExistia?: boolean; error?: string }> =
          res.data;
        const resultado = resultados[0];

        if (resultado.error) {
          setErrorAsana(resultado.error);
        } else {
          setMensajeAsana(
            resultado.yaExistia ? `Tarea actualizada en Asana: ${resultado.url}` : `Tarea generada en Asana: ${resultado.url}`
          );
        }
        if (detalleId) cargarDetalle(detalleId);
        if (!resultado.error) setAsanaGidActual((prev) => prev || 'generada');
        // Si esta orden se creó recién (no ya existía), la tarea arranca sin
        // asignar — si ya existía, la asignación previa no se toca (generar
        // nunca reasigna).
        if (!resultado.error && !resultado.yaExistia) {
          setAsanaAsignadoActual(false);
        }
      })
      .catch((err) => setErrorAsana(mensajeError(err, 'No se pudo generar la tarea en Asana.')))
      .finally(() => setCargandoAsana(false));
  };

  // Asigna la tarea principal y cada subtarea ya generada a sus responsables
  // fijos (trafico@/operaciones@/administracion@) — requiere que ya exista
  // la tarea (botón "Generar tarea en Asana" primero).
  const handleAsignarAsana = (ordenId: string) => {
    setErrorAsana('');
    setMensajeAsana('');
    setCargandoAsana(true);
    axios
      .post(`/api/ordenes-publicidad/${ordenId}/asana/asignar`, {}, authHeaders(token))
      .then(() => {
        setMensajeAsana('Responsables asignados en Asana.');
        setAsanaAsignadoActual(true);
        if (detalleId) cargarDetalle(detalleId);
      })
      .catch((err) => setErrorAsana(mensajeError(err, 'No se pudo asignar la tarea en Asana.')))
      .finally(() => setCargandoAsana(false));
  };

  // Borra la tarea de Asana de esta orden puntual únicamente. Irreversible
  // en Asana, por eso confirma antes.
  const handleBorrarAsana = (ordenId: string, nombreAnunciante: string) => {
    if (!window.confirm(`¿Borrar la tarea de Asana de "${nombreAnunciante}"? No se puede deshacer desde acá.`)) {
      return;
    }
    setErrorAsana('');
    setMensajeAsana('');
    setCargandoAsana(true);
    axios
      .delete(`/api/ordenes-publicidad/${ordenId}/asana`, authHeaders(token))
      .then((res) => {
        const resultados: Array<{ mes: number; ano: number; borrada: boolean; error?: string }> = res.data;
        const resultado = resultados[0];
        if (resultado.error) {
          setErrorAsana(`No se pudo borrar: ${resultado.error}`);
        } else if (resultado.borrada) {
          setMensajeAsana('Tarea borrada en Asana.');
        } else {
          setMensajeAsana('No había ninguna tarea generada para borrar.');
        }
        if (detalleId) cargarDetalle(detalleId);
        setAsanaGidActual(null);
        setAsanaAsignadoActual(false);
      })
      .catch((err) => setErrorAsana(mensajeError(err, 'No se pudo borrar la tarea en Asana.')))
      .finally(() => setCargandoAsana(false));
  };

  // Las 3 acciones de Asana del listado, pero masivas: corren sobre todas
  // las órdenes tildadas en seleccionadasAsana en un solo pedido al backend
  // (que igual las procesa una por una, así una orden con error no frena al
  // resto). Actualizan en memoria las filas afectadas para no perder el
  // scroll con un refetch completo (mismo motivo que handleCambiarEstadoLista).
  const handleGenerarAsanaMasivo = () => {
    const ids = Array.from(seleccionadasAsana);
    if (ids.length === 0) return;
    setErrorAsanaMasivo('');
    setMensajeAsanaMasivo('');
    setCargandoAsanaMasivo(true);
    axios
      .post('/api/ordenes-publicidad/asana/generar-masivo', { ids }, authHeaders(token))
      .then((res) => {
        const resultados: Array<{ ordenId: string; gid?: string; yaExistia?: boolean; error?: string }> = res.data;
        const exitosos = resultados.filter((r) => !r.error);
        const fallidos = resultados.filter((r) => r.error);
        setOrdenes((prev) =>
          prev
            ? prev.map((o) => {
                const r = exitosos.find((x) => x.ordenId === o.id);
                return r ? { ...o, asana_task_gid: r.gid || o.asana_task_gid } : o;
              })
            : prev
        );
        const nuevas = exitosos.filter((r) => !r.yaExistia).length;
        const actualizadas = exitosos.length - nuevas;
        setMensajeAsanaMasivo(
          `Tareas en Asana: ${exitosos.length} ok (${nuevas} nuevas, ${actualizadas} actualizadas)` +
            (fallidos.length ? `, ${fallidos.length} con error.` : '.')
        );
        if (fallidos.length > 0) setErrorAsanaMasivo(fallidos.map((r) => r.error).join(' — '));
      })
      .catch((err) => setErrorAsanaMasivo(mensajeError(err, 'No se pudieron generar las tareas en Asana.')))
      .finally(() => setCargandoAsanaMasivo(false));
  };

  const handleAsignarAsanaMasivo = () => {
    const ids = Array.from(seleccionadasAsana);
    if (ids.length === 0) return;
    setErrorAsanaMasivo('');
    setMensajeAsanaMasivo('');
    setCargandoAsanaMasivo(true);
    axios
      .post('/api/ordenes-publicidad/asana/asignar-masivo', { ids }, authHeaders(token))
      .then((res) => {
        const resultados: Array<{ ordenId: string; error?: string }> = res.data;
        const exitosos = resultados.filter((r) => !r.error);
        const fallidos = resultados.filter((r) => r.error);
        setOrdenes((prev) =>
          prev ? prev.map((o) => (exitosos.some((r) => r.ordenId === o.id) ? { ...o, asana_asignado: true } : o)) : prev
        );
        setMensajeAsanaMasivo(
          `Responsables asignados: ${exitosos.length} ok` + (fallidos.length ? `, ${fallidos.length} con error.` : '.')
        );
        if (fallidos.length > 0) setErrorAsanaMasivo(fallidos.map((r) => r.error).join(' — '));
      })
      .catch((err) => setErrorAsanaMasivo(mensajeError(err, 'No se pudieron asignar responsables.')))
      .finally(() => setCargandoAsanaMasivo(false));
  };

  const handleBorrarAsanaMasivo = () => {
    const ids = Array.from(seleccionadasAsana);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Borrar la tarea de Asana de las ${ids.length} órdenes tildadas? No se puede deshacer desde acá.`)) {
      return;
    }
    setErrorAsanaMasivo('');
    setMensajeAsanaMasivo('');
    setCargandoAsanaMasivo(true);
    axios
      .delete('/api/ordenes-publicidad/asana/borrar-masivo', { ...authHeaders(token), data: { ids } })
      .then((res) => {
        const resultados: Array<{ ordenId: string; borrada: boolean; error?: string }> = res.data;
        const borradas = resultados.filter((r) => r.borrada);
        const sinTarea = resultados.filter((r) => !r.borrada && !r.error);
        const fallidas = resultados.filter((r) => r.error);
        setOrdenes((prev) =>
          prev
            ? prev.map((o) =>
                borradas.some((r) => r.ordenId === o.id) ? { ...o, asana_task_gid: null, asana_asignado: false } : o
              )
            : prev
        );
        setMensajeAsanaMasivo(
          `Borradas: ${borradas.length}` +
            (sinTarea.length ? ` — sin tarea previa: ${sinTarea.length}` : '') +
            (fallidas.length ? ` — con error: ${fallidas.length}.` : '.')
        );
        if (fallidas.length > 0) setErrorAsanaMasivo(fallidas.map((r) => r.error).join(' — '));
      })
      .catch((err) => setErrorAsanaMasivo(mensajeError(err, 'No se pudieron borrar las tareas en Asana.')))
      .finally(() => setCargandoAsanaMasivo(false));
  };

  // Convierte una imagen servida por la app (ej. el logo) a dataURL para que
  // jsPDF pueda embeberla — jsPDF no acepta una URL de archivo directamente.
  const cargarImagenComoDataUrl = (src: string, anchoMaximo = 600): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // El logo fuente es de altísima resolución (pensado para impresión) —
        // se achica acá antes de embeber, si no el PDF pesa decenas de MB.
        const escala = Math.min(1, anchoMaximo / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * escala);
        canvas.height = Math.round(img.naturalHeight * escala);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('sin contexto de canvas'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('no se pudo cargar la imagen'));
      img.src = src;
    });

  // Export de una orden individual en PDF, formato "documento" (logo,
  // datos de facturación reales del cliente, grilla de días de emisión por
  // línea) — igual al mockup aprobado por el usuario. Por ahora solo PDF,
  // sin Excel.
  const handleExportarOrdenPDF = async (accion: 'preview' | 'descargar' = 'descargar') => {
    if (!detalle) return;
    // Se abre ACÁ, antes del await de la imagen del logo — si se abre
    // después, el navegador la trata como pop-up no solicitado y la bloquea.
    const previewTab = accion === 'preview' ? abrirPestañaPrevia() : null;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;

    try {
      const logoDataUrl = await cargarImagenComoDataUrl('/img/logo-topview.png');
      const props = doc.getImageProperties(logoDataUrl);
      const logoH = 32;
      const logoW = (props.width / props.height) * logoH;
      doc.addImage(logoDataUrl, 'PNG', marginX, 30, logoW, logoH);
    } catch {
      // Sin logo no se bloquea el export, solo no aparece.
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 19);
    doc.text('ORDEN DE PUBLICIDAD', pageWidth - marginX, 44, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 116, 105);
    doc.text(`Nro. orden agencia: ${detalle.numero_orden_agencia || '-'}`, pageWidth - marginX, 58, { align: 'right' });
    doc.text(`Fecha de emisión: ${formatFecha(new Date().toISOString().slice(0, 10))}`, pageWidth - marginX, 70, {
      align: 'right',
    });

    let y = 96;
    doc.setDrawColor(20, 20, 19);
    doc.setLineWidth(1.2);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 18;

    const cliente = detalle.cliente;
    const nombreFacturado = cliente?.razon_social || detalle.razon_social;
    const boxH = cliente ? 72 : 32;
    doc.setFillColor(252, 251, 248);
    doc.setDrawColor(229, 225, 216);
    doc.setLineWidth(0.75);
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, boxH, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(138, 133, 120);
    doc.text('FACTURAR A', marginX + 12, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 19);
    doc.text(nombreFacturado, marginX + 12, y + 29);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (cliente) {
      doc.setTextColor(20, 20, 19);
      doc.text(`CUIT ${cliente.cuit || '-'} — ${cliente.condicion_iva || ''}`, marginX + 12, y + 42);
      const dirLinea = [cliente.direccion, cliente.ciudad, cliente.provincia].filter(Boolean).join(' — ');
      doc.setTextColor(138, 133, 120);
      if (dirLinea) doc.text(dirLinea, marginX + 12, y + 54);
    }
    if (detalle.nombre_anunciante && nombreFacturado !== detalle.nombre_anunciante) {
      doc.setFontSize(8);
      doc.setTextColor(138, 133, 120);
      doc.text(`Anunciante real: ${detalle.nombre_anunciante}`, marginX + 12, y + (cliente ? 66 : 26));
    }
    y += boxH + 16;

    doc.setFontSize(9);
    doc.setTextColor(20, 20, 19);
    const infoLineas = [
      [`Tipo: ${detalle.tipo_anunciante}`, `Período: ${formatFecha(detalle.periodo_desde)} al ${formatFecha(detalle.periodo_hasta)}`],
      [`Importe: ${formatMoney(detalle.monto_neto)} + IVA`, ''],
    ];
    infoLineas.forEach((fila, i) => {
      doc.text(fila[0], marginX, y + i * 14);
      if (fila[1]) doc.text(fila[1], marginX + 260, y + i * 14);
    });
    y += infoLineas.length * 14 + 10;

    // El período de una orden acá no siempre coincide con un mes calendario
    // (ej. 26/8 al 26/10) — a diferencia de un documento tipo APESAU, que
    // siempre es un mes exacto. Por eso la grilla no es "días del mes con
    // algunos prendidos": son TODOS los días reales del período, del primero
    // al último, siempre prendidos.
    const inicio = new Date(`${detalle.periodo_desde}T00:00:00`);
    const fin = new Date(`${detalle.periodo_hasta}T00:00:00`);
    const msPorDia = 24 * 60 * 60 * 1000;
    const totalDias = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / msPorDia) + 1);
    const tituloDias = `Días de emisión — ${formatFecha(detalle.periodo_desde)} al ${formatFecha(detalle.periodo_hasta)} (${totalDias})`;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Ubicación / elemento', tituloDias, 'Cant.', 'Monto']],
      body: (detalle.detalles || []).map((d: any) => [
        `${d.locacion_nombre || d.ubicacion || '-'}\n${d.tipo_producto}${
          d.punto_instalacion ? ' — ' + d.punto_instalacion : ''
        }`,
        '',
        String(d.cantidad),
        formatMoney(d.precio || 0),
      ]),
      foot: [['TOTAL', '', '', formatMoney(detalle.monto_neto)]],
      rowPageBreak: 'avoid',
      styles: { fontSize: 8, cellPadding: 6, valign: 'middle', lineColor: [229, 225, 216] },
      headStyles: { fillColor: [20, 20, 19], textColor: 255, fontSize: 8 },
      footStyles: { fillColor: [240, 236, 225], textColor: [20, 20, 19], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: pageWidth - marginX * 2 - 150 - 40 - 70 },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 70, halign: 'right' },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const cellW = Math.min(10, (data.cell.width - 4) / totalDias);
        const cellH = 9;
        const startX = data.cell.x + 2;
        // El número que va arriba de cada celda es el día del mes REAL de esa
        // fecha (1 al 31), no el número de orden dentro del período — igual
        // que en un documento real, donde un período que cruza fin de mes
        // sigue mostrando 29, 30, 1, 2... y no una numeración propia.
        const mostrarNumeros = cellW >= 6;
        const grupoAlto = mostrarNumeros ? cellH + 7 : cellH;
        const grupoTop = data.cell.y + (data.cell.height - grupoAlto) / 2;
        const barY = grupoTop + (mostrarNumeros ? 7 : 0);
        doc.setDrawColor(180, 175, 160);
        // Con muchos días el borde de cada celda se pisa entre sí y ensucia
        // el dibujo — a partir de cierto ancho por celda se deja de dibujar
        // el borde individual y queda una barra sólida continua.
        if (cellW > 2) doc.setLineWidth(0.3);
        for (let dia = 0; dia < totalDias; dia++) {
          if (mostrarNumeros) {
            const fecha = new Date(inicio.getTime() + dia * msPorDia);
            doc.setFontSize(5);
            doc.setTextColor(120, 116, 105);
            doc.text(String(fecha.getDate()), startX + dia * cellW + cellW / 2, grupoTop + 5, { align: 'center' });
          }
          doc.setFillColor(244, 211, 94);
          if (cellW > 2) doc.rect(startX + dia * cellW, barY, cellW, cellH, 'FD');
          else doc.rect(startX + dia * cellW, barY, cellW, cellH, 'F');
        }
      },
    });

    doc.setFontSize(7.5);
    doc.setTextColor(138, 133, 120);
    const finalY = (doc as any).lastAutoTable?.finalY || y + 20;
    doc.text('En la factura debe estar detallado el número de orden, para poder recibirla.', marginX, finalY + 18);

    // Nombre identificable — cliente, número de orden interno y mes/año de
    // ingreso — en vez de solo el id interno OPB-... (imposible de ubicar en
    // una carpeta de descargas llena de archivos).
    const sanear = (s: string) => s.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const mesAno =
      detalle.mes_ingreso && detalle.ano_ingreso
        ? `${String(detalle.mes_ingreso).padStart(2, '0')}-${detalle.ano_ingreso}`
        : detalle.periodo_desde?.slice(0, 7).replace('-', '_') || '';
    const archivoNombre = `Orden_${sanear(detalle.razon_social)}_${detalle.numero_orden}_${mesAno}.pdf`;
    if (accion === 'preview') mostrarPdf(doc, archivoNombre, previewTab);
    else doc.save(archivoNombre);
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
      setMensajeClonado('');
      setErrorAsana('');
      setMensajeAsana('');
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
      // Se actualiza solo esa fila en memoria en vez de recargar toda la lista
      // (cargarOrdenes hace setOrdenes(null) mientras trae los datos, lo que
      // colapsa la tabla entera y tira el scroll al principio — molesto al
      // cambiar estado fila por fila en un listado largo).
      setOrdenes((prev) => (prev ? prev.map((o) => (o.id === id ? { ...o, estado: nuevoEstado } : o)) : prev));
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

  // Filtro mensual de la lista: por defecto arranca en el mes de ingreso
  // (venta) actual — "paginación" natural por mes en vez de números de
  // página genéricos, para no tener que cargar/scrollear todo el histórico
  // cada vez que se entra. "Ver todas" (más abajo) saca el filtro para
  // volver al comportamiento de antes.
  const hoyOrdenes = new Date();
  const [filtroMes, setFiltroMes] = useState(String(hoyOrdenes.getMonth() + 1));
  const [filtroAno, setFiltroAno] = useState(String(hoyOrdenes.getFullYear()));
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
  // facturarse recién en septiembre. Default: ingreso (venta), para que la
  // "paginación por mes" de arriba tenga sentido — es la pregunta "qué
  // vendí este mes", la más habitual al entrar a la lista. Mismo criterio
  // que separa "Venta mensual" de "Facturación bruta mensual" en Reportes →
  // Topview.
  const [filtroMesTipo, setFiltroMesTipo] = useState<'facturacion' | 'ingreso'>('ingreso');

  // Navega un mes hacia adelante/atrás (con acarreo de año) sobre el filtro
  // de mes/año elegido — funciona con cualquiera de los dos (ingreso o
  // facturación), lo que esté seleccionado en "Filtrar por".
  const cambiarMesFiltro = (delta: number) => {
    const mesBase = filtroMes ? Number(filtroMes) : hoyOrdenes.getMonth() + 1;
    const anoBase = filtroAno ? Number(filtroAno) : hoyOrdenes.getFullYear();
    let nuevoMes = mesBase + delta;
    let nuevoAno = anoBase;
    if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAno -= 1;
    } else if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAno += 1;
    }
    setFiltroMes(String(nuevoMes));
    setFiltroAno(String(nuevoAno));
  };

  // Mes/año de ingreso resuelto igual que al guardar la orden: si no se
  // cargó a mano, se toma el mes/año de "Período desde".
  const mesAnoIngresoDe = (o: OrdenPublicidad): [number, number] => {
    const [anoDesde, mesDesde] = o.periodo_desde.split('-').map(Number);
    return [o.ano_ingreso || anoDesde, o.mes_ingreso || mesDesde];
  };

  const anosDisponibles = Array.from(
    new Set([
      ...(filtroMesTipo === 'ingreso'
        ? (ordenes || []).map((o) => mesAnoIngresoDe(o)[0])
        : (ordenes || [])
            .map((o) => o.fecha_facturacion)
            .filter((f): f is string => !!f)
            .map((f) => Number(f.split('-')[0]))),
      // Si "Mes siguiente/anterior" navegó a un año sin ninguna orden
      // todavía, lo agregamos igual para que el <select> no quede
      // desincronizado del filtro real.
      ...(filtroAno ? [Number(filtroAno)] : []),
    ])
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
    // regulares y al final las "No se factura"). Alfabético por anunciante
    // dentro de cada combinación tipo+facturado (mismo criterio que el
    // Timeline, para que ambas vistas se lean igual).
    .sort((a, b) => {
      const grupo = TIPOS_ANUNCIANTE.indexOf(a.tipo_anunciante) - TIPOS_ANUNCIANTE.indexOf(b.tipo_anunciante);
      if (grupo !== 0) return grupo;
      const registro = Number(!esOrdenFacturado(a)) - Number(!esOrdenFacturado(b));
      if (registro !== 0) return registro;
      return a.nombre_anunciante.localeCompare(b.nombre_anunciante, 'es', { sensitivity: 'base' });
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
    const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_monto_2 || 0) - (o.descuento_facturas_monto || 0);
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
      const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_monto_2 || 0) - (o.descuento_facturas_monto || 0);
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

    // Misma fila de totales que ya se ve en pantalla (tfoot de la tabla):
    // suma por soporte, $ Neto s/desc, $ Neto blanco y Neto Topview.
    const filaTotalesExcel = ws.addRow([
      `Totales (${ordenesFiltradas.length} órdenes)`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ...soportes.map((p) => totalesFila.porProducto[p.id] || 0),
      totalesFila.montoNeto,
      '',
      '',
      totalesFila.netoBlanco,
      totalesFila.montoFinal,
      '',
      '',
      '',
    ]);
    filaTotalesExcel.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' } };
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

  const handleExportarPDF = (accion: 'preview' | 'descargar' = 'descargar') => {
    const soportes = productosSoportes;
    const columnas = columnasExport(soportes);
    const filas = ordenesFiltradas.map((o) => filaExport(o, soportes, false));

    // Con ~23 columnas, una A4 landscape le da tan poco ancho a cada una que
    // autoTable termina cortando palabras letra por letra en vez de ajustar
    // por palabra ("Anunciant/e", "Pautas M/ensuales"). Se pasa a A3
    // landscape (más ancho real) y se les da un ancho fijo angosto a las
    // columnas de cantidad por soporte y a los % (solo llevan un número
    // corto o "-"), para que el resto de las columnas de texto tengan más
    // aire y el ajuste vuelva a ser por palabra.
    const idxSoportesStart = 8;
    const idxSoportesEnd = idxSoportesStart + soportes.length - 1;
    const idxNeto = idxSoportesEnd + 1;
    const idxNC = idxNeto + 1;
    const idxFC = idxNC + 1;
    const columnStyles: Record<number, { cellWidth: number }> = {};
    for (let i = idxSoportesStart; i <= idxSoportesEnd; i++) columnStyles[i] = { cellWidth: 8 };
    columnStyles[idxNC] = { cellWidth: 10 };
    columnStyles[idxFC] = { cellWidth: 10 };

    // Misma fila de totales que ya se ve en pantalla: suma por soporte,
    // $ Neto s/desc, $ Neto blanco y Neto Topview.
    const filaTotalesPDF = [
      `Totales (${ordenesFiltradas.length} órdenes)`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ...soportes.map((p) => String(totalesFila.porProducto[p.id] || '-')),
      formatMoney(totalesFila.montoNeto),
      '',
      '',
      formatMoney(totalesFila.netoBlanco),
      formatMoney(totalesFila.montoFinal),
      '',
      '',
      '',
    ];

    const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
    autoTable(doc, {
      head: [columnas],
      body: filas as any,
      foot: [filaTotalesPDF],
      styles: { fontSize: 6, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [232, 24, 56] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles,
    });
    const archivoNombre = nombreArchivoExport('pdf');
    if (accion === 'preview') mostrarPdf(doc, archivoNombre);
    else doc.save(archivoNombre);
  };

  const handleChangeOrden = (campo: keyof typeof ORDEN_VACIA, valor: string | boolean) => {
    setOrdenForm((prev) => ({ ...prev, [campo]: valor }));
  };

  // Si "Vigencia hasta (nota libre)" está vacía, se autocompleta con el mes
  // elegido en "Repetir automáticamente hasta" — son el mismo concepto en el
  // 99% de los casos, y así no hay que tipearlo dos veces. No pisa una nota
  // que el usuario ya haya escrito a mano.
  const handleChangeVigenciaHastaMes = (valor: string) => {
    setOrdenForm((prev) => ({
      ...prev,
      vigencia_hasta_mes: valor,
      vigencia_hasta_nota: prev.vigencia_hasta_nota.trim() ? prev.vigencia_hasta_nota : valor ? NOMBRES_MES[Number(valor) - 1] : prev.vigencia_hasta_nota,
    }));
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
  let descuentoMonto2 = 0;
  let descuentoFacturasMonto = 0;
  {
    let montoActual = montoNeto;
    [
      { pct: Number(ordenForm.descuento_porcentaje) || 0, cascada: ordenForm.descuento_en_cascada },
      { pct: Number(ordenForm.descuento_porcentaje_2) || 0, cascada: ordenForm.descuento_en_cascada_2 },
      { pct: Number(ordenForm.descuento_facturas_porcentaje) || 0, cascada: ordenForm.descuento_facturas_en_cascada },
    ].forEach(({ pct, cascada }, idx) => {
      const base = cascada ? montoActual : montoNeto;
      const monto = base * (pct / 100);
      if (cascada) montoActual -= monto;
      if (idx === 0) descuentoMonto = monto;
      else if (idx === 1) descuentoMonto2 = monto;
      else descuentoFacturasMonto = monto;
    });
  }
  const montoNetoAplicado = montoNeto - descuentoMonto - descuentoMonto2;
  const montoFinal = montoNeto - descuentoMonto - descuentoMonto2 - descuentoFacturasMonto;

  // Vista previa de qué órdenes se van a clonar automáticamente al guardar
  // (ver crearOrden en el backend) — mismo cálculo, solo para mostrar antes
  // de mandar el formulario. Sale vacío si falta período o si "Vigencia
  // hasta" no es posterior al mes de ingreso de esta orden.
  const clonesVigenciaPreview: Array<{ mes: number; ano: number; periodoDesde: string; periodoHasta: string }> = [];
  if (ordenForm.vigencia_hasta_mes && ordenForm.vigencia_hasta_ano && ordenForm.periodo_desde && ordenForm.periodo_hasta) {
    const vigenciaMes = Number(ordenForm.vigencia_hasta_mes);
    const vigenciaAno = Number(ordenForm.vigencia_hasta_ano);
    const [anoDesde0, mesDesde0] = ordenForm.periodo_desde.split('-').map(Number);
    let mesActual = ordenForm.mes_ingreso ? Number(ordenForm.mes_ingreso) : mesDesde0;
    let anoActual = ordenForm.ano_ingreso ? Number(ordenForm.ano_ingreso) : anoDesde0;
    let desdeActual = ordenForm.periodo_desde;
    let hastaActual = ordenForm.periodo_hasta;
    let guarda = 0;
    while ((anoActual < vigenciaAno || (anoActual === vigenciaAno && mesActual < vigenciaMes)) && guarda < 36) {
      desdeActual = addMonthClamped(desdeActual);
      hastaActual = addMonthClamped(hastaActual);
      mesActual += 1;
      if (mesActual > 12) {
        mesActual = 1;
        anoActual += 1;
      }
      clonesVigenciaPreview.push({ mes: mesActual, ano: anoActual, periodoDesde: desdeActual, periodoHasta: hastaActual });
      guarda += 1;
    }
  }

  // 'base': cada comisionista cobra su % directo del mismo monto final (varios
  // actores en paralelo, ej. comisión con factura + comisión en efectivo, que no
  // se descuentan entre sí). 'cascada': cada nivel cobra su % sobre lo que va
  // quedando después de TODOS los niveles anteriores (sean 'cascada' o 'base') —
  // un nivel 'base' también resta de ese remanente para el siguiente en cascada,
  // solo que su propio % se calcula sobre el monto final fijo, no sobre el
  // remanente. Validado contra el caso real IPG/AMEX: LatamNet 15% base + Pupy
  // 5% base + Juan 5% cascada sobre el remanente de los dos anteriores (no
  // sobre el monto final entero) — mismo cálculo que TopviewService en el
  // backend, para que la previsualización nunca diverja del monto guardado.
  const comisiones = lineasIntermediarios.reduce((acc, inter, idx) => {
    const pct = Number(inter.porcentaje_comision) / 100 || 0;
    const montoActualCascada = idx === 0 ? montoFinal : acc[idx - 1].montoActualCascada;
    const montoAcumuladoPrevio = idx === 0 ? 0 : acc[idx - 1].montoAcumuladoComisiones;
    const montoComision = inter.tipo_calculo === 'base' ? montoFinal * pct : montoActualCascada * pct;
    const montoActualCascadaNuevo = montoActualCascada - montoComision;
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
          descuento_porcentaje_2: Number(ordenForm.descuento_porcentaje_2) || 0,
          descuento_en_cascada_2: ordenForm.descuento_en_cascada_2,
          descuento_facturas_porcentaje: Number(ordenForm.descuento_facturas_porcentaje) || 0,
          descuento_facturas_en_cascada: ordenForm.descuento_facturas_en_cascada,
          mes_ingreso: ordenForm.mes_ingreso ? Number(ordenForm.mes_ingreso) : undefined,
          ano_ingreso: ordenForm.ano_ingreso ? Number(ordenForm.ano_ingreso) : undefined,
          facturado: ordenForm.facturado,
          notas: ordenForm.notas,
          vigencia_hasta_nota: ordenForm.vigencia_hasta_nota.trim() || undefined,
          vigencia_hasta_mes: ordenForm.vigencia_hasta_mes ? Number(ordenForm.vigencia_hasta_mes) : undefined,
          vigencia_hasta_ano: ordenForm.vigencia_hasta_ano ? Number(ordenForm.vigencia_hasta_ano) : undefined,
          avisar_telegram: ordenForm.avisar_telegram,
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

      let respuesta;
      if (editandoOrdenId) {
        respuesta = await axios.put(`/api/ordenes-publicidad/${editandoOrdenId}`, payload, authHeaders(token));
        setMostrarForm(false);
        cargarOrdenes();
        cargarDetalle(editandoOrdenId);
        setEditandoOrdenId(null);
      } else {
        respuesta = await axios.post('/api/ordenes-publicidad', payload, authHeaders(token));
        setMostrarForm(false);
        cargarOrdenes();
      }

      const clonado = respuesta.data?._clonado;
      if (clonado) {
        const partes: string[] = [];
        if (clonado.creadas > 0) {
          partes.push(`Se crearon ${clonado.creadas} orden(es) más (mes a mes, con N° de orden "REVISAR").`);
        }
        if (clonado.saltadas?.length > 0) {
          const listado = clonado.saltadas.map((s: { mes: number; ano: number }) => `${NOMBRES_MES[s.mes - 1]} ${s.ano}`).join(', ');
          partes.push(`Ya existía una orden de este cliente para: ${listado} — no se duplicó.`);
        }
        setMensajeClonado(partes.join(' '));
      } else {
        setMensajeClonado('');
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
    setPreviewAsana(null);
    setErrorAsana('');
    setMensajeAsana('');
    axios
      .get(`/api/ordenes-publicidad/${id}`, authHeaders(token))
      .then((res) => setDetalle(res.data))
      .catch((err) => setErrorDetalle(mensajeError(err, 'No se pudo cargar la orden.')))
      .finally(() => setCargandoDetalle(false));
  };

  // Acceso directo desde Liquidaciones/Comisionistas: si llega un id (vía
  // "Ver orden"/N° de orden en esa pantalla), lo abre acá y avisa para que
  // el padre limpie el pedido. Marca que esta orden puntual vino de otra
  // solapa, para que "‹ Volver a la lista" vuelva ahí en vez de quedarse
  // siempre en la lista general de Órdenes.
  useEffect(() => {
    if (ordenIdParaAbrir) {
      cargarDetalle(ordenIdParaAbrir);
      setVinoDeOtraPestana(true);
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

  const handleVerDocumento = (docId: string) => {
    // La pestaña se abre en blanco de forma síncrona con el click (si no,
    // el navegador bloquea el window.open posterior a la respuesta async).
    const nuevaVentana = window.open('', '_blank');
    axios
      .get(`/api/ordenes-publicidad/documentos/${docId}/descargar`, {
        ...authHeaders(token),
        responseType: 'blob',
      })
      .then((res) => {
        const tipo = String(res.headers['content-type'] || 'application/octet-stream');
        const url = window.URL.createObjectURL(new Blob([res.data], { type: tipo }));
        if (nuevaVentana) {
          nuevaVentana.location.href = url;
        } else {
          window.open(url, '_blank');
        }
        // No se revoca enseguida: la pestaña nueva necesita la URL para cargar el archivo.
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      })
      .catch(() => {
        nuevaVentana?.close();
        setErrorDocumento('No se pudo abrir el archivo.');
      });
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
        <div className="view-header" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
          <button
            className="btn-link"
            onClick={() => {
              setDetalleId(null);
              if (vinoDeOtraPestana) {
                setVinoDeOtraPestana(false);
                onVolverASeccionOrigen?.();
              }
            }}
          >
            ‹ Volver a la lista
          </button>
          {puedeEditar && detalle && (
            <button className="btn btn-editar-orden" onClick={handleEditarOrden}>
              Editar orden
            </button>
          )}
          {detalle && (
            <PdfExportMenu
              etiqueta="PDF"
              onPreview={() => handleExportarOrdenPDF('preview')}
              onDescargar={() => handleExportarOrdenPDF('descargar')}
            />
          )}
          {puedeEditar && detalle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button className="btn btn-asana-generar" onClick={() => handleGenerarAsana(detalle.id)} disabled={cargandoAsana}>
                {cargandoAsana ? 'Generando...' : detalle.asana_task_gid ? 'Actualizar tarea en Asana' : 'Generar tarea en Asana'}
              </button>
              <button
                type="button"
                className="btn-link"
                style={{ fontSize: '0.8rem', alignSelf: 'flex-start' }}
                onClick={() => handleVerPreviewAsana(detalle.id)}
                disabled={cargandoAsana}
              >
                Ver qué se manda a Asana
              </button>
            </div>
          )}
          {puedeEditar && detalle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button className="btn btn-asana-asignar" onClick={() => handleAsignarAsana(detalle.id)} disabled={cargandoAsana}>
                {cargandoAsana ? 'Asignando...' : 'Asignar responsables'}
              </button>
              <span className="btn-link" style={{ fontSize: '0.8rem', cursor: 'default' }}>
                {detalle.asana_asignado ? 'Asignado' : 'No Asignado'}
              </span>
            </div>
          )}
          {puedeEditar && detalle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button
                className="btn btn-asana-borrar"
                onClick={() => handleBorrarAsana(detalle.id, detalle.nombre_anunciante)}
                disabled={cargandoAsana}
              >
                {cargandoAsana ? 'Borrando...' : 'Borrar tareas Asana'}
              </button>
              {detalle.asana_task_gid && (
                <span style={{ color: '#2f855a', fontWeight: 500, fontSize: '0.8rem' }}>✓ Ya tiene una tarea en Asana</span>
              )}
            </div>
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

        {errorAsana && <div className="error-message">{errorAsana}</div>}
        {mensajeAsana && <div className="success-message">{mensajeAsana}</div>}
        {previewAsana && (
          <div
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '0.9rem 1rem',
              margin: '0.5rem 0 1rem',
              background: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong>Esto es lo que se manda a Asana (nombre de la tarea + cuerpo):</strong>
              <button type="button" className="btn-link" onClick={() => setPreviewAsana(null)}>
                Cerrar
              </button>
            </div>
            <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{previewAsana.name}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{previewAsana.notes}</pre>
          </div>
        )}

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

              <dt>Descuento comercial (NC 1)</dt>
              <dd>{detalle.descuento_porcentaje}% ({formatMoney(detalle.descuento_monto)})</dd>

              {!!detalle.descuento_porcentaje_2 && (
                <>
                  <dt>Descuento comercial (NC 2)</dt>
                  <dd>
                    {detalle.descuento_porcentaje_2}% ({formatMoney(detalle.descuento_monto_2)}) —{' '}
                    {detalle.descuento_en_cascada_2 ? 'en cascada sobre el remanente del NC 1' : 'directo sobre el bruto'}
                  </dd>
                </>
              )}

              <dt>Descuento facturas (FC)</dt>
              <dd>
                {detalle.descuento_facturas_porcentaje}% ({formatMoney(detalle.descuento_facturas_monto)}) —{' '}
                {detalle.descuento_facturas_en_cascada ? 'en cascada sobre el remanente' : 'directo sobre el bruto'}
              </dd>

              {/* Desagregado de comisiones a comisionistas — solo llega del
                  servidor si el usuario tiene topview_netos_ver (Administrador/
                  socios); el resto de la jerarquía nunca ve este bloque. */}
              {(detalle.comisiones_desagregado || []).map((c: any, i: number) => (
                <Fragment key={i}>
                  <dt>
                    Comisión {c.intermediario_nombre} ({c.factura_formal ? 'Tipo 1' : 'Tipo 2'})
                  </dt>
                  <dd>
                    {c.porcentaje_comision}% ({formatMoney(c.monto_comision)}) —{' '}
                    {c.tipo_calculo === 'cascada' ? 'en cascada sobre el remanente' : 'sobre el neto blanco'}
                  </dd>
                </Fragment>
              ))}

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
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn-link" onClick={() => handleVerDocumento(d.id)}>
                              Previsualizar
                            </button>
                            <button className="btn-link" onClick={() => handleDescargarDocumento(d.id, d.nombre_archivo)}>
                              Descargar
                            </button>
                          </div>
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
        const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_monto_2 || 0) - (o.descuento_facturas_monto || 0);
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

  // Mismo desglose de arriba pero acotado a lo tildado para Asana — sirve
  // para controlar (ej. tildar un lote y comparar la suma contra lo que se
  // espera facturar) sin tener que armar el filtro exacto de esas órdenes.
  const ordenesSeleccionadas = (ordenes || []).filter((o) => seleccionadasAsana.has(o.id));
  const seleccionRegistradas = ordenesSeleccionadas.filter(esOrdenFacturado);
  const seleccionNoRegistradas = ordenesSeleccionadas.filter((o) => !esOrdenFacturado(o));
  const totalesSeleccionRegistrado = calcularTotales(seleccionRegistradas);
  const totalesSeleccionNoRegistrado = calcularTotales(seleccionNoRegistradas);

  return (
    <>
      <div className="view-header">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {puedeCrear && (
            <button
              className="btn-primary"
              style={{ whiteSpace: 'nowrap', flexShrink: 0, width: '15.75rem', textAlign: 'center' }}
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
          {puedeCrear && mostrarForm && (
            <button type="submit" form="orden-form" className="btn btn-success" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          )}
          {puedeEditar && mostrarForm && editandoOrdenId && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-asana-generar"
                onClick={() => handleGenerarAsana(editandoOrdenId)}
                disabled={cargandoAsana}
              >
                {cargandoAsana ? 'Generando...' : asanaGidActual ? 'Actualizar tarea en Asana' : 'Generar tarea en Asana'}
              </button>
              <button
                type="button"
                className="btn-link"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.3rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                }}
                onClick={() => handleVerPreviewAsana(editandoOrdenId)}
                disabled={cargandoAsana}
              >
                Ver qué se manda a Asana
              </button>
            </div>
          )}
          {puedeEditar && mostrarForm && editandoOrdenId && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-asana-asignar"
                onClick={() => handleAsignarAsana(editandoOrdenId)}
                disabled={cargandoAsana}
              >
                {cargandoAsana ? 'Asignando...' : 'Asignar responsables'}
              </button>
              <span
                className="btn-link"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.3rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                  cursor: 'default',
                }}
              >
                {asanaAsignadoActual ? 'Asignado' : 'No Asignado'}
              </span>
            </div>
          )}
          {puedeEditar && mostrarForm && editandoOrdenId && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-asana-borrar"
                onClick={() => handleBorrarAsana(editandoOrdenId, ordenForm.nombre_anunciante)}
                disabled={cargandoAsana}
              >
                {cargandoAsana ? 'Borrando...' : 'Borrar tareas Asana'}
              </button>
              {asanaGidActual && (
                <span
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.3rem',
                    whiteSpace: 'nowrap',
                    color: '#2f855a',
                    fontWeight: 500,
                    fontSize: '0.8rem',
                  }}
                >
                  ✓ Ya tiene una tarea en Asana
                </span>
              )}
            </div>
          )}
          {puedeEditar && !mostrarForm && ordenes && ordenes.length > 0 && (
            <>
            <button
              type="button"
              className="btn btn-asana-generar"
              style={{ whiteSpace: 'nowrap', flexShrink: 0, width: '15.75rem', textAlign: 'center' }}
              onClick={handleGenerarAsanaMasivo}
              disabled={cargandoAsanaMasivo || seleccionadasAsana.size === 0}
            >
              {cargandoAsanaMasivo ? 'Generando...' : 'Generar/actualizar en Asana'}
            </button>
            <button
              type="button"
              className="btn btn-asana-asignar"
              style={{ whiteSpace: 'nowrap', flexShrink: 0, width: '15.75rem', textAlign: 'center' }}
              onClick={handleAsignarAsanaMasivo}
              disabled={cargandoAsanaMasivo || seleccionadasAsana.size === 0}
            >
              {cargandoAsanaMasivo ? 'Asignando...' : 'Asignar responsables'}
            </button>
            <button
              type="button"
              className="btn btn-asana-borrar"
              style={{ whiteSpace: 'nowrap', flexShrink: 0, width: '15.75rem', textAlign: 'center' }}
              onClick={handleBorrarAsanaMasivo}
              disabled={cargandoAsanaMasivo || seleccionadasAsana.size === 0}
            >
              {cargandoAsanaMasivo ? 'Borrando...' : 'Borrar tareas Asana'}
            </button>
            <span
              title="Tildá órdenes en la tabla para aplicar estas acciones de Asana a todas de una"
              style={{ fontSize: '0.85rem', color: '#555', whiteSpace: 'nowrap' }}
            >
              {seleccionadasAsana.size} orden(es) tildada(s)
            </span>
            <button
              type="button"
              className="btn-link"
              style={{ whiteSpace: 'nowrap', visibility: seleccionadasAsana.size > 0 ? 'visible' : 'hidden' }}
              onClick={() => setSeleccionadasAsana(new Set())}
              disabled={cargandoAsanaMasivo}
            >
              Vaciar selección
            </button>
            </>
          )}
        </div>
      </div>

      {mostrarForm && errorAsana && <div className="error-message">{errorAsana}</div>}
      {mostrarForm && mensajeAsana && <div className="success-message">{mensajeAsana}</div>}
      {!mostrarForm && errorAsanaMasivo && <div className="error-message">{errorAsanaMasivo}</div>}
      {!mostrarForm && mensajeAsanaMasivo && (
        <div className="success-message" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{mensajeAsanaMasivo}</span>
          <button type="button" className="btn-link" onClick={() => setMensajeAsanaMasivo('')}>
            Cerrar
          </button>
        </div>
      )}
      {mostrarForm && previewAsana && (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '0.9rem 1rem',
            margin: '0.5rem 0 1rem',
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Esto es lo que se manda a Asana (nombre de la tarea + cuerpo):</strong>
            <button type="button" className="btn-link" onClick={() => setPreviewAsana(null)}>
              Cerrar
            </button>
          </div>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{previewAsana.name}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{previewAsana.notes}</pre>
        </div>
      )}
      {error && ordenes && ordenes.length > 0 && <div className="error-message">{error}</div>}
      {mensajeClonado && (
        <div className="success-message" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{mensajeClonado}</span>
          <button type="button" className="btn-link" onClick={() => setMensajeClonado('')}>
            Cerrar
          </button>
        </div>
      )}

      {mostrarForm && (
        <form id="orden-form" className="cliente-form" onSubmit={handleSubmit}>
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
              onChange={(e) =>
                setOrdenForm((p) => ({
                  ...p,
                  tipo_anunciante: e.target.value,
                  facturado: e.target.value === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO ? false : p.facturado,
                }))
              }
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
            <label htmlFor="orden_avisar_telegram" style={{ fontWeight: 'normal' }}>
              <input
                id="orden_avisar_telegram"
                type="checkbox"
                checked={ordenForm.avisar_telegram}
                onChange={(e) => handleChangeOrden('avisar_telegram', e.target.checked)}
                disabled={guardando}
              />
              {' '}Avisar a Operaciones por Telegram (orden nueva y el día que arranca)
            </label>
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

          <div
            style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: '1.3fr 1fr',
              gap: '1.25rem',
              alignItems: 'stretch',
            }}
          >
            <div
              className="form-group"
              style={{ border: '1.5px dashed #e81838', borderRadius: '8px', padding: '0.9rem 1rem', background: '#fff7f8', margin: 0 }}
            >
              <label
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#e81838',
                }}
              >
                Repetir automáticamente hasta (opcional)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 'normal', margin: 0 }}>
                  Mes
                  <select
                    value={ordenForm.vigencia_hasta_mes}
                    onChange={(e) => handleChangeVigenciaHastaMes(e.target.value)}
                    disabled={guardando}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  >
                    <option value="">Sin repetir</option>
                    {NOMBRES_MES.map((nombre, i) => (
                      <option key={i + 1} value={i + 1}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontWeight: 'normal', margin: 0 }}>
                  Año
                  <select
                    value={ordenForm.vigencia_hasta_ano}
                    onChange={(e) => handleChangeOrden('vigencia_hasta_ano', e.target.value)}
                    disabled={guardando || !ordenForm.vigencia_hasta_mes}
                    style={{ display: 'block', marginTop: '0.25rem', width: '7rem' }}
                  >
                    <option value="">—</option>
                    {[2025, 2026, 2027, 2028].map((ano) => (
                      <option key={ano} value={ano}>
                        {ano}
                      </option>
                    ))}
                  </select>
                </label>
                <small style={{ paddingBottom: '0.4rem' }}>Vacío = no repite (comportamiento de siempre)</small>
              </div>

              {clonesVigenciaPreview.length > 0 && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    background: '#f4f6f4',
                    border: '1px solid #dde3dd',
                    borderRadius: '6px',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#2e7d32', marginBottom: '0.3rem' }}>
                    Al guardar se van a crear automáticamente (los meses que ya tengan una orden de este cliente se saltean):
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {clonesVigenciaPreview.map((c) => (
                      <li key={`${c.mes}-${c.ano}`}>
                        {NOMBRES_MES[c.mes - 1]} {c.ano} — {formatFecha(c.periodoDesde)} al {formatFecha(c.periodoHasta)} —{' '}
                        <span style={{ color: '#e81838', fontWeight: 600 }}>REVISAR</span> (mismo desglose que esta)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
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

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Productos / soportes *</label>
            <div
              className="linea-factura"
              style={{
                gridTemplateColumns: '1.3fr 1.8fr 70px 1.2fr 1fr 1.6fr auto',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#666',
              }}
            >
              <span>Locación</span>
              <span>Producto / Soporte</span>
              <span>Cantidad</span>
              <span>Posición</span>
              <span>Precio</span>
              <span>Notas</span>
              <span></span>
            </div>
            {lineasProductos.map((linea, i) => {
              const locacionElegida = locaciones.find((loc) => loc.id === linea.locacion_id);
              const soporteEnLocacion = (locacionElegida?.soportes || []).find((s: any) => s.producto_id === linea.producto_id);
              const puntosDisponibles = soporteEnLocacion?.puntos || [];
              // Con locación elegida, solo se ofrecen los soportes que esa
              // locación realmente tiene cargados en su inventario (evita
              // armar una orden con un soporte que no existe ahí, ej. PPLs
              // en una locación que solo tiene Pantalla Gran Formato). Se
              // conserva visible el producto ya guardado aunque no esté en
              // el inventario, para no esconder/romper una línea existente
              // — el usuario lo ve y lo corrige a mano.
              const productosDisponibles = (productos || [])
                .filter((p) => p.tipo !== 'servicio')
                .filter(
                  (p) =>
                    !locacionElegida ||
                    (locacionElegida.soportes || []).some((s: any) => s.producto_id === p.id) ||
                    p.id === linea.producto_id
                );
              return (
              <div className="linea-factura" key={i} style={{ gridTemplateColumns: '1.3fr 1.8fr 70px 1.2fr 1fr 1.6fr auto' }}>
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
                  value={linea.producto_id}
                  onChange={(e) => handleChangeProducto(i, 'producto_id', e.target.value)}
                  disabled={guardando}
                >
                  <option value="">
                    {productos === null
                      ? 'Cargando...'
                      : productos.length === 0
                      ? 'No hay productos cargados'
                      : locacionElegida && productosDisponibles.length === 0
                      ? 'Esta locación no tiene soportes cargados'
                      : 'Elegir producto'}
                  </option>
                  {productosDisponibles.map((p) => (
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
                checked={ordenForm.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO ? false : ordenForm.facturado}
                onChange={(e) => handleChangeOrden('facturado', e.target.checked)}
                disabled={guardando || ordenForm.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO}
              />
              {' '}Esta orden genera facturación
              {ordenForm.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO && (
                <small style={{ display: 'block', fontWeight: 'normal' }}>
                  Deshabilitado: es una Pauta Concesionario, Topview no la factura.
                </small>
              )}
            </label>
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Montos y descuentos en cascada</label>

            <div className="linea-factura" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <InputMiles
                placeholder="Monto neto (vacío = suma de líneas)"
                value={ordenForm.monto_neto}
                onChange={(v) => handleChangeOrden('monto_neto', v)}
                disabled={guardando}
              />
              <InputPorcentaje
                placeholder="Descuento comercial (NC 1)"
                value={ordenForm.descuento_porcentaje}
                onChange={(v) => handleChangeOrden('descuento_porcentaje', v)}
                disabled={guardando}
              />
              <InputPorcentaje
                placeholder="Descuento comercial (NC 2, opcional)"
                value={ordenForm.descuento_porcentaje_2}
                onChange={(v) => handleChangeOrden('descuento_porcentaje_2', v)}
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
              solo sumando el precio de cada línea en "Productos / soportes" de arriba. El NC 2 es opcional — algunas
              agencias negocian un segundo descuento comercial además del primero, se aplica NC 1 → NC 2 → FC en ese
              orden.
            </small>

            <label htmlFor="orden_desc_cascada" style={{ fontWeight: 'normal', marginTop: '0.5rem', display: 'block' }}>
              <input
                id="orden_desc_cascada"
                type="checkbox"
                checked={ordenForm.descuento_en_cascada}
                onChange={(e) => handleChangeOrden('descuento_en_cascada', e.target.checked)}
                disabled={guardando}
              />
              {' '}Descuento comercial (NC 1) en cascada (reduce la base antes de calcular el NC 2 y el de facturas — solo importa si esos también están en cascada; si no, da lo mismo tildado o no)
            </label>

            <label htmlFor="orden_desc_cascada_2" style={{ fontWeight: 'normal', marginTop: '0.5rem', display: 'block' }}>
              <input
                id="orden_desc_cascada_2"
                type="checkbox"
                checked={ordenForm.descuento_en_cascada_2}
                onChange={(e) => handleChangeOrden('descuento_en_cascada_2', e.target.checked)}
                disabled={guardando}
              />
              {' '}Descuento comercial (NC 2) en cascada sobre el remanente del NC 1 (si no, se calcula directo sobre el mismo bruto que el NC 1 — depende de lo negociado con cada agencia)
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
              Monto neto: {formatMoney(montoNeto)} · Menos desc. comercial (NC 1): -{formatMoney(descuentoMonto)}
              {Number(ordenForm.descuento_porcentaje_2) > 0 && (
                <> · Menos desc. comercial (NC 2): -{formatMoney(descuentoMonto2)}</>
              )}
              {' '}· Menos desc. facturas: -{formatMoney(descuentoFacturasMonto)} · Monto final:{' '}
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
                  step="any"
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
            <button type="submit" className="btn btn-success" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button type="button" className="btn-secondary" onClick={() => cambiarMesFiltro(-1)} title="Mes anterior">
                ◀
              </button>
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
              <button type="button" className="btn-secondary" onClick={() => cambiarMesFiltro(1)} title="Mes siguiente">
                ▶
              </button>
            </div>
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
          <button
            type="button"
            className="btn-link"
            style={{
              visibility:
                filtroMes !== String(hoyOrdenes.getMonth() + 1) ||
                filtroAno !== String(hoyOrdenes.getFullYear()) ||
                busqueda ||
                filtroFacturado ||
                filtroTipoAnunciante ||
                filtroMesTipo !== 'ingreso'
                  ? 'visible'
                  : 'hidden',
            }}
            onClick={() => {
              setFiltroMes('');
              setFiltroAno('');
              setBusqueda('');
              setFiltroFacturado('');
              setFiltroTipoAnunciante('');
              setFiltroMesTipo('ingreso');
              setSeleccionadasAsana(new Set());
            }}
          >
            Limpiar filtro
          </button>
        </div>
      )}

      {ordenes && ordenes.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={handleExportarExcel} disabled={ordenesFiltradas.length === 0}>
            Exportar Excel
          </button>
          <PdfExportMenu
            etiqueta="PDF"
            disabled={ordenesFiltradas.length === 0}
            onPreview={() => handleExportarPDF('preview')}
            onDescargar={() => handleExportarPDF('descargar')}
          />
        </div>
      )}

      {ordenes && ordenes.length > 0 && seleccionadasAsana.size > 0 && (
        <div
          className="empty-state"
          style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.2rem', border: '1px solid #90cdf4', background: '#ebf8ff' }}
        >
          <div style={{ fontWeight: 600 }}>Selección ({ordenesSeleccionadas.length} orden{ordenesSeleccionadas.length === 1 ? '' : 'es'} tildada{ordenesSeleccionadas.length === 1 ? '' : 's'})</div>
          <div>
            Registrado ({seleccionRegistradas.length}): <strong>{formatMoney(totalesSeleccionRegistrado.montoNeto)}</strong>
          </div>
          <div>
            No registrado ({seleccionNoRegistradas.length}): <strong>{formatMoney(totalesSeleccionNoRegistrado.montoNeto)}</strong>
          </div>
          <div>
            Total seleccionado:{' '}
            <strong>{formatMoney(totalesSeleccionRegistrado.montoNeto + totalesSeleccionNoRegistrado.montoNeto)}</strong>
          </div>
          <div>
            Total Neto blanco:{' '}
            <strong>{formatMoney(totalesSeleccionRegistrado.netoBlanco + totalesSeleccionNoRegistrado.netoBlanco)}</strong>
          </div>
          <div>
            Neto Topview (post-comisión):{' '}
            <strong>{formatMoney(totalesSeleccionRegistrado.montoFinal + totalesSeleccionNoRegistrado.montoFinal)}</strong>
          </div>
        </div>
      )}

      {ordenes && ordenes.length > 0 && seleccionadasAsana.size === 0 && (
        <div className="empty-state" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div>
            Registrado ({ordenesRegistradas.length} órdenes): <strong>{formatMoney(totalesRegistrado.montoNeto)}</strong>
          </div>
          <div>
            No registrado ({ordenesNoRegistradas.length} órdenes):{' '}
            <strong>{formatMoney(totalesNoRegistrado.montoNeto)}</strong>
            {ordenesNoRegistradas.length > 0 && (
              <span style={{ fontSize: '0.85em', color: '#666' }}>
                {' '}
                (cobrado {noRegistradasCobradas.length}: {formatMoney(totalesNoRegistradoCobrado.montoNeto)} · pendiente{' '}
                {noRegistradasPendientes.length}: {formatMoney(totalesNoRegistradoPendiente.montoNeto)})
              </span>
            )}
          </div>
          <div>
            Total general: <strong>{formatMoney(totalesRegistrado.montoNeto + totalesNoRegistrado.montoNeto)}</strong>
          </div>
          <div>
            Total Neto blanco: <strong>{formatMoney(totalesRegistrado.netoBlanco + totalesNoRegistrado.netoBlanco)}</strong>
          </div>
          <div>
            Neto Topview (post-comisión):{' '}
            <strong>{formatMoney(totalesRegistrado.montoFinal + totalesNoRegistrado.montoFinal)}</strong>
          </div>
        </div>
      )}

      {ordenes && ordenes.length > 0 && ordenesFiltradas.length === 0 && (
        <p className="empty-state">Ninguna orden coincide con el filtro elegido.</p>
      )}

      {ordenesFiltradas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              {puedeEditar && (
                <th>
                  <input
                    type="checkbox"
                    title="Tildar todas las que quedaron con este filtro"
                    checked={ordenesFiltradas.every((o) => seleccionadasAsana.has(o.id))}
                    onChange={(e) => {
                      const marcar = e.target.checked;
                      setSeleccionadasAsana((prev) => {
                        const next = new Set(prev);
                        ordenesFiltradas.forEach((o) => (marcar ? next.add(o.id) : next.delete(o.id)));
                        return next;
                      });
                    }}
                  />
                </th>
              )}
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
              const netoBlanco = (o.monto_neto || 0) - (o.descuento_monto || 0) - (o.descuento_monto_2 || 0) - (o.descuento_facturas_monto || 0);
              return (
              <tr key={o.id}>
                {puedeEditar && (
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionadasAsana.has(o.id)}
                      onChange={() => {
                        setSeleccionadasAsana((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id);
                          else next.add(o.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                )}
                <td>
                  <button
                    className="btn-link"
                    onClick={() => {
                      setVinoDeOtraPestana(false);
                      cargarDetalle(o.id);
                    }}
                  >
                    {o.numero_orden_agencia || '(sin número)'}
                  </button>
                </td>
                <td>{o.razon_social}</td>
                <td>
                  {o.nombre_anunciante}
                  {o.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO && (
                    <span
                      title="Vendida directamente por el concesionario, no por Topview"
                      style={{
                        marginLeft: '0.4rem',
                        fontSize: '0.7rem',
                        color: '#8a5a00',
                        background: '#fff3cd',
                        borderRadius: '3px',
                        padding: '0.05rem 0.35rem',
                      }}
                    >
                      Concesionario
                    </span>
                  )}
                </td>
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
              <td colSpan={puedeEditar ? 9 : 8}>Totales ({ordenesFiltradas.length} órdenes)</td>
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

export default OrdenesTab;
