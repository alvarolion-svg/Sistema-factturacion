import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, scrollAlFormulario } from '../utils/api';

interface Cuenta {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  saldo: number;
}

interface TesoreriaViewProps {
  token: string;
  usuario: any;
}

const CUENTA_VACIA = { nombre: '', tipo: 'Caja', moneda: 'ARS' };

function TesoreriaView({ token, usuario }: TesoreriaViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('cuentas_crear');

  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [totales, setTotales] = useState<{ ARS: number; USD: number } | null>(null);
  const [error, setError] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState(CUENTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargarEstado = () => {
    setError('');
    setCuentas(null);
    axios
      .get('/api/tesoreria/estado', authHeaders(token))
      .then((res) => {
        setCuentas(res.data?.cuentas || []);
        setTotales(res.data?.totales || null);
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudo cargar el estado de tesorería.'));
        setCuentas([]);
      });
  };

  useEffect(() => {
    cargarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (campo: keyof typeof CUENTA_VACIA, valor: string) => {
    setNuevaCuenta((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleNuevo = () => {
    setNuevaCuenta(CUENTA_VACIA);
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

    if (!nuevaCuenta.nombre.trim()) {
      setErrorForm('El nombre de la cuenta es obligatorio.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    try {
      await axios.post('/api/cuentas', nuevaCuenta, authHeaders(token));
      setMostrarForm(false);
      cargarEstado();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar la cuenta.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Tesorería</h2>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nueva cuenta'}
          </button>
        )}
      </div>

      {totales && (
        <p className="totales-preview">
          Total en pesos: <strong>{formatMoney(totales.ARS)}</strong> · Total en dólares:{' '}
          <strong>{formatMoney(totales.USD)}</strong>
        </p>
      )}

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="cuenta_nombre">Nombre *</label>
            <input
              id="cuenta_nombre"
              value={nuevaCuenta.nombre}
              onChange={(e) => handleChange('nombre', e.target.value)}
              disabled={guardando}
              placeholder="Ej: Caja, Banco Nación"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cuenta_tipo">Tipo</label>
            <select
              id="cuenta_tipo"
              value={nuevaCuenta.tipo}
              onChange={(e) => handleChange('tipo', e.target.value)}
              disabled={guardando}
            >
              <option>Caja</option>
              <option>Banco</option>
              <option>Billetera virtual</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="cuenta_moneda">Moneda</label>
            <select
              id="cuenta_moneda"
              value={nuevaCuenta.moneda}
              onChange={(e) => handleChange('moneda', e.target.value)}
              disabled={guardando}
            >
              <option value="ARS">Pesos (ARS)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cuenta'}
            </button>
          </div>
        </form>
      )}

      {cuentas === null && !error && <p className="empty-state">Cargando cuentas...</p>}

      {error && cuentas && cuentas.length === 0 && <div className="error-message">{error}</div>}

      {cuentas && cuentas.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay cuentas cargadas.
          {puedeCrear ? ' Usá "+ Nueva cuenta" para agregar la primera.' : ''}
        </p>
      )}

      {cuentas && cuentas.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Moneda</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.tipo}</td>
                <td>{c.moneda}</td>
                <td>{formatMoney(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default TesoreriaView;
