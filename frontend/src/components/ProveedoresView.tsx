import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError as mensajeErrorBase, formatMoney, formatFecha } from '../utils/api';

interface Proveedor {
  id: string;
  razon_social: string;
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  condicion_iva: string;
}

interface ReporteProveedor {
  id: string;
  deuda: number | null;
  cantidad_ordenes: number;
  ultima_compra: string | null;
}

interface ProveedoresViewProps {
  token: string;
  usuario: any;
}

const PROVEEDOR_VACIO = {
  razon_social: '',
  cuit: '',
  email: '',
  telefono: '',
  direccion: '',
  ciudad: '',
  condicion_iva: 'Responsable Inscripto',
};

function mensajeError(err: any, fallback: string): string {
  const mensaje = err?.response?.data?.error;
  if (mensaje && typeof mensaje === 'string' && mensaje.includes('UNIQUE constraint failed: proveedores.cuit')) {
    return 'Ya existe un proveedor cargado con ese CUIT.';
  }
  return mensajeErrorBase(err, fallback);
}

function ProveedoresView({ token, usuario }: ProveedoresViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('proveedores_crear');
  const puedeEditar = permisos.has('proveedores_editar');
  const puedeEliminar = permisos.has('proveedores_eliminar');

  const [proveedores, setProveedores] = useState<Proveedor[] | null>(null);
  const [reportePorId, setReportePorId] = useState<Record<string, ReporteProveedor>>({});
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const cargarProveedores = () => {
    setError('');
    setProveedores(null);
    axios
      .get('/api/proveedores', authHeaders(token))
      .then((res) => setProveedores(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los proveedores.'));
        setProveedores([]);
      });

    axios
      .get('/api/reportes/proveedores', authHeaders(token))
      .then((res) => {
        const mapa: Record<string, ReporteProveedor> = {};
        (res.data?.datos || []).forEach((d: ReporteProveedor) => {
          mapa[d.id] = d;
        });
        setReportePorId(mapa);
      })
      .catch(() => {
        // Deuda/compras son un complemento: si el reporte falla, la lista sigue funcionando.
      });
  };

  useEffect(() => {
    cargarProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proveedoresFiltrados = useMemo(() => {
    if (!proveedores) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) =>
      [p.razon_social, p.cuit, p.ciudad, p.email].some((campo) => (campo || '').toLowerCase().includes(q))
    );
  }, [proveedores, busqueda]);

  const handleChange = (campo: keyof typeof PROVEEDOR_VACIO, valor: string) => {
    setNuevoProveedor((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleNuevo = () => {
    setNuevoProveedor(PROVEEDOR_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setDetalleId(null);
    setMostrarForm(true);
  };

  const handleEditar = (proveedor: Proveedor) => {
    setNuevoProveedor({
      razon_social: proveedor.razon_social,
      cuit: proveedor.cuit || '',
      email: proveedor.email || '',
      telefono: proveedor.telefono || '',
      direccion: proveedor.direccion || '',
      ciudad: proveedor.ciudad || '',
      condicion_iva: proveedor.condicion_iva,
    });
    setEditandoId(proveedor.id);
    setErrorForm('');
    setDetalleId(null);
    setMostrarForm(true);
  };

  const handleCancelar = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setErrorForm('');
  };

  const handleConfirmarEliminar = async (proveedor: Proveedor) => {
    setEliminandoId(proveedor.id);
    try {
      await axios.delete(`/api/proveedores/${proveedor.id}`, authHeaders(token));
      if (detalleId === proveedor.id) setDetalleId(null);
      setConfirmandoId(null);
      cargarProveedores();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja al proveedor.'));
    } finally {
      setEliminandoId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevoProveedor.razon_social.trim()) {
      setErrorForm('La razón social es obligatoria.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    try {
      if (editandoId) {
        await axios.put(`/api/proveedores/${editandoId}`, nuevoProveedor, authHeaders(token));
      } else {
        await axios.post('/api/proveedores', nuevoProveedor, authHeaders(token));
      }
      setNuevoProveedor(PROVEEDOR_VACIO);
      setEditandoId(null);
      setMostrarForm(false);
      cargarProveedores();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar el proveedor.'));
    } finally {
      setGuardando(false);
    }
  };

  const proveedorDetalle = detalleId ? proveedores?.find((p) => p.id === detalleId) : null;

  if (proveedorDetalle) {
    const reporte = reportePorId[proveedorDetalle.id];
    return (
      <section className="view-card">
        <div className="view-header">
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
        </div>

        <h2 className="detalle-titulo">{proveedorDetalle.razon_social}</h2>

        <dl className="detalle-grid">
          <dt>CUIT</dt>
          <dd>{proveedorDetalle.cuit || '-'}</dd>

          <dt>Email</dt>
          <dd>{proveedorDetalle.email || '-'}</dd>

          <dt>Teléfono</dt>
          <dd>{proveedorDetalle.telefono || '-'}</dd>

          <dt>Dirección</dt>
          <dd>
            {proveedorDetalle.direccion || '-'}
            {proveedorDetalle.ciudad ? `, ${proveedorDetalle.ciudad}` : ''}
          </dd>

          <dt>Condición ante IVA</dt>
          <dd>{proveedorDetalle.condicion_iva}</dd>

          <dt>Deuda</dt>
          <dd>{formatMoney(reporte?.deuda)}</dd>

          <dt>Cantidad de órdenes de compra</dt>
          <dd>{reporte?.cantidad_ordenes ?? 0}</dd>

          <dt>Última compra</dt>
          <dd>{formatFecha(reporte?.ultima_compra)}</dd>
        </dl>

        {confirmandoId === proveedorDetalle.id ? (
          <div className="confirmar-baja">
            <span>¿Dar de baja a "{proveedorDetalle.razon_social}"? No va a aparecer más en la lista.</span>
            <div className="cliente-form-actions">
              <button
                className="btn-danger"
                onClick={() => handleConfirmarEliminar(proveedorDetalle)}
                disabled={eliminandoId === proveedorDetalle.id}
              >
                {eliminandoId === proveedorDetalle.id ? 'Dando de baja...' : 'Sí, dar de baja'}
              </button>
              <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="cliente-form-actions">
            {puedeEditar && (
              <button className="btn-primary" onClick={() => handleEditar(proveedorDetalle)}>
                Editar
              </button>
            )}
            {puedeEliminar && (
              <button className="btn-danger" onClick={() => setConfirmandoId(proveedorDetalle.id)}>
                Dar de baja
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Proveedores</h2>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo proveedor'}
          </button>
        )}
      </div>

      {mostrarForm && (puedeCrear || editandoId) && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="prov_razon_social">Razón social *</label>
            <input
              id="prov_razon_social"
              value={nuevoProveedor.razon_social}
              onChange={(e) => handleChange('razon_social', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_cuit">CUIT</label>
            <input
              id="prov_cuit"
              value={nuevoProveedor.cuit}
              onChange={(e) => handleChange('cuit', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_email">Email</label>
            <input
              id="prov_email"
              type="email"
              value={nuevoProveedor.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_telefono">Teléfono</label>
            <input
              id="prov_telefono"
              value={nuevoProveedor.telefono}
              onChange={(e) => handleChange('telefono', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_direccion">Dirección</label>
            <input
              id="prov_direccion"
              value={nuevoProveedor.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_ciudad">Ciudad</label>
            <input
              id="prov_ciudad"
              value={nuevoProveedor.ciudad}
              onChange={(e) => handleChange('ciudad', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prov_condicion_iva">Condición ante IVA</label>
            <select
              id="prov_condicion_iva"
              value={nuevoProveedor.condicion_iva}
              onChange={(e) => handleChange('condicion_iva', e.target.value)}
              disabled={guardando}
            >
              <option>Responsable Inscripto</option>
              <option>Monotributo</option>
              <option>Exento</option>
              <option>Consumidor Final</option>
            </select>
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar proveedor'}
            </button>
          </div>
        </form>
      )}

      {proveedores && proveedores.length > 0 && (
        <input
          type="text"
          className="buscador"
          placeholder="Buscar por razón social, CUIT, ciudad o email..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      {proveedores === null && !error && <p className="empty-state">Cargando proveedores...</p>}

      {error && proveedores && proveedores.length === 0 && <div className="error-message">{error}</div>}

      {proveedores && proveedores.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay proveedores cargados.
          {puedeCrear ? ' Usá "+ Nuevo proveedor" para agregar el primero.' : ''}
        </p>
      )}

      {proveedores && proveedores.length > 0 && proveedoresFiltrados.length === 0 && (
        <p className="empty-state">No hay proveedores que coincidan con la búsqueda.</p>
      )}

      {proveedoresFiltrados.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razón social</th>
              <th>CUIT</th>
              <th>Ciudad</th>
              <th>Condición IVA</th>
              <th>Deuda</th>
              <th>Órdenes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proveedoresFiltrados.map((p) => {
              const reporte = reportePorId[p.id];
              return (
                <tr key={p.id}>
                  <td>
                    <button className="btn-link" onClick={() => setDetalleId(p.id)}>
                      {p.razon_social}
                    </button>
                  </td>
                  <td>{p.cuit || '-'}</td>
                  <td>{p.ciudad || '-'}</td>
                  <td>{p.condicion_iva}</td>
                  <td>{formatMoney(reporte?.deuda)}</td>
                  <td>{reporte?.cantidad_ordenes ?? 0}</td>
                  <td className="acciones">
                    {confirmandoId === p.id ? (
                      <span className="confirmar-baja-inline">
                        ¿Confirmar?{' '}
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => handleConfirmarEliminar(p)}
                          disabled={eliminandoId === p.id}
                        >
                          {eliminandoId === p.id ? 'Dando de baja...' : 'Sí'}
                        </button>{' '}
                        <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <>
                        {puedeEditar && (
                          <button className="btn-link" onClick={() => handleEditar(p)}>
                            Editar
                          </button>
                        )}
                        {puedeEliminar && (
                          <button className="btn-link btn-link-danger" onClick={() => setConfirmandoId(p.id)}>
                            Dar de baja
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default ProveedoresView;
