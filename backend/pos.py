"""
Módulo POS para Pupusería
Sistema de punto de venta con flujos para Mesero, Cajero y Cocina
"""

import sqlite3
import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from auth import role_required
import json
from facturacion import GeneradorDTE, ControlCorrelativo
from inventario import descontar_stock_pedido, inicializar_inventario_productos

pos_bp = Blueprint('pos', __name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'pos.db')

def get_db():
    """Obtiene conexión a la base de datos"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Inicializa la base de datos con las tablas necesarias"""
    conn = get_db()
    cursor = conn.cursor()

    # Tabla de categorías
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            orden INTEGER DEFAULT 0
        )
    ''')

    # Tabla de productos (menú)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            precio REAL NOT NULL,
            categoria_id INTEGER,
            disponible INTEGER DEFAULT 1,
            imagen TEXT,
            -- Para productos de consumo directo (agua, gaseosas, cervezas)
            -- Si tiene materia_prima_id, se descuenta 1:1 de ese inventario
            materia_prima_id INTEGER,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        )
    ''')

    # Agregar columna materia_prima_id si no existe (para bases de datos existentes)
    try:
        cursor.execute("SELECT materia_prima_id FROM productos LIMIT 1")
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE productos ADD COLUMN materia_prima_id INTEGER")
        except:
            pass

    # Tabla de mesas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mesas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero INTEGER NOT NULL UNIQUE,
            capacidad INTEGER DEFAULT 4,
            estado TEXT DEFAULT 'libre'
        )
    ''')

    # Tabla de pedidos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mesa_id INTEGER,
            mesero TEXT,
            estado TEXT DEFAULT 'pendiente_pago',
            tipo_pago TEXT DEFAULT 'anticipado',
            subtotal REAL DEFAULT 0,
            impuesto REAL DEFAULT 0,
            total REAL DEFAULT 0,
            notas TEXT,
            -- Referencia al cliente registrado (opcional)
            cliente_id INTEGER,
            -- Campos de cliente para facturación
            cliente_tipo_doc TEXT,
            cliente_num_doc TEXT,
            cliente_nrc TEXT,
            cliente_nombre TEXT,
            cliente_direccion TEXT,
            cliente_departamento TEXT,
            cliente_municipio TEXT,
            cliente_telefono TEXT,
            cliente_correo TEXT,
            -- Campos de DTE
            dte_tipo TEXT,
            dte_codigo_generacion TEXT,
            dte_numero_control TEXT,
            dte_json TEXT,
            facturado_at TIMESTAMP,
            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            pagado_at TIMESTAMP,
            cocina_at TIMESTAMP,
            listo_at TIMESTAMP,
            servido_at TIMESTAMP,
            FOREIGN KEY (mesa_id) REFERENCES mesas(id)
        )
    ''')

    # Migración: Agregar campos si no existen (para bases de datos existentes)
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN metodo_pago TEXT DEFAULT "efectivo"')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_tipo_doc TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_num_doc TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_nrc TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_nombre TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_direccion TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_departamento TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_municipio TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_telefono TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN cliente_correo TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN dte_tipo TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN dte_codigo_generacion TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN dte_numero_control TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN dte_json TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN facturado_at TIMESTAMP')
    except:
        pass

    # Tabla de items del pedido
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pedido_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            cantidad INTEGER DEFAULT 1,
            precio_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            notas TEXT,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
            FOREIGN KEY (producto_id) REFERENCES productos(id)
        )
    ''')

    conn.commit()

    # Insertar datos iniciales si no existen
    cursor.execute('SELECT COUNT(*) FROM categorias')
    if cursor.fetchone()[0] == 0:
        insertar_datos_iniciales(conn)

    conn.close()

def insertar_datos_iniciales(conn):
    """Inserta el menú inicial de la pupusería"""
    cursor = conn.cursor()

    # Categorías
    categorias = [
        ('Pupusas', 1),
        ('Bebidas', 2),
        ('Extras', 3),
        ('Postres', 4)
    ]
    cursor.executemany('INSERT INTO categorias (nombre, orden) VALUES (?, ?)', categorias)

    # Productos
    productos = [
        # Pupusas
        ('Pupusa de Queso', 'Pupusa de queso con loroco', 0.75, 1, 1),
        ('Pupusa de Frijol', 'Pupusa de frijol molido', 0.60, 1, 1),
        ('Pupusa de Chicharrón', 'Pupusa de chicharrón', 0.75, 1, 1),
        ('Pupusa Revuelta', 'Queso, frijol y chicharrón', 0.85, 1, 1),
        ('Pupusa de Loroco', 'Pupusa de queso con loroco', 0.85, 1, 1),
        ('Pupusa de Mora', 'Pupusa de queso con mora', 1.00, 1, 1),
        ('Pupusa de Ayote', 'Pupusa dulce de ayote', 0.75, 1, 1),
        ('Pupusa de Arroz Revuelta', 'Masa de arroz revuelta', 1.25, 1, 1),
        # Bebidas
        ('Horchata', 'Bebida tradicional de morro', 1.00, 2, 1),
        ('Fresco de Tamarindo', 'Fresco natural de tamarindo', 1.00, 2, 1),
        ('Café', 'Café de olla', 0.75, 2, 1),
        ('Coca-Cola', 'Refresco 350ml', 1.00, 2, 1),
        ('Agua', 'Agua purificada', 0.50, 2, 1),
        # Extras
        ('Curtido Extra', 'Porción extra de curtido', 0.25, 3, 1),
        ('Salsa Extra', 'Porción extra de salsa', 0.25, 3, 1),
        # Postres
        ('Nuégados', 'Nuégados con miel', 1.50, 4, 1),
        ('Plátano Frito', 'Plátano frito con crema', 1.25, 4, 1),
    ]
    cursor.executemany('''
        INSERT INTO productos (nombre, descripcion, precio, categoria_id, disponible)
        VALUES (?, ?, ?, ?, ?)
    ''', productos)

    # Mesas
    mesas = [(i, 4, 'libre') for i in range(1, 11)]
    cursor.executemany('INSERT INTO mesas (numero, capacidad, estado) VALUES (?, ?, ?)', mesas)

    conn.commit()

# Inicializar BD al importar
init_db()
# Inicializar inventario para los productos
inicializar_inventario_productos()

# ============ ENDPOINTS DE PRODUCTOS ============

@pos_bp.route('/productos', methods=['GET'])
def get_productos():
    """Obtiene todos los productos del menú"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, c.nombre as categoria_nombre
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        ORDER BY c.orden, p.nombre
    ''')
    productos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(productos)

