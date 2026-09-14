import { useState } from 'react';
import axios from 'axios';
import './App.css';
import { ClientesPage } from './components/ClientesPage';

function App() {
  const [usuario, setUsuario] = useState<any>(null);
  const [email, setEmail] = useState('admin@system.local');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState('dashboard');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', { email, password });
      setUsuario(response.data.usuario);
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
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  };

  if (usuario) {
    return (
      <div className="container">
        <header className="header">
          <h1>💼 Sistema de Facturación</h1>
          <p>Gestión de facturas, clientes y reportes</p>
          <button
            onClick={handleLogout}
            style={{
              position: 'absolute',
              right: '2rem',
              top: '2rem',
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
            <li>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage('dashboard');
                }}
                className={currentPage === 'dashboard' ? 'active' : ''}
              >
                Dashboard
              </a>
            </li>
            <li>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  console.log('Clientes clicked, setting currentPage to clientes');
                  setCurrentPage('clientes');
                }}
                className={currentPage === 'clientes' ? 'active' : ''}
              >
                Clientes
              </a>
            </li>
            <li>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage('facturas');
                }}
                className={currentPage === 'facturas' ? 'active' : ''}
              >
                Facturas
              </a>
            </li>
            <li>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentPage('reportes');
                }}
                className={currentPage === 'reportes' ? 'active' : ''}
              >
                Reportes
              </a>
            </li>
          </ul>
        </nav>

        <main className="main">
          {currentPage === 'dashboard' && (
            <section className="hero">
              <h2>Bienvenido, {usuario.nombre || 'Usuario'}</h2>
              <p>Rol: Administrador</p>
              <p>Email: {usuario.email}</p>
            </section>
          )}

          {currentPage === 'clientes' && <ClientesPage />}

          {currentPage === 'facturas' && (
            <section className="content-section">
              <h2>Facturas</h2>
              <p>Sección de facturas (En desarrollo)</p>
            </section>
          )}

          {currentPage === 'reportes' && (
            <section className="content-section">
              <h2>Reportes</h2>
              <p>Sección de reportes (En desarrollo)</p>
            </section>
          )}
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
        <h1>💼 Sistema de Facturación</h1>
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
