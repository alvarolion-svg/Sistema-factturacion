# Sistema de Facturación

Una aplicación web moderna para gestión de facturas, clientes y reportes.

## Características

- 📋 **Gestión de Clientes**: Crear, editar y administrar clientes
- 📄 **Creación de Facturas**: Generar facturas personalizadas
- 📊 **Reportes y Análisis**: Visualizar ventas, ingresos y estadísticas

## Stack Tecnológico

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Base de Datos**: PostgreSQL (desarrollo con SQLite)
- **Herramientas**: Prettier, ESLint, Jest

## Estructura del Proyecto

```
Sistema-factturacion/
├── frontend/          # Aplicación React
├── backend/           # API REST con Express
├── docs/              # Documentación
└── package.json       # Scripts y dependencias compartidas
```

## Instalación

### Requisitos
- Node.js 18+
- npm o yarn

### Pasos

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Desarrollo

```bash
# Frontend
npm run dev:frontend

# Backend
npm run dev:backend

# Ambos simultáneamente
npm run dev
```

## Licencia

MIT
