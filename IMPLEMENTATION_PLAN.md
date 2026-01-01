# Plan Detallado de Implementación - Sistema POS Restaurante

Documento creado: 2025-12-31
Estado: En desarrollo
Prioridad: Alta - Funcionalidades críticas del negocio

---

## ANÁLISIS ACTUAL

### ✅ Qué YA EXISTE (No modificar)

1. **Autenticación & Autorización**
   - Sistema JWT con sesiones de 12 horas
   - 4 roles: manager, mesero, cajero, cocinero
   - PBKDF2 hash con salt
   - Rate limiting en login

2. **Gestión de Mesas**
   - Tabla `mesas` con estados (libre/ocupada)
   - Endpoints GET/PUT básicos
   - Auto-liberación de mesas

3. **Gestión de Productos**
   - Tabla `productos` con categorías
   - CRUD endpoints
   - Disponibilidad de productos

4. **Gestión de Pedidos (Básica)**
   - Tabla `pedidos` con 2 flujos: anticipado y al_final
   - Tabla `pedido_items` para items individuales
   - Estados: pendiente_pago → pagado → en_cocina → listo → servido → cerrado
   - Timestamps en transiciones de estado

5. **Integración Digifact**
   - Clase `DigifactClient` con autenticación
   - Clase `GeneradorDTE` para generar facturas
   - Endpoints básicos POST `/api/pos/pedidos/<id>/facturar`
   - PERO: Genera JSON, no XML; faltan validaciones IVA desglosado

6. **Inventario**
   - Tabla `materia_prima` para ingredientes
   - Tabla `recetas` para desgloses
   - Deducción de stock en estado 'pagado'

7. **Clientes**
   - Tabla `clientes` con NIT/DUI
   - Límites de crédito
   - Campos en `pedidos` para datos de facturación

8. **Validadores**
   - Email, teléfono, NIT, DUI, NRC, etc.

### ❌ Qué FALTA IMPLEMENTAR (Prioridad)

#### FASE 1: COMBOS (CRÍTICO)
- [ ] Tabla `combos` (id, nombre, descripcion, precio_combo, activo)
- [ ] Tabla `combo_items` (combo_id, producto_id, cantidad)
- [ ] Endpoints CRUD para combos (manager only)
- [ ] Lógica: Al agregar combo a pedido, desglosar productos para cocina
- [ ] Validación: precio_combo ≤ suma de productos individuales

#### FASE 2: GESTIÓN DE PEDIDOS MEJORADA
- [ ] Endpoint para remover items de pedido (validar estado)
- [ ] Endpoint para modificar cantidad de item (validar estado)
- [ ] Validación: No modificar items si pedido está en estado 'pagado'
- [ ] Endpoint para obtener desglose completo con IVA por item

#### FASE 3: IVA DESGLOSADO Y FACTURACIÓN
- [ ] Agregar columnas a `pedido_items`: iva_porcentaje, iva_monto, total_item
- [ ] Recalcular IVA en cada item cuando se agrega al pedido
- [ ] Endpoint mejorado para obtener pedido con IVA desglosado
- [ ] Validar IVA en API Digifact (formato requerido)

#### FASE 4: DIGIFACT MEJORADO
- [ ] Generar XML válido (no solo JSON)
- [ ] IVA desglosado por item (requerimiento Digifact)
- [ ] Manejo robusto de errores con reintentos
- [ ] Almacenar respuesta de Digifact (numero_dte, fecha_certificacion)
- [ ] Endpoint para consultar estado de DTE en Digifact

#### FASE 5: NOTIFICACIONES EN TIEMPO REAL
- [ ] Implementar WebSocket server (o fallback a polling)
- [ ] Notificar a cocina cuando llega pedido
- [ ] Notificar a mesero cuando pedido está listo
- [ ] Actualizar mesas en tiempo real

---

## FASE 1: IMPLEMENTACIÓN DE COMBOS

### 1.1 Crear Tablas en Database

**Archivo a modificar:** `backend/pos.py`