@pos_bp.route('/productos/<int:id>', methods=['GET'])
def get_producto(id):
    """Obtiene un producto por ID"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, c.nombre as categoria_nombre, mp.nombre as materia_nombre
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        LEFT JOIN materia_prima mp ON p.materia_prima_id = mp.id
        WHERE p.id = ?
    ''', (id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'Producto no encontrado'}), 404

    return jsonify(dict(row))


@pos_bp.route('/productos/<int:id>', methods=['PUT'])
def update_producto(id):
    """Actualiza un producto completo"""
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()

    # Si solo viene 'disponible', es el toggle simple
    if len(data) == 1 and 'disponible' in data:
        cursor.execute(
            'UPDATE productos SET disponible = ? WHERE id = ?',
            (data.get('disponible', 1), id)
        )
    else:
        # Actualización completa del producto
        cursor.execute('''
            UPDATE productos SET
                nombre = COALESCE(?, nombre),
                descripcion = ?,
                precio = COALESCE(?, precio),
                categoria_id = ?,
                disponible = COALESCE(?, disponible),
                materia_prima_id = ?
            WHERE id = ?
        ''', (
            data.get('nombre'),
            data.get('descripcion'),
            data.get('precio'),
            data.get('categoria_id'),
            data.get('disponible'),
            data.get('materia_prima_id'),
            id
        ))

    conn.commit()
    conn.close()
    return jsonify({'success': True})


@pos_bp.route('/productos', methods=['POST'])
def crear_producto():
    """Crea un nuevo producto"""
    data = request.get_json()

    if not data.get('nombre') or not data.get('precio'):
        return jsonify({'error': 'Nombre y precio son requeridos'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT INTO productos (nombre, descripcion, precio, categoria_id, disponible, materia_prima_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data.get('nombre'),
            data.get('descripcion'),
            float(data.get('precio')),
            data.get('categoria_id'),
            data.get('disponible', 1),
            data.get('materia_prima_id')
        ))

        producto_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'producto_id': producto_id,
            'mensaje': f"Producto '{data.get('nombre')}' creado exitosamente"
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400


@pos_bp.route('/productos/<int:id>', methods=['DELETE'])
def eliminar_producto(id):
    """Elimina un producto (o lo marca como no disponible)"""
    conn = get_db()
    cursor = conn.cursor()

    # Verificar si el producto tiene pedidos asociados
    cursor.execute('SELECT COUNT(*) FROM pedido_items WHERE producto_id = ?', (id,))
    tiene_pedidos = cursor.fetchone()[0] > 0

    if tiene_pedidos:
        # Si tiene pedidos, solo marcar como no disponible
        cursor.execute('UPDATE productos SET disponible = 0 WHERE id = ?', (id,))
        mensaje = 'Producto desactivado (tiene pedidos asociados)'
    else:
        # Si no tiene pedidos, eliminar
        cursor.execute('DELETE FROM productos WHERE id = ?', (id,))
        mensaje = 'Producto eliminado'

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'mensaje': mensaje})


# ============ ENDPOINTS DE CATEGORÍAS ============

@pos_bp.route('/categorias', methods=['GET'])
def get_categorias():
    """Obtiene todas las categorías con conteo de productos"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, COUNT(p.id) as total_productos
        FROM categorias c
        LEFT JOIN productos p ON c.id = p.categoria_id
        GROUP BY c.id
        ORDER BY c.orden
    ''')
    categorias = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(categorias)


@pos_bp.route('/categorias', methods=['POST'])
def crear_categoria():
    """Crea una nueva categoría"""
    data = request.get_json()

    if not data.get('nombre'):
        return jsonify({'error': 'El nombre es requerido'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Obtener el orden máximo actual
    cursor.execute('SELECT MAX(orden) FROM categorias')
    max_orden = cursor.fetchone()[0] or 0

    try:
        cursor.execute(
            'INSERT INTO categorias (nombre, orden) VALUES (?, ?)',
            (data.get('nombre'), max_orden + 1)
        )
        categoria_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'categoria_id': categoria_id
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400


@pos_bp.route('/categorias/<int:id>', methods=['PUT'])
def actualizar_categoria(id):
    """Actualiza una categoría"""
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE categorias SET
            nombre = COALESCE(?, nombre),
            orden = COALESCE(?, orden)
        WHERE id = ?
    ''', (data.get('nombre'), data.get('orden'), id))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


