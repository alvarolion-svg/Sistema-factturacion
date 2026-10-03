import { useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';

interface CambiarPasswordModalProps {
  token: string;
  onCerrar: () => void;
}

// Cada usuario cambia su propia contraseña (pide la actual). Al guardar, las
// demás sesiones abiertas de esta cuenta se cierran; esta sigue.
function CambiarPasswordModal({ token, onCerrar }: CambiarPasswordModalProps) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) return setError('La contraseña nueva tiene que tener al menos 8 caracteres.');
    if (nueva !== repetir) return setError('La contraseña nueva y su repetición no coinciden.');
    setGuardando(true);
    try {
      await axios.put('/api/auth/password', { password_actual: actual, password_nueva: nueva }, authHeaders(token));
      setListo(true);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo cambiar la contraseña.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onCerrar}
    >
      <div
        style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', width: 'min(420px, 92vw)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Cambiar mi contraseña</h3>
        {listo ? (
          <>
            <p>Listo, tu contraseña se cambió. Las otras sesiones abiertas con tu usuario se cerraron.</p>
            <button className="btn-primary" onClick={onCerrar}>
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label htmlFor="pw_actual">Contraseña actual</label>
              <input id="pw_actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} disabled={guardando} autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="pw_nueva">Contraseña nueva (mínimo 8 caracteres)</label>
              <input id="pw_nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} disabled={guardando} />
            </div>
            <div className="form-group">
              <label htmlFor="pw_repetir">Repetir contraseña nueva</label>
              <input id="pw_repetir" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} disabled={guardando} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
              <button type="button" className="btn-link" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CambiarPasswordModal;
