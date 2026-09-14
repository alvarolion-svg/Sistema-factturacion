import React, { useState, useEffect } from 'react';
import '../styles/TopviewForm.css';

interface Intermediario {
  id: string;
  nombre: string;
  tipo: string;
  factura_formal: boolean;
}

interface Agencia {
  id: string;
  nombre: string;
}

interface IntermediarioOrden {
  intermediario_id: string;
  porcentaje_comision: number;
  factura_formal: boolean;
  tipo_calculo?: 'base' | 'cascada';
}

interface FormData {
  numero_orden_agencia: string;
  agencia_id: string;
  tipo_anunciante: string;
  razon_social: string;
  nombre_anunciante: string;
  cliente_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  fecha_facturacion: string;
  email_contacto: string;
  costo_produccion: number;
  monto_neto_bruto: number;
  descuento_visible_porcentaje: number;
  comision_1_intermediario_id?: string;
  comision_1_porcentaje?: number;
  comision_2_intermediario_id?: string;
  comision_2_porcentaje?: number;
  intermediarios: IntermediarioOrden[];
  facturado: boolean;
  detalles_productos: Array<{
    tipo_producto: string;
    cantidad: number;
    ubicacion: string;
    especificaciones: string;
  }>;
  emails_contacto: Array<{
    email: string;
    nombre: string;
    cargo: string;
    principal: boolean;
  }>;
  arreglos_no_registrables: Array<{
    tipo: string;
    descripcion: string;
    monto: number;
    tercero_nombre: string;
  }>;
  notas: string;
}

const TopviewForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const [agencias, setAgencias] = useState<Agencia[]>([]);
  const [intermediarios, setIntermediarios] = useState<Intermediario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<FormData>({
    numero_orden_agencia: '',
    agencia_id: '',
    tipo_anunciante: 'Pequeños Anunciantes',
    razon_social: '',
    nombre_anunciante: '',
    cliente_id: '',
    periodo_desde: '',
    periodo_hasta: '',
    fecha_facturacion: '',
    email_contacto: '',
    costo_produccion: 0,
    monto_neto_bruto: 0,
    descuento_visible_porcentaje: 0,
    intermediarios: [],
    facturado: true,
    detalles_productos: [{ tipo_producto: '', cantidad: 1, ubicacion: '', especificaciones: '' }],
    emails_contacto: [{ email: '', nombre: '', cargo: '', principal: true }],
    arreglos_no_registrables: [],
    notas: '',
  });

  // Cálculos de cascada para N intermediarios (soporta 'base' y 'cascada')
  const montoBruto = formData.monto_neto_bruto;
  const montoDescontar = montoBruto * (formData.descuento_visible_porcentaje / 100);
  const montoParaFacturar = montoBruto - montoDescontar;

  const comisiones = formData.intermediarios.reduce(
    (acc, inter, idx) => {
      const tipoCalculo = inter.tipo_calculo || 'cascada';
      let montoComision: number;
      let montoRestante: number;

      if (tipoCalculo === 'base') {
        // Aplica sobre el monto para facturar (no afecta el saldo)
        montoComision = montoParaFacturar * (inter.porcentaje_comision / 100);
        montoRestante = idx === 0 ? montoParaFacturar : acc[idx - 1].montoRestante;
      } else {
        // Cascada: aplica sobre lo que queda
        const montoActual = idx === 0 ? montoParaFacturar : acc[idx - 1].montoRestante;
        montoComision = montoActual * (inter.porcentaje_comision / 100);
        montoRestante = montoActual - montoComision;
      }

      acc.push({
        nivel: idx + 1,
        montoComision,
        montoRestante,
        tipoCalculo,
        intermediarioId: inter.intermediario_id,
      });
      return acc;
    },
    [] as Array<{ nivel: number; montoComision: number; montoRestante: number; tipoCalculo: string; intermediarioId: string }>
  );

  const montoPercibido = comisiones.length > 0 ? comisiones[comisiones.length - 1].montoRestante : montoParaFacturar;

  // Total de comisiones sobre base
  const comisionesBase = comisiones
    .filter(c => c.tipoCalculo === 'base')
    .reduce((sum, c) => sum + c.montoComision, 0);

  useEffect(() => {
    cargarMaestros();
  }, []);

  const cargarMaestros = async () => {
    try {
      const token = localStorage.getItem('token');
      const [agenciasRes, intermediariosRes] = await Promise.all([
        fetch('/api/topview/agencias', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/topview/intermediarios', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (agenciasRes.ok) {
        setAgencias(await agenciasRes.json());
      }
      if (intermediariosRes.ok) {
        setIntermediarios(await intermediariosRes.json());
      }
    } catch (err) {
      console.error('Error cargando maestros:', err);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ordenes-publicidad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al crear la orden');
      }

      const orden = await response.json();
      alert(`Orden ${orden.numero_orden} creada exitosamente`);
      setStep(1);
      setFormData({
        numero_orden_agencia: '',
        agencia_id: '',
        tipo_anunciante: 'Pequeños Anunciantes',
        razon_social: '',
        nombre_anunciante: '',
        cliente_id: '',
        periodo_desde: '',
        periodo_hasta: '',
        fecha_facturacion: '',
        email_contacto: '',
        costo_produccion: 0,
        monto_neto_bruto: 0,
        descuento_visible_porcentaje: 0,
        intermediarios: [],
        facturado: true,
        detalles_productos: [{ tipo_producto: '', cantidad: 1, ubicacion: '', especificaciones: '' }],
        emails_contacto: [{ email: '', nombre: '', cargo: '', principal: true }],
        arreglos_no_registrables: [],
        notas: '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="topview-form-container">
      <h1>Crear Orden de Publicidad TOPVIEW</h1>

      <form onSubmit={handleSubmit}>
        {/* STEP 1: DATOS BÁSICOS */}
        {step === 1 && (
          <div className="form-step">
            <h2>Paso 1: Datos Básicos de la Orden</h2>

            <div className="form-row">
              <div className="form-group">
                <label>Número de Orden (Agencia)</label>
                <input
                  type="text"
                  value={formData.numero_orden_agencia}
                  onChange={(e) => handleChange('numero_orden_agencia', e.target.value)}
                  placeholder="Ej: 202608-0296"
                />
              </div>
              <div className="form-group">
                <label>Agencia</label>
                <select value={formData.agencia_id} onChange={(e) => handleChange('agencia_id', e.target.value)}>
                  <option value="">-- Seleccionar Agencia --</option>
                  {agencias.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Razón Social</label>
                <input
                  type="text"
                  value={formData.razon_social}
                  onChange={(e) => handleChange('razon_social', e.target.value)}
                  placeholder="Ej: YPF SOCIEDAD ANONIMA"
                  required
                />
              </div>
              <div className="form-group">
                <label>Nombre del Anunciante</label>
                <input
                  type="text"
                  value={formData.nombre_anunciante}
                  onChange={(e) => handleChange('nombre_anunciante', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tipo de Anunciante</label>
                <select value={formData.tipo_anunciante} onChange={(e) => handleChange('tipo_anunciante', e.target.value)}>
                  <option value="Pequeños Anunciantes">Pequeños Anunciantes</option>
                  <option value="Pautas Estado">Pautas Estado</option>
                  <option value="Pautas Anuales">Pautas Anuales</option>
                  <option value="Pautas Mensuales">Pautas Mensuales</option>
                </select>
              </div>
              <div className="form-group">
                <label>Email Contacto</label>
                <input
                  type="email"
                  value={formData.email_contacto}
                  onChange={(e) => handleChange('email_contacto', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Período Desde</label>
                <input
                  type="date"
                  value={formData.periodo_desde}
                  onChange={(e) => handleChange('periodo_desde', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Período Hasta</label>
                <input
                  type="date"
                  value={formData.periodo_hasta}
                  onChange={(e) => handleChange('periodo_hasta', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Fecha Facturación</label>
                <input
                  type="date"
                  value={formData.fecha_facturacion}
                  onChange={(e) => handleChange('fecha_facturacion', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.facturado}
                    onChange={(e) => handleChange('facturado', e.target.checked)}
                  />
                  ¿Genera facturación al cliente?
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" disabled>
                ← Anterior
              </button>
              <button type="button" onClick={() => setStep(2)}>
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: MONTOS Y DESCUENTOS CON COMISIONES FLEXIBLES */}
        {step === 2 && (
          <div className="form-step">
            <h2>Paso 2: Montos, Descuentos y Comisiones Cascada (N Intermediarios)</h2>

            <div className="form-group">
              <label>Monto Neto Bruto (Base)</label>
              <input
                type="number"
                value={formData.monto_neto_bruto}
                onChange={(e) => handleChange('monto_neto_bruto', parseFloat(e.target.value) || 0)}
                step="0.01"
                required
              />
              <small>Monto total base de la orden</small>
            </div>

            <div className="calculator-section">
              <h3>Cálculo Cascada de Descuentos y Comisiones</h3>

              <div className="calc-line">
                <span>Monto Bruto:</span>
                <strong>${montoBruto.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="form-group">
                <label>Descuento Visible % (Nota de Crédito)</label>
                <input
                  type="number"
                  value={formData.descuento_visible_porcentaje}
                  onChange={(e) => handleChange('descuento_visible_porcentaje', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                  max="100"
                />
                <small>Este descuento aparece en la factura</small>
              </div>

              <div className="calc-line">
                <span>Menos Descuento Visible (-{formData.descuento_visible_porcentaje}%):</span>
                <strong className="negative">-${montoDescontar.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="calc-line highlight">
                <span>Monto para Facturar:</span>
                <strong>${montoParaFacturar.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
              </div>

              <hr />

              <h4>Intermediarios y Comisiones</h4>
              <p>Cada intermediario puede aplicar sobre la base (monto a facturar) o en cascada (sobre lo que queda)</p>

              {formData.intermediarios.length === 0 ? (
                <p style={{ color: '#9ca3af' }}>Sin intermediarios configurados</p>
              ) : (
                comisiones.map((com, idx) => {
                  const inter = formData.intermediarios[idx];
                  const montoBase = com.tipoCalculo === 'base' ? montoParaFacturar : (idx === 0 ? montoParaFacturar : comisiones[idx - 1].montoRestante);
                  return (
                    <div key={idx} style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: com.tipoCalculo === 'base' ? '#fef3c7' : '#f9fafb', borderRadius: '4px', border: `2px solid ${com.tipoCalculo === 'base' ? '#fcd34d' : '#e5e7eb'}` }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Nivel {com.nivel}:</strong> {intermediarios.find((i) => i.id === inter.intermediario_id)?.nombre || 'Desconocido'}
                        <span style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem', borderRadius: '3px', backgroundColor: com.tipoCalculo === 'base' ? '#fbbf24' : '#3b82f6', color: 'white', fontSize: '0.8rem' }}>
                          {com.tipoCalculo === 'base' ? 'SOBRE BASE' : 'CASCADA'}
                        </span>
                      </div>
                      <div className="calc-line">
                        <span>Base para {inter.porcentaje_comision}%:</span>
                        <strong>${montoBase.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="calc-line negative">
                        <span>Comisión ({inter.porcentaje_comision}%):</span>
                        <strong>-${com.montoComision.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
                      </div>
                      {com.tipoCalculo === 'cascada' && (
                        <div className="calc-line">
                          <span>Restante (después comisión):</span>
                          <strong>${com.montoRestante.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nuevos = formData.intermediarios.filter((_, i) => i !== idx);
                          handleChange('intermediarios', nuevos);
                        }}
                        style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.85rem', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Eliminar
                      </button>
                    </div>
                  );
                })
              )}

              <div style={{ margin: '1rem 0', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                <button
                  type="button"
                  onClick={() => {
                    const nuevos = [...formData.intermediarios, { intermediario_id: '', porcentaje_comision: 0, factura_formal: false }];
                    handleChange('intermediarios', nuevos);
                  }}
                  style={{ marginBottom: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                >
                  + Agregar Intermediario
                </button>

                {formData.intermediarios.map((inter, idx) => (
                  <div key={idx} style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                    <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Nivel {idx + 1}:</div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <select
                        value={inter.intermediario_id}
                        onChange={(e) => {
                          const nuevos = [...formData.intermediarios];
                          nuevos[idx].intermediario_id = e.target.value;
                          handleChange('intermediarios', nuevos);
                        }}
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      >
                        <option value="">-- Seleccionar Intermediario --</option>
                        {intermediarios.map((int) => (
                          <option key={int.id} value={int.id}>
                            {int.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={inter.porcentaje_comision}
                        onChange={(e) => {
                          const nuevos = [...formData.intermediarios];
                          nuevos[idx].porcentaje_comision = parseFloat(e.target.value) || 0;
                          handleChange('intermediarios', nuevos);
                        }}
                        placeholder="%"
                        style={{ width: '80px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                      <select
                        value={inter.tipo_calculo || 'cascada'}
                        onChange={(e) => {
                          const nuevos = [...formData.intermediarios];
                          nuevos[idx].tipo_calculo = e.target.value as 'base' | 'cascada';
                          handleChange('intermediarios', nuevos);
                        }}
                        style={{ width: '120px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      >
                        <option value="base">Base</option>
                        <option value="cascada">Cascada</option>
                      </select>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={inter.factura_formal}
                        onChange={(e) => {
                          const nuevos = [...formData.intermediarios];
                          nuevos[idx].factura_formal = e.target.checked;
                          handleChange('intermediarios', nuevos);
                        }}
                      />
                      Emite facturas formales
                    </label>
                    <small style={{ color: '#6b7280', display: 'block' }}>
                      {inter.tipo_calculo === 'base'
                        ? `Comisión sobre base: ${(montoParaFacturar * (inter.porcentaje_comision / 100)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ARS`
                        : `Comisión en cascada: ${(comisiones[idx]?.montoComision || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ARS`
                      }
                    </small>
                  </div>
                ))}
              </div>

              <div className="calc-line highlight final">
                <span>NETO PERCIBIDO:</span>
                <strong>${montoPercibido.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div className="form-group">
              <label>Costo de Producción</label>
              <input
                type="number"
                value={formData.costo_produccion}
                onChange={(e) => handleChange('costo_produccion', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => setStep(1)}>
                ← Anterior
              </button>
              <button type="button" onClick={() => setStep(3)}>
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DETALLES Y CONTACTOS */}
        {step === 3 && (
          <div className="form-step">
            <h2>Paso 3: Detalles, Contactos y Arreglos</h2>

            <div className="subsection">
              <h3>Productos/Pantallas</h3>
              {formData.detalles_productos.map((detalle, idx) => (
                <div key={idx} className="form-group">
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="Tipo de Producto"
                      value={detalle.tipo_producto}
                      onChange={(e) => {
                        const nuevos = [...formData.detalles_productos];
                        nuevos[idx].tipo_producto = e.target.value;
                        handleChange('detalles_productos', nuevos);
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Cantidad"
                      value={detalle.cantidad}
                      onChange={(e) => {
                        const nuevos = [...formData.detalles_productos];
                        nuevos[idx].cantidad = parseInt(e.target.value) || 1;
                        handleChange('detalles_productos', nuevos);
                      }}
                      min="1"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  handleChange('detalles_productos', [
                    ...formData.detalles_productos,
                    { tipo_producto: '', cantidad: 1, ubicacion: '', especificaciones: '' },
                  ])
                }
              >
                + Agregar Producto
              </button>
            </div>

            <div className="subsection">
              <h3>Contactos</h3>
              {formData.emails_contacto.map((email, idx) => (
                <div key={idx} className="form-group">
                  <div className="form-row">
                    <input
                      type="email"
                      placeholder="Email"
                      value={email.email}
                      onChange={(e) => {
                        const nuevos = [...formData.emails_contacto];
                        nuevos[idx].email = e.target.value;
                        handleChange('emails_contacto', nuevos);
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={email.nombre}
                      onChange={(e) => {
                        const nuevos = [...formData.emails_contacto];
                        nuevos[idx].nombre = e.target.value;
                        handleChange('emails_contacto', nuevos);
                      }}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={email.principal}
                        onChange={(e) => {
                          const nuevos = [...formData.emails_contacto];
                          nuevos[idx].principal = e.target.checked;
                          handleChange('emails_contacto', nuevos);
                        }}
                      />
                      Principal
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="subsection">
              <h3>Arreglos No Registrables</h3>
              <p>Acuerdos verbales/informales que afectan el precio (no documentados formalmente)</p>
              {formData.arreglos_no_registrables.map((arreglo, idx) => (
                <div key={idx} className="form-group">
                  <input
                    type="text"
                    placeholder="Descripción del arreglo"
                    value={arreglo.descripcion}
                    onChange={(e) => {
                      const nuevos = [...formData.arreglos_no_registrables];
                      nuevos[idx].descripcion = e.target.value;
                      handleChange('arreglos_no_registrables', nuevos);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  handleChange('arreglos_no_registrables', [
                    ...formData.arreglos_no_registrables,
                    { tipo: 'Comisión', descripcion: '', monto: 0, tercero_nombre: '' },
                  ])
                }
              >
                + Agregar Arreglo No Registrable
              </button>
            </div>

            <div className="form-group">
              <label>Notas Internas</label>
              <textarea
                value={formData.notas}
                onChange={(e) => handleChange('notas', e.target.value)}
                placeholder="Notas adicionales sobre la orden..."
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button type="button" onClick={() => setStep(2)}>
                ← Anterior
              </button>
              <button type="submit" disabled={loading}>
                {loading ? 'Creando Orden...' : 'Crear Orden'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default TopviewForm;
