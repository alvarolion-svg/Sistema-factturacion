import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError as mensajeErrorBase, formatMoney, formatFecha } from '../utils/api';

interface Contacto {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  rol: string | null;
  telefono: string | null;
  interno: string | null;
  skype: string | null;
}

interface Cliente {
  id: string;
  razon_social: string;
  nombre_fantasia: string | null;
  cuit: string | null;
  dni: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  provincia: string | null;
  pais: string | null;
  direccion_fiscal: string | null;
  ciudad_fiscal: string | null;
  codigo_postal_fiscal: string | null;
  provincia_fiscal: string | null;
  pais_fiscal: string | null;
  condicion_iva: string;
  condicion_pago: string | null;
  limite_credito: number | null;
  porcentaje_iva: number | null;
  retencion_ganancias: number | null;
  numero_plan_cuenta: string | null;
  numero_cuenta_bancaria: string | null;
  cbu: string | null;
  banco: string | null;
  descripcion_banco: string | null;
  es_agencia?: boolean;
  agencia_nombre?: string | null;
}

interface ReporteCliente {
  id: string;
  deuda: number | null;
  cantidad_facturas: number;
  ultima_transaccion: string | null;
}

interface ClientesViewProps {
  token: string;
  usuario: any;
}

interface LineaContacto {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  telefono: string;
  interno: string;
  skype: string;
}

const LINEA_CONTACTO_VACIA: LineaContacto = {
  nombre: '',
  apellido: '',
  email: '',
  rol: '',
  telefono: '',
  interno: '',
  skype: '',
};

const CLIENTE_VACIO = {
  razon_social: '',
  nombre_fantasia: '',
  cuit: '',
  dni: '',
  email: '',
  telefono: '',
  direccion: '',
  ciudad: '',
  codigo_postal: '',
  provincia: '',
  pais: '',
  direccion_fiscal: '',
  ciudad_fiscal: '',
  codigo_postal_fiscal: '',
  provincia_fiscal: '',
  pais_fiscal: '',
  condicion_iva: 'Responsable Inscripto',
  condicion_pago: '',
  limite_credito: '',
  porcentaje_iva: '',
  retencion_ganancias: '',
  numero_plan_cuenta: '',
  numero_cuenta_bancaria: '',
  cbu: '',
  banco: '',
  descripcion_banco: '',
};

function mensajeError(err: any, fallback: string): string {
  const mensaje = err?.response?.data?.error;
  if (mensaje && typeof mensaje === 'string' && mensaje.includes('UNIQUE constraint failed: clientes.cuit')) {
    return 'Ya existe un cliente cargado con ese CUIT.';
  }
  return mensajeErrorBase(err, fallback);
}

const formatDeuda = formatMoney;

