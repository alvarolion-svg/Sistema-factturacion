import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';

const COLORES_GRAFICO = ['#e81838', '#a8102c', '#707070', '#c4c4c4', '#f28ba0', '#4a4a4a', '#e89aab', '#9a9a9a'];

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMesCorto(mesIso: string) {
  const [ano, mes] = (mesIso || '').split('-');
  if (!ano || !mes) return mesIso;
  return `${MESES_CORTOS[Number(mes) - 1] || mes} ${ano}`;
}

interface ReportesViewProps {
  token: string;
  usuario: any;
}

interface ReporteConfig {
  key: string;
  label: string;
  permiso: string;
  url: string;
}

const REPORTES: ReporteConfig[] = [
  { key: 'ventas', label: 'Ventas', permiso: 'reportes_ventas', url: '/api/reportes/ventas' },
  { key: 'compras', label: 'Compras', permiso: 'reportes_compras', url: '/api/reportes/compras' },
  { key: 'financiero', label: 'Financiero', permiso: 'reportes_financieros', url: '/api/reportes/financieros' },
  { key: 'impositiva', label: 'Impositivo', permiso: 'reportes_impositiva', url: '/api/reportes/impositiva' },
  { key: 'clientes', label: 'Clientes', permiso: 'clientes_ver', url: '/api/reportes/clientes' },
  { key: 'proveedores', label: 'Proveedores', permiso: 'proveedores_ver', url: '/api/reportes/proveedores' },
  { key: 'topview', label: 'Topview', permiso: 'topview_ver', url: '/api/reportes/topview' },
];

