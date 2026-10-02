import { dbAll, dbGet, dbRun } from '../dbHelpers';
import { AsanaConfigService } from './asanaConfig';
import { compararLineasPorSoporte } from './calculosTopview';

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

// GIDs fijos de los 3 usuarios responsables (workspace topview.com.ar) — la
// tarea principal y cada subtarea siempre se asignan a la misma persona,
// sin importar la orden.
const ASIGNADO_TRAFICO = '1203107710323832'; // trafico@topview.com.ar
const ASIGNADO_OPERACIONES = '1203119091840060'; // operaciones@topview.com.ar
const ASIGNADO_ADMINISTRACION = '1203119042662425'; // administracion@topview.com.ar

interface OrdenAsana {
  nombre_anunciante: string;
  numero_orden_agencia: string | null;
  tipo_anunciante: string;
  periodo_desde: string;
  periodo_hasta: string;
  mes_ingreso: number | null;
  ano_ingreso: number | null;
  vigencia_hasta_mes: number | null;
  vigencia_hasta_ano: number | null;
  vigencia_hasta_nota: string | null;
  facturado: number | null;
}

interface DetalleAsana {
  tipo_producto: string | null;
  cantidad: number;
  punto_instalacion: string | null;
  ubicacion: string | null;
  locacion_nombre: string | null;
}

interface MesOrden {
  mes_ingreso: number | null;
  ano_ingreso: number | null;
}

interface TareaVinculada extends MesOrden {
  asana_task_gid: string | null;
}

interface RespuestaAsana<T> {
  data: T;
}

interface SubtareaAsana {
  gid: string;
  name: string;
}

const mensajeDe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface TareaAsana {
  nombreMes: string;
  name: string;
  notes: string;
  generaFacturacion: boolean;
}

interface ResultadoGeneracion {
  ordenId: string;
  mes?: number;
  ano?: number;
  gid?: string;
  url?: string;
  yaExistia?: boolean;
  error?: string;
}

interface ResultadoBorrado {
  ordenId: string;
  mes?: number;
  ano?: number;
  borrada: boolean;
  error?: string;
}

interface ResultadoAsignacion {
  ordenId: string;
  mes?: number;
  ano?: number;
  error?: string;
}

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// Asana a veces responde 429/5xx (ej. 504 "Server timed out") en llamadas
// que sí se pueden repetir sin riesgo (PUT/GET/DELETE/addTask). Se reintenta
// con espera creciente antes de dar el error. NO usar en POST que crean cosas
// nuevas (una tarea que dio 504 pudo haberse creado igual y duplicaría).
async function fetchReintentando(url: string, init?: RequestInit, intentos = 4): Promise<Response> {
  let resp = await fetch(url, init);
  for (let i = 1; i < intentos && (resp.status === 429 || resp.status >= 500); i++) {
    await new Promise((r) => setTimeout(r, i * 1500));
    resp = await fetch(url, init);
  }
  return resp;
}

