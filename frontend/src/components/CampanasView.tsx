import { useEffect, useState } from 'react';
import axios from 'axios';
import BloquesCampana, { BloqueCampana } from './BloquesCampana';
import { NOMBRES_MES } from '../utils/constantesTopview';
import { authHeaders, formatFecha, mensajeError } from '../utils/api';

interface Campana {
  id: string;
  nombre_anunciante: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  tipo_anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  certificacion_enviada: number | null;
  certificacion_enviada_en: string | null;
  documentos_count: number;
  bloques: BloqueCampana[];
}

interface CampanaDetalle extends Campana {
  razon_social: string;
  leyenda_factura: string | null;
  notas: string | null;
  email_contacto: string | null;
  lineas: Array<{ tipo_producto: string; cantidad: number; punto_instalacion: string | null; locacion_nombre: string | null; especificaciones: string | null }>;
  contactos: Array<{ email: string; nombre_contacto: string | null; cargo: string | null }>;
  documentos: Array<{ id: string; nombre_archivo: string; descripcion: string | null }>;
  cliente: { razon_social: string; cuit: string | null } | null;
}

// Para Tráfico: campañas con todos sus datos operativos y locaciones, sin plata.
function CampanasView({ token, puedeMarcar }: { token: string; puedeMarcar: boolean }) {
  const hoy = new Date();
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [ano, setAno] = useState(String(hoy.getFullYear()));
  const [busqueda, setBusqueda] = useState('');
  const [campanas, setCampanas] = useState<Campana[] | null>(null);
  const [detalle, setDetalle] = useState<CampanaDetalle | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    setCampanas(null);
    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    if (ano) params.set('ano', ano);
    axios
      .get(`/api/ordenes-publicidad/campanas?${params}`, authHeaders(token))
      .then((r) => setCampanas(r.data))
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las campañas.')));
  };
  useEffect(cargar, [token, mes, ano]);

  const abrir = (id: string) => {
    setError('');
    axios
      .get(`/api/ordenes-publicidad/campanas/${id}`, authHeaders(token))
      .then((r) => setDetalle(r.data))
      .catch((err) => setError(mensajeError(err, 'No se pudo abrir la campaña.')));
  };

  const marcarCertificacion = async (c: { id: string; certificacion_enviada: number | null }) => {
    setGuardando(true);
    setError('');
    try {
      await axios.put(`/api/ordenes-publicidad/${c.id}/certificacion`, { enviada: !c.certificacion_enviada }, authHeaders(token));
      cargar();
      if (detalle && detalle.id === c.id) abrir(c.id);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo marcar la certificación.'));
    } finally {
      setGuardando(false);
    }
  };

  if (detalle) {
    return (
      <section className="view-card">
        <button className="btn-link" onClick={() => setDetalle(null)}>
          ‹ Volver a la lista
        </button>
        {error && <p className="error-message">{error}</p>}
        <h2>{detalle.nombre_anunciante}</h2>
        <dl className="detalle-grid">
          <dt>N° de orden</dt>
          <dd>{detalle.numero_orden_agencia || detalle.numero_orden}</dd>
          <dt>Razón social</dt>
          <dd>{detalle.razon_social}</dd>
          <dt>Tipo de anunciante</dt>
          <dd>{detalle.tipo_anunciante}</dd>
          <dt>Período</dt>
          <dd>
            {formatFecha(detalle.periodo_desde)} → {formatFecha(detalle.periodo_hasta)}
          </dd>
          {detalle.leyenda_factura && (
            <>
              <dt>Leyenda</dt>
              <dd>{detalle.leyenda_factura}</dd>
            </>
          )}
          {detalle.notas && (
            <>
              <dt>Notas</dt>
              <dd>{detalle.notas}</dd>
            </>
          )}
          {detalle.contactos.length > 0 && (
            <>
              <dt>Contactos</dt>
              <dd>{detalle.contactos.map((c) => [c.nombre_contacto, c.email].filter(Boolean).join(' — ')).join(' · ')}</dd>
            </>
          )}
          <dt>Certificación</dt>
          <dd>
            {detalle.certificacion_enviada ? `Enviada${detalle.certificacion_enviada_en ? ` (${formatFecha(detalle.certificacion_enviada_en)})` : ''}` : 'Pendiente'}{' '}
            {puedeMarcar && (
              <button className="btn-link" disabled={guardando} onClick={() => marcarCertificacion(detalle)}>
                {detalle.certificacion_enviada ? 'Desmarcar' : 'Marcar como enviada'}
              </button>
            )}
          </dd>
        </dl>
        <h3 className="reportes-subtitulo">Dónde sale</h3>
        <BloquesCampana bloques={detalle.bloques} />
        {detalle.documentos.length > 0 && (
          <>
            <h3 className="reportes-subtitulo">Documentos adjuntos</h3>
            <ul>
              {detalle.documentos.map((d) => (
                <li key={d.id}>
                  {d.nombre_archivo}
                  {d.descripcion ? ` — ${d.descripcion}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = (campanas || []).filter((c) => !q || `${c.nombre_anunciante} ${c.numero_orden_agencia || ''} ${c.numero_orden}`.toLowerCase().includes(q));

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Campañas</h2>
      </div>
      {error && <p className="error-message">{error}</p>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {NOMBRES_MES.map((n, i) => (
            <option key={i} value={String(i + 1)}>
              {n}
            </option>
          ))}
        </select>
        <input type="number" value={ano} onChange={(e) => setAno(e.target.value)} style={{ width: '6rem' }} />
        <input placeholder="Buscar por anunciante o N° de orden" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ minWidth: '16rem' }} />
      </div>
      {!campanas && !error && <p className="empty-state">Cargando...</p>}
      {campanas && visibles.length === 0 && <p className="empty-state">No hay campañas para ese filtro.</p>}
      {visibles.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>N° orden</th>
              <th>Anunciante</th>
              <th>Período</th>
              <th>Dónde sale</th>
              <th>Certificación</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id}>
                <td>
                  <button className="btn-link" onClick={() => abrir(c.id)}>
                    {c.numero_orden_agencia || c.numero_orden}
                  </button>
                </td>
                <td>{c.nombre_anunciante}</td>
                <td>
                  {formatFecha(c.periodo_desde)} → {formatFecha(c.periodo_hasta)}
                </td>
                <td>
                  <BloquesCampana bloques={c.bloques} />
                </td>
                <td>
                  {c.certificacion_enviada ? 'Enviada' : 'Pendiente'}
                  {puedeMarcar && (
                    <>
                      {' '}
                      <button className="btn-link" disabled={guardando} onClick={() => marcarCertificacion(c)}>
                        {c.certificacion_enviada ? 'Desmarcar' : 'Marcar enviada'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default CampanasView;
