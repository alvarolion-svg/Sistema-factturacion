import { useEffect, useState } from 'react';
import axios from 'axios';
import BloquesCampana, { BloqueCampana } from './BloquesCampana';
import { authHeaders, formatFecha, mensajeError } from '../utils/api';

interface CampanaResumen {
  id: string;
  nombre_anunciante: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  bloques: BloqueCampana[];
}

interface Novedades {
  hoy: string;
  arrancan_hoy: CampanaResumen[];
  nuevas: CampanaResumen[];
  proximos_dias: CampanaResumen[];
}

function Grupo({ titulo, vacio, items }: { titulo: string; vacio: string; items: CampanaResumen[] }) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h3 className="reportes-subtitulo">
        {titulo} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="empty-state">{vacio}</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {items.map((c) => (
            <article key={c.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.75rem 1rem', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <strong>{c.nombre_anunciante}</strong>
                <span style={{ color: '#555' }}>
                  {formatFecha(c.periodo_desde)} → {formatFecha(c.periodo_hasta)}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#777', margin: '0.15rem 0 0.5rem' }}>Orden {c.numero_orden_agencia || c.numero_orden}</div>
              <BloquesCampana bloques={c.bloques} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// Vista simple para Operaciones: qué arranca hoy, qué se cargó hace poco y qué viene. Sin montos.
function NovedadesView({ token }: { token: string }) {
  const [datos, setDatos] = useState<Novedades | null>(null);
  const [error, setError] = useState('');

  const cargar = () => {
    axios
      .get('/api/ordenes-publicidad/novedades', authHeaders(token))
      .then((r) => setDatos(r.data))
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las novedades.')));
  };

  useEffect(cargar, [token]);

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Novedades del día</h2>
        <button className="btn" onClick={cargar}>
          Actualizar
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
      {!datos && !error && <p className="empty-state">Cargando...</p>}
      {datos && (
        <>
          <Grupo titulo="Arrancan hoy" vacio="Hoy no arranca ninguna campaña." items={datos.arrancan_hoy} />
          <Grupo titulo="Cargadas en las últimas 48 horas" vacio="No hay órdenes nuevas." items={datos.nuevas} />
          <Grupo titulo="Arrancan en los próximos 7 días" vacio="No hay campañas por arrancar esta semana." items={datos.proximos_dias} />
        </>
      )}
    </section>
  );
}

export default NovedadesView;