function ClientesView({ token, usuario }: ClientesViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('clientes_crear');
  const puedeEditar = permisos.has('clientes_editar');
  const puedeEliminar = permisos.has('clientes_eliminar');

  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [reportePorId, setReportePorId] = useState<Record<string, ReporteCliente>>({});
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(CLIENTE_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const [contactosExistentes, setContactosExistentes] = useState<Contacto[]>([]);
  const [lineasContactosNuevos, setLineasContactosNuevos] = useState<LineaContacto[]>([]);
  const [cargandoContactos, setCargandoContactos] = useState(false);
  const [errorContacto, setErrorContacto] = useState('');
  const [quitandoContactoId, setQuitandoContactoId] = useState<string | null>(null);

  const cargarClientes = () => {
    setError('');
    setClientes(null);
    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => setClientes(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los clientes.'));
        setClientes([]);
      });

    axios
      .get('/api/reportes/clientes', authHeaders(token))
      .then((res) => {
        const mapa: Record<string, ReporteCliente> = {};
        (res.data?.datos || []).forEach((d: ReporteCliente) => {
          mapa[d.id] = d;
        });
        setReportePorId(mapa);
      })
      .catch(() => {
        // Los datos de deuda/facturas son un complemento: si el reporte falla, la lista de clientes sigue funcionando igual.
      });
  };

  useEffect(() => {
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientesFiltrados = useMemo(() => {
    if (!clientes) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.razon_social, c.nombre_fantasia, c.cuit, c.ciudad, c.email].some((campo) =>
        (campo || '').toLowerCase().includes(q)
      )
    );
  }, [clientes, busqueda]);

  const handleChange = (campo: keyof typeof CLIENTE_VACIO, valor: string) => {
    setNuevoCliente((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleNuevo = () => {
    setNuevoCliente(CLIENTE_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setDetalleId(null);
    setContactosExistentes([]);
    setLineasContactosNuevos([]);
    setErrorContacto('');
    setMostrarForm(true);
  };

  const handleEditar = (cliente: Cliente) => {
    setNuevoCliente({
      razon_social: cliente.razon_social,
      nombre_fantasia: cliente.nombre_fantasia || '',
      cuit: cliente.cuit || '',
      dni: cliente.dni || '',
      email: cliente.email || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      ciudad: cliente.ciudad || '',
      codigo_postal: cliente.codigo_postal || '',
      provincia: cliente.provincia || '',
      pais: cliente.pais || '',
      direccion_fiscal: cliente.direccion_fiscal || '',
      ciudad_fiscal: cliente.ciudad_fiscal || '',
      codigo_postal_fiscal: cliente.codigo_postal_fiscal || '',
      provincia_fiscal: cliente.provincia_fiscal || '',
      pais_fiscal: cliente.pais_fiscal || '',
      condicion_iva: cliente.condicion_iva,
      condicion_pago: cliente.condicion_pago || '',
      limite_credito: cliente.limite_credito != null ? String(cliente.limite_credito) : '',
      porcentaje_iva: cliente.porcentaje_iva != null ? String(cliente.porcentaje_iva) : '',
      retencion_ganancias: cliente.retencion_ganancias != null ? String(cliente.retencion_ganancias) : '',
      numero_plan_cuenta: cliente.numero_plan_cuenta || '',
      numero_cuenta_bancaria: cliente.numero_cuenta_bancaria || '',
      cbu: cliente.cbu || '',
      banco: cliente.banco || '',
      descripcion_banco: cliente.descripcion_banco || '',
    });
    setEditandoId(cliente.id);
    setErrorForm('');
    setDetalleId(null);
    setLineasContactosNuevos([]);
    setErrorContacto('');
    setMostrarForm(true);
    cargarContactos(cliente.id);
  };

  const cargarContactos = (clienteId: string) => {
    setCargandoContactos(true);
    axios
      .get(`/api/clientes/${clienteId}`, authHeaders(token))
      .then((res) => setContactosExistentes(res.data?.contactos || []))
      .catch(() => setContactosExistentes([]))
      .finally(() => setCargandoContactos(false));
  };

  const handleCancelar = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setErrorForm('');
  };

  const handleConfirmarEliminar = async (cliente: Cliente) => {
    setEliminandoId(cliente.id);
    try {
      await axios.delete(`/api/clientes/${cliente.id}`, authHeaders(token));
      if (detalleId === cliente.id) setDetalleId(null);
      setConfirmandoId(null);
      cargarClientes();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo dar de baja al cliente.'));
    } finally {
      setEliminandoId(null);
    }
  };

  const handleAgregarLineaContacto = () => {
    setLineasContactosNuevos((prev) => [...prev, { ...LINEA_CONTACTO_VACIA }]);
  };
  const handleQuitarLineaContacto = (i: number) => {
    setLineasContactosNuevos((prev) => prev.filter((_, idx) => idx !== i));
  };
  const handleChangeLineaContacto = (i: number, campo: keyof LineaContacto, valor: string) => {
    setLineasContactosNuevos((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], [campo]: valor };
      return copia;
    });
  };

  const handleQuitarContactoExistente = async (contactoId: string) => {
    setQuitandoContactoId(contactoId);
    setErrorContacto('');
    try {
      await axios.delete(`/api/clientes/contactos/${contactoId}`, authHeaders(token));
      setContactosExistentes((prev) => prev.filter((c) => c.id !== contactoId));
    } catch (err: any) {
      setErrorContacto(mensajeError(err, 'No se pudo quitar el contacto.'));
    } finally {
      setQuitandoContactoId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevoCliente.razon_social.trim()) {
      setErrorForm('La razón social es obligatoria.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    const datos = {
      ...nuevoCliente,
      limite_credito: nuevoCliente.limite_credito ? Number(nuevoCliente.limite_credito) : null,
      porcentaje_iva: nuevoCliente.porcentaje_iva ? Number(nuevoCliente.porcentaje_iva) : null,
      retencion_ganancias: nuevoCliente.retencion_ganancias ? Number(nuevoCliente.retencion_ganancias) : null,
    };

    const contactosNuevosValidos = lineasContactosNuevos.filter(
      (c) => c.nombre.trim() || c.apellido.trim() || c.email.trim()
    );

    try {
      if (editandoId) {
        await axios.put(`/api/clientes/${editandoId}`, datos, authHeaders(token));
        for (const c of contactosNuevosValidos) {
          await axios.post(`/api/clientes/${editandoId}/contactos`, c, authHeaders(token));
        }
      } else {
        await axios.post('/api/clientes', { ...datos, contactos: contactosNuevosValidos }, authHeaders(token));
      }
      setNuevoCliente(CLIENTE_VACIO);
      setEditandoId(null);
      setLineasContactosNuevos([]);
      setMostrarForm(false);
      cargarClientes();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar el cliente.'));
    } finally {
      setGuardando(false);
    }
  };

  const clienteDetalle = detalleId ? clientes?.find((c) => c.id === detalleId) : null;

  useEffect(() => {
    if (clienteDetalle) cargarContactos(clienteDetalle.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalleId]);

  if (clienteDetalle) {
    const reporte = reportePorId[clienteDetalle.id];
    return (
      <section className="view-card">
        <div className="view-header">
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
        </div>

        <h2 className="detalle-titulo">
          {clienteDetalle.razon_social}{' '}
          {clienteDetalle.es_agencia && <span className="estado-badge estado-activa">Agencia</span>}
        </h2>

        <dl className="detalle-grid">
          <dt>Nombre de fantasía</dt>
          <dd>{clienteDetalle.nombre_fantasia || '-'}</dd>

          <dt>CUIT</dt>
          <dd>{clienteDetalle.cuit || '-'}</dd>

          <dt>DNI</dt>
          <dd>{clienteDetalle.dni || '-'}</dd>

          <dt>Email</dt>
          <dd>{clienteDetalle.email || '-'}</dd>

          <dt>Teléfono</dt>
          <dd>{clienteDetalle.telefono || '-'}</dd>

          <dt>Dirección</dt>
          <dd>
            {clienteDetalle.direccion || '-'}
            {clienteDetalle.ciudad ? `, ${clienteDetalle.ciudad}` : ''}
            {clienteDetalle.codigo_postal ? ` (${clienteDetalle.codigo_postal})` : ''}
          </dd>

          <dt>Provincia / País</dt>
          <dd>
            {clienteDetalle.provincia || '-'}
            {clienteDetalle.pais ? `, ${clienteDetalle.pais}` : ''}
          </dd>

          <dt>Dirección fiscal</dt>
          <dd>
            {clienteDetalle.direccion_fiscal || '-'}
            {clienteDetalle.ciudad_fiscal ? `, ${clienteDetalle.ciudad_fiscal}` : ''}
          </dd>

          <dt>Condición ante IVA</dt>
          <dd>{clienteDetalle.condicion_iva}</dd>

          <dt>Condición de pago</dt>
          <dd>{clienteDetalle.condicion_pago || '-'}</dd>

          <dt>Límite de crédito</dt>
          <dd>{formatMoney(clienteDetalle.limite_credito)}</dd>

          <dt>% IVA</dt>
          <dd>{clienteDetalle.porcentaje_iva != null ? `${clienteDetalle.porcentaje_iva}%` : '-'}</dd>

          <dt>Retención de ganancias</dt>
          <dd>{clienteDetalle.retencion_ganancias != null ? clienteDetalle.retencion_ganancias : '-'}</dd>

          <dt>Cuenta bancaria</dt>
          <dd>
            {clienteDetalle.banco || '-'}
            {clienteDetalle.numero_cuenta_bancaria ? ` - ${clienteDetalle.numero_cuenta_bancaria}` : ''}
            {clienteDetalle.cbu ? ` (CBU: ${clienteDetalle.cbu})` : ''}
          </dd>

          <dt>Deuda</dt>
          <dd>{formatDeuda(reporte?.deuda)}</dd>

          <dt>Cantidad de facturas</dt>
          <dd>{reporte?.cantidad_facturas ?? 0}</dd>

          <dt>Última transacción</dt>
          <dd>{formatFecha(reporte?.ultima_transaccion)}</dd>
        </dl>

        <h3 className="reportes-subtitulo">Contactos</h3>
        {cargandoContactos && <p className="empty-state">Cargando contactos...</p>}
        {errorContacto && <div className="error-message">{errorContacto}</div>}
        {!cargandoContactos && contactosExistentes.length === 0 && (
          <p className="empty-state">Sin contactos cargados.</p>
        )}
        {contactosExistentes.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Email</th>
                <th>Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {contactosExistentes.map((c) => (
                <tr key={c.id}>
                  <td>{[c.nombre, c.apellido].filter(Boolean).join(' ') || '-'}</td>
                  <td>{c.rol || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.telefono || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {confirmandoId === clienteDetalle.id ? (
          <div className="confirmar-baja">
            <span>¿Dar de baja a "{clienteDetalle.razon_social}"? No va a aparecer más en la lista.</span>
            <div className="cliente-form-actions">
              <button
                className="btn-danger"
                onClick={() => handleConfirmarEliminar(clienteDetalle)}
                disabled={eliminandoId === clienteDetalle.id}
              >
                {eliminandoId === clienteDetalle.id ? 'Dando de baja...' : 'Sí, dar de baja'}
              </button>
              <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="cliente-form-actions">
            {puedeEditar && (
              <button className="btn-primary" onClick={() => handleEditar(clienteDetalle)}>
                Editar
              </button>
            )}
            {puedeEliminar && (
              <button className="btn-danger" onClick={() => setConfirmandoId(clienteDetalle.id)}>
                Dar de baja
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Clientes</h2>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
          </button>
        )}
      </div>

      {mostrarForm && (puedeCrear || editandoId) && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="razon_social">Razón social *</label>
            <input
              id="razon_social"
              value={nuevoCliente.razon_social}
              onChange={(e) => handleChange('razon_social', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="nombre_fantasia">Nombre de fantasía</label>
            <input
              id="nombre_fantasia"
              value={nuevoCliente.nombre_fantasia}
              onChange={(e) => handleChange('nombre_fantasia', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="cuit">CUIT</label>
            <input
              id="cuit"
              value={nuevoCliente.cuit}
              onChange={(e) => handleChange('cuit', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="dni">DNI</label>
            <input id="dni" value={nuevoCliente.dni} onChange={(e) => handleChange('dni', e.target.value)} disabled={guardando} />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={nuevoCliente.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="telefono">Teléfono</label>
            <input
              id="telefono"
              value={nuevoCliente.telefono}
              onChange={(e) => handleChange('telefono', e.target.value)}
              disabled={guardando}
            />
          </div>

          <h3 className="reportes-subtitulo" style={{ gridColumn: '1 / -1' }}>
            Ubicación
          </h3>

          <div className="form-group">
            <label htmlFor="direccion">Dirección</label>
            <input
              id="direccion"
              value={nuevoCliente.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ciudad">Ciudad</label>
            <input
              id="ciudad"
              value={nuevoCliente.ciudad}
              onChange={(e) => handleChange('ciudad', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="codigo_postal">Código postal</label>
            <input
              id="codigo_postal"
              value={nuevoCliente.codigo_postal}
              onChange={(e) => handleChange('codigo_postal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="provincia">Provincia</label>
            <input
              id="provincia"
              value={nuevoCliente.provincia}
              onChange={(e) => handleChange('provincia', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pais">País</label>
            <input id="pais" value={nuevoCliente.pais} onChange={(e) => handleChange('pais', e.target.value)} disabled={guardando} />
          </div>

          <h3 className="reportes-subtitulo" style={{ gridColumn: '1 / -1' }}>
            Domicilio fiscal (si es distinto)
          </h3>

          <div className="form-group">
            <label htmlFor="direccion_fiscal">Dirección fiscal</label>
            <input
              id="direccion_fiscal"
              value={nuevoCliente.direccion_fiscal}
              onChange={(e) => handleChange('direccion_fiscal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ciudad_fiscal">Ciudad fiscal</label>
            <input
              id="ciudad_fiscal"
              value={nuevoCliente.ciudad_fiscal}
              onChange={(e) => handleChange('ciudad_fiscal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="codigo_postal_fiscal">Código postal fiscal</label>
            <input
              id="codigo_postal_fiscal"
              value={nuevoCliente.codigo_postal_fiscal}
              onChange={(e) => handleChange('codigo_postal_fiscal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="provincia_fiscal">Provincia fiscal</label>
            <input
              id="provincia_fiscal"
              value={nuevoCliente.provincia_fiscal}
              onChange={(e) => handleChange('provincia_fiscal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pais_fiscal">País fiscal</label>
            <input
              id="pais_fiscal"
              value={nuevoCliente.pais_fiscal}
              onChange={(e) => handleChange('pais_fiscal', e.target.value)}
              disabled={guardando}
            />
          </div>

          <h3 className="reportes-subtitulo" style={{ gridColumn: '1 / -1' }}>
            Datos comerciales
          </h3>

          <div className="form-group">
            <label htmlFor="condicion_iva">Condición ante IVA</label>
            <select
              id="condicion_iva"
              value={nuevoCliente.condicion_iva}
              onChange={(e) => handleChange('condicion_iva', e.target.value)}
              disabled={guardando}
            >
              <option>Responsable Inscripto</option>
              <option>Monotributo</option>
              <option>Exento</option>
              <option>Consumidor Final</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="condicion_pago">Condición de pago</label>
            <input
              id="condicion_pago"
              value={nuevoCliente.condicion_pago}
              onChange={(e) => handleChange('condicion_pago', e.target.value)}
              placeholder="Ej: Contado, 30 días"
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="limite_credito">Límite de crédito</label>
            <input
              id="limite_credito"
              type="number"
              min="0"
              step="0.01"
              value={nuevoCliente.limite_credito}
              onChange={(e) => handleChange('limite_credito', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="porcentaje_iva">% IVA</label>
            <input
              id="porcentaje_iva"
              type="number"
              min="0"
              step="0.01"
              value={nuevoCliente.porcentaje_iva}
              onChange={(e) => handleChange('porcentaje_iva', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="retencion_ganancias">Retención de ganancias</label>
            <input
              id="retencion_ganancias"
              type="number"
              min="0"
              step="0.01"
              value={nuevoCliente.retencion_ganancias}
              onChange={(e) => handleChange('retencion_ganancias', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="numero_plan_cuenta">Número en plan de cuenta</label>
            <input
              id="numero_plan_cuenta"
              value={nuevoCliente.numero_plan_cuenta}
              onChange={(e) => handleChange('numero_plan_cuenta', e.target.value)}
              disabled={guardando}
            />
          </div>

          <h3 className="reportes-subtitulo" style={{ gridColumn: '1 / -1' }}>
            Datos bancarios
          </h3>

          <div className="form-group">
            <label htmlFor="banco">Banco</label>
            <input id="banco" value={nuevoCliente.banco} onChange={(e) => handleChange('banco', e.target.value)} disabled={guardando} />
          </div>

          <div className="form-group">
            <label htmlFor="descripcion_banco">Descripción del banco</label>
            <input
              id="descripcion_banco"
              value={nuevoCliente.descripcion_banco}
              onChange={(e) => handleChange('descripcion_banco', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="numero_cuenta_bancaria">Número de cuenta</label>
            <input
              id="numero_cuenta_bancaria"
              value={nuevoCliente.numero_cuenta_bancaria}
              onChange={(e) => handleChange('numero_cuenta_bancaria', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="cbu">CBU</label>
            <input id="cbu" value={nuevoCliente.cbu} onChange={(e) => handleChange('cbu', e.target.value)} disabled={guardando} />
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Contactos</label>

            {editandoId && contactosExistentes.length > 0 && (
              <table className="data-table" style={{ marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contactosExistentes.map((c) => (
                    <tr key={c.id}>
                      <td>{[c.nombre, c.apellido].filter(Boolean).join(' ') || '-'}</td>
                      <td>{c.rol || '-'}</td>
                      <td>{c.email || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          onClick={() => handleQuitarContactoExistente(c.id)}
                          disabled={quitandoContactoId === c.id}
                        >
                          {quitandoContactoId === c.id ? 'Quitando...' : 'Quitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {errorContacto && <div className="error-message">{errorContacto}</div>}

            {lineasContactosNuevos.map((linea, i) => (
              <div className="linea-factura" key={i} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={linea.nombre}
                  onChange={(e) => handleChangeLineaContacto(i, 'nombre', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  value={linea.apellido}
                  onChange={(e) => handleChangeLineaContacto(i, 'apellido', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={linea.email}
                  onChange={(e) => handleChangeLineaContacto(i, 'email', e.target.value)}
                  disabled={guardando}
                />
                <input
                  type="text"
                  placeholder="Rol"
                  value={linea.rol}
                  onChange={(e) => handleChangeLineaContacto(i, 'rol', e.target.value)}
                  disabled={guardando}
                />
                <button
                  type="button"
                  className="btn-link btn-link-danger"
                  onClick={() => handleQuitarLineaContacto(i)}
                  disabled={guardando}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className="btn-link" onClick={handleAgregarLineaContacto} disabled={guardando}>
              + Agregar contacto
            </button>
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      )}

      {clientes && clientes.length > 0 && (
        <input
          type="text"
          className="buscador"
          placeholder="Buscar por razón social, CUIT, ciudad o email..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      {clientes === null && !error && <p className="empty-state">Cargando clientes...</p>}

      {error && clientes && clientes.length === 0 && <div className="error-message">{error}</div>}

      {clientes && clientes.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay clientes cargados.
          {puedeCrear ? ' Usá "+ Nuevo cliente" para agregar el primero.' : ''}
        </p>
      )}

      {clientes && clientes.length > 0 && clientesFiltrados.length === 0 && (
        <p className="empty-state">No hay clientes que coincidan con la búsqueda.</p>
      )}

      {clientesFiltrados.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razón social</th>
              <th>CUIT</th>
              <th>Ciudad</th>
              <th>Condición IVA</th>
              <th>Deuda</th>
              <th>Facturas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.map((c) => {
              const reporte = reportePorId[c.id];
              return (
                <tr key={c.id}>
                  <td>
                    <button className="btn-link" onClick={() => setDetalleId(c.id)}>
                      {c.razon_social}
                    </button>
                    {c.es_agencia && <span className="estado-badge estado-activa" style={{ marginLeft: '0.4rem' }}>Agencia</span>}
                  </td>
                  <td>{c.cuit || '-'}</td>
                  <td>{c.ciudad || '-'}</td>
                  <td>{c.condicion_iva}</td>
                  <td>{formatDeuda(reporte?.deuda)}</td>
                  <td>{reporte?.cantidad_facturas ?? 0}</td>
                  <td className="acciones">
                    {confirmandoId === c.id ? (
                      <span className="confirmar-baja-inline">
                        ¿Confirmar?{' '}
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => handleConfirmarEliminar(c)}
                          disabled={eliminandoId === c.id}
                        >
                          {eliminandoId === c.id ? 'Dando de baja...' : 'Sí'}
                        </button>{' '}
                        <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <>
                        {puedeEditar && (
                          <button className="btn-link" onClick={() => handleEditar(c)}>
                            Editar
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            className="btn-link btn-link-danger"
                            onClick={() => setConfirmandoId(c.id)}
                          >
                            Dar de baja
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default ClientesView;
