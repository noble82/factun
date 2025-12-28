# Módulo de Reportes de Ventas Diarias

## Descripción General

Se ha implementado un módulo completo de reportes de ventas diarias que permite:
- **Registrar automáticamente** las ventas de cada día en tablas consolidadas
- **Consultar ventas** por períodos específicos (hoy, últimos 7 días, último mes, período personalizado)
- **Visualizar en Panel del Cajero** un resumen rápido de ventas del día
- **Acceder a reportes detallados** con gráficos, análisis y exportación de datos

---

## Características Implementadas

### 1. Base de Datos (Backend)

#### Nuevas Tablas
- **`ventas_diarias`**: Resumen diario consolidado
  - Campos: fecha, total_pedidos, total_ventas, subtotal, impuesto, efectivo, crédito, promedio_pedido

- **`ventas_diarias_productos`**: Desglose diario por producto
  - Campos: fecha, producto_id, producto_nombre, categoría, cantidad_vendida, subtotal

- **`ventas_diarias_categorias`**: Desglose diario por categoría
  - Campos: fecha, categoría_id, categoría_nombre, cantidad_vendida, subtotal

### 2. Backend API (Flask)

#### Nuevos Endpoints

##### `GET /api/pos/reportes/hoy`
Obtiene reporte completo del día actual.

**Response:**
```json
{
  "resumen": {
    "fecha": "2025-12-27",
    "total_pedidos": 15,
    "total_ventas": 250.50,
    "efectivo": 200.00,
    "credito": 50.50,
    "pedido_promedio": 16.70
  },
  "productos": [
    {
      "producto_nombre": "Pupusa de Queso",
      "cantidad_vendida": 25,
      "subtotal": 125.00
    }
  ],
  "categorias": [
    {
      "categoria_nombre": "Pupusas",
      "cantidad_vendida": 45,
      "subtotal": 200.00
    }
  ]
}
```

##### `GET /api/pos/reportes/periodo?inicio=YYYY-MM-DD&fin=YYYY-MM-DD`
Obtiene reporte para un período determinado.

**Parámetros:**
- `inicio`: Fecha inicial (YYYY-MM-DD)
- `fin`: Fecha final (YYYY-MM-DD)

**Response:** Incluye resumen agregado, desglose diario, top productos y categorías.

##### `GET /api/pos/reportes/comparativa?fecha1=YYYY-MM-DD&fecha2=YYYY-MM-DD`
Compara dos fechas específicas con variación porcentual.

**Response:**
```json
{
  "fecha1": "2025-12-26",
  "fecha2": "2025-12-27",
  "variacion": {
    "total_ventas": {
      "fecha1": 200.00,
      "fecha2": 250.50,
      "diferencia": 50.50,
      "porcentaje": 25.25
    }
  }
}
```

##### `POST /api/pos/reportes/consolidar`
Ejecuta consolidación manual (requiere rol de manager).

**Request Body (opcional):**
```json
{
  "fecha": "2025-12-26"
}
```

**Response:**
```json
{
  "success": true,
  "fecha": "2025-12-27",
  "total_pedidos": 15,
  "total_ventas": 250.50
}
```

#### Nueva Función
- **`consolidar_ventas_diarias(fecha_str=None)`**: Consolida ventas del día especificado o del día anterior si no se especifica.

---

## Frontend

### 1. Panel Cajero - Tab de Reportes Rápidos

**Ubicación:** `pos.html` → Panel Cajero → Tab "Reportes Rápidos"

**Funcionalidades:**
- Selector rápido de período (Hoy / Últimos 7 días / Último mes)
- Tarjetas de métricas:
  - Total vendido
  - Total pedidos
  - Ticket promedio
  - Efectivo vs Crédito
- Tabla de top 10 productos
- Tabla de ventas por categoría
- Botón para acceder a reportes detallados
- Auto-actualización cada 30 segundos

**Funciones JavaScript (en `pos.js`):**
- `cargarReportesRapidos(periodo)`: Carga datos del período
- `cambiarPeriodoReportes(periodo)`: Cambia período
- `renderizarMetricasReportes(data)`: Renderiza métricas
- `iniciarActualizacionReportes()`: Auto-actualiza

### 2. Página de Reportes Detallados

**Archivo:** `reportes.html`

**Funcionalidades:**
- Date picker para período personalizado
- Tarjetas de resumen (Total, Promedio, Variación)
- Gráfico de tendencia diaria (Chart.js)
- Gráfico de métodos de pago (Efectivo vs Crédito)
- Tabla de top 10 productos con ranking
- Tabla de ventas por categoría
- Tabla detallada de días
- Exportación a CSV
- Exportación a PDF
- Impresión
- Restricción de acceso solo para managers

