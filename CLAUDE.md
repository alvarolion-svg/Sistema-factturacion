# Documentación del Proyecto - Sistema de Facturación

## Visión General

Sistema web completo de facturación con gestión de clientes, creación de facturas y reportes analíticos.

## Arquitectura

### Frontend
- **Framework**: React 18 + TypeScript
- **Bundler**: Vite
- **Puerto**: 5173
- **Ubicación**: `/frontend`

### Backend
- **Framework**: Node.js + Express
- **Lenguaje**: TypeScript
- **Puerto**: 5000
- **Ubicación**: `/backend`

## Estructura de Carpetas

```
Sistema-factturacion/
├── frontend/
│   ├── src/
│   │   ├── main.tsx        # Entry point
│   │   ├── App.tsx         # Componente principal
│   │   ├── App.css         # Estilos principales
│   │   └── index.css       # Estilos globales
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/
│   ├── src/
│   │   └── index.ts        # Entry point del servidor
│   ├── tsconfig.json
│   ├── .env.example
│   └── package.json
├── package.json            # Scripts de monorepo
├── README.md
├── CLAUDE.md              # Este archivo
└── .gitignore
```

## Características Implementadas

- [x] Estructura base del proyecto
- [x] Configuración de React + TypeScript + Vite
- [x] Configuración de Node.js + Express + TypeScript
- [x] Estilos iniciales y UI básica
- [x] Scripts para desarrollo

## Características Pendientes

- [ ] Gestión de clientes (CRUD)
- [ ] Gestión de productos (CRUD)
- [ ] Creación de facturas
- [ ] Reportes y gráficos
- [ ] Autenticación y autorización
- [ ] Base de datos
- [ ] Exportación a PDF

## Comandos Útiles

```bash
# Instalar dependencias
npm install

# Desarrollo (frontend + backend simultáneamente)
npm run dev

# Desarrollo solo frontend
npm run dev:frontend

# Desarrollo solo backend
npm run dev:backend

# Build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Formateo
npm run format
```

## Variables de Entorno

Crear archivo `.env` en el backend basado en `.env.example`:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=facturacion
DB_USER=postgres
DB_PASSWORD=postgres
CORS_ORIGIN=http://localhost:5173
```

## Proxies Configurados

- Frontend proxea `/api/*` a `http://localhost:5000/api`
- Esto permite llamadas directas a `/api/...` desde el frontend

## 🔐 Sistema de Autenticación y Roles

### Roles Predefinidos

| Rol | Nivel | Descripción | Acceso |
|-----|-------|-------------|--------|
| Administrador | 1 | Acceso total al sistema | TODO |
| Gerente | 2 | Gestión general del negocio | Todo excepto auditoría y usuarios |
| Contador | 3 | Acceso a finanzas y reportes | Tesorería, reportes, auditoría (consulta) |
| Vendedor | 4 | Gestión de ventas y clientes | Ventas, presupuestos, facturas, clientes |
| Comprador | 5 | Gestión de compras | Compras, órdenes, proveedores |
| Operario | 6 | Consulta de datos limitada | Solo lectura de todos los datos |

### Permisos por Sección

**Dashboard**
- `dashboard_ver` - Ver dashboard

**Ventas**
- `facturas_crear`, `editar`, `eliminar`, `ver`
- `presupuestos_crear`, `ver`
- `cobros_registrar`
- `notas_credito_crear`

**Compras**
- `compras_crear`, `editar`, `ver`
- `gastos_crear`, `ver`

**Maestros**
- `productos_crear`, `editar`, `ver`
- `clientes_crear`, `editar`, `ver`
- `proveedores_crear`, `ver`

**Tesorería**
- `tesoreria_ver`
- `cuentas_crear`, `editar`

**Reportes**
- `reportes_ventas`
- `reportes_compras`
- `reportes_financieros`
- `reportes_impositiva`

**Auditoría**
- `auditoria_ver`
- `usuarios_gestionar`

### Flujo de Autenticación

```
1. POST /api/auth/login
   {
     "email": "usuario@empresa.com",
     "password": "contraseña"
   }

2. Respuesta:
   {
     "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "usuario": { ... },
     "sesion": { ... }
   }

3. Usar token en todas las rutas:
   Authorization: Bearer <token>

4. POST /api/auth/logout
   - Invalida la sesión
```

### Credenciales por Defecto

```
Email: admin@system.local
Contraseña: admin123
Rol: Administrador
```

### Endpoints de Usuarios

```
GET /api/usuarios
- Listar todos los usuarios
- Requiere: usuarios_gestionar

POST /api/usuarios
- Crear nuevo usuario
- Requiere: usuarios_gestionar
- Body: { nombre, email, password, rol_id, departamento }

PUT /api/usuarios/:id/rol
- Cambiar rol de usuario
- Requiere: usuarios_gestionar
- Body: { nuevo_rol_id }
```

## 📊 Reportes Dinámicos por Rol

### Reporte de Ventas
```
GET /api/reportes/ventas?fecha_inicio=2024-01-01&fecha_fin=2024-12-31&estado=Cobrada
- Datos: Facturas, totales, montro cobrado/pendiente
- Requiere: reportes_ventas
```

### Reporte de Compras
```
GET /api/reportes/compras
- Datos: Órdenes, gastos, proveedores
- Requiere: reportes_compras
```

### Reporte Financiero
```
GET /api/reportes/financieros
- Datos: Cuentas, saldos, movimientos últimos 30 días
- Requiere: reportes_financieros
```

### Reporte Impositiva
```
GET /api/reportes/impositiva?mes=9&ano=2024
- Datos: IVA CF/DF, IIBB, Percepciones
- Requiere: reportes_impositiva
```

### Reporte de Clientes
```
GET /api/reportes/clientes
- Datos: Clientes, deuda, cantidad de facturas
- Requiere: clientes_ver
```

### Reporte de Proveedores
```
GET /api/reportes/proveedores
- Datos: Proveedores, deuda, órdenes de compra
- Requiere: proveedores_ver
```

### Reporte de Auditoría
```
GET /api/reportes/auditoria?tabla=facturas&usuario_id=x&fecha_inicio=...
- Datos: Historial completo de cambios
- Requiere: auditoria_ver
```

## 🔍 Auditoría Integrada

Cada operación registra:
- **usuario_id**: Quién realizó la operación
- **usuario_nombre**: Nombre del usuario
- **tabla**: Qué tabla fue modificada
- **tipo_operacion**: INSERT, UPDATE, DELETE
- **datos_anteriores**: Valores antes del cambio
- **datos_nuevos**: Valores después del cambio
- **ip**: IP desde donde se realizó
- **created_at**: Fecha y hora exacta

## 🚀 Próximos Pasos

1. ✅ Autenticación y roles implementados
2. ✅ Reportes dinámicos implementados
3. ✅ Auditoría integrada
4. ⭕ Frontend: Página de login
5. ⭕ Frontend: Protección de rutas
6. ⭕ Frontend: Controles de UI por permisos
7. ⭕ Frontend: Dashboards personalizados por rol
8. ⭕ Generar PDF de reportes
9. ⭕ Exportar a Excel
10. ⭕ Gráficos interactivos

---

Generated with Claude Code
