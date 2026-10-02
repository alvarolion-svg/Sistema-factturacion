# Bitácora del proyecto — Sistema de Facturación / Topview

Este documento existe para que **cualquier sesión nueva de Claude Code** (o cualquier persona)
pueda entender en pocos minutos dónde está parado el proyecto, sin tener que releer meses de
conversación. Se actualiza cada tanto, no después de cada cambio chico — para el día a día, el
historial de git y los commits son la fuente de verdad.

Si sos una sesión de Claude Code leyendo esto por primera vez: además de este archivo, existe un
sistema de memoria propio de Claude (fuera del repo, en `~/.claude/projects/.../memory/`) que se
carga solo al arrancar una conversación con este usuario — ahí están los detalles finos
(decisiones tomadas, preferencias de trabajo, pendientes puntuales). Este archivo es el
complemento pensado para quedar **versionado en git**, legible por el usuario, y disponible aunque
esa memoria no esté cargada.

## Qué es esto

Sistema de facturación a medida para **Topview**, una empresa real argentina de publicidad
exterior (OOH/DOOH): opera pantallas y carteles físicos (PPLs, cajas backlight, gigantografías,
video walls, pantallas LED, etc.) instalados dentro de paseos comerciales y centros de alto poder
adquisitivo del GBA (Nordelta, Pilar, Maschwitz, Devoto, etc.). Vende ese espacio publicitario
directo, vía agencias, o vía comisionistas/intermediarios en cascada. El sistema es multi-negocio:
además de Topview también lleva Clientes, Proveedores, Gastos, Facturas, Productos, Tesorería,
Usuarios, Auditoría y Reportes generales — pero **Topview es el corazón real del proyecto**, no
una feature secundaria.

## Arquitectura (resumen — el detalle está en `CLAUDE.md`)

- Frontend: React 18 + TypeScript + Vite, puerto 5173.
- Backend: Node + Express + TypeScript + SQLite (`backend/facturacion.db`), puerto configurable
  por `PORT` (se usa 5001 en desarrollo).
- Sin ORM: SQL directo por servicio (`backend/src/services/*.ts`).

## Estado actual (qué ya funciona, verificado)

- **Autenticación y roles** con permisos por sección.
- **Topview**: Órdenes de publicidad, Órdenes de producción, Agencias, Comisionistas,
  Condiciones, Comisiones en efectivo, Vendedores — todo con datos reales cargados (45 órdenes de
  publicidad, 268 clientes, 506 proveedores). La lista de Órdenes tiene filtros (mes/año según
  fecha de facturación o mes de ingreso, tipo de anunciante, facturación, búsqueda) y exporta a
  Excel/PDF con una fila de Totales al pie (suma por soporte y por los 3 montos), calcada de la
  tabla en pantalla.
- **Catálogo de Locaciones** (`locaciones` + `locaciones_capacidad` + `locaciones_puntos`): 21
  locaciones reales (el usuario las va sumando/editando en vivo, así que este número crece solo),
  cada una con su inventario de soportes y, opcionalmente, puntos de instalación con nombre propio
  ("posiciones" en la interfaz). Las órdenes ya pueden asociar cada línea de producto a una
  locación + posición real (reemplaza de a poco el texto libre de ubicación viejo, que se conserva
  como respaldo).
  - **Concesionarios asignados: 20 de 21** — el usuario cargó la gran mayoría en vivo directamente
    desde la app. **Bahía Grande Nordelta** ya resuelta (2026-09-24, necesitaba varios concesionarios
    por punto/soporte, no uno solo — ver más abajo). Solo falta **Chateau Portal Nordelta**.
  - Las 3 órdenes de YPF (2026080187, 2026080296, 2026080245) se usaron como caso de prueba real
    para anotar líneas de orden con locación/soporte/posición — están las tres idénticas en
    soportes, sirven de referencia para seguir cargando el resto.
- **Clientes, Proveedores, Gastos, Facturas, Productos, Tesorería, Usuarios, Auditoría,
  Reportes**: pantallas completas, CRUD funcionando.
- **Reportes → Topview** tiene DOS gráficos mensuales, cada uno con su propia fecha: **"Venta
  mensual"** agrupa por `mes_ingreso`/`ano_ingreso` (el mes comercial en que se cargó la pauta) y
  **"Facturación bruta mensual"** agrupa por `fecha_facturacion` — una orden vendida en agosto pero
  facturada recién en septiembre antes partía el total del mes en el gráfico de facturación; ahora
  "Venta mensual" la muestra entera en el mes real de venta. También por tipo de anunciante, y un
  desglose de netos post-comisión (monto final, ganancia, comisión por comisionista con/sin
  factura) que **solo ve Administrador** — el backend directamente no manda esos campos a nadie
  más, no es un tema de ocultar en pantalla (permiso `topview_netos_ver`). La misma distinción
  (venta vs. facturación) existe como filtro en la lista de **Topview → Órdenes**: el selector
  "Filtrar por" al lado de Mes/Año elige si el mes filtra por fecha de facturación (default, no
  cambia el comportamiento de siempre) o por mes de ingreso — necesario para reconciliar contra
  planillas externas de "ingreso de órdenes", que trackean venta, no facturación.
- **Topview → Comisionistas** (ambas tablas — "Cuánto traccionan las ventas" y "Ficha de
  comisionistas") es **Administrador únicamente** (permiso `topview_comisionistas_ver`, sacado de
  Gerente). El reporte de comisiones tiene filtro por mes/año/tipo (Tipo 1 con factura, Tipo 2
  efectivo, o ambas), detalle expandible por comisionista con las campañas/clientes que la
  conforman, marca de "sin órdenes" cuando no hubo actividad en el período filtrado, y exportar a
  Excel/PDF. **Bug real corregido (2026-09-23)**: con 3+ comisionistas encadenados mezclando
  'cascada' y 'base' en la misma orden, el nivel en cascada no restaba lo que dejaban los niveles
  'base' anteriores (calculaba de más). Verificado exacto contra la planilla real de referencia
  (caso AMEX/IPG, 3 niveles) — antes el usuario tenía que "trampear" el % de un comisionista a mano
  para que el resultado cerrara.
