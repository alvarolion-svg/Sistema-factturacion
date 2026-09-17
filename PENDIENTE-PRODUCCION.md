# Pendiente para salir a producción

Relevamiento hecho el 2026-09-17 para evaluar si el Sistema de Facturación está listo para
desplegarse fuera de esta Mac, con un uso previsto de **3 a 5 usuarios concurrentes**.

No es una lista genérica: cada punto está verificado contra el código real de este repo, con
archivo y línea, para que cualquiera (persona o sesión de Claude Code) pueda retomarlo sin
tener que volver a investigar desde cero.

**Importante**: nada de esto está corregido todavía. Es solo el diagnóstico.

---

## 🔴 Hay que tocar sí o sí antes de publicarla

### 1. Las contraseñas no están hasheadas de verdad

Archivo: `backend/src/services/autenticacion.ts`, líneas 5-8:

```ts
// Simulación de bcrypt (en producción usar librería real)
const simpleHash = (str: string): string => Buffer.from(str).toString('base64');
const simpleCompare = (plain: string, hash: string): boolean =>
  simpleHash(plain) === hash;
```

Esto es Base64, no un hash — es reversible en un segundo. El comentario en el propio código ya
avisa que es un simulacro. Cualquiera con acceso al archivo `backend/facturacion.db` puede leer
la contraseña real de cada usuario sin esfuerzo.

`bcrypt` **no está instalada** en `backend/package.json` — hay que agregarla y reemplazar
`simpleHash`/`simpleCompare`, y también el hasheo al crear usuario (`crearUsuario`, línea ~202,
usa `simpleHash(datos.password)`).

### 2. El token de sesión es predecible, no un JWT real

Mismo archivo, método `generarToken` (líneas 326-338):

```ts
private static generarToken(usuarioId: string, email: string, rolId: string, permisos: Permiso[]): string {
  const payload = {
    usuario_id: usuarioId,
    email,
    rol_id: rolId,
    permisos: permisos.map((p) => p.codigo),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  // En producción usar JWT real, esto es una versión simplificada
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}
```

`jsonwebtoken` **sí está instalada** (`backend/package.json`) pero no se usa en ningún lado del
código (`grep -rn jsonwebtoken backend/src` no devuelve nada). El token es un JSON con datos
previsibles (email, timestamp de login al segundo) codificado en Base64, sin firma.

Punto a favor: cada pedido vuelve a validar la sesión contra la tabla `sesiones` en la base de
datos (`AutenticacionService.verificarToken`, mismo archivo, línea 146) — no alcanza con inventar
un token cualquiera, porque no hay una fila de sesión activa que lo respalde. Pero como el valor
en sí es adivinable, alguien que sepa el email de un usuario y más o menos cuándo entró podría
reconstruirlo. Con 3-5 usuarios conocidos el riesgo es bajo, pero conviene cerrarlo antes de
exponer la app a internet — usar `jsonwebtoken` (ya instalada) o generar el token con
`crypto.randomBytes` en vez de derivarlo de datos previsibles.

### 3. CORS está abierto a cualquier origen

Archivo: `backend/src/index.ts`, líneas 25-30:

```ts
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
```

Y el propio `backend/.env.example` sugiere `CORS_ORIGIN=*` como valor de ejemplo. Hoy, sin un
`.env` real que lo pise, cualquier sitio web puede hacerle pedidos a este backend usando la sesión
de un usuario logueado. Hay que fijar `CORS_ORIGIN` al dominio real donde viva el frontend en
producción.

### 4. Falta servir el build de producción del frontend

Archivo: `backend/src/index.ts`, línea 75:

```ts
app.use(express.static(path.join(__dirname, '../../frontend/public')));
```

Esto sirve `frontend/public` (los logos e imágenes sueltas), **no** `frontend/dist` (el build real
de React que genera `npm run build`). Los scripts de build y arranque ya existen y funcionan
(verificados: compilan sin errores):

- `backend/package.json`: `"build": "tsc"`, `"start": "node dist/index.js"`
- `frontend/package.json`: `"build": "tsc && vite build"` → genera `frontend/dist/`

Pero falta la línea que conecte todo: agregar
`app.use(express.static(path.join(__dirname, '../../frontend/dist')))` (o servirlo por separado)
para que un solo servidor pueda entregar la app completa. Sin este cambio, la app no arranca en
producción tal como está hoy.

### 5. El archivo de base de datos y los adjuntos necesitan disco persistente

