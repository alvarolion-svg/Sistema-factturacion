import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';
import { TIPOS_ANUNCIANTE, NOMBRES_MES, TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO } from '../utils/constantesTopview';

interface OrdenEjecucion {
  id: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  razon_social: string;
  nombre_anunciante: string;
  tipo_anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  estado: string;
  facturado: number;
  numero_factura_colppy: string | null;
  numero_nc_colppy: string | null;
  asana_task_gid: string | null;
  asana_asignado: number | null;
  telegram_avisado_carga_en: string | null;
  certificacion_enviada: number | null;
  documentos_count: number;
  monto_neto: number;
}

interface Fila extends OrdenEjecucion {
  revisar: boolean;
  datosOk: boolean;
  noRegistrada: boolean;
  asanaCargada: boolean;
  asanaAsignada: boolean;
  telegram: boolean;
  doc: boolean;
  certificacion: boolean;
  pendiente: boolean;
  motivo: string;
  prioridad: number;
}

const ESTADO_COLOR: Record<string, { bg: string; color: string }> = {
  Cargada: { bg: '#f4f4f5', color: '#52525b' },
  Revisada: { bg: '#eaf1fe', color: '#2554c7' },
  Facturada: { bg: '#e9f8ee', color: '#157f3d' },
};

function bordeFila(f: Fila): string {
  if (f.pendiente) return '#e81838';
  return ESTADO_COLOR[f.estado]?.color || '#d4d4d8';
}

function Check({ color = '#157f3d', size = 13 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.4}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function Dash({ color = '#d4d4d8', size = 13 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.4}>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function Alerta() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path>
    </svg>
  );
}

