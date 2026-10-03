#!/bin/bash
# Respaldo de la base del sistema (facturacion.db).
#
# - Usa "sqlite3 .backup": copia consistente aunque el backend esté escribiendo.
# - Verifica la copia (PRAGMA integrity_check) antes de guardarla; si falla, no la guarda.
# - La comprime (6 MB -> ~0,7 MB).
# - Copia LOCAL: ~/Backups/Sistema Facturacion/facturacion-2026-10-02_1300.db.gz — se
#   conservan las últimas CANTIDAD_A_CONSERVAR.
# - Copia en la NUBE (iCloud Drive): facturacion-dia-02.db.gz, una por día del mes (31
#   archivos que se pisan al mes siguiente = ~un mes de historia). Nombres fijos a
#   propósito: bajo launchd macOS deja ESCRIBIR en iCloud pero no LISTAR la carpeta, así
#   que no se puede rotar por búsqueda de archivos viejos.
# - NO incluye el .env (tiene tokens secretos); eso se respalda aparte, a mano.
#
# Variables para cambiar destinos: BASE, DESTINO_LOCAL, DESTINO_NUBE (vacío = no subir a la nube).

[ -n "${DEPURAR:-}" ] && set -x

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE:-$RAIZ/facturacion.db}"
DESTINO_LOCAL="${DESTINO_LOCAL:-$HOME/Backups/Sistema Facturacion}"
DESTINO_NUBE="${DESTINO_NUBE-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups Sistema Facturacion}"
CANTIDAD_A_CONSERVAR="${CANTIDAD_A_CONSERVAR:-60}"
LOG="$DESTINO_LOCAL/respaldo.log"

mkdir -p "$DESTINO_LOCAL" || exit 1
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

if [ ! -s "$BASE" ]; then log "ERROR: no encuentro la base en $BASE"; exit 1; fi

SELLO="$(date '+%Y-%m-%d_%H%M')"
DIA="$(date '+%d')"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

/usr/bin/sqlite3 "$BASE" ".backup '$TMP/copia.db'" || { log "ERROR: falló la copia con sqlite3"; exit 1; }
RESULTADO="$(/usr/bin/sqlite3 "$TMP/copia.db" 'PRAGMA integrity_check;')"
if [ "$RESULTADO" != "ok" ]; then log "ERROR: la copia no pasó el chequeo de integridad: $RESULTADO"; exit 1; fi

ARCHIVO="$DESTINO_LOCAL/facturacion-$SELLO.db.gz"
gzip -9 -c "$TMP/copia.db" > "$ARCHIVO" || { log "ERROR: no pude guardar $ARCHIVO"; exit 1; }
TAMANO="$(du -h "$ARCHIVO" | cut -f1)"

# Copias locales viejas: se conservan solo las últimas N.
ls -1t "$DESTINO_LOCAL"/facturacion-*.db.gz 2>/dev/null | tail -n +"$((CANTIDAD_A_CONSERVAR + 1))" | while read -r vieja; do rm -f "$vieja"; done
TOTAL="$(ls -1 "$DESTINO_LOCAL"/facturacion-*.db.gz 2>/dev/null | wc -l | tr -d ' ')"

# Copia en la nube: nombre fijo por día del mes.
NUBE="sin nube"
if [ -n "$DESTINO_NUBE" ]; then
  if mkdir -p "$DESTINO_NUBE" 2>/dev/null && cp -f "$ARCHIVO" "$DESTINO_NUBE/facturacion-dia-$DIA.db.gz" 2>/dev/null; then
    NUBE="nube OK (facturacion-dia-$DIA)"
  else
    NUBE="AVISO: no pude copiar a la nube"
  fi
fi

log "OK facturacion-$SELLO.db.gz ($TAMANO) — copias locales: $TOTAL — $NUBE"
exit 0
