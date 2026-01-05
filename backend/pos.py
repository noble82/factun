"""
Módulo POS para Pupusería
Sistema de punto de venta con flujos para Mesero, Cajero y Cocina
"""

import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from auth import role_required
import json
from facturacion import GeneradorDTE, ControlCorrelativo
from inventario import descontar_stock_pedido, inicializar_inventario_productos
from database import get_db
from notificaciones import NotificadorPedidos
from upload_handler import save_image, delete_image

pos_bp = Blueprint('pos', __name__)

# Global socketio instance (inicializado desde app.py)
socketio = None

def init_socketio(socket_instance):
    """Inicializa la instancia de socketio para este blueprint"""
    global socketio
    socketio = socket_instance

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

    # Tabla de combos (bundles de múltiples productos)
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

    # Tabla de items dentro de combos (relación M:M)
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
        except sqlite3.OperationalError:
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
            dte_xml TEXT,
            facturado_at TIMESTAMP,
            -- Información de pago
            tipo_comprobante TEXT DEFAULT 'ticket',  -- 'factura' o 'ticket'
            aplicar_iva BOOLEAN DEFAULT 0,          -- 1 si es factura, 0 si es ticket
            propina REAL DEFAULT 0,                  -- Propina agregada en pago
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
        cursor.execute('ALTER TABLE pedidos ADD COLUMN dte_xml TEXT')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN facturado_at TIMESTAMP')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN tipo_comprobante TEXT DEFAULT "ticket"')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN aplicar_iva BOOLEAN DEFAULT 0')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedidos ADD COLUMN propina REAL DEFAULT 0')
    except:
        pass

    # Migración: agregar combo_id a pedido_items (para soporte de combos)
    try:
        cursor.execute('ALTER TABLE pedido_items ADD COLUMN combo_id INTEGER')
    except:
        pass

    # Migraciones: agregar columnas para IVA desglosado
    try:
        cursor.execute('ALTER TABLE pedido_items ADD COLUMN iva_porcentaje REAL DEFAULT 13.0')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedido_items ADD COLUMN iva_monto REAL DEFAULT 0')
    except:
        pass
    try:
        cursor.execute('ALTER TABLE pedido_items ADD COLUMN total_item REAL DEFAULT 0')
    except:
        pass

    # Tabla de items del pedido
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pedido_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER NOT NULL,
            producto_id INTEGER NOT NULL,
            combo_id INTEGER,
            cantidad INTEGER DEFAULT 1,
            precio_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            iva_porcentaje REAL DEFAULT 13.0,
            iva_monto REAL DEFAULT 0,
            total_item REAL DEFAULT 0,
            notas TEXT,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
            FOREIGN KEY (producto_id) REFERENCES productos(id),
            FOREIGN KEY (combo_id) REFERENCES combos(id)
        )
    ''')

    # Tabla de ventas diarias consolidadas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ventas_diarias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha DATE UNIQUE NOT NULL,
            total_pedidos INTEGER DEFAULT 0,
            total_ventas REAL DEFAULT 0,
            subtotal_total REAL DEFAULT 0,
            impuesto_total REAL DEFAULT 0,
            propinas_total REAL DEFAULT 0,
            efectivo REAL DEFAULT 0,
            credito REAL DEFAULT 0,
            cantidad_transacciones INTEGER DEFAULT 0,
            pedido_promedio REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabla de desglose de ventas por producto
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ventas_diarias_productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_venta DATE NOT NULL,
            producto_id INTEGER NOT NULL,
            producto_nombre TEXT NOT NULL,
            categoria_id INTEGER,
            categoria_nombre TEXT,
            cantidad_vendida INTEGER DEFAULT 0,
            subtotal REAL DEFAULT 0,
            FOREIGN KEY (fecha_venta) REFERENCES ventas_diarias(fecha),
            FOREIGN KEY (producto_id) REFERENCES productos(id),
            UNIQUE(fecha_venta, producto_id)
        )
    ''')

    # Tabla de desglose de ventas por categoría
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ventas_diarias_categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_venta DATE NOT NULL,
            categoria_id INTEGER NOT NULL,
            categoria_nombre TEXT NOT NULL,
            cantidad_vendida INTEGER DEFAULT 0,
            subtotal REAL DEFAULT 0,
            FOREIGN KEY (fecha_venta) REFERENCES ventas_diarias(fecha),
            FOREIGN KEY (categoria_id) REFERENCES categorias(id),
            UNIQUE(fecha_venta, categoria_id)
        )
    ''')

    # Migración: agregar campo propinas_total a ventas_diarias
    try:
        cursor.execute('ALTER TABLE ventas_diarias ADD COLUMN propinas_total REAL DEFAULT 0')
    except:
        pass

    # ============ ÍNDICES PARA OPTIMIZAR CONSULTAS ============
    # Índices en combos
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_combos_activo ON combos(activo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_combos_nombre ON combos(nombre)')

    # Índices en combo_items
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items(combo_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_combo_items_producto_id ON combo_items(producto_id)')

    # Índices en pedidos (tabla más consultada)
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id ON pedidos(mesa_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_facturado_at ON pedidos(facturado_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedidos_pagado_at ON pedidos(pagado_at)')

    # Índices en pedido_items (tabla de relación pedido-producto)
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON pedido_items(pedido_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pedido_items_producto_id ON pedido_items(producto_id)')

    # Índices en productos
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_productos_categoria_id ON productos(categoria_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_productos_disponible ON productos(disponible)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre)')

    # Índices en mesas
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_mesas_estado ON mesas(estado)')

    # Índices en ventas_diarias
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha ON ventas_diarias(fecha)')

    # Índices en ventas_diarias_productos
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ventas_diarias_productos_fecha ON ventas_diarias_productos(fecha_venta)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ventas_diarias_productos_producto_id ON ventas_diarias_productos(producto_id)')

    # Índices en ventas_diarias_categorias
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ventas_diarias_categorias_fecha ON ventas_diarias_categorias(fecha_venta)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ventas_diarias_categorias_categoria_id ON ventas_diarias_categorias(categoria_id)')

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

# ============ FUNCIONES HELPER PARA COMBOS ============

def obtener_combo(combo_id):
    """Obtiene un combo por ID"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, COUNT(ci.id) as cantidad_items
        FROM combos c
        LEFT JOIN combo_items ci ON c.id = ci.combo_id
        WHERE c.id = ?
        GROUP BY c.id
    ''', (combo_id,))
    resultado = cursor.fetchone()
    conn.close()
    return resultado


