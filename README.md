# Sistema de Facturación

Sistema de gestión y facturación hecho a medida para **Topview**, una empresa argentina de
publicidad exterior (OOH/DOOH): vende espacio publicitario (pantallas LED, carteles backlight,
gigantografías, video walls, PPLs) instalado en locaciones físicas, directo o vía agencias y
comisionistas en cascada. Además de Topview, el sistema cubre Clientes, Proveedores, Gastos,
Facturas, Productos, Tesorería, Usuarios y Auditoría — pero **Topview es el módulo core**.

## Stack

- **Frontend**: React 18 + TypeScript + Vite (puerto 5173)
- **Backend**: Node.js + Express + TypeScript (puerto 5000/5001)
- **Base de datos**: SQLite, sin ORM (SQL directo por servicio)

## Estructura

```
Sistema-factturacion/
├── frontend/
│   └── src/
│       ├── components/      # Vistas y pestañas (Topview, Clientes, Tesorería, etc.)
│       ├── types/
│       └── utils/
├── backend/
│   └── src/
│       ├── index.ts         # Servidor y rutas
│       ├── database.ts      # Esquema e inicialización de SQLite
│       ├── middleware.ts    # Autenticación y permisos
│       └── services/        # Lógica de negocio por módulo (topview.ts es el más grande)
├── CLAUDE.md                 # Documentación técnica para trabajar con Claude Code en este repo
├── BITACORA-PROYECTO.md      # Estado actual, decisiones tomadas y pendientes abiertos
└── PENDIENTE-PRODUCCION.md   # Qué falta antes de desplegar esto fuera de un entorno local
```

## Módulos principales

- **Topview**: órdenes de publicidad (venta, comisiones en cascada, agencias, vendedores),
  catálogo de locaciones/soportes/concesionarios, Timeline de continuidad de clientes,
  Liquidaciones a concesionarios (con terceros propios como Esteban Vivo y Oxant), integración
  con Asana y avisos automáticos a Telegram.
- **Clientes, Proveedores, Gastos, Facturas, Productos, Tesorería**: CRUD completo con cuentas
  corrientes y movimientos contables.
- **Usuarios y roles**: autenticación con permisos granulares por sección y por rol
  (Administrador, Gerente, Contador, Vendedor, Comprador, Operario).
- **Auditoría**: registro de cada operación (tabla, tipo, datos antes/después, usuario, fecha).
- **Reportes**: ventas, compras, financieros, impositivos, por cliente/proveedor, con export a
  Excel/PDF.

Para el detalle real de qué está construido, verificado y pendiente, ver
[`BITACORA-PROYECTO.md`](./BITACORA-PROYECTO.md) — se mantiene más al día que este archivo.

## Instalación y uso

### Requisitos
- Node.js 18+
- npm

### Instalación

```bash
npm install
```

### Desarrollo

```bash
# Frontend + backend simultáneamente
npm run dev

# Por separado
npm run dev:frontend   # http://localhost:5173
npm run dev:backend    # http://localhost:5000 (o 5001 según PORT)
```

Variables de entorno del backend en `backend/.env` (basado en `backend/.env.example`).

### Otros comandos

```bash
npm run build          # build de producción
npm run type-check     # chequeo de tipos
npm run lint           # linting
npm run format         # formateo
```

## Estado del proyecto

Este sistema corre hoy localmente, con datos reales de Topview ya cargados. **Todavía no está
desplegado en producción** — antes de exponerlo fuera de un entorno local hay pendientes de
seguridad reales (contraseñas, CORS, token de sesión, hosting). Ver
[`PENDIENTE-PRODUCCION.md`](./PENDIENTE-PRODUCCION.md) para el relevamiento completo.

## Licencia

MIT

---

Desarrollado con [Claude Code](https://claude.ai/code)
