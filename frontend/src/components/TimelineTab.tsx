import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { authHeaders, mensajeError } from '../utils/api';
import { TIPOS_ANUNCIANTE } from '../utils/constantesTopview';
import type { OrdenPublicidad } from '../types/topview';

const MESES_CORTOS_TIMELINE = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface FilaTimeline {
  key: string;
  razonSocial: string;
  anunciante: string;
  porMes: (OrdenPublicidad | null)[];
  estado: { texto: string; tipo: 'urgente' | 'hueco' | 'cortoViejo' | 'nuevo' | 'estable' };
  tipoAnunciante: string;
  esNoRegistrada: boolean;
}

const COLORES_ESTADO_TIMELINE: Record<FilaTimeline['estado']['tipo'], { bg: string; text: string }> = {
  urgente: { bg: '#fde8ea', text: '#e81838' },
  hueco: { bg: '#fdf1e2', text: '#c2650a' },
  cortoViejo: { bg: '#f0f0f0', text: '#71717a' },
  nuevo: { bg: '#eaf1fe', text: '#2554c7' },
  estable: { bg: '#e9f8ee', text: '#157f3d' },
};

// Continuidad mes a mes: cada cliente/anunciante es una fila, cada mes de
// ingreso una columna. Una racha de meses seguidos se pinta como una sola
// barra continua (redondeada solo en las puntas) para que la continuidad se
// lea de un vistazo. Cualquier celda vacía (adelante, atrás o un hueco en el
// medio) se puede clickear para crear la orden de ese mes puntual — no hay
// forma de prever de antemano si un cliente va a seguir o no.
function TimelineTab({
  token,
  puedeCrear,
  onVerOrden,
}: {
  token: string;
  puedeCrear: boolean;
  onVerOrden: (ordenId: string) => void;
}) {
  const [ordenes, setOrdenes] = useState<OrdenPublicidad[] | null>(null);
  const [error, setError] = useState('');
  const [clonandoKey, setClonandoKey] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');

  const cargarOrdenes = () => {
    setError('');
    axios
      .get('/api/ordenes-publicidad', authHeaders(token))
      .then((res) => setOrdenes(res.data))
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las órdenes.')));
  };

  useEffect(() => {
    cargarOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mismo fallback que en Órdenes: si no se cargó mes/año de ingreso a mano,
  // se toma el de "Período desde".
  const mesAnoIngresoDe = (o: OrdenPublicidad): [number, number] => {
    const [anoDesde, mesDesde] = o.periodo_desde.split('-').map(Number);
    return [o.ano_ingreso || anoDesde, o.mes_ingreso || mesDesde];
  };

  const datos = useMemo(() => {
    if (!ordenes || ordenes.length === 0) return null;
    const ordenesFiltradas = filtroTipo ? ordenes.filter((o) => o.tipo_anunciante === filtroTipo) : ordenes;
    if (ordenesFiltradas.length === 0) return null;

    const clavesMes = new Set<string>();
    ordenesFiltradas.forEach((o) => {
      const [ano, mes] = mesAnoIngresoDe(o);
      clavesMes.add(`${ano}-${String(mes).padStart(2, '0')}`);
    });
    const mesesReales = Array.from(clavesMes)
      .sort()
      .map((clave) => {
        const [ano, mes] = clave.split('-').map(Number);
        return { ano, mes };
      });
    if (mesesReales.length === 0) return null;

    const ultimoMesReal = mesesReales[mesesReales.length - 1];
    let proxMes = ultimoMesReal.mes + 1;
    let proxAno = ultimoMesReal.ano;
    if (proxMes > 12) {
      proxMes = 1;
      proxAno += 1;
    }
    const proximo = { ano: proxAno, mes: proxMes, label: `${MESES_CORTOS_TIMELINE[proxMes - 1]} ${proxAno}` };

    const primerMesReal = mesesReales[0];
    let antMes = primerMesReal.mes - 1;
    let antAno = primerMesReal.ano;
    if (antMes < 1) {
      antMes = 12;
      antAno -= 1;
    }
    const anterior = { ano: antAno, mes: antMes, label: `${MESES_CORTOS_TIMELINE[antMes - 1]} ${antAno}` };

    const grupos = new Map<string, { razonSocial: string; anunciante: string; porMes: (OrdenPublicidad | null)[] }>();
    ordenesFiltradas.forEach((o) => {
      const key = `${o.cliente_id}|${o.nombre_anunciante}`;
      if (!grupos.has(key)) {
        grupos.set(key, { razonSocial: o.razon_social, anunciante: o.nombre_anunciante, porMes: mesesReales.map(() => null) });
      }
      const [ano, mes] = mesAnoIngresoDe(o);
      const idx = mesesReales.findIndex((m) => m.ano === ano && m.mes === mes);
      const grupo = grupos.get(key)!;
      if (idx >= 0 && !grupo.porMes[idx]) grupo.porMes[idx] = o;
    });

    const filas: FilaTimeline[] = Array.from(grupos.entries()).map(([key, g]) => {
      const presencia = g.porMes.map((o) => !!o);
      const runs: Array<{ start: number; end: number }> = [];
      let actual: { start: number; end: number } | null = null;
      presencia.forEach((activo, i) => {
        if (activo) {
          if (actual) actual.end = i;
          else actual = { start: i, end: i };
        } else if (actual) {
          runs.push(actual);
          actual = null;
        }
      });
      if (actual) runs.push(actual);

      const lastIdx = presencia.length - 1;
      const activoUltimoMes = presencia[lastIdx];
      let estado: FilaTimeline['estado'];

      if (activoUltimoMes) {
        const runActual = runs.find((r) => r.end === lastIdx)!;
        const largo = runActual.end - runActual.start + 1;
        if (runs.length === 1 && runActual.start === 0) {
          estado = { texto: `${largo} ${largo === 1 ? 'mes' : 'meses'} seguidos`, tipo: 'estable' };
        } else if (runs.length === 1) {
          estado = { texto: `Nuevo (${largo} ${largo === 1 ? 'mes' : 'meses'})`, tipo: 'nuevo' };
        } else {
          const runAnterior = runs[runs.indexOf(runActual) - 1];
          const mesHueco = mesesReales[runAnterior.end + 1];
          estado = { texto: `Volvió tras hueco (${MESES_CORTOS_TIMELINE[mesHueco.mes - 1]})`, tipo: 'hueco' };
        }
      } else {
        const ultimoRun = runs[runs.length - 1];
        const gap = ultimoRun ? lastIdx - ultimoRun.end : presencia.length;
        if (ultimoRun && gap === 1) {
          const mesCorte = mesesReales[ultimoRun.end];
          estado = { texto: `Cortó (${MESES_CORTOS_TIMELINE[mesCorte.mes - 1]})`, tipo: 'urgente' };
        } else {
          estado = { texto: `Cortó hace ${gap} meses`, tipo: 'cortoViejo' };
        }
      }

      // Representativo del grupo para agrupar/ordenar (tipo de anunciante y si
      // está registrada): se toma de la orden más reciente del grupo, no de
      // una fija, porque a lo largo de los meses puede cambiar.
      let ordenReciente: OrdenPublicidad | null = null;
      for (let i = g.porMes.length - 1; i >= 0; i--) {
        if (g.porMes[i]) {
          ordenReciente = g.porMes[i];
          break;
        }
      }
      const tipoAnunciante = ordenReciente?.tipo_anunciante || '';
      const esNoRegistrada = ordenReciente
        ? !(ordenReciente.facturado === undefined || ordenReciente.facturado === null || !!ordenReciente.facturado)
        : false;

      return { key, razonSocial: g.razonSocial, anunciante: g.anunciante, porMes: g.porMes, estado, tipoAnunciante, esNoRegistrada };
    });

    // Mismo criterio de segmentación que el listado de Órdenes (Pequeños
    // Anunciantes, Pautas Estado, Pautas Anuales, Pautas Mensuales, Pautas en
    // dólares, Pauta Concesionario; dentro de cada tipo, las no registradas
    // al final) — pero alfabético por anunciante dentro de cada bloque, no
    // por fecha de carga, para que el timeline se lea como una planilla fija.
    filas.sort((a, b) => {
      const grupo = TIPOS_ANUNCIANTE.indexOf(a.tipoAnunciante) - TIPOS_ANUNCIANTE.indexOf(b.tipoAnunciante);
      if (grupo !== 0) return grupo;
      const registro = Number(a.esNoRegistrada) - Number(b.esNoRegistrada);
      if (registro !== 0) return registro;
      return a.anunciante.localeCompare(b.anunciante, 'es', { sensitivity: 'base' });
    });

    return {
      mesesReales: mesesReales.map((m) => ({ ...m, label: `${MESES_CORTOS_TIMELINE[m.mes - 1]} ${m.ano}` })),
      proximo,
      anterior,
      filas,
    };
  }, [ordenes, filtroTipo]);

  // Libertad total: cualquier celda vacía de una fila se puede clickear para
  // crear una orden en ESE mes puntual — no se puede prever de antemano si un
  // cliente va a seguir el mes que viene o no (se sabe recién cuando llega el
  // mes), así que la restricción anterior (solo el mes pegado al último/
  // primero cargado) no tenía sentido. Clona desde la orden más cercana en el
  // tiempo dentro de la misma fila, la que sea (antes o después), corriendo
  // el período la cantidad de meses que corresponda.
  const handleClonarACelda = async (fila: FilaTimeline, mesObjetivo: number, anoObjetivo: number) => {
    if (!puedeCrear || !datos) return;
    const candidatas = fila.porMes
      .map((o, i) => {
        if (!o) return null;
        const m = datos.mesesReales[i];
        return { orden: o, dist: Math.abs((anoObjetivo - m.ano) * 12 + (mesObjetivo - m.mes)) };
      })
      .filter((c) => c !== null)
      .sort((a, b) => a!.dist - b!.dist);
    const mejor = candidatas[0]?.orden;
    if (!mejor) return;
    const clave = `${fila.key}:${anoObjetivo}-${mesObjetivo}`;
    setClonandoKey(clave);
    setError('');
    try {
      const res = await axios.post(`/api/ordenes-publicidad/${mejor.id}/clonar-a-mes`, { mes: mesObjetivo, ano: anoObjetivo }, authHeaders(token));
      onVerOrden(res.data.orden.id);
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo crear la orden para ese mes.'));
    } finally {
      setClonandoKey(null);
    }
  };

  const PALETA_GHOST = {
    azul: { border: '#6d87c9', bg: '#eef2fb', text: '#3454a8', textDisabled: '#a9b7dd' },
    gris: { border: '#c9c9cf', bg: '#fff', text: '#9a9a9a', textDisabled: '#c4c4c4' },
    ambar: { border: '#d38a3f', bg: '#fdf1e2', text: '#a15b12', textDisabled: '#d9b98c' },
  } as const;

  const anchoCelda = 96;
  const anchoNombre = 240;
  const anchoEstado = 220;

  return (
    <div>
      <h3 className="reportes-subtitulo">Continuidad de clientes</h3>
      <p style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.85rem', color: '#666', maxWidth: '640px' }}>
        Qué anunciantes siguen pautando mes a mes, según "Mes de ingreso (venta)". Cada racha seguida se pinta como
        una sola barra. Cualquier celda vacía se puede clickear para crear la orden de ese mes puntual — no se sabe
        de antemano si un cliente sigue o no, así que no hace falta esperar a que sea "el mes siguiente": el "?" gris
        es hacia adelante, el azul hacia atrás y el ámbar completa un hueco en el medio. Siempre queda con N° de
        orden "REVISAR" hasta que lo corrijas, y te lleva directo a editarla.
      </p>

      <div className="form-group" style={{ margin: '0 0 1rem', maxWidth: '14rem' }}>
        <label htmlFor="timeline_filtro_tipo">Tipo de anunciante</label>
        <select id="timeline_filtro_tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos</option>
          {TIPOS_ANUNCIANTE.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}
      {ordenes === null && !error && <p className="empty-state">Cargando línea de tiempo...</p>}
      {ordenes && ordenes.length === 0 && !error && <p className="empty-state">Todavía no hay órdenes cargadas.</p>}

      {datos && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 'fit-content' }}>
              {/* Encabezado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '8px', borderBottom: '1px solid #e7e5e4' }}>
                <div style={{ width: anchoNombre, flexShrink: 0, fontSize: '11px', fontWeight: 700, color: '#6b6b70', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Cliente / Anunciante
                </div>
                <div style={{ width: anchoCelda, flexShrink: 0, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#8ba3e0' }}>
                  ¿? {datos.anterior.label.toUpperCase()}
                </div>
                {datos.mesesReales.map((m) => (
                  <div key={`${m.ano}-${m.mes}`} style={{ width: anchoCelda, flexShrink: 0, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#6b6b70' }}>
                    {m.label.toUpperCase()}
                  </div>
                ))}
                <div style={{ width: anchoCelda, flexShrink: 0, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#b7b7bd' }}>
                  {datos.proximo.label.toUpperCase()} ¿?
                </div>
                <div style={{ width: anchoEstado, flexShrink: 0, fontSize: '11px', fontWeight: 700, color: '#6b6b70', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Estado
                </div>
              </div>

              {/* Filas */}
              {datos.filas.map((fila) => {
                const presencia = fila.porMes.map((o) => !!o);
                // Columnas combinadas: fantasma "anterior" + meses reales + fantasma
                // "próximo" — un solo recorrido en vez de tres bloques repetidos.
                const columnas = [datos.anterior, ...datos.mesesReales, datos.proximo];
                const ordenesCol = [null as OrdenPublicidad | null, ...fila.porMes, null as OrdenPublicidad | null];
                const presenciaCol = [false, ...presencia, false];
                const firstTrueIdx = presenciaCol.indexOf(true);
                const lastTrueIdx = presenciaCol.lastIndexOf(true);
                const colorEstado = COLORES_ESTADO_TIMELINE[fila.estado.tipo];

                return (
                  <div key={fila.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: anchoNombre, flexShrink: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181b' }}>{fila.anunciante}</div>
                      <div style={{ fontSize: '11.5px', color: '#6b6b70' }}>{fila.razonSocial}</div>
                    </div>

                    {columnas.map((col, j) => {
                      const orden = ordenesCol[j];
                      const activo = !!orden;
                      const esHueco = !activo && j > firstTrueIdx && j < lastTrueIdx;
                      const esAntes = !activo && j < firstTrueIdx;
                      const roundL = activo && !presenciaCol[j - 1];
                      const roundR = activo && !presenciaCol[j + 1];
                      const clave = `${fila.key}:${col.ano}-${col.mes}`;
                      const clonando = clonandoKey === clave;
                      const paleta = esHueco ? PALETA_GHOST.ambar : esAntes ? PALETA_GHOST.azul : PALETA_GHOST.gris;
                      const tituloVacia = esHueco
                        ? `Completar el hueco de ${col.label}`
                        : esAntes
                        ? `Crear una orden anterior, para ${col.label}`
                        : `Crear una orden nueva para ${col.label}`;

                      return (
                        <div key={j} style={{ width: anchoCelda, flexShrink: 0, height: '32px', position: 'relative' }}>
                          {activo ? (
                            <button
                              onClick={() => onVerOrden(orden!.id)}
                              title={`${orden!.numero_orden_agencia || 'sin número'} — hacé clic para abrir`}
                              style={{
                                position: 'absolute',
                                top: 2,
                                bottom: 2,
                                left: 0,
                                right: 0,
                                background: '#e81838',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#fff',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                borderTopLeftRadius: roundL ? 8 : 0,
                                borderBottomLeftRadius: roundL ? 8 : 0,
                                borderTopRightRadius: roundR ? 8 : 0,
                                borderBottomRightRadius: roundR ? 8 : 0,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                padding: '0 6px',
                              }}
                            >
                              {orden!.numero_orden_agencia === 'REVISAR' ? 'REVISAR' : orden!.numero_orden_agencia || '—'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleClonarACelda(fila, col.mes, col.ano)}
                              disabled={!puedeCrear || clonando}
                              title={puedeCrear ? tituloVacia : 'Necesitás permiso para crear órdenes'}
                              style={{
                                position: 'absolute',
                                top: 2,
                                bottom: 2,
                                left: 4,
                                right: 4,
                                border: `1.5px dashed ${paleta.border}`,
                                borderRadius: 8,
                                background: paleta.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '13px',
                                color: puedeCrear ? paleta.text : paleta.textDisabled,
                                fontWeight: 700,
                                cursor: puedeCrear ? 'pointer' : 'default',
                              }}
                            >
                              {clonando ? '…' : '?'}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <div style={{ width: anchoEstado, flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: 999,
                          fontSize: '12.5px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          background: colorEstado.bg,
                          color: colorEstado.text,
                        }}
                      >
                        {fila.estado.tipo === 'urgente' ? '⚠ ' : ''}
                        {fila.estado.texto}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leyenda */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', fontSize: '11.5px', color: '#6b6b70', marginTop: '1rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 22, height: 12, background: '#e81838', borderRadius: 6, display: 'inline-block' }} />
              Pautó ese mes (clic para abrir la orden)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 22, height: 12, border: '1.5px dashed #c9c9cf', borderRadius: 6, display: 'inline-block' }} />
              Gris = crear una orden más adelante
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 22, height: 12, border: '1.5px dashed #6d87c9', background: '#eef2fb', borderRadius: 6, display: 'inline-block' }} />
              Azul = crear una orden anterior (reconstruir historia)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 22, height: 12, border: '1.5px dashed #d38a3f', background: '#fdf1e2', borderRadius: 6, display: 'inline-block' }} />
              Ámbar = completar un hueco en el medio
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default TimelineTab;
