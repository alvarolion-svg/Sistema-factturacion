# 📺 TOPVIEW - Modelo de Negocio y Sistema de Facturación

## 1. ¿Qué es TOPVIEW?

TOPVIEW es un **medio de comunicación OOH (Out of Home)** que comercializa **espacios publicitarios en paseos comerciales** (shopping centers).

### Productos/Servicios que TOPVIEW vende:

#### **Cartelería Estática:**
- **PPLs ("Chupetes")**: Carteles verticales transiluminados de 1.08 x 1.34 mts
  - Bifaz (2 caras) pero se comercializan **por cada cara**
  - Ubicados en paseos comerciales

- **Gigantografías**: 3.40 x 1.40 mts frontlight
  - En estacionamientos o paredes de paseos

- **Cajas Backlight**: 3.40 x 1.40 mts, bifaz y transiluminadas
  - Dentro de paseos comerciales

- **Ploteos**: En vidrios, escaleras mecánicas, posiciones especiales

#### **Pantallas Digitales:**
- 58 pantallas verticales
- 1 video wall
- 11 pantallas de gran formato

---

## 2. Actores del Sistema

```
┌─────────────┐
│   CLIENTE   │  (Anunciante/Marca que quiere publicitar)
│  FINAL      │
└──────┬──────┘
       │ FLUJO DE DINERO
       ▼
   ┌─────────────────────────────────────────┐
   │ ¿Cómo compra el cliente?                │
   ├─────────────────────────────────────────┤
   │ 1. Directamente a TOPVIEW              │
   │ 2. A través de AGENCIA DE PUBLICIDAD   │
   │ 3. A través de INTERMEDIARIOS          │
   │    (Comisionistas - "Columna Gris")    │
   └─────────────────────────────────────────┘
```

### **Los 3 Tipos de Clientes:**

1. **Clientes Directos**
   - Compran directamente a TOPVIEW
   - TOPVIEW cobra el 100% del monto

2. **Clientes vía Agencia de Publicidad**
   - El cliente paga a la agencia
   - La agencia paga a TOPVIEW (generalmente con retención de comisión)

3. **Clientes vía Intermediarios**
   - Intermediarios acercan el negocio
   - Reciben comisión (pueden ser 1, 2, 3+ intermediarios en cadena)

---

## 3. El Flujo de Dinero - Ejemplo Concreto

### **Caso: Campaña PPL en Shopping Unicenter**

**Datos de la Orden:**
- Cliente: Nike Argentina
- Período: 1 mes (01/09/2026 - 30/09/2026)
- Productos: 4 PPLs (4 caras diferentes)
- Monto Neto Original: **$10,000**
- Descuento comercial: 10%
- Descuento por facturas: 5%
- Intermediarios: LATAM (15%) y Pupy (5%)

### **Cálculo Paso a Paso:**

```
PASO 1: Descuentos en Cascada
┌──────────────────────────────────────┐
Monto Original:                 $10,000
Descuento comercial (10%):       -$1,000
Monto después desc. 1:           $9,000

Descuento por facturas (5%):      -$450
MONTO FINAL PARA FACTURAR:       $8,550
└──────────────────────────────────────┘

PASO 2: Comisiones a Intermediarios
┌──────────────────────────────────────┐
Monto Final a Distribuir:        $8,550

LATAM (15% - tipo "cascada"):
  Comisión = $8,550 × 15% = $1,282.50
  Queda:                     $7,267.50

PUPY (5% - tipo "cascada"):
  Comisión = $7,267.50 × 5% = $363.38
  Queda para TOPVIEW:        $6,904.12
└──────────────────────────────────────┘

RESULTADO FINAL:
✓ TOPVIEW recibe:     $6,904.12
✓ LATAM recibe:       $1,282.50
✓ PUPY recibe:        $363.38
✓ Total:              $8,550.00 ✓
```

---

## 4. Sistema de Comisiones - Dos Tipos

### **Tipo 1: "BASE"**
La comisión se calcula **SIEMPRE sobre el monto final** (sin importar otros intermediarios)

**Ejemplo:**
- Monto final: $10,000
- Intermediario A (base): 10% = $1,000
- Intermediario B (base): 5% = $500
- Ambos se calculan sobre los $10,000 originales

**Cuándo usar:** Cuando intermediarios tienen acuerdos independientes que no se afectan entre sí.

---

### **Tipo 2: "CASCADA"** (Por defecto)
La comisión se calcula sobre el **monto actual**, reduciendo lo que queda para el siguiente intermediario.

**Ejemplo:**
- Monto final: $10,000
- Intermediario A (cascada): 10% = $1,000 → Queda $9,000
- Intermediario B (cascada): 5% de $9,000 = $450 → Queda $8,550

**Cuándo usar:** Cuando hay intermediarios en cadena/niveles (A trae a B que trae a C).

---

## 5. Estructura de Base de Datos

