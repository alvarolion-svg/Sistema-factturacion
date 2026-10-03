import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';

interface RolFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  cantidad_permisos: number;
  cantidad_usuarios: number;
}

interface Permiso {
  id: string;
  codigo: string;
  descripcion: string | null;
  seccion: string;
}

interface FormRol {
  id: string | null;
  nombre: string;
  descripcion: string;
  nivel: string;
  permisos: Set<string>;
}

const ROL_SUPERUSUARIO = '1';

const NOMBRE_SECCION: Record<string, string> = {
  dashboard: 'Dashboard',
  ventas: 'Ventas y facturas',
  compras: 'Compras y gastos',
  maestros: 'Clientes, proveedores y productos',
  tesoreria: 'Tesorería',
  reportes: 'Reportes',
  auditoria: 'Auditoría',
  usuarios: 'Usuarios y roles',
  topview: 'Topview (órdenes de publicidad)',
};

const FORM_VACIO: FormRol = { id: null, nombre: '', descripcion: '', nivel: '5', permisos: new Set() };

interface RolesPanelProps {
  token: string;
}

// Crear y editar roles (la jerarquía) y elegir qué puede hacer cada uno.
// Los cambios rigen en el momento, sin que nadie tenga que volver a entrar.
function RolesPanel({ token }: RolesPanelProps) {
  const [roles, setRoles] = useState<RolFila[] | null>(null);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormRol | null>(null);
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    setError('');
    axios
      .get('/api/roles', authHeaders(token))
      .then((res) => setRoles(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los roles.'));
        setRoles([]);
      });
    axios
      .get('/api/permisos', authHeaders(token))
      .then((res) => setPermisos(res.data))
      .catch(() => {});
  };

  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const permisosPorSeccion = useMemo(() => {
    const grupos = new Map<string, Permiso[]>();
    permisos.forEach((p) => {
      if (!grupos.has(p.seccion)) grupos.set(p.seccion, []);
      grupos.get(p.seccion)!.push(p);
    });
    return Array.from(grupos.entries());
  }, [permisos]);

  const abrirNuevo = () => {
    setForm({ ...FORM_VACIO, permisos: new Set() });
    setErrorForm('');
  };

  const abrirEditar = async (rol: RolFila) => {
    setErrorForm('');
    try {
      const res = await axios.get(`/api/roles/${rol.id}`, authHeaders(token));
      setForm({
        id: rol.id,
        nombre: rol.nombre,
        descripcion: rol.descripcion || '',
        nivel: String(rol.nivel),
        permisos: new Set<string>(res.data.permisos),
      });
    } catch (err) {
      setError(mensajeError(err, 'No se pudo abrir el rol.'));
    }
  };

  const copiarPermisosDe = async (rolId: string) => {
    if (!rolId || !form) return;
    try {
      const res = await axios.get(`/api/roles/${rolId}`, authHeaders(token));
      setForm({ ...form, permisos: new Set<string>(res.data.permisos) });
    } catch (err) {
      setErrorForm(mensajeError(err, 'No se pudieron copiar los permisos.'));
    }
  };

  const alternarPermiso = (id: string) => {
    if (!form) return;
    const sig = new Set(form.permisos);
    if (sig.has(id)) sig.delete(id);
    else sig.add(id);
    setForm({ ...form, permisos: sig });
  };

  const alternarSeccion = (lista: Permiso[]) => {
    if (!form) return;
    const sig = new Set(form.permisos);
    const todos = lista.every((p) => sig.has(p.id));
    lista.forEach((p) => (todos ? sig.delete(p.id) : sig.add(p.id)));
    setForm({ ...form, permisos: sig });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    setErrorForm('');
    const datos = { nombre: form.nombre, descripcion: form.descripcion, nivel: Number(form.nivel), permisos: Array.from(form.permisos) };
    try {
      if (form.id) await axios.put(`/api/roles/${form.id}`, datos, authHeaders(token));
      else await axios.post('/api/roles', datos, authHeaders(token));
      setForm(null);
      cargar();
    } catch (err) {
      setErrorForm(mensajeError(err, 'No se pudo guardar el rol.'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (rol: RolFila) => {
    if (!window.confirm(`¿Eliminar el rol "${rol.nombre}"?`)) return;
    setError('');
    try {
      await axios.delete(`/api/roles/${rol.id}`, authHeaders(token));
      cargar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo eliminar el rol.'));
    }
  };

  return (
    <div>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        Cada rol define qué ve y qué puede hacer una persona. El nivel ordena la jerarquía (2 es el más alto después del
        Superusuario). Los cambios de permisos rigen en el momento.
      </p>
      <div style={{ marginBottom: '0.75rem' }}>
        <button className="btn-primary" onClick={form ? () => setForm(null) : abrirNuevo}>
          {form ? 'Cancelar' : '+ Nuevo rol'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {form && (
        <form className="cliente-form" onSubmit={guardar}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="rol_nombre">Nombre *</label>
            <input id="rol_nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group">
            <label htmlFor="rol_nivel">Nivel (2 a 99) *</label>
            <input id="rol_nivel" type="number" min={2} max={99} value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="rol_desc">Descripción</label>
            <input id="rol_desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} disabled={guardando} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="rol_copiar">Empezar copiando los permisos de otro rol (opcional)</label>
            <select id="rol_copiar" defaultValue="" onChange={(e) => copiarPermisosDe(e.target.value)} disabled={guardando}>
              <option value="">— elegir —</option>
              {(roles || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Permisos ({form.permisos.size} elegidos)</strong>
            {permisosPorSeccion.map(([seccion, lista]) => {
              const todos = lista.every((p) => form.permisos.has(p.id));
              return (
                <fieldset key={seccion} style={{ border: '1px solid #e3e3e8', borderRadius: '6px', margin: '0.6rem 0', padding: '0.5rem 0.9rem' }}>
                  <legend style={{ padding: '0 0.4rem' }}>
                    {NOMBRE_SECCION[seccion] || seccion}{' '}
                    <button type="button" className="btn-link" onClick={() => alternarSeccion(lista)} disabled={guardando}>
                      {todos ? 'quitar todos' : 'marcar todos'}
                    </button>
                  </legend>
                  {lista.map((p) => (
                    <label key={p.id} style={{ display: 'block', fontWeight: 'normal', margin: '0.2rem 0' }}>
                      <input type="checkbox" checked={form.permisos.has(p.id)} onChange={() => alternarPermiso(p.id)} disabled={guardando} />{' '}
                      {p.descripcion || p.codigo} <small style={{ color: '#888' }}>({p.codigo})</small>
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear rol'}
            </button>
          </div>
        </form>
      )}

      {roles === null && !error && <p className="empty-state">Cargando roles...</p>}
      {roles && roles.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Rol</th>
              <th>Nivel</th>
              <th>Descripción</th>
              <th>Permisos</th>
              <th>Usuarios</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.nombre}</strong>
                </td>
                <td>{r.nivel}</td>
                <td>{r.descripcion || '-'}</td>
                <td>{r.cantidad_permisos}</td>
                <td>{r.cantidad_usuarios}</td>
                <td className="acciones">
                  {r.id === ROL_SUPERUSUARIO ? (
                    <span style={{ color: '#888' }}>Bloqueado: siempre tiene todo</span>
                  ) : (
                    <>
                      <button className="btn-link" onClick={() => abrirEditar(r)}>
                        Editar
                      </button>{' '}
                      <button className="btn-link" onClick={() => eliminar(r)}>
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default RolesPanel;
