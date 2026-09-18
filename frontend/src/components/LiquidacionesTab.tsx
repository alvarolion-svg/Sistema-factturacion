import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney } from '../utils/api';

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
  tipo_producto: string;
  cantidad: number;
  punto_instalacion: string | null;
  locacion_id: string;
  locacion_nombre: string;
  liquidacion_id: string | null;
  monto: number;
}

function LiquidacionesTab({ token, puedeCargar }: { token: string; puedeCargar: boolean }) {
  const hoy = new Date();
  const [concesionarios, setConcesionarios] = useState<Concesionario[]>([]);
  const [concesionarioId, setConcesionarioId] = useState('');
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [ano, setAno] = useState(String(hoy.getFullYear()));

  const [filas, setFilas] = useState<LineaLiquidacion[] | null>(null);
  const [error, setError] = useState('');
  const [montosLocal, setMontosLocal] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);

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
        const iniciales: Record<string, string> = {};
        data.forEach((f) => {
          iniciales[f.detalle_id] = f.monto ? String(f.monto) : '';
        });
        setMontosLocal(iniciales);
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudo cargar la liquidación de ese período.'));
        setFilas([]);
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

  const anosDisponibles = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);
  const total = (filas || []).reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const nombreConcesionario = concesionarios.find((c) => c.id === concesionarioId)?.razon_social || '';

  return (
    <>
      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Liquidaciones a concesionarios
        </h3>
      </div>
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
      {concesionarioId && filas && filas.length === 0 && !error && (
        <p className="empty-state">
          {nombreConcesionario} no tiene campañas activas en {NOMBRES_MES[Number(mes) - 1]} {ano}.
        </p>
      )}

      {filas && filas.length > 0 && (
        <>
          <table className="data-table" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th>Anunciante</th>
                <th>N° orden</th>
                <th>Producto</th>
                <th>Locación</th>
                <th>Posición</th>
                <th>Cantidad</th>
                <th>Monto liquidado</th>
                {puedeCargar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.detalle_id}>
                  <td>{f.anunciante}</td>
                  <td>{f.numero_orden_agencia || f.numero_orden}</td>
                  <td>{f.tipo_producto}</td>
                  <td>{f.locacion_nombre}</td>
                  <td>{f.punto_instalacion || '—'}</td>
                  <td>{f.cantidad}</td>
                  <td>
                    {puedeCargar ? (
                      <input
                        type="number"
                        step="0.01"
                        value={montosLocal[f.detalle_id] ?? ''}
                        onChange={(e) => setMontosLocal((actual) => ({ ...actual, [f.detalle_id]: e.target.value }))}
                        onBlur={() => handleGuardarMonto(f.detalle_id)}
                        style={{ width: '9rem', textAlign: 'right' }}
                      />
                    ) : (
                      formatMoney(f.monto)
                    )}
                  </td>
                  {puedeCargar && (
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-exito, #2e7d32)' }}>
                      {guardandoId === f.detalle_id ? 'Guardando...' : guardadoId === f.detalle_id ? 'Guardado ✓' : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="totales-preview" style={{ fontWeight: 600 }}>
            Total a liquidar a {nombreConcesionario} — {NOMBRES_MES[Number(mes) - 1]} {ano}: {formatMoney(total)}
          </p>
        </>
      )}
    </>
  );
}

export default LiquidacionesTab;
