import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';
import { NOMBRES_MES } from '../utils/constantesTopview';

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

export default ComisionesEfectivoTab;
