import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';

interface Factura {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  tipo_comprobante: string;
  estado: string;
  validada_arca: number;
  subtotal: number;
  iva: number;
  total: number;
  saldo: number;
}

interface FacturaDetalleLinea {
  id: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  descripcion?: string;
}

interface Cliente {
  id: string;
  razon_social: string;
}

interface Producto {
  id: string;
  nombre: string;
  precio_venta: number;
}

interface Cuenta {
  id: string;
  nombre: string;
  moneda: string;
}

interface FacturasViewProps {
  token: string;
  usuario: any;
}

interface LineaForm {
  producto_id: string;
  cantidad: string;
  precio_unitario: string;
}

const LINEA_VACIA: LineaForm = { producto_id: '', cantidad: '1', precio_unitario: '' };

const FACTURA_VACIA = {
  cliente_id: '',
  fecha: new Date().toISOString().split('T')[0],
  tipo_comprobante: 'Factura A',
  validar_arca: false,
};

function FacturasView({ token, usuario }: FacturasViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('facturas_crear');
  const puedeCobrar = permisos.has('cobros_registrar');
  const puedeAnular = permisos.has('notas_credito_crear');

  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [error, setError] = useState('');
  const [clientesPorId, setClientesPorId] = useState<Record<string, string>>({});

  const [mostrarForm, setMostrarForm] = useState(false);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [errorClientes, setErrorClientes] = useState('');
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [errorProductos, setErrorProductos] = useState('');
  const [nuevaFactura, setNuevaFactura] = useState(FACTURA_VACIA);
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<(Factura & { detalles: FacturaDetalleLinea[] }) | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');

  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [errorCuentas, setErrorCuentas] = useState('');
  const [montoCobro, setMontoCobro] = useState('');
  const [cuentaCobroId, setCuentaCobroId] = useState('');
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [errorCobro, setErrorCobro] = useState('');

  const [mostrarNC, setMostrarNC] = useState(false);
  const [motivoNC, setMotivoNC] = useState('');
  const [guardandoNC, setGuardandoNC] = useState(false);
  const [errorNC, setErrorNC] = useState('');

  const cargarFacturas = () => {
    setError('');
    setFacturas(null);
    axios
      .get('/api/facturas', authHeaders(token))
      .then((res) => setFacturas(res.data))
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las facturas.'));
        setFacturas([]);
      });

    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => {
        const mapa: Record<string, string> = {};
        (res.data || []).forEach((c: Cliente) => {
          mapa[c.id] = c.razon_social;
        });
        setClientesPorId(mapa);
      })
      .catch(() => {
        // Sin nombre de cliente disponible, la lista igual se muestra (con el id crudo).
      });
  };

  useEffect(() => {
    cargarFacturas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarDatosParaCrear = () => {
    setClientes(null);
    setErrorClientes('');
    axios
      .get('/api/clientes', authHeaders(token))
      .then((res) => setClientes(res.data))
      .catch((err) => {
        setErrorClientes(mensajeError(err, 'No se pudo cargar la lista de clientes.'));
        setClientes([]);
      });

    setProductos(null);
    setErrorProductos('');
    axios
      .get('/api/productos', authHeaders(token))
      .then((res) => setProductos(res.data))
      .catch((err) => {
        setErrorProductos(mensajeError(err, 'No se pudo cargar el catálogo de productos.'));
        setProductos([]);
      });
  };

  const handleNueva = () => {
    setNuevaFactura(FACTURA_VACIA);
    setLineas([{ ...LINEA_VACIA }]);
    setErrorForm('');
    setDetalleId(null);
    setMostrarForm(true);
    cargarDatosParaCrear();
  };

  const handleCancelar = () => {
    setMostrarForm(false);
    setErrorForm('');
  };

  const handleChangeFactura = (campo: keyof typeof FACTURA_VACIA, valor: string | boolean) => {
    setNuevaFactura((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleChangeLinea = (index: number, campo: keyof LineaForm, valor: string) => {
    setLineas((prev) => {
      const copia = [...prev];
      const linea = { ...copia[index], [campo]: valor };
      if (campo === 'producto_id') {
        const producto = productos?.find((p) => p.id === valor);
        if (producto) linea.precio_unitario = String(producto.precio_venta);
      }
      copia[index] = linea;
      return copia;
    });
  };

  const handleAgregarLinea = () => {
    setLineas((prev) => [...prev, { ...LINEA_VACIA }]);
  };

  const handleQuitarLinea = (index: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  };

  const lineasValidas = lineas.filter(
    (l) => l.producto_id && Number(l.cantidad) > 0 && Number(l.precio_unitario) >= 0
  );
  const subtotalPreview = lineasValidas.reduce(
    (sum, l) => sum + Number(l.cantidad) * Number(l.precio_unitario),
    0
  );
  const ivaPreview = subtotalPreview * 0.21;
  const totalPreview = subtotalPreview + ivaPreview;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nuevaFactura.cliente_id) {
      setErrorForm('Elegí un cliente.');
      return;
    }
    if (lineasValidas.length === 0) {
      setErrorForm('Agregá al menos un producto con cantidad mayor a cero.');
      return;
    }

    setGuardando(true);
    setErrorForm('');

    try {
      await axios.post(
        '/api/facturas',
        {
          cliente_id: nuevaFactura.cliente_id,
          fecha: nuevaFactura.fecha,
          tipo_comprobante: nuevaFactura.tipo_comprobante,
          validar_arca: nuevaFactura.validar_arca,
          detalles: lineasValidas.map((l) => ({
            producto_id: l.producto_id,
            cantidad: Number(l.cantidad),
            precio_unitario: Number(l.precio_unitario),
          })),
        },
        authHeaders(token)
      );
      setMostrarForm(false);
      cargarFacturas();
    } catch (err: any) {
      setErrorForm(mensajeError(err, 'No se pudo crear la factura.'));
    } finally {
      setGuardando(false);
    }
  };

  const cargarDetalle = (id: string) => {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    setMostrarCobro(false);
    setMostrarNC(false);
    axios
      .get(`/api/facturas/${id}`, authHeaders(token))
      .then((res) => setDetalle(res.data))
      .catch((err) => setErrorDetalle(mensajeError(err, 'No se pudo cargar la factura.')))
      .finally(() => setCargandoDetalle(false));
  };

  const handleAbrirCobro = () => {
    setMostrarCobro(true);
    setMontoCobro(detalle ? String(detalle.saldo) : '');
    setCuentaCobroId('');
    setErrorCobro('');
    setCuentas(null);
    setErrorCuentas('');
    axios
      .get('/api/tesoreria/estado', authHeaders(token))
      .then((res) => setCuentas(res.data?.cuentas || []))
      .catch((err) => {
        setErrorCuentas(mensajeError(err, 'No se pudo cargar la lista de cuentas.'));
        setCuentas([]);
      });
  };

  const handleRegistrarCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuentaCobroId) {
      setErrorCobro('Elegí en qué cuenta entra el dinero.');
      return;
    }
    const monto = Number(montoCobro);
    if (!(monto > 0)) {
      setErrorCobro('El monto tiene que ser mayor a cero.');
      return;
    }

    setGuardandoCobro(true);
    setErrorCobro('');
    try {
      await axios.post(
        '/api/cobros',
        { factura_id: detalleId, monto, cuenta_banco_id: cuentaCobroId },
        authHeaders(token)
      );
      setMostrarCobro(false);
      if (detalleId) cargarDetalle(detalleId);
      cargarFacturas();
    } catch (err: any) {
      setErrorCobro(mensajeError(err, 'No se pudo registrar el cobro.'));
    } finally {
      setGuardandoCobro(false);
    }
  };

  const handleAbrirNC = () => {
    setMostrarNC(true);
    setMotivoNC('');
    setErrorNC('');
  };

  const handleAnular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoNC.trim()) {
      setErrorNC('Contá el motivo de la anulación.');
      return;
    }

    setGuardandoNC(true);
    setErrorNC('');
    try {
      await axios.post(
        '/api/notas-credito',
        { factura_id: detalleId, motivo: motivoNC },
        authHeaders(token)
      );
      setMostrarNC(false);
      setMotivoNC('');
      if (detalleId) cargarDetalle(detalleId);
      cargarFacturas();
    } catch (err: any) {
      setErrorNC(mensajeError(err, 'No se pudo anular la factura.'));
    } finally {
      setGuardandoNC(false);
    }
  };

  if (detalleId) {
    return (
      <section className="view-card">
        <div className="view-header">
          <button className="btn-link" onClick={() => setDetalleId(null)}>
            ‹ Volver a la lista
          </button>
        </div>

        {cargandoDetalle && <p className="empty-state">Cargando factura...</p>}
        {errorDetalle && <div className="error-message">{errorDetalle}</div>}

        {detalle && (
          <>
            <h2 className="detalle-titulo">
              {detalle.numero} <span className={`estado-badge estado-${detalle.estado.toLowerCase()}`}>{detalle.estado}</span>
            </h2>

            <dl className="detalle-grid">
              <dt>Cliente</dt>
              <dd>{clientesPorId[detalle.cliente_id] || detalle.cliente_id}</dd>

              <dt>Fecha</dt>
              <dd>{formatFecha(detalle.fecha)}</dd>

              <dt>Tipo de comprobante</dt>
              <dd>{detalle.tipo_comprobante}</dd>

              <dt>Validada con ARCA</dt>
              <dd>{detalle.validada_arca ? 'Sí' : 'No'}</dd>

              <dt>Subtotal</dt>
              <dd>{formatMoney(detalle.subtotal)}</dd>

              <dt>IVA</dt>
              <dd>{formatMoney(detalle.iva)}</dd>

              <dt>Total</dt>
              <dd>{formatMoney(detalle.total)}</dd>

              <dt>Saldo pendiente</dt>
              <dd>{formatMoney(detalle.saldo)}</dd>
            </dl>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detalle.detalles.map((l) => (
                  <tr key={l.id}>
                    <td>{l.descripcion || l.producto_nombre}</td>
                    <td>{l.cantidad}</td>
                    <td>{formatMoney(l.precio_unitario)}</td>
                    <td>{formatMoney(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {detalle.estado !== 'Anulada' && (
              <div className="cliente-form-actions" style={{ marginTop: '1.5rem' }}>
                {puedeCobrar && detalle.saldo > 0 && !mostrarCobro && (
                  <button className="btn-primary" onClick={handleAbrirCobro}>
                    Registrar cobro
                  </button>
                )}
                {puedeAnular && !mostrarNC && (
                  <button className="btn-danger" onClick={handleAbrirNC}>
                    Anular con nota de crédito
                  </button>
                )}
              </div>
            )}

            {mostrarCobro && (
              <form className="cliente-form" onSubmit={handleRegistrarCobro} style={{ marginTop: '1.5rem' }}>
                {errorCobro && (
                  <div className="error-message" style={{ gridColumn: '1 / -1' }}>
                    {errorCobro}
                  </div>
                )}
                {errorCuentas && (
                  <div className="error-message" style={{ gridColumn: '1 / -1' }}>
                    {errorCuentas}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="monto_cobro">Monto</label>
                  <input
                    id="monto_cobro"
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoCobro}
                    onChange={(e) => setMontoCobro(e.target.value)}
                    disabled={guardandoCobro}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cuenta_cobro">Cuenta</label>
                  <select
                    id="cuenta_cobro"
                    value={cuentaCobroId}
                    onChange={(e) => setCuentaCobroId(e.target.value)}
                    disabled={guardandoCobro || !cuentas || cuentas.length === 0}
                  >
                    <option value="">
                      {cuentas === null ? 'Cargando...' : cuentas.length === 0 ? 'No hay cuentas cargadas' : 'Elegir cuenta'}
                    </option>
                    {cuentas?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cliente-form-actions">
                  <button type="submit" className="btn-primary" disabled={guardandoCobro}>
                    {guardandoCobro ? 'Guardando...' : 'Confirmar cobro'}
                  </button>
                  <button type="button" className="btn-link" onClick={() => setMostrarCobro(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {mostrarNC && (
              <form className="cliente-form" onSubmit={handleAnular} style={{ marginTop: '1.5rem' }}>
                {errorNC && (
                  <div className="error-message" style={{ gridColumn: '1 / -1' }}>
                    {errorNC}
                  </div>
                )}
                {!detalle.validada_arca && (
                  <div className="error-message" style={{ gridColumn: '1 / -1' }}>
                    Esta factura no está validada con ARCA. Es probable que el servidor rechace la nota de crédito.
                  </div>
                )}

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="motivo_nc">Motivo de la anulación</label>
                  <input
                    id="motivo_nc"
                    value={motivoNC}
                    onChange={(e) => setMotivoNC(e.target.value)}
                    disabled={guardandoNC}
                  />
                </div>

                <div className="cliente-form-actions">
                  <button type="submit" className="btn-danger" disabled={guardandoNC}>
                    {guardandoNC ? 'Anulando...' : 'Confirmar anulación'}
                  </button>
                  <button type="button" className="btn-link" onClick={() => setMostrarNC(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="view-card">
      <div className="view-header">
        <h2>Facturas</h2>
        {puedeCrear && (
          <button className="btn-primary" onClick={mostrarForm ? handleCancelar : handleNueva}>
            {mostrarForm ? 'Cancelar' : '+ Nueva factura'}
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
            <label htmlFor="factura_cliente">Cliente *</label>
            <select
              id="factura_cliente"
              value={nuevaFactura.cliente_id}
              onChange={(e) => handleChangeFactura('cliente_id', e.target.value)}
              disabled={guardando || !clientes || clientes.length === 0}
            >
              <option value="">
                {clientes === null ? 'Cargando...' : clientes.length === 0 ? 'No hay clientes cargados' : 'Elegir cliente'}
              </option>
              {clientes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </select>
            {errorClientes && <p className="ayuda-error">{errorClientes}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="factura_fecha">Fecha</label>
            <input
              id="factura_fecha"
              type="date"
              value={nuevaFactura.fecha}
              onChange={(e) => handleChangeFactura('fecha', e.target.value)}
              disabled={guardando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="factura_tipo">Tipo de comprobante</label>
            <select
              id="factura_tipo"
              value={nuevaFactura.tipo_comprobante}
              onChange={(e) => handleChangeFactura('tipo_comprobante', e.target.value)}
              disabled={guardando}
            >
              <option>Factura A</option>
              <option>Factura B</option>
              <option>Factura C</option>
            </select>
          </div>

          <div className="form-group form-group-checkbox">
            <label htmlFor="factura_arca">
              <input
                id="factura_arca"
                type="checkbox"
                checked={nuevaFactura.validar_arca}
                onChange={(e) => handleChangeFactura('validar_arca', e.target.checked)}
                disabled={guardando}
              />
              {' '}Validar con ARCA
            </label>
          </div>

          <div className="lineas-factura" style={{ gridColumn: '1 / -1' }}>
            <label>Productos *</label>

            {errorProductos && <div className="error-message">{errorProductos}</div>}

            {productos && productos.length === 0 && !errorProductos && (
              <div className="error-message">
                Todavía no hay productos cargados en el sistema, así que no se puede armar una factura.
              </div>
            )}

            {productos && productos.length > 0 && (
              <>
                {lineas.map((linea, i) => (
                  <div className="linea-factura" key={i}>
                    <select
                      value={linea.producto_id}
                      onChange={(e) => handleChangeLinea(i, 'producto_id', e.target.value)}
                      disabled={guardando}
                    >
                      <option value="">Elegir producto</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Cantidad"
                      value={linea.cantidad}
                      onChange={(e) => handleChangeLinea(i, 'cantidad', e.target.value)}
                      disabled={guardando}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Precio unitario"
                      value={linea.precio_unitario}
                      onChange={(e) => handleChangeLinea(i, 'precio_unitario', e.target.value)}
                      disabled={guardando}
                    />
                    {lineas.length > 1 && (
                      <button
                        type="button"
                        className="btn-link btn-link-danger"
                        onClick={() => handleQuitarLinea(i)}
                        disabled={guardando}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}

                <button type="button" className="btn-link" onClick={handleAgregarLinea} disabled={guardando}>
                  + Agregar producto
                </button>

                <p className="totales-preview">
                  Subtotal: {formatMoney(subtotalPreview)} · IVA: {formatMoney(ivaPreview)} · Total:{' '}
                  <strong>{formatMoney(totalPreview)}</strong>
                </p>
              </>
            )}
          </div>

          <div className="cliente-form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={guardando || !productos || productos.length === 0}
            >
              {guardando ? 'Guardando...' : 'Crear factura'}
            </button>
          </div>
        </form>
      )}

      {facturas === null && !error && <p className="empty-state">Cargando facturas...</p>}

      {error && facturas && facturas.length === 0 && <div className="error-message">{error}</div>}

      {facturas && facturas.length === 0 && !error && (
        <p className="empty-state">
          Todavía no hay facturas cargadas.
          {puedeCrear ? ' Usá "+ Nueva factura" para crear la primera.' : ''}
        </p>
      )}

      {facturas && facturas.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id}>
                <td>
                  <button className="btn-link" onClick={() => cargarDetalle(f.id)}>
                    {f.numero}
                  </button>
                </td>
                <td>{clientesPorId[f.cliente_id] || f.cliente_id}</td>
                <td>{formatFecha(f.fecha)}</td>
                <td>{f.tipo_comprobante}</td>
                <td>
                  <span className={`estado-badge estado-${f.estado.toLowerCase()}`}>{f.estado}</span>
                </td>
                <td>{formatMoney(f.total)}</td>
                <td>{formatMoney(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default FacturasView;