- **Topview → Liquidaciones** (nuevo, **Administrador únicamente** — `liquidaciones_ver`/
  `liquidaciones_cargar`): elegís concesionario + mes/año y lista automáticamente todas las líneas
  de orden con locación de ese concesionario activas ese período (cantidad/locación/posición de
  solo lectura, tomadas de la orden real). El monto que se le paga al concesionario se carga a
  mano por línea y por mes — no se calcula de lo que le cobramos al anunciante, no tiene relación
  fija. Guarda una fila por línea de detalle de orden + mes/año (tabla `liquidaciones_detalle`),
  no por orden entera, porque una misma orden puede tener líneas en varias locaciones (hasta 11
  distintas se vieron en los datos reales) y por lo tanto deberle a varios concesionarios a la
  vez. Tiene exportar a Excel/PDF (con la vigencia en fechas de cada campaña en vez del N° de
  orden, para que no se confunda con varias campañas cuando en realidad es una sola con cortes de
  fecha), monto con formato de miles al tipear, y ABM básico: se puede sacar una línea de la
  liquidación sin tocar la orden (ej. el cliente terminó no pagando) y restaurarla después, y
  agregar una línea manual suelta para compensar ajustes que no vienen de ninguna orden. Tiene
  corte del día 15: una campaña que arranca (`periodo_desde`) después del 15 del mes no cuenta por
  defecto para ese mes — se avisa igual en pantalla con un tilde para sumarla si se quiere en vez
  de esperar al mes que viene. Y tiene solapa **"Canon por concesionario"** para cargar el % de
  Canon propio de cada uno (se llama así, no "comisión", para no confundirlo con el módulo de
  Comisionistas) — el monto cargado a mano por línea es lo "declarado", el % determina el "Total a
  liquidar" real (ej. $220 declarado × 40% = $88 a liquidar), visible en pantalla y en los
  exports. **Validado contra una liquidación real** (Centro Comercial Nordelta) que el usuario
  compartió: se sumaron secciones **Publicidad/Stand** (cada una con su propio Canon, clasificado
  por tipo de soporte, solo se muestra en el resumen si esa liquidación tiene alguna línea de esa
  sección), estados de línea **"Sin cargo"/"Canje"** (cuentan $0), **IVA + percepciones
  IIBB** (puede haber varias a la vez) calculados sobre el Total Final hasta el **Total a Pagar**
  real, y tanto la pantalla de carga como el export **agrupan por anunciante** (rango de vigencia
  completo, soportes deduplicados — no repite si varias campañas del mismo cliente tienen lo
  mismo, con un solo monto combinado) con un checkbox para desactivar el agrupado; las líneas
  excluidas o Sin cargo/Canje quedan sueltas con sus controles propios. El
  export tiene encabezado (nombre/domicilio del concesionario) y nota libre. **Las campañas de
  corte-15 tienen su propia solapa** ("Después del día 15", con contador) separada de "Liquidar",
  para no ensuciar la vista principal — se agrupan igual que las demás (una orden real con varios
  soportes es una sola fila, no una por soporte) y en cuanto se tilda "Incluir" pasan solas a la
  solapa Liquidar como una línea más. Tiene **línea manual con signo**: un tilde "Resta del Canon" para
  gastos compartidos (ej. electricidad) o ajustes por una diferencia pasada, el monto se carga
  siempre positivo. También las **percepciones** (dentro de "Canon por concesionario") pueden
  restar en vez de sumar — mismo tilde — para tasas municipales (% igual que IIBB, pero descuentan
  del Canon en vez de sumar al Total a Pagar). Tiene **acceso directo con Órdenes**: el N° de orden
  en Liquidar abre esa orden, y el detalle de una orden tiene "Ver liquidación de [concesionario]"
  — con un solo concesionario es un botón directo; con más de uno (una orden real de YPF llegó a
  tocar 10 a la vez) es un desplegable, para no romper el layout del encabezado. Cubre el mecanismo
  base y **ya cubre los dos terceros colgados de una liquidación: Esteban Vivo y Oxant**, cada uno
  con **pantalla propia** dentro de Liquidaciones (solo mes/año, sin elegir concesionario) — export
  Excel/PDF propio y completamente aislado, nunca mezclado con lo del concesionario ni entre sí.
  **Esteban Vivo** (construido 2026-09-24) cobra su propia comisión sobre las liquidaciones de
  Parque C. Avellaneda y Pueblo Caamaño, con una cascada propia de 4 pasos (Comisión Vendedor 10%
  → Canon 30% → Gastos Top 20% → Com Vivo 25%), calculada por orden real (no por nombre de
  anunciante). Al principio vivía embebido dentro de "Liquidar" de cada concesionario, pero
  obligaba a entrar a cada uno por separado para ver/exportar — se movió a su propia solapa
  "Esteban Vivo" (mismo día, mismo patrón que Oxant) que suma los 2 concesionarios de una vez, con
  una sección y subtotal por cada uno y un total general. Los 4 % se editan en **"Canon por
  concesionario"** (junto con Canon/IVA/percepciones, no dentro de "Liquidar" ni de "Esteban
  Vivo") — los concesionarios que tienen la condición muestran "Percepciones / Esteban Vivo" al
  expandir la fila. **Oxant** (construido
  2026-09-24) — a diferencia de Esteban Vivo (1:1 con un concesionario), Oxant cobra una **comisión
  única sobre la suma del Canon** de **tres** concesionarios a la vez (CECNOR SA, WFPP SRL/World
  Padel Pilar, PILAR SHOPS S.A./Hey Add Center): `total_canon × 6% = comisión`, `comisión × 21% =
  IVA propio de Oxant`, total a pagar = comisión + IVA. Verificado exacto contra una liquidación
  real de Oxant. Por sumar varios concesionarios, es una **pantalla propia** dentro de
  Liquidaciones ("Oxant", solo mes/año, sin selector de concesionario), con export Excel/PDF
  también aislado del resto. El % de comisión y el % de IVA **se editan en "Canon por
  concesionario"** (mismo criterio que Esteban Vivo) — como es una condición única compartida por
  los 3, la sección editable aparece en las 3 filas (CECNOR SA, WFPP SRL, PILAR SHOPS S.A.) y
  guardar desde cualquiera actualiza la misma condición global; la solapa "Oxant" quedó de solo
  cálculo y export. **Iris Chiterer** (tercero nuevo, ver ítem 3 más abajo) se lleva un 8% flat de
  lo declarado por Terra Uno S.A. — mismo patrón de solapa propia, sin cascada.