// "Ejecución" — qué falta para que cada orden esté completamente ejecutada
// (Asana, aviso a Operaciones, orden física adjunta, certificación enviada,
// datos de las líneas completos) — independiente del listado comercial de
// Órdenes, que mira venta/facturación, no ejecución operativa. Las órdenes
// con algo pendiente van primero, con un motivo explícito, para que sea una
// lista de "cosas por resolver" y no solo otra tabla más.
function EjecucionTab({
  token,
  puedeEditar,
  onVerOrden,
}: {
  token: string;
  puedeEditar: boolean;
  onVerOrden: (ordenId: string) => void;
}) {
  const hoy = new Date();
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [ano, setAno] = useState(String(hoy.getFullYear()));
  const [tipo, setTipo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'' | 'PEND' | 'Cargada' | 'Revisada' | 'Facturada'>('');
  const [vista, setVista] = useState<'tabla' | 'tarjetas'>('tabla');
  const [ordenes, setOrdenes] = useState<OrdenEjecucion[] | null>(null);
  const [error, setError] = useState('');

  const cargar = () => {
    setError('');
    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    if (ano) params.set('ano', ano);
    if (tipo) params.set('tipo_anunciante', tipo);
    axios
      .get(`/api/ordenes-publicidad/ejecucion?${params.toString()}`, authHeaders(token))
      .then((res) => setOrdenes(res.data))
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las órdenes.')));
  };

  useEffect(cargar, [mes, ano, tipo]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const toggleCertificacion = async (orden: Fila) => {
    if (!puedeEditar) return;
    const nuevoValor = !orden.certificacion_enviada;
    try {
      await axios.put(`/api/ordenes-publicidad/${orden.id}/certificacion`, { enviada: nuevoValor }, authHeaders(token));
      setOrdenes((prev) => (prev ? prev.map((o) => (o.id === orden.id ? { ...o, certificacion_enviada: nuevoValor ? 1 : 0 } : o)) : prev));
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo actualizar la certificación.'));
    }
  };

  const procesarFilas = (lista: OrdenEjecucion[], q: string): Fila[] =>
    lista
      .filter((o) => !q || o.razon_social.toLowerCase().includes(q) || o.nombre_anunciante.toLowerCase().includes(q))
      .map((o) => {
        const revisar = o.numero_orden_agencia === 'REVISAR';
        // Pauta Concesionario: Topview no le factura nada al cliente, así que
        // monto_neto = 0 es normal, no un error (ver OrdenesTab: ese tipo ni
        // siquiera carga descuentos/leyenda de factura).
        const datosOk = o.tipo_anunciante === TIPO_ANUNCIANTE_PAUTA_CONCESIONARIO || Number(o.monto_neto) !== 0;
        const noRegistrada = !o.facturado;
        const certificacion = !!o.certificacion_enviada;
        const certPendiente = o.estado === 'Facturada' && !certificacion;
        const pendiente = revisar || !datosOk || certPendiente;
        let motivo = '';
        if (revisar && !datosOk) motivo = 'Clon automático sin revisar, y el monto neto quedó en $0.';
        else if (revisar) motivo = 'Es un clon automático (vigencia / Timeline) todavía sin revisar.';
        else if (!datosOk) motivo = 'El monto neto de esta orden quedó en $0 — revisá que esté bien cargada.';
        else if (certPendiente) motivo = 'Está facturada pero todavía no se envió la certificación al cliente.';
        return {
          ...o,
          revisar,
          datosOk,
          noRegistrada,
          certificacion,
          asanaCargada: !!o.asana_task_gid,
          asanaAsignada: !!o.asana_asignado,
          telegram: !!o.telegram_avisado_carga_en,
          doc: (o.documentos_count || 0) > 0,
          pendiente,
          motivo,
          prioridad: pendiente ? 0 : o.estado === 'Cargada' ? 1 : o.estado === 'Revisada' ? 2 : 3,
        };
      });

  const { filas, nPend, nCargada, nRevisada, nFacturada } = useMemo(() => {
    if (!ordenes) return { filas: [] as Fila[], nPend: 0, nCargada: 0, nRevisada: 0, nFacturada: 0 };
    const q = busqueda.trim().toLowerCase();
    const todas = procesarFilas(ordenes, q);
    const conteo = {
      nPend: todas.filter((o) => o.pendiente).length,
      nCargada: todas.filter((o) => o.estado === 'Cargada').length,
      nRevisada: todas.filter((o) => o.estado === 'Revisada').length,
      nFacturada: todas.filter((o) => o.estado === 'Facturada').length,
    };
    let visibles = todas;
    if (estadoFiltro === 'PEND') visibles = visibles.filter((o) => o.pendiente);
    else if (estadoFiltro) visibles = visibles.filter((o) => o.estado === estadoFiltro);
    visibles = [...visibles].sort((a, b) => a.prioridad - b.prioridad || a.razon_social.localeCompare(b.razon_social, 'es'));
    return { filas: visibles, ...conteo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, busqueda, estadoFiltro]);

  const pill = (activo: boolean, color: string, bg: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '12.5px',
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 999,
    border: `1px solid ${activo ? color : '#e4e4e7'}`,
    cursor: 'pointer',
    background: activo ? bg : '#fff',
    color: activo ? color : '#52525b',
  });

  const periodoTexto = (f: Fila) => `${formatCorto(f.periodo_desde)} → ${formatCorto(f.periodo_hasta)}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <h3 className="reportes-subtitulo" style={{ margin: '0 0 4px' }}>
              Ejecución de campañas
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#71717a', maxWidth: 520 }}>
              Qué falta para que cada orden esté completamente ejecutada — no reemplaza el listado
              de Órdenes, es para ver de un vistazo qué quedó a medio hacer.
            </p>
          </div>
          <div style={{ display: 'flex', border: '1px solid #e4e4e7', borderRadius: 8, padding: 2, gap: 2 }}>
            <button
              onClick={() => setVista('tabla')}
              title="Ver como lista"
              aria-label="Ver como lista"
              style={{ border: 'none', background: vista === 'tabla' ? '#1f1f1f' : 'transparent', color: vista === 'tabla' ? '#fff' : '#a1a1aa', padding: '7px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <button
              onClick={() => setVista('tarjetas')}
              title="Ver como tarjetas"
              aria-label="Ver como tarjetas"
              style={{ border: 'none', background: vista === 'tarjetas' ? '#1f1f1f' : 'transparent', color: vista === 'tarjetas' ? '#fff' : '#a1a1aa', padding: '7px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.68rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Mes
            <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">Todos</option>
              {NOMBRES_MES.map((n, i) => (
                <option key={i + 1} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.68rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Año
            <select value={ano} onChange={(e) => setAno(e.target.value)} style={{ minWidth: 90 }}>
              {[2025, 2026, 2027, 2028].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.68rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Tipo de anunciante
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ minWidth: 170 }}>
              <option value="">Todos</option>
              {TIPOS_ANUNCIANTE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.68rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Buscar
            <input
              type="text"
              placeholder="Cliente o anunciante..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </label>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {ordenes === null && !error && <p className="empty-state">Cargando...</p>}

      {ordenes && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <button style={pill(estadoFiltro === 'PEND', '#e81838', '#fde8ea')} onClick={() => setEstadoFiltro(estadoFiltro === 'PEND' ? '' : 'PEND')}>
              <Alerta /> {nPend} pendientes
            </button>
            <button style={pill(estadoFiltro === 'Cargada', '#52525b', '#f4f4f5')} onClick={() => setEstadoFiltro(estadoFiltro === 'Cargada' ? '' : 'Cargada')}>
              {nCargada} cargadas
            </button>
            <button style={pill(estadoFiltro === 'Revisada', '#2554c7', '#eaf1fe')} onClick={() => setEstadoFiltro(estadoFiltro === 'Revisada' ? '' : 'Revisada')}>
              {nRevisada} revisadas
            </button>
            <button style={pill(estadoFiltro === 'Facturada', '#157f3d', '#e9f8ee')} onClick={() => setEstadoFiltro(estadoFiltro === 'Facturada' ? '' : 'Facturada')}>
              {nFacturada} facturadas
            </button>
            <span style={{ flexGrow: 1 }} />
            <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>{filas.length} órdenes</span>
          </div>

          {filas.length === 0 && <p className="empty-state">Ninguna orden coincide con estos filtros.</p>}

          {filas.length > 0 && vista === 'tabla' && (
            <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, overflow: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e7e5e4' }}>
                    {['', 'Estado', 'Asana', 'Asig.', 'Telegram', 'Doc.', 'Certif.', 'Cliente / Anunciante', 'Tipo', 'N° orden', 'Período', 'Fact. Colppy', 'NC'].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          textAlign: i >= 2 && i <= 6 ? 'center' : 'left',
                          fontSize: '10.5px',
                          textTransform: 'uppercase',
                          letterSpacing: '.03em',
                          color: '#a1a1aa',
                          fontWeight: 700,
                          padding: i === 0 ? 0 : '0 10px 8px',
                          paddingTop: 12,
                          whiteSpace: 'nowrap',
                          width: i === 0 ? 4 : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <FilaTabla key={f.id} f={f} onVerOrden={onVerOrden} onToggleCertificacion={toggleCertificacion} puedeEditar={puedeEditar} periodoTexto={periodoTexto} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filas.length > 0 && vista === 'tarjetas' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {filas.map((f) => (
                <TarjetaOrden key={f.id} f={f} onVerOrden={onVerOrden} onToggleCertificacion={toggleCertificacion} puedeEditar={puedeEditar} periodoTexto={periodoTexto} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatCorto(fecha: string | null | undefined): string {
  if (!fecha) return '-';
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

function FilaTabla({
  f,
  onVerOrden,
  onToggleCertificacion,
  puedeEditar,
  periodoTexto,
}: {
  f: Fila;
  onVerOrden: (id: string) => void;
  onToggleCertificacion: (f: Fila) => void;
  puedeEditar: boolean;
  periodoTexto: (f: Fila) => string;
}) {
  const colorEstado = ESTADO_COLOR[f.estado] || ESTADO_COLOR.Cargada;
  return (
    <>
      <tr className="fila-ejecucion" onClick={() => onVerOrden(f.id)} style={{ cursor: 'pointer' }}>
        <td style={{ padding: 0, background: bordeFila(f) }}></td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: colorEstado.bg, color: colorEstado.color, whiteSpace: 'nowrap' }}>
            {f.estado}
          </span>
          {f.revisar && <span style={{ fontSize: '10px', fontWeight: 700, color: '#e81838', marginLeft: 4 }}>REVISAR</span>}
        </td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', textAlign: 'center' }}>{f.asanaCargada ? <Check /> : <Dash />}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', textAlign: 'center' }}>{f.asanaAsignada ? <Check /> : <Dash />}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', textAlign: 'center' }}>{f.telegram ? <Check /> : <Dash />}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', textAlign: 'center' }}>{f.doc ? <Check /> : <Dash />}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onToggleCertificacion(f)}
            disabled={!puedeEditar}
            title={puedeEditar ? 'Marcar certificación enviada' : 'Certificación de exhibición'}
            style={{ border: 'none', background: 'transparent', cursor: puedeEditar ? 'pointer' : 'default', padding: 0, display: 'inline-flex' }}
          >
            {f.certificacion ? <Check /> : <Dash />}
          </button>
        </td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef' }}>
          <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{f.nombre_anunciante}</div>
          <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{f.razon_social}</div>
        </td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', color: '#71717a', fontSize: '11.5px' }}>{f.tipo_anunciante}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#a1a1aa' }}>{f.numero_orden}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', color: '#52525b', fontSize: '12.5px' }}>{periodoTexto(f)}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', fontSize: '12.5px' }}>{f.numero_factura_colppy || '—'}</td>
        <td style={{ padding: '9px 10px', borderTop: '1px solid #efefef', fontSize: '12.5px' }}>{f.numero_nc_colppy || '—'}</td>
      </tr>
      {f.pendiente && (
        <tr>
          <td style={{ padding: 0, background: bordeFila(f) }}></td>
          <td colSpan={12} style={{ padding: '6px 10px 10px' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '11.5px', color: '#a15b12', background: '#fdf1e2', borderRadius: 6, padding: '7px 9px' }}>
              <Alerta />
              <span>{f.motivo}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '11.5px',
        padding: '6px 9px',
        borderRadius: 7,
        background: ok ? '#e9f8ee' : '#f4f4f5',
        color: ok ? '#157f3d' : '#a1a1aa',
      }}
    >
      {ok ? <Check size={12} /> : <Dash size={12} />}
      <span>{label}</span>
    </div>
  );
}

function TarjetaOrden({
  f,
  onVerOrden,
  onToggleCertificacion,
  puedeEditar,
  periodoTexto,
}: {
  f: Fila;
  onVerOrden: (id: string) => void;
  onToggleCertificacion: (f: Fila) => void;
  puedeEditar: boolean;
  periodoTexto: (f: Fila) => string;
}) {
  const colorEstado = ESTADO_COLOR[f.estado] || ESTADO_COLOR.Cargada;
  return (
    <div
      style={{ background: '#fff', border: '1px solid #e7e5e4', borderLeft: `4px solid ${bordeFila(f)}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
      onClick={() => onVerOrden(f.id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: colorEstado.bg, color: colorEstado.color }}>{f.estado}</span>
          {f.revisar && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#fde8ea', color: '#e81838' }}>REVISAR</span>}
          {f.noRegistrada && <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#f0f0f0', color: '#71717a' }}>No registrada</span>}
        </div>
        <span style={{ fontSize: '11px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>{periodoTexto(f)}</span>
      </div>

      <div>
        <div style={{ fontSize: '14.5px', fontWeight: 700, lineHeight: 1.25 }}>{f.nombre_anunciante}</div>
        <div style={{ fontSize: '12px', color: '#71717a' }}>
          {f.razon_social} · {f.tipo_anunciante}
        </div>
      </div>

      <div style={{ fontSize: '11px', color: '#a1a1aa', fontFamily: 'ui-monospace, monospace' }}>{f.numero_orden}</div>

      {!f.noRegistrada && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '8px 10px', background: '#fafafa', borderRadius: 8, fontSize: 12 }}>
          <div>
            <div style={{ color: '#a1a1aa', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em' }}>Factura Colppy</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{f.numero_factura_colppy || '—'}</div>
          </div>
          <div>
            <div style={{ color: '#a1a1aa', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em' }}>NC asociada</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{f.numero_nc_colppy || '—'}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Chip ok={f.asanaCargada} label="Asana cargada" />
        <Chip ok={f.asanaAsignada} label="Asana asignada" />
        <Chip ok={f.telegram} label="Avisada Telegram" />
        <Chip ok={f.doc} label="Orden física" />
        <div style={{ gridColumn: '1 / -1' }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onToggleCertificacion(f)}
            disabled={!puedeEditar}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '11.5px',
              padding: '6px 9px',
              borderRadius: 7,
              border: 'none',
              cursor: puedeEditar ? 'pointer' : 'default',
              background: f.certificacion ? '#e9f8ee' : '#f4f4f5',
              color: f.certificacion ? '#157f3d' : '#a1a1aa',
            }}
          >
            {f.certificacion ? <Check size={12} /> : <Dash size={12} />}
            <span>Certificación de exhibición enviada</span>
          </button>
        </div>
      </div>

      {f.pendiente && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '11.5px', color: '#a15b12', background: '#fdf1e2', borderRadius: 6, padding: '7px 9px' }}>
          <Alerta />
          <span>{f.motivo}</span>
        </div>
      )}
    </div>
  );
}

export default EjecucionTab;