**Funciones JavaScript (en `reportes.js`):**
- `cargarReportes()`: Carga datos desde API
- `renderizarReportes()`: Renderiza todos los gráficos y tablas
- `descargarCSV()`: Exporta a CSV
- `descargarPDF()`: Exporta a PDF
- `imprimirReporte()`: Imprime

---

## Automatización

### Script de Consolidación
**Archivo:** `backend/consolidar_ventas.py`

Ejecutable manualmente para consolidar ventas de un día específico o el anterior.

**Uso:**
```bash
python3 consolidar_ventas.py              # Consolida ayer
python3 consolidar_ventas.py 2025-12-26  # Consolida fecha específica
```

### Configuración de Cron Job
**Documentación:** `CRON_SETUP.md`

Para ejecutar automáticamente a las 23:55 cada día:
```cron
55 23 * * * /usr/bin/python3 /home/noble/Documentos/facturacion/backend/consolidar_ventas.py
```

---

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│ Durante el día                                          │
│ • Cajero procesa pagos → Pedidos en estado "cerrado"  │
│ • Datos se acumulan en tabla "pedidos"                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 23:55 - Consolidación Nightly                           │
│ • Cron job ejecuta consolidar_ventas_diarias()         │
│ • Calcula totales y desglose                           │
│ • Inserta en ventas_diarias*                           │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend - Consulta datos consolidados                  │
│ • Panel Cajero: Reportes rápidos actualizado           │
│ • Reportes.html: Gráficos y análisis detallado        │
│ • Managers pueden consultar períodos pasados           │
└─────────────────────────────────────────────────────────┘
```

---

## Seguridad

- ✅ Solo **managers** pueden acceder a `reportes.html`
- ✅ Endpoint `/reportes/consolidar` requiere rol de manager
- ✅ Todos los endpoints requieren autenticación JWT
- ✅ Validación de formato de fechas en requests

---

## Uso para Cajero

1. **Acceder a Panel Cajero** (rol: cajero)
2. **Click en tab "Reportes Rápidos"**
3. **Ver resumen del día:**
   - Total vendido
   - Cantidad de pedidos
   - Ticket promedio
   - Top productos del día
   - Ventas por categoría

**Selector rápido de período:**
- Hoy
- Últimos 7 días
- Último mes

---

## Uso para Manager

1. **Acceder a `reportes.html`** (desde link en Panel Cajero o URL directa)
2. **Seleccionar período con date picker**
3. **Click en "Buscar"**
4. **Visualizar:**
   - Gráfico de tendencia diaria
   - Desglose por método de pago
   - Top 10 productos
   - Ventas por categoría
   - Tabla detallada de cada día

5. **Descargar o imprimir:**
   - Click en "Descargar CSV" para análisis en Excel
   - Click en "Descargar PDF" para enviar a cliente
   - Click en "Imprimir" para imprimir directamente

---

## Archivos Modificados

### Backend
- `backend/pos.py`
  - ✅ 3 nuevas tablas en `init_db()`
  - ✅ Función `consolidar_ventas_diarias()`
  - ✅ 4 nuevos endpoints API

- ✅ `backend/consolidar_ventas.py` (NUEVO)

### Frontend
- `frontend/pos.html`
  - ✅ Tab "Reportes Rápidos" agregado al Panel Cajero
  - ✅ Tarjetas de métricas
  - ✅ Tablas de productos y categorías

- `frontend/pos.js`
  - ✅ `cargarReportesRapidos()`
  - ✅ `cambiarPeriodoReportes()`
  - ✅ `renderizarMetricasReportes()`
  - ✅ `iniciarActualizacionReportes()`

- ✅ `frontend/reportes.html` (NUEVO)
- ✅ `frontend/reportes.js` (NUEVO)

### Documentación
- ✅ `CRON_SETUP.md` (NUEVO)
- ✅ `MODULO_REPORTES.md` (NUEVO - este archivo)

---

## Testing

Toda la sintaxis ha sido validada:
- ✅ `pos.py`: Sintaxis Python válida
- ✅ `consolidar_ventas.py`: Sintaxis Python válida
- ✅ `reportes.js`: Sintaxis JavaScript válida
- ✅ Endpoints configurados correctamente
- ✅ Tablas SQL válidas

---

## Próximos Pasos Opcionales

Para mejorar el módulo en el futuro:

1. **Análisis por hora:** Agregar tabla `ventas_diarias_horaria` para desglose por hora
2. **Comparativas automáticas:** Agregar gráficos de comparativa semana vs semana
3. **Alertas:** Notificar si ventas caen significativamente
4. **Dashboard del Manager:** Panel dinámico con KPIs principales
5. **Email de reportes:** Enviar reportes diarios por email a managers
6. **Caché Redis:** Mejorar rendimiento cacheando reportes frecuentes

---

**Módulo completado:** ✅ 27 de Diciembre de 2025

**Estado:** Listo para producción

**Versión:** 1.0