- **Bug real corregido (2026-09-24): las órdenes "No registradas" nunca entraban en ningún
  cálculo de Liquidaciones**, para ningún concesionario, desde que existe el módulo — `listarPeriodo`
  exigía una fila en `replicaciones_facturacion` (tabla del ciclo de facturación real/Colppy), que
  esas órdenes nunca tienen a propósito. Se corrigió resolviendo su mes/año directo contra el
  período de la orden en vez de exigir esa replicación — sin tocar el flujo de facturación real.
  Verificado sin cambiar ningún número ya confirmado (CECNOR, Oxant, Esteban Vivo dan exactamente
  lo mismo). Las 5 órdenes no registradas del sistema ahora entran correctamente.
- **Producción se despliega fuera de esta Mac**: sin hacer todavía — ver
  [`PENDIENTE-PRODUCCION.md`](./PENDIENTE-PRODUCCION.md) para el relevamiento completo (qué falta
  antes de exponerlo a internet).

## Decisiones importantes ya tomadas (no volver a preguntar)

- **`cc_clientes` (deuda real de 48 clientes importada de Colppy) se perdió** en algún momento
  entre sesiones. Hay un backup completo (`backups/cc_clientes_backup_20260915_214454.sql`), pero
  el usuario decidió explícitamente **no restaurarlo** — queda en $0 a propósito. No volver a
  ofrecer restaurarlo.
- **El merge entre la rama local y la del remoto** (dos historias divergentes de Git) se resolvió
  a favor de la rama local en los 4 archivos con conflicto real, porque tenía meses más de trabajo
  real (todo Topview). Se verificó archivo por archivo que no se perdió funcionalidad real del
  remoto. El commit de merge conserva ambas ramas en la historia (`git log --graph`).
- **Datavisiooh** (medición de audiencia) está explícitamente fuera de foco — es un proveedor
  externo de datos, no parte de la lógica de negocio.

## Pendientes abiertos

Cada uno tiene su propio detalle en la memoria de Claude (o en este repo, donde se indica). Los
más importantes:

1. **Concesionarios sin asignar**: solo 1 de 21 locaciones (ver arriba) — Chateau Portal Nordelta.
   "World Padel Center Pilar", "Parque Austral" y **Bahía Grande Nordelta** ya se resolvieron (WFPP
   SRL creado con su CUIT real; Parque Austral tiene a ASOCIACION CIVIL DE ESTUDIOS SUPERIORES
   ACES; Bahía Nordelta con concesionario por punto/soporte, ver ítem 3).
2. **Módulo Liquidaciones a locatarios**: **construido completo** (Topview → Liquidaciones, ver
   arriba, con exportar Excel/PDF). Los 3 terceros que se cuelgan de una liquidación **ya están
   construidos y verificados** (2026-09-24, ver arriba): **Esteban Vivo** (cascada
   10%/30%/20%/25% sobre Parque C. Avellaneda/Pueblo Caamaño), **Oxant** (6% sobre la suma del
   Canon de CECNOR SA/WFPP SRL/Pilar Shops + 21% IVA propio) e **Iris Chiterer** (8% flat sobre lo
   declarado por Terra Uno S.A.). También se corrigió el bug de órdenes "No registradas" que nunca
   entraban al cálculo (ver arriba). Queda pendiente:
   - **Envío por mail**: diseño acordado, no construido — cerrar una liquidación crea una versión
     numerada con foto congelada de los números (se puede seguir editando después, cada re-cierre
     suma una versión nueva, con alerta si ya estaba cerrada/enviada), el PDF que ya arma el
     frontend se manda por mail al concesionario (campo de email propio, no el de Proveedores).
     Bloqueado en que el usuario consiga una cuenta SMTP real (Gmail o el hosting de la empresa,
     cualquiera sirve) — `nodemailer` ya está instalado en el backend, sin usar todavía.
3. **Concesionario por punto, no solo por locación — CONSTRUIDO (2026-09-24)**: algunas locaciones
   (ej. Bahía Grande Nordelta) tienen varios proveedores distintos adentro, cada uno dueño de un
   cartel/punto específico — el `concesionario_id` único de `locaciones` no alcanzaba. Cadena de
   resolución de más a menos específico: `locaciones_puntos.concesionario_id` →
   `locaciones_capacidad.concesionario_id` → `locaciones.concesionario_id` (default sin cambios
   para locaciones simples). `listarPeriodo`/`listarConcesionarios`/`listarCondiciones` de
   Liquidaciones ya resuelven por esta cadena. Además se agregó **reparto**
   (`locaciones_capacidad_reparto`) para un soporte que se vende siempre como paquete completo pero
   reparte ingreso entre varios dueños (sin que la orden elija nada).
   **Bahía Grande Nordelta, resuelto**: PPLs (20 caras/10 elementos) repartidos 10/10 entre
   **ASOCIACION CIVIL BAHIA GRANDE S.A.** ("AVN Nordelta") y **FIDEICOMISO LOFTS DE BAHIA GRANDE**
   ("BA Property Managers"); Caja Backlight y Pantalla Gran Formato → AVN; Circuito Pantallas LED
   Verticales (4 pantallas = 2 totems, se vende siempre completo) → reparto 50/50 entre **ALQUICER
   S.R.L.** y **TERRA UNO S A**. Terra Uno cobra Canon reducido a 32% (80% del 40% real) porque el
   otro 20% (=8% flat del declarado) se lo lleva **Iris Chiterer** — tercero nuevo, mismo patrón de
   solapa propia que Esteban Vivo/Oxant pero sin cascada (un solo %), verificado con datos reales.
   Las 2 órdenes viejas de PPLs sin punto cargado ya se resolvieron (San Andres partida 2/2 entre
   Asociación y Lofts, Seven entera a Asociación). El usuario notó (2026-09-25) que, con todo esto
   construido, faltaba cargar el **Canon real** en "Canon por concesionario" — quedaban en el
   default 100% (incorrecto). Confirmado: los 4 cobran **40%** (Terra Uno ya estaba en 32% = su 80%
   del 40%) — se cargó AVN Nordelta 40%, Fideicomiso Lofts 40%, Alquicer 40% (IVA 21% los tres).
   Gigantografía (1 punto, "Mirando Ruta 27") → AVN Nordelta, confirmado 2026-09-25. **Con esto,
   Bahía Grande Nordelta queda 100% resuelta** — todos los soportes con dueño y Canon real cargado,
   sin pendientes.