export class AsanaService {
  /**
   * Arma el contenido de la tarea (nombre + cuerpo) a partir de los datos de
   * la orden que ve el anunciante — nunca datos internos (comisiones,
   * descuentos, número de orden interno OPB-...).
   */
  static async construirTarea(ordenId: string): Promise<TareaAsana> {
    const orden = await dbGet<OrdenAsana>('SELECT * FROM ordenes_publicidad WHERE id = ?', [ordenId]);
    if (!orden) throw new Error('Orden no encontrada.');

    const detalles = await dbAll<DetalleAsana>(
      `SELECT d.*, l.nombre as locacion_nombre FROM ordenes_publicidad_detalles d
       LEFT JOIN locaciones l ON l.id = d.locacion_id
       WHERE d.orden_id = ?`,
      [ordenId]
    );

    const mesIngreso = orden.mes_ingreso || Number((orden.periodo_desde || '').split('-')[1]);
    const anoIngreso = orden.ano_ingreso || Number((orden.periodo_desde || '').split('-')[0]);
    const nombreMes = NOMBRES_MES[mesIngreso - 1] || '';

    const name = `${orden.nombre_anunciante} - (${formatFecha(orden.periodo_desde)} al ${formatFecha(orden.periodo_hasta)}) - ${nombreMes}${
      orden.numero_orden_agencia ? ` - ${orden.numero_orden_agencia}` : ''
    }`;

    // Hasta cuándo sigue la campaña — prioriza el campo estructurado
    // (el que dispara el clonado automático) y si no está cargado usa la
    // nota libre, que es solo un comentario de referencia.
    let vigenciaTexto: string | null = null;
    if (orden.vigencia_hasta_mes && orden.vigencia_hasta_ano) {
      vigenciaTexto = `${NOMBRES_MES[orden.vigencia_hasta_mes - 1]} ${orden.vigencia_hasta_ano}`;
    } else if (orden.vigencia_hasta_nota) {
      vigenciaTexto = orden.vigencia_hasta_nota;
    }

    const lineasProductos = [...detalles]
      .sort(compararLineasPorSoporte)
      .map((d) => {
        const partes = [d.locacion_nombre || d.ubicacion || 'Sin locación', d.tipo_producto, `x${d.cantidad}`, d.punto_instalacion];
        return `- ${partes.filter(Boolean).join(' — ')}`;
      })
      .join('\n');

    const notes = [
      `Anunciante: ${orden.nombre_anunciante}`,
      orden.numero_orden_agencia ? `N° de orden (agencia): ${orden.numero_orden_agencia}` : null,
      `Tipo: ${orden.tipo_anunciante}`,
      `Período: ${formatFecha(orden.periodo_desde)} al ${formatFecha(orden.periodo_hasta)}`,
      `Mes de ingreso: ${nombreMes} ${anoIngreso}`,
      vigenciaTexto ? `Vigencia hasta: ${vigenciaTexto}` : null,
      '',
      'Productos / soportes:',
      lineasProductos || '(sin productos cargados)',
    ]
      .filter((linea) => linea !== null)
      .join('\n');

    // Igual criterio que en TopviewService: una orden no registrada
    // (facturado = false) o vendida directo por el concesionario (Pauta
    // Concesionario) nunca genera factura real — no le corresponde subtarea
    // "Facturar".
    const generaFacturacion = orden.facturado !== 0 && orden.tipo_anunciante !== 'Pauta Concesionario';

    return { nombreMes, name, notes, generaFacturacion };
  }

