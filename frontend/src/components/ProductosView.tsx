import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, scrollAlFormulario } from '../utils/api';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precio_venta: number;
  costo: number | null;
  stock: number;
  tipo: 'fisico' | 'servicio';
}

interface ProductosViewProps {
  token: string;
  usuario: any;
}

const PRODUCTO_VACIO = {
  codigo: '',
  nombre: '',
  descripcion: '',
  precio_venta: '',
  costo: '',
  stock: '0',
  tipo: 'fisico' as 'fisico' | 'servicio',
};

function ProductosView({ token, usuario }: ProductosViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('productos_crear');
  const puedeEditar = permisos.has('productos_editar');
  const puedeEliminar = permisos.has('productos_eliminar');

  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'fisico' | 'servicio'>('todos');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState(PRODUCTO_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState('');

  const cargarProductos = () => {
    setError('');
    setProductos(null);
    axios
      .get('/api/productos', authHeaders(token))
      .then((res) => setProductos(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar los productos.'));
        setProductos([]);
      });
  };

  useEffect(() => {
    cargarProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (campo: keyof typeof PRODUCTO_VACIO, valor: string) => {
    setNuevoProducto((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleNuevo = () => {
    setNuevoProducto(PRODUCTO_VACIO);
    setEditandoId(null);
    setErrorForm('');
    setDetalleId(null);
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleEditar = (producto: Producto) => {
    setNuevoProducto({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      precio_venta: String(producto.precio_venta),
      costo: producto.costo !== null ? String(producto.costo) : '',
      stock: String(producto.stock),
      tipo: producto.tipo === 'servicio' ? 'servicio' : 'fisico',
    });
    setEditandoId(producto.id);
    setErrorForm('');
    setDetalleId(null);
    setMostrarForm(true);
    scrollAlFormulario();
  };

  const handleCancelar = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setErrorForm('');
  };

  const handleConfirmarEliminar = async (producto: Producto) => {
    setEliminandoId(producto.id);
    setErrorEliminar('');
    try {
      await axios.delete(`/api/productos/${producto.id}`, authHeaders(token));
      if (detalleId === producto.id) setDetalleId(null);
      setConfirmandoId(null);
      cargarProductos();
    } catch (err: any) {
      setErrorEliminar(mensajeError(err, 'No se pudo dar de baja al producto.'));
    } finally {
      setEliminandoId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevoProducto.codigo.trim() || !nuevoProducto.nombre.trim()) {
      setErrorForm('Código y nombre son obligatorios.');
      return;
    }
    const precioVenta = Number(nuevoProducto.precio_venta);
    if (nuevoProducto.precio_venta === '' || isNaN(precioVenta) || precioVenta < 0) {
      setErrorForm('El precio de venta tiene que ser un número válido (podés dejarlo en 0 para productos sin precio unitario, como los soportes/servicios de Topview).');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    const datos = {
      codigo: nuevoProducto.codigo,
      nombre: nuevoProducto.nombre,
      descripcion: nuevoProducto.descripcion,
      precio_venta: Number(nuevoProducto.precio_venta),
      costo: nuevoProducto.costo ? Number(nuevoProducto.costo) : null,
      stock: Number(nuevoProducto.stock) || 0,
      tipo: nuevoProducto.tipo,
    };

    try {
      if (editandoId) {
        await axios.put(`/api/productos/${editandoId}`, datos, authHeaders(token));
      } else {
        await axios.post('/api/productos', datos, authHeaders(token));
      }
      setMostrarForm(false);
      setEditandoId(null);
      cargarProductos();
    } catch (err: any) {
      const mensaje = err?.response?.data?.error;
      if (mensaje && mensaje.includes('UNIQUE constraint failed: productos.codigo')) {
        setErrorForm('Ya existe un producto cargado con ese código.');
      } else {
        setErrorForm(mensajeError(err, 'No se pudo guardar el producto.'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const productoDetalle = detalleId ? productos?.find((p) => p.id === detalleId) : null;

  const productosFiltrados = (productos || []).filter(
    (p) => filtroTipo === 'todos' || p.tipo === filtroTipo
  );

  if (productoDetalle) {
    return (
      <section className="view-card">
        <div className="view-header">
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
        </div>

        <h2 className="detalle-titulo">{productoDetalle.nombre}</h2>

        <dl className="detalle-grid">
          <dt>Código</dt>
          <dd>{productoDetalle.codigo}</dd>

          <dt>Tipo</dt>
          <dd>{productoDetalle.tipo === 'servicio' ? 'Servicio' : 'Físico'}</dd>

          <dt>Descripción</dt>
          <dd>{productoDetalle.descripcion || '-'}</dd>

          <dt>Precio de venta</dt>
          <dd>{formatMoney(productoDetalle.precio_venta)}</dd>

          <dt>Costo</dt>
          <dd>{formatMoney(productoDetalle.costo)}</dd>

          <dt>Stock</dt>
          <dd>{productoDetalle.stock}</dd>
        </dl>

        {errorEliminar && <div className="error-message">{errorEliminar}</div>}

        {confirmandoId === productoDetalle.id ? (
          <div className="confirmar-baja">
            <span>¿Dar de baja a "{productoDetalle.nombre}"? No va a aparecer más en la lista.</span>
            <div className="cliente-form-actions">
              <button
                className="btn-danger"
                onClick={() => handleConfirmarEliminar(productoDetalle)}
                disabled={eliminandoId === productoDetalle.id}
              >
                {eliminandoId === productoDetalle.id ? 'Dando de baja...' : 'Sí, dar de baja'}
              </button>
              <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="cliente-form-actions">
            {puedeEditar && (
              <button className="btn-primary" onClick={() => handleEditar(productoDetalle)}>
                Editar
              </button>
            )}
            {puedeEliminar && (
              <button className="btn-danger" onClick={() => setConfirmandoId(productoDetalle.id)}>
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
        <h2>Productos</h2>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNuevo}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo producto'}
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
            <label htmlFor="prod_codigo">Código *</label>
            <input
              id="prod_codigo"
              value={nuevoProducto.codigo}
              onChange={(e) => handleChange('codigo', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prod_nombre">Nombre *</label>
            <input
              id="prod_nombre"
              value={nuevoProducto.nombre}
              onChange={(e) => handleChange('nombre', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prod_tipo">Tipo *</label>
            <select
              id="prod_tipo"
              value={nuevoProducto.tipo}
              onChange={(e) => handleChange('tipo', e.target.value)}
              disabled={guardando}
            >
              <option value="fisico">Físico (soporte/inventario)</option>
              <option value="servicio">Servicio (leyenda genérica de facturación)</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="prod_descripcion">Descripción</label>
            <input
              id="prod_descripcion"
              value={nuevoProducto.descripcion}
              onChange={(e) => handleChange('descripcion', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prod_precio">Precio de venta *</label>
            <input
              id="prod_precio"
              type="number"
              min="0"
              step="0.01"
              value={nuevoProducto.precio_venta}
              onChange={(e) => handleChange('precio_venta', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prod_costo">Costo</label>
            <input
              id="prod_costo"
              type="number"
              min="0"
              step="0.01"
              value={nuevoProducto.costo}
              onChange={(e) => handleChange('costo', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prod_stock">Stock inicial</label>
            <input
              id="prod_stock"
              type="number"
              min="0"
              step="1"
              value={nuevoProducto.stock}
              onChange={(e) => handleChange('stock', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="cliente-form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar producto'}
            </button>
          </div>
        </form>
      )}

      {productos === null && !error && <p className="empty-state">Cargando productos...</p>}

      {error && productos && productos.length === 0 && <div className="error-message">{error}</div>}

      {productos && productos.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay productos cargados.
          {puedeCrear ? ' Usá "+ Nuevo producto" para agregar el primero.' : ''}
        </p>
      )}

      {productos && productos.length > 0 && (
        <div className="reportes-tabs" style={{ marginBottom: '1rem' }}>
          <button
            className={`reportes-tab ${filtroTipo === 'todos' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('todos')}
          >
            Todos ({productos.length})
          </button>
          <button
            className={`reportes-tab ${filtroTipo === 'fisico' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('fisico')}
          >
            Físicos ({productos.filter((p) => p.tipo !== 'servicio').length})
          </button>
          <button
            className={`reportes-tab ${filtroTipo === 'servicio' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('servicio')}
          >
            Servicios ({productos.filter((p) => p.tipo === 'servicio').length})
          </button>
        </div>
      )}

      {productos && productos.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Precio de venta</th>
              <th>Stock</th>
              {(puedeEditar || puedeEliminar) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => (
              <tr key={p.id}>
                <td>{p.codigo}</td>
                <td>
                  <button className="btn-link" onClick={() => setDetalleId(p.id)}>
                    {p.nombre}
                  </button>
                </td>
                <td>
                  <span className={`estado-badge ${p.tipo === 'servicio' ? 'estado-activa' : ''}`}>
                    {p.tipo === 'servicio' ? 'Servicio' : 'Físico'}
                  </span>
                </td>
                <td>{formatMoney(p.precio_venta)}</td>
                <td>{p.stock}</td>
                {(puedeEditar || puedeEliminar) && (
                  <td className="acciones">
                    {confirmandoId === p.id ? (
                      <span className="confirmar-baja-inline">
                        ¿Confirmar?{' '}
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() => handleConfirmarEliminar(p)}
                          disabled={eliminandoId === p.id}
                        >
                          {eliminandoId === p.id ? 'Dando de baja...' : 'Sí'}
                        </button>{' '}
                        <button className="btn-link" onClick={() => setConfirmandoId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <>
                        {puedeEditar && (
                          <button className="btn-link" onClick={() => handleEditar(p)}>
                            Editar
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            className="btn-link btn-link-danger"
                            onClick={() => setConfirmandoId(p.id)}
                          >
                            Dar de baja
                          </button>
                        )}
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default ProductosView;