### **Tabla: `ordenes_publicidad`**
```sql
- id: UUID único de la orden
- numero_orden: OPB-20260914123456
- tipo_anunciante: Directo, Agencia, Intermediario
- razon_social: Nombre legal del cliente
- nombre_anunciante: Nombre comercial

DINERO:
- monto_neto: Monto original sin descuentos
- descuento_porcentaje: % de descuento 1
- descuento_monto: Monto en $ del descuento 1
- monto_neto_aplicado: Monto después del descuento 1

- descuento_facturas_porcentaje: % de descuento 2
- descuento_facturas_monto: Monto en $ del descuento 2
- monto_final: Lo que realmente se factura (después de ambos descuentos)

PERÍODO:
- periodo_desde: Fecha inicio
- periodo_hasta: Fecha fin
- fecha_facturacion: Cuándo se genera la factura
```

### **Tabla: `ordenes_intermediarios`**
```sql
- id: UUID
- orden_id: Referencia a la orden
- intermediario_id: ID del intermediario
- numero_nivel: 1, 2, 3... (para cascada)
- porcentaje_comision: 15, 5, etc.
- monto_comision: Calculado automáticamente
- tipo_calculo: 'base' o 'cascada'
- factura_formal: true/false (¿se hace factura formal?)
```

### **Tabla: `ordenes_publicidad_detalles`**
```sql
- id: UUID
- orden_id: Referencia a la orden
- tipo_producto: PPL, Gigantografia, Caja, Pantalla, etc.
- cantidad: Cuántos
- ubicacion: Paseo donde va, piso, etc.
- especificaciones: Detalles técnicos
```

### **Tabla: `replicaciones_facturacion`**
```sql
- id: UUID
- orden_id: Referencia a la orden
- numero_mes: 1-12
- ano: 2026
- estado: Pendiente, Facturada, Cancelada

PROPÓSITO: Si la campaña es de 6 meses, se crean 6 replicaciones.
           Cada mes genera una factura automáticamente.
```

---

## 6. Flujo Operativo Completo

```
1. CREAR ORDEN
   ├─ Ingresar datos del cliente
   ├─ Seleccionar productos (PPL, Giga, etc.)
   ├─ Definir período de campaña
   ├─ Ingresar descuentos
   ├─ Agregar intermediarios (si aplica)
   └─ SISTEMA CALCULA automáticamente:
      ├─ Monto final
      ├─ Comisiones
      └─ Replicaciones mensuales

2. GENERAR FACTURAS
   ├─ Por cada mes de replicación
   ├─ TOPVIEW factura al cliente directamente
   ├─ O a la agencia/intermediario según corresponda
   └─ Se registra en auditoría

3. PAGO Y COMISIONES
   ├─ Cliente paga
   ├─ Sistema calcula automáticamente:
   │  ├─ Cuánto va a TOPVIEW
   │  ├─ Cuánto va a cada intermediario
   │  └─ Cuánto va a agencia (si aplica)
   └─ Se registra en Tesorería
```

---

## 7. Casos de Uso Reales

### **Caso 1: Cliente Directo (SIMPLE)**
```
Nike → TOPVIEW → Factura directa
Monto: $10,000
TOPVIEW recibe: $10,000
```

### **Caso 2: Cliente vía Agencia (SIN INTERMEDIARIOS)**
```
Nike → Agencia → TOPVIEW
Acuerdo: Agencia retiene 15% comisión
TOPVIEW factura a Nike por $10,000
TOPVIEW recibe: $10,000
Agencia retiene en su lado: $1,500 (gestión propia)
```

### **Caso 3: Cliente vía 2 Intermediarios (CASCADA)**
```
Nike → LATAM (15%) → Pupy (5%) → TOPVIEW
Monto final a facturar: $10,000

LATAM: 15% = $1,500 → Queda $8,500
PUPY: 5% de $8,500 = $425 → Queda $8,075

TOPVIEW recibe: $8,075
LATAM recibe: $1,500
PUPY recibe: $425
```

### **Caso 4: Cliente vía 2 Intermediarios (BASE)**
```
Nike → LATAM (15% BASE) → Pupy (5% BASE) → TOPVIEW
Monto final a facturar: $10,000

LATAM: 15% de $10,000 = $1,500
PUPY: 5% de $10,000 = $500

TOPVIEW recibe: $10,000 - $1,500 - $500 = $8,000
LATAM recibe: $1,500
PUPY recibe: $500
```

---

## 8. Puntos Clave a Implementar en Sistema

✅ **Cálculos automáticos de:**
- Descuentos en cascada
- Comisiones (base vs cascada)
- Monto final a cobrar

✅ **Gestión de intermediarios:**
- Múltiples niveles
- Tipos de cálculo diferentes
- Facturación formal opcional

✅ **Replicaciones automáticas:**
- Crear facturas mensuales automáticamente
- Gestionar período de campañas

✅ **Reportes:**
- Qué le debe el cliente a TOPVIEW
- Qué le debe TOPVIEW a intermediarios
- Comisiones por intermediario

---

## 9. Relación con Agencias

**Importante:** Cuando el cliente compra vía agencia:
- La agencia es quien factura al cliente
- TOPVIEW factura a la agencia
- El descuento/comisión lo negocia la agencia, no TOPVIEW
- Algunos casos la agencia factura a TOPVIEW + TOPVIEW factura a cliente (depende acuerdo)

---

**Este es el CORE del negocio TOPVIEW.**  
Cualquier feature, reporte o funcionalidad debe estar alineada con estos conceptos.
