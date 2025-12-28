# PLAN DE TESTING - FASE 3: Integration & Security

**Fecha**: Diciembre 2025
**Estado**: LISTO PARA IMPLEMENTAR
**Prioridad**: ALTA - Validar integridad del sistema

---

## 🎯 OBJETIVO FASE 3

Validar que todas las mejoras de seguridad, rendimiento y funcionalidad implementadas en FASES 1-2.6 trabajen correctamente de forma integrada.

---

## ✅ TESTING CHECKLIST

### 1. AUTENTICACIÓN & AUTORIZACIÓN

```
[ ] Login con credenciales correctas
    - Usuario: admin / admin (contraseña aleatoria)
    - Verificar: Token JWT en localStorage
    - Verificar: Usuario actual en user localStorage

[ ] Rate limiting en login
    - Intentar 5 logins fallidos rápidamente
    - Sexto intento debe ser rechazado (429 Too Many Requests)
    - Esperar 15 minutos y reintentar

[ ] Role-Based Access Control (RBAC)
    - Mesero: Debe ver solo "Mesero" tab
    - Cajero: Debe ver solo "Cajero" tab
    - Cocinero: Debe ver solo "Cocina" tab
    - Manager: Debe ver todas las tabs (Admin)

[ ] Logout limpia sesión
    - Botón logout borra auth_token, user, csrf_token
    - Redirecciona a login.html
    - Back button no restaura sesión

[ ] Token expiración
    - Si token es viejo, next request redirige a login
    - apiFetch() detecta 401 y limpia sesión automáticamente
```

### 2. CSRF PROTECTION

```
[ ] Token en headers
    - Cada GET request incluye X-CSRF-Token en response header
    - Token se almacena en sessionStorage automáticamente

[ ] Token en body
    - Respuestas JSON incluyen campo _csrf_token
    - Frontend actualiza token desde body si no está en header

[ ] Validación en POST
    - POST sin token retorna 403
    - POST con token válido funciona
    - POST con token expirado retorna 403

[ ] Validación en PUT
    - PUT /api/pos/pedidos/<id>/pago requiere CSRF token
    - PUT sin token retorna 403

[ ] Validación en DELETE
    - DELETE requests requieren CSRF token
    - Sin token retorna 403

[ ] Reuso de token bloqueado
    - Token se consume después de usarse (one-time use)
    - Reutilizar mismo token retorna 403
```

### 3. VALIDACIÓN DE ENTRADA

#### Frontend (Cliente)
```
[ ] Email validation
    - Formato incorrecto muestra error inmediato
    - Email válido pasa a servidor

[ ] Teléfono validation
    - Acepta formatos: 2345-6789, 2345 6789, 23456789
    - Números fuera de rango (7-15 dígitos) rechazados
    - Caracteres especiales permitidos: +, -, espacio

[ ] Número positivo
    - Negativo rechazado
    - Números con decimales aceptados (0.50)
    - Texto rechazado

[ ] NIT/NRC/DUI (El Salvador)
    - NIT: 10 dígitos exactamente
    - NRC: 7-8 dígitos
    - DUI: 9 dígitos exactamente

[ ] Contraseña complejidad
    - Mínimo 8 caracteres
    - Al menos 1 mayúscula
    - Al menos 1 minúscula
    - Al menos 1 número
    - Al menos 1 carácter especial
```

#### Backend (Servidor)
```
[ ] Validación en clientes POST
    - Email: servidor valida incluso si cliente lo hizo
    - Teléfono: servidor rechaza formato inválido
    - NIT: servidor verifica 10 dígitos

[ ] Validación en producto creado
    - Nombre: no puede estar vacío
    - Precio: debe ser número positivo
    - Categoría: debe existir en base de datos

[ ] Validación de contraseña
    - Requisitos de complejidad aplicados
    - Hash con PBKDF2-SHA256 + 100k iteraciones
```

### 4. FLUJOS DE NEGOCIO

