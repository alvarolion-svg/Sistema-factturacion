import { useEffect, useState } from 'react';
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
          <h1>Sistema de Facturación</h1>
          <p>Gestión de facturas, clientes y reportes</p>
        </header>
        <main className="main">
          <p className="empty-state">Verificando sesión...</p>
        </main>
      </div>
    );
  }

  if (usuario) {
    return (
      <div className="container">
        <header className="header">
          <img src="/img/logo-topview-blanco.jpg" alt="Topview" className="header-logo-left" />
          <h1>Sistema de Facturación</h1>
          <p>Gestión de facturas, clientes y reportes</p>
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

        <nav className="navbar">
          <ul>
            <li><a href="#dashboard" className={vista === 'dashboard' ? 'active' : ''}>Dashboard</a></li>
            <li><a href="#topview" className={vista === 'topview' ? 'active' : ''}>Topview</a></li>
            <li><a href="#clientes" className={vista === 'clientes' ? 'active' : ''}>Clientes</a></li>
            <li><a href="#proveedores" className={vista === 'proveedores' ? 'active' : ''}>Proveedores</a></li>
            <li><a href="#gastos" className={vista === 'gastos' ? 'active' : ''}>Gastos</a></li>
            <li><a href="#facturas" className={vista === 'facturas' ? 'active' : ''}>Facturas</a></li>
            <li><a href="#productos" className={vista === 'productos' ? 'active' : ''}>Productos</a></li>
            <li><a href="#tesoreria" className={vista === 'tesoreria' ? 'active' : ''}>Tesorería</a></li>
            <li><a href="#reportes" className={vista === 'reportes' ? 'active' : ''}>Reportes</a></li>
            <li><a href="#usuarios" className={vista === 'usuarios' ? 'active' : ''}>Usuarios</a></li>
            <li><a href="#auditoria" className={vista === 'auditoria' ? 'active' : ''}>Auditoría</a></li>
          </ul>
        </nav>

        <main className="main">
          {vista === 'dashboard' && (
            <section className="hero">
              <h2>Bienvenido, {usuario.nombre || "Usuario"}</h2>
              <p>Rol: {usuario.rol?.nombre || "Sin rol asignado"}</p>
              <p>Email: {usuario.email}</p>
            </section>
          )}

          {vista === 'topview' && <TopviewView token={token} usuario={usuario} />}

          {vista === 'clientes' && <ClientesView token={token} usuario={usuario} />}

          {vista === 'proveedores' && <ProveedoresView token={token} usuario={usuario} />}

          {vista === 'gastos' && <GastosView token={token} usuario={usuario} />}

          {vista === 'facturas' && <FacturasView token={token} usuario={usuario} />}

          {vista === 'productos' && <ProductosView token={token} usuario={usuario} />}

          {vista === 'tesoreria' && <TesoreriaView token={token} usuario={usuario} />}

          {vista === 'reportes' && <ReportesView token={token} usuario={usuario} />}

          {vista === 'usuarios' && <UsuariosView token={token} usuario={usuario} />}

          {vista === 'auditoria' && <AuditoriaView token={token} />}
        </main>

        <footer className="footer">
          <p>&copy; 2024 Sistema de Facturación. Todos los derechos reservados.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="container login-container">
      <header className="header">
        <img src="/img/logo-topview-blanco.jpg" alt="Topview" className="header-logo-left" />
        <h1>Sistema de Facturación</h1>
        <p>Gestión de facturas, clientes y reportes</p>
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
        <p>&copy; 2024 Sistema de Facturación. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

export default App;