4. **Integración con Asana**: idea diseñada (botón manual por orden, tarea compartida a 3
   proyectos reales de Asana) pero no construida — guardada para más adelante.
5. **Bug conocido en Reportes**: la tarjeta "Órdenes revisadas" todavía cuenta todas las órdenes,
   no solo las revisadas.
6. **Export a Excel**: faltan opciones de formato (totales, colores por estado, secciones).
7. **Despliegue a producción**: ver [`PENDIENTE-PRODUCCION.md`](./PENDIENTE-PRODUCCION.md) —
   contraseñas sin hashear de verdad, CORS abierto, token de sesión predecible, falta servir el
   build del frontend, elegir hosting con disco persistente.
8. **Revisar privilegios de usuario y jerarquías a fondo**: no es urgente, pero queda pendiente.
   Al armar el permiso `topview_netos_ver` (netos post-comisión en Reportes, reservado a
   Administrador — ver más abajo) se vio que el patrón de seed en `backend/src/database.ts`
   ("todos los permisos menos estos") es frágil: un permiso nuevo se filtra a roles que no
   deberían tenerlo si no se lo excluye a mano (pasó en el momento, se corrigió). Además
   `requiereRol()` en `backend/src/middleware.ts` está roto (compara un UUID de rol contra un
   nombre tipo `'Administrador'`, nunca matchea) — no se usa todavía, pero conviene arreglarlo o
   sacarlo antes de que alguien lo use tal cual.