def obtener_items_combo(combo_id):
    """Obtiene todos los productos dentro de un combo"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT ci.*, p.nombre, p.precio
        FROM combo_items ci
        JOIN productos p ON ci.producto_id = p.id
        WHERE ci.combo_id = ?
    ''', (combo_id,))
    items = cursor.fetchall()
    conn.close()
    return items


def validar_combo(nombre, precio_combo, items):
    """
    Valida que un combo sea válido:
    - Debe tener al menos 2 productos
    - El precio del combo <= suma de productos individuales
    - Todos los productos deben existir y estar disponibles

    Returns: (valido: bool, mensaje: str)
    """
    # Validación 1: al menos 2 items
    if not items or len(items) < 2:
        return False, "Combo debe tener al menos 2 productos"

    # Validación 2: todos los productos deben existir y estar disponibles
    conn = get_db()
    cursor = conn.cursor()
    suma_precios = 0

    for item in items:
        if not item.get('producto_id') or not item.get('cantidad'):
            conn.close()
            return False, "Cada item debe tener producto_id y cantidad"

        cursor.execute('SELECT precio FROM productos WHERE id = ? AND disponible = 1',
                      (item['producto_id'],))
        producto = cursor.fetchone()

        if not producto:
            conn.close()
            return False, f"Producto {item['producto_id']} no existe o no está disponible"

        suma_precios += float(producto['precio']) * float(item['cantidad'])

    # Validación 3: precio del combo <= suma de productos individuales
    if float(precio_combo) > suma_precios:
        conn.close()
        return False, f"Precio del combo (${precio_combo}) no puede ser mayor a suma de productos (${suma_precios})"

    conn.close()
    return True, "OK"


def recalcular_totales_pedido(pedido_id):
    """
    Recalcula subtotal, IVA desglosado y total de un pedido

    - Calcula IVA por cada item (13% El Salvador)
    - Actualiza iva_porcentaje, iva_monto, total_item en cada item
    - Suma solo items principales (NO desgloces de combo)
    """
    conn = get_db()
    cursor = conn.cursor()

    # Obtener todos los items principales (NO desgloces)
    # Nota: combo_id puede ser NULL, 0, o '' (string vacío)
    cursor.execute('''
        SELECT id, subtotal
        FROM pedido_items
        WHERE pedido_id = ? AND (combo_id IS NULL OR combo_id = 0 OR combo_id = '')
          AND (notas IS NULL OR notas NOT LIKE '%Desglose de combo%')
    ''', (pedido_id,))

    items = cursor.fetchall()
    subtotal_total = 0.0
    iva_total = 0.0

    # Calcular IVA para cada item
    for item in items:
        item_id = item[0]
        subtotal_item = float(item[1]) if item[1] else 0.0

        # IVA: 13% (El Salvador)
        iva_porcentaje = 13.0
        iva_monto = round(subtotal_item * (iva_porcentaje / 100), 2)
        total_item = round(subtotal_item + iva_monto, 2)

        # Actualizar el item con IVA desglosado
        cursor.execute('''
            UPDATE pedido_items
            SET iva_porcentaje = ?, iva_monto = ?, total_item = ?
            WHERE id = ?
        ''', (iva_porcentaje, iva_monto, total_item, item_id))

        subtotal_total += subtotal_item
        iva_total += iva_monto

    total_general = round(subtotal_total + iva_total, 2)

    # Actualizar totales en el pedido
    cursor.execute('''
        UPDATE pedidos
        SET subtotal = ?, impuesto = ?, total = ?, updated_at = ?
        WHERE id = ?
    ''', (round(subtotal_total, 2), round(iva_total, 2), total_general,
          datetime.now().isoformat(), pedido_id))

    conn.commit()
    conn.close()

# ============ FUNCIONES DE REPORTES ============

def consolidar_ventas_diarias(fecha_str=None):
    """
    Consolida las ventas del día en las tablas de resumen.
    Se ejecuta automáticamente nightly (23:55) o manualmente.

    Args:
        fecha_str: Fecha a consolidar en formato 'YYYY-MM-DD'.
                   Si es None, usa la fecha actual.
    """
    from datetime import datetime, timedelta

    if fecha_str is None:
        # Si no se especifica, consolida el día anterior (el día completo ya pasó)
        fecha_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 1. Obtener pedidos cerrados del día
        cursor.execute('''
            SELECT
                COUNT(*) as total_pedidos,
                COALESCE(SUM(total), 0) as total_ventas,
                COALESCE(SUM(subtotal), 0) as subtotal_total,
                COALESCE(SUM(impuesto), 0) as impuesto_total,
                COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) as efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'credito' THEN total ELSE 0 END), 0) as credito
            FROM pedidos
            WHERE DATE(created_at) = ? AND estado = 'cerrado'
        ''', (fecha_str,))

        stats = cursor.fetchone()
        total_pedidos = stats[0] if stats[0] else 0
        total_ventas = stats[1] if stats[1] else 0
        subtotal_total = stats[2] if stats[2] else 0
        impuesto_total = stats[3] if stats[3] else 0
        efectivo = stats[4] if stats[4] else 0
        credito = stats[5] if stats[5] else 0

        # Calcular promedio por pedido
        pedido_promedio = total_ventas / total_pedidos if total_pedidos > 0 else 0

        # 2. Insertar o actualizar registro en ventas_diarias
        cursor.execute('''
            INSERT OR REPLACE INTO ventas_diarias
            (fecha, total_pedidos, total_ventas, subtotal_total, impuesto_total,
             efectivo, credito, cantidad_transacciones, pedido_promedio, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (fecha_str, total_pedidos, total_ventas, subtotal_total, impuesto_total,
              efectivo, credito, total_pedidos, pedido_promedio))

        # 3. Desglose por producto
        cursor.execute('''
            SELECT
                pi.producto_id,
                pr.nombre as producto_nombre,
                pr.categoria_id,
                c.nombre as categoria_nombre,
                SUM(pi.cantidad) as cantidad_vendida,
                COALESCE(SUM(pi.subtotal), 0) as subtotal
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            JOIN pedidos p ON pi.pedido_id = p.id
            LEFT JOIN categorias c ON pr.categoria_id = c.id
            WHERE DATE(p.created_at) = ? AND p.estado = 'cerrado'
            GROUP BY pi.producto_id
        ''', (fecha_str,))

        productos = cursor.fetchall()

        # Limpiar registros anteriores de ese día
        cursor.execute('DELETE FROM ventas_diarias_productos WHERE fecha_venta = ?', (fecha_str,))

        # Insertar desglose por producto
        for prod in productos:
            cursor.execute('''
                INSERT INTO ventas_diarias_productos
                (fecha_venta, producto_id, producto_nombre, categoria_id, categoria_nombre,
                 cantidad_vendida, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (fecha_str, prod[0], prod[1], prod[2], prod[3], prod[4], prod[5]))

        # 4. Desglose por categoría
        cursor.execute('''
            SELECT
                c.id,
                c.nombre as categoria_nombre,
                SUM(pi.cantidad) as cantidad_vendida,
                COALESCE(SUM(pi.subtotal), 0) as subtotal
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            JOIN categorias c ON pr.categoria_id = c.id
            JOIN pedidos p ON pi.pedido_id = p.id
            WHERE DATE(p.created_at) = ? AND p.estado = 'cerrado'
            GROUP BY c.id
        ''', (fecha_str,))

        categorias = cursor.fetchall()

        # Limpiar registros anteriores de ese día
        cursor.execute('DELETE FROM ventas_diarias_categorias WHERE fecha_venta = ?', (fecha_str,))

        # Insertar desglose por categoría
        for cat in categorias:
            cursor.execute('''
                INSERT INTO ventas_diarias_categorias
                (fecha_venta, categoria_id, categoria_nombre, cantidad_vendida, subtotal)
                VALUES (?, ?, ?, ?, ?)
            ''', (fecha_str, cat[0], cat[1], cat[2], cat[3]))

        conn.commit()
        print(f"Consolidación de ventas diarias completada para {fecha_str}")
        return {
            'success': True,
            'fecha': fecha_str,
            'total_pedidos': total_pedidos,
            'total_ventas': total_ventas
        }

    except Exception as e:
        conn.rollback()
        print(f"Error consolidando ventas diarias para {fecha_str}: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

    finally:
        conn.close()

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
@role_required('manager')
def update_producto(id):
    """Actualiza un producto completo con soporte para imagen"""
    conn = get_db()
    cursor = conn.cursor()

    # Si solo viene 'disponible', es el toggle simple
    if request.is_json:
        data = request.get_json()
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
    else:
        # Manejar multipart/form-data (con imagen)
        update_fields = []
        update_values = []

        if 'nombre' in request.form:
            update_fields.append('nombre = ?')
            update_values.append(request.form['nombre'])
        if 'descripcion' in request.form:
            update_fields.append('descripcion = ?')
            update_values.append(request.form['descripcion'])
        if 'precio' in request.form:
            update_fields.append('precio = ?')
            update_values.append(float(request.form['precio']))
        if 'categoria_id' in request.form:
            update_fields.append('categoria_id = ?')
            update_values.append(request.form['categoria_id'])
        if 'disponible' in request.form:
            update_fields.append('disponible = ?')
            update_values.append(request.form['disponible'])

        # Procesar imagen si se proporciona
        if 'imagen' in request.files:
            file = request.files['imagen']
            if file and file.filename:
                success, result = save_image(file, 'productos')
                if not success:
                    conn.close()
                    return jsonify({'error': result}), 400

                # Eliminar imagen anterior si existe
                cursor.execute('SELECT imagen FROM productos WHERE id = ?', (id,))
                row = cursor.fetchone()
                if row and row[0]:
                    delete_image(row[0])

                update_fields.append('imagen = ?')
                update_values.append(result)

        if update_fields:
            update_values.append(id)
            query = f"UPDATE productos SET {', '.join(update_fields)} WHERE id = ?"
            cursor.execute(query, update_values)

    conn.commit()
    conn.close()
    return jsonify({'success': True})


@pos_bp.route('/productos', methods=['POST'])
@role_required('manager')
def crear_producto():
    """Crea un nuevo producto con soporte para imagen"""
    # Manejar multipart/form-data
    nombre = request.form.get('nombre')
    precio = request.form.get('precio')

    if not nombre or not precio:
        return jsonify({'error': 'Nombre y precio son requeridos'}), 400

    imagen_path = None

    # Procesar imagen si se proporciona
    if 'imagen' in request.files:
        file = request.files['imagen']
        if file and file.filename:
            success, result = save_image(file, 'productos')
            if not success:
                return jsonify({'error': result}), 400
            imagen_path = result

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT INTO productos (nombre, descripcion, precio, categoria_id, disponible, materia_prima_id, imagen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            nombre,
            request.form.get('descripcion', ''),
            float(precio),
            request.form.get('categoria_id'),
            request.form.get('disponible', 1),
            request.form.get('materia_prima_id'),
            imagen_path or ''
        ))

        producto_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'producto_id': producto_id,
            'imagen': imagen_path,
            'mensaje': f"Producto '{nombre}' creado exitosamente"
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400


@pos_bp.route('/productos/<int:id>', methods=['DELETE'])
@role_required('manager')
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


@pos_bp.route('/categorias/<int:categoria_id>/productos', methods=['GET'])
def obtener_productos_categoria(categoria_id):
    """Obtiene los productos de una categoría"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, nombre, precio, categoria_id, disponible
            FROM productos
            WHERE categoria_id = ? AND disponible = 1
            ORDER BY nombre
        ''', (categoria_id,))

        productos = cursor.fetchall()
        conn.close()

        return jsonify([dict(p) for p in productos])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@pos_bp.route('/categorias', methods=['POST'])
@role_required('manager')
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
@role_required('manager')
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


# ============ ENDPOINTS DE COMBOS ============

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
    combos = [dict(row) for row in cursor.fetchall()]

    # Obtener items para cada combo
    resultado = []
    for combo in combos:
        items = obtener_items_combo(combo['id'])
        resultado.append({
            'id': combo['id'],
            'nombre': combo['nombre'],
            'descripcion': combo['descripcion'],
            'precio_combo': combo['precio_combo'],
            'imagen': combo['imagen'],
            'activo': combo['activo'],
            'cantidad_items': combo['cantidad_items'],
            'items': [
                {
                    'id': item[0],
                    'producto_id': item[1],
                    'producto_nombre': item[3],
                    'cantidad': item[2],
                    'precio_unitario': item[4]
                } for item in items
            ]
        })

    conn.close()
    return jsonify(resultado)


@pos_bp.route('/combos', methods=['POST'])
@role_required('manager')
def crear_combo():
    """Crear nuevo combo con soporte para imagen"""
    # Manejar tanto JSON como multipart/form-data
    if request.is_json:
        data = request.get_json()
        nombre = data.get('nombre')
        precio_combo = data.get('precio_combo')
        descripcion = data.get('descripcion', '')
        items_data = data.get('productos', data.get('items', []))
        imagen_path = data.get('imagen')
    else:
        nombre = request.form.get('nombre')
        precio_combo = request.form.get('precio_combo')
        descripcion = request.form.get('descripcion', '')

        # Parse items JSON desde form
        import json as json_module
        items_data = []
        try:
            items_str = request.form.get('productos', request.form.get('items', '[]'))
            items_data = json_module.loads(items_str) if items_str else []
        except:
            items_data = []

        imagen_path = None
        # Procesar imagen si se proporciona
        if 'imagen' in request.files:
            file = request.files['imagen']
            if file and file.filename:
                success, result = save_image(file, 'combos')
                if not success:
                    return jsonify({'error': result}), 400
                imagen_path = result

    # Validar datos obligatorios
    if not nombre or precio_combo is None:
        return jsonify({'error': 'nombre y precio_combo son requeridos'}), 400

    # Validar combo
    valido, mensaje = validar_combo(nombre, float(precio_combo), items_data)
    if not valido:
        return jsonify({'error': mensaje}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Insertar combo
        cursor.execute('''
            INSERT INTO combos (nombre, descripcion, precio_combo, imagen, activo)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            nombre,
            descripcion,
            float(precio_combo),
            imagen_path or '',
            request.form.get('activo', 1) if not request.is_json else request.get_json().get('activo', 1)
        ))

        combo_id = cursor.lastrowid

        # Insertar items del combo
        for item in items_data:
            cursor.execute('''
                INSERT INTO combo_items (combo_id, producto_id, cantidad)
                VALUES (?, ?, ?)
            ''', (combo_id, item['producto_id'], item['cantidad']))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'id': combo_id,
            'nombre': nombre,
            'precio_combo': precio_combo,
            'imagen': imagen_path,
            'mensaje': f"Combo '{nombre}' creado exitosamente"
        }), 201
    except Exception as e:
        conn.rollback()
        conn.close()
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
        'id': combo['id'],
        'nombre': combo['nombre'],
        'descripcion': combo['descripcion'],
        'precio_combo': combo['precio_combo'],
        'imagen': combo['imagen'],
        'activo': combo['activo'],
        'cantidad_items': combo['cantidad_items'],
        'items': [
            {
                'id': item[0],
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
    """Actualizar combo y sus items con soporte para imagen"""
    # Manejar tanto JSON como multipart/form-data
    if request.is_json:
        data = request.get_json()
        nombre = data.get('nombre')
        precio_combo = data.get('precio_combo')
        descripcion = data.get('descripcion')
        items = data.get('items', data.get('productos'))
        imagen_path = data.get('imagen')
    else:
        nombre = request.form.get('nombre')
        precio_combo = request.form.get('precio_combo')
        descripcion = request.form.get('descripcion')

        # Parse items JSON desde form
        import json as json_module
        items = []
        try:
            items_str = request.form.get('items', request.form.get('productos', '[]'))
            items = json_module.loads(items_str) if items_str else []
        except:
            items = []

        imagen_path = None
        # Procesar imagen si se proporciona
        if 'imagen' in request.files:
            file = request.files['imagen']
            if file and file.filename:
                success, result = save_image(file, 'combos')
                if not success:
                    return jsonify({'error': result}), 400
                imagen_path = result

    combo = obtener_combo(combo_id)
    if not combo:
        return jsonify({'error': 'Combo no encontrado'}), 404

    # Obtener valores existentes si no se proporcionan nuevos
    nombre = nombre or combo['nombre']
    precio_combo = precio_combo or combo['precio_combo']
    descripcion = descripcion if descripcion is not None else combo['descripcion']
    imagen_path = imagen_path if imagen_path is not None else combo['imagen']

    # Si se proporcionan items, validar combo completo
    if items:
        valido, mensaje = validar_combo(nombre, float(precio_combo), items)
        if not valido:
            return jsonify({'error': mensaje}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Si se sube nueva imagen, eliminar la anterior
        if imagen_path and imagen_path != combo['imagen']:
            if combo['imagen']:
                delete_image(combo['imagen'])

        # Actualizar combo
        cursor.execute('''
            UPDATE combos
            SET nombre = ?, descripcion = ?, precio_combo = ?, imagen = ?,
                activo = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            nombre,
            descripcion,
            float(precio_combo),
            imagen_path,
            request.form.get('activo', combo['activo']) if not request.is_json else request.get_json().get('activo', combo['activo']),
            combo_id
        ))

        # Actualizar items si se proporcionan
        if items:
            cursor.execute('DELETE FROM combo_items WHERE combo_id = ?', (combo_id,))
            for item in items:
                cursor.execute('''
                    INSERT INTO combo_items (combo_id, producto_id, cantidad)
                    VALUES (?, ?, ?)
                ''', (combo_id, item['producto_id'], item['cantidad']))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'id': combo_id,
            'imagen': imagen_path,
            'mensaje': f"Combo actualizado exitosamente"
        })
    except Exception as e:
        conn.rollback()
        conn.close()
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

    try:
        cursor.execute(
            'UPDATE combos SET activo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (combo_id,)
        )
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'mensaje': 'Combo desactivado exitosamente'
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500


# ============ ENDPOINTS DE MESAS ============

@pos_bp.route('/mesas', methods=['GET'])
@role_required('mesero', 'cajero', 'manager')
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
@role_required('manager')
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

# ============ HELPER FUNCTIONS ============

def _cargar_items_para_pedidos(cursor, pedido_ids):
    """
    Carga todos los items para un conjunto de pedidos en una sola query.
    Evita el problema N+1 usando WHERE IN en lugar de un loop.

    Args:
        cursor: Cursor de base de datos
        pedido_ids: Lista de IDs de pedidos

    Returns:
        Diccionario con estructura {pedido_id: [items]}
    """
    if not pedido_ids:
        return {}

    placeholders = ','.join(['?' for _ in pedido_ids])
    cursor.execute(f'''
        SELECT pi.*, pr.nombre as producto_nombre
        FROM pedido_items pi
        JOIN productos pr ON pi.producto_id = pr.id
        WHERE pi.pedido_id IN ({placeholders})
        ORDER BY pi.pedido_id, pi.id
    ''', pedido_ids)

    # Agrupar items por pedido_id
    items_por_pedido = {}
    for row in cursor.fetchall():
        row_dict = dict(row)
        pedido_id = row_dict['pedido_id']
        if pedido_id not in items_por_pedido:
            items_por_pedido[pedido_id] = []
        items_por_pedido[pedido_id].append(row_dict)

    return items_por_pedido

# ============ ENDPOINTS DE PEDIDOS ============

@pos_bp.route('/pedidos', methods=['GET'])
@role_required('manager', 'mesero', 'cocinero')
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

    # Cargar todos los items en una sola query (evitar N+1)
    pedido_ids = [p['id'] for p in pedidos]
    items_por_pedido = _cargar_items_para_pedidos(cursor, pedido_ids)

    # Asignar items a cada pedido
    for pedido in pedidos:
        pedido['items'] = items_por_pedido.get(pedido['id'], [])

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/pedidos/<int:id>', methods=['GET'])
@role_required('manager', 'mesero', 'cocinero', 'cajero')
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


@pos_bp.route('/pedidos/<int:id>/desglose-iva', methods=['GET'])
@role_required('manager', 'mesero', 'cajero')
def get_pedido_desglose_iva(id):
    """
    Obtiene un pedido con desglose completo de IVA por item

    Retorna:
    - Información del pedido
    - Items con: cantidad, precio_unitario, subtotal, iva_porcentaje, iva_monto, total_item
    - Resumen: subtotal_total, iva_total, total_general
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

    # Obtener solo items principales (NO desgloces)
    cursor.execute('''
        SELECT pi.id, pi.combo_id, pi.producto_id, pi.cantidad,
               pi.precio_unitario, pi.subtotal, pi.iva_porcentaje,
               pi.iva_monto, pi.total_item, pi.notas,
               COALESCE(pr.nombre, c.nombre) as item_nombre,
               CASE WHEN pi.combo_id IS NOT NULL THEN 'combo' ELSE 'producto' END as tipo_item
        FROM pedido_items pi
        LEFT JOIN productos pr ON pi.producto_id = pr.id
        LEFT JOIN combos c ON pi.combo_id = c.id
        WHERE pi.pedido_id = ? AND (pi.combo_id IS NULL OR pi.combo_id = 0)
        ORDER BY pi.id
    ''', (id,))

    items = [dict(row) for row in cursor.fetchall()]

    # Calcular totales para validación
    subtotal_total = sum(float(item.get('subtotal', 0)) for item in items)
    iva_total = sum(float(item.get('iva_monto', 0)) for item in items)
    total_general = round(subtotal_total + iva_total, 2)

    conn.close()

    return jsonify({
        'pedido': pedido,
        'items': items,
        'resumen': {
            'subtotal': round(subtotal_total, 2),
            'iva_total': round(iva_total, 2),
            'total': total_general,
            'cantidad_items': len(items)
        }
    })


@pos_bp.route('/pedidos', methods=['POST'])
@role_required('mesero', 'cajero', 'manager')
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

    # Calcular totales - soporta productos y combos
    subtotal = 0
    items_expandidos = []

    for item in items:
        cantidad = item.get('cantidad', 1)

        if item.get('combo_id') or item.get('es_combo'):
            # Es un combo - obtener precio del combo
            combo_id = item.get('combo_id')
            cursor.execute('SELECT id, nombre, precio_combo FROM combos WHERE id = ?', (combo_id,))
            combo = cursor.fetchone()
            if combo:
                item['precio_unitario'] = combo['precio_combo']
                item['subtotal'] = combo['precio_combo'] * cantidad
                item['nombre_item'] = combo['nombre']
                item['es_combo'] = True
                subtotal += item['subtotal']
                items_expandidos.append(item)

                # Obtener productos del combo para desglose en cocina
                cursor.execute('''
                    SELECT ci.producto_id, ci.cantidad, p.nombre, p.precio
                    FROM combo_items ci
                    JOIN productos p ON ci.producto_id = p.id
                    WHERE ci.combo_id = ?
                ''', (combo_id,))
                combo_productos = cursor.fetchall()
                for cp in combo_productos:
                    items_expandidos.append({
                        'producto_id': cp['producto_id'],
                        'cantidad': cp['cantidad'] * cantidad,
                        'precio_unitario': 0,  # No suma al total
                        'subtotal': 0,
                        'notas': f"Desglose de combo: {combo['nombre']}",
                        'es_desglose': True
                    })
        else:
            # Es un producto normal
            cursor.execute('SELECT precio FROM productos WHERE id = ?', (item['producto_id'],))
            producto = cursor.fetchone()
            if producto:
                item['precio_unitario'] = producto['precio']
                item['subtotal'] = producto['precio'] * cantidad
                subtotal += item['subtotal']
                items_expandidos.append(item)

    items = items_expandidos

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

    # Crear items (productos y combos)
    for item in items:
        cursor.execute('''
            INSERT INTO pedido_items (pedido_id, producto_id, combo_id, cantidad, precio_unitario, subtotal, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            pedido_id,
            item.get('producto_id'),
            item.get('combo_id'),
            item.get('cantidad', 1),
            item.get('precio_unitario', 0),
            item.get('subtotal', 0),
            item.get('notas', '')
        ))

    # Actualizar estado de mesa
    if mesa_id:
        cursor.execute('UPDATE mesas SET estado = ? WHERE id = ?', ('ocupada', mesa_id))

    conn.commit()

    # Recalcular totales con IVA desglosado por item
    recalcular_totales_pedido(pedido_id)

    # Obtener detalles del pedido para notificación
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (pedido_id,))
    pedido_creado = cursor.fetchone()
    conn.close()

    # ===== NOTIFICAR NUEVO PEDIDO A COCINA =====
    if socketio and pedido_creado:
        try:
            # Preparar datos del pedido para notificación
            pedido_notif = {
                "id": pedido_id,
                "mesa_numero": pedido_creado['mesa_id'] or None,
                "mesa_id": pedido_creado['mesa_id'],
                "items": items,
                "tipo": tipo_pago,
                "cliente_nombre": cliente_nombre,
                "mesero": mesero,
                "subtotal": subtotal,
                "impuesto": impuesto,
                "total": total,
                "estado": estado_inicial,
                "timestamp": datetime.now().isoformat()
            }

            # Solo notificar si está en estado pendiente_pago (listo para cocina)
            if estado_inicial in ['pendiente_pago', 'en_mesa']:
                NotificadorPedidos.notificar_nuevo_pedido(socketio, pedido_notif)
        except Exception as e:
            print(f"Error notificando nuevo pedido {pedido_id}: {e}")

    return jsonify({
        'success': True,
        'pedido_id': pedido_id,
        'estado': estado_inicial,
        'total': total
    })

@pos_bp.route('/pedidos/<int:id>/estado', methods=['PUT'])
@role_required('mesero', 'cocinero', 'cajero', 'manager')
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

    # ===== NOTIFICAR CAMBIO DE ESTADO =====
    if socketio:
        try:
            NotificadorPedidos.notificar_cambio_estado_pedido(socketio, id, nuevo_estado)
        except Exception as e:
            print(f"Error notificando cambio de estado del pedido {id}: {e}")

    conn.close()

    # Descontar stock cuando el pedido se marca como pagado
    if nuevo_estado == 'pagado':
        try:
            descontar_stock_pedido(id)
        except Exception as e:
            print(f"Error descontando stock del pedido {id}: {e}")

    return jsonify({'success': True, 'estado': nuevo_estado})

@pos_bp.route('/pedidos/<int:id>/pago', methods=['PUT'])
@role_required('cajero', 'manager')
def actualizar_pago_pedido(id):
    """
    Actualiza información de pago del pedido
    Recibe: tipo_comprobante, aplicar_iva, propina
    """
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()

    # Obtener pedido actual
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    tipo_comprobante = data.get('tipo_comprobante', 'ticket')
    aplicar_iva = data.get('aplicar_iva', 0)
    propina = data.get('propina', 0)

    # Calcular nuevo total si hay cambios
    subtotal = pedido['subtotal']
    impuesto = pedido['impuesto']

    # Si es factura (aplicar_iva=1), agregar IVA (13%) al subtotal
    # Si es ticket (aplicar_iva=0), solo suma propina al total existente
    if aplicar_iva and tipo_comprobante == 'factura':
        impuesto = subtotal * 0.13
        nuevo_total = subtotal + impuesto + propina
    else:
        # Para ticket, el total existente ya no tiene IVA
        nuevo_total = pedido['total'] + propina

    # ===== DETERMINAR ESTADO FINAL SEGÚN FLUJO DE PAGO =====
    tipo_pago = pedido['tipo_pago']  # 'anticipado' o 'al_final'
    mesa_id = pedido['mesa_id']

    # Determinar el estado después del pago según el flujo
    if tipo_pago == 'anticipado':
        # Para llevar: pagado → en_cocina (para que cocina prepare)
        estado_final = 'en_cocina'
        timestamp_field = 'cocina_at'
    else:
        # En mesa (al_final): pagado → cerrado (cliente ya comió, solo falta pagar)
        estado_final = 'cerrado'
        timestamp_field = None

    # Actualizar pedido con información de pago
    if timestamp_field:
        cursor.execute(f'''
            UPDATE pedidos
            SET tipo_comprobante = ?, aplicar_iva = ?, propina = ?,
                impuesto = ?, total = ?, estado = ?,
                pagado_at = ?, {timestamp_field} = ?, updated_at = ?
            WHERE id = ?
        ''', (tipo_comprobante, aplicar_iva, propina, impuesto, nuevo_total, estado_final,
              datetime.now().isoformat(), datetime.now().isoformat(), datetime.now().isoformat(), id))
    else:
        cursor.execute('''
            UPDATE pedidos
            SET tipo_comprobante = ?, aplicar_iva = ?, propina = ?,
                impuesto = ?, total = ?, estado = ?,
                pagado_at = ?, updated_at = ?
            WHERE id = ?
        ''', (tipo_comprobante, aplicar_iva, propina, impuesto, nuevo_total, estado_final,
              datetime.now().isoformat(), datetime.now().isoformat(), id))

    # ===== LIBERAR MESA SI ES PEDIDO EN MESA (al_final) =====
    if estado_final == 'cerrado' and mesa_id:
        # Verificar que no hay otros pedidos activos en esta mesa
        cursor.execute('''
            SELECT COUNT(*) FROM pedidos
            WHERE mesa_id = ? AND id != ? AND estado NOT IN ('cerrado', 'cancelado')
        ''', (mesa_id, id))
        otros_pedidos = cursor.fetchone()[0]

        if otros_pedidos == 0:
            cursor.execute('UPDATE mesas SET estado = ? WHERE id = ?', ('libre', mesa_id))
            print(f"[POS] Mesa {mesa_id} liberada después de pago del pedido {id}")

    conn.commit()

    # Descontar stock cuando el pedido se marca como pagado
    try:
        descontar_stock_pedido(id)
    except Exception as e:
        print(f"Error descontando stock del pedido {id}: {e}")

    # Notificar cambio de estado si hay socketio
    if socketio:
        try:
            NotificadorPedidos.notificar_cambio_estado_pedido(socketio, id, estado_final)
        except Exception as e:
            print(f"Error notificando cambio de estado del pedido {id}: {e}")

    conn.close()

    return jsonify({
        'success': True,
        'tipo_comprobante': tipo_comprobante,
        'aplicar_iva': aplicar_iva,
        'propina': propina,
        'impuesto': impuesto,
        'total': nuevo_total,
        'estado': estado_final,
        'mesa_liberada': estado_final == 'cerrado' and mesa_id is not None
    })

@pos_bp.route('/pedidos/<int:id>/items', methods=['POST'])
@role_required('mesero', 'cajero', 'manager')
def agregar_item_pedido(id):
    """
    Agrega un item (producto o combo) a un pedido existente

    Request body:
    - Si es producto: {"producto_id": 1, "cantidad": 2, "notas": "..."}
    - Si es combo: {"combo_id": 1, "cantidad": 1}

    Al agregar combo:
    - Crea 1 item del combo en pedido_items (para facturación)
    - Crea N items individuales desglosados (para cocina)
    """
    data = request.get_json()

    # Validar que se proporcione producto_id O combo_id
    producto_id = data.get('producto_id')
    combo_id = data.get('combo_id')

    if not producto_id and not combo_id:
        return jsonify({'error': 'Se requiere producto_id o combo_id'}), 400

    if producto_id and combo_id:
        return jsonify({'error': 'Proporciona producto_id O combo_id, no ambos'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verificar que el pedido existe y no está pagado
    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    if pedido['estado'] == 'pagado':
        conn.close()
        return jsonify({'error': 'No se puede agregar items a pedido pagado'}), 400

    cantidad = data.get('cantidad', 1)

    try:
        if combo_id:
            # ===== AGREGAR COMBO =====
            combo = obtener_combo(combo_id)
            if not combo:
                conn.close()
                return jsonify({'error': 'Combo no encontrado'}), 404

            precio_combo = combo['precio_combo']
            subtotal_combo = precio_combo * cantidad

            # 1. Crear item del combo (para facturación)
            cursor.execute('''
                INSERT INTO pedido_items
                (pedido_id, combo_id, cantidad, precio_unitario, subtotal, notas)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (id, combo_id, cantidad, precio_combo, subtotal_combo, 'Combo'))

            # 2. Obtener items del combo y crear items desglosados (para cocina)
            items_combo = obtener_items_combo(combo_id)
            for combo_item in items_combo:
                producto_id_item = combo_item[1]
                cantidad_producto = combo_item[2] * cantidad  # cantidad del combo x cantidad del producto en combo
                precio_producto = combo_item[4]
                subtotal_desglosado = precio_producto * cantidad_producto

                cursor.execute('''
                    INSERT INTO pedido_items
                    (pedido_id, producto_id, combo_id, cantidad, precio_unitario, subtotal, notas)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (id, producto_id_item, combo_id, cantidad_producto, precio_producto,
                      subtotal_desglosado, f'Desglose de combo'))

        else:
            # ===== AGREGAR PRODUCTO INDIVIDUAL =====
            cursor.execute('SELECT precio FROM productos WHERE id = ? AND disponible = 1', (producto_id,))
            producto = cursor.fetchone()

            if not producto:
                conn.close()
                return jsonify({'error': 'Producto no encontrado o no disponible'}), 404

            precio_unitario = producto['precio']
            subtotal_item = precio_unitario * cantidad

            # Crear item
            cursor.execute('''
                INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (id, producto_id, cantidad, precio_unitario, subtotal_item, data.get('notas', '')))

        # Recalcular totales del pedido (solo items sin desglose)
        recalcular_totales_pedido(id)

        # Obtener nuevos totales
        cursor.execute('SELECT subtotal, impuesto, total FROM pedidos WHERE id = ?', (id,))
        resultado = cursor.fetchone()
        nuevo_total = resultado['total'] if resultado else 0

        # ===== NOTIFICAR ITEM AGREGADO =====
        if socketio:
            try:
                item_type = 'combo' if combo_id else 'producto'
                cambios = {
                    "tipo_cambio": "item_agregado",
                    "item_type": item_type,
                    "item_id": combo_id if combo_id else producto_id,
                    "cantidad": cantidad,
                    "nuevo_total": nuevo_total
                }
                NotificadorPedidos.notificar_item_modificado(socketio, id, combo_id or producto_id, cambios)
            except Exception as e:
                print(f"Error notificando item agregado al pedido {id}: {e}")

        conn.close()

        item_type = 'combo' if combo_id else 'producto'
        return jsonify({
            'success': True,
            'item_type': item_type,
            'item_id': combo_id if combo_id else producto_id,
            'cantidad': cantidad,
            'total': nuevo_total
        }), 201

    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500


@pos_bp.route('/pedidos/<int:pedido_id>/items/<int:item_id>', methods=['DELETE'])
@role_required('mesero', 'cajero', 'manager')
def remover_item_pedido(pedido_id, item_id):
    """
    Remueve un item de un pedido (solo si no está pagado)

    Si el item es un combo, remueve:
    - El item del combo
    - Todos los items desglosados del combo
    """
    conn = get_db()
    cursor = conn.cursor()

    # Validar pedido
    cursor.execute('SELECT estado FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()
    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    if pedido['estado'] == 'pagado':
        conn.close()
        return jsonify({'error': 'No se puede remover items de pedido pagado'}), 400

    # Validar item
    cursor.execute('SELECT combo_id FROM pedido_items WHERE id = ? AND pedido_id = ?',
                  (item_id, pedido_id))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Item no encontrado en este pedido'}), 404

    combo_id = item['combo_id']

    try:
        if combo_id:
            # Si es combo, remover el item del combo Y todos sus desgloces
            cursor.execute('DELETE FROM pedido_items WHERE id = ? AND pedido_id = ?',
                          (item_id, pedido_id))
            # Remover desgloces del combo
            cursor.execute('''
                DELETE FROM pedido_items
                WHERE pedido_id = ? AND combo_id = ? AND notas = 'Desglose de combo'
            ''', (pedido_id, combo_id))
        else:
            # Remover item individual
            cursor.execute('DELETE FROM pedido_items WHERE id = ? AND pedido_id = ?',
                          (item_id, pedido_id))

        # Recalcular totales
        recalcular_totales_pedido(pedido_id)

        conn.commit()

        # ===== NOTIFICAR ITEM REMOVIDO =====
        if socketio:
            try:
                cambios = {
                    "tipo_cambio": "item_removido",
                    "item_id": item_id,
                    "combo_id": combo_id
                }
                NotificadorPedidos.notificar_item_modificado(socketio, pedido_id, item_id, cambios)
            except Exception as e:
                print(f"Error notificando item removido del pedido {pedido_id}: {e}")

        conn.close()

        return jsonify({
            'success': True,
            'mensaje': 'Item removido exitosamente'
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500


@pos_bp.route('/pedidos/<int:pedido_id>/items/<int:item_id>', methods=['PUT'])
@role_required('mesero', 'cajero', 'manager')
def modificar_item_pedido(pedido_id, item_id):
    """
    Modifica la cantidad de un item del pedido (solo si no está pagado)

    Request body: {"cantidad": 2}
    """
    data = request.get_json()
    nueva_cantidad = data.get('cantidad')

    if not nueva_cantidad or nueva_cantidad < 1:
        return jsonify({'error': 'cantidad debe ser >= 1'}), 400

    nueva_cantidad = int(nueva_cantidad)

    conn = get_db()
    cursor = conn.cursor()

    # Validar pedido
    cursor.execute('SELECT estado FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()
    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    if pedido['estado'] == 'pagado':
        conn.close()
        return jsonify({'error': 'No se puede modificar items de pedido pagado'}), 400

    # Validar item
    cursor.execute('''
        SELECT id, combo_id, cantidad, precio_unitario, subtotal
        FROM pedido_items WHERE id = ? AND pedido_id = ?
    ''', (item_id, pedido_id))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Item no encontrado en este pedido'}), 404

    combo_id = item['combo_id']

    try:
        if combo_id:
            # Si es un combo, actualizar el item del combo y todos sus desgloces
            precio_unitario = item['precio_unitario']
            cantidad_anterior = item['cantidad']
            ratio = nueva_cantidad / cantidad_anterior

            # Actualizar item del combo
            cursor.execute('''
                UPDATE pedido_items
                SET cantidad = ?, subtotal = ?
                WHERE id = ?
            ''', (nueva_cantidad, precio_unitario * nueva_cantidad, item_id))

            # Actualizar desgloces (multiplicar por el ratio)
            cursor.execute('''
                SELECT id, cantidad, precio_unitario
                FROM pedido_items
                WHERE pedido_id = ? AND combo_id = ? AND notas = 'Desglose de combo'
            ''', (pedido_id, combo_id))

            desgloces = cursor.fetchall()
            for desglose in desgloces:
                nueva_cant_desglose = desglose['cantidad'] * ratio
                cursor.execute('''
                    UPDATE pedido_items
                    SET cantidad = ?, subtotal = ?
                    WHERE id = ?
                ''', (nueva_cant_desglose,
                      desglose['precio_unitario'] * nueva_cant_desglose,
                      desglose['id']))
        else:
            # Item individual: solo actualizar cantidad y subtotal
            precio_unitario = item['precio_unitario']
            cursor.execute('''
                UPDATE pedido_items
                SET cantidad = ?, subtotal = ?
                WHERE id = ?
            ''', (nueva_cantidad, precio_unitario * nueva_cantidad, item_id))

        # Recalcular totales
        recalcular_totales_pedido(pedido_id)

        conn.commit()

        # ===== NOTIFICAR MODIFICACIÓN DE ITEM =====
        if socketio:
            try:
                cambios = {
                    "tipo_cambio": "cantidad_modificada",
                    "item_id": item_id,
                    "cantidad_anterior": item['cantidad'],
                    "cantidad_nueva": nueva_cantidad,
                    "combo_id": combo_id
                }
                NotificadorPedidos.notificar_item_modificado(socketio, pedido_id, item_id, cambios)
            except Exception as e:
                print(f"Error notificando modificación de item en pedido {pedido_id}: {e}")

        conn.close()

        return jsonify({
            'success': True,
            'mensaje': 'Item modificado exitosamente',
            'cantidad_anterior': item['cantidad'],
            'cantidad_nueva': nueva_cantidad
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# ============ ENDPOINTS ESPECÍFICOS POR ROL ============

@pos_bp.route('/cocina/pedidos', methods=['GET'])
@role_required('cocinero', 'manager')
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

    # Cargar todos los items en una sola query (evitar N+1)
    pedido_ids = [p['id'] for p in pedidos]
    items_por_pedido = _cargar_items_para_pedidos(cursor, pedido_ids)

    # Asignar items a cada pedido
    for pedido in pedidos:
        pedido['items'] = items_por_pedido.get(pedido['id'], [])

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/cajero/pedidos', methods=['GET'])
@role_required('cajero', 'manager')
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

    # Cargar todos los items en una sola query (evitar N+1)
    pedido_ids = [p['id'] for p in pedidos]
    items_por_pedido = _cargar_items_para_pedidos(cursor, pedido_ids)

    # Asignar items a cada pedido
    for pedido in pedidos:
        pedido['items'] = items_por_pedido.get(pedido['id'], [])

    conn.close()
    return jsonify(pedidos)

@pos_bp.route('/mesero/pedidos', methods=['GET'])
@pos_bp.route('/mesero/pedidos-listos', methods=['GET'])
@role_required('mesero', 'manager')
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

    # Cargar todos los items en una sola query (evitar N+1)
    pedido_ids = [p['id'] for p in pedidos]
    items_por_pedido = _cargar_items_para_pedidos(cursor, pedido_ids)

    # Asignar items a cada pedido
    for pedido in pedidos:
        pedido['items'] = items_por_pedido.get(pedido['id'], [])

    conn.close()
    return jsonify(pedidos)

# ============ ESTADÍSTICAS ============

@pos_bp.route('/estadisticas/hoy', methods=['GET'])
@role_required('manager', 'cajero')
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

# ============ ENDPOINTS DE REPORTES ============

@pos_bp.route('/reportes/hoy', methods=['GET'])
@role_required('manager', 'cajero')
def get_reportes_hoy():
    """
    Obtiene reporte completo del día actual.
    Si hay consolidación diaria, usa datos consolidados.
    Si no, calcula en vivo desde pedidos cerrados del día (para datos en tiempo real).
    """
    conn = get_db()
    cursor = conn.cursor()

    hoy = datetime.now().strftime('%Y-%m-%d')

    # Primero intentar obtener datos consolidados
    cursor.execute('''
        SELECT * FROM ventas_diarias WHERE fecha = ?
    ''', (hoy,))

    resumen = cursor.fetchone()

    if resumen:
        # Usar datos consolidados si existen
        resumen_dict = dict(resumen)

        # Obtener desglose por producto desde consolidados
        cursor.execute('''
            SELECT * FROM ventas_diarias_productos WHERE fecha_venta = ?
            ORDER BY cantidad_vendida DESC LIMIT 10
        ''', (hoy,))
        productos = [dict(row) for row in cursor.fetchall()]

        # Obtener desglose por categoría desde consolidados
        cursor.execute('''
            SELECT * FROM ventas_diarias_categorias WHERE fecha_venta = ?
            ORDER BY subtotal DESC
        ''', (hoy,))
        categorias = [dict(row) for row in cursor.fetchall()]
    else:
        # Calcular en vivo desde pedidos cerrados del día
        # Esto asegura que los cajeros vean los datos en tiempo real
        cursor.execute('''
            SELECT
                COUNT(*) as total_pedidos,
                COALESCE(SUM(total), 0) as total_ventas,
                COALESCE(SUM(subtotal), 0) as subtotal_total,
                COALESCE(SUM(impuesto), 0) as impuesto_total,
                COALESCE(SUM(propina), 0) as propinas_total,
                COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) as efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'credito' THEN total ELSE 0 END), 0) as credito
            FROM pedidos
            WHERE DATE(created_at) = ? AND estado = 'cerrado'
        ''', (hoy,))

        row = cursor.fetchone()
        total_pedidos = row[0] if row[0] else 0
        total_ventas = float(row[1]) if row[1] else 0.0
        subtotal_total = float(row[2]) if row[2] else 0.0
        impuesto_total = float(row[3]) if row[3] else 0.0
        propinas_total = float(row[4]) if row[4] else 0.0
        efectivo = float(row[5]) if row[5] else 0.0
        credito = float(row[6]) if row[6] else 0.0

        pedido_promedio = total_ventas / total_pedidos if total_pedidos > 0 else 0.0

        resumen_dict = {
            'fecha': hoy,
            'total_pedidos': total_pedidos,
            'total_ventas': total_ventas,
            'subtotal_total': subtotal_total,
            'impuesto_total': impuesto_total,
            'propinas_total': propinas_total,
            'efectivo': efectivo,
            'credito': credito,
            'cantidad_transacciones': total_pedidos,
            'pedido_promedio': pedido_promedio
        }

        # Obtener top 10 productos del día
        cursor.execute('''
            SELECT
                p.nombre as producto_nombre,
                COALESCE(c.nombre, 'Sin categoría') as categoria,
                SUM(pi.cantidad) as cantidad_vendida,
                SUM(pi.subtotal) as subtotal
            FROM pedido_items pi
            JOIN pedidos ped ON pi.pedido_id = ped.id
            JOIN productos p ON pi.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE DATE(ped.created_at) = ? AND ped.estado = 'cerrado'
            GROUP BY pi.producto_id, p.nombre, c.nombre
            ORDER BY cantidad_vendida DESC
            LIMIT 10
        ''', (hoy,))
        productos = [dict(zip(['producto_nombre', 'categoria', 'cantidad_vendida', 'subtotal'], row))
                    for row in cursor.fetchall()]

        # Obtener ventas por categoría del día
        cursor.execute('''
            SELECT
                COALESCE(c.nombre, 'Sin categoría') as categoria_nombre,
                SUM(pi.cantidad) as cantidad_vendida,
                SUM(pi.subtotal) as subtotal
            FROM pedido_items pi
            JOIN pedidos ped ON pi.pedido_id = ped.id
            JOIN productos p ON pi.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE DATE(ped.created_at) = ? AND ped.estado = 'cerrado'
            GROUP BY c.id, c.nombre
            ORDER BY subtotal DESC
        ''', (hoy,))
        categorias = [dict(zip(['categoria_nombre', 'cantidad_vendida', 'subtotal'], row))
                     for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        'resumen': resumen_dict,
        'productos': productos,
        'categorias': categorias
    })

@pos_bp.route('/reportes/periodo', methods=['GET'])
@role_required('manager')
def get_reportes_periodo():
    """
    Obtiene reporte para un período determinado
    Parámetros: inicio (YYYY-MM-DD), fin (YYYY-MM-DD)
    """
    inicio = request.args.get('inicio')
    fin = request.args.get('fin')

    if not inicio or not fin:
        return jsonify({'error': 'Se requieren parámetros inicio y fin'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Validar formato de fechas
        from datetime import datetime as dt
        dt.strptime(inicio, '%Y-%m-%d')
        dt.strptime(fin, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400

    # Obtener resumen agregado del período
    cursor.execute('''
        SELECT
            COUNT(*) as dias,
            SUM(total_pedidos) as total_pedidos,
            SUM(total_ventas) as total_ventas,
            SUM(subtotal_total) as subtotal_total,
            SUM(impuesto_total) as impuesto_total,
            SUM(efectivo) as efectivo,
            SUM(credito) as credito,
            AVG(pedido_promedio) as pedido_promedio_promedio
        FROM ventas_diarias
        WHERE fecha BETWEEN ? AND ?
    ''', (inicio, fin))

    resumen_periodo = dict(cursor.fetchone())

    # Obtener desglose diario
    cursor.execute('''
        SELECT * FROM ventas_diarias
        WHERE fecha BETWEEN ? AND ?
        ORDER BY fecha DESC
    ''', (inicio, fin))

    dias = [dict(row) for row in cursor.fetchall()]

    # Obtener top productos del período
    cursor.execute('''
        SELECT
            producto_id,
            producto_nombre,
            categoria_nombre,
            SUM(cantidad_vendida) as total_cantidad,
            SUM(subtotal) as total_subtotal
        FROM ventas_diarias_productos
        WHERE fecha_venta BETWEEN ? AND ?
        GROUP BY producto_id
        ORDER BY total_cantidad DESC
        LIMIT 10
    ''', (inicio, fin))

    top_productos = [dict(row) for row in cursor.fetchall()]

    # Obtener desglose por categoría del período
    cursor.execute('''
        SELECT
            categoria_id,
            categoria_nombre,
            SUM(cantidad_vendida) as total_cantidad,
            SUM(subtotal) as total_subtotal
        FROM ventas_diarias_categorias
        WHERE fecha_venta BETWEEN ? AND ?
        GROUP BY categoria_id
        ORDER BY total_subtotal DESC
    ''', (inicio, fin))

    categorias = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        'periodo': {
            'inicio': inicio,
            'fin': fin
        },
        'resumen': resumen_periodo,
        'dias': dias,
        'top_productos': top_productos,
        'categorias': categorias
    })

@pos_bp.route('/reportes/comparativa', methods=['GET'])
@role_required('manager')
def get_reportes_comparativa():
    """
    Compara dos fechas específicas
    Parámetros: fecha1 (YYYY-MM-DD), fecha2 (YYYY-MM-DD)
    """
    fecha1 = request.args.get('fecha1')
    fecha2 = request.args.get('fecha2')

    if not fecha1 or not fecha2:
        return jsonify({'error': 'Se requieren parámetros fecha1 y fecha2'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        from datetime import datetime as dt
        dt.strptime(fecha1, '%Y-%m-%d')
        dt.strptime(fecha2, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400

    # Obtener datos de ambas fechas
    cursor.execute('SELECT * FROM ventas_diarias WHERE fecha = ?', (fecha1,))
    data1 = dict(cursor.fetchone()) if cursor.fetchone() else None

    cursor.execute('SELECT * FROM ventas_diarias WHERE fecha = ?', (fecha2,))
    data2 = dict(cursor.fetchone()) if cursor.fetchone() else None

    conn.close()

    # Calcular variaciones
    comparativa = {
        'fecha1': fecha1,
        'fecha2': fecha2,
        'datos_fecha1': data1 if data1 else {},
        'datos_fecha2': data2 if data2 else {},
        'variacion': {}
    }

    if data1 and data2:
        for key in data1.keys():
            if key in ['total_pedidos', 'total_ventas', 'efectivo', 'credito', 'pedido_promedio']:
                val1 = float(data1[key]) if data1[key] else 0
                val2 = float(data2[key]) if data2[key] else 0
                if val1 > 0:
                    porcentaje = ((val2 - val1) / val1) * 100
                else:
                    porcentaje = 0 if val2 == 0 else 100
                comparativa['variacion'][key] = {
                    'fecha1': val1,
                    'fecha2': val2,
                    'diferencia': val2 - val1,
                    'porcentaje': round(porcentaje, 2)
                }

    return jsonify(comparativa)

@pos_bp.route('/reportes/consolidar', methods=['POST'])
@role_required('manager')
def consolidar_ventas_endpoint():
    """
    Ejecuta consolidación manual de ventas diarias.
    Requiere rol de manager.
    Parámetros opcionales: fecha (YYYY-MM-DD)
    """
    data = request.get_json() if request.is_json else {}
    fecha = data.get('fecha') if data else None

    resultado = consolidar_ventas_diarias(fecha)

    if resultado['success']:
        return jsonify(resultado), 200
    else:
        return jsonify(resultado), 400

# ============ ENDPOINTS DE FACTURACIÓN ============

@pos_bp.route('/pedidos/<int:id>/cliente', methods=['PUT'])
@role_required('cajero', 'manager')
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
@role_required('cajero', 'manager')
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

        # Guardar información del DTE (JSON y XML)
        cursor.execute('''
            UPDATE pedidos SET
                dte_tipo = ?,
                dte_codigo_generacion = ?,
                dte_numero_control = ?,
                dte_json = ?,
                dte_xml = ?,
                facturado_at = ?,
                updated_at = ?
            WHERE id = ?
        ''', (
            '01',  # Factura consumidor final
            resultado['codigo_generacion'],
            resultado['numero_control'],
            json.dumps(resultado['json']),  # Estructura JSON Digifact
            resultado['xml'],  # Estructura XML Digifact
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            id
        ))

        conn.commit()

        # ===== NOTIFICAR FACTURA GENERADA =====
        if socketio:
            try:
                cambios = {
                    "tipo_cambio": "factura_generada",
                    "tipo_comprobante": "dte",
                    "numero_control": resultado['numero_control'],
                    "codigo_generacion": resultado['codigo_generacion']
                }
                NotificadorPedidos.notificar_item_modificado(socketio, id, 0, cambios)
            except Exception as e:
                print(f"Error notificando factura generada del pedido {id}: {e}")

        conn.close()

        return jsonify({
            'success': True,
            'tipo': 'factura',
            'codigo_generacion': resultado['codigo_generacion'],
            'numero_control': resultado['numero_control'],
            'total': resultado['total'],
            'subtotal': resultado['subtotal'],
            'iva': resultado['iva'],
            'dte_json': resultado['json'],
            'dte_xml': resultado['xml']
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

        # ===== NOTIFICAR TICKET GENERADO =====
        if socketio:
            try:
                cambios = {
                    "tipo_cambio": "ticket_generado",
                    "tipo_comprobante": "ticket",
                    "numero": resultado['numero']
                }
                NotificadorPedidos.notificar_item_modificado(socketio, id, 0, cambios)
            except Exception as e:
                print(f"Error notificando ticket generado del pedido {id}: {e}")

        conn.close()

        return jsonify({
            'success': True,
            'tipo': 'ticket',
            'numero': resultado['numero'],
            'ticket': resultado
        })


@pos_bp.route('/pedidos/<int:id>/comprobante', methods=['GET'])
@role_required('cajero', 'manager')
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

    # ===== NOTIFICAR ENVÍO A DIGIFACT =====
    if socketio:
        try:
            cambios = {
                "tipo_cambio": "dte_enviando",
                "numero_control": pedido.get('dte_numero_control')
            }
            NotificadorPedidos.notificar_item_modificado(socketio, id, 0, cambios)
        except Exception as e:
            print(f"Error notificando envío de DTE del pedido {id}: {e}")

    # Obtener el endpoint de certificación del backend principal
    from flask import current_app
    try:
        # Llamar al endpoint interno de certificación
        response = requests.post(
            'http://localhost:5000/api/certificar-json',
            json={'dte': dte_json},
            timeout=30
        )

        resp_json = response.json()

        # ===== NOTIFICAR RESULTADO DE DIGIFACT =====
        if socketio and response.status_code == 200:
            try:
                cambios = {
                    "tipo_cambio": "dte_certificado",
                    "dte_numero": resp_json.get('dte_numero'),
                    "estado_envio": "exitoso"
                }
                NotificadorPedidos.notificar_item_modificado(socketio, id, 0, cambios)
            except Exception as e:
                print(f"Error notificando certificación de DTE del pedido {id}: {e}")

        return jsonify(resp_json), response.status_code
    except Exception as e:
        # ===== NOTIFICAR ERROR EN ENVÍO =====
        if socketio:
            try:
                cambios = {
                    "tipo_cambio": "dte_error",
                    "error": str(e)
                }
                NotificadorPedidos.notificar_item_modificado(socketio, id, 0, cambios)
            except Exception as err:
                print(f"Error notificando error de DTE del pedido {id}: {err}")

        return jsonify({'error': f'Error al enviar DTE: {str(e)}'}), 500


@pos_bp.route('/admin/dtes', methods=['GET'])
@role_required('manager')
def listar_dtes_admin():
    """
    Lista todos los DTEs para administración
    Incluye: pendientes de envío, enviados, y con errores
    """
    conn = get_db()
    cursor = conn.cursor()

    # Obtener parámetros de filtro
    estado = request.args.get('estado', 'todos')  # todos, pendientes, enviados, errores
    fecha_desde = request.args.get('fecha_desde')
    fecha_hasta = request.args.get('fecha_hasta')

    # Query base: pedidos con DTE generado (dte_tipo no nulo)
    query = '''
        SELECT id, cliente_nombre, total, dte_tipo, dte_codigo_generacion,
               dte_numero_control, facturado_at, created_at, estado,
               tipo_comprobante
        FROM pedidos
        WHERE dte_tipo IS NOT NULL
    '''
    params = []

    # Filtrar por estado de envío
    if estado == 'pendientes':
        # DTEs tipo 01 (factura) que no han sido certificados (sin código generación real de Digifact)
        query += " AND dte_tipo = '01'"
    elif estado == 'tickets':
        # Tickets (tipo 99 o similar)
        query += " AND dte_tipo != '01'"

    # Filtrar por fechas
    if fecha_desde:
        query += " AND DATE(created_at) >= ?"
        params.append(fecha_desde)
    if fecha_hasta:
        query += " AND DATE(created_at) <= ?"
        params.append(fecha_hasta)

    query += " ORDER BY created_at DESC LIMIT 100"

    cursor.execute(query, params)
    dtes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({
        'dtes': dtes,
        'total': len(dtes)
    })


@pos_bp.route('/admin/dtes/<int:pedido_id>/reenviar', methods=['POST'])
@role_required('manager')
def reenviar_dte_digifact(pedido_id):
    """
    Reenvía un DTE a Digifact para certificación
    Solo para DTEs tipo 01 (facturas electrónicas)
    """
    import requests

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM pedidos WHERE id = ?', (pedido_id,))
    pedido = cursor.fetchone()

    if not pedido:
        conn.close()
        return jsonify({'error': 'Pedido no encontrado'}), 404

    pedido = dict(pedido)

    if pedido.get('dte_tipo') != '01':
        conn.close()
        return jsonify({'error': 'Solo se pueden enviar facturas electrónicas (tipo 01)'}), 400

    if not pedido.get('dte_json'):
        conn.close()
        return jsonify({'error': 'Este pedido no tiene DTE generado'}), 400

    conn.close()

    try:
        dte_json = json.loads(pedido['dte_json'])

        # Llamar al endpoint de certificación de Digifact
        digifact_url = os.environ.get('DIGIFACT_URL', 'https://felgttestaws.digifact.com.sv')
        digifact_user = os.environ.get('DIGIFACT_USER', '')
        digifact_pass = os.environ.get('DIGIFACT_PASS', '')

        if not digifact_user or not digifact_pass:
            return jsonify({
                'error': 'Credenciales de Digifact no configuradas',
                'detalle': 'Configure DIGIFACT_USER y DIGIFACT_PASS en las variables de entorno'
            }), 500

        # Realizar la llamada a Digifact
        response = requests.post(
            f'{digifact_url}/api/certificar',
            json={'dte': dte_json},
            auth=(digifact_user, digifact_pass),
            timeout=30
        )

        if response.status_code == 200:
            resp_data = response.json()

            # Actualizar el pedido con la respuesta de Digifact
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE pedidos
                SET dte_codigo_generacion = ?,
                    updated_at = ?
                WHERE id = ?
            ''', (
                resp_data.get('codigo_generacion', resp_data.get('dte_numero')),
                datetime.now().isoformat(),
                pedido_id
            ))
            conn.commit()
            conn.close()

            return jsonify({
                'success': True,
                'mensaje': 'DTE enviado exitosamente a Digifact',
                'digifact_response': resp_data
            })
        else:
            return jsonify({
                'error': 'Error en respuesta de Digifact',
                'status_code': response.status_code,
                'detalle': response.text[:500]
            }), 500

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Timeout al conectar con Digifact'}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'No se pudo conectar con Digifact'}), 503
    except Exception as e:
        return jsonify({'error': f'Error al enviar DTE: {str(e)}'}), 500


@pos_bp.route('/admin/dtes/estadisticas', methods=['GET'])
@role_required('manager')
def estadisticas_dtes():
    """
    Obtiene estadísticas de DTEs para el dashboard
    """
    conn = get_db()
    cursor = conn.cursor()

    # Total de facturas electrónicas (tipo 01)
    cursor.execute("SELECT COUNT(*) FROM pedidos WHERE dte_tipo = '01'")
    total_facturas = cursor.fetchone()[0]

    # Total de tickets (tipo != 01)
    cursor.execute("SELECT COUNT(*) FROM pedidos WHERE dte_tipo IS NOT NULL AND dte_tipo != '01'")
    total_tickets = cursor.fetchone()[0]

    # Facturas del día
    cursor.execute("""
        SELECT COUNT(*) FROM pedidos
        WHERE dte_tipo = '01' AND DATE(created_at) = DATE('now', 'localtime')
    """)
    facturas_hoy = cursor.fetchone()[0]

    # Total facturado hoy
    cursor.execute("""
        SELECT COALESCE(SUM(total), 0) FROM pedidos
        WHERE dte_tipo IS NOT NULL AND DATE(created_at) = DATE('now', 'localtime')
    """)
    total_hoy = cursor.fetchone()[0]

    conn.close()

    return jsonify({
        'total_facturas': total_facturas,
        'total_tickets': total_tickets,
        'facturas_hoy': facturas_hoy,
        'total_hoy': round(total_hoy, 2)
    })
