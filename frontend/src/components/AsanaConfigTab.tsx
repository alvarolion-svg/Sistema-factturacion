import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';
import { NOMBRES_MES } from '../utils/constantesTopview';

// Configuración de a dónde van las tareas de Asana (proyecto + sección de
// cada mes/año) — antes vivía hardcodeada en el backend, ahora se administra
// acá para no depender de un cambio de código cada vez que pasa un mes/año
// nuevo. Ver AsanaService/AsanaConfigService en el backend.
interface AsanaProyecto {
  gid: string | null;
  nombre: string | null;
}
interface AsanaSeccionMes {
  id: string;
  ano: number;
  mes: number;
  seccion_gid: string;
  seccion_nombre: string | null;
}
interface AsanaOpcion {
  gid: string;
  name: string;
}

function AsanaConfigTab({ token }: { token: string }) {
  const [proyecto, setProyecto] = useState<AsanaProyecto | null>(null);
  const [secciones, setSecciones] = useState<AsanaSeccionMes[] | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const [editandoProyecto, setEditandoProyecto] = useState(false);
  const [proyectosDisponibles, setProyectosDisponibles] = useState<AsanaOpcion[] | null>(null);
  const [proyectoElegido, setProyectoElegido] = useState('');
  const [errorProyectos, setErrorProyectos] = useState('');

  const [seccionesDisponibles, setSeccionesDisponibles] = useState<AsanaOpcion[] | null>(null);
  const [errorSecciones, setErrorSecciones] = useState('');
  const hoy = new Date();
  const [nuevoMes, setNuevoMes] = useState(String(hoy.getMonth() + 1));
  const [nuevoAno, setNuevoAno] = useState(String(hoy.getFullYear()));
  const [nuevaSeccionGid, setNuevaSeccionGid] = useState('');
  const [guardandoSeccion, setGuardandoSeccion] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargar = () => {
    setError('');
    setCargando(true);
    axios
      .get('/api/asana/config', authHeaders(token))
      .then((res) => {
        setProyecto(res.data.proyecto);
        setSecciones(res.data.secciones);
      })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar la configuración de Asana.')))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trae la lista de secciones reales del proyecto activo apenas se sabe
  // cuál es — así el desplegable de "agregar sección" ya tiene opciones
  // reales listas, sin un paso extra.
  useEffect(() => {
    if (!proyecto?.gid) return;
    setErrorSecciones('');
    axios
      .get(`/api/asana/proyectos/${proyecto.gid}/secciones-disponibles`, authHeaders(token))
      .then((res) => setSeccionesDisponibles(res.data))
      .catch((err) => setErrorSecciones(mensajeError(err, 'No se pudieron traer las secciones de Asana.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto?.gid]);

  const handleElegirProyecto = () => {
    setEditandoProyecto(true);
    setErrorProyectos('');
    setProyectoElegido(proyecto?.gid || '');
    if (proyectosDisponibles) return;
    axios
      .get('/api/asana/proyectos-disponibles', authHeaders(token))
      .then((res) => setProyectosDisponibles(res.data))
      .catch((err) => setErrorProyectos(mensajeError(err, 'No se pudieron traer los proyectos de Asana.')));
  };

  const handleGuardarProyecto = async () => {
    const elegido = (proyectosDisponibles || []).find((p) => p.gid === proyectoElegido);
    if (!elegido) return;
    try {
      await axios.put('/api/asana/config/proyecto', { gid: elegido.gid, nombre: elegido.name }, authHeaders(token));
      setEditandoProyecto(false);
      setSeccionesDisponibles(null);
      cargar();
    } catch (err: any) {
      setErrorProyectos(mensajeError(err, 'No se pudo guardar el proyecto.'));
    }
  };

  const handleAgregarSeccion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm('');
    if (!nuevoMes || !nuevoAno || !nuevaSeccionGid) {
      setErrorForm('Completá mes, año y sección.');
      return;
    }
    const seccionElegida = (seccionesDisponibles || []).find((s) => s.gid === nuevaSeccionGid);
    setGuardandoSeccion(true);
    try {
      await axios.post(
        '/api/asana/config/secciones',
        { ano: Number(nuevoAno), mes: Number(nuevoMes), seccion_gid: nuevaSeccionGid, seccion_nombre: seccionElegida?.name },
        authHeaders(token)
      );
      setNuevaSeccionGid('');
      cargar();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar la sección.'));
    } finally {
      setGuardandoSeccion(false);
    }
  };

  const handleQuitarSeccion = async (s: AsanaSeccionMes) => {
    if (!window.confirm(`¿Quitar la sección de ${NOMBRES_MES[s.mes - 1]} ${s.ano}?`)) return;
    try {
      await axios.delete(`/api/asana/config/secciones/${s.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la sección.'));
    }
  };

  return (
    <>
      <p style={{ maxWidth: 720, color: '#555' }}>
        Acá se configura a dónde va cada tarea cuando se manda una orden a Asana: en qué proyecto, y en qué sección según su mes de
        ingreso. Cuando se cree un mes nuevo en Asana (o el proyecto cambie), se agrega o cambia acá — no requiere tocar código.
      </p>

      {error && <div className="error-message">{error}</div>}
      {cargando && <p className="empty-state">Cargando...</p>}

      {!cargando && (
        <>
          <h3>Proyecto activo</h3>
          {!editandoProyecto ? (
            <p>
              <strong>{proyecto?.nombre || 'Sin configurar'}</strong>
              {proyecto?.gid && <span style={{ color: '#888' }}> ({proyecto.gid})</span>}{' '}
              <button className="btn-link" onClick={handleElegirProyecto}>
                Cambiar
              </button>
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {errorProyectos && <div className="error-message">{errorProyectos}</div>}
              <select
                value={proyectoElegido}
                onChange={(e) => setProyectoElegido(e.target.value)}
                style={{ minWidth: '22rem' }}
              >
                <option value="">Elegir proyecto...</option>
                {(proyectosDisponibles || []).map((p) => (
                  <option key={p.gid} value={p.gid}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-success" type="button" onClick={handleGuardarProyecto} disabled={!proyectoElegido}>
                Guardar
              </button>
              <button className="btn-link" type="button" onClick={() => setEditandoProyecto(false)}>
                Cancelar
              </button>
            </div>
          )}

          <h3 style={{ marginTop: '2rem' }}>Secciones por mes</h3>
          {(secciones || []).length === 0 ? (
            <p className="empty-state">Todavía no hay ninguna sección configurada.</p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Año</th>
                  <th>Sección en Asana</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(secciones || []).map((s) => (
                  <tr key={s.id}>
                    <td>{NOMBRES_MES[s.mes - 1]}</td>
                    <td>{s.ano}</td>
                    <td>{s.seccion_nombre || s.seccion_gid}</td>
                    <td>
                      <button className="btn-link btn-link-danger" onClick={() => handleQuitarSeccion(s)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAgregarSeccion} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginTop: '1rem' }}>
            <label style={{ fontWeight: 'normal', margin: 0 }}>
              Mes
              <select value={nuevoMes} onChange={(e) => setNuevoMes(e.target.value)} style={{ display: 'block', marginTop: '0.25rem' }}>
                {NOMBRES_MES.map((nombre, i) => (
                  <option key={i + 1} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontWeight: 'normal', margin: 0 }}>
              Año
              <input
                type="number"
                value={nuevoAno}
                onChange={(e) => setNuevoAno(e.target.value)}
                style={{ display: 'block', marginTop: '0.25rem', width: '6rem' }}
              />
            </label>
            <label style={{ fontWeight: 'normal', margin: 0 }}>
              Sección
              <select
                value={nuevaSeccionGid}
                onChange={(e) => setNuevaSeccionGid(e.target.value)}
                style={{ display: 'block', marginTop: '0.25rem', minWidth: '12rem' }}
                disabled={!proyecto?.gid}
              >
                <option value="">Elegir sección...</option>
                {(seccionesDisponibles || []).map((s) => (
                  <option key={s.gid} value={s.gid}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-success" type="submit" disabled={guardandoSeccion || !proyecto?.gid}>
              {guardandoSeccion ? 'Guardando...' : '+ Agregar sección'}
            </button>
          </form>
          {errorSecciones && <div className="error-message">{errorSecciones}</div>}
          {errorForm && <div className="error-message">{errorForm}</div>}
        </>
      )}
    </>
  );
}

export default AsanaConfigTab;
