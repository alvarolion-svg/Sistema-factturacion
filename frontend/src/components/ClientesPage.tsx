import { useState, useEffect } from 'react';
import axios from 'axios';

interface Cliente {
  id: string;
  razon_social: string;
  cuit?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  condicion_iva?: string;
  habilitado: boolean;
  created_at: string;
}

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    razon_social: '',
    cuit: '',
    email: '',
    telefono: '',
    direccion: '',
    ciudad: '',
    condicion_iva: 'Responsable Inscripto'
  });

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/clientes');
      setClientes(response.data);
    } catch (err) {
      console.error('Error al cargar clientes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`/api/clientes/${editingId}`, formData);
      } else {
        await axios.post('/api/clientes', formData);
      }
      cargarClientes();
      setShowForm(false);
      setEditingId(null);
      setFormData({
        razon_social: '',
        cuit: '',
        email: '',
        telefono: '',
        direccion: '',
        ciudad: '',
        condicion_iva: 'Responsable Inscripto'
      });
    } catch (err) {
      console.error('Error al guardar cliente:', err);
    }
  };

  const handleEditar = (cliente: Cliente) => {
    setFormData({
      razon_social: cliente.razon_social,
      cuit: cliente.cuit || '',
      email: cliente.email || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      ciudad: cliente.ciudad || '',
      condicion_iva: cliente.condicion_iva || 'Responsable Inscripto'
    });
    setEditingId(cliente.id);
    setShowForm(true);
  };

  const handleEliminar = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este cliente?')) {
      try {
        await axios.delete(`/api/clientes/${id}`);
        cargarClientes();
      } catch (err) {
        console.error('Error al eliminar cliente:', err);
      }
    }
  };

  return (
    <div className="clientes-page">
      <div className="page-header">
        <h2>Gestión de Clientes</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm) {
              setEditingId(null);
              setFormData({
                razon_social: '',
                cuit: '',
                email: '',
                telefono: '',
                direccion: '',
                ciudad: '',
                condicion_iva: 'Responsable Inscripto'
              });
            }
          }}
        >
          {showForm ? 'Cancelar' : 'Nuevo Cliente'}
        </button>
      </div>

      {showForm && (
        <div className="form-section">
          <h3>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Razón Social *</label>
                <input
                  type="text"
                  name="razon_social"
                  value={formData.razon_social}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>CUIT</label>
                <input
                  type="text"
                  name="cuit"
                  value={formData.cuit}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Dirección</label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Ciudad</label>
                <input
                  type="text"
                  name="ciudad"
                  value={formData.ciudad}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Condición IVA</label>
                <select
                  name="condicion_iva"
                  value={formData.condicion_iva}
                  onChange={handleInputChange}
                >
                  <option>Responsable Inscripto</option>
                  <option>Monotributista</option>
                  <option>Exento</option>
                  <option>Consumidor Final</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                {editingId ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p>Cargando clientes...</p>
      ) : (
        <div className="table-section">
          <table className="clientes-table">
            <thead>
              <tr>
                <th>Razón Social</th>
                <th>CUIT</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Ciudad</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(cliente => (
                <tr key={cliente.id}>
                  <td>{cliente.razon_social}</td>
                  <td>{cliente.cuit || '-'}</td>
                  <td>{cliente.email || '-'}</td>
                  <td>{cliente.telefono || '-'}</td>
                  <td>{cliente.ciudad || '-'}</td>
                  <td className="acciones">
                    <button
                      className="btn-icon"
                      onClick={() => handleEditar(cliente)}
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => handleEliminar(cliente.id)}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
