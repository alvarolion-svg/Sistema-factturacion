import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';
import { CLASIFICACION_LABEL } from '../utils/constantesTopview';
import type { Agencia, Intermediario } from '../types/topview';

interface CondicionAgencia {
  id: string;
  agencia_id: string;
  nombre: string;
  porcentaje_nc: number;
  nc_en_cascada: number;
  porcentaje_factura: number;
  factura_en_cascada: number;
}

interface CondicionIntermediario {
  id: string;
  intermediario_id: string;
  nombre: string;
  porcentaje_comision: number;
  tipo_calculo: string;
  factura_formal: number;
}

const CONDICION_AGENCIA_VACIA = {
  agencia_id: '',
  nombre: '',
  porcentaje_nc: '0',
  nc_en_cascada: false,
  porcentaje_factura: '0',
  factura_en_cascada: false,
};

const CONDICION_INTERMEDIARIO_VACIA = {
  intermediario_id: '',
  nombre: '',
  porcentaje_comision: '0',
  tipo_calculo: 'cascada',
  factura_formal: false,
};

function CondicionesTab({
  token,
  puedeCrear,
  puedeVerComisionistas,
  puedeGestionarComisionistas,
}: {
  token: string;
  puedeCrear: boolean;
  puedeVerComisionistas: boolean;
  puedeGestionarComisionistas: boolean;
}) {
  const [agencias, setAgencias] = useState<Agencia[]>([]);
  const [intermediarios, setIntermediarios] = useState<Intermediario[]>([]);
  const [condicionesAgencia, setCondicionesAgencia] = useState<CondicionAgencia[] | null>(null);
  const [condicionesIntermediario, setCondicionesIntermediario] = useState<CondicionIntermediario[] | null>(null);
  const [error, setError] = useState('');

  const [mostrarFormAgencia, setMostrarFormAgencia] = useState(false);
  const [formAgencia, setFormAgencia] = useState(CONDICION_AGENCIA_VACIA);
  const [guardandoAgencia, setGuardandoAgencia] = useState(false);
  const [errorFormAgencia, setErrorFormAgencia] = useState('');

  const [mostrarFormInter, setMostrarFormInter] = useState(false);
  const [formInter, setFormInter] = useState(CONDICION_INTERMEDIARIO_VACIA);
  const [guardandoInter, setGuardandoInter] = useState(false);
  const [errorFormInter, setErrorFormInter] = useState('');

  const cargar = () => {
    setError('');
    axios.get('/api/topview/agencias', authHeaders(token)).then((res) => setAgencias(res.data || []));

    setCondicionesAgencia(null);
    axios
      .get('/api/topview/condiciones-agencia', authHeaders(token))
      .then((res) => setCondicionesAgencia(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las condiciones.'));
        setCondicionesAgencia([]);
      });

    if (!puedeVerComisionistas) return;

    axios.get('/api/topview/intermediarios', authHeaders(token)).then((res) => setIntermediarios(res.data || []));

    setCondicionesIntermediario(null);
    axios
      .get('/api/topview/condiciones-intermediario', authHeaders(token))
      .then((res) => setCondicionesIntermediario(res.data))
      .catch(() => setCondicionesIntermediario([]));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreAgencia = (id: string) => agencias.find((a) => a.id === id)?.nombre || id;
  const nombreIntermediario = (id: string) => intermediarios.find((i) => i.id === id)?.nombre || id;

  const handleSubmitAgencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAgencia.agencia_id || !formAgencia.nombre.trim()) {
      setErrorFormAgencia('Elegí una agencia y ponele un nombre a la condición.');
      return;
    }
    setGuardandoAgencia(true);
    setErrorFormAgencia('');
    try {
      await axios.post(
        '/api/topview/condiciones-agencia',
        {
          ...formAgencia,
          porcentaje_nc: Number(formAgencia.porcentaje_nc) || 0,
          porcentaje_factura: Number(formAgencia.porcentaje_factura) || 0,
        },
        authHeaders(token)
      );
      setFormAgencia(CONDICION_AGENCIA_VACIA);
      setMostrarFormAgencia(false);
      cargar();
    } catch (err: any) {
      setErrorFormAgencia(mensajeError(err, 'No se pudo guardar la condición.'));
    } finally {
      setGuardandoAgencia(false);
    }
  };

  const handleQuitarCondicionAgencia = async (id: string) => {
    try {
      await axios.delete(`/api/topview/condiciones-agencia/${id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la condición.'));
    }
  };

  const handleSubmitInter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInter.intermediario_id || !formInter.nombre.trim()) {
      setErrorFormInter('Elegí un comisionista y ponele un nombre a la condición.');
      return;
    }
    setGuardandoInter(true);
    setErrorFormInter('');
    try {
      await axios.post(
        '/api/topview/condiciones-intermediario',
        { ...formInter, porcentaje_comision: Number(formInter.porcentaje_comision) || 0 },
        authHeaders(token)
      );
      setFormInter(CONDICION_INTERMEDIARIO_VACIA);
      setMostrarFormInter(false);
      cargar();
    } catch (err: any) {
      setErrorFormInter(mensajeError(err, 'No se pudo guardar la condición.'));
    } finally {
      setGuardandoInter(false);
    }
  };

  const handleQuitarCondicionInter = async (id: string) => {
    try {
      await axios.delete(`/api/topview/condiciones-intermediario/${id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la condición.'));
    }
  };

  return (
    <>
      {error && <div className="error-message">{error}</div>}

      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Condiciones de agencia
        </h3>
        {puedeCrear && (
          <button className="btn-primary" onClick={() => setMostrarFormAgencia((v) => !v)}>
            {mostrarFormAgencia ? 'Cancelar' : '+ Nueva condición de agencia'}
          </button>
        )}
      </div>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        Se sugieren al elegir la agencia en el ingreso de una orden — el % de descuento comercial (NC) y el % de
        descuento facturas a esperar (FC). Quedan editables para cada caso puntual.
      </p>

      {mostrarFormAgencia && (
        <form className="cliente-form" onSubmit={handleSubmitAgencia}>
          {errorFormAgencia && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormAgencia}
            </div>
          )}
          <div className="form-group">
            <label>Agencia *</label>
            <select
              value={formAgencia.agencia_id}
              onChange={(e) => setFormAgencia({ ...formAgencia, agencia_id: e.target.value })}
              disabled={guardandoAgencia}
            >
              <option value="">Elegir agencia</option>
              {agencias.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nombre de la condición *</label>
            <input
              value={formAgencia.nombre}
              onChange={(e) => setFormAgencia({ ...formAgencia, nombre: e.target.value })}
              placeholder="Ej: Estándar, VW, OMNET"
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group">
            <label>% Descuento comercial (NC)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={formAgencia.porcentaje_nc}
              onChange={(e) => setFormAgencia({ ...formAgencia, porcentaje_nc: e.target.value })}
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group form-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={formAgencia.nc_en_cascada}
                onChange={(e) => setFormAgencia({ ...formAgencia, nc_en_cascada: e.target.checked })}
                disabled={guardandoAgencia}
              />
              {' '}NC en cascada
            </label>
          </div>
          <div className="form-group">
            <label>% Descuento facturas — a esperar (FC)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={formAgencia.porcentaje_factura}
              onChange={(e) => setFormAgencia({ ...formAgencia, porcentaje_factura: e.target.value })}
              disabled={guardandoAgencia}
            />
          </div>
          <div className="form-group form-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={formAgencia.factura_en_cascada}
                onChange={(e) => setFormAgencia({ ...formAgencia, factura_en_cascada: e.target.checked })}
                disabled={guardandoAgencia}
              />
              {' '}Factura en cascada
            </label>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoAgencia}>
              {guardandoAgencia ? 'Guardando...' : 'Guardar condición'}
            </button>
          </div>
        </form>
      )}

      {condicionesAgencia === null && <p className="empty-state">Cargando...</p>}
      {condicionesAgencia && condicionesAgencia.length === 0 && (
        <p className="empty-state">No hay condiciones de agencia cargadas.</p>
      )}
      {condicionesAgencia && condicionesAgencia.length > 0 && (
        <table className="data-table" style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th>Agencia</th>
              <th>Condición</th>
              <th>% NC</th>
              <th>% Factura</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condicionesAgencia.map((c) => (
              <tr key={c.id}>
                <td>{nombreAgencia(c.agencia_id)}</td>
                <td>{c.nombre}</td>
                <td>
                  {c.porcentaje_nc}% {c.nc_en_cascada ? '(cascada)' : ''}
                </td>
                <td>
                  {c.porcentaje_factura}% {c.factura_en_cascada ? '(cascada)' : ''}
                </td>
                <td>
                  {puedeCrear && (
                    <button className="btn-link btn-link-danger" onClick={() => handleQuitarCondicionAgencia(c.id)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeVerComisionistas && (
        <>
          <div className="view-header">
            <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
              Condiciones de comisionista
            </h3>
            {puedeGestionarComisionistas && (
              <button className="btn-primary" onClick={() => setMostrarFormInter((v) => !v)}>
                {mostrarFormInter ? 'Cancelar' : '+ Nueva condición de comisionista'}
              </button>
            )}
          </div>
          <p className="totales-preview" style={{ marginTop: 0 }}>
            Se sugieren al agregar el comisionista en una orden — % y forma de cálculo habituales. Quedan editables por
            renglón.
      </p>

      {mostrarFormInter && (
        <form className="cliente-form" onSubmit={handleSubmitInter}>
          {errorFormInter && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorFormInter}
            </div>
          )}
          <div className="form-group">
            <label>Comisionista *</label>
            <select
              value={formInter.intermediario_id}
              onChange={(e) => setFormInter({ ...formInter, intermediario_id: e.target.value })}
              disabled={guardandoInter}
            >
              <option value="">Elegir comisionista</option>
              {intermediarios.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Nombre de la condición *</label>
            <input
              value={formInter.nombre}
              onChange={(e) => setFormInter({ ...formInter, nombre: e.target.value })}
              placeholder="Ej: Estándar"
              disabled={guardandoInter}
            />
          </div>
          <div className="form-group">
            <label>% Comisión</label>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={formInter.porcentaje_comision}
              onChange={(e) => setFormInter({ ...formInter, porcentaje_comision: e.target.value })}
              disabled={guardandoInter}
            />
          </div>
          <div className="form-group">
            <label>Forma de cálculo</label>
            <select
              value={formInter.tipo_calculo}
              onChange={(e) => setFormInter({ ...formInter, tipo_calculo: e.target.value })}
              disabled={guardandoInter}
            >
              <option value="cascada">Cascada</option>
              <option value="base">Directo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Clasificación *</label>
            <select
              value={formInter.factura_formal ? 'tipo1' : 'tipo2'}
              onChange={(e) => setFormInter({ ...formInter, factura_formal: e.target.value === 'tipo1' })}
              disabled={guardandoInter}
            >
              <option value="tipo1">Tipo 1 — Con factura</option>
              <option value="tipo2">Tipo 2 — En efectivo</option>
            </select>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardandoInter}>
              {guardandoInter ? 'Guardando...' : 'Guardar condición'}
            </button>
          </div>
        </form>
      )}

      {condicionesIntermediario === null && <p className="empty-state">Cargando...</p>}
      {condicionesIntermediario && condicionesIntermediario.length === 0 && (
        <p className="empty-state">No hay condiciones de comisionista cargadas.</p>
      )}
      {condicionesIntermediario && condicionesIntermediario.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Comisionista</th>
              <th>Condición</th>
              <th>%</th>
              <th>Cálculo</th>
              <th>Clasificación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condicionesIntermediario.map((c) => (
              <tr key={c.id}>
                <td>{nombreIntermediario(c.intermediario_id)}</td>
                <td>{c.nombre}</td>
                <td>{c.porcentaje_comision}%</td>
                <td>{c.tipo_calculo === 'base' ? 'Directo' : 'Cascada'}</td>
                <td>
                  <span className={`estado-badge ${c.factura_formal ? 'estado-activa' : 'estado-pendiente'}`}>
                    {CLASIFICACION_LABEL(c.factura_formal)}
                  </span>
                </td>
                <td>
                  {puedeGestionarComisionistas && (
                    <button className="btn-link btn-link-danger" onClick={() => handleQuitarCondicionInter(c.id)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
        </>
      )}
    </>
  );
}

export default CondicionesTab;