#### Pedido de Mesero
```
[ ] Crear pedido en mesa
    1. Mesero selecciona mesa
    2. Agrega productos al carrito
    3. Puede cambiar cantidad de productos
    4. Botón "Enviar Pedido" deshabilitado sin productos
    5. Pedido se envía y aparece en "Pedidos para Servir"

[ ] Servir pedido
    1. Pedido aparece en "Pedidos para Servir"
    2. Mesero marca como "Servido"
    3. Estado cambia a "servido" en base de datos
    4. Notificación de éxito

[ ] Editar cliente en pedido
    1. Mesero selecciona cliente después de crear pedido
    2. GET /api/pos/pedidos/<id>/cliente funciona
    3. PUT /api/pos/pedidos/<id>/cliente requiere CSRF token
    4. Cliente se asigna a pedido correctamente
```

#### Pedido de Cajero (Para Llevar)
```
[ ] Crear pedido para llevar
    1. Cajero crea nuevo pedido sin mesa
    2. Ingresa nombre de cliente (requerido)
    3. Agrega productos al carrito
    4. Calcula IVA correctamente (subtotal * 0.13)
    5. Botón crear pedido se habilita cuando hay productos + nombre

[ ] Seleccionar cliente existente
    1. Campo de búsqueda de cliente funciona
    2. Escribir 2+ caracteres activa búsqueda
    3. resultados muestran clientes que coinciden
    4. Seleccionar cliente llena datos automáticamente

[ ] Procesar pago
    1. Moneda recibida debe ser >= total
    2. Cambio se calcula automáticamente
    3. Seleccionar tipo de comprobante (Ticket, Factura)
    4. Factura incluye IVA, Ticket no incluye
    5. Permitir propina para Ticket/Efectivo
```

#### Pago de Pedido
```
[ ] Pago efectivo
    1. Seleccionar "Efectivo"
    2. Ingrese monto recibido
    3. Cambio se calcula
    4. POST /api/pos/pedidos/<id>/pago incluye CSRF token
    5. Pedido pasa a estado "pagado"

[ ] Pago con crédito
    1. Cliente debe tener límite de crédito
    2. Monto de crédito se descuenta del saldo disponible
    3. Pedido se marca como "crédito" (no pagado)
    4. Reportes muestran créditos pendientes

[ ] Actualizar pago
    1. PUT /api/pos/pedidos/<id>/pago con response.ok check
    2. Si PUT falla (status != 200), mostrar error
    3. No procesar estado si pago falló
```

#### Pedido de Cocina
```
[ ] Ver pedidos nuevos
    1. Cocina ve pedidos en "En Cocina"
    2. Polling cada 3000ms (CONFIG.POLLING_INTERVALS.COCINA)
    3. Nuevos pedidos aparecen inmediatamente

[ ] Marcar listo
    1. Cocina marca como "Listo"
    2. Pedido se mueve a "Listos"
    3. Mesero ve "Pedidos para Servir" actualizado

[ ] Polling performance
    1. No deben haber duplicados de intervalos
    2. Cambiar de rol debe limpiar intervalos anteriores
    3. No memory leaks (revisa DevTools → Performance)
```

### 5. SEGURIDAD XSS

```
[ ] Nombre de producto con caracteres especiales
    - Producto: "Pizza <b>Deluxe</b>"
    - Debe mostrar literalmente, no en negrita
    - HTML no debe interpretarse

[ ] Nombre de cliente con quotes
    - Cliente: O'Brien, "El Buen Gusto"
    - Comillas deben escaparse correctamente
    - Atributos onclick no deben inyectarse

[ ] Descripción con HTML/Script
    - Producto: "Bebida <script>alert('xss')</script>"
    - Script no debe ejecutarse
    - Debe mostrar texto literal

[ ] Búsqueda XSS
    - Buscar: "<img src=x onerror=alert('xss')>"
    - Resultados no deben ejecutar script
    - Debe mostrar texto literal
```

### 6. RESPUESTA & ERROR HANDLING

