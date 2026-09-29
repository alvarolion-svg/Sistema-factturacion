import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, scrollAlFormulario } from '../utils/api';
import { usePdfPreview, PdfExportMenu } from '../hooks/usePdfPreview';
import { NOMBRES_MES, CLASIFICACION_LABEL } from '../utils/constantesTopview';
import type { Intermediario } from '../types/topview';

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

function IntermediariosTab({
  token,
  puedeCrear,
  onVerOrden,
}: {
  token: string;
  puedeCrear: boolean;
  onVerOrden?: (ordenId: string) => void;
}) {
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
  const [subVistaCom, setSubVistaCom] = useState<'reporte' | 'ficha'>('reporte');
  const { mostrarPdf } = usePdfPreview();

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
    // Si no tiene nada que reportar en el período/tipo filtrado, no aparece
    // en la lista — antes se mostraba igual con un badge "sin órdenes".
    .filter((r) => r.cantidad_ordenes > 0)
    .sort((a, b) => b.comision_total - a.comision_total);

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

  const handleExportarComisionistasPDF = (accion: 'preview' | 'descargar' = 'descargar') => {
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
    const archivoNombre = nombreArchivoExportCom('pdf');
    if (accion === 'preview') mostrarPdf(doc, archivoNombre);
    else doc.save(archivoNombre);
  };

  return (
    <>
      <div className="reportes-tabs">
        <button
          className={`reportes-tab ${subVistaCom === 'reporte' ? 'active' : ''}`}
          onClick={() => setSubVistaCom('reporte')}
        >
          Cuánto traccionan las ventas
        </button>
        <button
          className={`reportes-tab ${subVistaCom === 'ficha' ? 'active' : ''}`}
          onClick={() => setSubVistaCom('ficha')}
        >
          Ficha de comisionistas
        </button>
      </div>

      {subVistaCom === 'ficha' && (
        <div className="view-header">
          {puedeCrear && (
            <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNuevo}>
              {mostrarForm ? 'Cancelar' : '+ Nuevo comisionista'}
            </button>
          )}
        </div>
      )}

      {subVistaCom === 'ficha' && mostrarForm && (
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

      {subVistaCom === 'reporte' && (
      <>
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
            <PdfExportMenu
              etiqueta="PDF"
              onPreview={() => handleExportarComisionistasPDF('preview')}
              onDescargar={() => handleExportarComisionistasPDF('descargar')}
            />
          </div>

          {reporteFiltrado.length === 0 && (
            <p className="empty-state">Ningún comisionista tiene órdenes en este período/tipo.</p>
          )}
          {reporteFiltrado.length > 0 && (
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
                    <td>{r.cantidad_ordenes}</td>
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
                                <td>
                                  {onVerOrden ? (
                                    <button type="button" className="btn-link" onClick={() => onVerOrden(o.orden_id)}>
                                      {o.numero_orden_agencia || o.numero_orden}
                                    </button>
                                  ) : (
                                    o.numero_orden_agencia || o.numero_orden
                                  )}
                                </td>
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
          )}
          {reporteFiltrado.length > 0 && (
          <p className="totales-preview" style={{ marginBottom: '2rem' }}>
            Total Tipo 1 (facturas):{' '}
            <strong>{formatMoney(reporteFiltrado.reduce((acc, r) => acc + r.comision_tipo1, 0))}</strong>
            {' · '}Total Tipo 2 (efectivo):{' '}
            <strong>{formatMoney(reporteFiltrado.reduce((acc, r) => acc + r.comision_tipo2, 0))}</strong>
          </p>
          )}
        </>
      )}
      </>
      )}

      {subVistaCom === 'ficha' && (
      <>
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
      )}
    </>
  );
}

export default IntermediariosTab;