  private static headers(): Record<string, string> {
    const token = process.env.ASANA_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'Falta configurar ASANA_ACCESS_TOKEN en el .env del backend — generá un Personal Access Token en Asana (ícono de tu perfil → Configuración de la cuenta → Apps → Administrar apps de desarrollador → Crear nuevo token) y pegalo en backend/.env.'
      );
    }
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  /**
   * Botón "Generar tarea en Asana" de UNA orden puntual, sin tocar ninguna
   * hermana clonada.
   */
  static async generarTarea(ordenId: string): Promise<ResultadoGeneracion[]> {
    return this.generarTareas([ordenId]);
  }

  /**
   * Acción masiva del listado: corre generarTareaUnaOrden para cada id
   * tildado por el usuario (selección individual/total/por filtro, decidida
   * en el frontend — acá no se infiere ningún grupo). Si una orden falla
   * (típicamente porque todavía no existe la sección de ese mes en Asana),
   * no aborta el resto — sigue y reporta el error puntual de esa orden.
   */
  static async generarTareas(ordenIds: string[]): Promise<ResultadoGeneracion[]> {
    const resultados: ResultadoGeneracion[] = [];
    for (const ordenId of ordenIds) {
      try {
        resultados.push(await this.generarTareaUnaOrden(ordenId));
      } catch (err) {
        const datosOrden = await dbGet<MesOrden>('SELECT mes_ingreso, ano_ingreso FROM ordenes_publicidad WHERE id = ?', [ordenId]);
        resultados.push({ ordenId, mes: datosOrden?.mes_ingreso ?? undefined, ano: datosOrden?.ano_ingreso ?? undefined, error: mensajeDe(err) });
      }
    }
    return resultados;
  }

  /**
   * Crea (o actualiza, si ya tiene asana_task_gid) la tarea principal de UNA
   * orden puntual, sin asignar todavía, ubicándola en la sección del mes que
   * corresponde, y crea las subtareas fijas que falten.
   */
  private static async generarTareaUnaOrden(ordenId: string): Promise<ResultadoGeneracion> {
    const headers = this.headers();
    const { nombreMes, name, notes, generaFacturacion } = await this.construirTarea(ordenId);

    const existente = await dbGet<TareaVinculada>(
      'SELECT asana_task_gid, mes_ingreso, ano_ingreso FROM ordenes_publicidad WHERE id = ?',
      [ordenId]
    );
    if (!existente) throw new Error('Orden no encontrada.');
    const mesIngreso = Number(existente.mes_ingreso);
    const anoIngreso = Number(existente.ano_ingreso);

    const proyecto = await AsanaConfigService.obtenerProyecto();
    if (!proyecto.gid) {
      throw new Error('Todavía no hay un proyecto de Asana configurado — elegilo en la solapa "Asana".');
    }
    const seccion = await AsanaConfigService.obtenerSeccion(anoIngreso, mesIngreso);
    if (!seccion) {
      throw new Error(
        `Todavía no está configurada la sección de ${nombreMes} ${anoIngreso} — agregala en la solapa "Asana" y volvé a intentar.`
      );
    }

    let yaExistia = !!existente?.asana_task_gid;
    let taskGid: string | null = existente?.asana_task_gid || null;

    if (taskGid) {
      const resp = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${taskGid}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data: { name, notes } }),
      });
      if (resp.status === 404) {
        // La tarea guardada ya no existe en Asana (se borró a mano allá): se
        // descarta el ID viejo y se crea de nuevo, en vez de quedar trabada.
        taskGid = null;
        yaExistia = false;
      } else if (!resp.ok) {
        throw new Error(`Asana rechazó la actualización de la tarea (${resp.status}): ${await resp.text()}`);
      }
    }
    if (!taskGid) {
      const resp = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { name, notes, projects: [proyecto.gid] } }),
      });
      if (!resp.ok) throw new Error(`Asana rechazó la creación de la tarea (${resp.status}): ${await resp.text()}`);
      const creada = (await resp.json()) as RespuestaAsana<{ gid: string }>;
      taskGid = creada.data.gid;

      // Nueva de verdad: sin asignar (la asignación es un paso aparte).
      await dbRun('UPDATE ordenes_publicidad SET asana_task_gid = ?, asana_asignado = 0 WHERE id = ?', [taskGid, ordenId]);
    }

    // Ubica (o reubica, si el mes de ingreso cambió) la tarea en la sección
    // del mes que corresponde.
    const respSeccion = await fetchReintentando(`https://app.asana.com/api/1.0/sections/${seccion.seccion_gid}/addTask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { task: taskGid } }),
    });
    if (!respSeccion.ok) {
      throw new Error(`Asana rechazó ubicar la tarea en la sección "${nombreMes}" (${respSeccion.status}): ${await respSeccion.text()}`);
    }

    await this.crearSubtareasFaltantes(taskGid as string, name, generaFacturacion, headers);

    return {
      ordenId,
      mes: mesIngreso,
      ano: anoIngreso,
      gid: taskGid as string,
      url: `https://app.asana.com/0/${proyecto.gid}/${taskGid}`,
      yaExistia,
    };
  }

  /**
   * Botón "Asignar responsables": sobre la tarea ya generada (requiere
   * asana_task_gid), asigna la tarea principal a trafico@ y cada subtarea
   * existente a quien corresponda según su prefijo de nombre ("Fotos " →
   * operaciones@, "Link FB y Certificaciones " → trafico@, "Facturar " →
   * administracion@). No crea nada nuevo — si falta alguna subtarea, avisa
   * en vez de asignar a medias.
   */
  static async asignarResponsables(ordenId: string): Promise<void> {
    const headers = this.headers();
    const existente = await dbGet<{ asana_task_gid: string | null }>('SELECT asana_task_gid FROM ordenes_publicidad WHERE id = ?', [ordenId]);
    const taskGid = existente?.asana_task_gid;
    if (!taskGid) {
      throw new Error('Primero generá la tarea en Asana con el otro botón — todavía no existe.');
    }

    const respAsignarPrincipal = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${taskGid}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ data: { assignee: ASIGNADO_TRAFICO } }),
    });
    if (respAsignarPrincipal.status === 404) {
      await dbRun('UPDATE ordenes_publicidad SET asana_task_gid = NULL, asana_asignado = 0 WHERE id = ?', [ordenId]);
      throw new Error('La tarea de esta orden ya no existe en Asana (se borró allá) — generala de nuevo con el otro botón y después asigná.');
    }
    if (!respAsignarPrincipal.ok) {
      throw new Error(`Asana rechazó asignar la tarea principal (${respAsignarPrincipal.status}): ${await respAsignarPrincipal.text()}`);
    }

    const respSubtareas = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=gid,name`, { headers });
    if (!respSubtareas.ok) {
      throw new Error(`Asana rechazó consultar las subtareas (${respSubtareas.status}): ${await respSubtareas.text()}`);
    }
    const subtareas = (await respSubtareas.json()) as Partial<RespuestaAsana<SubtareaAsana[]>>;

    for (const subtarea of subtareas.data || []) {
      let assignee: string | null = null;
      if (subtarea.name.startsWith('Fotos ')) assignee = ASIGNADO_OPERACIONES;
      else if (subtarea.name.startsWith('Link FB y Certificaciones ')) assignee = ASIGNADO_TRAFICO;
      else if (subtarea.name.startsWith('Facturar ')) assignee = ASIGNADO_ADMINISTRACION;
      if (!assignee) continue;

      const resp = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${subtarea.gid}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data: { assignee } }),
      });
      if (!resp.ok) {
        throw new Error(`Asana rechazó asignar la subtarea "${subtarea.name}" (${resp.status}): ${await resp.text()}`);
      }
    }

    await dbRun('UPDATE ordenes_publicidad SET asana_asignado = 1 WHERE id = ?', [ordenId]);
  }

  /**
   * Botón "Borrar tareas Asana" de UNA orden puntual únicamente.
   */
  static async borrarTareasDesde(ordenId: string): Promise<ResultadoBorrado[]> {
    return this.borrarTareas([ordenId]);
  }

  /**
   * Acción masiva del listado: borra la tarea de Asana de cada id tildado
   * por el usuario. Borrar la tarea principal en Asana ya borra sus
   * subtareas en cascada (verificado). Las órdenes sin tarea generada se
   * saltean sin error. Limpia asana_task_gid de cada una para que quede
   * lista para generarse de nuevo.
   */
  static async borrarTareas(ordenIds: string[]): Promise<ResultadoBorrado[]> {
    const headers = this.headers();
    const resultados: ResultadoBorrado[] = [];
    for (const ordenId of ordenIds) {
      const fila = await dbGet<TareaVinculada>(
        'SELECT asana_task_gid, mes_ingreso, ano_ingreso FROM ordenes_publicidad WHERE id = ?',
        [ordenId]
      );
      if (!fila?.asana_task_gid) {
        resultados.push({ ordenId, mes: fila?.mes_ingreso ?? undefined, ano: fila?.ano_ingreso ?? undefined, borrada: false });
        continue;
      }
      try {
        const resp = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${fila.asana_task_gid}`, { method: 'DELETE', headers });
        if (!resp.ok && resp.status !== 404) {
          throw new Error(`Asana rechazó borrar la tarea (${resp.status}): ${await resp.text()}`);
        }
        await dbRun('UPDATE ordenes_publicidad SET asana_task_gid = NULL, asana_asignado = 0 WHERE id = ?', [ordenId]);
        resultados.push({ ordenId, mes: fila.mes_ingreso ?? undefined, ano: fila.ano_ingreso ?? undefined, borrada: true });
      } catch (err) {
        resultados.push({ ordenId, mes: fila.mes_ingreso ?? undefined, ano: fila.ano_ingreso ?? undefined, borrada: false, error: mensajeDe(err) });
      }
    }
    return resultados;
  }

  /**
   * Acción masiva del listado: asigna responsables de cada id tildado por
   * el usuario, reusando asignarResponsables orden por orden. Si una falla
   * (típicamente porque le falta alguna subtarea), no aborta el resto.
   */
  static async asignarResponsablesMasivo(ordenIds: string[]): Promise<ResultadoAsignacion[]> {
    const resultados: ResultadoAsignacion[] = [];
    for (const ordenId of ordenIds) {
      const datosOrden = await dbGet<MesOrden>('SELECT mes_ingreso, ano_ingreso FROM ordenes_publicidad WHERE id = ?', [ordenId]);
      try {
        await this.asignarResponsables(ordenId);
        resultados.push({ ordenId, mes: datosOrden?.mes_ingreso ?? undefined, ano: datosOrden?.ano_ingreso ?? undefined });
      } catch (err) {
        resultados.push({ ordenId, mes: datosOrden?.mes_ingreso ?? undefined, ano: datosOrden?.ano_ingreso ?? undefined, error: mensajeDe(err) });
      }
    }
    return resultados;
  }

  /**
   * Crea las subtareas fijas de una orden si todavía no existen (por nombre
   * exacto, para no duplicar si se vuelve a generar la misma orden): "Fotos",
   * "Link FB y Certificaciones" y "Facturar" (esta última solo si la orden
   * genera facturación real) — sin asignar (ver asignarResponsables).
   */
  private static async crearSubtareasFaltantes(
    taskGid: string,
    nombreTarea: string,
    generaFacturacion: boolean,
    headers: Record<string, string>
  ): Promise<void> {
    const respExistentes = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=gid,name`, {
      headers,
    });
    if (!respExistentes.ok) {
      throw new Error(`Asana rechazó consultar las subtareas existentes (${respExistentes.status}): ${await respExistentes.text()}`);
    }
    const existentes = (await respExistentes.json()) as Partial<RespuestaAsana<SubtareaAsana[]>>;
    const nombresExistentes = new Set((existentes.data || []).map((t) => t.name));

    const subtareasDeseadas = [
      `Fotos ${nombreTarea}`,
      `Link FB y Certificaciones ${nombreTarea}`,
      ...(generaFacturacion ? [`Facturar ${nombreTarea}`] : []),
    ];

    for (const nombreSubtarea of subtareasDeseadas) {
      if (nombresExistentes.has(nombreSubtarea)) continue;
      const resp = await fetch(`https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { name: nombreSubtarea } }),
      });
      if (!resp.ok) {
        throw new Error(`Asana rechazó crear la subtarea "${nombreSubtarea}" (${resp.status}): ${await resp.text()}`);
      }
    }

    await this.ordenarSubtareas(taskGid, subtareasDeseadas, headers);
  }

  // Asana inserta cada subtarea nueva ARRIBA de las anteriores, así que las
  // creadas en orden quedan al revés. Orden natural del trabajo: Fotos →
  // Link FB y Certificaciones → Facturar. Solo reordena si hace falta (también
  // arregla las tareas ya creadas), y no toca subtareas agregadas a mano.
  private static async ordenarSubtareas(taskGid: string, nombresEnOrden: string[], headers: Record<string, string>): Promise<void> {
    const resp = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=gid,name`, { headers });
    if (!resp.ok) return;
    const actuales: SubtareaAsana[] = ((await resp.json()) as Partial<RespuestaAsana<SubtareaAsana[]>>).data || [];
    const deseadas = nombresEnOrden
      .map((n) => actuales.find((a) => a.name === n))
      .filter((a): a is { gid: string; name: string } => !!a);
    const ordenActual = actuales.filter((a) => deseadas.includes(a)).map((a) => a.gid);
    if (ordenActual.join() === deseadas.map((d) => d.gid).join()) return;

    for (let i = 1; i < deseadas.length; i++) {
      const r = await fetchReintentando(`https://app.asana.com/api/1.0/tasks/${deseadas[i].gid}/setParent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { parent: taskGid, insert_after: deseadas[i - 1].gid } }),
      });
      if (!r.ok) throw new Error(`Asana rechazó reordenar las subtareas (${r.status}): ${await r.text()}`);
    }
  }
}