9. **World Padel Pilar: cuenta corriente de comerciales (trueque, no plata) — CONSTRUIDO
   (2026-09-24/25)**. WFPP SRL compensa espacios por trueque de spots publicitarios (60% Topview /
   40% World Padel), no por dinero. Fórmula verificada contra una captura real: `total_implícito =
   ventas_concesionario / %concesionario`, `cuota_topview = total_implícito × %topview`,
   `diferencia_mes = cuota_topview − ventas_topview`, `saldo_acumulado = saldo_anterior +
   diferencia_mes` (ej. WP vendió 6, Topview 2 → +7). Corte mensual con saldo que arrastra entre
   meses (cuenta corriente real), confirmado por el usuario. Una campaña vendida por el
   concesionario se identifica con el tipo de anunciante **"Pauta Concesionario"** (única señal —
   se probó primero con un tilde aparte en la orden, pero se fusionó a pedido del usuario para no
   repetir el lío de dos controles diciendo lo mismo). Elegir ese tipo destilda y bloquea
   automáticamente "Esta orden genera facturación", evita crear `replicaciones_facturacion`, y
   alimenta el conteo de comerciales del concesionario. Cálculo en una sección nueva **embebida
   dentro de "Liquidar"** del mismo concesionario (no una solapa aparte — pedido explícito: "cambia
   la forma de retribuirse nada más"), tabla con el ledger mes a mes. % configurables por
   concesionario (`condiciones_comerciales`, no hardcodeado a WFPP) editables en "Canon por
   concesionario". Verificado exacto con datos de prueba en ambas rondas: Topview 2, concesionario
   6 → diferencia +7, igual que la captura real. Con datos reales ya cargados por el usuario (7
   pautas de World Padel: IEB, OSDE, PAX, Padel Kids, SSI Seguridad, St. Matthew's, Universidad
   Austral) se encontró y corrigió un problema más: esas pautas aparecían mezcladas en la tabla de
   **Liquidar en $** con un campo de monto editable, junto a las ventas reales de Topview — sin
   sentido, porque Topview no cobra nada por ellas. Se excluyeron de `listarPeriodo` (correcto
   también para Oxant/Esteban Vivo/Iris Chiterer, que la reutilizan). La sección "Comerciales" ahora
   muestra además el **desagregado por anunciante** del mes elegido (Anunciantes Topview / Anunciantes
   Concesionario, cada uno con subtotal), igual que el documento real de referencia.
   Todavía el usuario notó que hasta las ventas REALES de Topview (San Andres, TOM) seguían pidiendo
   un monto $ — resultó que World Padel Pilar se paga **100% por trueque**, ni la parte de Topview
   cobra plata ahí. Se agregó `condiciones_comerciales.ocultar_liquidacion_dinero`, tildable en
   "Canon por concesionario" ("podemos ocultarla y desocultarla aca" — reversible, no hardcode): con
   el tilde activo, "Liquidar" no muestra ninguna tabla de $ para ese concesionario, solo la sección
   Comerciales. De paso se corrigió un bug: el botón "Percepciones / X" solo mostraba el primer
   tercero cuando un concesionario tenía más de uno (WFPP tiene Oxant y Comerciales a la vez) — ahora
   lista todos ("Percepciones / Oxant / Comerciales"). También se le agregó export Excel/PDF propio
   a la sección Comerciales (había quedado sin forma de exportar al ocultarse el bloque de $).
   **Ojo, pendiente sin resolver**: "Pauta Concesionario" todavía no excluye estas órdenes de
   Reportes de Ventas/Dashboard (Topview no se queda con esa plata) — sigue sumando ahí igual que
   cualquier otra; ahora sería trivial filtrarlas por tipo si se pide.
10. **Liquidar: Cliente/Agencia separado de Anunciante, sin columna Sección (2026-09-25)** — la
    tabla de "Liquidar" (y "Después del día 15") mostraba en "Anunciante / concepto" en realidad la
    razón social del cliente facturado (ej. CAPISCO S.A.), no el anunciante real (ej. OSDE) — misma
    confusión que ya se había corregido antes en Esteban Vivo. Se separó en dos columnas, igual que
    en el ingreso de órdenes: "Cliente/Agencia" y "Anunciante". Se sacó también la columna "Sección"
    (Publicidad/Stand) del listado (sigue calculándose igual en el resumen y en el export). El
    export Excel/PDF no se tocó, sigue mostrando "Anunciante" como antes.
11. **Órdenes: filtro por mes de ingreso por defecto + navegación mes a mes (2026-09-25)** — el
    listado no tenía filtro por defecto ni paginación, se veían todas las órdenes del histórico de
    una. Se cambió el default a "Mes de ingreso (venta)" = mes actual, con botones ◀/▶ para navegar
    mes a mes (con acarreo de año) en vez de paginación genérica por número — decisión explícita del
    usuario, encaja mejor con cómo ya piensa el negocio. "Ver todas" saca el filtro de mes/año sin
    tocar los demás filtros; "Limpiar filtro" sigue reseteando todo. Sin cambios en el backend.
12. **Módulo de Disponibilidad — pendiente, se construye en otra sesión/chat (Sonnet 5.5) a
    propósito**: el usuario quiere que un chat nuevo lo desarrolle sin tener que releer toda esta
    conversación (costo de tokens), pero con visión de integración futura a este sistema. Se dejó
    [`DISPONIBILIDAD-CONTEXTO-INTEGRACION.md`](./DISPONIBILIDAD-CONTEXTO-INTEGRACION.md) (raíz del
    repo) como briefing corto para pegar al arrancar esa sesión nueva: modelo de datos relevante
    (`locaciones`/`locaciones_capacidad`/`locaciones_puntos`/`ordenes_publicidad_detalles`, cómo se
    calcula ocupación vs. capacidad), convenciones a respetar (soft-delete, periodo_desde/hasta vs.
    mes_ingreso/ano_ingreso, nombres de permisos) y qué evitar duplicar. Nada de esto está construido
    todavía en este repo — es solo el puente de contexto para que el otro proyecto nazca compatible.
13. **Avisos automáticos a Telegram — construido, bot real configurado y funcionando
    (2026-10-01)**: dos disparadores automáticos al grupo "Operaciones"
    (`backend/src/services/telegram.ts`, mismo patrón que Asana): al cargar una orden nueva
    (inmediato, en el mismo POST) y "arranca hoy" (un solo mensaje agrupado, chequeo cada hora
    desde las 8am mientras el backend esté levantado — `TopviewService.avisarCampanasQueArrancanHoy`,
    idempotente). Tilde por orden "Avisar a Operaciones por Telegram" (default tildado). Los
    `chat_id` de los grupos viven en la tabla `telegram_grupos`, no en `.env`, porque ya viene un
    segundo grupo. Bot `@topview_ordenes_bot` cargado y probado con éxito contra el grupo
    "Operaciones" real. Se sumó además un **botón manual "Avisar a Operaciones"** (individual, en
    el detalle/formulario de la orden, y masivo, reusando la misma selección tildada de las
    acciones de Asana en el listado) — útil si el aviso automático falló o para órdenes viejas de
    antes de que existiera (`TopviewService.avisarOrdenATelegram`, marca
    `telegram_avisado_carga_en` igual que el automático). El mensaje incluye dónde sale la
    campaña: agrupado por soporte, con el total de cantidad y una línea por locación con su propia
    cantidad (`Nordelta CC (x11)`), agregando el punto de instalación siempre que exista — no solo
    cuando la locación se repite, ver corrección en el punto 21 — para que Operaciones sepa a qué
    instalación exacta ir a sacar fotos (ej. `Nordelta CC — Nordelta ruta 27 8x4 (x1)`, o el
    reparto de PPLs de Bahía Grande Nordelta entre Asociación y Lofts) — probado en seco contra
    varios casos reales (BNA, Iberia, GCBA Parkings, San Andrés, y 11 simulaciones más el
    2026-10-02) antes de confirmarlo. El tilde "Avisar a Operaciones por Telegram" ya cubre
    "avisar cuando yo decida": si se destilda al cargar, no dispara nada automático, y se avisa
    después con el botón manual cuando se quiera — confirmado con el usuario, no hace falta un
    selector más explícito en la UI.
14. **Reconciliación de octubre 2026 contra la planilla "Ingreso de Órdenes" — casi completa
    (2026-10-01), falta El Cronista**: se cruzaron las 65 filas de la planilla de octubre contra lo
    ya cargado en el sistema y se cargaron ~26 órdenes faltantes (clonando la estructura de
    septiembre — locaciones/soportes/comisionistas — y actualizando período/monto/descuentos según
    octubre), más 2 correcciones a órdenes ya cargadas que les faltaba la comisión en cascada
    (Corinthian/Iberia 20% NC + Ivan 9,09%; Banco Nación/TELAM 15%+25% MJ-F/MJ-$). Quedó pendiente
    **SENTIDOS S.A. / "El Cronista"** ($25.494.855 neto, 15% NC → final $21.670.626,75): nunca se
    cargó, no hay orden anterior en el sistema para clonar, y el usuario avisó que **hay un archivo
    de julio con esta info que tampoco está subido al sistema** — retomar pidiendo ese archivo (u
    otro documento real de El Cronista) para sacar la estructura de productos/ubicaciones antes de
    cargarla. De paso se encontraron y corrigieron dos bugs reales: el clonado automático (tanto por
    "vigencia hasta" como el manual del Timeline) solo chequeaba cliente+anunciante+mes para decidir
    si una orden "ya existe" ese mes — rompía con clientes que tienen varios circuitos/zonas
    simultáneos (ej. NAYA/Telecom Zona Norte y Zona Sur); ahora también exige que compartan
    locación (`TopviewService.buscarOrdenExistenteEnMes`). También se agregó un buscador de
    cliente/anunciante en el Timeline y autocompletado de "Vigencia hasta (nota libre)" desde el mes
    elegido en "Repetir automáticamente hasta" cuando esa nota está vacía.
15. **Dashboard de "Ejecución de campañas" — construido (2026-10-01)**: solapa nueva en Topview,
    primera, antes de Timeline (`frontend/src/components/EjecucionTab.tsx`). Independiente del
    listado comercial de Órdenes — mira nivel de ejecución operativa: estado (Cargada/Revisada/
    Facturada, con "REVISAR" como sub-bandera de pendiente), N° de factura/NC de Colppy, Asana
    (cargada/asignada), avisada por Telegram, documento adjunto, y **certificación de exhibición
    enviada** (campo nuevo, tildable a mano: `certificacion_enviada`). Toggle lista/tarjetas en el
    header (lista por defecto), filtros de mes/año/tipo/buscador, contadores clickeables, lo
    pendiente va primero con un banner explicando el motivo. "Pendiente" = REVISAR, o
    `monto_neto = 0` (excepto Pauta Concesionario, donde $0 es normal), o Facturada sin
    certificación. Se armó mockeando 2 opciones visuales en un Artifact antes de construir en
    React. De paso se limpió el formulario/detalle de orden para **Pauta Concesionario**: se
    ocultan Leyenda de factura, descuentos NC1/NC2/FC y "Neto Topview" (Topview no factura esas
    órdenes), pero se mantiene "Monto neto" porque lo sigue usando la cuenta corriente de
    comerciales de Liquidaciones.
16. **Fix de datos: `fecha_facturacion` en día 30 en vez del último día real (2026-10-01)**: 7
    órdenes clonadas automáticamente el 2026-09-27 (antes de un fix ya presente en el código
    actual — probado que `addMonthClamped` hoy funciona bien) habían quedado con la fecha de
    facturación en el día 30 de meses de 31 días (ej. 30/10 en vez de 31/10), mientras que
    `periodo_hasta` sí tenía el día correcto. Corregidas a mano (`fecha_facturacion = periodo_hasta`
    para esos 7 casos puntuales) — no hizo falta tocar código, era dato viejo.
17. **Fix de datos: `cantidad` en "1" en vez de la real en líneas de Circuito LED (2026-10-02)**:
    armando el mensaje de "Avisar a Operaciones" por Telegram (ver punto 13) se notó que "Circuito
    Pantallas LED Verticales" se vende siempre completo por locación, y la cantidad real de
    pantallas vive en el catálogo (`locaciones_capacidad`/`locaciones_puntos`, mismo criterio que
    el módulo de Disponibilidad), no en la línea de la orden — varias órdenes cargadas/clonadas el
    2026-10-01 (Zonaprop, ByD, Universidad Católica de la Plata, Telecom, 19 líneas en total)
    habían quedado con `cantidad = 1` en vez del número real. No afectó montos (`monto_neto` suma
    `precio` por línea, no `precio × cantidad`). Se corrigieron las 19 líneas, y el mensaje de
    Telegram ahora resuelve siempre la cantidad real del catálogo para este soporte en particular,
    sin confiar en la cantidad cargada en la orden.
18. **"Partir en una orden por mes" — construido (2026-10-02)**: checkbox nuevo en "Nueva orden"
    (debajo de "Repetir automáticamente hasta", mutuamente excluyentes), para cuando el usuario ya
    tipea el período completo de una (ej. 01/10 al 31/12) sabiendo que es correcto — a diferencia
    de "Repetir automáticamente hasta" (clona hacia adelante con `numero_orden_agencia = REVISAR`
    para completar después), acá ninguna orden generada queda en REVISAR porque el usuario ya
    validó el rango completo en el momento de cargarlo. Parte el período en una orden real por mes
    (`TopviewService.crearOrdenesPorMes`, mismo `addMonthClamped` que `generarClonesVigencia`,
    `POST /api/ordenes-publicidad/por-mes`) — el N° de orden de agencia solo se copia en la
    primera, los meses siguientes quedan sin número salvo que se cargue a mano por mes (punto 23). Se encontró y
    corrigió un bug real probando esto mismo: el fallback de fecha de facturación (cuando el campo
    queda vacío) usaba el fin del período completo en vez del fin del primer mes, corriendo cada
    mes posterior 2 meses de más.
19. **Incidente real + fix: mensajes de prueba llegaron al Telegram real de Operaciones
    (2026-10-02)**: probar "Partir en una orden por mes" (punto 18) creó órdenes de prueba
    ("TEST PARTIR POR MES BORRAR") contra la API real con el bot ya conectado, lo que disparó
    avisos reales de "Nueva orden cargada" al grupo "Operaciones" de verdad (visibles para el
    equipo). No se pudieron borrar esos 2 mensajes puntuales porque el código nunca guardaba el
    `message_id` que devuelve la API de Telegram al mandar un mensaje. Fix: `enviarMensaje` ahora
    devuelve el `message_id` real; cada envío exitoso de `enviarAGrupo` se loguea en la tabla nueva
    `telegram_mensajes` (grupo, chat_id, message_id, texto, orden relacionada, fecha); nuevo
    `TelegramService.borrarMensajeLogueado(id)` llama al `deleteMessage` real de la API; rutas
    `GET /api/telegram/mensajes` y `DELETE /api/telegram/mensajes/:id` para listar y borrar. Sirve
    para la próxima vez que esto pase — no reemplaza pasar `avisar_telegram: false` al probar
    features que crean órdenes contra la API viva.
20. **Fix: mensajes automáticos de Telegram sin tipo de anunciante ni ubicación (2026-10-02)**: el
    mensaje automático "Nueva orden cargada" (único y por-mes) todavía mostraba
    `(tipo_anunciante)` junto al nombre — regla ya decidida antes para el mensaje manual, pero
    nunca aplicada a los 2 disparadores automáticos; corregido en los 3 mensajes (incluido
    "Campañas que arrancan hoy"). Además, esos 2 avisos automáticos no mostraban dónde sale la
    campaña (soporte/locación) como sí lo hace el mensaje manual — se extrajo esa lógica a
    `TopviewService.construirBloqueUbicacion(ordenId)`, compartida entre los tres.
21. **Fix real: el punto de instalación faltaba cuando la locación no se repetía (2026-10-02)**:
    probando con una simulación real (Dermacycle, Nordelta CC) el usuario notó que el mensaje
    mostraba "Nordelta CC (x1)" sin decir CUÁL instalación — el código solo agregaba el punto de
    instalación cuando la misma locación aparecía más de una vez dentro de un soporte. El aviso
    existe para que Operaciones vaya a sacar fotos de la instalación exacta, así que el punto tiene
    que aparecer siempre que exista, se repita o no la locación. Corregido en
    `construirBloqueUbicacion` (afecta los 3 mensajes: manual y los 2 automáticos).
22. **Disparador 3 — "pauta por terminar" a Comercial, construido y funcionando (2026-10-02)**:
    recordatorio automático cuando una pauta está por terminar, para preguntarle al cliente si
    renueva. Un solo grupo "Comercial", no un chat por vendedor; el mensaje menciona al vendedor
    por nombre. Usa un bot de Telegram propio (`@Topview_comercial_bot`, distinto al de
    Operaciones) — se generalizó `telegram.ts` para que cada grupo pueda tener su propio
    `bot_token` (columna nueva en `telegram_grupos`; si no tiene uno propio, usa el del `.env` por
    defecto, así Operaciones sigue sin cambios). Al configurarlo salió un problema real: el bot
    nuevo tenía el modo privacidad de Telegram activado y no veía ningún mensaje del grupo (ni
    mencionándolo); se resolvió desactivándolo con @BotFather → `/setprivacy` → `Disable` — si se
    agrega un bot nuevo en el futuro, desactivar privacidad de entrada en vez de perder tiempo con
    menciones. Confirmado de punta a punta: mensaje de prueba real llegó al grupo.
    `TopviewService.avisarPautasPorTerminar` detecta "la
    última orden de la cadena" (cliente + anunciante + que comparta locación con otra orden activa
    de `periodo_hasta` más tardío — mismo criterio que ya evita duplicar clones) sin necesitar una
    tabla de cadenas: si existe una sucesora, no avisa; si no existe, es la última y dispara.
    Verificado contra datos reales (Dermacycle partida en Oct/Nov/Dic: solo Diciembre dispara).
    Ventana de 10 días (no día exacto, por si el backend no está levantado justo ese día),
    idempotente. Mismo formato que "Avisar a Operaciones" (fechas + ubicación), con el vendedor al
    frente. De paso se cargaron **Alvaro y Maximo como vendedores** (socios, responsables ante el
    cliente pero sin comisión) — cada uno con su propia escala en 0% que pisa la escala general de
    Dardo, sin tocar código (el mecanismo de escala propia por vendedor ya lo soportaba).