@pos_bp.route('/categorias/<int:id>', methods=['DELETE'])
def eliminar_categoria(id):
    """Elimina una categoría si no tiene productos"""
    conn = get_db()
    cursor = conn.cursor()

    # Verificar si tiene productos
    cursor.execute('SELECT COUNT(*) FROM productos WHERE categoria_id = ?', (id,))
    tiene_productos = cursor.fetchone()[0] > 0

    if tiene_productos:
        conn.close()
        return jsonify({'error': 'No se puede eliminar: la categoría tiene productos'}), 400

    cursor.execute('DELETE FROM categorias WHERE id = ?', (id,))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


# ============ ENDPOINTS DE MESAS ============

@pos_bp.route('/mesas', methods=['GET'])
def get_mesas():
    """Obtiene todas las mesas con su estado"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT m.*,
               (SELECT COUNT(*) FROM pedidos p WHERE p.mesa_id = m.id AND p.estado NOT IN ('cerrado', 'cancelado')) as pedidos_activos
        FROM mesas m
        ORDER BY m.numero
    ''')
    mesas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(mesas)

@pos_bp.route('/mesas/<int:id>', methods=['PUT'])
def update_mesa(id):
    """Actualiza estado de una mesa"""
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'UPDATE mesas SET estado = ? WHERE id = ?',
        (data.get('estado', 'libre'), id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ============ ENDPOINTS DE PEDIDOS ============

@pos_bp.route('/pedidos', methods=['GET'])
def get_pedidos():
    """Obtiene pedidos filtrados por estado"""
    estado = request.args.get('estado')
    conn = get_db()
    cursor = conn.cursor()

    if estado:
        estados = estado.split(',')
        placeholders = ','.join(['?' for _ in estados])
        cursor.execute(f'''
            SELECT p.*, m.numero as mesa_numero
            FROM pedidos p
            LEFT JOIN mesas m ON p.mesa_id = m.id
            WHERE p.estado IN ({placeholders})
            ORDER BY p.created_at DESC
        ''', estados)
    else:
        cursor.execute('''
            SELECT p.*, m.numero as mesa_numero
            FROM pedidos p
            LEFT JOIN mesas m ON p.mesa_id = m.id
            WHERE p.estado NOT IN ('cerrado', 'cancelado')
            ORDER BY p.created_at DESC
        ''')

    pedidos = [dict(row) for row in cursor.fetchall()]

    # Agregar items a cada pedido
    for pedido in pedidos:
        cursor.execute('''
            SELECT pi.*, pr.nombre as producto_nombre
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE pi.pedido_id = ?
        ''', (pedido['id'],))
        pedido['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/pedidos/<int:id>', methods=['GET'])
def get_pedido(id):
    """Obtiene un pedido específico con sus items"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.id = ?
    ''', (id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    pedido = dict(row)

    cursor.execute('''
        SELECT pi.*, pr.nombre as producto_nombre
        FROM pedido_items pi
        JOIN productos pr ON pi.producto_id = pr.id
        WHERE pi.pedido_id = ?
    ''', (id,))
    pedido['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(pedido)

@pos_bp.route('/pedidos', methods=['POST'])
def crear_pedido():
    """
    Crea un nuevo pedido
    tipo_pago: 'anticipado' (paga primero) o 'al_final' (paga después)
    Para pedidos anticipados sin mesa, se puede incluir cliente_nombre
    """
    data = request.get_json()

    mesa_id = data.get('mesa_id')  # Puede ser None para pedidos para llevar
    mesero = data.get('mesero', 'Mesero')
    tipo_pago = data.get('tipo_pago', 'anticipado')
    items = data.get('items', [])
    notas = data.get('notas', '')
    cliente_nombre = data.get('cliente_nombre', '')  # Para pedidos sin mesa

    if not items:
        return jsonify({'error': 'El pedido debe tener al menos un item'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Calcular totales
    subtotal = 0
    for item in items:
        cursor.execute('SELECT precio FROM productos WHERE id = ?', (item['producto_id'],))
        producto = cursor.fetchone()
        if producto:
            item['precio_unitario'] = producto['precio']
            item['subtotal'] = producto['precio'] * item.get('cantidad', 1)
            subtotal += item['subtotal']

    impuesto = round(subtotal * 0.13, 2)  # IVA El Salvador
    total = round(subtotal + impuesto, 2)

    # Estado inicial según tipo de pago
    estado_inicial = 'pendiente_pago' if tipo_pago == 'anticipado' else 'en_mesa'

    # Crear pedido
    cursor.execute('''
        INSERT INTO pedidos (mesa_id, mesero, estado, tipo_pago, subtotal, impuesto, total, notas, cliente_nombre)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (mesa_id, mesero, estado_inicial, tipo_pago, subtotal, impuesto, total, notas, cliente_nombre))

    pedido_id = cursor.lastrowid

    # Crear items
    for item in items:
        cursor.execute('''
            INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            pedido_id,
            item['producto_id'],
            item.get('cantidad', 1),
            item['precio_unitario'],
            item['subtotal'],
            item.get('notas', '')
        ))

    # Actualizar estado de mesa
    if mesa_id:
        cursor.execute('UPDATE mesas SET estado = ? WHERE id = ?', ('ocupada', mesa_id))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'pedido_id': pedido_id,
        'estado': estado_inicial,
        'total': total
    })

@pos_bp.route('/pedidos/<int:id>/estado', methods=['PUT'])
def actualizar_estado_pedido(id):
    """
    Actualiza el estado de un pedido
    Estados válidos: pendiente_pago, en_mesa, pagado, en_cocina, listo, servido, cerrado, cancelado
    """
    data = request.get_json()
    nuevo_estado = data.get('estado')

    estados_validos = ['pendiente_pago', 'en_mesa', 'pagado', 'en_cocina', 'listo', 'servido', 'cerrado', 'cancelado', 'credito']

    if nuevo_estado not in estados_validos:
        return jsonify({'error': f'Estado inválido. Estados válidos: {estados_validos}'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Obtener pedido actual
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    # Actualizar timestamps según el estado
    timestamp_field = None
    if nuevo_estado == 'pagado':
        timestamp_field = 'pagado_at'
    elif nuevo_estado == 'en_cocina':
        timestamp_field = 'cocina_at'
    elif nuevo_estado == 'listo':
        timestamp_field = 'listo_at'
    elif nuevo_estado == 'servido':
        timestamp_field = 'servido_at'

    if timestamp_field:
        cursor.execute(f'''
            UPDATE pedidos SET estado = ?, {timestamp_field} = ?, updated_at = ?
            WHERE id = ?
        ''', (nuevo_estado, datetime.now().isoformat(), datetime.now().isoformat(), id))
    else:
        cursor.execute('''
            UPDATE pedidos SET estado = ?, updated_at = ?
            WHERE id = ?
        ''', (nuevo_estado, datetime.now().isoformat(), id))

    # Si el pedido se cierra, cancela o va a crédito, verificar si la mesa debe liberarse
    if nuevo_estado in ['cerrado', 'cancelado', 'credito'] and pedido['mesa_id']:
        # Solo liberar la mesa si no hay otros pedidos activos
        cursor.execute('''
            SELECT COUNT(*) FROM pedidos
            WHERE mesa_id = ? AND id != ? AND estado NOT IN ('cerrado', 'cancelado', 'credito')
        ''', (pedido['mesa_id'], id))
        otros_pedidos_activos = cursor.fetchone()[0]

        if otros_pedidos_activos == 0:
            cursor.execute('UPDATE mesas SET estado = ? WHERE id = ?', ('libre', pedido['mesa_id']))

    conn.commit()
    conn.close()

    # Descontar stock cuando el pedido se marca como pagado
    if nuevo_estado == 'pagado':
        try:
            descontar_stock_pedido(id)
        except Exception as e:
            print(f"Error descontando stock del pedido {id}: {e}")

    return jsonify({'success': True, 'estado': nuevo_estado})

@pos_bp.route('/pedidos/<int:id>/items', methods=['POST'])
def agregar_item_pedido(id):
    """Agrega un item a un pedido existente"""
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    # Verificar que el pedido existe y no está cerrado
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    if pedido['estado'] in ['cerrado', 'cancelado']:
        conn.close()
        return jsonify({'error': 'No se puede modificar un pedido cerrado'}), 400

    # Obtener precio del producto
    cursor.execute('SELECT precio FROM productos WHERE id = ?', (data['producto_id'],))
    producto = cursor.fetchone()

    if not producto:
        conn.close()
        return jsonify({'error': 'Producto no encontrado'}), 404

    cantidad = data.get('cantidad', 1)
    precio_unitario = producto['precio']
    subtotal_item = precio_unitario * cantidad

    # Agregar item
    cursor.execute('''
        INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (id, data['producto_id'], cantidad, precio_unitario, subtotal_item, data.get('notas', '')))

    # Recalcular totales del pedido
    cursor.execute('SELECT SUM(subtotal) FROM pedido_items WHERE pedido_id = ?', (id,))
    nuevo_subtotal = cursor.fetchone()[0] or 0
    nuevo_impuesto = round(nuevo_subtotal * 0.13, 2)
    nuevo_total = round(nuevo_subtotal + nuevo_impuesto, 2)

    cursor.execute('''
        UPDATE pedidos SET subtotal = ?, impuesto = ?, total = ?, updated_at = ?
        WHERE id = ?
    ''', (nuevo_subtotal, nuevo_impuesto, nuevo_total, datetime.now().isoformat(), id))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'total': nuevo_total})

