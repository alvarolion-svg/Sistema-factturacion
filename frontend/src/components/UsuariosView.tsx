import { Fragment, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, scrollAlFormulario } from '../utils/api';
import RolesPanel from './RolesPanel';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol_id: string;
  rol_nombre: string | null;
  departamento: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  activo: boolean;
}

interface VendedorOpcion {
  id: string;
  nombre: string;
  apellido: string | null;
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
  vendedor_id: '',
};

function UsuariosView({ token, usuario }: UsuariosViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeGestionar = permisos.has('usuarios_gestionar');
  const puedeGestionarRoles = permisos.has('roles_gestionar');
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios');
  const [vendedores, setVendedores] = useState<VendedorOpcion[]>([]);

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

  // Panel inline debajo de la fila: editar datos o definir una contraseña nueva.
  const [panel, setPanel] = useState<{ id: string; tipo: 'editar' | 'password' } | null>(null);
  const [formEditar, setFormEditar] = useState({ nombre: '', email: '', departamento: '', vendedor_id: '' });
  const [passNueva, setPassNueva] = useState('');
  const [guardandoPanel, setGuardandoPanel] = useState(false);
  const [errorPanel, setErrorPanel] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [avisoAccion, setAvisoAccion] = useState('');

  const handleAbrirEditar = (u: Usuario) => {
    setFormEditar({ nombre: u.nombre, email: u.email, departamento: u.departamento || '', vendedor_id: u.vendedor_id || '' });
    setErrorPanel('');
    setPanel({ id: u.id, tipo: 'editar' });
  };

  const handleAbrirPassword = (u: Usuario) => {
    setPassNueva('');
    setErrorPanel('');
    setPanel({ id: u.id, tipo: 'password' });
  };

  const handleGuardarPanel = async () => {
    if (!panel) return;
    setGuardandoPanel(true);
    setErrorPanel('');
    try {
      if (panel.tipo === 'editar') {
        await axios.put(`/api/usuarios/${panel.id}`, formEditar, authHeaders(token));
      } else {
        await axios.put(`/api/usuarios/${panel.id}/password`, { password_nueva: passNueva }, authHeaders(token));
        setAvisoAccion('Contraseña cambiada. Si ese usuario estaba conectado, se le cerró la sesión.');
      }
      setPanel(null);
      cargarDatos();
    } catch (err) {
      setErrorPanel(mensajeError(err, 'No se pudo guardar.'));
    } finally {
      setGuardandoPanel(false);
    }
  };

  const handleCambiarActivo = async (u: Usuario) => {
    const desactivar = u.activo;
    if (
      desactivar &&
      !window.confirm(`¿Desactivar a ${u.nombre}? No va a poder ingresar al sistema y se le cierra la sesión si estaba conectado.`)
    ) {
      return;
    }
    setErrorAccion('');
    setAvisoAccion('');
    try {
      await axios.put(`/api/usuarios/${u.id}/activo`, { activo: !desactivar }, authHeaders(token));
      cargarDatos();
    } catch (err) {
      setErrorAccion(mensajeError(err, 'No se pudo cambiar el estado del usuario.'));
    }
  };

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
      .get('/api/topview/vendedores', authHeaders(token))
      .then((res) => setVendedores(res.data || []))
      .catch(() => {
        // Sin permiso para ver vendedores: el vínculo simplemente no se ofrece.
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
      {puedeGestionarRoles && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={pestana === 'usuarios' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPestana('usuarios')}>
            Usuarios
          </button>
          <button className={pestana === 'roles' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPestana('roles')}>
            Roles y permisos
          </button>
        </div>
      )}

      {pestana === 'roles' && puedeGestionarRoles && <RolesPanel token={token} />}

      {pestana === 'usuarios' && (
      <>
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

          {vendedores.length > 0 && (
            <div className="form-group">
              <label htmlFor="usuario_vendedor">Vendedor vinculado (opcional)</label>
              <select id="usuario_vendedor" value={nuevoUsuario.vendedor_id} onChange={(e) => handleChange('vendedor_id', e.target.value)} disabled={guardando}>
                <option value="">Sin vincular</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`${v.nombre} ${v.apellido || ''}`.trim()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar usuario'}
            </button>
          </div>
        </form>
      )}

      {errorAccion && <div className="error-message">{errorAccion}</div>}
      {avisoAccion && <div className="success-message" style={{ marginBottom: '0.75rem' }}>{avisoAccion}</div>}

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
              <th>Vendedor</th>
              <th>Activo</th>
              {puedeGestionar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <Fragment key={u.id}>
                <tr style={u.activo ? undefined : { opacity: 0.55 }}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{u.rol_nombre || '-'}</td>
                  <td>{u.departamento || '-'}</td>
                  <td>{u.vendedor_nombre || '-'}</td>
                  <td>{u.activo ? 'Sí' : 'No (desactivado)'}</td>
                  {puedeGestionar && (
                    <td className="acciones">
                      {editandoRolId === u.id ? (
                        <span className="confirmar-baja-inline">
                          {errorRol && <span className="ayuda-error">{errorRol} </span>}
                          <select value={rolSeleccionado} onChange={(e) => setRolSeleccionado(e.target.value)} disabled={guardandoRol}>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nombre}
                              </option>
                            ))}
                          </select>{' '}
                          <button className="btn-link" onClick={() => handleGuardarRol(u.id)} disabled={guardandoRol}>
                            {guardandoRol ? 'Guardando...' : 'Guardar'}
                          </button>{' '}
                          <button className="btn-link" onClick={() => setEditandoRolId(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <>
                          <button className="btn-link" onClick={() => handleAbrirEditar(u)}>
                            Editar
                          </button>{' '}
                          <button className="btn-link" onClick={() => handleAbrirCambioRol(u)}>
                            Cambiar rol
                          </button>{' '}
                          <button className="btn-link" onClick={() => handleAbrirPassword(u)}>
                            Contraseña
                          </button>
                          {u.id !== usuario?.id && (
                            <>
                              {' '}
                              <button className="btn-link" onClick={() => handleCambiarActivo(u)}>
                                {u.activo ? 'Desactivar' : 'Reactivar'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
                {panel?.id === u.id && (
                  <tr>
                    <td colSpan={7} style={{ background: '#f7f7f9' }}>
                      {errorPanel && <div className="error-message">{errorPanel}</div>}
                      {panel.tipo === 'editar' ? (
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <label>
                            Nombre
                            <input value={formEditar.nombre} onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })} disabled={guardandoPanel} />
                          </label>
                          <label>
                            Email
                            <input type="email" value={formEditar.email} onChange={(e) => setFormEditar({ ...formEditar, email: e.target.value })} disabled={guardandoPanel} />
                          </label>
                          <label>
                            Departamento
                            <input value={formEditar.departamento} onChange={(e) => setFormEditar({ ...formEditar, departamento: e.target.value })} disabled={guardandoPanel} />
                          </label>
                          {vendedores.length > 0 && (
                            <label>
                              Vendedor vinculado
                              <select value={formEditar.vendedor_id} onChange={(e) => setFormEditar({ ...formEditar, vendedor_id: e.target.value })} disabled={guardandoPanel}>
                                <option value="">Sin vincular</option>
                                {vendedores.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {`${v.nombre} ${v.apellido || ''}`.trim()}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      ) : (
                        <label>
                          Contraseña nueva para {u.nombre} (mínimo 8 caracteres)
                          <input type="password" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} disabled={guardandoPanel} autoFocus />
                        </label>
                      )}
                      <div style={{ marginTop: '0.6rem' }}>
                        <button className="btn-primary" onClick={handleGuardarPanel} disabled={guardandoPanel}>
                          {guardandoPanel ? 'Guardando...' : 'Guardar'}
                        </button>{' '}
                        <button className="btn-link" onClick={() => setPanel(null)} disabled={guardandoPanel}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      </>
      )}
    </section>
  );
}

export default UsuariosView;