23. **"Partir por mes": N° de orden de agencia editable por mes (2026-10-02)**: en el recuadro
    "Al guardar se van a crear N órdenes" cada mes desde el 2º tiene un campo "N°" para cargar a
    mano el número de orden de agencia de ese mes (vacío = queda sin número, como antes; el 1º
    sigue usando el campo principal). Frontend `OrdenesTab.tsx` (estado `numerosPorMes`), backend
    `crearOrdenesPorMes` (`numeros_orden_agencia_por_mes`). Probado de punta a punta (2026-10-02)
    con órdenes de prueba: 3 meses con N° T1/T2/T3, sin REVISAR y sin aviso de Telegram. Al probarlo se
    vio que, si fallaba la creación de un mes intermedio, los meses ya creados quedaban: se hizo todo o
    nada (`crearOrdenesPorMes` deshace las ya creadas con `borrarOrdenCreadaDefinitivamente` y avisa;
    además exige fecha de facturación). Probado forzando una falla en el 2º mes: no quedó nada.
24. **Fix Asana: 404 "Unknown object" al regenerar tareas borradas a mano (2026-10-02)**: el
    usuario borró tareas directo en Asana y las volvió a crear desde la app; la app seguía con el
    `asana_task_gid` viejo guardado e intentaba actualizar una tarea inexistente (404). Verificado
    contra la API: token y proyecto "Sistema" bien; de 55 órdenes con tarea guardada, 53 apuntaban a
    tareas inexistentes. Fix en `asana.ts`: si el PUT da 404, se descarta el ID y se crea la tarea
    de nuevo (`generarTareaUnaOrden`); en `asignarResponsables` un 404 limpia el ID y avisa que hay
    que generarla otra vez. Se limpiaron a mano los 53 IDs muertos. Pendiente: que el usuario
    pruebe el botón de nuevo (crea tareas reales).