# ============ ENDPOINTS ESPECÍFICOS POR ROL ============

@pos_bp.route('/cocina/pedidos', methods=['GET'])
def get_pedidos_cocina():
    """Obtiene pedidos para la cocina (pagados, en_mesa o en_cocina)"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.estado IN ('pagado', 'en_mesa', 'en_cocina')
        ORDER BY
            CASE p.estado
                WHEN 'pagado' THEN 1
                WHEN 'en_mesa' THEN 2
                WHEN 'en_cocina' THEN 3
            END,
            p.created_at ASC
    ''')

    pedidos = [dict(row) for row in cursor.fetchall()]

    for pedido in pedidos:
        cursor.execute('''
            SELECT pi.*, pr.nombre as producto_nombre
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE pi.pedido_id = ?
        ''', (pedido['id'],))
        pedido['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/cajero/pedidos', methods=['GET'])
def get_pedidos_cajero():
    """Obtiene pedidos pendientes de pago:
    - pendiente_pago: pedidos anticipados esperando pago antes de cocina
    - servido + tipo_pago=al_final: pedidos servidos esperando pago
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.estado = 'pendiente_pago'
           OR (p.estado = 'servido' AND p.tipo_pago = 'al_final')
        ORDER BY
            CASE WHEN p.estado = 'servido' THEN 0 ELSE 1 END,
            p.created_at ASC
    ''')

    pedidos = [dict(row) for row in cursor.fetchall()]

    for pedido in pedidos:
        cursor.execute('''
            SELECT pi.*, pr.nombre as producto_nombre
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE pi.pedido_id = ?
        ''', (pedido['id'],))
        pedido['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/mesero/pedidos', methods=['GET'])
def get_pedidos_mesero():
    """Obtiene pedidos listos para servir"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.estado = 'listo'
        ORDER BY p.listo_at ASC
    ''')

    pedidos = [dict(row) for row in cursor.fetchall()]

    for pedido in pedidos:
        cursor.execute('''
            SELECT pi.*, pr.nombre as producto_nombre
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE pi.pedido_id = ?
        ''', (pedido['id'],))
        pedido['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(pedidos)

# ============ ESTADÍSTICAS ============

@pos_bp.route('/estadisticas/hoy', methods=['GET'])
def get_estadisticas_hoy():
    """Obtiene estadísticas del día"""
    conn = get_db()
    cursor = conn.cursor()

    hoy = datetime.now().strftime('%Y-%m-%d')

    # Ventas del día
    cursor.execute('''
        SELECT COUNT(*) as total_pedidos,
               COALESCE(SUM(total), 0) as total_ventas
        FROM pedidos
        WHERE DATE(created_at) = ? AND estado = 'cerrado'
    ''', (hoy,))
    ventas = dict(cursor.fetchone())

    # Pedidos activos
    cursor.execute('''
        SELECT estado, COUNT(*) as cantidad
        FROM pedidos
        WHERE estado NOT IN ('cerrado', 'cancelado')
        GROUP BY estado
    ''')
    activos = {row['estado']: row['cantidad'] for row in cursor.fetchall()}

    # Productos más vendidos hoy
    cursor.execute('''
        SELECT pr.nombre, SUM(pi.cantidad) as cantidad
        FROM pedido_items pi
        JOIN productos pr ON pi.producto_id = pr.id
        JOIN pedidos p ON pi.pedido_id = p.id
        WHERE DATE(p.created_at) = ? AND p.estado = 'cerrado'
        GROUP BY pr.id
        ORDER BY cantidad DESC
        LIMIT 5
    ''', (hoy,))
    top_productos = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        'fecha': hoy,
        'ventas': ventas,
        'pedidos_activos': activos,
        'top_productos': top_productos
    })

