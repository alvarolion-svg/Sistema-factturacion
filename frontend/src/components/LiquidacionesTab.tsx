import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { authHeaders, mensajeError, formatMoney, formatFecha } from '../utils/api';
import { InputMiles, InputPorcentaje } from './CamposMonto';

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type EstadoEspecial = 'sin_cargo' | 'canje' | null;

interface Concesionario {
  id: string;
  razon_social: string;
  direccion: string | null;
}

interface LineaLiquidacion {
  detalle_id: string;
  orden_id: string;
  numero_orden: string;
  numero_orden_agencia: string | null;
  anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  tipo_producto: string;
  cantidad: number;
  punto_instalacion: string | null;
  locacion_id: string;
  locacion_nombre: string;
  liquidacion_id: string | null;
  monto: number;
  excluida: boolean;
  inicio_tardio: boolean;
  estado_especial: EstadoEspecial;
  seccion: 'publicidad' | 'stand';
}

interface LineaManual {
  id: string;
  concesionario_id: string;
  mes: number;
  ano: number;
  descripcion: string;
  monto: number;
  tipo: 'suma' | 'resta';
}

interface SeccionResumen {
  declarado: number;
  canon: number;
}

interface PercepcionCalculada {
  nombre: string;
  porcentaje: number;
  tipo: 'suma' | 'resta';
  monto: number;
}

interface LineaEstebanVivo {
  anunciante: string;
  numero_orden: string;
  declarado: number;
  comision_vendedor: number;
  neto1: number;
  canon: number;
  neto2: number;
  gastos_top: number;
  neto3: number;
  com_vivo: number;
}

interface EstebanVivo {
  porcentajes: { comision_vendedor: number; canon: number; gastos_top: number; vivo: number };
  lineas: LineaEstebanVivo[];
  total_a_pagar: number;
}

const MANUAL_VACIO = { descripcion: '', monto: '', tipo: 'suma' as 'suma' | 'resta' };
const SECCION_NOMBRE: Record<'publicidad' | 'stand', string> = { publicidad: 'Publicidad', stand: 'Stand' };

export interface SeleccionLiquidacion {
  concesionarioId: string;
  mes: string;
  ano: string;
}

