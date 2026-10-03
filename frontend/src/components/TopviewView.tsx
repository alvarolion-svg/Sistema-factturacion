import { useMemo, useState } from 'react';
import ProduccionTopviewTab from './ProduccionTopviewTab';
import LocacionesTab from './LocacionesTab';
import LiquidacionesTab, { SeleccionLiquidacion } from './LiquidacionesTab';
import ComisionesEfectivoTab from './ComisionesEfectivoTab';
import AsanaConfigTab from './AsanaConfigTab';
import AgenciasTab from './AgenciasTab';
import IntermediariosTab from './IntermediariosTab';
import CondicionesTab from './CondicionesTab';
import VendedoresTab from './VendedoresTab';
import TimelineTab from './TimelineTab';
import OrdenesTab from './OrdenesTab';
import EjecucionTab from './EjecucionTab';

interface TopviewViewProps {
  token: string;
  usuario: any;
}


function TopviewView({ token, usuario }: TopviewViewProps) {
  const permisos = useMemo(
    () => new Set((usuario?.permisos || []).map((p: any) => p.codigo)),
    [usuario]
  );
  const puedeCrear = permisos.has('topview_crear');
  // Quien no tiene topview_ver_modulos (ej. Facturador, Contador) ve solo la grilla de Órdenes.
  const veTodosLosModulos = permisos.has('topview_ver_modulos');
  const puedeFacturar = permisos.has('topview_facturar');
  const puedeRevisar = permisos.has('topview_marcar_revisada');
  const puedeEditarPropias = permisos.has('topview_solo_propias') && puedeCrear;
  const veNetos = ['topview_netos_ver', 'topview_comisionistas_ver', 'topview_editar'].some((p) => permisos.has(p));
  const puedeEditar = permisos.has('topview_editar');
  const puedeVerComisionistas = permisos.has('topview_comisionistas_ver');
  const puedeGestionarComisionistas = permisos.has('topview_comisionistas_crear');
  const puedeEditarComisionistas = permisos.has('topview_comisionistas_editar');
  const puedeGestionarCondicionAgencia = permisos.has('topview_condiciones_agencia_crear');
  const puedeVerVendedores = permisos.has('topview_vendedores_ver');
  const puedeGestionarVendedores = permisos.has('topview_vendedores_crear');
  const puedeVerLiquidaciones = permisos.has('liquidaciones_ver');
  const puedeCargarLiquidaciones = permisos.has('liquidaciones_cargar');

  const [seccion, setSeccion] = useState<
    | 'ejecucion'
    | 'timeline'
    | 'ordenes'
    | 'produccion'
    | 'agencias'
    | 'locaciones'
    | 'intermediarios'
    | 'condiciones'
    | 'comisiones'
    | 'vendedores'
    | 'liquidaciones'
    | 'asana'
  >('ordenes');

  // Acceso directo Órdenes ↔ Liquidaciones: cada uno le pasa al otro qué
  // abrir, el que recibe lo consume y avisa para limpiarlo (no queda
  // "pegado" si después el usuario navega por su cuenta).
  const [ordenIdParaAbrir, setOrdenIdParaAbrir] = useState<string | null>(null);
  const [liquidacionParaAbrir, setLiquidacionParaAbrir] = useState<SeleccionLiquidacion | null>(null);
  // De qué solapa vino el usuario al abrir una orden desde afuera (ej.
  // Comisionistas o Liquidaciones) — "‹ Volver a la lista" en el detalle
  // vuelve ahí en vez de quedarse siempre en la lista general de Órdenes.
  const [seccionOrigenOrden, setSeccionOrigenOrden] = useState<typeof seccion | null>(null);

  return (
    <section className="view-card">
      <div className="view-header">
        <img src="/img/logo-topview.png" alt="Topview" style={{ height: '2.5rem' }} />
      </div>

      {veTodosLosModulos && (
      <div className="reportes-tabs">
        <button
          className={`reportes-tab ${seccion === 'ejecucion' ? 'active' : ''}`}
          onClick={() => setSeccion('ejecucion')}
        >
          Ejecución
        </button>
        <button
          className={`reportes-tab ${seccion === 'timeline' ? 'active' : ''}`}
          onClick={() => setSeccion('timeline')}
        >
          Timeline
        </button>
        <button
          className={`reportes-tab ${seccion === 'ordenes' ? 'active' : ''}`}
          onClick={() => setSeccion('ordenes')}
        >
          Órdenes
        </button>
        <button
          className={`reportes-tab ${seccion === 'produccion' ? 'active' : ''}`}
          onClick={() => setSeccion('produccion')}
        >
          Órdenes de Producción
        </button>
        <button
          className={`reportes-tab ${seccion === 'agencias' ? 'active' : ''}`}
          onClick={() => setSeccion('agencias')}
        >
          Agencias
        </button>
        <button
          className={`reportes-tab ${seccion === 'locaciones' ? 'active' : ''}`}
          onClick={() => setSeccion('locaciones')}
        >
          Locaciones
        </button>
        {puedeVerComisionistas && (
          <button
            className={`reportes-tab ${seccion === 'intermediarios' ? 'active' : ''}`}
            onClick={() => setSeccion('intermediarios')}
          >
            Comisionistas
          </button>
        )}
        <button
          className={`reportes-tab ${seccion === 'condiciones' ? 'active' : ''}`}
          onClick={() => setSeccion('condiciones')}
        >
          Condiciones
        </button>
        {puedeVerComisionistas && (
          <button
            className={`reportes-tab ${seccion === 'comisiones' ? 'active' : ''}`}
            onClick={() => setSeccion('comisiones')}
          >
            Comisiones en efectivo
          </button>
        )}
        {puedeVerVendedores && (
          <button
            className={`reportes-tab ${seccion === 'vendedores' ? 'active' : ''}`}
            onClick={() => setSeccion('vendedores')}
          >
            Vendedores
          </button>
        )}
        {puedeVerLiquidaciones && (
          <button
            className={`reportes-tab ${seccion === 'liquidaciones' ? 'active' : ''}`}
            onClick={() => setSeccion('liquidaciones')}
          >
            Liquidaciones
          </button>
        )}
        {puedeEditar && (
          <button
            className={`reportes-tab ${seccion === 'asana' ? 'active' : ''}`}
            onClick={() => setSeccion('asana')}
          >
            Asana
          </button>
        )}
      </div>
      )}

      {seccion === 'ejecucion' && (
        <EjecucionTab
          token={token}
          puedeEditar={puedeEditar}
          onVerOrden={(ordenId) => {
            setSeccionOrigenOrden(seccion);
            setOrdenIdParaAbrir(ordenId);
            setSeccion('ordenes');
          }}
        />
      )}
      {seccion === 'timeline' && (
        <TimelineTab
          token={token}
          puedeCrear={puedeCrear}
          onVerOrden={(ordenId) => {
            setSeccionOrigenOrden(seccion);
            setOrdenIdParaAbrir(ordenId);
            setSeccion('ordenes');
          }}
        />
      )}
      {seccion === 'ordenes' && (
        <OrdenesTab
          token={token}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          puedeFacturar={puedeFacturar}
          puedeRevisar={puedeRevisar}
          veNetos={veNetos}
          puedeEditarPropias={puedeEditarPropias}
          puedeVerLiquidaciones={puedeVerLiquidaciones}
          ordenIdParaAbrir={ordenIdParaAbrir}
          onOrdenAbierta={() => setOrdenIdParaAbrir(null)}
          onVolverASeccionOrigen={() => {
            setSeccion(seccionOrigenOrden || 'ordenes');
            setSeccionOrigenOrden(null);
          }}
          onVerLiquidacion={(concesionarioId, mesSel, anoSel) => {
            setLiquidacionParaAbrir({ concesionarioId, mes: mesSel, ano: anoSel });
            setSeccion('liquidaciones');
          }}
        />
      )}
      {seccion === 'produccion' && (
        <ProduccionTopviewTab token={token} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />
      )}
      {seccion === 'agencias' && <AgenciasTab token={token} puedeCrear={puedeCrear} />}
      {seccion === 'locaciones' && <LocacionesTab token={token} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />}
      {seccion === 'intermediarios' && puedeVerComisionistas && (
        <IntermediariosTab
          token={token}
          puedeCrear={puedeGestionarComisionistas}
          onVerOrden={(ordenId) => {
            setSeccionOrigenOrden(seccion);
            setOrdenIdParaAbrir(ordenId);
            setSeccion('ordenes');
          }}
        />
      )}
      {seccion === 'condiciones' && (
        <CondicionesTab
          token={token}
          puedeCrear={puedeGestionarCondicionAgencia}
          puedeVerComisionistas={puedeVerComisionistas}
          puedeGestionarComisionistas={puedeGestionarComisionistas}
        />
      )}
      {seccion === 'comisiones' && puedeVerComisionistas && (
        <ComisionesEfectivoTab token={token} puedeEditar={puedeEditarComisionistas} />
      )}
      {seccion === 'vendedores' && puedeVerVendedores && (
        <VendedoresTab token={token} puedeCrear={puedeGestionarVendedores} />
      )}
      {seccion === 'liquidaciones' && puedeVerLiquidaciones && (
        <LiquidacionesTab
          token={token}
          puedeCargar={puedeCargarLiquidaciones}
          seleccionInicial={liquidacionParaAbrir}
          onSeleccionConsumida={() => setLiquidacionParaAbrir(null)}
          onVerOrden={(ordenId) => {
            setSeccionOrigenOrden(seccion);
            setOrdenIdParaAbrir(ordenId);
            setSeccion('ordenes');
          }}
        />
      )}
      {seccion === 'asana' && puedeEditar && <AsanaConfigTab token={token} />}
    </section>
  );
}




export default TopviewView;
