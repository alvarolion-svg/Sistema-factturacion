import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';
import { InputMiles } from './CamposMonto';

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface Concesionario {
  id: string;
  razon_social: string;
}

interface LineaLiquidacion {
  detalle_id: string;
  orden_id: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  tipo_producto: string;
  cantidad: number;
  punto_instalacion: string | null;
  locacion_id: string;
  locacion_nombre: string;
  liquidacion_id: string | null;
  monto: number;
  excluida: boolean;
  inicio_tardio: boolean;
}

interface LineaManual {
  id: string;
  concesionario_id: string;
  mes: number;
  ano: number;
  descripcion: string;
  monto: number;
}

const MANUAL_VACIO = { descripcion: '', monto: '' };

function LiquidacionesTab({ token, puedeCargar }: { token: string; puedeCargar: boolean }) {
  const hoy = new Date();
  const [concesionarios, setConcesionarios] = useState<Concesionario[]>([]);
  const [concesionarioId, setConcesionarioId] = useState('');
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [ano, setAno] = useState(String(hoy.getFullYear()));

  const [filas, setFilas] = useState<LineaLiquidacion[] | null>(null);
  const [manuales, setManuales] = useState<LineaManual[]>([]);
  const [error, setError] = useState('');
  const [montosLocal, setMontosLocal] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);

  const [manualForm, setManualForm] = useState(MANUAL_VACIO);
  const [agregandoManual, setAgregandoManual] = useState(false);
  const [editandoManualId, setEditandoManualId] = useState<string | null>(null);
  const [editManualForm, setEditManualForm] = useState(MANUAL_VACIO);

  const [porcentajeComision, setPorcentajeComision] = useState(100);
  const [vista, setVista] = useState<'liquidar' | 'condiciones'>('liquidar');

  useEffect(() => {
    axios
      .get('/api/liquidaciones/concesionarios', authHeaders(token))
      .then((res) => setConcesionarios(res.data || []))
      .catch(() => setConcesionarios([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = () => {
    if (!concesionarioId || !mes || !ano) return;
    setError('');
    setFilas(null);
    axios
      .get('/api/liquidaciones', {
        ...authHeaders(token),
        params: { concesionario_id: concesionarioId, mes, ano },
      })
      .then((res) => {
        const data: LineaLiquidacion[] = res.data.filas || [];
        setFilas(data);
        setManuales(res.data.manuales || []);
        setPorcentajeComision(res.data.porcentaje_comision ?? 100);
        const iniciales: Record<string, string> = {};
        data.forEach((f) => {
          iniciales[f.detalle_id] = f.monto ? String(f.monto) : '';
        });
        setMontosLocal(iniciales);
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudo cargar la liquidación de ese período.'));
        setFilas([]);
        setManuales([]);
      });
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concesionarioId, mes, ano]);

  const handleGuardarMonto = async (detalleId: string) => {
    const valor = Number(montosLocal[detalleId] || 0);
    setGuardandoId(detalleId);
    setError('');
    try {
      await axios.put(`/api/liquidaciones/${detalleId}`, { mes: Number(mes), ano: Number(ano), monto: valor }, authHeaders(token));
      setFilas((actual) => (actual || []).map((f) => (f.detalle_id === detalleId ? { ...f, monto: valor } : f)));
      setGuardadoId(detalleId);
      setTimeout(() => setGuardadoId((actual) => (actual === detalleId ? null : actual)), 1500);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el monto.'));
    } finally {
      setGuardandoId(null);
    }
  };

  // Sacar una línea no borra la orden ni lo ya facturado — solo deja de
  // contarla en esta liquidación (ej. el cliente terminó no pagando esa
  // campaña puntual). Queda guardada, se puede restaurar.
  const handleExcluir = async (f: LineaLiquidacion) => {
    if (!window.confirm(`¿Sacar "${f.anunciante} — ${f.tipo_producto}" de esta liquidación? No se toca la orden, se puede restaurar después.`)) {
      return;
    }
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: true },
        authHeaders(token)
      );
      setFilas((actual) => (actual || []).map((x) => (x.detalle_id === f.detalle_id ? { ...x, excluida: true } : x)));
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo sacar la línea.'));
    }
  };

  const handleRestaurar = async (f: LineaLiquidacion) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: false },
        authHeaders(token)
      );
      setFilas((actual) => (actual || []).map((x) => (x.detalle_id === f.detalle_id ? { ...x, excluida: false } : x)));
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo restaurar la línea.'));
    }
  };

  // Corte del día 15: una campaña que arranca después del 15 del mes no
  // cuenta para ese mes por defecto (queda para el que viene), pero se
  // informa igual acá con un tilde para sumarla a este mes si se quiere.
  // Es una decisión de rutina, no un "sacar" destructivo — sin confirm().
  const handleToggleIncluirEsteMes = async (f: LineaLiquidacion, incluir: boolean) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: !incluir },
        authHeaders(token)
      );
      setFilas((actual) => (actual || []).map((x) => (x.detalle_id === f.detalle_id ? { ...x, excluida: !incluir } : x)));
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar la decisión de este mes.'));
    }
  };

  const handleAgregarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.descripcion.trim()) {
      setError('La descripción de la línea manual es obligatoria.');
      return;
    }
    setAgregandoManual(true);
    setError('');
    try {
      const res = await axios.post(
        '/api/liquidaciones/manual',
        { concesionario_id: concesionarioId, mes: Number(mes), ano: Number(ano), descripcion: manualForm.descripcion, monto: Number(manualForm.monto) || 0 },
        authHeaders(token)
      );
      setManuales((actual) => [...actual, res.data]);
      setManualForm(MANUAL_VACIO);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo agregar la línea manual.'));
    } finally {
      setAgregandoManual(false);
    }
  };

  const handleAbrirEditarManual = (m: LineaManual) => {
    setEditandoManualId(m.id);
    setEditManualForm({ descripcion: m.descripcion, monto: String(m.monto) });
  };

  const handleGuardarEditarManual = async (id: string) => {
    setError('');
    try {
      const res = await axios.put(
        `/api/liquidaciones/manual/${id}`,
        { descripcion: editManualForm.descripcion, monto: Number(editManualForm.monto) || 0 },
        authHeaders(token)
      );
      setManuales((actual) => actual.map((m) => (m.id === id ? res.data : m)));
      setEditandoManualId(null);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar la línea manual.'));
    }
  };

  const handleEliminarManual = async (m: LineaManual) => {
    if (!window.confirm(`¿Quitar la línea manual "${m.descripcion}"?`)) return;
    setError('');
    try {
      await axios.delete(`/api/liquidaciones/manual/${m.id}`, authHeaders(token));
      setManuales((actual) => actual.filter((x) => x.id !== m.id));
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la línea manual.'));
    }
  };

  const anosDisponibles = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);
  // Las de inicio tardío se muestran siempre (son un aviso explícito, no una
  // exclusión para esconder) — el toggle "mostrar excluidas" es solo para
  // las sacadas a mano por otro motivo (ej. cliente no pagó).
  const filasVisibles = (filas || []).filter((f) => f.inicio_tardio || mostrarExcluidas || !f.excluida);
  // "Declarado" es la suma de lo cargado a mano por campaña (lo que Topview
  // dice que facturó esa locación). El concesionario cobra su % sobre eso,
  // no el declarado en sí — ver la solapa "Condiciones".
  const totalDeclarado =
    (filas || []).filter((f) => !f.excluida).reduce((s, f) => s + (Number(f.monto) || 0), 0) +
    manuales.reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const totalALiquidar = totalDeclarado * (porcentajeComision / 100);
  const nombreConcesionario = concesionarios.find((c) => c.id === concesionarioId)?.razon_social || '';

  // Varias "órdenes" seguidas en Colppy suelen ser la misma campaña real con
  // cortes de fecha — mostrar la vigencia evita que el concesionario piense
  // que son campañas distintas. El N° de orden es solo referencia interna:
  // no sale en lo que se exporta para mandarle al concesionario.
  const vigenciaTexto = (f: LineaLiquidacion) =>
    f.periodo_desde || f.periodo_hasta ? `${formatFecha(f.periodo_desde)} – ${formatFecha(f.periodo_hasta)}` : '—';

  const nombreArchivoExport = (ext: string) =>
    `liquidacion_${(nombreConcesionario || 'concesionario').replace(/\s+/g, '_')}_${NOMBRES_MES[Number(mes) - 1]}_${ano}.${ext}`;

  const handleExportarExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Liquidación');
    ws.columns = [
      { header: 'Anunciante / concepto', width: 28 },
      { header: 'Vigencia', width: 22 },
      { header: 'Producto', width: 24 },
      { header: 'Locación', width: 22 },
      { header: 'Posición', width: 20 },
      { header: 'Cantidad', width: 10 },
      { header: 'Monto liquidado', width: 18 },
    ];
    (filas || [])
      .filter((f) => !f.excluida)
      .forEach((f) => {
        ws.addRow([f.anunciante, vigenciaTexto(f), f.tipo_producto, f.locacion_nombre, f.punto_instalacion || '—', f.cantidad, f.monto]);
      });
    manuales.forEach((m) => {
      ws.addRow([m.descripcion, '—', '—', '—', '—', '—', m.monto]);
    });
    ws.addRow([]);
    ws.addRow(['', '', '', '', '', 'Total declarado', totalDeclarado]);
    ws.addRow(['', '', '', '', '', 'Canon', `${porcentajeComision}%`]);
    const filaTotal = ws.addRow(['', '', '', '', '', 'Total a liquidar', totalALiquidar]);
    filaTotal.font = { bold: true };
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
    });
    const formatoMoneda = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';
    ws.getColumn(7).numFmt = formatoMoneda;
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
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Liquidación — ${nombreConcesionario} — ${NOMBRES_MES[Number(mes) - 1]} ${ano}`, 14, 15);
    const filasActivas = (filas || []).filter((f) => !f.excluida);
    autoTable(doc, {
      startY: 22,
      head: [['Anunciante / concepto', 'Vigencia', 'Producto', 'Locación', 'Posición', 'Cantidad', 'Monto liquidado']],
      body: [
        ...filasActivas.map((f) => [
          f.anunciante,
          vigenciaTexto(f),
          f.tipo_producto,
          f.locacion_nombre,
          f.punto_instalacion || '—',
          String(f.cantidad),
          formatMoney(f.monto),
        ]),
        ...manuales.map((m) => [m.descripcion, '—', '—', '—', '—', '—', formatMoney(m.monto)]),
      ],
      foot: [
        ['', '', '', '', '', 'Total declarado', formatMoney(totalDeclarado)],
        ['', '', '', '', '', 'Canon', `${porcentajeComision}%`],
        ['', '', '', '', '', 'Total a liquidar', formatMoney(totalALiquidar)],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [232, 24, 56] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    });
    doc.save(nombreArchivoExport('pdf'));
  };

  return (
    <>
      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Liquidaciones a concesionarios
        </h3>
      </div>

      <div className="reportes-tabs" style={{ marginBottom: '1rem' }}>
        <button
          className={`reportes-tab ${vista === 'liquidar' ? 'active' : ''}`}
          onClick={() => setVista('liquidar')}
        >
          Liquidar
        </button>
        {puedeCargar && (
          <button
            className={`reportes-tab ${vista === 'condiciones' ? 'active' : ''}`}
            onClick={() => setVista('condiciones')}
          >
            Canon por concesionario
          </button>
        )}
      </div>

      {vista === 'condiciones' && puedeCargar ? (
        <CondicionesConcesionarioTab token={token} />
      ) : (
        <>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Cantidad, locación y posición se toman de la orden real. El monto NO se calcula de lo que le cobramos al
        anunciante — no tiene relación fija — se carga a mano por línea y por mes, y queda guardado para siempre en
        ese período.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="filtros-fila" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        <label>
          Concesionario
          <select value={concesionarioId} onChange={(e) => setConcesionarioId(e.target.value)}>
            <option value="">Elegir...</option>
            {concesionarios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razon_social}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mes
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {NOMBRES_MES.map((nombre, i) => (
              <option key={i + 1} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Año
          <select value={ano} onChange={(e) => setAno(e.target.value)}>
            {anosDisponibles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!concesionarioId && <p className="empty-state">Elegí un concesionario para ver sus campañas del período.</p>}
      {concesionarioId && filas === null && !error && <p className="empty-state">Cargando...</p>}
      {concesionarioId && filas && filas.length === 0 && manuales.length === 0 && !error && (
        <p className="empty-state">
          {nombreConcesionario} no tiene campañas activas en {NOMBRES_MES[Number(mes) - 1]} {ano}.
        </p>
      )}

      {filas && (filas.length > 0 || manuales.length > 0) && (
        <>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handleExportarExcel}>
              Exportar Excel
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportarPDF}>
              Exportar PDF
            </button>
            {filas.some((f) => f.excluida && !f.inicio_tardio) && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal' }}>
                <input type="checkbox" checked={mostrarExcluidas} onChange={(e) => setMostrarExcluidas(e.target.checked)} />
                Mostrar líneas sacadas ({filas.filter((f) => f.excluida && !f.inicio_tardio).length})
              </label>
            )}
          </div>
          <p className="totales-preview" style={{ marginTop: 0 }}>
            El N° de orden es solo referencia interna (varias órdenes seguidas suelen ser la misma campaña con
            cortes de fecha) — no sale en lo exportado, ahí se muestra la vigencia en fechas.
          </p>
          <table className="data-table" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th>Anunciante / concepto</th>
                <th>N° orden</th>
                <th>Vigencia</th>
                <th>Producto</th>
                <th>Locación</th>
                <th>Posición</th>
                <th>Cantidad</th>
                <th>Monto liquidado</th>
                {puedeCargar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((f) => (
                <Fragment key={f.detalle_id}>
                  {f.inicio_tardio && (
                    <tr key={`${f.detalle_id}-aviso`} style={{ background: '#fff8e1' }}>
                      <td colSpan={puedeCargar ? 9 : 8} style={{ fontSize: '0.85rem', color: '#8a6d00' }}>
                        ⚠ Esta campaña arrancó el {formatFecha(f.periodo_desde)}, después del corte del día 15 — por
                        defecto se liquida el mes que viene, no este.
                        {puedeCargar && (
                          <label style={{ marginLeft: '1rem', fontWeight: 'normal' }}>
                            <input
                              type="checkbox"
                              checked={!f.excluida}
                              onChange={(e) => handleToggleIncluirEsteMes(f, e.target.checked)}
                            />{' '}
                            Sumar igual a la liquidación de {NOMBRES_MES[Number(mes) - 1]}
                          </label>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr key={f.detalle_id} style={f.excluida ? { opacity: 0.5 } : undefined}>
                    <td>{f.anunciante}</td>
                    <td>{f.numero_orden_agencia || f.numero_orden}</td>
                    <td>{vigenciaTexto(f)}</td>
                    <td>{f.tipo_producto}</td>
                    <td>{f.locacion_nombre}</td>
                    <td>{f.punto_instalacion || '—'}</td>
                    <td>{f.cantidad}</td>
                    <td>
                      {puedeCargar ? (
                        <InputMiles
                          value={montosLocal[f.detalle_id] ?? ''}
                          onChange={(v) => setMontosLocal((actual) => ({ ...actual, [f.detalle_id]: v }))}
                          onBlur={() => handleGuardarMonto(f.detalle_id)}
                          style={{ width: '9rem', textAlign: 'right' }}
                        />
                      ) : (
                        formatMoney(f.monto)
                      )}
                    </td>
                    {puedeCargar && (
                      <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {f.inicio_tardio ? (
                          <span style={{ color: 'var(--color-exito, #2e7d32)' }}>
                            {guardandoId === f.detalle_id ? 'Guardando...' : guardadoId === f.detalle_id ? 'Guardado ✓' : ''}
                          </span>
                        ) : f.excluida ? (
                          <button type="button" className="btn-link" onClick={() => handleRestaurar(f)}>
                            Restaurar
                          </button>
                        ) : (
                          <>
                            <span style={{ color: 'var(--color-exito, #2e7d32)', marginRight: '0.5rem' }}>
                              {guardandoId === f.detalle_id ? 'Guardando...' : guardadoId === f.detalle_id ? 'Guardado ✓' : ''}
                            </span>
                            <button type="button" className="btn-link btn-link-danger" onClick={() => handleExcluir(f)}>
                              Quitar
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                </Fragment>
              ))}
              {manuales.map((m) => (
                <tr key={m.id} style={{ fontStyle: 'italic' }}>
                  {editandoManualId === m.id ? (
                    <>
                      <td colSpan={6}>
                        <input
                          type="text"
                          value={editManualForm.descripcion}
                          onChange={(e) => setEditManualForm((f) => ({ ...f, descripcion: e.target.value }))}
                          placeholder="Descripción"
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <InputMiles
                          value={editManualForm.monto}
                          onChange={(v) => setEditManualForm((f) => ({ ...f, monto: v }))}
                          style={{ width: '9rem', textAlign: 'right' }}
                        />
                      </td>
                      {puedeCargar && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn-link" onClick={() => handleGuardarEditarManual(m.id)} style={{ marginRight: '0.5rem' }}>
                            Guardar
                          </button>
                          <button type="button" className="btn-link" onClick={() => setEditandoManualId(null)}>
                            Cancelar
                          </button>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td colSpan={6}>{m.descripcion} (línea manual)</td>
                      <td>{formatMoney(m.monto)}</td>
                      {puedeCargar && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn-link" onClick={() => handleAbrirEditarManual(m)} style={{ marginRight: '0.5rem' }}>
                            Editar
                          </button>
                          <button type="button" className="btn-link btn-link-danger" onClick={() => handleEliminarManual(m)}>
                            Quitar
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {puedeCargar && (
            <form onSubmit={handleAgregarManual} className="linea-factura" style={{ gridTemplateColumns: '2fr 1fr auto', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Descripción (ajuste, compensación, lo no cobrado, etc.)"
                value={manualForm.descripcion}
                onChange={(e) => setManualForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
              <InputMiles
                placeholder="Monto ($)"
                value={manualForm.monto}
                onChange={(v) => setManualForm((f) => ({ ...f, monto: v }))}
              />
              <button type="submit" className="btn-secondary" disabled={agregandoManual}>
                + Agregar línea manual
              </button>
            </form>
          )}

          <p className="totales-preview">
            Total declarado: <strong>{formatMoney(totalDeclarado)}</strong> · Canon de {nombreConcesionario}:{' '}
            <strong>{porcentajeComision}%</strong>
          </p>
          <p className="totales-preview" style={{ fontWeight: 600 }}>
            Total a liquidar a {nombreConcesionario} — {NOMBRES_MES[Number(mes) - 1]} {ano}: {formatMoney(totalALiquidar)}
          </p>
        </>
      )}
        </>
      )}
    </>
  );
}

interface CondicionConcesionario {
  concesionario_id: string;
  razon_social: string;
  porcentaje_comision: number;
  notas: string | null;
}

// Solapa chica dentro de Liquidaciones (no una pantalla aparte) para que el
// % de cada concesionario quede bajo el mismo permiso Administrador que el
// resto de los datos financieros de acá — pedido explícito del usuario:
// "cada concesionario tiene su propio % de comisión sobre lo que
// declaramos... debería haber una solapa para cargar las condiciones."
// En pantalla se llama "Canon" (no "Comisión") para no confundirlo con la
// comisión de los comisionistas/intermediarios, que es otro módulo — el
// nombre interno (porcentaje_comision, condiciones_concesionario) quedó
// igual, es solo un cambio de rótulo.
function CondicionesConcesionarioTab({ token }: { token: string }) {
  const [condiciones, setCondiciones] = useState<CondicionConcesionario[] | null>(null);
  const [error, setError] = useState('');
  const [valoresLocal, setValoresLocal] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);

  const cargar = () => {
    setError('');
    setCondiciones(null);
    axios
      .get('/api/liquidaciones/condiciones', authHeaders(token))
      .then((res) => {
        const data: CondicionConcesionario[] = res.data || [];
        setCondiciones(data);
        const iniciales: Record<string, string> = {};
        data.forEach((c) => {
          iniciales[c.concesionario_id] = String(c.porcentaje_comision);
        });
        setValoresLocal(iniciales);
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las condiciones.'));
        setCondiciones([]);
      });
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGuardar = async (concesionarioId: string) => {
    const valor = Number(valoresLocal[concesionarioId]);
    if (isNaN(valor) || valor < 0) {
      setError('El % de Canon tiene que ser un número mayor o igual a 0.');
      return;
    }
    setGuardandoId(concesionarioId);
    setError('');
    try {
      await axios.put(`/api/liquidaciones/condiciones/${concesionarioId}`, { porcentaje_comision: valor }, authHeaders(token));
      setCondiciones((actual) =>
        (actual || []).map((c) => (c.concesionario_id === concesionarioId ? { ...c, porcentaje_comision: valor } : c))
      );
      setGuardadoId(concesionarioId);
      setTimeout(() => setGuardadoId((actual) => (actual === concesionarioId ? null : actual)), 1500);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el %.'));
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        El % de Canon de cada concesionario se aplica sobre el total declarado del período (suma de lo cargado a
        mano en "Liquidar") para dar el total real a liquidar. Sin cargar = 100% (no se descuenta nada).
      </p>
      {error && <div className="error-message">{error}</div>}
      {condiciones === null && !error && <p className="empty-state">Cargando...</p>}
      {condiciones && condiciones.length === 0 && !error && (
        <p className="empty-state">Todavía no hay concesionarios reales cargados en Locaciones.</p>
      )}
      {condiciones && condiciones.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Concesionario</th>
              <th>% de Canon</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condiciones.map((c) => (
              <tr key={c.concesionario_id}>
                <td>{c.razon_social}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valoresLocal[c.concesionario_id] ?? ''}
                    onChange={(e) =>
                      setValoresLocal((actual) => ({ ...actual, [c.concesionario_id]: e.target.value }))
                    }
                    style={{ width: '6rem' }}
                  />{' '}
                  %
                </td>
                <td style={{ fontSize: '0.85rem' }}>
                  <button type="button" className="btn-link" onClick={() => handleGuardar(c.concesionario_id)}>
                    Guardar
                  </button>{' '}
                  <span style={{ color: 'var(--color-exito, #2e7d32)' }}>
                    {guardandoId === c.concesionario_id ? 'Guardando...' : guardadoId === c.concesionario_id ? 'Guardado ✓' : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default LiquidacionesTab;