```
[ ] response.ok validation
    - cargarMesas() retorna si status != 200-299
    - cargarCategorias() retorna si fetch falla
    - cargarProductos() retorna si response.ok === false

[ ] Error messages al usuario
    - Error genérico mostrado, nunca detalles técnicos
    - mostrarNotificacion('Error', 'mensaje', 'danger')
    - Logs en consola para debugging

[ ] Conexión perdida
    - Si red falla, mostrar error amistoso
    - Permitir reintentar
    - No quedarse en estado "cargando" indefinidamente

[ ] Servidor error (5xx)
    - mostrarNotificacion() muestra error
    - Usuario puede reintentar
    - No se pierde información del formulario
```

### 7. RENDIMIENTO & OPTIMIZACIÓN

```
[ ] CONFIG constants usados
    - IVA siempre usa calculateIVA(subtotal)
    - Polling intervals usan CONFIG.POLLING_INTERVALS
    - Colores de estado usan getEstadoColor(estado)

[ ] Intervals limpios
    - Cambiar entre roles no duplica intervals
    - Logout borra todos los intervals
    - No memory leaks en DevTools

[ ] Debounce en búsqueda
    - Búsqueda no debería dispararse en cada keystroke
    - Esperar 300ms sin cambios antes de buscar
    - Reduce carga en servidor

[ ] response.ok checks
    - Mínimo 8+ funciones con response.ok
    - No procesa datos de respuestas fallidas
    - Logs de error en consola
```

### 8. FUNCIONALIDADES ESPECIALES

```
[ ] IVA en factura vs ticket
    - Factura incluye IVA (subtotal * 0.13)
    - Ticket NO incluye IVA
    - Total se calcula correctamente con calculateTotal()

[ ] Propina en ticket
    - Efectivo + Ticket: permite agregar propina
    - Factura: no permite propina (opcional)
    - Propina aparece en reportes diarios

[ ] Reportes diarios
    - Muestran ventas del día
    - Incluyen propinas recibidas
    - Detallan efectivo, crédito, factura por separado

[ ] Inventario
    - Bebidas/snacks: se descontan automáticamente al vender
    - Pupusas/café: NO se descontan automáticamente
    - Materia prima: se descuenta manualmente (extracciones)
```

---

## 🚀 PROCEDIMIENTO DE TESTING

### Antes de Empezar
```bash
1. git status                    # Verificar sin cambios locales
2. npm install (si aplica)       # Actualizar dependencias
3. python -m pip install -r backend/requirements.txt
4. Iniciar servidor: python backend/app.py
5. Abrir frontend en navegador: http://localhost:5000
```

### Durante Testing
```bash
1. Abirir DevTools (F12)
2. Ir a Console para ver logs
3. Ir a Network para ver requests/responses
4. Ir a Storage → sessionStorage para ver CSRF tokens
5. Ir a Storage → localStorage para ver auth_token
```

### Reportar Fallidos
```markdown
**Fallo**: Nombre del test que falló
**Reproducción**: Pasos para reproducir
**Resultado esperado**: Qué debería pasar
**Resultado actual**: Qué pasó
**Logs**: Copiar errores de DevTools Console
```

---

## 📊 MÉTRICAS DE ÉXITO

| Categoría | Objetivo | Actual |
|-----------|----------|--------|
| Tests Pasados | 100% | ??? |
| XSS Vulnerabilities Encontradas | 0 | ??? |
| CSRF Falsos Positivos | 0 | ??? |
| Response.ok Checks Missing | <5% | ??? |
| Memory Leaks | 0 | ??? |
| Errores de Validación | 0 | ??? |

---

## 📝 NOTAS

- Este plan cubre los tests más críticos
- Pruebas en staging ANTES de producción
- Considerar tests automatizados para CI/CD futuro
- Documentar cualquier fallo encontrado con pasos para reproducir

---

**Siguiente paso**: Ejecutar todos los tests en FASE 3