function LiquidacionesTab({
  token,
  puedeCargar,
  seleccionInicial,
  onSeleccionConsumida,
  onVerOrden,
}: {
  token: string;
  puedeCargar: boolean;
  seleccionInicial?: SeleccionLiquidacion | null;
  onSeleccionConsumida?: () => void;
  onVerOrden?: (ordenId: string) => void;
}) {
  const hoy = new Date();
  const [concesionarios, setConcesionarios] = useState<Concesionario[]>([]);
  const [concesionarioId, setConcesionarioId] = useState('');
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [ano, setAno] = useState(String(hoy.getFullYear()));

  const [filas, setFilas] = useState<LineaLiquidacion[] | null>(null);
  const [manuales, setManuales] = useState<LineaManual[]>([]);
  const [error, setError] = useState('');
  const [montosLocal, setMontosLocal] = useState<Record<string, string>>({});
  const [montosGrupoLocal, setMontosGrupoLocal] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);
  const [nota, setNota] = useState('');
  const [colapsarPorCliente, setColapsarPorCliente] = useState(true);

  const [manualForm, setManualForm] = useState(MANUAL_VACIO);
  const [agregandoManual, setAgregandoManual] = useState(false);
  const [editandoManualId, setEditandoManualId] = useState<string | null>(null);
  const [editManualForm, setEditManualForm] = useState(MANUAL_VACIO);

  const [porcentajeComision, setPorcentajeComision] = useState(100);
  const [secciones, setSecciones] = useState<{ publicidad: SeccionResumen; stand: SeccionResumen }>({
    publicidad: { declarado: 0, canon: 0 },
    stand: { declarado: 0, canon: 0 },
  });
  const [ivaPorcentaje, setIvaPorcentaje] = useState(21);
  const [ivaMonto, setIvaMonto] = useState(0);
  const [percepcionesCalculadas, setPercepcionesCalculadas] = useState<PercepcionCalculada[]>([]);
  const [totalFinal, setTotalFinal] = useState(0);
  const [totalAPagar, setTotalAPagar] = useState(0);
  // Esteban Vivo: solo llega no-null cuando el concesionario elegido tiene
  // la condición cargada (hoy, Parque C. Avellaneda / Pueblo Caamaño) — ver
  // [[project_esteban_vivo_comisiona_no_comisionista]]. Es plata que se le
  // paga a un tercero distinto del concesionario, con su propia cascada —
  // se muestra en su propia sección/export, nunca mezclado con lo de arriba
  // (ni con Oxant si algún día se construye) porque son comunicaciones
  // separadas: cada uno cobra el suyo sin ver el del otro.
  const [estebanVivo, setEstebanVivo] = useState<EstebanVivo | null>(null);
  const [editandoVivo, setEditandoVivo] = useState(false);
  const [vivoForm, setVivoForm] = useState({ comisionVendedor: '', canon: '', gastosTop: '', vivo: '' });
  const [guardandoVivo, setGuardandoVivo] = useState(false);
  const [vista, setVista] = useState<'liquidar' | 'tardias' | 'condiciones'>('liquidar');

  useEffect(() => {
    axios
      .get('/api/liquidaciones/concesionarios', authHeaders(token))
      .then((res) => setConcesionarios(res.data || []))
      .catch(() => setConcesionarios([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = () => {
    if (!concesionarioId || !mes || !ano) return;
    setError('');
    setFilas(null);
    axios
      .get('/api/liquidaciones', {
        ...authHeaders(token),
        params: { concesionario_id: concesionarioId, mes, ano },
      })
      .then((res) => {
        const data: LineaLiquidacion[] = res.data.filas || [];
        setFilas(data);
        setManuales(res.data.manuales || []);
        setPorcentajeComision(res.data.porcentaje_comision ?? 100);
        setSecciones(res.data.secciones || { publicidad: { declarado: 0, canon: 0 }, stand: { declarado: 0, canon: 0 } });
        setIvaPorcentaje(res.data.iva_porcentaje ?? 21);
        setIvaMonto(res.data.iva_monto ?? 0);
        setPercepcionesCalculadas(res.data.percepciones || []);
        setTotalFinal(res.data.total ?? 0);
        setTotalAPagar(res.data.total_a_pagar ?? 0);
        setEstebanVivo(res.data.esteban_vivo || null);
        const iniciales: Record<string, string> = {};
        data.forEach((f) => {
          iniciales[f.detalle_id] = f.monto ? String(f.monto) : '';
        });
        setMontosLocal(iniciales);
        setMontosGrupoLocal({});
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudo cargar la liquidación de ese período.'));
        setFilas([]);
        setManuales([]);
      });
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concesionarioId, mes, ano]);

  // Acceso directo desde una orden ("Ver liquidación de X"): preselecciona
  // concesionario/mes/año y avisa para que el padre limpie el pedido.
  useEffect(() => {
    if (seleccionInicial) {
      setVista('liquidar');
      setConcesionarioId(seleccionInicial.concesionarioId);
      setMes(seleccionInicial.mes);
      setAno(seleccionInicial.ano);
      onSeleccionConsumida?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionInicial]);

  const handleGuardarMonto = async (detalleId: string) => {
    const valor = Number(montosLocal[detalleId] || 0);
    setGuardandoId(detalleId);
    setError('');
    try {
      await axios.put(`/api/liquidaciones/${detalleId}`, { mes: Number(mes), ano: Number(ano), monto: valor }, authHeaders(token));
      setFilas((actual) => (actual || []).map((f) => (f.detalle_id === detalleId ? { ...f, monto: valor } : f)));
      setGuardadoId(detalleId);
      setTimeout(() => setGuardadoId((actual) => (actual === detalleId ? null : actual)), 1500);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el monto.'));
    } finally {
      setGuardandoId(null);
    }
  };

  // Guarda el monto combinado de un grupo colapsado: todo el valor tipeado
  // va a la primera línea del grupo, el resto se pone en 0 — el total
  // declarado (suma de todas las líneas) queda igual, no hace falta tocar
  // el backend para esto.
  const handleGuardarMontoGrupo = async (clave: string, lineas: LineaLiquidacion[], valor: number) => {
    const [primera, ...resto] = lineas;
    setGuardandoId(primera.detalle_id);
    setError('');
    try {
      await axios.put(`/api/liquidaciones/${primera.detalle_id}`, { mes: Number(mes), ano: Number(ano), monto: valor }, authHeaders(token));
      for (const l of resto) {
        await axios.put(`/api/liquidaciones/${l.detalle_id}`, { mes: Number(mes), ano: Number(ano), monto: 0 }, authHeaders(token));
      }
      setGuardadoId(primera.detalle_id);
      setTimeout(() => setGuardadoId((actual) => (actual === primera.detalle_id ? null : actual)), 1500);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el monto.'));
    } finally {
      setGuardandoId(null);
    }
  };

  // Sacar una línea no borra la orden ni lo ya facturado — solo deja de
  // contarla en esta liquidación (ej. el cliente terminó no pagando esa
  // campaña puntual). Queda guardada, se puede restaurar.
  const handleExcluir = async (f: LineaLiquidacion) => {
    if (!window.confirm(`¿Sacar "${f.anunciante} — ${f.tipo_producto}" de esta liquidación? No se toca la orden, se puede restaurar después.`)) {
      return;
    }
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: true },
        authHeaders(token)
      );
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo sacar la línea.'));
    }
  };

  const handleRestaurar = async (f: LineaLiquidacion) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: false },
        authHeaders(token)
      );
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo restaurar la línea.'));
    }
  };

  // Corte del día 15: una campaña que arranca después del 15 del mes no
  // cuenta para ese mes por defecto (queda para el que viene), pero se
  // informa igual acá con un tilde para sumarla a este mes si se quiere.
  // Es una decisión de rutina, no un "sacar" destructivo — sin confirm().
  const handleToggleIncluirEsteMes = async (f: LineaLiquidacion, incluir: boolean) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/exclusion`,
        { mes: Number(mes), ano: Number(ano), excluida: !incluir },
        authHeaders(token)
      );
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar la decisión de este mes.'));
    }
  };

  // Mismo tilde que arriba pero para un grupo colapsado de campañas
  // después del día 15 — aplica la misma decisión (incluir/dejar para el
  // mes que viene) a todas las líneas del grupo de una vez.
  const handleToggleIncluirGrupoTardio = async (lineas: LineaLiquidacion[], incluir: boolean) => {
    setError('');
    try {
      for (const l of lineas) {
        await axios.put(
          `/api/liquidaciones/${l.detalle_id}/exclusion`,
          { mes: Number(mes), ano: Number(ano), excluida: !incluir },
          authHeaders(token)
        );
      }
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar la decisión de este mes.'));
    }
  };

  // "Sin cargo" (S/c) y "Canje" — vistos en una liquidación real en vez de un
  // número de pesos. Cuentan como $0 en los totales, pero se muestran
  // distinto en pantalla y en los exports.
  const handleEstadoEspecial = async (f: LineaLiquidacion, estado: EstadoEspecial) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/${f.detalle_id}/estado-especial`,
        { mes: Number(mes), ano: Number(ano), estado_especial: estado },
        authHeaders(token)
      );
      if (estado) setMontosLocal((actual) => ({ ...actual, [f.detalle_id]: '' }));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar el estado de la línea.'));
    }
  };

  const handleAbrirEditarVivo = () => {
    if (!estebanVivo) return;
    setVivoForm({
      comisionVendedor: String(estebanVivo.porcentajes.comision_vendedor),
      canon: String(estebanVivo.porcentajes.canon),
      gastosTop: String(estebanVivo.porcentajes.gastos_top),
      vivo: String(estebanVivo.porcentajes.vivo),
    });
    setEditandoVivo(true);
  };

  const handleGuardarVivo = async () => {
    setError('');
    setGuardandoVivo(true);
    try {
      await axios.put(
        `/api/liquidaciones/condiciones/${concesionarioId}/esteban-vivo`,
        {
          porcentaje_comision_vendedor: Number(vivoForm.comisionVendedor) || 0,
          porcentaje_canon: Number(vivoForm.canon) || 0,
          porcentaje_gastos_top: Number(vivoForm.gastosTop) || 0,
          porcentaje_vivo: Number(vivoForm.vivo) || 0,
        },
        authHeaders(token)
      );
      setEditandoVivo(false);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudieron guardar los % de Esteban Vivo.'));
    } finally {
      setGuardandoVivo(false);
    }
  };

  const handleAgregarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.descripcion.trim()) {
      setError('La descripción de la línea manual es obligatoria.');
      return;
    }
    setAgregandoManual(true);
    setError('');
    try {
      await axios.post(
        '/api/liquidaciones/manual',
        {
          concesionario_id: concesionarioId,
          mes: Number(mes),
          ano: Number(ano),
          descripcion: manualForm.descripcion,
          monto: Number(manualForm.monto) || 0,
          tipo: manualForm.tipo,
        },
        authHeaders(token)
      );
      setManualForm(MANUAL_VACIO);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo agregar la línea manual.'));
    } finally {
      setAgregandoManual(false);
    }
  };

  const handleAbrirEditarManual = (m: LineaManual) => {
    setEditandoManualId(m.id);
    setEditManualForm({ descripcion: m.descripcion, monto: String(m.monto), tipo: m.tipo });
  };

  const handleGuardarEditarManual = async (id: string) => {
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/manual/${id}`,
        { descripcion: editManualForm.descripcion, monto: Number(editManualForm.monto) || 0, tipo: editManualForm.tipo },
        authHeaders(token)
      );
      setEditandoManualId(null);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar la línea manual.'));
    }
  };

  const handleEliminarManual = async (m: LineaManual) => {
    if (!window.confirm(`¿Quitar la línea manual "${m.descripcion}"?`)) return;
    setError('');
    try {
      await axios.delete(`/api/liquidaciones/manual/${m.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la línea manual.'));
    }
  };

  const anosDisponibles = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);

  // Agrupa un conjunto de líneas por anunciante+sección en una sola fila
  // (mismo anunciante, misma orden real partida por fecha o por soporte).
  // Reutilizado tanto para las líneas "limpias" de la solapa Liquidar como
  // para las de "corte del día 15" en su propia solapa.
  const agruparLineas = (lineas: LineaLiquidacion[]) => {
    const mapa = new Map<string, LineaLiquidacion[]>();
    lineas.forEach((f) => {
      const clave = `${f.anunciante}|${f.seccion}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(f);
    });
    return Array.from(mapa.entries())
      .filter(([, ls]) => ls.length > 1)
      .map(([clave, ls]) => {
        const desde = ls.reduce((min, l) => (l.periodo_desde && l.periodo_desde < min ? l.periodo_desde : min), ls[0].periodo_desde);
        const hasta = ls.reduce((max, l) => (l.periodo_hasta && l.periodo_hasta > max ? l.periodo_hasta : max), ls[0].periodo_hasta);
        return {
          clave,
          anunciante: ls[0].anunciante,
          seccion: ls[0].seccion,
          lineas: ls,
          ordenesTexto: Array.from(new Set(ls.map((l) => l.numero_orden_agencia || l.numero_orden))).join(', '),
          vigenciaTexto: `${formatFecha(desde)} – ${formatFecha(hasta)}`,
          elementosTexto: Array.from(new Set(ls.map((l) => `${l.tipo_producto} x ${l.cantidad}`))).join(' + '),
          locacionTexto: Array.from(new Set(ls.map((l) => l.locacion_nombre))).join(' + '),
          montoTotal: ls.reduce((s, l) => s + (Number(l.monto) || 0), 0),
        };
      });
  };

  // Una línea de corte-15 "pendiente" (inicio_tardio && excluida, el default)
  // vive en la solapa nueva. En cuanto se tilda "incluir este mes" pasa a
  // excluida=false y automáticamente se vuelve una línea más acá — no queda
  // separada para siempre, solo mientras la decisión está pendiente.
  const esPendienteCorte15 = (f: LineaLiquidacion) => f.inicio_tardio && f.excluida;

  // Solapa "Liquidar": las pendientes de corte-15 no aparecen acá (tienen su
  // propia solapa). "mostrar excluidas" sigue siendo solo para las sacadas a
  // mano por otro motivo (ej. cliente no pagó).
  const filasVisibles = (filas || []).filter((f) => !esPendienteCorte15(f) && (mostrarExcluidas || !f.excluida));

  // Con "Colapsar" activado, las líneas "limpias" (sin excluir, sin Sin
  // cargo/Canje) del mismo anunciante+sección se muestran juntas en una
  // sola fila con un solo monto — para informar lo que ese anunciante paga
  // por todo concepto, no soporte por soporte (pedido explícito: "el tilde
  // de colapsar también tiene que estar a nivel de cada línea"). Las
  // líneas que necesitan atención especial quedan sueltas para no perder
  // sus controles propios.
  const gruposVisibles = colapsarPorCliente
    ? agruparLineas(filasVisibles.filter((f) => !f.excluida && !f.estado_especial))
    : [];
  const idsEnGrupos = new Set(gruposVisibles.flatMap((g) => g.lineas.map((l) => l.detalle_id)));
  const filasIndividuales = filasVisibles.filter((f) => !idsEnGrupos.has(f.detalle_id));

  // Solapa "Campañas después del día 15": solo las que siguen pendientes de
  // decisión. Se agrupan igual que arriba (misma orden real partida en 2
  // soportes = 1 fila).
  const filasTardias = (filas || []).filter(esPendienteCorte15);
  const gruposTardios = agruparLineas(filasTardias.filter((f) => !f.estado_especial));
  const idsEnGruposTardios = new Set(gruposTardios.flatMap((g) => g.lineas.map((l) => l.detalle_id)));
  const filasTardiasIndividuales = filasTardias.filter((f) => !idsEnGruposTardios.has(f.detalle_id));

  const nombreConcesionario = concesionarios.find((c) => c.id === concesionarioId)?.razon_social || '';
  const direccionConcesionario = concesionarios.find((c) => c.id === concesionarioId)?.direccion || '';

  // Varias "órdenes" seguidas en Colppy suelen ser la misma campaña real con
  // cortes de fecha — mostrar la vigencia evita que el concesionario piense
  // que son campañas distintas. El N° de orden es solo referencia interna:
  // no sale en lo que se exporta para mandarle al concesionario.
  const vigenciaTexto = (f: LineaLiquidacion) =>
    f.periodo_desde || f.periodo_hasta ? `${formatFecha(f.periodo_desde)} – ${formatFecha(f.periodo_hasta)}` : '—';

  const textoMonto = (f: LineaLiquidacion) =>
    f.estado_especial === 'sin_cargo' ? 'S/c' : f.estado_especial === 'canje' ? 'Canje' : formatMoney(f.monto);

  // Una liquidación real agrupa por anunciante (no por línea de soporte ni
  // por orden): "El Cronista | PPL x 10 + CAJA BACK x 2 | ... |
  // $1.684.800,00" es UNA fila aunque venga de varias líneas/órdenes
  // distintas — típicamente el mismo cliente cortado en varias órdenes por
  // fecha (mismo aviso, fragmentado administrativamente). La pantalla de
  // carga queda por línea (así se edita cada soporte por separado); el
  // agrupado es solo para lo que se exporta.
  //
  // Se agrupa por anunciante solo (no exige vigencia exacta): la Vigencia
  // mostrada es el rango completo (desde lo más temprano hasta lo más
  // tardío entre todas las campañas agrupadas), y "Elementos" no repite —
  // si dos campañas tienen el mismo soporte+cantidad, aparece una sola vez;
  // si una campaña tiene algo que las demás no, se agrega esa diferencia.
  const agruparParaExport = (filasSeccion: LineaLiquidacion[]) => {
    if (!colapsarPorCliente) {
      return filasSeccion
        .filter((f) => !f.excluida)
        .map((f) => ({
          anunciante: f.anunciante,
          vigencia: vigenciaTexto(f),
          elementos: `${f.tipo_producto} x ${f.cantidad}`,
          textoMonto: textoMonto(f),
          monto: Number(f.monto) || 0,
        }));
    }
    const grupos = new Map<
      string,
      { anunciante: string; desde: string; hasta: string; elementos: Set<string>; monto: number; estados: Set<string> }
    >();
    filasSeccion
      .filter((f) => !f.excluida)
      .forEach((f) => {
        if (!grupos.has(f.anunciante)) {
          grupos.set(f.anunciante, { anunciante: f.anunciante, desde: f.periodo_desde, hasta: f.periodo_hasta, elementos: new Set(), monto: 0, estados: new Set() });
        }
        const grupo = grupos.get(f.anunciante)!;
        if (f.periodo_desde && f.periodo_desde < grupo.desde) grupo.desde = f.periodo_desde;
        if (f.periodo_hasta && f.periodo_hasta > grupo.hasta) grupo.hasta = f.periodo_hasta;
        grupo.elementos.add(`${f.tipo_producto} x ${f.cantidad}`);
        grupo.monto += Number(f.monto) || 0;
        grupo.estados.add(f.estado_especial || 'monto');
      });
    return Array.from(grupos.values()).map((g) => ({
      anunciante: g.anunciante,
      vigencia: `${formatFecha(g.desde)} – ${formatFecha(g.hasta)}`,
      elementos: Array.from(g.elementos).join(' + '),
      // Si TODAS las líneas del grupo comparten el mismo estado especial, se
      // informa así en vez de "$0,00"; si están mezcladas con líneas con
      // monto real, se muestra la suma (las especiales ya suman $0 solas).
      textoMonto:
        g.estados.size === 1 && g.estados.has('sin_cargo')
          ? 'S/c'
          : g.estados.size === 1 && g.estados.has('canje')
          ? 'Canje'
          : formatMoney(g.monto),
      monto: g.monto,
    }));
  };

  const nombreArchivoExport = (ext: string) =>
    `liquidacion_${(nombreConcesionario || 'concesionario').replace(/\s+/g, '_')}_${NOMBRES_MES[Number(mes) - 1]}_${ano}.${ext}`;

  const handleExportarExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Liquidación');
    ws.columns = [{ width: 30 }, { width: 30 }, { width: 22 }, { width: 20 }];

    ws.addRow([nombreConcesionario]).font = { bold: true, size: 13 };
    if (direccionConcesionario) ws.addRow([`Domicilio: ${direccionConcesionario}`]).font = { bold: true };
    ws.addRow([]);
    ws.addRow(['Período:', `${NOMBRES_MES[Number(mes) - 1]} ${ano}`]);
    if (nota.trim()) ws.addRow(['Nota:', nota.trim()]);
    ws.addRow([]);

    const formatoMoneda = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';

    (['publicidad', 'stand'] as const).forEach((seccionKey) => {
      const filasSeccion = (filas || []).filter((f) => f.seccion === seccionKey);
      const grupos = agruparParaExport(filasSeccion);
      const manualesSeccion = seccionKey === 'publicidad' ? manuales : [];
      if (grupos.length === 0 && manualesSeccion.length === 0) return;

      ws.addRow([`${SECCION_NOMBRE[seccionKey].toUpperCase()}:`]).font = { bold: true };
      const headerRow = ws.addRow(['Anunciante', 'Elementos', 'Vigencia', 'Facturación']);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
      });
      grupos.forEach((g) => {
        const fila = ws.addRow([g.anunciante, g.elementos, g.vigencia, g.textoMonto === formatMoney(g.monto) ? g.monto : g.textoMonto]);
        if (typeof fila.getCell(4).value === 'number') fila.getCell(4).numFmt = formatoMoneda;
      });
      manualesSeccion.forEach((m) => {
        const fila = ws.addRow([`${m.descripcion}${m.tipo === 'resta' ? ' (resta)' : ''}`, '—', '—', m.tipo === 'resta' ? -m.monto : m.monto]);
        fila.getCell(4).numFmt = formatoMoneda;
      });
      const declarado = secciones[seccionKey].declarado;
      const canon = secciones[seccionKey].canon;
      const filaTotal = ws.addRow(['', '', 'TOTAL', declarado]);
      filaTotal.font = { bold: true };
      filaTotal.getCell(4).numFmt = formatoMoneda;
      const filaCanon = ws.addRow(['', '', `CANON ${porcentajeComision}%`, canon]);
      filaCanon.font = { bold: true };
      filaCanon.getCell(4).numFmt = formatoMoneda;
      ws.addRow([]);
    });

    const filaFinal = ws.addRow(['TOTAL FINAL', '', '', totalFinal]);
    filaFinal.font = { bold: true };
    filaFinal.getCell(4).numFmt = formatoMoneda;
    const filaIva = ws.addRow([`IVA (${ivaPorcentaje}%):`, '', '', ivaMonto]);
    filaIva.getCell(4).numFmt = formatoMoneda;
    percepcionesCalculadas.forEach((p) => {
      const filaP = ws.addRow([`${p.nombre} (${p.porcentaje}%)${p.tipo === 'resta' ? ' (resta)' : ''}:`, '', '', p.monto]);
      filaP.getCell(4).numFmt = formatoMoneda;
    });
    const filaPagar = ws.addRow(['TOTAL A PAGAR', '', '', totalAPagar]);
    filaPagar.font = { bold: true };
    filaPagar.getCell(4).numFmt = formatoMoneda;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoExport('xlsx');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(13);
    doc.text(nombreConcesionario, 14, 15);
    doc.setFontSize(10);
    let y = 22;
    if (direccionConcesionario) {
      doc.text(`Domicilio: ${direccionConcesionario}`, 14, y);
      y += 6;
    }
    doc.text(`Período: ${NOMBRES_MES[Number(mes) - 1]} ${ano}`, 14, y);
    y += 6;
    if (nota.trim()) {
      doc.text(`Nota: ${nota.trim()}`, 14, y);
      y += 6;
    }
    y += 2;

    (['publicidad', 'stand'] as const).forEach((seccionKey) => {
      const filasSeccion = (filas || []).filter((f) => f.seccion === seccionKey);
      const grupos = agruparParaExport(filasSeccion);
      const manualesSeccion = seccionKey === 'publicidad' ? manuales : [];
      if (grupos.length === 0 && manualesSeccion.length === 0) return;

      doc.setFontSize(11);
      doc.text(`${SECCION_NOMBRE[seccionKey]}:`, 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Anunciante', 'Elementos', 'Vigencia', 'Facturación']],
        body: [
          ...grupos.map((g) => [g.anunciante, g.elementos, g.vigencia, g.textoMonto]),
          ...manualesSeccion.map((m) => [
            `${m.descripcion}${m.tipo === 'resta' ? ' (resta)' : ''}`,
            '—',
            '—',
            `${m.tipo === 'resta' ? '−' : ''}${formatMoney(m.monto)}`,
          ]),
        ],
        foot: [
          ['', '', 'TOTAL', formatMoney(secciones[seccionKey].declarado)],
          ['', '', `CANON ${porcentajeComision}%`, formatMoney(secciones[seccionKey].canon)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [232, 24, 56] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    });

    autoTable(doc, {
      startY: y,
      body: [
        ['TOTAL FINAL', formatMoney(totalFinal)],
        [`IVA (${ivaPorcentaje}%)`, formatMoney(ivaMonto)],
        ...percepcionesCalculadas.map((p) => [
          `${p.nombre} (${p.porcentaje}%)${p.tipo === 'resta' ? ' (resta)' : ''}`,
          `${p.tipo === 'resta' ? '−' : ''}${formatMoney(Math.abs(p.monto))}`,
        ]),
        ['TOTAL A PAGAR', formatMoney(totalAPagar)],
      ],
      styles: { fontSize: 9, fontStyle: 'bold' },
      theme: 'plain',
    });
    doc.save(nombreArchivoExport('pdf'));
  };

  // Exports de Esteban Vivo van SIEMPRE aparte de los de arriba — nombre de
  // archivo propio, nada del concesionario ni de otro tercero mezclado, para
  // que la comunicación con él quede aislada del resto.
  const nombreArchivoVivo = (ext: string) => `esteban_vivo_${NOMBRES_MES[Number(mes) - 1]}_${ano}.${ext}`;

  const handleExportarVivoExcel = async () => {
    if (!estebanVivo) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Esteban Vivo');
    ws.columns = [
      { header: 'Anunciante', width: 22 },
      { header: 'N° orden', width: 18 },
      { header: 'Declarado', width: 16 },
      { header: `Com. Vendedor ${estebanVivo.porcentajes.comision_vendedor}%`, width: 18 },
      { header: 'Neto 1', width: 16 },
      { header: `Canon ${estebanVivo.porcentajes.canon}%`, width: 16 },
      { header: 'Neto 2', width: 16 },
      { header: `Gastos Top ${estebanVivo.porcentajes.gastos_top}%`, width: 16 },
      { header: 'Neto 3', width: 16 },
      { header: `Com Vivo ${estebanVivo.porcentajes.vivo}%`, width: 16 },
    ];
    const formatoMoneda = '_-"$"* #,##0.00_-;_-"$"* \\-#,##0.00_-;_-"$"* "-"??_-;_-@';
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
    });
    estebanVivo.lineas.forEach((l) => {
      const fila = ws.addRow([
        l.anunciante,
        l.numero_orden,
        l.declarado,
        l.comision_vendedor,
        l.neto1,
        l.canon,
        l.neto2,
        l.gastos_top,
        l.neto3,
        l.com_vivo,
      ]);
      for (let i = 3; i <= 10; i++) fila.getCell(i).numFmt = formatoMoneda;
    });
    const filaTotal = ws.addRow(['TOTAL A PAGAR', '', '', '', '', '', '', '', '', estebanVivo.total_a_pagar]);
    filaTotal.font = { bold: true };
    filaTotal.getCell(10).numFmt = formatoMoneda;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoVivo('xlsx');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportarVivoPDF = () => {
    if (!estebanVivo) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text('Esteban Vivo', 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${NOMBRES_MES[Number(mes) - 1]} ${ano}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [
        [
          'Anunciante',
          'N° orden',
          'Declarado',
          `Com. Vendedor ${estebanVivo.porcentajes.comision_vendedor}%`,
          'Neto 1',
          `Canon ${estebanVivo.porcentajes.canon}%`,
          'Neto 2',
          `Gastos Top ${estebanVivo.porcentajes.gastos_top}%`,
          'Neto 3',
          `Com Vivo ${estebanVivo.porcentajes.vivo}%`,
        ],
      ],
      body: [
        ...estebanVivo.lineas.map((l) => [
          l.anunciante,
          l.numero_orden,
          formatMoney(l.declarado),
          formatMoney(l.comision_vendedor),
          formatMoney(l.neto1),
          formatMoney(l.canon),
          formatMoney(l.neto2),
          formatMoney(l.gastos_top),
          formatMoney(l.neto3),
          formatMoney(l.com_vivo),
        ]),
      ],
      foot: [['', '', '', '', '', '', '', '', 'TOTAL A PAGAR', formatMoney(estebanVivo.total_a_pagar)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [232, 24, 56] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    });
    doc.save(nombreArchivoVivo('pdf'));
  };

  return (
    <>
      <div className="view-header">
        <h3 className="reportes-subtitulo" style={{ margin: 0 }}>
          Liquidaciones a concesionarios
        </h3>
      </div>

      <div className="reportes-tabs" style={{ marginBottom: '1rem' }}>
        <button
          className={`reportes-tab ${vista === 'liquidar' ? 'active' : ''}`}
          onClick={() => setVista('liquidar')}
        >
          Liquidar
        </button>
        <button
          className={`reportes-tab ${vista === 'tardias' ? 'active' : ''}`}
          onClick={() => setVista('tardias')}
        >
          Después del día 15{filas ? ` (${filasTardias.length})` : ''}
        </button>
        {puedeCargar && (
          <button
            className={`reportes-tab ${vista === 'condiciones' ? 'active' : ''}`}
            onClick={() => setVista('condiciones')}
          >
            Canon por concesionario
          </button>
        )}
      </div>

      {vista === 'condiciones' && puedeCargar ? (
        <CondicionesConcesionarioTab token={token} />
      ) : (
        <>
          <p className="totales-preview" style={{ marginTop: 0 }}>
            {vista === 'tardias'
              ? 'Campañas cuyo inicio real fue después del día 15 del mes — por defecto quedan para la liquidación del mes que viene. Tildá "Incluir" si corresponde sumarlas igual a este período; en cuanto se incluyen pasan a la solapa Liquidar como una línea más.'
              : 'Cantidad, locación y posición se toman de la orden real. El monto NO se calcula de lo que le cobramos al anunciante — no tiene relación fija — se carga a mano por línea y por mes, y queda guardado para siempre en ese período.'}
          </p>

          {error && <div className="error-message">{error}</div>}

          <div className="filtros-fila" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
            <label>
              Concesionario
              <select value={concesionarioId} onChange={(e) => setConcesionarioId(e.target.value)}>
                <option value="">Elegir...</option>
                {concesionarios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mes
              <select value={mes} onChange={(e) => setMes(e.target.value)}>
                {NOMBRES_MES.map((nombre, i) => (
                  <option key={i + 1} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Año
              <select value={ano} onChange={(e) => setAno(e.target.value)}>
                {anosDisponibles.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!concesionarioId && <p className="empty-state">Elegí un concesionario para ver sus campañas del período.</p>}
          {concesionarioId && filas === null && !error && <p className="empty-state">Cargando...</p>}
          {concesionarioId && filas && vista === 'liquidar' && filasVisibles.length === 0 && manuales.length === 0 && !error && (
            <p className="empty-state">
              {nombreConcesionario} no tiene campañas activas en {NOMBRES_MES[Number(mes) - 1]} {ano}.
            </p>
          )}
          {concesionarioId && filas && vista === 'tardias' && filasTardias.length === 0 && !error && (
            <p className="empty-state">
              {nombreConcesionario} no tiene campañas pendientes de decisión después del día 15 en{' '}
              {NOMBRES_MES[Number(mes) - 1]} {ano}.
            </p>
          )}

          {vista === 'liquidar' && filas && (filasVisibles.length > 0 || manuales.length > 0) && (
            <>
              <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" onClick={handleExportarExcel}>
                  Exportar Excel
                </button>
                <button type="button" className="btn-secondary" onClick={handleExportarPDF}>
                  Exportar PDF
                </button>
                {filas.some((f) => f.excluida && !f.inicio_tardio) && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal' }}>
                    <input type="checkbox" checked={mostrarExcluidas} onChange={(e) => setMostrarExcluidas(e.target.checked)} />
                    Mostrar líneas sacadas ({filas.filter((f) => f.excluida && !f.inicio_tardio).length})
                  </label>
                )}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.8rem' }}>
                <input type="checkbox" checked={colapsarPorCliente} onChange={(e) => setColapsarPorCliente(e.target.checked)} />
                Colapsar campañas del mismo cliente (acá y al exportar) — junta las órdenes cortadas por fecha en
                una sola fila con un solo monto, sin repetir soportes. Las líneas excluidas o marcadas Sin
                cargo/Canje quedan sueltas.
              </label>
              <label style={{ display: 'block', marginBottom: '0.8rem' }}>
                Nota para el export (opcional)
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Se imprime al pie del documento exportado"
                  style={{ width: '100%' }}
                />
              </label>
              <p className="totales-preview" style={{ marginTop: 0 }}>
                El N° de orden es solo referencia interna (varias órdenes seguidas suelen ser la misma campaña con
                cortes de fecha) — no sale en lo exportado, ahí se agrupa por anunciante como en la liquidación real.
              </p>
              <table className="data-table" style={{ marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th>Anunciante / concepto</th>
                    <th>N° orden</th>
                    <th>Sección</th>
                    <th>Vigencia</th>
                    <th>Producto</th>
                    <th>Locación</th>
                    <th>Posición</th>
                    <th>Cantidad</th>
                    <th>Monto liquidado</th>
                    {puedeCargar && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {gruposVisibles.map((g) => (
                    <tr key={g.clave} style={{ background: '#f0f7ff' }}>
                      <td>{g.anunciante}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {onVerOrden
                          ? Array.from(new Map(g.lineas.map((l) => [l.orden_id, l.numero_orden_agencia || l.numero_orden])).entries()).map(
                              ([ordenId, numero], i, arr) => (
                                <span key={ordenId}>
                                  <button type="button" className="btn-link" onClick={() => onVerOrden(ordenId)}>
                                    {numero}
                                  </button>
                                  {i < arr.length - 1 ? ', ' : ''}
                                </span>
                              )
                            )
                          : g.ordenesTexto}
                      </td>
                      <td>{SECCION_NOMBRE[g.seccion]}</td>
                      <td>{g.vigenciaTexto}</td>
                      <td>{g.elementosTexto}</td>
                      <td>{g.locacionTexto}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>
                        {puedeCargar ? (
                          <InputMiles
                            value={montosGrupoLocal[g.clave] ?? String(g.montoTotal || '')}
                            onChange={(v) => setMontosGrupoLocal((actual) => ({ ...actual, [g.clave]: v }))}
                            onBlur={() => handleGuardarMontoGrupo(g.clave, g.lineas, Number(montosGrupoLocal[g.clave] ?? g.montoTotal) || 0)}
                            style={{ width: '9rem', textAlign: 'right' }}
                          />
                        ) : (
                          formatMoney(g.montoTotal)
                        )}
                      </td>
                      {puedeCargar && (
                        <td style={{ fontSize: '0.85rem', color: 'var(--color-exito, #2e7d32)' }}>
                          {g.lineas.some((l) => l.detalle_id === guardandoId)
                            ? 'Guardando...'
                            : g.lineas.some((l) => l.detalle_id === guardadoId)
                            ? 'Guardado ✓'
                            : ''}
                        </td>
                      )}
                    </tr>
                  ))}
                  {filasIndividuales.map((f) => (
                    <tr key={f.detalle_id} style={f.excluida ? { opacity: 0.5 } : undefined}>
                        <td>{f.anunciante}</td>
                        <td>
                          {onVerOrden ? (
                            <button type="button" className="btn-link" onClick={() => onVerOrden(f.orden_id)}>
                              {f.numero_orden_agencia || f.numero_orden}
                            </button>
                          ) : (
                            f.numero_orden_agencia || f.numero_orden
                          )}
                        </td>
                        <td>{SECCION_NOMBRE[f.seccion]}</td>
                        <td>{vigenciaTexto(f)}</td>
                        <td>{f.tipo_producto}</td>
                        <td>{f.locacion_nombre}</td>
                        <td>{f.punto_instalacion || '—'}</td>
                        <td>{f.cantidad}</td>
                        <td>
                          {puedeCargar ? (
                            <>
                              <select
                                value={f.estado_especial || ''}
                                onChange={(e) => handleEstadoEspecial(f, (e.target.value || null) as EstadoEspecial)}
                                style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.8rem' }}
                              >
                                <option value="">$</option>
                                <option value="sin_cargo">Sin cargo</option>
                                <option value="canje">Canje</option>
                              </select>
                              {!f.estado_especial && (
                                <InputMiles
                                  value={montosLocal[f.detalle_id] ?? ''}
                                  onChange={(v) => setMontosLocal((actual) => ({ ...actual, [f.detalle_id]: v }))}
                                  onBlur={() => handleGuardarMonto(f.detalle_id)}
                                  style={{ width: '9rem', textAlign: 'right' }}
                                />
                              )}
                            </>
                          ) : (
                            textoMonto(f)
                          )}
                        </td>
                        {puedeCargar && (
                          <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                            {f.excluida ? (
                              <button type="button" className="btn-link" onClick={() => handleRestaurar(f)}>
                                Restaurar
                              </button>
                            ) : (
                              <>
                                <span style={{ color: 'var(--color-exito, #2e7d32)', marginRight: '0.5rem' }}>
                                  {guardandoId === f.detalle_id ? 'Guardando...' : guardadoId === f.detalle_id ? 'Guardado ✓' : ''}
                                </span>
                                <button type="button" className="btn-link btn-link-danger" onClick={() => handleExcluir(f)}>
                                  Quitar
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                  ))}
                  {manuales.map((m) => (
                    <tr key={m.id} style={{ fontStyle: 'italic' }}>
                      {editandoManualId === m.id ? (
                        <>
                          <td colSpan={8}>
                            <input
                              type="text"
                              value={editManualForm.descripcion}
                              onChange={(e) => setEditManualForm((f) => ({ ...f, descripcion: e.target.value }))}
                              placeholder="Descripción"
                              style={{ width: '100%' }}
                            />
                          </td>
                          <td>
                            <InputMiles
                              value={editManualForm.monto}
                              onChange={(v) => setEditManualForm((f) => ({ ...f, monto: v }))}
                              style={{ width: '9rem', textAlign: 'right' }}
                            />
                            <label style={{ display: 'block', fontWeight: 'normal', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={editManualForm.tipo === 'resta'}
                                onChange={(e) => setEditManualForm((f) => ({ ...f, tipo: e.target.checked ? 'resta' : 'suma' }))}
                              />{' '}
                              Resta del Canon
                            </label>
                          </td>
                          {puedeCargar && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button type="button" className="btn-link" onClick={() => handleGuardarEditarManual(m.id)} style={{ marginRight: '0.5rem' }}>
                                Guardar
                              </button>
                              <button type="button" className="btn-link" onClick={() => setEditandoManualId(null)}>
                                Cancelar
                              </button>
                            </td>
                          )}
                        </>
                      ) : (
                        <>
                          <td colSpan={8}>
                            {m.descripcion} (línea manual, Publicidad{m.tipo === 'resta' ? ' — resta del Canon' : ''})
                          </td>
                          <td style={m.tipo === 'resta' ? { color: 'var(--color-peligro, #c62828)' } : undefined}>
                            {m.tipo === 'resta' ? '−' : ''}
                            {formatMoney(m.monto)}
                          </td>
                          {puedeCargar && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button type="button" className="btn-link" onClick={() => handleAbrirEditarManual(m)} style={{ marginRight: '0.5rem' }}>
                                Editar
                              </button>
                              <button type="button" className="btn-link btn-link-danger" onClick={() => handleEliminarManual(m)}>
                                Quitar
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {puedeCargar && (
                <form onSubmit={handleAgregarManual} className="linea-factura" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', marginBottom: '1rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Descripción (ajuste, gasto compartido, diferencia de un mes anterior, etc.)"
                    value={manualForm.descripcion}
                    onChange={(e) => setManualForm((f) => ({ ...f, descripcion: e.target.value }))}
                  />
                  <InputMiles
                    placeholder="Monto ($, siempre positivo)"
                    value={manualForm.monto}
                    onChange={(v) => setManualForm((f) => ({ ...f, monto: v }))}
                  />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal' }}>
                    <input
                      type="checkbox"
                      checked={manualForm.tipo === 'resta'}
                      onChange={(e) => setManualForm((f) => ({ ...f, tipo: e.target.checked ? 'resta' : 'suma' }))}
                    />
                    Resta del Canon
                  </label>
                  <button type="submit" className="btn-secondary" disabled={agregandoManual}>
                    + Agregar línea manual
                  </button>
                </form>
              )}

              <table className="data-table" style={{ maxWidth: '32rem', marginLeft: 'auto' }}>
                <tbody>
                  {/* Publicidad y Stand se muestran por separado solo cuando la
                      liquidación realmente tiene líneas de esa sección — si no
                      hay Stand, mostrar "Stand — Declarado $0,00" es ruido que
                      no corresponde a ningún concepto real de esta liquidación. */}
                  {((filas && filas.some((f) => f.seccion === 'publicidad')) || manuales.length > 0) && (
                    <>
                      <tr>
                        <td>Publicidad — Declarado</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(secciones.publicidad.declarado)}</td>
                      </tr>
                      <tr>
                        <td>Publicidad — Canon {porcentajeComision}%</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(secciones.publicidad.canon)}</td>
                      </tr>
                    </>
                  )}
                  {filas && filas.some((f) => f.seccion === 'stand') && (
                    <>
                      <tr>
                        <td>Stand — Declarado</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(secciones.stand.declarado)}</td>
                      </tr>
                      <tr>
                        <td>Stand — Canon {porcentajeComision}%</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(secciones.stand.canon)}</td>
                      </tr>
                    </>
                  )}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total Final</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(totalFinal)}</td>
                  </tr>
                  <tr>
                    <td>IVA ({ivaPorcentaje}%)</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(ivaMonto)}</td>
                  </tr>
                  {percepcionesCalculadas.map((p) => (
                    <tr key={p.nombre}>
                      <td>
                        {p.nombre} ({p.porcentaje}%){p.tipo === 'resta' ? ' — resta del Canon' : ''}
                      </td>
                      <td style={{ textAlign: 'right', color: p.tipo === 'resta' ? 'var(--color-peligro, #c62828)' : undefined }}>
                        {p.tipo === 'resta' ? '−' : ''}
                        {formatMoney(Math.abs(p.monto))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    <td>Total a Pagar</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(totalAPagar)}</td>
                  </tr>
                </tbody>
              </table>

              {estebanVivo && (
                <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '3px double #ccc' }}>
                  <h3 className="reportes-subtitulo">Esteban Vivo</h3>
                  <p className="totales-preview" style={{ marginTop: 0 }}>
                    Comisión propia de Esteban Vivo sobre esta liquidación — cascada independiente del Canon de
                    arriba (Comisión Vendedor {estebanVivo.porcentajes.comision_vendedor}% → Canon{' '}
                    {estebanVivo.porcentajes.canon}% → Gastos Top {estebanVivo.porcentajes.gastos_top}% → Com Vivo{' '}
                    {estebanVivo.porcentajes.vivo}%). Esta sección es solo para él: no forma parte de lo que se le
                    liquida al concesionario y no se le muestra a nadie más.
                  </p>

                  {puedeCargar && !editandoVivo && (
                    <button type="button" className="btn-link" onClick={handleAbrirEditarVivo} style={{ marginBottom: '0.8rem' }}>
                      Editar %
                    </button>
                  )}
                  {puedeCargar && editandoVivo && (
                    <div
                      className="linea-factura"
                      style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto', marginBottom: '0.8rem', maxWidth: '40rem' }}
                    >
                      <InputPorcentaje
                        placeholder="Com. Vendedor %"
                        value={vivoForm.comisionVendedor}
                        onChange={(v) => setVivoForm((f) => ({ ...f, comisionVendedor: v }))}
                        disabled={guardandoVivo}
                      />
                      <InputPorcentaje
                        placeholder="Canon %"
                        value={vivoForm.canon}
                        onChange={(v) => setVivoForm((f) => ({ ...f, canon: v }))}
                        disabled={guardandoVivo}
                      />
                      <InputPorcentaje
                        placeholder="Gastos Top %"
                        value={vivoForm.gastosTop}
                        onChange={(v) => setVivoForm((f) => ({ ...f, gastosTop: v }))}
                        disabled={guardandoVivo}
                      />
                      <InputPorcentaje
                        placeholder="Com Vivo %"
                        value={vivoForm.vivo}
                        onChange={(v) => setVivoForm((f) => ({ ...f, vivo: v }))}
                        disabled={guardandoVivo}
                      />
                      <button type="button" className="btn-secondary" onClick={handleGuardarVivo} disabled={guardandoVivo}>
                        {guardandoVivo ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" className="btn-link" onClick={() => setEditandoVivo(false)} disabled={guardandoVivo}>
                        Cancelar
                      </button>
                    </div>
                  )}

                  {estebanVivo.lineas.length === 0 ? (
                    <p className="empty-state">Sin campañas declaradas en este período.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
                        <button type="button" className="btn-secondary" onClick={handleExportarVivoExcel}>
                          Exportar Excel (Esteban Vivo)
                        </button>
                        <button type="button" className="btn-secondary" onClick={handleExportarVivoPDF}>
                          Exportar PDF (Esteban Vivo)
                        </button>
                      </div>
                      <table className="data-table" style={{ marginBottom: '1rem' }}>
                        <thead>
                          <tr>
                            <th>Anunciante</th>
                            <th>N° orden</th>
                            <th>Declarado</th>
                            <th>Com. Vendedor {estebanVivo.porcentajes.comision_vendedor}%</th>
                            <th>Neto 1</th>
                            <th>Canon {estebanVivo.porcentajes.canon}%</th>
                            <th>Neto 2</th>
                            <th>Gastos Top {estebanVivo.porcentajes.gastos_top}%</th>
                            <th>Neto 3</th>
                            <th>Com Vivo {estebanVivo.porcentajes.vivo}%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {estebanVivo.lineas.map((l) => (
                            <tr key={`${l.numero_orden}-${l.anunciante}`}>
                              <td>{l.anunciante}</td>
                              <td>{l.numero_orden}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.declarado)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.comision_vendedor)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.neto1)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.canon)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.neto2)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.gastos_top)}</td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(l.neto3)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(l.com_vivo)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                            <td colSpan={9}>Total a Pagar a Esteban Vivo</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(estebanVivo.total_a_pagar)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {vista === 'tardias' && filas && filasTardias.length > 0 && (
            <table className="data-table" style={{ marginBottom: '1rem' }}>
              <thead>
                <tr>
                  <th>Anunciante / concepto</th>
                  <th>N° orden</th>
                  <th>Sección</th>
                  <th>Vigencia</th>
                  <th>Producto</th>
                  <th>Locación</th>
                  <th>Posición</th>
                  <th>Cantidad</th>
                  <th>Monto liquidado</th>
                  {puedeCargar && <th>Incluir en {NOMBRES_MES[Number(mes) - 1]}</th>}
                </tr>
              </thead>
              <tbody>
                {gruposTardios.map((g) => (
                  <tr key={g.clave} style={{ background: '#fff8e1' }}>
                    <td>{g.anunciante}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {onVerOrden
                        ? Array.from(new Map(g.lineas.map((l) => [l.orden_id, l.numero_orden_agencia || l.numero_orden])).entries()).map(
                            ([ordenId, numero], i, arr) => (
                              <span key={ordenId}>
                                <button type="button" className="btn-link" onClick={() => onVerOrden(ordenId)}>
                                  {numero}
                                </button>
                                {i < arr.length - 1 ? ', ' : ''}
                              </span>
                            )
                          )
                        : g.ordenesTexto}
                    </td>
                    <td>{SECCION_NOMBRE[g.seccion]}</td>
                    <td>{g.vigenciaTexto}</td>
                    <td>{g.elementosTexto}</td>
                    <td>{g.locacionTexto}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      {puedeCargar ? (
                        <InputMiles
                          value={montosGrupoLocal[g.clave] ?? String(g.montoTotal || '')}
                          onChange={(v) => setMontosGrupoLocal((actual) => ({ ...actual, [g.clave]: v }))}
                          onBlur={() => handleGuardarMontoGrupo(g.clave, g.lineas, Number(montosGrupoLocal[g.clave] ?? g.montoTotal) || 0)}
                          style={{ width: '9rem', textAlign: 'right' }}
                        />
                      ) : (
                        formatMoney(g.montoTotal)
                      )}
                    </td>
                    {puedeCargar && (
                      <td style={{ fontSize: '0.85rem' }}>
                        <label style={{ fontWeight: 'normal' }}>
                          <input
                            type="checkbox"
                            checked={g.lineas.every((l) => !l.excluida)}
                            onChange={(e) => handleToggleIncluirGrupoTardio(g.lineas, e.target.checked)}
                          />{' '}
                          Incluir
                        </label>
                      </td>
                    )}
                  </tr>
                ))}
                {filasTardiasIndividuales.map((f) => (
                  <tr key={f.detalle_id}>
                    <td>{f.anunciante}</td>
                    <td>
                      {onVerOrden ? (
                        <button type="button" className="btn-link" onClick={() => onVerOrden(f.orden_id)}>
                          {f.numero_orden_agencia || f.numero_orden}
                        </button>
                      ) : (
                        f.numero_orden_agencia || f.numero_orden
                      )}
                    </td>
                    <td>{SECCION_NOMBRE[f.seccion]}</td>
                    <td>{vigenciaTexto(f)}</td>
                    <td>{f.tipo_producto}</td>
                    <td>{f.locacion_nombre}</td>
                    <td>{f.punto_instalacion || '—'}</td>
                    <td>{f.cantidad}</td>
                    <td>
                      {puedeCargar ? (
                        <>
                          <select
                            value={f.estado_especial || ''}
                            onChange={(e) => handleEstadoEspecial(f, (e.target.value || null) as EstadoEspecial)}
                            style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.8rem' }}
                          >
                            <option value="">$</option>
                            <option value="sin_cargo">Sin cargo</option>
                            <option value="canje">Canje</option>
                          </select>
                          {!f.estado_especial && (
                            <InputMiles
                              value={montosLocal[f.detalle_id] ?? ''}
                              onChange={(v) => setMontosLocal((actual) => ({ ...actual, [f.detalle_id]: v }))}
                              onBlur={() => handleGuardarMonto(f.detalle_id)}
                              style={{ width: '9rem', textAlign: 'right' }}
                            />
                          )}
                        </>
                      ) : (
                        textoMonto(f)
                      )}
                    </td>
                    {puedeCargar && (
                      <td style={{ fontSize: '0.85rem' }}>
                        <label style={{ fontWeight: 'normal' }}>
                          <input
                            type="checkbox"
                            checked={!f.excluida}
                            onChange={(e) => handleToggleIncluirEsteMes(f, e.target.checked)}
                          />{' '}
                          Incluir
                        </label>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

interface Percepcion {
  id: string;
  concesionario_id: string;
  nombre: string;
  porcentaje: number;
  tipo: 'suma' | 'resta';
}

interface CondicionConcesionario {
  concesionario_id: string;
  razon_social: string;
  porcentaje_comision: number;
  iva_porcentaje: number;
  notas: string | null;
  percepciones: Percepcion[];
}

// Solapa chica dentro de Liquidaciones (no una pantalla aparte) para que el
// % de cada concesionario quede bajo el mismo permiso Administrador que el
// resto de los datos financieros de acá — pedido explícito del usuario:
// "cada concesionario tiene su propio % de comisión sobre lo que
// declaramos... debería haber una solapa para cargar las condiciones."
// En pantalla se llama "Canon" (no "Comisión") para no confundirlo con la
// comisión de los comisionistas/intermediarios, que es otro módulo — el
// nombre interno (porcentaje_comision, condiciones_concesionario) quedó
// igual, es solo un cambio de rótulo.
function CondicionesConcesionarioTab({ token }: { token: string }) {
  const [condiciones, setCondiciones] = useState<CondicionConcesionario[] | null>(null);
  const [error, setError] = useState('');
  const [valoresLocal, setValoresLocal] = useState<Record<string, { canon: string; iva: string }>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [percepcionForm, setPercepcionForm] = useState({ nombre: '', porcentaje: '', tipo: 'suma' as 'suma' | 'resta' });

  const cargar = () => {
    setError('');
    setCondiciones(null);
    axios
      .get('/api/liquidaciones/condiciones', authHeaders(token))
      .then((res) => {
        const data: CondicionConcesionario[] = res.data || [];
        setCondiciones(data);
        const iniciales: Record<string, { canon: string; iva: string }> = {};
        data.forEach((c) => {
          iniciales[c.concesionario_id] = { canon: String(c.porcentaje_comision), iva: String(c.iva_porcentaje) };
        });
        setValoresLocal(iniciales);
      })
      .catch((err) => {
        setError(mensajeError(err, 'No se pudieron cargar las condiciones.'));
        setCondiciones([]);
      });
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGuardar = async (concesionarioId: string) => {
    const valores = valoresLocal[concesionarioId];
    const canon = Number(valores?.canon);
    const iva = Number(valores?.iva);
    if (isNaN(canon) || canon < 0 || isNaN(iva) || iva < 0) {
      setError('El % de Canon y el % de IVA tienen que ser números mayores o iguales a 0.');
      return;
    }
    setGuardandoId(concesionarioId);
    setError('');
    try {
      await axios.put(
        `/api/liquidaciones/condiciones/${concesionarioId}`,
        { porcentaje_comision: canon, iva_porcentaje: iva },
        authHeaders(token)
      );
      setGuardadoId(concesionarioId);
      setTimeout(() => setGuardadoId((actual) => (actual === concesionarioId ? null : actual)), 1500);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo guardar.'));
    } finally {
      setGuardandoId(null);
    }
  };

  const handleAgregarPercepcion = async (e: React.FormEvent, concesionarioId: string) => {
    e.preventDefault();
    if (!percepcionForm.nombre.trim()) {
      setError('El nombre de la percepción es obligatorio.');
      return;
    }
    setError('');
    try {
      await axios.post(
        `/api/liquidaciones/condiciones/${concesionarioId}/percepciones`,
        { nombre: percepcionForm.nombre, porcentaje: Number(percepcionForm.porcentaje) || 0, tipo: percepcionForm.tipo },
        authHeaders(token)
      );
      setPercepcionForm({ nombre: '', porcentaje: '', tipo: 'suma' });
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo agregar la percepción.'));
    }
  };

  const handleEliminarPercepcion = async (p: Percepcion) => {
    if (!window.confirm(`¿Quitar la percepción "${p.nombre}"?`)) return;
    setError('');
    try {
      await axios.delete(`/api/liquidaciones/condiciones/percepciones/${p.id}`, authHeaders(token));
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, 'No se pudo quitar la percepción.'));
    }
  };

  return (
    <>
      <p className="totales-preview" style={{ marginTop: 0 }}>
        El % de Canon se aplica sobre el total declarado de cada sección (Publicidad/Stand) para dar el Total Final.
        Sobre ese Total Final se calculan el IVA y las percepciones (ej. IIBB) de cada concesionario, hasta llegar al
        Total a Pagar. Sin cargar = Canon 100%, IVA 21%, sin percepciones.
      </p>
      {error && <div className="error-message">{error}</div>}
      {condiciones === null && !error && <p className="empty-state">Cargando...</p>}
      {condiciones && condiciones.length === 0 && !error && (
        <p className="empty-state">Todavía no hay concesionarios reales cargados en Locaciones.</p>
      )}
      {condiciones && condiciones.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Concesionario</th>
              <th>% de Canon</th>
              <th>% de IVA</th>
              <th>Percepciones</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {condiciones.map((c) => (
              <Fragment key={c.concesionario_id}>
                <tr>
                  <td>{c.razon_social}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={valoresLocal[c.concesionario_id]?.canon ?? ''}
                      onChange={(e) =>
                        setValoresLocal((actual) => ({
                          ...actual,
                          [c.concesionario_id]: { ...actual[c.concesionario_id], canon: e.target.value },
                        }))
                      }
                      style={{ width: '5rem' }}
                    />{' '}
                    %
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={valoresLocal[c.concesionario_id]?.iva ?? ''}
                      onChange={(e) =>
                        setValoresLocal((actual) => ({
                          ...actual,
                          [c.concesionario_id]: { ...actual[c.concesionario_id], iva: e.target.value },
                        }))
                      }
                      style={{ width: '5rem' }}
                    />{' '}
                    %
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {c.percepciones.length === 0
                      ? '—'
                      : c.percepciones
                          .map((p) => `${p.nombre} ${p.porcentaje}%${p.tipo === 'resta' ? ' (resta)' : ''}`)
                          .join(', ')}
                  </td>
                  <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn-link" onClick={() => handleGuardar(c.concesionario_id)} style={{ marginRight: '0.5rem' }}>
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setExpandidoId((actual) => (actual === c.concesionario_id ? null : c.concesionario_id))}
                    >
                      {expandidoId === c.concesionario_id ? 'Cerrar' : 'Percepciones'}
                    </button>{' '}
                    <span style={{ color: 'var(--color-exito, #2e7d32)' }}>
                      {guardandoId === c.concesionario_id ? 'Guardando...' : guardadoId === c.concesionario_id ? 'Guardado ✓' : ''}
                    </span>
                  </td>
                </tr>
                {expandidoId === c.concesionario_id && (
                  <tr>
                    <td colSpan={5} style={{ background: '#fafafa' }}>
                      {c.percepciones.length > 0 && (
                        <ul style={{ margin: '0.4rem 0' }}>
                          {c.percepciones.map((p) => (
                            <li key={p.id} style={p.tipo === 'resta' ? { color: 'var(--color-peligro, #c62828)' } : undefined}>
                              {p.nombre}: {p.porcentaje}%{p.tipo === 'resta' ? ' (resta del Canon — ej. tasas municipales)' : ' (suma — ej. IIBB)'}{' '}
                              <button type="button" className="btn-link btn-link-danger" onClick={() => handleEliminarPercepcion(p)}>
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form
                        onSubmit={(e) => handleAgregarPercepcion(e, c.concesionario_id)}
                        className="linea-factura"
                        style={{ gridTemplateColumns: '2fr 1fr 1fr auto', maxWidth: '38rem', alignItems: 'center' }}
                      >
                        <input
                          type="text"
                          placeholder="Nombre (ej. Perc IIBB CABA, Tasa municipal)"
                          value={percepcionForm.nombre}
                          onChange={(e) => setPercepcionForm((f) => ({ ...f, nombre: e.target.value }))}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="%"
                          value={percepcionForm.porcentaje}
                          onChange={(e) => setPercepcionForm((f) => ({ ...f, porcentaje: e.target.value }))}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={percepcionForm.tipo === 'resta'}
                            onChange={(e) => setPercepcionForm((f) => ({ ...f, tipo: e.target.checked ? 'resta' : 'suma' }))}
                          />
                          Resta del Canon
                        </label>
                        <button type="submit" className="btn-secondary">
                          + Agregar
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default LiquidacionesTab;
