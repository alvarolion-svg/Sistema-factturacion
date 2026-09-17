import { useEffect, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';

const ESTADOS_PRODUCCION = ['Cargada', 'Revisada', 'Facturada'];

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface LineaProduccionForm {
  descripcion_ubicacion: string;
  producto_id: string;
  caras_elementos: string;
  medida: string;
  tarifa: string;
  descuento_porcentaje: string;
}

const LINEA_VACIA: LineaProduccionForm = {
  descripcion_ubicacion: '',
  producto_id: '',
  caras_elementos: '1',
  medida: '',
  tarifa: '',
  descuento_porcentaje: '0',
};

const ORDEN_VACIA = {
  numero_orden_cliente: '',
  agencia_id: '',
  cliente_id: '',
  proveedor_id: '',
  medio: '',
  marca: '',
  campana: '',
  periodo_desde: '',
  periodo_hasta: '',
  fecha: new Date().toISOString().split('T')[0],
  pauta_numero: '',
  observaciones: '',
  email_envio_facturas: '',
  contacto: '',
  materiales: '',
};

function calcularImporteNeto(l: LineaProduccionForm) {
  const caras = Number(l.caras_elementos) || 0;
  const tarifa = Number(l.tarifa) || 0;
  const descuento = Number(l.descuento_porcentaje) || 0;
  return caras * tarifa * (1 - descuento / 100);
}

function ProduccionTopviewTab({
  token,
  puedeCrear,
  puedeEditar,
}: {
  token: string;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const [ordenes, setOrdenes] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [clientes, setClientes] = useState<{ id: string; razon_social: string }[]>([]);
  const [agencias, setAgencias] = useState<{ id: string; nombre: string }[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string }[]>([]);
  const [productos, setProductos] = useState<{ id: string; nombre: string }[]>([]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ordenForm, setOrdenForm] = useState(ORDEN_VACIA);
  const [lineas, setLineas] = useState<LineaProduccionForm[]>([{ ...LINEA_VACIA }]);
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [facturandoId, setFacturandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');

  const cargarDetalle = (id: string) => {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    axios
      .get(`/api/ordenes-produccion/${id}`, authHeaders(token))
      .then((res) => setDetalle(res.data))
      .catch((err) => setErrorDetalle(mensajeError(err, 'No se pudo cargar la orden.')))
      .finally(() => setCargandoDetalle(false));
  };

  const cargarOrdenes = () => {
    setError('');
    setOrdenes(null);
    axios
      .get('/api/ordenes-produccion', authHeaders(token))
      .then((res) => setOrdenes(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las órdenes de producción.'));
        setOrdenes([]);
      });
  };

  const cargarMaestros = () => {
    axios.get('/api/clientes', authHeaders(token)).then((res) => setClientes(res.data)).catch(() => setClientes([]));
    axios
      .get('/api/topview/agencias', authHeaders(token))
      .then((res) => setAgencias(res.data))
      .catch(() => setAgencias([]));
    axios
      .get('/api/proveedores', authHeaders(token))
      .then((res) => setProveedores(res.data))
      .catch(() => setProveedores([]));
    axios.get('/api/productos', authHeaders(token)).then((res) => setProductos(res.data)).catch(() => setProductos([]));
  };

  useEffect(() => {
    cargarOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNueva = () => {
    setOrdenForm(ORDEN_VACIA);
    setLineas([{ ...LINEA_VACIA }]);
    setEditandoId(null);
    setErrorForm('');
    cargarMaestros();
    setMostrarForm(true);
  };

  // El row de la lista no trae "lineas" (solo el header) — hay que pedir la
  // orden completa por id, si no el form de edición arranca sin líneas.
  const handleEditar = async (id: string) => {
    setErrorForm('');
    setError('');
    try {
      const res = await axios.get(`/api/ordenes-produccion/${id}`, authHeaders(token));
      const o = res.data;
      setOrdenForm({
        numero_orden_cliente: o.numero_orden_cliente || '',
        agencia_id: o.agencia_id || '',
        cliente_id: o.cliente_id || '',
        proveedor_id: o.proveedor_id || '',
        medio: o.medio || '',
        marca: o.marca || '',
        campana: o.campana || '',
        periodo_desde: o.periodo_desde || '',
        periodo_hasta: o.periodo_hasta || '',
        fecha: o.fecha || '',
        pauta_numero: o.pauta_numero || '',
        observaciones: o.observaciones || '',
        email_envio_facturas: o.email_envio_facturas || '',
        contacto: o.contacto || '',
        materiales: o.materiales || '',
      });
      setLineas(
        (o.lineas || []).length > 0
          ? o.lineas.map((l: any) => ({
              descripcion_ubicacion: l.descripcion_ubicacion || '',
              producto_id: l.producto_id || '',
              caras_elementos: String(l.caras_elementos ?? 1),
              medida: l.medida || '',
              tarifa: String(l.tarifa ?? 0),
              descuento_porcentaje: String(l.descuento_porcentaje ?? 0),
            }))
          : [{ ...LINEA_VACIA }]
      );
      setEditandoId(o.id);
      cargarMaestros();
      setMostrarForm(true);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo cargar la orden para editar.'));
    }
  };

  const handleChangeOrden = (campo: keyof typeof ORDEN_VACIA, valor: string) => {
    setOrdenForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleChangeLinea = (i: number, campo: keyof LineaProduccionForm, valor: string) => {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  };

  const handleAgregarLinea = () => setLineas((prev) => [...prev, { ...LINEA_VACIA }]);
  const handleQuitarLinea = (i: number) => setLineas((prev) => prev.filter((_, idx) => idx !== i));

  const lineasValidas = lineas.filter((l) => l.descripcion_ubicacion.trim() && Number(l.tarifa) > 0);
  const subtotalPreview = lineasValidas.reduce((s, l) => s + calcularImporteNeto(l), 0);
  const ivaPreview = subtotalPreview * 0.21;
  const totalPreview = subtotalPreview + ivaPreview;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ordenForm.cliente_id) {
      setErrorForm('Elegí un cliente.');
      return;
    }
    if (!ordenForm.fecha) {
      setErrorForm('La fecha es obligatoria.');
      return;
    }
    if (lineasValidas.length === 0) {
      setErrorForm('Agregá al menos una línea con descripción y tarifa.');
      return;
    }

    setGuardando(true);
    setErrorForm('');
    const payload = {
      ...ordenForm,
      agencia_id: ordenForm.agencia_id || undefined,
      proveedor_id: ordenForm.proveedor_id || undefined,
      periodo_desde: ordenForm.periodo_desde || undefined,
      periodo_hasta: ordenForm.periodo_hasta || undefined,
      lineas: lineasValidas.map((l) => ({
        descripcion_ubicacion: l.descripcion_ubicacion,
        producto_id: l.producto_id || undefined,
        caras_elementos: Number(l.caras_elementos) || 0,
        medida: l.medida || undefined,
        tarifa: Number(l.tarifa) || 0,
        descuento_porcentaje: Number(l.descuento_porcentaje) || 0,
      })),
    };

    try {
      if (editandoId) {
        await axios.put(`/api/ordenes-produccion/${editandoId}`, payload, authHeaders(token));
      } else {
        await axios.post('/api/ordenes-produccion', payload, authHeaders(token));
      }
      setMostrarForm(false);
      cargarOrdenes();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar la orden de producción.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleFacturar = async (id: string, numeroOrden: string) => {
    if (!window.confirm(`¿Generar la factura de la orden ${numeroOrden}? Esta acción no se puede deshacer.`)) return;
    setFacturandoId(id);
    setError('');
    try {
      await axios.post(`/api/ordenes-produccion/${id}/facturar`, {}, authHeaders(token));
      cargarOrdenes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo generar la factura.'));
    } finally {
      setFacturandoId(null);
    }
  };

  const handleEliminar = async (id: string, numeroOrden: string) => {
    if (!window.confirm(`¿Dar de baja la orden de producción ${numeroOrden}?`)) return;
    setEliminandoId(id);
    setError('');
    try {
      await axios.delete(`/api/ordenes-produccion/${id}`, authHeaders(token));
      cargarOrdenes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo eliminar la orden.'));
    } finally {
      setEliminandoId(null);
    }
  };

  const [cambiandoEstadoId, setCambiandoEstadoId] = useState<string | null>(null);

  const handleCambiarEstadoLista = async (id: string, nuevoEstado: string) => {
    setCambiandoEstadoId(id);
    setError('');
    try {
      await axios.put(`/api/ordenes-produccion/${id}/estado`, { nuevoEstado }, authHeaders(token));
      cargarOrdenes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo cambiar el estado.'));
    } finally {
      setCambiandoEstadoId(null);
    }
  };

  // Mismos campos de referencia libre hacia Colppy que en Órdenes de
  // exhibición, con el mismo comportamiento: se muestran como texto una vez
  // cargados (no como caja de edición siempre abierta) y solo se abren para
  // editar cuando el usuario lo pide.
  const [guardandoColppyId, setGuardandoColppyId] = useState<string | null>(null);
  const [editandoColppy, setEditandoColppy] = useState<{ id: string; campo: 'factura' | 'nc' } | null>(null);

  const handleGuardarColppy = async (o: any, campo: 'factura' | 'nc', valor: string) => {
    const valorPrevio = campo === 'factura' ? o.numero_factura_colppy || '' : o.numero_nc_colppy || '';
    if (valor === valorPrevio) return;
    setGuardandoColppyId(o.id);
    setError('');
    try {
      await axios.put(
        `/api/ordenes-produccion/${o.id}/facturacion-colppy`,
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

  const renderCampoColppy = (o: any, campo: 'factura' | 'nc') => {
    const valor = campo === 'factura' ? o.numero_factura_colppy : o.numero_nc_colppy;
    if (!puedeEditar) return valor || '-';

    const estaEditando = !!editandoColppy && editandoColppy.id === o.id && editandoColppy.campo === campo;
    if (!valor && !estaEditando) {
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

  // Igual que en Órdenes de exhibición: buscador + filtro mes/año + totales.
  // Acá no hay "fecha de facturación" propia, así que el filtro de mes/año
  // usa el período de la campaña (periodo_desde) — la pregunta es "qué
  // producción corre este mes", no cuándo se facturó.
  const [busqueda, setBusqueda] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroAno, setFiltroAno] = useState('');

  const anosDisponibles = Array.from(
    new Set(
      (ordenes || [])
        .map((o) => o.periodo_desde)
        .filter((f): f is string => !!f)
        .map((f) => f.split('-')[0])
    )
  ).sort((a, b) => Number(b) - Number(a));

  const ordenesFiltradas = (ordenes || [])
    .filter((o) => {
      if (!filtroMes && !filtroAno) return true;
      if (!o.periodo_desde) return false;
      const [ano, mes] = o.periodo_desde.split('-');
      if (filtroMes && Number(mes) !== Number(filtroMes)) return false;
      if (filtroAno && Number(ano) !== Number(filtroAno)) return false;
      return true;
    })
    .filter((o) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.trim().toLowerCase();
      const campos = [
        o.numero_orden,
        o.numero_orden_cliente,
        o.cliente_razon_social,
        o.agencia_nombre,
        o.proveedor_razon_social,
        o.marca,
        o.campana,
        o.pauta_numero,
        o.numero_factura_colppy,
        o.numero_nc_colppy,
      ];
      return campos.some((c) => (c || '').toLowerCase().includes(q));
    });

  const totalesFila = ordenesFiltradas.reduce(
    (acc, o) => {
      acc.subtotal += o.subtotal || 0;
      acc.iva += o.iva || 0;
      acc.total += o.total || 0;
      return acc;
    },
    { subtotal: 0, iva: 0, total: 0 }
  );

  const columnasExport = [
    'N° Orden',
    'N° Orden (cliente)',
    'Cliente',
    'Agencia',
    'Proveedor',
    'Marca',
    'Campaña',
    'Medio',
    'Período desde',
    'Período hasta',
    'Fecha',
    'Pauta N°',
    'Subtotal',
    'IVA',
    'Total',
    'Estado',
    'N° Factura Colppy',
    'N° NC Colppy',
  ];

  const filaExport = (o: any, paraExcel: boolean) => [
    o.numero_orden,
    o.numero_orden_cliente || '',
    o.cliente_razon_social || '',
    o.agencia_nombre || '',
    o.proveedor_razon_social || '',
    o.marca || '',
    o.campana || '',
    o.medio || '',
    formatFecha(o.periodo_desde),
    formatFecha(o.periodo_hasta),
    formatFecha(o.fecha),
    o.pauta_numero || '',
    paraExcel ? o.subtotal || 0 : formatMoney(o.subtotal),
    paraExcel ? o.iva || 0 : formatMoney(o.iva),
    paraExcel ? o.total || 0 : formatMoney(o.total),
    o.estado,
    o.numero_factura_colppy || '',
    o.numero_nc_colppy || '',
  ];

  const nombreArchivoExport = (ext: string) => {
    const sufijo = filtroMes || filtroAno ? `${filtroMes ? NOMBRES_MES[Number(filtroMes) - 1] : 'todos'}_${filtroAno || 'todos'}` : 'todas';
    return `ordenes_produccion_${sufijo}.${ext}`;
  };

  // Mismo estilo calcado de la planilla de referencia que en Órdenes de
  // exhibición: headers celestes, montos en formato contable, fechas dd/mm/aaaa.
  const EXCEL_MONEY_FORMAT = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';
  const EXCEL_DATE_FORMAT = 'dd/mm/yyyy';

  const fechaLocalDate = (fecha: string | null | undefined): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || '');
    if (!m) return null;
    const [, anio, mes, dia] = m;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  };

  const handleExportarExcel = async () => {
    const idxPeriodoDesde = 8;
    const idxFecha = 10;
    const idxSubtotal = 12;
    const idxIva = 13;
    const idxTotal = 14;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Producción');

    ws.columns = columnasExport.map((titulo) => ({ header: titulo, width: Math.max(titulo.length + 2, 12) }));
    ws.getColumn(1).width = 20; // N° Orden
    ws.getColumn(2).width = 18; // N° Orden (cliente)
    ws.getColumn(3).width = 28; // Cliente
    ws.getColumn(4).width = 22; // Agencia
    ws.getColumn(5).width = 28; // Proveedor
    ws.getColumn(7).width = 24; // Campaña

    ordenesFiltradas.forEach((o) => {
      ws.addRow([
        o.numero_orden,
        o.numero_orden_cliente || '',
        o.cliente_razon_social || '',
        o.agencia_nombre || '',
        o.proveedor_razon_social || '',
        o.marca || '',
        o.campana || '',
        o.medio || '',
        fechaLocalDate(o.periodo_desde),
        fechaLocalDate(o.periodo_hasta),
        fechaLocalDate(o.fecha),
        o.pauta_numero || '',
        o.subtotal || 0,
        o.iva || 0,
        o.total || 0,
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

    for (let i = idxPeriodoDesde; i <= idxFecha; i++) ws.getColumn(i + 1).numFmt = EXCEL_DATE_FORMAT;
    [idxSubtotal, idxIva, idxTotal].forEach((i) => (ws.getColumn(i + 1).numFmt = EXCEL_MONEY_FORMAT));

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnasExport.length } };
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
    const filas = ordenesFiltradas.map((o) => filaExport(o, false));
    const doc = new jsPDF({ orientation: 'landscape' });
    autoTable(doc, {
      head: [columnasExport],
      body: filas as any,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [232, 24, 56] },
    });
    doc.save(nombreArchivoExport('pdf'));
  };

  if (detalleId) {
    return (
      <>
        <div className="view-header">
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
          {puedeEditar && detalle && !detalle.factura_id && (
            <button
              className="btn-secondary"
              onClick={() => {
                handleEditar(detalle.id);
                setDetalleId(null);
              }}
            >
              Editar orden
            </button>
          )}
        </div>

        {cargandoDetalle && <p className="empty-state">Cargando orden...</p>}
        {errorDetalle && <div className="error-message">{errorDetalle}</div>}

        {detalle && (
          <>
            <h2 className="detalle-titulo">
              {detalle.numero_orden_cliente || detalle.numero_orden}{' '}
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
                    {detalle.factura_numero || (
                      <span className="estado-badge estado-pendiente">Pendiente</span>
                    )}
                  </dd>
                </>
              )}

              <dt>N° de orden interno</dt>
              <dd>{detalle.numero_orden}</dd>

              {detalle.numero_orden_cliente && (
                <>
                  <dt>N° de orden (cliente/agencia)</dt>
                  <dd>{detalle.numero_orden_cliente}</dd>
                </>
              )}

              <dt>Cliente (a quien se factura)</dt>
              <dd>{detalle.cliente_razon_social}</dd>

              {detalle.agencia_nombre && (
                <>
                  <dt>Agencia</dt>
                  <dd>{detalle.agencia_nombre}</dd>
                </>
              )}

              {detalle.proveedor_razon_social && (
                <>
                  <dt>Proveedor (quien produce)</dt>
                  <dd>{detalle.proveedor_razon_social}</dd>
                </>
              )}

              {detalle.medio && (
                <>
                  <dt>Medio</dt>
                  <dd>{detalle.medio}</dd>
                </>
              )}

              {detalle.marca && (
                <>
                  <dt>Marca</dt>
                  <dd>{detalle.marca}</dd>
                </>
              )}

              {detalle.campana && (
                <>
                  <dt>Campaña</dt>
                  <dd>{detalle.campana}</dd>
                </>
              )}

              {(detalle.periodo_desde || detalle.periodo_hasta) && (
                <>
                  <dt>Período</dt>
                  <dd>
                    {formatFecha(detalle.periodo_desde)} — {formatFecha(detalle.periodo_hasta)}
                  </dd>
                </>
              )}

              <dt>Fecha</dt>
              <dd>{formatFecha(detalle.fecha)}</dd>

              {detalle.pauta_numero && (
                <>
                  <dt>Pauta N°</dt>
                  <dd>{detalle.pauta_numero}</dd>
                </>
              )}

              {detalle.contacto && (
                <>
                  <dt>Contacto</dt>
                  <dd>{detalle.contacto}</dd>
                </>
              )}

              {detalle.email_envio_facturas && (
                <>
                  <dt>Email envío de facturas</dt>
                  <dd>{detalle.email_envio_facturas}</dd>
                </>
              )}

              {detalle.materiales && (
                <>
                  <dt>Materiales</dt>
                  <dd>{detalle.materiales}</dd>
                </>
              )}

              {detalle.observaciones && (
                <>
                  <dt>Observaciones</dt>
                  <dd>{detalle.observaciones}</dd>
                </>
              )}

              {detalle.factura_id && (
                <>
                  <dt>Factura</dt>
                  <dd>Ya se generó la factura real — ver en la solapa Facturas.</dd>
                </>
              )}
            </dl>

            <h3>Líneas de producción</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Descripción / Ubicación</th>
                    <th>Caras/Elem.</th>
                    <th>Medida</th>
                    <th>Tarifa</th>
                    <th>Desc. %</th>
                    <th>Importe neto</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalle.lineas || []).map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.descripcion_ubicacion}</td>
                      <td>{l.caras_elementos}</td>
                      <td>{l.medida || '-'}</td>
                      <td>{formatMoney(l.tarifa)}</td>
                      <td>{l.descuento_porcentaje ? `${l.descuento_porcentaje}%` : '-'}</td>
                      <td>{formatMoney(l.importe_neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="totales-preview">
              Subtotal: {formatMoney(detalle.subtotal)} · IVA 21%: {formatMoney(detalle.iva)} · Total:{' '}
              <strong>{formatMoney(detalle.total)}</strong>
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNueva}>
            {mostrarForm ? 'Cancelar' : '+ Nueva orden de producción'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="op_cliente">Cliente *</label>
            <select
              id="op_cliente"
              value={ordenForm.cliente_id}
              onChange={(e) => handleChangeOrden('cliente_id', e.target.value)}
              disabled={guardando}
            >
              <option value="">Elegir cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="op_numero_cliente">N° de orden (del cliente/agencia)</label>
            <input
              id="op_numero_cliente"
              placeholder='Ej: "8002"'
              value={ordenForm.numero_orden_cliente}
              onChange={(e) => handleChangeOrden('numero_orden_cliente', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_agencia">Agencia (opcional)</label>
            <select
              id="op_agencia"
              value={ordenForm.agencia_id}
              onChange={(e) => handleChangeOrden('agencia_id', e.target.value)}
              disabled={guardando}
            >
              <option value="">Sin agencia</option>
              {agencias.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="op_proveedor">Proveedor (quien produce)</label>
            <select
              id="op_proveedor"
              value={ordenForm.proveedor_id}
              onChange={(e) => handleChangeOrden('proveedor_id', e.target.value)}
              disabled={guardando}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="op_medio">Medio</label>
            <input
              id="op_medio"
              placeholder='Ej: "PPL / Pantalla LED Vertical"'
              value={ordenForm.medio}
              onChange={(e) => handleChangeOrden('medio', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_marca">Marca</label>
            <input
              id="op_marca"
              value={ordenForm.marca}
              onChange={(e) => handleChangeOrden('marca', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_campana">Campaña</label>
            <input
              id="op_campana"
              value={ordenForm.campana}
              onChange={(e) => handleChangeOrden('campana', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_periodo_desde">Período desde</label>
            <input
              id="op_periodo_desde"
              type="date"
              value={ordenForm.periodo_desde}
              onChange={(e) => handleChangeOrden('periodo_desde', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_periodo_hasta">Período hasta</label>
            <input
              id="op_periodo_hasta"
              type="date"
              value={ordenForm.periodo_hasta}
              onChange={(e) => handleChangeOrden('periodo_hasta', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_fecha">Fecha *</label>
            <input
              id="op_fecha"
              type="date"
              value={ordenForm.fecha}
              onChange={(e) => handleChangeOrden('fecha', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_pauta">Pauta N° (referencia externa, opcional)</label>
            <input
              id="op_pauta"
              value={ordenForm.pauta_numero}
              onChange={(e) => handleChangeOrden('pauta_numero', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_email">Email envío de facturas</label>
            <input
              id="op_email"
              type="email"
              value={ordenForm.email_envio_facturas}
              onChange={(e) => handleChangeOrden('email_envio_facturas', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_contacto">Contacto</label>
            <input
              id="op_contacto"
              value={ordenForm.contacto}
              onChange={(e) => handleChangeOrden('contacto', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="op_materiales">Materiales</label>
            <input
              id="op_materiales"
              placeholder='Ej: "A ENVIAR" o "Enviados"'
              value={ordenForm.materiales}
              onChange={(e) => handleChangeOrden('materiales', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="op_obs">Observaciones</label>
            <input
              id="op_obs"
              value={ordenForm.observaciones}
              onChange={(e) => handleChangeOrden('observaciones', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Líneas de producción *</label>
            {lineas.map((l, i) => (
              <div
                className="linea-factura"
                key={i}
                style={{ gridTemplateColumns: '2fr 1.4fr 0.7fr 0.9fr 0.8fr 0.7fr auto', alignItems: 'end' }}
              >
                <input
                  placeholder='Descripción/ubicación (ej. "4 placas Nordelta Centro Comercial")'
                  value={l.descripcion_ubicacion}
                  onChange={(e) => handleChangeLinea(i, 'descripcion_ubicacion', e.target.value)}
                  disabled={guardando}
                />
                <select
                  value={l.producto_id}
                  onChange={(e) => handleChangeLinea(i, 'producto_id', e.target.value)}
                  disabled={guardando}
                >
                  <option value="">Producto (opcional)</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  placeholder="Caras/Elem."
                  value={l.caras_elementos}
                  onChange={(e) => handleChangeLinea(i, 'caras_elementos', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Tarifa"
                  value={l.tarifa}
                  onChange={(e) => handleChangeLinea(i, 'tarifa', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Desc. %"
                  value={l.descuento_porcentaje}
                  onChange={(e) => handleChangeLinea(i, 'descuento_porcentaje', e.target.value)}
                  disabled={guardando}
                />
                <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: '#666' }}>
                  {formatMoney(calcularImporteNeto(l))}
                </span>
                {lineas.length > 1 && (
                  <button type="button" className="btn-link btn-link-danger" onClick={() => handleQuitarLinea(i)}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-link" onClick={handleAgregarLinea}>
              + Agregar línea
            </button>
          </div>

          <p className="totales-preview" style={{ gridColumn: '1 / -1' }}>
            Subtotal: {formatMoney(subtotalPreview)} · IVA 21%: {formatMoney(ivaPreview)} · Total:{' '}
            <strong>{formatMoney(totalPreview)}</strong>
          </p>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear orden de producción'}
            </button>
          </div>
        </form>
      )}

      {ordenes === null && !error && <p className="empty-state">Cargando órdenes de producción...</p>}
      {ordenes && ordenes.length === 0 && (
        <p className="empty-state">
          Todavía no hay órdenes de producción cargadas.
          {puedeCrear ? ' Usá "+ Nueva orden de producción" para crear la primera.' : ''}
        </p>
      )}

      {ordenes && ordenes.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="busqueda_produccion">Buscar</label>
            <input
              id="busqueda_produccion"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Cliente, agencia, proveedor, campaña..."
              style={{ width: '16rem' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_mes_produccion">Filtrar por mes (período)</label>
            <select id="filtro_mes_produccion" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {NOMBRES_MES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filtro_ano_produccion">Año</label>
            <select id="filtro_ano_produccion" value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
              <option value="">Todos los años</option>
              {anosDisponibles.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
          {(filtroMes || filtroAno || busqueda) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setFiltroMes('');
                setFiltroAno('');
                setBusqueda('');
              }}
            >
              Limpiar filtro
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportarExcel}
              disabled={ordenesFiltradas.length === 0}
            >
              Exportar Excel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportarPDF}
              disabled={ordenesFiltradas.length === 0}
            >
              Exportar PDF
            </button>
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
                <th>N° Orden</th>
                <th>Cliente</th>
                <th>Agencia</th>
                <th>Proveedor</th>
                <th>Campaña</th>
                <th>Fecha</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Estado</th>
                <th>N° Factura Colppy</th>
                <th>N° NC Colppy</th>
                {(puedeCrear || puedeEditar) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {ordenesFiltradas.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="btn-link" onClick={() => cargarDetalle(o.id)}>
                      {o.numero_orden_cliente || '(sin número)'}
                    </button>
                  </td>
                  <td>{o.cliente_razon_social}</td>
                  <td>{o.agencia_nombre || '-'}</td>
                  <td>{o.proveedor_razon_social || '-'}</td>
                  <td>{o.campana || '-'}</td>
                  <td>{formatFecha(o.fecha)}</td>
                  <td>{formatMoney(o.subtotal)}</td>
                  <td>{formatMoney(o.iva)}</td>
                  <td>{formatMoney(o.total)}</td>
                  <td>
                    {puedeEditar ? (
                      <select
                        value={o.estado}
                        onChange={(e) => handleCambiarEstadoLista(o.id, e.target.value)}
                        disabled={cambiandoEstadoId === o.id}
                        className={`estado-badge estado-${o.estado.toLowerCase()}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                      >
                        {ESTADOS_PRODUCCION.map((e) => (
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
                  {(puedeCrear || puedeEditar) && (
                    <td>
                      {puedeEditar && !o.factura_id && (
                        <>
                          <button className="btn-link" onClick={() => handleEditar(o.id)}>
                            Editar
                          </button>
                          {' · '}
                        </>
                      )}
                      {puedeEditar && !o.factura_id && (
                        <>
                          <button
                            className="btn-link"
                            onClick={() => handleFacturar(o.id, o.numero_orden)}
                            disabled={facturandoId === o.id}
                          >
                            {facturandoId === o.id ? 'Facturando...' : 'Generar factura'}
                          </button>
                          {' · '}
                        </>
                      )}
                      {puedeEditar && (
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => handleEliminar(o.id, o.numero_orden)}
                          disabled={eliminandoId === o.id}
                        >
                          {eliminandoId === o.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, borderTop: '2px solid #ccc' }}>
                <td colSpan={6}>Totales ({ordenesFiltradas.length} órdenes)</td>
                <td>{formatMoney(totalesFila.subtotal)}</td>
                <td>{formatMoney(totalesFila.iva)}</td>
                <td>{formatMoney(totalesFila.total)}</td>
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

export default ProduccionTopviewTab;