```python
def init_db():
    # ... tablas existentes ...

    # Tabla COMBOS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS combos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            precio_combo REAL NOT NULL,
            imagen TEXT,
            activo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabla COMBO_ITEMS (relación M:M)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS combo_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            combo_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            cantidad INTEGER NOT NULL,
            FOREIGN KEY (combo_id) REFERENCES combos(id),
            FOREIGN KEY (producto_id) REFERENCES productos(id)
        )
    ''')

    conn.commit()
```

### 1.2 Modificar Tabla `pedido_items`

Agregar columna para identificar si es combo:

```python
# En init_db(), después de CREATE TABLE pedido_items
cursor.execute('''
    ALTER TABLE pedido_items ADD COLUMN combo_id INTEGER
''')
# Y agregar índice
cursor.execute('CREATE INDEX IF NOT EXISTS idx_combo_id ON pedido_items(combo_id)')
```

### 1.3 Crear Funciones Helper en `pos.py`

```python
def obtener_combo(combo_id):
    """Obtiene combo con sus productos"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, COUNT(ci.id) as cantidad_items
        FROM combos c
        LEFT JOIN combo_items ci ON c.id = ci.combo_id
        WHERE c.id = ?
        GROUP BY c.id
    ''', (combo_id,))
    return cursor.fetchone()

def obtener_items_combo(combo_id):
    """Obtiene todos los productos en un combo"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT ci.*, p.nombre, p.precio
        FROM combo_items ci
        JOIN productos p ON ci.producto_id = p.id
        WHERE ci.combo_id = ?
    ''', (combo_id,))
    return cursor.fetchall()

def validar_combo(nombre, precio, items):
    """Valida que combo sea válido"""
    # Validación 1: al menos 2 items
    if len(items) < 2:
        return False, "Combo debe tener al menos 2 productos"

    # Validación 2: todos los productos deben existir y estar disponibles
    suma_precios = 0
    for item in items:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT precio FROM productos WHERE id = ? AND disponible = 1',
                      (item['producto_id'],))
        producto = cursor.fetchone()
        if not producto:
            return False, f"Producto {item['producto_id']} no existe o no está disponible"
        suma_precios += producto[0] * item['cantidad']

    # Validación 3: precio del combo <= suma de productos individuales
    if precio > suma_precios:
        return False, f"Precio del combo (${precio}) no puede ser mayor a suma de productos (${suma_precios})"

    return True, "OK"
```

### 1.4 Crear Endpoints para Combos

**Archivo a modificar:** `backend/pos.py`