25. **"Eliminar" orden ahora borra también su tarea de Asana (2026-10-02)**: antes "Eliminar" solo
    hacía baja lógica (`habilitado = 0`) y la tarea quedaba huérfana en el proyecto "Sistema" (caso
    real: YPF N° 2026090194, borrada a mano ese día). Ahora la ruta `DELETE /api/ordenes-publicidad/:id`
    borra la tarea si la orden tiene `asana_task_gid`; si Asana falla, la baja igual queda hecha y se
    avisa en pantalla para borrarla a mano. El confirm del botón lo aclara. Probado de punta a punta
    (2026-10-02) con una orden de prueba: la tarea se creó en "Ordenes 2026 → Noviembre 26" y al
    eliminar la orden Asana dejó de encontrarla.
26. **Monto neto desactualizado al editar líneas (2026-10-02)**: caso YPF N° 2026100318 (línea de
    Parque C. Avellaneda con precio equivocado vs. el PDF: $2.599.883 en vez de $2.854.681). El
    Monto neto se guardó al cargar y al editar el formulario queda como valor manual fijo (la app
    usa `monto manual || suma de líneas`), así que no seguía los cambios de las líneas. Se agregó
    en el formulario un aviso cuando las líneas suman distinto que el Monto neto cargado, con botón
    "Usar la suma de las líneas". No se recalcula solo (muchas órdenes tienen el monto a mano con las
    líneas en 0); pendiente decidir si se auto-actualiza cuando el monto coincidía con la suma.
