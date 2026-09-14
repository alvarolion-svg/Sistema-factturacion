# Sistema de Facturación - ERP Completo

Una aplicación web profesional de gestión financiera y contable con HTML vanilla + Node.js + SQLite.

## 🎯 Características Principales

### Dashboard
- 📈 Métricas en tiempo real (ventas, cuentas por cobrar/pagar, tesorería)
- 🔄 Estado completo del negocio

### Ventas
- 💰 **Presupuestos**: Crear y enviar presupuestos a clientes
- 📄 **Facturas**: Generación de facturas con validación ARCA
- 📋 **Facturas sin validar**: Se pueden eliminar completamente
- 📝 **Notas de Crédito**: Para anular facturas validadas
- 💳 **Cobros**: Registro de pagos con actualización de cuentas corrientes

### Compras y Gastos
- 🛒 Órdenes de compra
- 💸 Gestión de gastos
- 📊 Control de proveedores

### Base de Datos (Maestros)
- 📦 Productos (código, nombre, precio, stock)
- 👥 Clientes (razón social, CUIT, contacto)
- 🏢 Proveedores

### Situación Impositiva
- 🧾 IVA CF (Compras)
- 🧾 IVA DF (Ventas)
- 📊 IIBB
- 💰 Percepciones

### Tesorería
- 💵 Cajas (ARS, USD)
- 🏦 Bancos
- 📊 Cuentas corrientes con clientes y proveedores
- 📈 Movimientos contables

### Auditoría
- 🔍 Registro completo de todas las operaciones
- 👤 Usuario responsable
- ⏰ Fecha y hora
- 📝 Antes y después de cambios

## 🏗 Arquitectura

```
Sistema-factturacion/
├── backend/               # API REST con Express + TypeScript
│   ├── src/
│   │   ├── index.ts       # Servidor y rutas
│   │   ├── database.ts    # Inicialización SQLite
│   │   ├── types.ts       # Interfaces TypeScript
│   │   └── services/
│   │       ├── ventas.ts  # Lógica de facturas y cobros
│   │       ├── tesoreria.ts # Movimientos contables
│   │       └── auditoria.ts # Registro de cambios
│   └── facturacion.db     # Base de datos SQLite
│
├── frontend/              # Interfaz HTML + JavaScript
│   └── public/
│       ├── index.html     # Interfaz principal
│       ├── css/
│       │   └── styles.css # Estilos modernos y responsivos
│       └── js/
│           ├── api.js     # Cliente HTTP
│           └── app.js     # Lógica de UI
│
└── package.json           # Scripts principales
```

## 📊 Stack Tecnológico

- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla
- **Backend**: Node.js + Express + TypeScript
- **Base de Datos**: SQLite (archivo local, sin dependencias)
- **Validación**: TypeScript types
- **Auditoría**: Registro completo de operaciones

## 🚀 Instalación y Uso

### Requisitos
- Node.js 18+
- npm o yarn

### Instalación

```bash
# Clonar o navegar al proyecto
cd Sistema-factturacion

# Instalar dependencias
npm install
```

### Ejecución

#### Opción 1: Ambos simultáneamente (Recomendado)
```bash
npm run dev
```
- Backend: http://localhost:5000
- Frontend: Abre desde el navegador

#### Opción 2: Por separado
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
# Navega a http://localhost:5000/
```

## 📝 Lógica de Negocio Implementada

### Flujo de Ventas
1. **Creación de Factura**
   - Se crea factura con estado "Abierta"
   - Se actualiza CC del cliente (DEBE +monto)
   - Se registra auditoría completa

2. **Cobro de Factura**
   - El dinero entra en cuenta bancaria
   - La CC del cliente se reduce
   - Si saldo = 0, la factura se marca "Cobrada"
   - Se registra movimiento contable

3. **Anulación - Factura Validada ARCA**
   - Se crea Nota de Crédito
   - La factura se marca "Anulada"
   - Se devuelve el monto a la CC del cliente
   - NO se borra el registro (trazabilidad)

4. **Anulación - Factura sin Validar**
   - Se elimina la factura completamente
   - Se devuelve el dinero a CC
   - Se registra DELETE en auditoría

### Cuentas Corrientes
- **CC Clientes**: Deuda del cliente con la empresa
- **CC Proveedores**: Deuda de la empresa con proveedores
- Se actualizan automáticamente con cada operación

### Movimientos Contables
Cada transacción genera un movimiento que registra:
- Cuenta origen y destino
- Monto
- Saldos anterior y nuevo
- Tipo de documento relacionado

## 🔐 Auditoría Completa

Cada operación registra:
- **Tabla** afectada
- **Tipo de operación** (INSERT, UPDATE, DELETE)
- **ID del registro**
- **Datos anteriores y nuevos**
- **Usuario** responsable
- **Fecha y hora**
- **IP** (cuando sea aplicable)

## 📋 API REST Disponible

### Productos
- `GET /api/productos` - Listar
- `POST /api/productos` - Crear

### Clientes
- `GET /api/clientes` - Listar
- `POST /api/clientes` - Crear

### Facturas
- `POST /api/facturas` - Crear
- `GET /api/facturas/:id` - Ver detalle

### Cobros
- `POST /api/cobros` - Registrar cobro

### Notas de Crédito
- `POST /api/notas-credito` - Crear

### Tesorería
- `GET /api/tesoreria/estado` - Estado completo
- `POST /api/cuentas` - Crear cuenta

### Auditoría
- `GET /api/auditoria/:tabla/:id` - Ver historial

## 🔧 Desarrollo

### Agregar nuevo endpoint
1. Crear método en `backend/src/services/`
2. Agregar ruta en `backend/src/index.ts`
3. Llamar desde `frontend/public/js/api.js`
4. Actualizar UI en `frontend/public/js/app.js`

### Agregar tabla a BD
1. Editar `backend/src/database.ts`
2. Crear tipo en `backend/src/types.ts`
3. Crear servicio si es necesario

## 📦 Construcción para Producción

```bash
npm run build
npm start
```

## 📄 Licencia

MIT

---

**Desarrollado con Claude Code** 🚀
https://claude.ai/code
