import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatFecha } from '../utils/api';

interface AuditoriaViewProps {
  token: string;
}

const TABLAS_AUDITORIA = ['clientes', 'facturas', 'cobros', 'notas_credito', 'cuentas', 'productos', 'usuarios', 'ordenes_publicidad'];

function AuditoriaView({ token }: AuditoriaViewProps) {
  const [filtros, setFiltros] = useState<any>({});
  const [datos, setDatos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = (filtrosActuales: any) => {
    setLoading(true);
    setError('');
    setDatos(null);

    const params: any = {};
    Object.entries(filtrosActuales).forEach(([k, v]) => {
      if (v) params[k] = v;
    });

    axios
      .get('/api/reportes/auditoria', { ...authHeaders(token), params })
      .then((res) => setDatos(res.data))
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar la auditoría.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiltroChange = (campo: string, valor: string) => {
    setFiltros((prev: any) => ({ ...prev, [campo]: valor }));
  };

  const filas = datos?.datos || [];

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Auditoría</h2>
      </div>

      <div className="reportes-filtros">
        <select value={filtros.tabla || ''} onChange={(e) => handleFiltroChange('tabla', e.target.value)}>
          <option value="">Todas las tablas</option>
          {TABLAS_AUDITORIA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
        <button className="btn-primary" onClick={() => cargar(filtros)}>
          Aplicar
        </button>
      </div>

      {loading && <p className="empty-state">Cargando...</p>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && datos && (
        <>
          <p className="totales-preview">
            Registros encontrados: <strong>{datos.cantidad ?? 0}</strong>
          </p>

          {filas.length === 0 ? (
            <p className="empty-state">No hay registros de auditoría que coincidan con el filtro.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Tabla</th>
                  <th>Operación</th>
                  <th>Registro</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((a: any) => (
                  <tr key={a.id}>
                    <td>{formatFecha(a.created_at)}</td>
                    <td>{a.usuario_nombre || a.usuario_id || '-'}</td>
                    <td>{a.tabla}</td>
                    <td>{a.tipo_operacion}</td>
                    <td>{a.registro_id}</td>
                    <td>
                      <details>
                        <summary>Ver</summary>
                        <pre className="auditoria-json">
                          {a.datos_anteriores && `Antes: ${a.datos_anteriores}\n`}
                          {a.datos_nuevos && `Después: ${a.datos_nuevos}`}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

export default AuditoriaView;