```python
@pos_bp.route('/combos', methods=['GET'])
@role_required('mesero', 'cajero', 'manager')
def listar_combos():
    """Listar todos los combos activos con sus productos"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT c.*, COUNT(ci.id) as cantidad_items
        FROM combos c
        LEFT JOIN combo_items ci ON c.id = ci.combo_id
        WHERE c.activo = 1
        GROUP BY c.id
        ORDER BY c.nombre
    ''')
    combos = cursor.fetchall()

    result = []
    for combo in combos:
        # Obtener items del combo
        items = obtener_items_combo(combo[0])
        result.append({
            'id': combo[0],
            'nombre': combo[1],
            'descripcion': combo[2],
            'precio_combo': combo[3],
            'imagen': combo[4],
            'items': [
                {
                    'producto_id': item[1],
                    'producto_nombre': item[3],
                    'cantidad': item[2],
                    'precio_unitario': item[4]
                } for item in items
            ]
        })

    return jsonify(result)


@pos_bp.route('/combos', methods=['POST'])
@role_required('manager')
def crear_combo():
    """Crear nuevo combo"""
    data = request.json

    # Validar datos
    if not data.get('nombre') or not data.get('precio_combo'):
        return jsonify({'error': 'nombre y precio_combo requeridos'}), 400

    items = data.get('items', [])
    if not items:
        return jsonify({'error': 'combo debe tener al menos 2 items'}), 400

    # Validación
    valido, mensaje = validar_combo(data['nombre'], data['precio_combo'], items)
    if not valido:
        return jsonify({'error': mensaje}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Insertar combo
        cursor.execute('''
            INSERT INTO combos (nombre, descripcion, precio_combo, imagen)
            VALUES (?, ?, ?, ?)
        ''', (data['nombre'], data.get('descripcion'), data['precio_combo'], data.get('imagen')))

        combo_id = cursor.lastrowid

        # Insertar items del combo
        for item in items:
            cursor.execute('''
                INSERT INTO combo_items (combo_id, producto_id, cantidad)
                VALUES (?, ?, ?)
            ''', (combo_id, item['producto_id'], item['cantidad']))

        conn.commit()

        return jsonify({
            'id': combo_id,
            'nombre': data['nombre'],
            'precio_combo': data['precio_combo'],
            'items': items
        }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500


@pos_bp.route('/combos/<int:combo_id>', methods=['GET'])
@role_required('mesero', 'cajero', 'manager')
def obtener_combo_detalle(combo_id):
    """Obtener detalle de un combo"""
    combo = obtener_combo(combo_id)
    if not combo:
        return jsonify({'error': 'Combo no encontrado'}), 404

    items = obtener_items_combo(combo_id)

    return jsonify({
        'id': combo[0],
        'nombre': combo[1],
        'descripcion': combo[2],
        'precio_combo': combo[3],
        'imagen': combo[4],
        'items': [
            {
                'producto_id': item[1],
                'producto_nombre': item[3],
                'cantidad': item[2],
                'precio_unitario': item[4]
            } for item in items
        ]
    })


@pos_bp.route('/combos/<int:combo_id>', methods=['PUT'])
@role_required('manager')
def actualizar_combo(combo_id):
    """Actualizar combo y sus items"""
    data = request.json

    combo = obtener_combo(combo_id)
    if not combo:
        return jsonify({'error': 'Combo no encontrado'}), 404

    items = data.get('items', [])
    if items:
        valido, mensaje = validar_combo(data.get('nombre', combo[1]),
                                       data.get('precio_combo', combo[3]),
                                       items)
        if not valido:
            return jsonify({'error': mensaje}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Actualizar combo
        cursor.execute('''
            UPDATE combos
            SET nombre = ?, descripcion = ?, precio_combo = ?, imagen = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (data.get('nombre', combo[1]),
              data.get('descripcion', combo[2]),
              data.get('precio_combo', combo[3]),
              data.get('imagen', combo[4]),
              combo_id))

        # Actualizar items si se proporcionan
        if items:
            cursor.execute('DELETE FROM combo_items WHERE combo_id = ?', (combo_id,))
            for item in items:
                cursor.execute('''
                    INSERT INTO combo_items (combo_id, producto_id, cantidad)
                    VALUES (?, ?, ?)
                ''', (combo_id, item['producto_id'], item['cantidad']))

        conn.commit()
        return jsonify({'message': 'Combo actualizado', 'id': combo_id})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500


@pos_bp.route('/combos/<int:combo_id>', methods=['DELETE'])
@role_required('manager')
def desactivar_combo(combo_id):
    """Desactivar combo (soft delete)"""
    combo = obtener_combo(combo_id)
    if not combo:
        return jsonify({'error': 'Combo no encontrado'}), 404

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('UPDATE combos SET activo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                  (combo_id,))
    conn.commit()

    return jsonify({'message': 'Combo desactivado'})
```

### 1.5 Actualizar Endpoint para Agregar Items a Pedido

Modificar `POST /api/pos/pedidos/<id>/items` para soportar combos:

