import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';

const TIPOS_LOCACION = ['Paseo Comercial', 'Parque Tecnológico', 'Parking', 'Vía Pública'];

const LOCACION_VACIA = { nombre: '', tipo: TIPOS_LOCACION[0], concesionario_id: '', notas: '' };

interface PuntoForm {
  nombre: string;
  cantidad: string;
}

const SOPORTE_VACIO = { producto_id: '', cantidad: '1', tienePuntos: false, puntos: [] as PuntoForm[] };

function LocacionesTab({ token, puedeCrear, puedeEditar }: { token: string; puedeCrear: boolean; puedeEditar: boolean }) {
  const [locaciones, setLocaciones] = useState<any[] | null>(null);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string }[]>([]);
  const [productos, setProductos] = useState<{ id: string; nombre: string }[]>([]);
  const [error, setError] = useState('');

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [altaForm, setAltaForm] = useState(LOCACION_VACIA);
  const [guardandoAlta, setGuardandoAlta] = useState(false);
  const [errorAlta, setErrorAlta] = useState('');

  const [agregandoA, setAgregandoA] = useState<string | null>(null);
  const [editandoSoporteId, setEditandoSoporteId] = useState<string | null>(null);
  const [soporteForm, setSoporteForm] = useState(SOPORTE_VACIO);
  const [guardandoSoporte, setGuardandoSoporte] = useState(false);
  const [errorSoporte, setErrorSoporte] = useState('');

  const [eliminandoLocacionId, setEliminandoLocacionId] = useState<string | null>(null);
  const [eliminandoSoporteId, setEliminandoSoporteId] = useState<string | null>(null);

  const cargarLocaciones = () => {
    setError('');
    setLocaciones(null);
    axios
      .get('/api/locaciones', authHeaders(token))
      .then((res) => setLocaciones(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las locaciones.'));
        setLocaciones([]);
      });
  };

  const cargarMaestros = () => {
    axios.get('/api/proveedores', authHeaders(token)).then((res) => setProveedores(res.data || [])).catch(() => setProveedores([]));
    axios.get('/api/productos', authHeaders(token)).then((res) => setProductos(res.data || [])).catch(() => setProductos([]));
  };

  useEffect(() => {
    cargarLocaciones();
    cargarMaestros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrearLocacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!altaForm.nombre.trim()) {
      setErrorAlta('El nombre es obligatorio.');
      return;
    }
    setGuardandoAlta(true);
    setErrorAlta('');
    try {
      await axios.post(
        '/api/locaciones',
        { ...altaForm, concesionario_id: altaForm.concesionario_id || undefined },
        authHeaders(token)
      );
      setAltaForm(LOCACION_VACIA);
      setMostrarAlta(false);
      cargarLocaciones();
    } catch (err: any) {
      setErrorAlta(mensajeError(err, 'No se pudo crear la locación.'));
    } finally {
      setGuardandoAlta(false);
    }
  };

  const handleEliminarLocacion = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Dar de baja la locación "${nombre}"?`)) return;
    setEliminandoLocacionId(id);
    setError('');
    try {
      await axios.delete(`/api/locaciones/${id}`, authHeaders(token));
      cargarLocaciones();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo eliminar la locación.'));
    } finally {
      setEliminandoLocacionId(null);
    }
  };

  const handleAbrirAgregarSoporte = (locacionId: string) => {
    setAgregandoA(locacionId);
    setEditandoSoporteId(null);
    setSoporteForm(SOPORTE_VACIO);
    setErrorSoporte('');
  };

  const handleAbrirEditarSoporte = (locacionId: string, soporte: any) => {
    setAgregandoA(locacionId);
    setEditandoSoporteId(soporte.id);
    setSoporteForm({
      producto_id: soporte.producto_id,
      cantidad: String(soporte.cantidad ?? 1),
      tienePuntos: soporte.puntos.length > 0,
      puntos:
        soporte.puntos.length > 0
          ? soporte.puntos.map((p: any) => ({ nombre: p.nombre, cantidad: String(p.cantidad ?? 1) }))
          : [],
    });
    setErrorSoporte('');
  };

  const handleAgregarPunto = () => {
    setSoporteForm((prev) => ({ ...prev, puntos: [...prev.puntos, { nombre: '', cantidad: '1' }] }));
  };

  const handleCambiarPunto = (i: number, campo: keyof PuntoForm, valor: string) => {
    setSoporteForm((prev) => ({
      ...prev,
      puntos: prev.puntos.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)),
    }));
  };

  const handleQuitarPunto = (i: number) => {
    setSoporteForm((prev) => ({ ...prev, puntos: prev.puntos.filter((_, idx) => idx !== i) }));
  };

  const handleGuardarSoporte = async (locacionId: string) => {
    if (!soporteForm.producto_id) {
      setErrorSoporte('Elegí un soporte.');
      return;
    }
    const puntosValidos = soporteForm.tienePuntos
      ? soporteForm.puntos.filter((p) => p.nombre.trim()).map((p) => ({ nombre: p.nombre.trim(), cantidad: Number(p.cantidad) || 1 }))
      : [];
    if (soporteForm.tienePuntos && puntosValidos.length === 0) {
      setErrorSoporte('Agregá al menos un punto de instalación, o desmarcá la opción.');
      return;
    }
    setGuardandoSoporte(true);
    setErrorSoporte('');
    const payload = { producto_id: soporteForm.producto_id, cantidad: Number(soporteForm.cantidad) || 1, puntos: puntosValidos };
    try {
      if (editandoSoporteId) {
        await axios.put(`/api/locaciones/soportes/${editandoSoporteId}`, payload, authHeaders(token));
      } else {
        await axios.post(`/api/locaciones/${locacionId}/soportes`, payload, authHeaders(token));
      }
      setAgregandoA(null);
      setEditandoSoporteId(null);
      cargarLocaciones();
    } catch (err: any) {
      setErrorSoporte(mensajeError(err, editandoSoporteId ? 'No se pudo guardar el cambio.' : 'No se pudo agregar el soporte.'));
    } finally {
      setGuardandoSoporte(false);
    }
  };

  const handleEliminarSoporte = async (capacidadId: string) => {
    setEliminandoSoporteId(capacidadId);
    setError('');
    try {
      await axios.delete(`/api/locaciones/soportes/${capacidadId}`, authHeaders(token));
      cargarLocaciones();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar el soporte.'));
    } finally {
      setEliminandoSoporteId(null);
    }
  };

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button className="btn-primary" onClick={() => setMostrarAlta((v) => !v)}>
            {mostrarAlta ? 'Cancelar' : '+ Nueva locación'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {mostrarAlta && (
        <form className="cliente-form" onSubmit={handleCrearLocacion}>
          {errorAlta && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorAlta}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="loc_nombre">Nombre *</label>
            <input
              id="loc_nombre"
              placeholder='Ej: "Nordelta Centro Comercial"'
              value={altaForm.nombre}
              onChange={(e) => setAltaForm((p) => ({ ...p, nombre: e.target.value }))}
              disabled={guardandoAlta}
            />
          </div>
          <div className="form-group">
            <label htmlFor="loc_tipo">Tipo</label>
            <select
              id="loc_tipo"
              value={altaForm.tipo}
              onChange={(e) => setAltaForm((p) => ({ ...p, tipo: e.target.value }))}
              disabled={guardandoAlta}
            >
              {TIPOS_LOCACION.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="loc_conc">Concesionario (a quien se le paga por el espacio)</label>
            <select
              id="loc_conc"
              value={altaForm.concesionario_id}
              onChange={(e) => setAltaForm((p) => ({ ...p, concesionario_id: e.target.value }))}
              disabled={guardandoAlta}
            >
              <option value="">Sin concesionario</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="loc_notas">Notas</label>
            <input
              id="loc_notas"
              value={altaForm.notas}
              onChange={(e) => setAltaForm((p) => ({ ...p, notas: e.target.value }))}
              disabled={guardandoAlta}
            />
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoAlta}>
              {guardandoAlta ? 'Creando...' : 'Crear locación'}
            </button>
          </div>
        </form>
      )}

      {locaciones === null && !error && <p className="empty-state">Cargando locaciones...</p>}
      {locaciones && locaciones.length === 0 && (
        <p className="empty-state">
          Todavía no hay locaciones cargadas.
          {puedeCrear ? ' Usá "+ Nueva locación" para crear la primera.' : ''}
        </p>
      )}

      {locaciones && locaciones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {locaciones.map((loc) => (
            <details key={loc.id} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '0.25rem 1rem' }}>
              <summary
                style={{
                  cursor: 'pointer',
                  padding: '0.75rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  listStyle: 'none',
                }}
              >
                <div>
                  <strong>{loc.nombre}</strong>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.15rem' }}>
                    {loc.tipo || 'Sin tipo'} · Concesionario: {loc.concesionario_nombre || 'sin definir'}
                  </div>
                </div>
                <span className="estado-badge estado-pendiente">{loc.cantidad_soportes} soportes</span>
              </summary>

              <div style={{ borderTop: '1px solid #eee', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
                {loc.soportes.length === 0 ? (
                  <p className="empty-state">Todavía no tiene soportes cargados.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Soporte</th>
                        <th>Cantidad</th>
                        <th></th>
                        {puedeEditar && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {loc.soportes.map((s: any) => (
                        <tr key={s.id}>
                          <td>{s.producto_nombre}</td>
                          <td>{s.cantidad}</td>
                          <td>
                            {s.puntos.length > 0 ? (
                              <details>
                                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#c0392b' }}>
                                  {s.puntos.length} punto(s) de instalación
                                </summary>
                                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                                  {s.puntos.map((p: any) => (
                                    <li key={p.id} style={{ fontSize: '0.85rem', color: '#666' }}>
                                      {p.nombre}: {p.cantidad}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: '#999' }}>sin puntos de instalación</span>
                            )}
                          </td>
                          {puedeEditar && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button className="btn-link" onClick={() => handleAbrirEditarSoporte(loc.id, s)}>
                                Editar
                              </button>
                              {' · '}
                              <button
                                className="btn-link btn-link-danger"
                                onClick={() => handleEliminarSoporte(s.id)}
                                disabled={eliminandoSoporteId === s.id}
                              >
                                {eliminandoSoporteId === s.id ? 'Quitando...' : 'Quitar'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {puedeEditar && (
                  <>
                    {agregandoA === loc.id ? (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          background: '#faf7f7',
                          border: '1px dashed #ddd',
                          borderRadius: '6px',
                        }}
                      >
                        <strong style={{ fontSize: '0.85rem' }}>
                          {editandoSoporteId ? 'Editando soporte' : 'Nuevo soporte'}
                        </strong>
                        {errorSoporte && <div className="error-message">{errorSoporte}</div>}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Soporte</label>
                            <select
                              value={soporteForm.producto_id}
                              onChange={(e) => setSoporteForm((p) => ({ ...p, producto_id: e.target.value }))}
                              disabled={guardandoSoporte}
                            >
                              <option value="">Elegir…</option>
                              {productos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                          {!soporteForm.tienePuntos && (
                            <div className="form-group" style={{ margin: 0, maxWidth: '7rem' }}>
                              <label>Cantidad</label>
                              <input
                                type="number"
                                min="1"
                                value={soporteForm.cantidad}
                                onChange={(e) => setSoporteForm((p) => ({ ...p, cantidad: e.target.value }))}
                                disabled={guardandoSoporte}
                              />
                            </div>
                          )}
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', paddingBottom: '0.5rem' }}>
                            <input
                              type="checkbox"
                              checked={soporteForm.tienePuntos}
                              onChange={(e) =>
                                setSoporteForm((p) => ({
                                  ...p,
                                  tienePuntos: e.target.checked,
                                  puntos: e.target.checked && p.puntos.length === 0 ? [{ nombre: '', cantidad: '1' }] : p.puntos,
                                }))
                              }
                              disabled={guardandoSoporte}
                            />
                            Tiene puntos de instalación
                          </label>
                        </div>

                        {soporteForm.tienePuntos && (
                          <div style={{ marginTop: '0.6rem' }}>
                            {soporteForm.puntos.map((punto, i) => (
                              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                                <input
                                  placeholder='Nombre del punto (ej: "Freddo")'
                                  value={punto.nombre}
                                  onChange={(e) => handleCambiarPunto(i, 'nombre', e.target.value)}
                                  disabled={guardandoSoporte}
                                  style={{ flex: 1 }}
                                />
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Cant."
                                  value={punto.cantidad}
                                  onChange={(e) => handleCambiarPunto(i, 'cantidad', e.target.value)}
                                  disabled={guardandoSoporte}
                                  style={{ width: '5rem' }}
                                />
                                {soporteForm.puntos.length > 1 && (
                                  <button type="button" className="btn-link btn-link-danger" onClick={() => handleQuitarPunto(i)}>
                                    Quitar
                                  </button>
                                )}
                              </div>
                            ))}
                            <button type="button" className="btn-link" onClick={handleAgregarPunto}>
                              + Agregar punto
                            </button>
                          </div>
                        )}

                        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleGuardarSoporte(loc.id)}
                            disabled={guardandoSoporte}
                          >
                            {guardandoSoporte ? 'Guardando...' : editandoSoporteId ? 'Guardar cambios' : 'Agregar'}
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => {
                              setAgregandoA(null);
                              setEditandoSoporteId(null);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn-link" style={{ marginTop: '0.75rem' }} onClick={() => handleAbrirAgregarSoporte(loc.id)}>
                        + Agregar soporte a esta locación
                      </button>
                    )}

                    <div style={{ marginTop: '0.75rem' }}>
                      <button
                        className="btn-link btn-link-danger"
                        onClick={() => handleEliminarLocacion(loc.id, loc.nombre)}
                        disabled={eliminandoLocacionId === loc.id}
                      >
                        {eliminandoLocacionId === loc.id ? 'Eliminando...' : 'Eliminar locación'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

export default LocacionesTab;
