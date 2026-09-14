import { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <header className="header">
        <h1>💼 Sistema de Facturación</h1>
        <p>Gestión de facturas, clientes y reportes</p>
      </header>

      <nav className="navbar">
        <ul>
          <li><a href="#clientes">Clientes</a></li>
          <li><a href="#facturas">Facturas</a></li>
          <li><a href="#reportes">Reportes</a></li>
        </ul>
      </nav>

      <main className="main">
        <section className="hero">
          <h2>Bienvenido</h2>
          <p>Selecciona una opción en el menú para comenzar.</p>
          <button onClick={() => setCount(count + 1)}>
            Contador: {count}
          </button>
        </section>
      </main>

      <footer className="footer">
        <p>&copy; 2024 Sistema de Facturación. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

export default App;