```python
@pos_bp.route('/pedidos/<int:pedido_id>/items', methods=['POST'])
@role_required('mesero', 'cajero', 'manager')
def agregar_item_pedido(pedido_id):
    """Agregar item (producto o combo) a pedido existente"""
    data = request.json

    # Obtener pedido
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()

    if not pedido:
        return jsonify({'error': 'Pedido no encontrado'}), 404

    # Validar que no esté pagado
    if pedido[3] == 'pagado':  # estado column
        return jsonify({'error': 'No se pueden agregar items a pedido pagado'}), 400

    # Verificar si es combo o producto
    es_combo = data.get('combo_id') is not None
    item_id = data.get('combo_id') if es_combo else data.get('producto_id')
    cantidad = data.get('cantidad', 1)

    if not item_id or cantidad < 1:
        return jsonify({'error': 'combo_id o producto_id requerido, cantidad > 0'}), 400

    try:
        if es_combo:
            # Agregar combo: crear item del combo
            combo = obtener_combo(item_id)
            if not combo:
                return jsonify({'error': 'Combo no encontrado'}), 404

            precio_unitario = combo[3]  # precio_combo

            cursor.execute('''
                INSERT INTO pedido_items (pedido_id, combo_id, cantidad, precio_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?)
            ''', (pedido_id, item_id, cantidad, precio_unitario, precio_unitario * cantidad))

            # IMPORTANTE: Desglosar y crear items individuales para cocina
            items_combo = obtener_items_combo(item_id)
            for combo_item in items_combo:
                producto_id = combo_item[1]
                cantidad_producto = combo_item[2] * cantidad
                precio_producto = combo_item[4]

                cursor.execute('''
                    INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (pedido_id, producto_id, cantidad_producto, precio_producto,
                      precio_producto * cantidad_producto, 'Parte de combo'))
        else:
            # Agregar producto individual
            cursor.execute('SELECT precio FROM productos WHERE id = ? AND disponible = 1', (item_id,))
            producto = cursor.fetchone()
            if not producto:
                return jsonify({'error': 'Producto no encontrado o no disponible'}), 404

            precio_unitario = producto[0]
            cursor.execute('''
                INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?)
            ''', (pedido_id, item_id, cantidad, precio_unitario, precio_unitario * cantidad))

        # Recalcular totales del pedido
        recalcular_totales_pedido(pedido_id)

        conn.commit()
        return jsonify({'message': 'Item agregado'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500


def recalcular_totales_pedido(pedido_id):
    """Recalcula subtotal, IVA y total de un pedido"""
    conn = get_db()
    cursor = conn.cursor()

    # Obtener todos los items (excepto los que son parte de combo)
    cursor.execute('''
        SELECT SUM(subtotal)
        FROM pedido_items
        WHERE pedido_id = ? AND notas != 'Parte de combo'
    ''', (pedido_id,))

    resultado = cursor.fetchone()
    subtotal = resultado[0] if resultado[0] else 0

    # Calcular IVA (13% El Salvador)
    iva = subtotal * 0.13
    total = subtotal + iva

    # Actualizar pedido
    cursor.execute('''
        UPDATE pedidos
        SET subtotal = ?, impuesto = ?, total = ?
        WHERE id = ?
    ''', (subtotal, iva, total, pedido_id))

    conn.commit()
```

---

## FASE 2: GESTIÓN MEJORADA DE ITEMS

### 2.1 Endpoints para Remover/Modificar Items

