import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, scrollAlFormulario } from '../utils/api';
import { NOMBRES_MES } from '../utils/constantesTopview';

interface Vendedor {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
}

interface TramoEscala {
  id: string;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  desde: number;
  hasta: number | null;
  porcentaje: number;
}

interface ReporteVendedor {
  vendedor_id: string;
  vendedor_nombre: string;
  cantidad_ordenes: number;
  base_comision: number;
  porcentaje_aplicado: number;
  comision: number;
}

const VENDEDOR_VACIO = { nombre: '', apellido: '', email: '', telefono: '' };
const TRAMO_VACIO = { vendedor_id: '', desde: '', hasta: '', porcentaje: '' };

function VendedoresTab({ token, puedeCrear }: { token: string; puedeCrear: boolean }) {
  const [vendedores, setVendedores] = useState<Vendedor[] | null>(null);
  const [escala, setEscala] = useState<TramoEscala[] | null>(null);
  const [error, setError] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(VENDEDOR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [mostrarFormTramo, setMostrarFormTramo] = useState(false);
  const [editandoTramoId, setEditandoTramoId] = useState<string | null>(null);
  const [formTramo, setFormTramo] = useState(TRAMO_VACIO);
  const [guardandoTramo, setGuardandoTramo] = useState(false);
  const [errorFormTramo, setErrorFormTramo] = useState('');

  const hoy = new Date();
  const [mesReporte, setMesReporte] = useState(hoy.getMonth() + 1);
  const [anoReporte, setAnoReporte] = useState(hoy.getFullYear());
  const [reporte, setReporte] = useState<ReporteVendedor[] | null>(null);
  const [errorReporte, setErrorReporte] = useState('');

  const cargar = () => {
    setError('');
    setVendedores(null);
    axios
      .get('/api/topview/vendedores', authHeaders(token))
      .then((res) => setVendedores(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los vendedores.'));
        setVendedores([]);
      });

    setEscala(null);
    axios
      .get('/api/topview/escala-comisiones-vendedor', authHeaders(token))
      .then((res) => setEscala(res.data))
      .catch(() => setEscala([]));

    cargarReporte();
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarReporte = () => {
    setErrorReporte('');
    setReporte(null);
    axios
      .get(`/api/topview/vendedores/reporte?mes=${mesReporte}&ano=${anoReporte}`, authHeaders(token))
      .then((res) => setReporte(res.data))
      .catch((err) => {
        setErrorReporte(mensajeError(err, 'No se pudo cargar el reporte.'));
        setReporte([]);
      });
  };

  useEffect(() => {
    cargarReporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesReporte, anoReporte]);

  const handleNuevo = () => {
    setForm(VENDEDOR_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (v: Vendedor) => {
    setForm({ nombre: v.nombre, apellido: v.apellido || '', email: v.email || '', telefono: v.telefono || '' });
    setEditandoId(v.id);
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
        await axios.put(`/api/topview/vendedores/${editandoId}`, form, authHeaders(token));
      } else {
        await axios.post('/api/topview/vendedores', form, authHeaders(token));
      }
      setForm(VENDEDOR_VACIO);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar el vendedor.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (v: Vendedor) => {
    if (!window.confirm(`¿Dar de baja a "${v.nombre}"?`)) return;
    try {
      await axios.delete(`/api/topview/vendedores/${v.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja el vendedor.'));
    }
  };

  const handleNuevoTramo = () => {
    setFormTramo(TRAMO_VACIO);
    setEditandoTramoId(null);
    setErrorFormTramo('');
    setMostrarFormTramo(true);
  };

  const handleEditarTramo = (t: TramoEscala) => {
    setFormTramo({
      vendedor_id: t.vendedor_id || '',
      desde: String(t.desde),
      hasta: t.hasta !== null ? String(t.hasta) : '',
      porcentaje: String(t.porcentaje),
    });
    setEditandoTramoId(t.id);
    setErrorFormTramo('');
    setMostrarFormTramo(true);
  };

  const handleSubmitTramo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTramo.desde || !formTramo.porcentaje) {
      setErrorFormTramo('Completá el desde y el porcentaje.');
      return;
    }
    setGuardandoTramo(true);
    setErrorFormTramo('');
    const datos = {
      vendedor_id: formTramo.vendedor_id || null,
      desde: Number(formTramo.desde),
      hasta: formTramo.hasta ? Number(formTramo.hasta) : null,
      porcentaje: Number(formTramo.porcentaje),
    };
    try {
      if (editandoTramoId) {
        await axios.put(`/api/topview/escala-comisiones-vendedor/${editandoTramoId}`, datos, authHeaders(token));
      } else {
        await axios.post('/api/topview/escala-comisiones-vendedor', datos, authHeaders(token));
      }
      setFormTramo(TRAMO_VACIO);
      setEditandoTramoId(null);
      setMostrarFormTramo(false);
      cargar();
    } catch (err: any) {
      setErrorFormTramo(mensajeError(err, 'No se pudo guardar el tramo.'));
    } finally {
      setGuardandoTramo(false);
    }
  };

  const handleEliminarTramo = async (t: TramoEscala) => {
    if (!window.confirm('¿Quitar este tramo de la escala?')) return;
    try {
      await axios.delete(`/api/topview/escala-comisiones-vendedor/${t.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar el tramo.'));
    }
  };

  const totalComisionMes = (reporte || []).reduce((acc, r) => acc + r.comision, 0);

  return (
    <>
      {error && <div className="error-message">{error}</div>}

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Vendedores
        </h3>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo vendedor'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Personal de ventas propio de Topview — distinto de los comisionistas (terceros externos). Se elige al cargar
        una orden para taguear quién la vendió.
      </p>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group">
            <label>Apellido</label>
            <input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} disabled={guardando} />
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
            <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} disabled={guardando} />
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar vendedor'}
            </button>
          </div>
        </form>
      )}

      {vendedores === null && <p className="empty-state">Cargando...</p>}
      {vendedores && vendedores.length === 0 && <p className="empty-state">No hay vendedores cargados.</p>}
      {vendedores && vendedores.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => (
              <tr key={v.id}>
                <td>{v.nombre}</td>
                <td>{v.apellido || '-'}</td>
                <td>{v.email || '-'}</td>
                <td>{v.telefono || '-'}</td>
                <td>
                  {puedeCrear && (
                    <>
                      <button className="btn-link" onClick={() => handleEditar(v)}>
                        Editar
                      </button>
                      {' · '}
                      <button className="btn-link btn-link-danger" onClick={() => handleEliminar(v)}>
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

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Escala de comisión
        </h3>
        {puedeCrear && (
          <button
            className="btn-primary"
            onClick={mostrarFormTramo ? () => setMostrarFormTramo(false) : handleNuevoTramo}
          >
            {mostrarFormTramo ? 'Cancelar' : '+ Nuevo tramo'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Según el total vendido en el mes, TODO ese total comisiona al % del tramo en que cae — no es progresivo por
        tramos parciales como el IVA.
      </p>

      {mostrarFormTramo && (
        <form className="cliente-form" onSubmit={handleSubmitTramo}>
          {errorFormTramo && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormTramo}
            </div>
          )}
          <div className="form-group">
            <label>Vendedor (vacío = escala general para todos)</label>
            <select
              value={formTramo.vendedor_id}
              onChange={(e) => setFormTramo({ ...formTramo, vendedor_id: e.target.value })}
              disabled={guardandoTramo}
            >
              <option value="">Escala general</option>
              {(vendedores || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} {v.apellido || ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Desde *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formTramo.desde}
              onChange={(e) => setFormTramo({ ...formTramo, desde: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="form-group">
            <label>Hasta (vacío = sin techo)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formTramo.hasta}
              onChange={(e) => setFormTramo({ ...formTramo, hasta: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="form-group">
            <label>% Comisión *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={formTramo.porcentaje}
              onChange={(e) => setFormTramo({ ...formTramo, porcentaje: e.target.value })}
              disabled={guardandoTramo}
            />
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoTramo}>
              {guardandoTramo ? 'Guardando...' : 'Guardar tramo'}
            </button>
          </div>
        </form>
      )}

      {escala === null && <p className="empty-state">Cargando...</p>}
      {escala && escala.length === 0 && <p className="empty-state">No hay tramos cargados.</p>}
      {escala && escala.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>% Comisión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {escala.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.vendedor_id ? (
                    t.vendedor_nombre
                  ) : (
                    <span className="estado-badge estado-activa">Escala general</span>
                  )}
                </td>
                <td>{formatMoney(t.desde)}</td>
                <td>{t.hasta !== null ? formatMoney(t.hasta) : 'Sin techo'}</td>
                <td>{t.porcentaje}%</td>
                <td>
                  {puedeCrear && (
                    <>
                      <button className="btn-link" onClick={() => handleEditarTramo(t)}>
                        Editar
                      </button>
                      {' · '}
                      <button className="btn-link btn-link-danger" onClick={() => handleEliminarTramo(t)}>
                        Quitar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="reportes-subtitulo">Comisión del mes</h3>
      <div className="cliente-form-actions" style={{ marginBottom: '1rem' }}>
        <select value={mesReporte} onChange={(e) => setMesReporte(Number(e.target.value))}>
          {NOMBRES_MES.map((n, i) => (
            <option key={i} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={anoReporte}
          onChange={(e) => setAnoReporte(Number(e.target.value))}
          style={{ width: '6rem' }}
        />
      </div>

      {errorReporte && <div className="error-message">{errorReporte}</div>}
      {reporte === null && !errorReporte && <p className="empty-state">Cargando...</p>}
      {reporte && reporte.length === 0 && <p className="empty-state">No hay vendedores cargados.</p>}
      {reporte && reporte.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Órdenes</th>
                <th>Base (neto de comisiones y confidenciales)</th>
                <th>Tramo aplicado</th>
                <th>Comisión</th>
              </tr>
            </thead>
            <tbody>
              {reporte.map((r) => (
                <tr key={r.vendedor_id}>
                  <td>{r.vendedor_nombre}</td>
                  <td>{r.cantidad_ordenes}</td>
                  <td>{formatMoney(r.base_comision)}</td>
                  <td>{r.cantidad_ordenes > 0 ? `${r.porcentaje_aplicado}%` : '-'}</td>
                  <td>
                    <strong>{formatMoney(r.comision)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="totales-preview">
            Total a comisionar en {NOMBRES_MES[mesReporte - 1]} {anoReporte}: <strong>{formatMoney(totalComisionMes)}</strong>
          </p>
        </>
      )}
    </>
  );
}

export default VendedoresTab;
