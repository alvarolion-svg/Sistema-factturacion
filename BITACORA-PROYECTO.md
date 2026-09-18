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
  Condiciones, Comisiones en efectivo, Vendedores — todo con datos reales cargados (44 órdenes de
  publicidad, 268 clientes, 506 proveedores).
- **Catálogo de Locaciones** (`locaciones` + `locaciones_capacidad` + `locaciones_puntos`): 16
  locaciones reales (el usuario las va sumando/editando en vivo, así que este número crece solo),
  cada una con su inventario de soportes y, opcionalmente, puntos de instalación con nombre propio
  ("posiciones" en la interfaz). Las órdenes ya pueden asociar cada línea de producto a una
  locación + posición real (reemplaza de a poco el texto libre de ubicación viejo, que se conserva
  como respaldo).
  - **Concesionarios asignados: 6 de 16** — Nordelta CC → CECNOR SA, World Padel Pilar → WFPP SRL,
    Av Corrientes y Boulogne Sur Mer → CARTELES NORTE SRL, Hey Add Center → PILAR SHOPS S.A.,
    Santa Bárbara → PASEO SANTA BARBARA S.A., Parkings CABA - Park Work → PARK WORK S.R.L. El
    resto todavía no tiene concesionario (proveedor al que Topview le paga por el espacio)
    asignado.
  - Las 3 órdenes de YPF (2026080187, 2026080296, 2026080245) se usaron como caso de prueba real
    para anotar líneas de orden con locación/soporte/posición — están las tres idénticas en
    soportes, sirven de referencia para seguir cargando el resto.
- **Clientes, Proveedores, Gastos, Facturas, Productos, Tesorería, Usuarios, Auditoría,
  Reportes**: pantallas completas, CRUD funcionando.
- **Reportes → Topview** tiene gráficos de facturación bruta (mensual y por tipo de anunciante) y
  un desglose de netos post-comisión (monto final, ganancia, comisión por comisionista con/sin
  factura) que **solo ve Administrador** — el backend directamente no manda esos campos a nadie
  más, no es un tema de ocultar en pantalla (permiso `topview_netos_ver`).
- **Topview → Comisionistas** (ambas tablas — "Cuánto traccionan las ventas" y "Ficha de
  comisionistas") es **Administrador únicamente** (permiso `topview_comisionistas_ver`, sacado de
  Gerente). El reporte de comisiones tiene filtro por mes/año/tipo (Tipo 1 con factura, Tipo 2
  efectivo, o ambas), detalle expandible por comisionista con las campañas/clientes que la
  conforman, marca de "sin órdenes" cuando no hubo actividad en el período filtrado, y exportar a
  Excel/PDF.
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

1. **Concesionarios sin asignar**: 10 de 16 locaciones (ver arriba). "World Padel Center Pilar"
   ya se resolvió creando el proveedor WFPP SRL con su CUIT real.
2. **Módulo Liquidaciones a locatarios**: diseñado (pantalla de carga manual por
   concesionario/mes + reporte PDF para mandarle al locatario), con mockups ya hechos, pero **no
   construido** — bloqueado hasta terminar de asignar concesionarios y cargar más órdenes con
   locación/soporte real. Suma dos vueltas más, mismo patrón (un tercero que se cuelga de la
   liquidación de un concesionario, con su propia fila/campo por campaña):
   - **OXANT GROUP S.R.L.** cobra un **%** de lo que Topview le liquida a CECNOR SA, World Padel
     Pilar (WFPP SRL) y Hey Add Center (Pilar Shops S.A.).
   - **Esteban Vivo** trajo los concesionarios de **Parque C. Avellaneda** y **Pueblo Caamaño** —
     cuando se liquide cualquiera de esos dos, tiene que replicarse automáticamente la misma lista
     de campañas con un campo aparte para cargarle a mano cuánto se le paga (monto fijo, no %).
3. **Concesionario por punto, no solo por locación**: algunas locaciones (ej. Bahía Grande
   Nordelta) tienen varios proveedores distintos adentro, cada uno dueño de un cartel/punto
   específico — el modelo actual (`concesionario_id` único en `locaciones`) no alcanza. Diseño ya
   acordado: cadena de herencia punto → soporte → locación (el de la locación sigue siendo el
   default para los casos simples). No construido — bloqueado hasta que el usuario averigüe el
   desglose real de proveedores de Bahía Nordelta. Afecta directo al módulo de Liquidaciones
   (ítem 2), que va a tener que resolver el concesionario por esta misma cadena. **Pistas
   parciales**: tres de los proveedores reales que son parte de Bahía Nordelta son **IRIS
   CHITERER**, **FIDEICOMISO LOFTS DE BAHIA GRANDE** y **ALQUICER S.R.L.** — todavía falta saber
   qué soporte/punto puntual le corresponde a cada uno. Esteban Vivo (ver ítem 2) **no** es parte
   de esta lista de Bahía Nordelta — es un caso aparte, ya resuelto y explicado más arriba.
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

## Cómo trabaja este usuario (para que una sesión nueva no tenga que redescubrirlo)

- Prefiere construir con ejemplos concretos y reales, no specs completas de entrada — va
  definiendo reglas de negocio a medida que usa la app.
- Edita la app en vivo en su propio navegador mientras se conversa — un dato inesperado puede ser
  su edición real, no una corrupción. Antes de asumir un bug, comparar contra la base de datos.
- No usar la herramienta AskUserQuestion — su cliente no la recibe bien y la sesión queda
  trabada. Preguntar siempre en texto plano.
- Cuando pide un "status", espera que se listen también los pendientes pausados a propósito
  (como Esteban Vivo), no solo lo que está activo en el momento.