```python
@pos_bp.route('/pedidos/<int:pedido_id>/items/<int:item_id>', methods=['DELETE'])
@role_required('mesero', 'cajero', 'manager')
def remover_item_pedido(pedido_id, item_id):
    """Remover item de pedido (solo si no está pagado)"""
    conn = get_db()
    cursor = conn.cursor()

    # Validar pedido
    cursor.execute('SELECT estado FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()
    if not pedido or pedido[0] == 'pagado':
        return jsonify({'error': 'No se puede remover item de pedido pagado'}), 400

    # Validar item
    cursor.execute('SELECT combo_id FROM pedido_items WHERE id = ? AND pedido_id = ?',
                  (item_id, pedido_id))
    item = cursor.fetchone()
    if not item:
        return jsonify({'error': 'Item no encontrado'}), 404

    combo_id = item[0]

    try:
        # Si es combo, remover el item del combo Y todos sus productos desglosados
        if combo_id:
            cursor.execute('DELETE FROM pedido_items WHERE pedido_id = ? AND combo_id = ?',
                          (pedido_id, combo_id))
            cursor.execute('''
                DELETE FROM pedido_items
                WHERE pedido_id = ? AND notas = 'Parte de combo'
                AND id IN (
                    SELECT ci.producto_id FROM combo_items ci WHERE ci.combo_id = ?
                )
            ''', (pedido_id, combo_id))
        else:
            cursor.execute('DELETE FROM pedido_items WHERE id = ?', (item_id,))

        # Recalcular totales
        recalcular_totales_pedido(pedido_id)

        conn.commit()
        return jsonify({'message': 'Item removido'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500


@pos_bp.route('/pedidos/<int:pedido_id>/items/<int:item_id>', methods=['PUT'])
@role_required('mesero', 'cajero', 'manager')
def modificar_cantidad_item(pedido_id, item_id):
    """Modificar cantidad de un item"""
    data = request.json
    nueva_cantidad = data.get('cantidad', 1)

    if nueva_cantidad < 1:
        return jsonify({'error': 'cantidad debe ser >= 1'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Validar pedido
    cursor.execute('SELECT estado FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()
    if not pedido or pedido[0] == 'pagado':
        return jsonify({'error': 'No se puede modificar item de pedido pagado'}), 400

    try:
        cursor.execute('''
            UPDATE pedido_items
            SET cantidad = ?, subtotal = precio_unitario * ?
            WHERE id = ? AND pedido_id = ?
        ''', (nueva_cantidad, nueva_cantidad, item_id, pedido_id))

        recalcular_totales_pedido(pedido_id)

        conn.commit()
        return jsonify({'message': 'Item actualizado'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
```

---

## FASE 3: IVA DESGLOSADO

### 3.1 Agregar Columnas a `pedido_items`

```python
# En init_db(), después de CREATE TABLE pedido_items
cursor.execute('''
    ALTER TABLE pedido_items
    ADD COLUMN iva_porcentaje REAL DEFAULT 13.0
''')
cursor.execute('''
    ALTER TABLE pedido_items
    ADD COLUMN iva_monto REAL DEFAULT 0
''')
cursor.execute('''
    ALTER TABLE pedido_items
    ADD COLUMN total_item REAL DEFAULT 0
''')
```

### 3.2 Actualizar `recalcular_totales_pedido`

```python
def recalcular_totales_pedido(pedido_id):
    """Recalcula subtotal, IVA y total con desglose por item"""
    conn = get_db()
    cursor = conn.cursor()

    # Obtener todos los items facturables
    cursor.execute('''
        SELECT id, subtotal
        FROM pedido_items
        WHERE pedido_id = ? AND notas != 'Parte de combo'
    ''', (pedido_id,))

    items = cursor.fetchall()
    subtotal_total = 0
    iva_total = 0

    for item in items:
        item_id, subtotal = item
        iva_porcentaje = 13.0  # El Salvador
        iva_monto = subtotal * (iva_porcentaje / 100)
        total_item = subtotal + iva_monto

        # Actualizar item con IVA desglosado
        cursor.execute('''
            UPDATE pedido_items
            SET iva_porcentaje = ?, iva_monto = ?, total_item = ?
            WHERE id = ?
        ''', (iva_porcentaje, iva_monto, total_item, item_id))

        subtotal_total += subtotal
        iva_total += iva_monto

    total_general = subtotal_total + iva_total

    # Actualizar pedido
    cursor.execute('''
        UPDATE pedidos
        SET subtotal = ?, impuesto = ?, total = ?
        WHERE id = ?
    ''', (subtotal_total, iva_total, total_general, pedido_id))

    conn.commit()
```

---

## FASE 4: DIGIFACT MEJORADO

### 4.1 Actualizar Generador de DTE

**Archivo:** `backend/facturacion.py`

