import { useEffect, useState } from 'react';
import CambiarPasswordModal from './components/CambiarPasswordModal';
import axios from 'axios';
import './App.css';
import ClientesView from './components/ClientesView';
import ProveedoresView from './components/ProveedoresView';
import GastosView from './components/GastosView';
import FacturasView from './components/FacturasView';
import ProductosView from './components/ProductosView';
import TesoreriaView from './components/TesoreriaView';
import ReportesView from './components/ReportesView';
import UsuariosView from './components/UsuariosView';
import AuditoriaView from './components/AuditoriaView';
import TopviewView from './components/TopviewView';
import { authHeaders } from './utils/api';

const getVistaFromHash = () => window.location.hash.replace('#', '') || 'dashboard';

// Solapas del menú y qué permiso(s) las habilitan (alcanza con tener uno). Cada
// persona ve solo las que su rol permite; el servidor igual valida cada pedido.
const VISTAS: Array<{ key: string; label: string; permisos: string[] }> = [
  { key: 'dashboard', label: 'Dashboard', permisos: ['dashboard_ver'] },
  { key: 'topview', label: 'Topview', permisos: ['topview_ver'] },
  { key: 'clientes', label: 'Clientes', permisos: ['clientes_ver'] },
  { key: 'proveedores', label: 'Proveedores', permisos: ['proveedores_ver'] },
  { key: 'gastos', label: 'Gastos', permisos: ['gastos_ver'] },
  { key: 'facturas', label: 'Facturas', permisos: ['facturas_ver'] },
  { key: 'productos', label: 'Productos', permisos: ['productos_ver'] },
  { key: 'tesoreria', label: 'Tesorería', permisos: ['tesoreria_ver'] },
  {
    key: 'reportes',
    label: 'Reportes',
    permisos: ['reportes_ventas', 'reportes_compras', 'reportes_financieros', 'reportes_impositiva', 'clientes_ver', 'proveedores_ver', 'auditoria_ver', 'topview_ver'],
  },
  { key: 'usuarios', label: 'Usuarios', permisos: ['usuarios_gestionar'] },
  { key: 'auditoria', label: 'Auditoría', permisos: ['auditoria_ver'] },
];

function App() {
  const [usuario, setUsuario] = useState<any>(null);
  const [token, setToken] = useState('');
  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [email, setEmail] = useState('admin@system.local');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vista, setVista] = useState(getVistaFromHash);

  useEffect(() => {
    const onHashChange = () => setVista(getVistaFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const tokenGuardado = localStorage.getItem('token');
    if (!tokenGuardado) {
      setVerificandoSesion(false);
      return;
    }

    axios
      .get('/api/auth/me', authHeaders(tokenGuardado))
      .then((res) => {
        setUsuario(res.data);
        setToken(tokenGuardado);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
      })
      .finally(() => setVerificandoSesion(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', { email, password });
      setUsuario(response.data.usuario);
      setToken(response.data.token);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error en el login');
    } finally {
      setLoading(false);
    }
  };

  const [mostrarCambioPassword, setMostrarCambioPassword] = useState(false);

  const handleLogout = () => {
    setUsuario(null);
    setToken('');
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  };

  if (verificandoSesion) {
    return (
      <div className="container">
        <header className="header">
          <img src="/img/logo-topview-blanco.jpg" alt="Topview" className="header-logo-left" />
          <h1>Gestion de Ordenes</h1>
          <p>Gestión de ordenes, clientes y reportes</p>
        </header>
        <main className="main">
          <p className="empty-state">Verificando sesión...</p>
        </main>
      </div>
    );
  }

  const codigosPermisos = new Set<string>((usuario?.permisos || []).map((p: any) => p.codigo));
  const vistasPermitidas = VISTAS.filter((v) => v.permisos.some((p) => codigosPermisos.has(p)));
  const vistaActiva = vistasPermitidas.some((v) => v.key === vista) ? vista : vistasPermitidas[0]?.key || '';

  if (usuario) {
    return (
      <div className="container">
        <header className="header">
          <img src="/img/logo-topview-blanco.jpg" alt="Topview" className="header-logo-left" />
          <h1>Gestion de Ordenes</h1>
          <p>Gestión de ordenes, clientes y reportes</p>
          <button
            onClick={() => setMostrarCambioPassword(true)}
            style={{
              position: 'absolute',
              right: '7rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Mi contraseña
          </button>
          <button
            onClick={handleLogout}
            style={{
              position: 'absolute',
              right: '1.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </header>

        {mostrarCambioPassword && <CambiarPasswordModal token={token} onCerrar={() => setMostrarCambioPassword(false)} />}

        <nav className="navbar">
          <ul>
            {vistasPermitidas.map((v) => (
              <li key={v.key}>
                <a href={`#${v.key}`} className={vistaActiva === v.key ? 'active' : ''}>
                  {v.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="main">
          {vistasPermitidas.length === 0 && <p className="empty-state">Tu usuario todavía no tiene acceso a ninguna sección. Pedile a un administrador que te asigne un rol.</p>}
          {vistaActiva === 'dashboard' && (
            <section className="hero">
              <h2>Bienvenido, {usuario.nombre || "Usuario"}</h2>
              <p>Rol: {usuario.rol?.nombre || "Sin rol asignado"}</p>
              <p>Email: {usuario.email}</p>
            </section>
          )}

          {vistaActiva === 'topview' && <TopviewView token={token} usuario={usuario} />}

          {vistaActiva === 'clientes' && <ClientesView token={token} usuario={usuario} />}

          {vistaActiva === 'proveedores' && <ProveedoresView token={token} usuario={usuario} />}

          {vistaActiva === 'gastos' && <GastosView token={token} usuario={usuario} />}

          {vistaActiva === 'facturas' && <FacturasView token={token} usuario={usuario} />}

          {vistaActiva === 'productos' && <ProductosView token={token} usuario={usuario} />}

          {vistaActiva === 'tesoreria' && <TesoreriaView token={token} usuario={usuario} />}

          {vistaActiva === 'reportes' && <ReportesView token={token} usuario={usuario} />}

          {vistaActiva === 'usuarios' && <UsuariosView token={token} usuario={usuario} />}

          {vistaActiva === 'auditoria' && <AuditoriaView token={token} />}
        </main>

        <footer className="footer">
          <p>&copy; 2024 Gestion de Ordenes. Todos los derechos reservados.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="container login-container">
      <header className="header">
        <img src="/img/logo-topview-blanco.jpg" alt="Topview" className="header-logo-left" />
        <h1>Gestion de Ordenes</h1>
        <p>Gestión de ordenes, clientes y reportes</p>
      </header>

      <main className="main">
        <section className="login-form">
          <h2>Iniciar Sesión</h2>
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email:</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@system.local"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña:</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123"
                disabled={loading}
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Autenticando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="credentials-info">
            <p><strong>Credenciales de prueba:</strong></p>
            <p>Email: admin@system.local</p>
            <p>Contraseña: admin123</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>&copy; 2024 Gestion de Ordenes. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

export default App;