# ============ ENDPOINTS DE FACTURACIÓN ============

@pos_bp.route('/pedidos/<int:id>/cliente', methods=['PUT'])
def actualizar_cliente_pedido(id):
    """
    Actualiza información del cliente para facturación
    Puede recibir un cliente_id para vincularlo, o datos directos del cliente
    """
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    cursor.execute('''
        UPDATE pedidos SET
            cliente_id = ?,
            cliente_tipo_doc = ?,
            cliente_num_doc = ?,
            cliente_nrc = ?,
            cliente_nombre = ?,
            cliente_direccion = ?,
            cliente_departamento = ?,
            cliente_municipio = ?,
            cliente_telefono = ?,
            cliente_correo = ?,
            updated_at = ?
        WHERE id = ?
    ''', (
        data.get('cliente_id'),
        data.get('tipo_doc'),
        data.get('num_doc'),
        data.get('nrc'),
        data.get('nombre'),
        data.get('direccion'),
        data.get('departamento', '06'),
        data.get('municipio', '14'),
        data.get('telefono'),
        data.get('correo'),
        datetime.now().isoformat(),
        id
    ))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


@pos_bp.route('/pedidos/<int:id>/credito', methods=['POST'])
@role_required('cajero', 'manager')
def procesar_pago_credito(id):
    """
    Procesa una venta a crédito para un cliente
    Verifica el crédito disponible y registra la venta
    """
    data = request.get_json() or {}
    cliente_id = data.get('cliente_id')

    # Validar cliente_id
    if not cliente_id:
        return jsonify({'error': 'Se requiere cliente_id para ventas a crédito'}), 400

    # Validar monto
    try:
        monto = float(data.get('monto', 0))
    except Exception:
        return jsonify({'error': 'Monto inválido'}), 400

    if monto <= 0:
        return jsonify({'error': 'Monto debe ser mayor a 0'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verificar que el pedido existe
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    # Bloquear la BD de pedidos para evitar condiciones de carrera
    try:
        cursor.execute('BEGIN IMMEDIATE')
    except Exception:
        pass

    # Obtener información de crédito del cliente desde la base de clientes
    try:
        import sqlite3 as sqlite_clientes
        conn_clientes = sqlite_clientes.connect('clientes.db')
        conn_clientes.row_factory = sqlite_clientes.Row
        cursor_clientes = conn_clientes.cursor()

        cursor_clientes.execute('SELECT * FROM clientes WHERE id = ? AND activo = 1', (cliente_id,))
        cliente = cursor_clientes.fetchone()

        if not cliente:
            conn_clientes.close()
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        credito_autorizado = float(cliente['credito_autorizado'] or 0)

        if credito_autorizado <= 0:
            conn_clientes.close()
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
            return jsonify({'error': 'Este cliente no tiene crédito autorizado'}), 400

        # Calcular crédito utilizado (pedidos con estado 'credito' no pagados)
        cursor.execute('''
            SELECT COALESCE(SUM(total), 0) as total_credito
            FROM pedidos
            WHERE cliente_id = ? AND estado = 'credito'
        ''', (cliente_id,))
        credito_utilizado = float(cursor.fetchone()['total_credito'] or 0)

        credito_disponible = credito_autorizado - credito_utilizado

        # Validar que el monto que se intenta registrar corresponde al total del pedido
        cursor.execute('SELECT total FROM pedidos WHERE id = ?', (id,))
        pedido_total_row = cursor.fetchone()
        pedido_total = float(pedido_total_row['total']) if pedido_total_row and pedido_total_row['total'] is not None else None

        if pedido_total is not None and abs(monto - pedido_total) > 0.01:
            conn_clientes.close()
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
            return jsonify({'error': 'El monto no coincide con el total del pedido'}), 400

        if monto > credito_disponible:
            conn_clientes.close()
            try:
                conn.rollback()
            except Exception:
                pass
            conn.close()
            return jsonify({
                'error': f'Crédito insuficiente. Disponible: ${credito_disponible:.2f}, Solicitado: ${monto:.2f}',
                'credito_disponible': credito_disponible,
                'credito_autorizado': credito_autorizado,
                'credito_utilizado': credito_utilizado
            }), 400

        conn_clientes.close()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({'error': f'Error verificando crédito: {str(e)}'}), 500

    # Actualizar el pedido para registrar la venta a crédito
    cursor.execute('''
        UPDATE pedidos SET
            cliente_id = ?,
            metodo_pago = 'credito',
            estado = 'credito',
            updated_at = ?
        WHERE id = ?
    ''', (cliente_id, datetime.now().isoformat(), id))

    conn.commit()

    # Calcular nuevo crédito disponible
    nuevo_credito_utilizado = credito_utilizado + monto
    nuevo_credito_disponible = credito_autorizado - nuevo_credito_utilizado

    conn.close()

    return jsonify({
        'success': True,
        'mensaje': 'Venta a crédito registrada correctamente',
        'credito_autorizado': credito_autorizado,
        'credito_utilizado': nuevo_credito_utilizado,
        'credito_disponible': nuevo_credito_disponible
    })


@pos_bp.route('/pedidos/<int:id>/facturar', methods=['POST'])
def facturar_pedido(id):
    """
    Genera una factura electrónica (DTE) para el pedido
    Tipo: 'factura' para DTE o 'ticket' para comprobante simple
    """
    data = request.get_json()
    tipo_comprobante = data.get('tipo', 'ticket')

    conn = get_db()
    cursor = conn.cursor()

    # Obtener pedido con items
    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.id = ?
    ''', (id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    pedido = dict(row)

    # Verificar que no esté ya facturado
    if pedido.get('dte_codigo_generacion'):
        conn.close()
        return jsonify({
            'error': 'Este pedido ya fue facturado',
            'dte_codigo_generacion': pedido['dte_codigo_generacion'],
            'dte_numero_control': pedido['dte_numero_control']
        }), 400

    # Obtener items del pedido
    cursor.execute('''
        SELECT pi.*, pr.nombre as producto_nombre
        FROM pedido_items pi
        JOIN productos pr ON pi.producto_id = pr.id
        WHERE pi.pedido_id = ?
    ''', (id,))
    pedido['items'] = [dict(row) for row in cursor.fetchall()]

    # Construir información del cliente
    cliente_info = None
    if pedido.get('cliente_num_doc'):
        cliente_info = {
            'tipoDocumento': pedido.get('cliente_tipo_doc', '36'),
            'nit': pedido.get('cliente_num_doc'),
            'nrc': pedido.get('cliente_nrc'),
            'nombre': pedido.get('cliente_nombre', 'Consumidor Final'),
            'direccion': pedido.get('cliente_direccion'),
            'departamento': pedido.get('cliente_departamento', '06'),
            'municipio': pedido.get('cliente_municipio', '14'),
            'telefono': pedido.get('cliente_telefono'),
            'correo': pedido.get('cliente_correo')
        }
    elif pedido.get('cliente_nombre'):
        cliente_info = {
            'nombre': pedido.get('cliente_nombre'),
            'telefono': pedido.get('cliente_telefono'),
            'correo': pedido.get('cliente_correo')
        }

    resultado = None

    if tipo_comprobante == 'factura':
        # Generar factura electrónica (DTE)
        correlativo = ControlCorrelativo.obtener_siguiente_correlativo(conn, 'factura')
        resultado = GeneradorDTE.generar_factura_consumidor(pedido, cliente_info, correlativo)

        # Guardar información del DTE
        cursor.execute('''
            UPDATE pedidos SET
                dte_tipo = ?,
                dte_codigo_generacion = ?,
                dte_numero_control = ?,
                dte_json = ?,
                facturado_at = ?,
                updated_at = ?
            WHERE id = ?
        ''', (
            '01',  # Factura consumidor final
            resultado['codigo_generacion'],
            resultado['numero_control'],
            json.dumps(resultado['dte']),
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            id
        ))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'tipo': 'factura',
            'codigo_generacion': resultado['codigo_generacion'],
            'numero_control': resultado['numero_control'],
            'total': resultado['total'],
            'dte': resultado['dte']
        })

    else:
        # Generar ticket simple (no fiscal)
        numero_ticket = ControlCorrelativo.obtener_siguiente_correlativo(conn, 'ticket')
        resultado = GeneradorDTE.generar_ticket(pedido, numero_ticket)

        # Guardar referencia del ticket
        cursor.execute('''
            UPDATE pedidos SET
                dte_tipo = ?,
                dte_numero_control = ?,
                dte_json = ?,
                facturado_at = ?,
                updated_at = ?
            WHERE id = ?
        ''', (
            'ticket',
            resultado['numero'],
            json.dumps(resultado),
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            id
        ))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'tipo': 'ticket',
            'numero': resultado['numero'],
            'ticket': resultado
        })


@pos_bp.route('/pedidos/<int:id>/comprobante', methods=['GET'])
def get_comprobante_pedido(id):
    """
    Obtiene el comprobante (factura o ticket) de un pedido
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*, m.numero as mesa_numero
        FROM pedidos p
        LEFT JOIN mesas m ON p.mesa_id = m.id
        WHERE p.id = ?
    ''', (id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    pedido = dict(row)

    if not pedido.get('dte_json'):
        conn.close()
        return jsonify({'error': 'Este pedido no tiene comprobante'}), 404

    conn.close()

    comprobante = json.loads(pedido['dte_json'])

    return jsonify({
        'tipo': pedido.get('dte_tipo'),
        'codigo_generacion': pedido.get('dte_codigo_generacion'),
        'numero_control': pedido.get('dte_numero_control'),
        'facturado_at': pedido.get('facturado_at'),
        'comprobante': comprobante
    })


@pos_bp.route('/pedidos/<int:id>/enviar-dte', methods=['POST'])
def enviar_dte_pedido(id):
    """
    Envía el DTE a Digifact para certificación
    Requiere que el pedido ya tenga un DTE generado
    """
    import requests

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    pedido = dict(pedido)

    if pedido.get('dte_tipo') != '01':
        conn.close()
        return jsonify({'error': 'Solo se pueden enviar facturas electrónicas (DTE tipo 01)'}), 400

    if not pedido.get('dte_json'):
        conn.close()
        return jsonify({'error': 'Este pedido no tiene DTE generado'}), 400

    conn.close()

    dte_json = json.loads(pedido['dte_json'])

    # Obtener el endpoint de certificación del backend principal
    from flask import current_app
    try:
        # Llamar al endpoint interno de certificación
        response = requests.post(
            'http://localhost:5000/api/certificar-json',
            json={'dte': dte_json},
            timeout=30
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Error al enviar DTE: {str(e)}'}), 500