```python
def generar_estructura_factura_digifact(pedido_id, tipo_comprobante='factura'):
    """Genera estructura JSON para enviar a Digifact con IVA desglosado"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()

    if not pedido:
        return None

    # Obtener items del pedido (solo facturables)
    cursor.execute('''
        SELECT pi.producto_id, p.nombre, pi.cantidad, pi.precio_unitario,
               pi.subtotal, pi.iva_monto, pi.total_item
        FROM pedido_items pi
        LEFT JOIN productos p ON pi.producto_id = p.id
        WHERE pi.pedido_id = ? AND pi.notas != 'Parte de combo'
    ''', (pedido_id,))

    items = cursor.fetchall()

    # Construir items para Digifact
    items_factura = []
    for item in items:
        items_factura.append({
            'descripcion': item[1],  # nombre del producto
            'cantidad': item[2],
            'precio_unitario': float(item[3]),
            'subtotal': float(item[4]),
            'iva_porcentaje': 13.0,
            'iva_monto': float(item[5]),
            'total': float(item[6])
        })

    # Datos del cliente (si aplica)
    cliente_info = {
        'nombre': pedido[5] or 'Cliente Consumidor',  # cliente_nombre
        'tipoDocumento': 'DUI' if pedido[7] else None,  # cliente_tipo_doc
        'numDocumento': pedido[8],  # cliente_num_doc
        'nrc': pedido[9],  # cliente_nrc
        'direccion': pedido[10],  # cliente_direccion
        'telefono': pedido[11],  # cliente_telefono
        'correo': pedido[12]  # cliente_correo
    }

    estructura = {
        'tipo_comprobante': tipo_comprobante,  # 'factura' o 'ticket'
        'cliente': cliente_info,
        'items': items_factura,
        'subtotal': float(pedido[6]),  # subtotal
        'iva_total': float(pedido[7]),  # impuesto
        'total': float(pedido[8]),  # total
        'fecha_documento': pedido[21],  # created_at
        'notas': pedido[4]  # notas
    }

    return estructura
```

---

## FASE 5: NOTIFICACIONES EN TIEMPO REAL

### 5.1 Usar Server-Sent Events (SSE) - Alternativa simple a WebSocket

**Archivo:** `backend/app.py`

```python
from flask import Response, jsonify
import json
from datetime import datetime

# Cola de eventos (en producción usar Redis)
eventos_cocina = []
eventos_mesero = {}  # {usuario_id: [eventos]}

@app.route('/api/eventos/cocina/stream')
@role_required('cocinero', 'manager')
def stream_eventos_cocina():
    """SSE stream para eventos de cocina"""
    def generar():
        cliente_id = session.get('user_id')
        yield f"data: {json.dumps({'tipo': 'conectado'})}\n\n"

        while True:
            # Obtener nuevos pedidos cada 3 segundos
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, mesa_id, estado, created_at
                FROM pedidos
                WHERE estado IN ('pagado', 'en_mesa')
                AND updated_at > datetime('now', '-3 seconds')
            ''')
            nuevos = cursor.fetchall()

            if nuevos:
                for pedido in nuevos:
                    evento = {
                        'tipo': 'nuevo_pedido',
                        'pedido_id': pedido[0],
                        'mesa': pedido[1],
                        'timestamp': pedido[3]
                    }
                    yield f"data: {json.dumps(evento)}\n\n"

            time.sleep(3)

    return Response(generar(), mimetype='text/event-stream')


@app.route('/api/eventos/mesero/stream')
@role_required('mesero', 'manager')
def stream_eventos_mesero():
    """SSE stream para eventos del mesero (pedidos listos)"""
    def generar():
        usuario_id = session.get('user_id')
        yield f"data: {json.dumps({'tipo': 'conectado'})}\n\n"

        while True:
            # Obtener pedidos listos para este mesero
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, mesa_id, updated_at
                FROM pedidos
                WHERE mesero_id = ? AND estado = 'listo'
                AND updated_at > datetime('now', '-3 seconds')
            ''', (usuario_id,))
            listos = cursor.fetchall()

            if listos:
                for pedido in listos:
                    evento = {
                        'tipo': 'pedido_listo',
                        'pedido_id': pedido[0],
                        'mesa': pedido[1],
                        'timestamp': pedido[2]
                    }
                    yield f"data: {json.dumps(evento)}\n\n"

            time.sleep(3)

    return Response(generar(), mimetype='text/event-stream')
```