function ReportesView({ token, usuario }: ReportesViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );

  const reportesDisponibles = useMemo(() => REPORTES.filter((r) => permisos.has(r.permiso)), [permisos]);

  const [reporteActivo, setReporteActivo] = useState<string>(reportesDisponibles[0]?.key || '');
  const [filtros, setFiltros] = useState<any>({});
  const [datos, setDatos] = useState<any>(null);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [errorReporte, setErrorReporte] = useState('');

  const cargarReporte = (key: string, filtrosActuales: any) => {
    const config = REPORTES.find((r) => r.key === key);
    if (!config) return;

    setLoadingReporte(true);
    setErrorReporte('');
    setDatos(null);

    const params: any = {};
    Object.entries(filtrosActuales).forEach(([k, v]) => {
      if (v) params[k] = v;
    });

    axios
      .get(config.url, { ...authHeaders(token), params })
      .then((res) => setDatos(res.data))
      .catch((err) => setErrorReporte(mensajeError(err, 'No se pudo cargar el reporte.')))
      .finally(() => setLoadingReporte(false));
  };

  useEffect(() => {
    if (reporteActivo) cargarReporte(reporteActivo, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporteActivo]);

  const handleCambiarReporte = (key: string) => {
    setReporteActivo(key);
    setFiltros({});
  };

  const handleFiltroChange = (campo: string, valor: string) => {
    setFiltros((prev: any) => ({ ...prev, [campo]: valor }));
  };

  const handleAplicarFiltros = () => {
    cargarReporte(reporteActivo, filtros);
  };

  if (reportesDisponibles.length === 0) {
    return (
      <section className="view-card">
        <div className="view-header">
          <h2>Reportes</h2>
        </div>
        <p className="empty-state">No tenés permiso para ver ningún reporte.</p>
      </section>
    );
  }

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Reportes</h2>
      </div>

      <div className="reportes-tabs">
        {reportesDisponibles.map((r) => (
          <button
            key={r.key}
            className={`reportes-tab ${reporteActivo === r.key ? 'active' : ''}`}
            onClick={() => handleCambiarReporte(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {reporteActivo === 'ventas' && (
        <div className="reportes-filtros">
          <input
            type="date"
            value={filtros.fecha_inicio || ''}
            onChange={(e) => handleFiltroChange('fecha_inicio', e.target.value)}
            placeholder="Desde"
          />
          <input
            type="date"
            value={filtros.fecha_fin || ''}
            onChange={(e) => handleFiltroChange('fecha_fin', e.target.value)}
            placeholder="Hasta"
          />
          <select value={filtros.estado || ''} onChange={(e) => handleFiltroChange('estado', e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="Abierta">Abierta</option>
            <option value="Cobrada">Cobrada</option>
            <option value="Anulada">Anulada</option>
          </select>
          <button className="btn-primary" onClick={handleAplicarFiltros}>
            Aplicar
          </button>
        </div>
      )}

      {reporteActivo === 'compras' && (
        <div className="reportes-filtros">
          <input
            type="date"
            value={filtros.fecha_inicio || ''}
            onChange={(e) => handleFiltroChange('fecha_inicio', e.target.value)}
          />
          <input
            type="date"
            value={filtros.fecha_fin || ''}
            onChange={(e) => handleFiltroChange('fecha_fin', e.target.value)}
          />
          <button className="btn-primary" onClick={handleAplicarFiltros}>
            Aplicar
          </button>
        </div>
      )}

      {reporteActivo === 'impositiva' && (
        <div className="reportes-filtros">
          <select value={filtros.mes || ''} onChange={(e) => handleFiltroChange('mes', e.target.value)}>
            <option value="">Mes actual</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Año"
            value={filtros.ano || ''}
            onChange={(e) => handleFiltroChange('ano', e.target.value)}
            style={{ maxWidth: '100px' }}
          />
          <button className="btn-primary" onClick={handleAplicarFiltros}>
            Aplicar
          </button>
        </div>
      )}

      {loadingReporte && <p className="empty-state">Cargando reporte...</p>}
      {errorReporte && <div className="error-message">{errorReporte}</div>}

      {!loadingReporte && !errorReporte && datos && (
        <>
          {reporteActivo === 'ventas' && <ReporteVentas datos={datos} />}
          {reporteActivo === 'compras' && <ReporteCompras datos={datos} />}
          {reporteActivo === 'financiero' && <ReporteFinanciero datos={datos} />}
          {reporteActivo === 'impositiva' && <ReporteImpositiva datos={datos} />}
          {reporteActivo === 'clientes' && <ReporteClientesProveedores datos={datos} tipo="clientes" />}
          {reporteActivo === 'proveedores' && <ReporteClientesProveedores datos={datos} tipo="proveedores" />}
          {reporteActivo === 'topview' && <ReporteTopview datos={datos} />}
        </>
      )}
    </section>
  );
}

function ReporteVentas({ datos }: { datos: any }) {
  const filas = datos.datos || [];
  return (
    <>
      <div className="totales-grid">
        <div className="totales-card">
          <span>Cantidad</span>
          <strong>{datos.totales?.cantidad ?? 0}</strong>
        </div>
        <div className="totales-card">
          <span>Monto total</span>
          <strong>{formatMoney(datos.totales?.monto_total)}</strong>
        </div>
        <div className="totales-card">
          <span>Cobrado</span>
          <strong>{formatMoney(datos.totales?.monto_cobrado)}</strong>
        </div>
        <div className="totales-card">
          <span>Pendiente</span>
          <strong>{formatMoney(datos.totales?.monto_pendiente)}</strong>
        </div>
        <div className="totales-card">
          <span>Validadas ARCA</span>
          <strong>{datos.totales?.facturas_validadas ?? 0}</strong>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="empty-state">No hay facturas que coincidan con el filtro.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Ítems</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f: any) => (
              <tr key={f.numero}>
                <td>{f.numero}</td>
                <td>{formatFecha(f.fecha)}</td>
                <td>{f.cliente || '-'}</td>
                <td>{formatMoney(f.total)}</td>
                <td>{formatMoney(f.saldo)}</td>
                <td>
                  <span className={`estado-badge estado-${f.estado.toLowerCase()}`}>{f.estado}</span>
                </td>
                <td>{f.items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ReporteCompras({ datos }: { datos: any }) {
  const filas = datos.datos || [];
  return (
    <>
      <div className="totales-grid">
        <div className="totales-card">
          <span>Cantidad</span>
          <strong>{datos.totales?.cantidad ?? 0}</strong>
        </div>
        <div className="totales-card">
          <span>Monto total</span>
          <strong>{formatMoney(datos.totales?.monto_total)}</strong>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="empty-state">Todavía no hay órdenes de compra cargadas.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c: any) => (
              <tr key={c.numero}>
                <td>{c.numero}</td>
                <td>{formatFecha(c.fecha)}</td>
                <td>{c.proveedor || '-'}</td>
                <td>{formatMoney(c.total)}</td>
                <td>{c.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ReporteFinanciero({ datos }: { datos: any }) {
  const cuentas = datos.cuentas || [];
  const movimientos = datos.movimientos || [];
  return (
    <>
      <div className="totales-grid">
        <div className="totales-card">
          <span>Saldo total</span>
          <strong>{formatMoney(datos.saldo_total)}</strong>
        </div>
      </div>

      <h3 className="reportes-subtitulo">Cuentas</h3>
      {cuentas.length === 0 ? (
        <p className="empty-state">Todavía no hay cuentas cargadas.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Moneda</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c: any) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.tipo}</td>
                <td>{c.moneda}</td>
                <td>{formatMoney(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="reportes-subtitulo">Movimientos por día (últimos 30)</h3>
      {movimientos.length === 0 ? (
        <p className="empty-state">Todavía no hay movimientos registrados.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cantidad de movimientos</th>
              <th>Monto total</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m: any) => (
              <tr key={m.fecha}>
                <td>{formatFecha(m.fecha)}</td>
                <td>{m.cantidad}</td>
                <td>{formatMoney(m.monto_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ReporteImpositiva({ datos }: { datos: any }) {
  const iva = datos.iva || {};
  const percepciones = datos.percepciones || {};
  const ivaEntries = Object.entries(iva);
  const percepcionesEntries = Object.entries(percepciones);

  return (
    <>
      <p className="totales-preview">
        Período: <strong>{datos.periodo}</strong>
      </p>

      <h3 className="reportes-subtitulo">IVA</h3>
      {ivaEntries.length === 0 ? (
        <p className="empty-state">Sin movimientos de IVA en el período.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ivaEntries.map(([tipo, total]: any) => (
              <tr key={tipo}>
                <td>{tipo}</td>
                <td>{formatMoney(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="reportes-subtitulo">IIBB</h3>
      <p className="totales-preview">{formatMoney(datos.iibb)}</p>

      <h3 className="reportes-subtitulo">Percepciones</h3>
      {percepcionesEntries.length === 0 ? (
        <p className="empty-state">Sin percepciones en el período.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {percepcionesEntries.map(([tipo, info]: any) => (
              <tr key={tipo}>
                <td>{tipo}</td>
                <td>{info.cantidad}</td>
                <td>{formatMoney(info.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ReporteClientesProveedores({ datos, tipo }: { datos: any; tipo: 'clientes' | 'proveedores' }) {
  const filas = datos.datos || [];
  const esClientes = tipo === 'clientes';

  return (
    <>
      <div className="totales-grid">
        <div className="totales-card">
          <span>Cantidad</span>
          <strong>{datos.totales?.cantidad ?? 0}</strong>
        </div>
        <div className="totales-card">
          <span>Deuda total</span>
          <strong>{formatMoney(datos.totales?.deuda_total)}</strong>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="empty-state">
          {esClientes
            ? 'Todavía no hay clientes cargados.'
            : 'Todavía no hay proveedores cargados en el sistema.'}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razón social</th>
              <th>CUIT</th>
              <th>Deuda</th>
              <th>{esClientes ? 'Facturas' : 'Órdenes'}</th>
              <th>{esClientes ? 'Última transacción' : 'Última compra'}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f: any) => (
              <tr key={f.id}>
                <td>{f.razon_social}</td>
                <td>{f.cuit || '-'}</td>
                <td>{formatMoney(f.deuda)}</td>
                <td>{esClientes ? f.cantidad_facturas : f.cantidad_ordenes}</td>
                <td>{formatFecha(esClientes ? f.ultima_transaccion : f.ultima_compra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ReporteTopview({ datos }: { datos: any }) {
  const puedeVerNetos = !!datos.incluye_netos;
  const [verNetos, setVerNetos] = useState(true);
  const mostrarNetos = puedeVerNetos && verNetos;

  const porAnunciante = datos.por_anunciante || [];
  const totales = datos.totales || {};
  const porMes = (datos.por_mes || []).map((m: any) => ({ ...m, mesLabel: formatMesCorto(m.mes) }));
  const porSoporte = datos.por_soporte || [];
  const topClientes = datos.top_clientes || [];
  const porComisionistaTipo = datos.por_comisionista_tipo || [];

  return (
    <>
      {puedeVerNetos && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={verNetos} onChange={(e) => setVerNetos(e.target.checked)} />
          Mostrar netos post-comisión (solo Administrador)
        </label>
      )}

      <div className="totales-grid">
        <div className="totales-card">
          <span>Órdenes revisadas</span>
          <strong>{totales.total_ordenes ?? 0}</strong>
        </div>
        <div className="totales-card">
          <span>Facturación bruta total</span>
          <strong>{formatMoney(totales.monto_neto_total)}</strong>
        </div>
        {mostrarNetos && (
          <>
            <div className="totales-card">
              <span>Monto final total</span>
              <strong>{formatMoney(totales.monto_final_total)}</strong>
            </div>
            <div className="totales-card">
              <span>Ganancia total</span>
              <strong>{formatMoney(totales.ganancia_total)}</strong>
            </div>
          </>
        )}
      </div>

      {porMes.length > 0 && (
        <>
          <h3 className="reportes-subtitulo">Facturación bruta mensual (todas las órdenes, según fecha de facturación)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mesLabel" />
              <YAxis tickFormatter={(v) => formatMoney(v)} width={90} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Bar dataKey="monto_neto_total" name="Facturación bruta" fill={COLORES_GRAFICO[0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {porAnunciante.length > 0 && (
        <div>
          <h3 className="reportes-subtitulo">Participación por tipo de anunciante (sobre facturación bruta)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={porAnunciante}
                dataKey="monto_neto_total"
                nameKey="tipo_anunciante"
                outerRadius={110}
                label={({ percent }: any) => `${(percent * 100).toFixed(1)}%`}
              >
                {porAnunciante.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORES_GRAFICO[i % COLORES_GRAFICO.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {(porSoporte.length > 0 || topClientes.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
          {porSoporte.length > 0 && (
            <div>
              <h3 className="reportes-subtitulo">Mix de soportes vendidos</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={porSoporte} dataKey="cantidad" nameKey="producto" outerRadius={100} label>
                    {porSoporte.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORES_GRAFICO[i % COLORES_GRAFICO.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {topClientes.length > 0 && (
            <div>
              <h3 className="reportes-subtitulo">Top 10 clientes/agencias por monto facturado</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topClientes} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatMoney(v)} />
                  <YAxis type="category" dataKey="razon_social" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Bar dataKey="monto_total" name={puedeVerNetos ? 'Monto final' : 'Facturación bruta'} fill={COLORES_GRAFICO[0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {mostrarNetos && porComisionistaTipo.length > 0 && (
        <>
          <h3 className="reportes-subtitulo">Comisión Tipo 1 (facturas) vs. Tipo 2 (efectivo) por comisionista</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porComisionistaTipo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatMoney(v)} width={90} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend />
              <Bar dataKey="comision_tipo1" name="Tipo 1 (facturas)" fill={COLORES_GRAFICO[0]} />
              <Bar dataKey="comision_tipo2" name="Tipo 2 (efectivo)" fill={COLORES_GRAFICO[2]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {porAnunciante.length === 0 ? (
        <p className="empty-state">No hay órdenes de publicidad activas.</p>
      ) : mostrarNetos ? (
        <div>
          <h3 className="reportes-subtitulo">Participación por tipo de anunciante (neto post-comisión)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={porAnunciante}
                dataKey="monto_final_total"
                nameKey="tipo_anunciante"
                outerRadius={110}
                label={({ percent }: any) => `${(percent * 100).toFixed(1)}%`}
              >
                {porAnunciante.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORES_GRAFICO[i % COLORES_GRAFICO.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>

          <table className="data-table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Tipo de anunciante</th>
                <th>Cantidad</th>
                <th>Monto neto</th>
                <th>Monto final</th>
              </tr>
            </thead>
            <tbody>
              {porAnunciante.map((a: any) => (
                <tr key={a.tipo_anunciante}>
                  <td>{a.tipo_anunciante}</td>
                  <td>{a.cantidad}</td>
                  <td>{formatMoney(a.monto_neto_total)}</td>
                  <td>{formatMoney(a.monto_final_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo de anunciante</th>
              <th>Cantidad</th>
              <th>Monto neto</th>
            </tr>
          </thead>
          <tbody>
            {porAnunciante.map((a: any) => (
              <tr key={a.tipo_anunciante}>
                <td>{a.tipo_anunciante}</td>
                <td>{a.cantidad}</td>
                <td>{formatMoney(a.monto_neto_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default ReportesView;
