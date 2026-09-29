# Contexto para el módulo de Disponibilidad (pensado para integrarse a Sistema-facturacion/Topview)

Este archivo es un briefing corto para arrancar el proyecto del módulo de disponibilidad en otra
sesión/chat, sin tener que releer todo Sistema-facturacion. Da el mínimo necesario para que las
decisiones de diseño de ese módulo (modelo de datos, ids, nombres de campos) sean compatibles con
este sistema el día que se anexen.

Para el "por qué" del negocio (qué es Topview, qué vende, qué son las locaciones) leer primero
[`TOPVIEW-NEGOCIO.md`](./TOPVIEW-NEGOCIO.md) — este archivo asume ese contexto y va directo a lo
técnico.

## Qué es Sistema-facturacion, en una línea

Monorepo React+TS+Vite (frontend :5173) + Node+Express+TS+SQLite (backend :5001), en
`/Users/alvaro/Sistema-factturacion`. Un solo archivo de base (`backend/facturacion.db`).
Topview es el módulo core (ver `frontend/src/components/TopviewView.tsx` y
`backend/src/services/topview.ts`).

## El modelo de datos que le importa a "disponibilidad"

```
locaciones (el lugar físico: "Nordelta Centro Comercial", etc.)
  id, nombre, tipo, concesionario_id, habilitado

locaciones_capacidad (qué soportes tiene instalados esa locación, y cuántos — es catálogo/inventario,
                       no un movimiento de venta)
  id, locacion_id → locaciones.id, producto_id → productos.id, cantidad

locaciones_puntos (opcional: cuando los soportes de una locación+producto tienen nombre propio,
                    ej. Escaleras Mecánicas "Freddo" vs "Co Work" en el mismo shopping — la cantidad
                    real es la suma de estos puntos, no la de locaciones_capacidad, cuando existen)
  id, capacidad_id → locaciones_capacidad.id, nombre, cantidad

productos (catálogo general; el soporte publicitario es un producto con tipo='fisico')
  id, codigo, nombre, tipo ('fisico' | 'servicio'), habilitado

ordenes_publicidad (la orden/campaña vendida — el "libro de reservas" de facto)
  id, cliente_id, nombre_anunciante, periodo_desde, periodo_hasta (fechas reales de vigencia),
  mes_ingreso, ano_ingreso (mes comercial/de reporte, puede NO coincidir con periodo_desde/hasta),
  estado ('Cargada'|'Revisada'|'Facturada'), habilitado (soft-delete, ver abajo)

ordenes_publicidad_detalles (una línea = "en esta locación, este soporte, esta cantidad, este
                              período" — de acá sale la ocupación real)
  id, orden_id → ordenes_publicidad.id, producto_id → productos.id,
  locacion_id → locaciones.id, punto_instalacion (texto libre, opcional),
  cantidad, tipo_producto (copia de solo lectura del nombre del producto)
```

**Ocupación de un soporte en un rango de fechas** = sumar `cantidad` de
`ordenes_publicidad_detalles` que:
- tengan `locacion_id` + `producto_id` (+ `punto_instalacion` si aplica) iguales,
- cuya orden dueña (`ordenes_publicidad`) tenga `habilitado != 0`,
- y cuyo `periodo_desde`/`periodo_hasta` se solape con el rango consultado.

**Capacidad total** = `locaciones_capacidad.cantidad` para esa locación+producto, o la suma de
`locaciones_puntos.cantidad` si esa locación+producto tiene puntos cargados (entonces
`locaciones_capacidad.cantidad` queda en 0/sin usar).

Esto es exactamente lo que un módulo de disponibilidad necesita cruzar: capacidad vs. ocupación,
por locación + producto (+ punto), en un rango de fechas.

## Convenciones a respetar si el día de mañana esto se anexa

- **Soft-delete**: nunca se borra en duro. `habilitado = 0` en vez de DELETE. Cualquier query de
  ocupación tiene que filtrar `habilitado != 0` (o `IS NULL`, columnas viejas quedaron nullable).
- **IDs son TEXT (uuid)**, no autoincrement.
- **periodo_desde/periodo_hasta** son la vigencia real de la campaña (lo que ocupa el soporte).
  **mes_ingreso/ano_ingreso** es a qué mes se le asigna la venta a efectos de reporte/comisión —
  puede diferir del período real. Para disponibilidad importa **solo periodo_desde/periodo_hasta**,
  nunca mes_ingreso/ano_ingreso.
- **Permisos**: sistema de roles con permisos tipo `topview_ver`, `topview_crear`, `topview_editar`,
  `topview_netos_ver` (granulares por sección). Si el módulo nuevo comparte login con este sistema
  más adelante, seguir esa misma convención de nombres (`disponibilidad_ver`, etc.) en vez de
  inventar un esquema de permisos distinto.
- **Timeline** (`TimelineTab` en `TopviewView.tsx`) ya resuelve un problema parecido pero por
  **cliente** en vez de por **locación**: continuidad mes a mes de campañas activas, con clonado de
  órdenes hacia adelante/atrás/huecos. Si "disponibilidad" termina necesitando algo visual de
  ocupación en el tiempo, vale la pena mirar ese patrón (fila = entidad, columna = mes, tramos
  continuos coloreados) en vez de inventar uno nuevo desde cero — pero la unidad ahí es
  cliente+anunciante, acá sería locación+producto.

## Qué NO conviene duplicar

Si el nuevo módulo arranca en un repo/proyecto aparte, igual conviene que su propio modelo de datos
use como referencia los mismos `locacion_id` / `producto_id` que ya existen acá (aunque sea
copiándolos a mano al principio, sin una FK real todavía) — para que integrar después sea un
join por id y no un mapeo manual de nombres. Evitar crear un catálogo paralelo de "locaciones" o
"soportes" con sus propios ids si se puede evitar.

## Qué preguntar/confirmar en la sesión nueva antes de diseñar

Esto no lo sé yo (Sonnet 5.5 en la sesión nueva debería preguntárselo al usuario si no está claro):
- ¿El módulo de disponibilidad consulta datos de Sistema-facturacion en vivo (API), o vive
  desconectado por ahora y se integra recién cuando esté maduro?
- ¿Necesita escribir (bloquear/reservar) o solo consultar disponibilidad?
- ¿Es por locación+producto (como el modelo de arriba), o la unidad de disponibilidad es otra
  (ej. por punto de instalación individual, por franja horaria en vez de por mes)?