### 5.2 Frontend: Escuchar SSE

**Archivo:** `frontend/js/cocina.js` (o nuevo archivo)

```javascript
// Conectar al stream de eventos de cocina
function conectarEventosCocina() {
    const eventSource = new EventSource('/api/eventos/cocina/stream');

    eventSource.addEventListener('message', function(event) {
        const data = JSON.parse(event.data);

        if (data.tipo === 'nuevo_pedido') {
            // Recargar lista de pedidos o agregar al DOM
            document.dispatchEvent(new CustomEvent('nuevo_pedido', { detail: data }));
            // Sonido/notificación
            reproducirAlerta();
        }
    });

    eventSource.onerror = function() {
        console.log('Reconectando en 5 segundos...');
        setTimeout(conectarEventosCocina, 5000);
    };
}

// Llamar al cargar la página
conectarEventosCocina();
```

---

## CRONOGRAMA DE IMPLEMENTACIÓN

### Semana 1: FASES 1-2 (Combos + Gestión Items)
- [ ] Crear tablas combos y combo_items
- [ ] Endpoints CRUD para combos
- [ ] Modificar agregar_item_pedido para soportar combos
- [ ] Endpoints remover/modificar cantidad items
- [ ] Testing manual de flujos

### Semana 2: FASE 3 (IVA Desglosado)
- [ ] Agregar columnas IVA a pedido_items
- [ ] Actualizar recalcular_totales_pedido
- [ ] Endpoint para obtener desglose con IVA
- [ ] Testing de cálculos

### Semana 3: FASE 4 (Digifact)
- [ ] Mejorar generador de DTE con IVA desglosado
- [ ] Testing con Digifact sandbox
- [ ] Manejo de errores y reintentos
- [ ] Guardar respuesta de Digifact

### Semana 4: FASE 5 (Notificaciones)
- [ ] Implementar SSE streams
- [ ] Frontend: conectar a streams
- [ ] Testing en tiempo real
- [ ] Optimización y fallbacks

---

## TESTING MANUAL - CHECKLIST

### Flujo Para Llevar (Combo)
- [ ] Crear pedido para llevar
- [ ] Agregar combo al pedido
- [ ] Verificar que combos se desgloson en cocina
- [ ] Procesar pago
- [ ] Generar factura

### Flujo En Mesa (Combos + Múltiples Items)
- [ ] Asignar mesa
- [ ] Agregar 2+ combos + productos sueltos
- [ ] Remover un item
- [ ] Modificar cantidad
- [ ] Cocina ve desglose correctamente
- [ ] Pago con IVA desglosado correcto

### Digifact Integration
- [ ] Generar factura con items desglosados
- [ ] Validar estructura JSON
- [ ] Enviar a Digifact
- [ ] Guardar número de DTE
- [ ] Consultar estado en Digifact

---

## NOTAS IMPORTANTES

1. **Compatibilidad con Frontend Existente**
   - El frontend actual puede no soportar combos
   - Agregaremos API, frontend los usará si está actualizado

2. **Migraciones**
   - Usar ALTER TABLE para agregar columnas (no romper datos existentes)
   - Versionar cambios en database.py

3. **Digifact - Estándar XML**
   - Actualmente genera JSON, necesita convertirse a XML válido
   - Consultar documentación específica de Digifact

4. **Notificaciones**
   - SSE es más simple que WebSocket
   - En producción, considerar Redis para escalabilidad

5. **IVA**
   - El Salvador: 13% por defecto
   - Hacer configurable en el futuro

---

**Documento versión:** 1.0
**Última actualización:** 2025-12-31
**Próximo review:** Después de completar Fase 2