- Base de datos: `backend/src/database.ts` línea 4, `const dbPath = path.join(__dirname, '..', 'facturacion.db')` — un archivo SQLite en el disco del backend (hoy 2.1 MB).
- Adjuntos de órdenes (subidos con `multer`): `backend/src/index.ts` línea 35,
  `const UPLOADS_DIR = path.join(__dirname, '../uploads')`, organizados por año/mes (hoy 32 KB,
  1 archivo).

Esto no es un cambio de código, es una condición del hosting: si el disco se borra en cada
reinicio o cada despliegue nuevo, se pierde la base de datos entera y los adjuntos. Ver la
sección de hosting más abajo.

---

## 🟡 Conviene, pero puede esperar

### 6. SQLite sin modo WAL ni `busy_timeout`

`backend/src/database.ts` no configura ningún `PRAGMA` (verificado: no hay `journal_mode`,
`busy_timeout` ni `WAL` en el archivo). Con 3-5 usuarios el volumen no es problema — **no hace
falta migrar a Postgres**, sería de más para este tamaño — pero sin este ajuste, si dos personas
graban algo en el mismo instante exacto, la segunda puede recibir un error en vez de esperar su
turno. Es agregar dos líneas al conectar la base (`journal_mode = WAL` y `busy_timeout`), no una
migración.

### 7. Sin límite de intentos de login ni cabeceras de seguridad estándar (helmet)

No hay `express-rate-limit` ni `helmet` instalados (verificado en `backend/package.json`). Para
3-5 usuarios internos conocidos no es urgente, pero es barato de sumar antes de dejar la app
expuesta a internet de forma permanente.

### 8. Los errores devuelven el mensaje interno tal cual

`err.message` se manda directo al cliente en 125 lugares de `backend/src/index.ts`. No es grave
para uso interno, pero de cara a internet es mejor no exponer detalles internos del servidor en
los mensajes de error.

---

## ✅ Ya está bien, sin cambios necesarios

- **Variables de entorno**: `dotenv` ya está integrado (`backend/src/index.ts` línea 19,
  `dotenv.config()`), y existe `backend/.env.example` como plantilla. Solo falta completar un
  `.env` real en el servidor de producción con los valores correctos (dominio, puerto, etc.). No
  hay ningún `.env` real commiteado al repo (confirmado, no hay riesgo de secretos filtrados).
- **Sin rutas ni URLs hardcodeadas de esta Mac**: no hay ningún `/Users/alvaro/...` ni
  `localhost` en el código fuente de `backend/src` ni `frontend/src` (verificado con grep). El
  frontend llama todo con rutas relativas (`/api/...`), que es justo lo que hace falta para que
  funcione en cualquier servidor sin tocar código.
- **Build y arranque**: `npm run build` y `npm start` (tanto en la raíz como en cada carpeta)
  compilan y funcionan sin errores — probado en esta sesión.

---

## Qué tipo de hosting le encaja a esta app en particular

Necesita un **servidor con disco persistente propio** (una VPS chica, o un servicio tipo
Railway/Render con un "volumen" persistente contratado) — no algo "serverless" genérico. El
motivo es concreto: la base de datos es un archivo SQLite (`backend/facturacion.db`) y los
adjuntos se guardan en una carpeta del disco (`backend/uploads/`). El disco no puede borrarse
solo nunca.

**Evitar activamente**:
- **Heroku** (plan estándar): el disco se borra en cada reinicio del dyno — se perdería la base
  de datos entera.
- **Vercel / Netlify** para el backend: son "serverless", sin disco persistente — la app ni
  arrancaría con SQLite.

**Opciones que sí calzan** (de más simple a más manual):
- Una VPS chica (DigitalOcean, Hetzner) o un servicio tipo Railway/Render **con volumen
  persistente contratado**: instalar Node, correr el backend con algo como `pm2` para que se
  mantenga vivo, y poner un dominio con HTTPS por delante (nginx + Let's Encrypt, o el proxy que
  ofrezca el proveedor).

Con 3-5 usuarios, el servidor más chico y barato de cualquiera de esos proveedores alcanza de
sobra — el cuello de botella nunca va a ser la capacidad de la máquina, va a ser tener el disco
persistente y las contraseñas bien protegidas (puntos 1 y 5 de arriba).

---

## Orden sugerido de trabajo

1. Contraseñas con `bcrypt` (punto 1) — es el más urgente, no requiere decidir hosting antes.
2. CORS restringido + token de sesión no predecible (puntos 2 y 3).
3. Servir `frontend/dist` desde el backend (punto 4).
4. Elegir hosting con disco persistente y desplegar (punto 5).
5. WAL + `busy_timeout`, helmet, rate limiting, no exponer `err.message` (puntos 6-8) — se pueden
   hacer después de estar ya en producción, no bloquean el lanzamiento.
