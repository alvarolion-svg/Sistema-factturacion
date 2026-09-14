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

## Próximos Pasos

1. Implementar rutas de API para clientes
2. Crear modelos de base de datos
3. Implementar formularios en React
4. Agregar validación de datos
5. Implementar reportes y gráficos

---

Generated with Claude Code
