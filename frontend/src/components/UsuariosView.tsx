import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, scrollAlFormulario } from '../utils/api';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol_id: string;
  rol_nombre: string | null;
  departamento: string | null;
  activo: boolean;
}

interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
}

interface UsuariosViewProps {
  token: string;
  usuario: any;
}

const USUARIO_VACIO = {
  nombre: '',
  email: '',
  password: '',
  rol_id: '',
  departamento: '',
};

function UsuariosView({ token, usuario }: UsuariosViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeGestionar = permisos.has('usuarios_gestionar');

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [error, setError] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState(USUARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [editandoRolId, setEditandoRolId] = useState<string | null>(null);
  const [rolSeleccionado, setRolSeleccionado] = useState('');
  const [guardandoRol, setGuardandoRol] = useState(false);
  const [errorRol, setErrorRol] = useState('');

  const cargarDatos = () => {
    setError('');
    setUsuarios(null);
    axios
      .get('/api/usuarios', authHeaders(token))
      .then((res) => setUsuarios(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los usuarios.'));
        setUsuarios([]);
      });

    axios
      .get('/api/roles', authHeaders(token))
      .then((res) => setRoles(res.data || []))
      .catch(() => {
        // La lista de roles es un complemento del formulario; si falla, igual se puede ver la lista de usuarios.
      });
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (campo: keyof typeof USUARIO_VACIO, valor: string) => {
    setNuevoUsuario((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleNuevo = () => {
    setNuevoUsuario(USUARIO_VACIO);
    setErrorForm('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleCancelar = () => {
    setMostrarForm(false);
    setErrorForm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevoUsuario.nombre.trim() || !nuevoUsuario.email.trim() || !nuevoUsuario.password.trim()) {
      setErrorForm('Nombre, email y contraseña son obligatorios.');
      return;
    }
    if (!nuevoUsuario.rol_id) {
      setErrorForm('Elegí un rol.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    try {
      await axios.post('/api/usuarios', nuevoUsuario, authHeaders(token));
      setMostrarForm(false);
      cargarDatos();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo crear el usuario.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleAbrirCambioRol = (u: Usuario) => {
    setEditandoRolId(u.id);
    setRolSeleccionado(u.rol_id);
    setErrorRol('');
  };

  const handleGuardarRol = async (usuarioId: string) => {
    setGuardandoRol(true);
    setErrorRol('');
    try {
      await axios.put(
        `/api/usuarios/${usuarioId}/rol`,
        { nuevo_rol_id: rolSeleccionado },
        authHeaders(token)
      );
      setEditandoRolId(null);
      cargarDatos();
    } catch (err: any) {
      setErrorRol(mensajeError(err, 'No se pudo cambiar el rol.'));
    } finally {
      setGuardandoRol(false);
    }
  };

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Usuarios</h2>
        {puedeGestionar && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo usuario'}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="usuario_nombre">Nombre *</label>
            <input
              id="usuario_nombre"
              value={nuevoUsuario.nombre}
              onChange={(e) => handleChange('nombre', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="usuario_email">Email *</label>
            <input
              id="usuario_email"
              type="email"
              value={nuevoUsuario.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="usuario_password">Contraseña *</label>
            <input
              id="usuario_password"
              type="password"
              value={nuevoUsuario.password}
              onChange={(e) => handleChange('password', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="usuario_rol">Rol *</label>
            <select
              id="usuario_rol"
              value={nuevoUsuario.rol_id}
              onChange={(e) => handleChange('rol_id', e.target.value)}
              disabled={guardando}
            >
              <option value="">Elegir rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="usuario_departamento">Departamento</label>
            <input
              id="usuario_departamento"
              value={nuevoUsuario.departamento}
              onChange={(e) => handleChange('departamento', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar usuario'}
            </button>
          </div>
        </form>
      )}

      {usuarios === null && !error && <p className="empty-state">Cargando usuarios...</p>}

      {error && usuarios && usuarios.length === 0 && <div className="error-message">{error}</div>}

      {usuarios && usuarios.length === 0 && !error && (
        <p className="empty-state">No hay usuarios cargados.</p>
      )}

      {usuarios && usuarios.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Departamento</th>
              <th>Activo</th>
              {puedeGestionar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>{u.rol_nombre || '-'}</td>
                <td>{u.departamento || '-'}</td>
                <td>{u.activo ? 'Sí' : 'No'}</td>
                {puedeGestionar && (
                  <td className="acciones">
                    {editandoRolId === u.id ? (
                      <span className="confirmar-baja-inline">
                        {errorRol && <span className="ayuda-error">{errorRol} </span>}
                        <select
                          value={rolSeleccionado}
                          onChange={(e) => setRolSeleccionado(e.target.value)}
                          disabled={guardandoRol}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nombre}
                            </option>
                          ))}
                        </select>{' '}
                        <button
                          className="btn-link"
                          onClick={() => handleGuardarRol(u.id)}
                          disabled={guardandoRol}
                        >
                          {guardandoRol ? 'Guardando...' : 'Guardar'}
                        </button>{' '}
                        <button className="btn-link" onClick={() => setEditandoRolId(null)}>
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button className="btn-link" onClick={() => handleAbrirCambioRol(u)}>
                        Cambiar rol
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default UsuariosView;
