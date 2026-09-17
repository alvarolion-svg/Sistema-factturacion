import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';

interface Gasto {
  id: string;
  numero: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  tipo_gasto: string;
  fecha: string;
  estado: string;
  monto: number;
  iva: number | null;
  total: number;
  descripcion: string | null;
  origen: string | null;
  dias_pendiente: number;
  cruza_ejercicio: boolean;
}

interface GastosViewProps {
  token: string;
  usuario: any;
}

function GastosView({ token, usuario }: GastosViewProps) {
  const permisos = useMemo(() => new Set((usuario?.permisos || []).map((p: any) => p.codigo)), [usuario]);
  const puedeEditar = permisos.has('gastos_editar');

  const [gastos, setGastos] = useState<Gasto[] | null>(null);
  const [error, setError] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = () => {
    setError('');
    setGastos(null);
    axios
      .get('/api/gastos', authHeaders(token))
      .then((res) => setGastos(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los gastos.'));
        setGastos([]);
      });
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gastosFiltrados = useMemo(() => {
    if (!gastos) return [];
    return soloPendientes ? gastos.filter((g) => g.estado === 'Pendiente') : gastos;
  }, [gastos, soloPendientes]);

  const pendientes = useMemo(() => (gastos || []).filter((g) => g.estado === 'Pendiente'), [gastos]);
  const cruzandoEjercicio = pendientes.filter((g) => g.cruza_ejercicio);
  const aging60 = pendientes.filter((g) => !g.cruza_ejercicio && g.dias_pendiente >= 60);

  const handleMarcarRecibido = async (gasto: Gasto) => {
    setActualizandoId(gasto.id);
    try {
      await axios.put(`/api/gastos/${gasto.id}`, { estado: 'Recibido' }, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo actualizar el gasto.'));
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Gastos</h2>
      </div>

      <p className="totales-preview" style={{ marginTop: 0 }}>
        Facturas de agencias y comisionistas que Topview todavía no recibió (ver Topview → Condiciones). Se generan
        solas al facturar cada mes; acá se marcan como recibidas cuando llegan.
      </p>

      {error && <div className="error-message">{error}</div>}

      {gastos && gastos.length > 0 && (cruzandoEjercicio.length > 0 || aging60.length > 0) && (
        <div className="cliente-form" style={{ gridTemplateColumns: '1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {cruzandoEjercicio.length > 0 && (
            <div className="error-message">
              <strong>⚠ {cruzandoEjercicio.length} gasto(s) cruzaron el cierre de ejercicio (31/12)</strong> sin
              llegar — van a afectar el resultado de un año que no es el que corresponde. Reclamalos:{' '}
              {cruzandoEjercicio.map((g) => g.proveedor_nombre || g.tipo_gasto).join(', ')}.
            </div>
          )}
          {aging60.length > 0 && (
            <div className="error-message" style={{ background: '#fff3cd', color: '#997404' }}>
              <strong>{aging60.length} gasto(s) llevan más de 60 días pendientes.</strong> Conviene reclamarlos antes
              de que se acerquen al cierre de ejercicio.
            </div>
          )}
        </div>
      )}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
        <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
        Mostrar solo pendientes
      </label>

      {gastos === null && !error && <p className="empty-state">Cargando gastos...</p>}
      {gastos && gastos.length === 0 && !error && (
        <p className="empty-state">Todavía no hay gastos generados — se crean solos al facturar órdenes con % de factura a esperar.</p>
      )}
      {gastos && gastos.length > 0 && gastosFiltrados.length === 0 && (
        <p className="empty-state">No hay gastos pendientes.</p>
      )}

      {gastosFiltrados.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Proveedor</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Antigüedad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gastosFiltrados.map((g) => (
              <tr key={g.id}>
                <td>{g.numero}</td>
                <td>{g.proveedor_nombre || '-'}</td>
                <td>{g.tipo_gasto}</td>
                <td>{formatFecha(g.fecha)}</td>
                <td>{formatMoney(g.total)}</td>
                <td>
                  <span className={`estado-badge estado-${g.estado.toLowerCase()}`}>{g.estado}</span>
                </td>
                <td>
                  {g.estado === 'Pendiente' ? (
                    <span className={`estado-badge ${g.cruza_ejercicio ? 'estado-anulada' : 'estado-pendiente'}`}>
                      {g.cruza_ejercicio ? `Cruzó ejercicio (${g.dias_pendiente}d)` : `${g.dias_pendiente} días`}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  {puedeEditar && g.estado === 'Pendiente' && (
                    <button
                      className="btn-link"
                      onClick={() => handleMarcarRecibido(g)}
                      disabled={actualizandoId === g.id}
                    >
                      {actualizandoId === g.id ? 'Guardando...' : 'Marcar recibido'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default GastosView;