27. **Asana en producción: proyecto "Ordenes 2026" (2026-10-02)**: se salió del proyecto de prueba
    "Sistema". Config guardada en `asana_config`/`asana_secciones_mes`: proyecto "Ordenes 2026"
    (gid 1211935727977431), con cada mes de 2026 apuntando a su sección real ("Enero 26" … "Diciembre
    26"), así cada orden va a la sección de su mes de ingreso. Ojo: las ~54 órdenes que ya tenían
    tarea en "Sistema" conservan ese vínculo — antes de generar en el proyecto real hay que usar
    "Borrar tareas Asana" para esas (si no, se actualizaría la tarea vieja y quedaría en los dos
    proyectos). Las tareas de "Sistema" no se tocaron.
28. **Orden de lectura de las líneas de una orden (2026-10-02)**: las líneas de productos/soportes
    se muestran ordenadas — primero Circuito Pantallas LED Verticales, luego Video Wall, luego
    Pantalla Gran Formato, cualquier otro soporte al final; dentro de cada uno, alfabético por
    locación (`compararLineasPorSoporte` en `calculosTopview.ts`, con test). Aplica a la tarea de
    Asana, al aviso de Telegram y al detalle de la orden que usan la pantalla de detalle, el PDF y
    el formulario de edición. Las tareas ya creadas en Asana se ordenan recién al regenerarlas.
29. **Asana: reintentos ante 504/429/5xx (2026-10-02)**: "Asignar responsables" falló en 3 órdenes con
    504 "Server timed out" (timeout de Asana, no de los datos). `asana.ts` ahora reintenta hasta 4
    veces con espera creciente las llamadas repetibles sin riesgo (PUT/GET/DELETE/addTask); los POST
    que crean tareas/subtareas NO se reintentan para no duplicar. Sin probar contra un 504 real.
30. **World Padel: Pauta Concesionario excluida de Reportes (2026-10-02)**: `reporteOrdenes`
    (Reportes → Topview) ahora excluye `tipo_anunciante = 'Pauta Concesionario'` en todos sus cortes
    (por tipo, totales, mes de facturación/venta/registro, segmento, mix de soportes y top clientes).
    Verificado con datos reales: salen 24 órdenes (monto $0, así que los montos no cambian, pero sí
    la cantidad de órdenes y el mix de soportes). El "Dashboard" actual es solo la pantalla de
    bienvenida, sin datos de ventas, así que no había nada que excluir; si se le agregan métricas,
    aplicar el mismo filtro. Cierra el pendiente "Reportes/Dashboard" de World Padel.
31. **Asana: orden de subtareas Fotos → Link FB y Certificaciones → Facturar (2026-10-02)**: Asana
    inserta cada subtarea nueva arriba de las anteriores, así que quedaban al revés (Facturar,
    Link, Fotos). `asana.ts` ahora reordena con `setParent`/`insert_after` después de crearlas
    (`ordenarSubtareas`), solo si hace falta y sin tocar subtareas agregadas a mano. Aplicado a las
    54 tareas de octubre y verificado en Asana: todas en el orden nuevo, asignaciones intactas.
32. **Filtro "Tipo de anunciante" multi-selección (2026-10-02)**: en Órdenes y en Ejecución se pueden
    tildar varios tipos a la vez (ej. 5 de 6) sin cambiar el layout — componente
    `SelectorMultiple.tsx`: cerrado es un `<select>` (mismo estilo y tamaño que antes, muestra "Todos",
    el nombre si hay uno, o "N seleccionados"); al abrirlo da una lista con casillas. Vacío = Todos.
    En Ejecución el backend (`listarEjecucion`) acepta varios tipos separados por coma. Verificado:
    Órdenes de octubre 54 → 8 / 13 / 26 con 1 / 2 / 3 tipos; la API de Ejecución devuelve solo los
    tipos pedidos.
33. **Socios responsables cargados en las órdenes existentes (2026-10-02)**: con la lista que pasó el
    usuario (razón social + anunciante → Alvaro o Maximo) se asignó `vendedor_id` a todas las órdenes
    activas que coinciden (cliente + anunciante, en cualquier mes): 76 de Alvaro y 76 de Maximo. Las 46
    filas de la lista encontraron órdenes, sin conflictos ni pisar vendedores previos. Quedaron **42
    órdenes activas sin socio** (luego Ford Parque Fijo y los YPF Parque Fijo se asignaron a Alvaro, y TOM + todas las Pauta Concesionario a Maximo; GCBA, Zonaprop, AMEX, Ente Mixto y Cauquenes a Alvaro; Al Mundo, AVA Cancun e Inmobiliarias Berraz/Soldati a Maximo — quedó el 100% de las órdenes activas con socio) por no estar en la lista (AMEX, AVA Cancun, Al Mundo, Cauquenes, Ente
    Mixto de Promoción Turística, Ford Parque Fijo, GCBA a secas, Inmobiliaria Berraz/Soldati, TOM,
    YPF Parque Fijo Lubricantes/OEMs, Zonaprop y las "Pauta Concesionario": IEB, OSDE, PAX, SSI, St.
    Matthew's, Universidad Austral) — pendiente que el usuario diga a quién va cada una. Hecho
    por script directo a la base (backup en /tmp, no en el repo); las órdenes nuevas siguen
    eligiendo vendedor a mano en el formulario.
34. **Vendedor sugerido en órdenes nuevas (2026-10-02)**: al elegir el cliente en una orden NUEVA, si
    todavía no hay vendedor elegido, el formulario propone el de la orden más reciente de ese mismo
    cliente (con un aviso "Sugerido…"; queda editable y nunca pisa uno ya elegido ni se aplica al
    editar). Clientes sin órdenes previas siguen en "Sin vendedor asignado". Verificado en pantalla
    con YPF → Alvaro, DICAPRA → Maximo.

## Cómo trabaja este usuario (para que una sesión nueva no tenga que redescubrirlo)

- Prefiere construir con ejemplos concretos y reales, no specs completas de entrada — va
  definiendo reglas de negocio a medida que usa la app.
- Edita la app en vivo en su propio navegador mientras se conversa — un dato inesperado puede ser
  su edición real, no una corrupción. Antes de asumir un bug, comparar contra la base de datos.
- No usar la herramienta AskUserQuestion — su cliente no la recibe bien y la sesión queda
  trabada. Preguntar siempre en texto plano.
- Cuando pide un "status", espera que se listen también los pendientes pausados a propósito
  (como Esteban Vivo), no solo lo que está activo en el momento.
