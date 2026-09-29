import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, scrollAlFormulario } from '../utils/api';
import type { Agencia } from '../types/topview';

const AGENCIA_VACIA = { nombre: '', descripcion: '', contacto: '', email: '', telefono: '', proveedor_id: '', cliente_id: '' };

function AgenciasTab({ token, puedeCrear }: { token: string; puedeCrear: boolean }) {
  const [agencias, setAgencias] = useState<Agencia[] | null>(null);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; razon_social: string }[]>([]);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(AGENCIA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [vinculandoCliente, setVinculandoCliente] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');

  const cargar = () => {
    setError('');
    setAgencias(null);
    axios
      .get('/api/topview/agencias', authHeaders(token))
      .then((res) => setAgencias(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las agencias.'));
        setAgencias([]);
      });
    axios
      .get('/api/proveedores', authHeaders(token))
      .then((res) => setProveedores(res.data || []))
      .catch(() => setProveedores([]));
    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => setClientes(res.data || []))
      .catch(() => setClientes([]));
  };

  // El buscador es un input con datalist: se escribe el nombre, y cuando el
  // texto matchea exacto a un cliente de la lista se resuelve el id acá.
  const handleBuscarCliente = async (texto: string) => {
    setBusquedaCliente(texto);
    const cliente = clientes.find((c) => c.razon_social === texto);
    if (!cliente) return;

    setVinculandoCliente(true);
    setErrorForm('');
    try {
      const res = await axios.post('/api/proveedores/desde-cliente', { cliente_id: cliente.id }, authHeaders(token));
      const proveedor = res.data;
      setProveedores((prev) => (prev.some((p) => p.id === proveedor.id) ? prev : [...prev, proveedor]));
      setForm((prev) => ({ ...prev, cliente_id: cliente.id, proveedor_id: proveedor.id }));
      setBusquedaCliente('');
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo vincular el cliente.'));
    } finally {
      setVinculandoCliente(false);
    }
  };

  const handleQuitarVinculoCliente = () => {
    setForm((prev) => ({ ...prev, cliente_id: '' }));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNueva = () => {
    setForm(AGENCIA_VACIA);
    setEditandoId(null);
    setErrorForm('');
    setBusquedaCliente('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (a: any) => {
    setForm({
      nombre: a.nombre,
      descripcion: a.descripcion || '',
      contacto: a.contacto || '',
      email: a.email || '',
      telefono: a.telefono || '',
      proveedor_id: a.proveedor_id || '',
      cliente_id: a.cliente_id || '',
    });
    setEditandoId(a.id);
    setErrorForm('');
    setBusquedaCliente('');
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      if (editandoId) {
        await axios.put(`/api/topview/agencias/${editandoId}`, form, authHeaders(token));
      } else {
        await axios.post('/api/topview/agencias', form, authHeaders(token));
      }
      setForm(AGENCIA_VACIA);
      setEditandoId(null);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo guardar la agencia.'));
    } finally {
      setGuardando(false);
    }
  };

  const nombreProveedor = (id: string | null) => proveedores.find((p) => p.id === id)?.razon_social;
  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.razon_social;

  return (
    <>
      <div className="view-header">
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? () => setMostrarForm(false) : handleNueva}>
            {mostrarForm ? 'Cancelar' : '+ Nueva agencia'}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form className="cliente-form" onSubmit={handleSubmit}>
          {errorForm && (
            <div className="error-message" style={{ gridColumn: '1 / -1' }}>
              {errorForm}
            </div>
          )}
          <div className="form-group">
            <label>Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Contacto</label>
            <input
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              disabled={guardando}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="agencia_buscar_cliente">¿Esta agencia ya es cliente? Buscala y vinculá las dos fichas</label>
            <input
              id="agencia_buscar_cliente"
              list="agencia-clientes-datalist"
              value={busquedaCliente}
              onChange={(e) => handleBuscarCliente(e.target.value)}
              placeholder="Escribí para buscar por razón social..."
              disabled={guardando || vinculandoCliente}
            />
            <datalist id="agencia-clientes-datalist">
              {clientes.map((c) => (
                <option key={c.id} value={c.razon_social} />
              ))}
            </datalist>
            {form.cliente_id && (
              <p className="totales-preview">
                Vinculada a <strong>{nombreCliente(form.cliente_id)}</strong> (misma ficha de cliente) —{' '}
                <button type="button" className="btn-link" onClick={handleQuitarVinculoCliente} disabled={guardando}>
                  quitar vínculo
                </button>
              </p>
            )}
            <small className="ayuda-error" style={{ color: '#666' }}>
              Muchas agencias son también clientes (les facturamos la pauta) y cobran su comisión como proveedor —
              esto marca el tag "Agencia" en su ficha de cliente y crea (o reutiliza, por CUIT) el proveedor de abajo
              con los mismos datos.
            </small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Proveedor para facturas (opcional)</label>
            <select
              value={form.proveedor_id}
              onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
              disabled={guardando}
            >
              <option value="">Sin vincular — no genera gastos pendientes</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
            <small className="ayuda-error" style={{ color: '#666' }}>
              Si esta agencia cobra parte de su remuneración esperando su factura de servicio, vinculala a su
              proveedor para que cada orden genere el gasto pendiente automáticamente.
            </small>
          </div>
          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar agencia'}
            </button>
          </div>
        </form>
      )}

      {agencias === null && !error && <p className="empty-state">Cargando...</p>}
      {error && agencias && agencias.length === 0 && <div className="error-message">{error}</div>}
      {agencias && agencias.length === 0 && !error && <p className="empty-state">No hay agencias cargadas.</p>}
      {agencias && agencias.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Cliente</th>
              <th>Proveedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agencias.map((a: any) => (
              <tr key={a.id}>
                <td>{a.nombre}</td>
                <td>{a.contacto || '-'}</td>
                <td>{a.email || '-'}</td>
                <td>{a.telefono || '-'}</td>
                <td>{nombreCliente(a.cliente_id) || '-'}</td>
                <td>{nombreProveedor(a.proveedor_id) || '-'}</td>
                <td>
                  {puedeCrear && (
                    <button className="btn-link" onClick={() => handleEditar(a)}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default AgenciasTab;
