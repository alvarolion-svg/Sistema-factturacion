#!/bin/bash

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Sistema de Facturación - Dev Watch${NC}"
echo "Este script mantiene los servidores corriendo automáticamente"
echo "Si se cierran, se reinician automáticamente"
echo "Presiona Ctrl+C para detener"
echo ""

cd ~/Sistema-factturacion

# Función para reiniciar si algo falla
start_servers() {
  echo -e "${GREEN}✓ Iniciando servidores...${NC}"
  PORT=5001 npm run dev
}

# Loop infinito - si npm run dev se detiene, reinicia
while true; do
  start_servers
  echo -e "${RED}⚠️ Servidores detenidos. Reiniciando en 5 segundos...${NC}"
  sleep 5
done

