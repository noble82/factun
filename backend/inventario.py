"""
Módulo de Inventario de Materia Prima y Proveedores para POS
Gestión de ingredientes, recetas y órdenes de compra
"""

import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from auth import role_required
from database import get_db

inventario_bp = Blueprint('inventario', __name__)


def init_inventario_db():
    """Inicializa las tablas de inventario de materia prima"""
    conn = get_db()
    cursor = conn.cursor()

    # Verificar y agregar columna categoria si no existe
    try:
        cursor.execute("SELECT categoria FROM materia_prima LIMIT 1")
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE materia_prima ADD COLUMN categoria TEXT DEFAULT 'General'")
            conn.commit()
        except:
            pass

    # Tabla de proveedores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS proveedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT NOT NULL,
            nombre_comercial TEXT,
            nit TEXT,
            nrc TEXT,
            direccion TEXT,
            telefono TEXT,
            correo TEXT,
            contacto_nombre TEXT,
            contacto_telefono TEXT,
            condiciones_pago TEXT DEFAULT 'contado',
            dias_credito INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            notas TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabla de materia prima / ingredientes y productos de consumo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS materia_prima (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            categoria TEXT DEFAULT 'General',
            tipo TEXT DEFAULT 'ingrediente',
            unidad_medida TEXT DEFAULT 'unidad',
            stock_actual REAL DEFAULT 0,
            stock_minimo REAL DEFAULT 10,
            stock_maximo REAL DEFAULT 500,
            costo_promedio REAL DEFAULT 0,
            ultimo_costo REAL DEFAULT 0,
            proveedor_principal_id INTEGER,
            activo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proveedor_principal_id) REFERENCES proveedores(id)
        )
    ''')

    # Agregar columna tipo si no existe
    try:
        cursor.execute("SELECT tipo FROM materia_prima LIMIT 1")
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE materia_prima ADD COLUMN tipo TEXT DEFAULT 'ingrediente'")
            conn.commit()
        except:
            pass

    # Tabla de recetas (qué materia prima necesita cada producto)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS recetas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER NOT NULL,
            materia_prima_id INTEGER NOT NULL,
            cantidad REAL NOT NULL,
            unidad TEXT,
            notas TEXT,
            FOREIGN KEY (producto_id) REFERENCES productos(id),
            FOREIGN KEY (materia_prima_id) REFERENCES materia_prima(id),
            UNIQUE(producto_id, materia_prima_id)
        )
    ''')

    # Tabla de movimientos de inventario
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS movimientos_inventario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            materia_prima_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            cantidad REAL NOT NULL,
            stock_anterior REAL,
            stock_nuevo REAL,
            costo_unitario REAL,
            referencia_tipo TEXT,
            referencia_id INTEGER,
            motivo TEXT,
            usuario TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (materia_prima_id) REFERENCES materia_prima(id)
        )
    ''')

    # Tabla de órdenes de compra
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ordenes_compra (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE,
            proveedor_id INTEGER NOT NULL,
            estado TEXT DEFAULT 'borrador',
            fecha_orden DATE,
            fecha_esperada DATE,
            fecha_recepcion DATE,
            subtotal REAL DEFAULT 0,
            impuesto REAL DEFAULT 0,
            total REAL DEFAULT 0,
            notas TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
        )
    ''')

    # Tabla de items de órdenes de compra
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orden_compra_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orden_id INTEGER NOT NULL,
            materia_prima_id INTEGER NOT NULL,
            cantidad_ordenada REAL NOT NULL,
            cantidad_recibida REAL DEFAULT 0,
            costo_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            notas TEXT,
            FOREIGN KEY (orden_id) REFERENCES ordenes_compra(id),
            FOREIGN KEY (materia_prima_id) REFERENCES materia_prima(id)
        )
    ''')

    # Tabla de relación materia prima - proveedor
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS materia_proveedor (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            materia_prima_id INTEGER NOT NULL,
            proveedor_id INTEGER NOT NULL,
            codigo_proveedor TEXT,
            costo REAL,
            es_principal INTEGER DEFAULT 0,
            tiempo_entrega_dias INTEGER,
            notas TEXT,
            FOREIGN KEY (materia_prima_id) REFERENCES materia_prima(id),
            FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
            UNIQUE(materia_prima_id, proveedor_id)
        )
    ''')

    # Tabla de extracciones de materia prima (control manual de libras/kg extraídas por jornada)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS extracciones_materia_prima (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha DATE NOT NULL,
            hora TIME,
            materia_prima_id INTEGER NOT NULL,
            cantidad_extraida REAL NOT NULL,
            unidad_medida TEXT,
            motivo TEXT,
            descripcion TEXT,
            usuario TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (materia_prima_id) REFERENCES materia_prima(id)
        )
    ''')

    # ============ ÍNDICES PARA OPTIMIZAR CONSULTAS ============
    # Índices en proveedores
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_proveedores_codigo ON proveedores(codigo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_proveedores_activo ON proveedores(activo)')

    # Índices en materia_prima
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_prima_codigo ON materia_prima(codigo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_prima_nombre ON materia_prima(nombre)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_prima_categoria ON materia_prima(categoria)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_prima_activo ON materia_prima(activo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_prima_proveedor ON materia_prima(proveedor_principal_id)')

    # Índices en recetas
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_recetas_producto_id ON recetas(producto_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_recetas_materia_prima_id ON recetas(materia_prima_id)')

    # Índices en movimientos_inventario
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_materia_prima_id ON movimientos_inventario(materia_prima_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tipo ON movimientos_inventario(tipo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_created_at ON movimientos_inventario(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_referencia ON movimientos_inventario(referencia_tipo, referencia_id)')

    # Índices en ordenes_compra
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ordenes_compra_numero ON ordenes_compra(numero)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor_id ON ordenes_compra(proveedor_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON ordenes_compra(estado)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha_orden ON ordenes_compra(fecha_orden)')

    # Índices en orden_compra_items
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_orden_compra_items_orden_id ON orden_compra_items(orden_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_orden_compra_items_materia_prima_id ON orden_compra_items(materia_prima_id)')

    # Índices en materia_proveedor
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_proveedor_materia_prima_id ON materia_proveedor(materia_prima_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_materia_proveedor_proveedor_id ON materia_proveedor(proveedor_id)')

    # Índices en extracciones_materia_prima
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_extracciones_materia_prima_fecha ON extracciones_materia_prima(fecha)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_extracciones_materia_prima_materia_prima_id ON extracciones_materia_prima(materia_prima_id)')

    conn.commit()
    conn.close()


def insertar_datos_iniciales_inventario():
    """Inserta materia prima inicial y recetas para la pupusería"""
    conn = get_db()
    cursor = conn.cursor()

    # Verificar si ya hay materia prima
    cursor.execute('SELECT COUNT(*) FROM materia_prima')
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # Materia prima típica de una pupusería (ingredientes)
    # (codigo, nombre, descripcion, categoria, tipo, unidad, stock_inicial, stock_min)
    materias = [
        # Ingredientes para preparación
        ('MP001', 'Masa de Maíz', 'Masa preparada para pupusas', 'Masas', 'ingrediente', 'lb', 50, 20),
        ('MP002', 'Masa de Arroz', 'Masa de arroz para pupusas', 'Masas', 'ingrediente', 'lb', 20, 10),
        ('MP003', 'Queso', 'Queso para pupusas', 'Lácteos', 'ingrediente', 'lb', 30, 15),
        ('MP004', 'Quesillo', 'Quesillo salvadoreño', 'Lácteos', 'ingrediente', 'lb', 20, 10),
        ('MP005', 'Loroco', 'Loroco fresco', 'Verduras', 'ingrediente', 'lb', 5, 2),
        ('MP006', 'Frijol Molido', 'Frijoles volteados', 'Granos', 'ingrediente', 'lb', 25, 10),
        ('MP007', 'Chicharrón', 'Chicharrón molido', 'Carnes', 'ingrediente', 'lb', 15, 8),
        ('MP008', 'Mora', 'Hierba mora', 'Verduras', 'ingrediente', 'lb', 3, 1),
        ('MP009', 'Ayote', 'Ayote en dulce', 'Verduras', 'ingrediente', 'lb', 10, 5),
        ('MP010', 'Repollo', 'Repollo para curtido', 'Verduras', 'ingrediente', 'lb', 20, 10),
        ('MP011', 'Zanahoria', 'Zanahoria para curtido', 'Verduras', 'ingrediente', 'lb', 10, 5),
        ('MP012', 'Vinagre', 'Vinagre para curtido', 'Condimentos', 'ingrediente', 'lt', 5, 2),
        ('MP013', 'Chile', 'Chile para salsa', 'Condimentos', 'ingrediente', 'lb', 5, 2),
        ('MP014', 'Tomate', 'Tomate para salsa', 'Verduras', 'ingrediente', 'lb', 15, 8),
        ('MP015', 'Morro', 'Semilla de morro', 'Bebidas Preparadas', 'ingrediente', 'lb', 5, 2),
        ('MP016', 'Arroz', 'Arroz para horchata', 'Granos', 'ingrediente', 'lb', 10, 5),
        ('MP017', 'Canela', 'Canela en raja', 'Condimentos', 'ingrediente', 'lb', 1, 0.5),
        ('MP018', 'Azúcar', 'Azúcar blanca', 'Condimentos', 'ingrediente', 'lb', 25, 10),
        ('MP019', 'Tamarindo', 'Tamarindo para fresco', 'Bebidas Preparadas', 'ingrediente', 'lb', 5, 2),
        ('MP020', 'Café', 'Café molido', 'Bebidas Preparadas', 'ingrediente', 'lb', 5, 2),
        ('MP021', 'Plátano', 'Plátano maduro', 'Frutas', 'ingrediente', 'unidad', 30, 15),
        ('MP022', 'Crema', 'Crema salvadoreña', 'Lácteos', 'ingrediente', 'lb', 10, 5),
        ('MP023', 'Miel', 'Miel de panela', 'Dulces', 'ingrediente', 'lt', 3, 1),
        ('MP024', 'Harina', 'Harina para nuégados', 'Granos', 'ingrediente', 'lb', 10, 5),
        # Productos de consumo directo (bebidas embotelladas, etc.)
        ('PC001', 'Agua Botella 500ml', 'Agua purificada', 'Bebidas Embotelladas', 'producto', 'unidad', 48, 12),
        ('PC002', 'Agua Botella 1L', 'Agua purificada grande', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
        ('PC003', 'Coca-Cola 350ml', 'Gaseosa Coca-Cola', 'Bebidas Embotelladas', 'producto', 'unidad', 48, 12),
        ('PC004', 'Coca-Cola 500ml', 'Gaseosa Coca-Cola mediana', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
        ('PC005', 'Pepsi 350ml', 'Gaseosa Pepsi', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
        ('PC006', 'Sprite 350ml', 'Gaseosa Sprite', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
        ('PC007', 'Fanta 350ml', 'Gaseosa Fanta Naranja', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
        ('PC008', 'Cerveza Pilsener', 'Cerveza nacional', 'Cervezas', 'producto', 'unidad', 48, 12),
        ('PC009', 'Cerveza Suprema', 'Cerveza nacional premium', 'Cervezas', 'producto', 'unidad', 24, 6),
        ('PC010', 'Cerveza Golden', 'Cerveza nacional', 'Cervezas', 'producto', 'unidad', 24, 6),
        ('PC011', 'Cerveza Corona', 'Cerveza importada', 'Cervezas', 'producto', 'unidad', 12, 6),
        ('PC012', 'Jugo del Valle 500ml', 'Jugo de frutas', 'Bebidas Embotelladas', 'producto', 'unidad', 24, 6),
    ]

    for mat in materias:
        cursor.execute('''
            INSERT INTO materia_prima (codigo, nombre, descripcion, categoria, tipo, unidad_medida, stock_actual, stock_minimo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', mat)

    conn.commit()

    # Recetas (cantidad de materia prima por unidad de producto)
    # producto_id corresponde a los IDs de la tabla productos
    recetas = [
        # Pupusa de Queso (producto_id=1): 0.15 lb masa, 0.08 lb queso
        (1, 1, 0.15, 'lb'),  # Masa de maíz
        (1, 3, 0.08, 'lb'),  # Queso

        # Pupusa de Frijol (producto_id=2): 0.15 lb masa, 0.06 lb frijol
        (2, 1, 0.15, 'lb'),
        (2, 6, 0.06, 'lb'),

        # Pupusa de Chicharrón (producto_id=3): 0.15 lb masa, 0.06 lb chicharrón
        (3, 1, 0.15, 'lb'),
        (3, 7, 0.06, 'lb'),

        # Pupusa Revuelta (producto_id=4): masa, queso, frijol, chicharrón
        (4, 1, 0.15, 'lb'),
        (4, 3, 0.04, 'lb'),
        (4, 6, 0.03, 'lb'),
        (4, 7, 0.03, 'lb'),

        # Pupusa de Loroco (producto_id=5): masa, queso, loroco
        (5, 1, 0.15, 'lb'),
        (5, 3, 0.06, 'lb'),
        (5, 5, 0.02, 'lb'),

        # Pupusa de Mora (producto_id=6): masa, queso, mora
        (6, 1, 0.15, 'lb'),
        (6, 3, 0.06, 'lb'),
        (6, 8, 0.02, 'lb'),

        # Pupusa de Ayote (producto_id=7): masa, ayote
        (7, 1, 0.15, 'lb'),
        (7, 9, 0.08, 'lb'),

        # Pupusa de Arroz Revuelta (producto_id=8): masa arroz, queso, frijol, chicharrón
        (8, 2, 0.15, 'lb'),
        (8, 3, 0.04, 'lb'),
        (8, 6, 0.03, 'lb'),
        (8, 7, 0.03, 'lb'),

        # Horchata (producto_id=9): morro, arroz, canela, azúcar
        (9, 15, 0.02, 'lb'),
        (9, 16, 0.02, 'lb'),
        (9, 17, 0.005, 'lb'),
        (9, 18, 0.05, 'lb'),

        # Tamarindo (producto_id=10): tamarindo, azúcar
        (10, 19, 0.03, 'lb'),
        (10, 18, 0.05, 'lb'),

        # Café (producto_id=11): café, azúcar
        (11, 20, 0.02, 'lb'),
        (11, 18, 0.02, 'lb'),

        # Nuégados (producto_id=16): harina, miel
        (16, 24, 0.1, 'lb'),
        (16, 23, 0.05, 'lt'),

        # Plátano frito (producto_id=17): plátano, crema
        (17, 21, 1, 'unidad'),
        (17, 22, 0.05, 'lb'),
    ]

    for receta in recetas:
        try:
            cursor.execute('''
                INSERT INTO recetas (producto_id, materia_prima_id, cantidad, unidad)
                VALUES (?, ?, ?, ?)
            ''', receta)
        except:
            pass  # Ignorar si el producto no existe aún

    conn.commit()
    conn.close()


# Inicializar BD al importar
init_inventario_db()


def inicializar_inventario_productos():
    """Inicializa datos de inventario después de que los productos existan"""
    insertar_datos_iniciales_inventario()


# ============ ENDPOINTS DE PROVEEDORES ============

@inventario_bp.route('/proveedores', methods=['GET'])
def get_proveedores():
    """Obtiene todos los proveedores"""
    activos = request.args.get('activos', 'true').lower() == 'true'

    conn = get_db()
    cursor = conn.cursor()

    if activos:
        cursor.execute('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre')
    else:
        cursor.execute('SELECT * FROM proveedores ORDER BY nombre')

    proveedores = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(proveedores)


@inventario_bp.route('/proveedores/<int:id>', methods=['GET'])
def get_proveedor(id):
    """Obtiene un proveedor por ID"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM proveedores WHERE id = ?', (id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    proveedor = dict(row)

    # Obtener materia prima asociada
    cursor.execute('''
        SELECT mp.*, m.nombre as materia_nombre
        FROM materia_proveedor mp
        JOIN materia_prima m ON mp.materia_prima_id = m.id
        WHERE mp.proveedor_id = ?
    ''', (id,))
    proveedor['materias'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(proveedor)


@inventario_bp.route('/proveedores', methods=['POST'])
def crear_proveedor():
    """Crea un nuevo proveedor"""
    data = request.get_json()

    if not data.get('nombre'):
        return jsonify({'error': 'El nombre es requerido'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Generar código único
    cursor.execute('SELECT COUNT(*) FROM proveedores')
    count = cursor.fetchone()[0]
    codigo = f"PROV-{str(count + 1).zfill(4)}"

    try:
        cursor.execute('''
            INSERT INTO proveedores (
                codigo, nombre, nombre_comercial, nit, nrc, direccion,
                telefono, correo, contacto_nombre, contacto_telefono,
                condiciones_pago, dias_credito, notas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            codigo,
            data.get('nombre'),
            data.get('nombre_comercial'),
            data.get('nit'),
            data.get('nrc'),
            data.get('direccion'),
            data.get('telefono'),
            data.get('correo'),
            data.get('contacto_nombre'),
            data.get('contacto_telefono'),
            data.get('condiciones_pago', 'contado'),
            data.get('dias_credito', 0),
            data.get('notas')
        ))

        proveedor_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'proveedor_id': proveedor_id,
            'codigo': codigo
        })
    except sqlite3.IntegrityError as e:
        conn.close()
        return jsonify({'error': str(e)}), 400


@inventario_bp.route('/proveedores/<int:id>', methods=['PUT'])
def actualizar_proveedor(id):
    """Actualiza un proveedor"""
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM proveedores WHERE id = ?', (id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    cursor.execute('''
        UPDATE proveedores SET
            nombre = COALESCE(?, nombre),
            nombre_comercial = ?,
            nit = ?,
            nrc = ?,
            direccion = ?,
            telefono = ?,
            correo = ?,
            contacto_nombre = ?,
            contacto_telefono = ?,
            condiciones_pago = COALESCE(?, condiciones_pago),
            dias_credito = COALESCE(?, dias_credito),
            activo = COALESCE(?, activo),
            notas = ?,
            updated_at = ?
        WHERE id = ?
    ''', (
        data.get('nombre'),
        data.get('nombre_comercial'),
        data.get('nit'),
        data.get('nrc'),
        data.get('direccion'),
        data.get('telefono'),
        data.get('correo'),
        data.get('contacto_nombre'),
        data.get('contacto_telefono'),
        data.get('condiciones_pago'),
        data.get('dias_credito'),
        data.get('activo'),
        data.get('notas'),
        datetime.now().isoformat(),
        id
    ))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


@inventario_bp.route('/proveedores/<int:id>', methods=['DELETE'])
def eliminar_proveedor(id):
    """Desactiva un proveedor (soft delete)"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        'UPDATE proveedores SET activo = 0, updated_at = ? WHERE id = ?',
        (datetime.now().isoformat(), id)
    )

    conn.commit()
    conn.close()

    return jsonify({'success': True})


# ============ ENDPOINTS DE MATERIA PRIMA ============

@inventario_bp.route('/materia-prima', methods=['GET'])
def get_materia_prima():
    """Obtiene toda la materia prima"""
    bajo_stock = request.args.get('bajo_stock', 'false').lower() == 'true'

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT mp.*, p.nombre as proveedor_nombre
        FROM materia_prima mp
        LEFT JOIN proveedores p ON mp.proveedor_principal_id = p.id
        WHERE mp.activo = 1
    '''

    if bajo_stock:
        query += ' AND mp.stock_actual <= mp.stock_minimo'

    query += ' ORDER BY mp.nombre'

    cursor.execute(query)
    materias = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(materias)


@inventario_bp.route('/materia-prima/<int:id>', methods=['GET'])
def get_materia_prima_detalle(id):
    """Obtiene detalle de una materia prima"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT mp.*, p.nombre as proveedor_nombre
        FROM materia_prima mp
        LEFT JOIN proveedores p ON mp.proveedor_principal_id = p.id
        WHERE mp.id = ?
    ''', (id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Materia prima no encontrada'}), 404

    materia = dict(row)

    # Obtener últimos movimientos
    cursor.execute('''
        SELECT * FROM movimientos_inventario
        WHERE materia_prima_id = ?
        ORDER BY created_at DESC
        LIMIT 20
    ''', (id,))
    materia['movimientos'] = [dict(row) for row in cursor.fetchall()]

    # Obtener productos que usan esta materia
    cursor.execute('''
        SELECT r.*, p.nombre as producto_nombre
        FROM recetas r
        JOIN productos p ON r.producto_id = p.id
        WHERE r.materia_prima_id = ?
    ''', (id,))
    materia['productos'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(materia)


@inventario_bp.route('/materia-prima', methods=['POST'])
def crear_materia_prima():
    """Crea nueva materia prima"""
    data = request.get_json()

    if not data.get('nombre'):
        return jsonify({'error': 'El nombre es requerido'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Generar código
    cursor.execute('SELECT COUNT(*) FROM materia_prima')
    count = cursor.fetchone()[0]
    codigo = data.get('codigo') or f"MP{str(count + 1).zfill(3)}"

    try:
        cursor.execute('''
            INSERT INTO materia_prima (
                codigo, nombre, descripcion, unidad_medida,
                stock_actual, stock_minimo, stock_maximo,
                proveedor_principal_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            codigo,
            data.get('nombre'),
            data.get('descripcion'),
            data.get('unidad_medida', 'unidad'),
            data.get('stock_actual', 0),
            data.get('stock_minimo', 10),
            data.get('stock_maximo', 500),
            data.get('proveedor_id')
        ))

        materia_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'materia_prima_id': materia_id,
            'codigo': codigo
        })
    except sqlite3.IntegrityError as e:
        conn.close()
        return jsonify({'error': f'Código duplicado: {str(e)}'}), 400


@inventario_bp.route('/materia-prima/<int:id>', methods=['PUT'])
def actualizar_materia_prima(id):
    """Actualiza materia prima"""
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE materia_prima SET
            nombre = COALESCE(?, nombre),
            descripcion = ?,
            unidad_medida = COALESCE(?, unidad_medida),
            stock_minimo = COALESCE(?, stock_minimo),
            stock_maximo = COALESCE(?, stock_maximo),
            proveedor_principal_id = ?,
            activo = COALESCE(?, activo),
            updated_at = ?
        WHERE id = ?
    ''', (
        data.get('nombre'),
        data.get('descripcion'),
        data.get('unidad_medida'),
        data.get('stock_minimo'),
        data.get('stock_maximo'),
        data.get('proveedor_id'),
        data.get('activo'),
        datetime.now().isoformat(),
        id
    ))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


@inventario_bp.route('/materia-prima/<int:id>/ajuste', methods=['POST'])
def ajustar_materia_prima(id):
    """Realiza un ajuste de inventario de materia prima"""
    data = request.get_json()

    tipo = data.get('tipo')  # 'entrada', 'salida', 'ajuste'
    cantidad = float(data.get('cantidad', 0))
    motivo = data.get('motivo', '')
    costo_unitario = data.get('costo_unitario')

    if tipo not in ['entrada', 'salida', 'ajuste']:
        return jsonify({'error': 'Tipo de movimiento inválido'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Obtener stock actual
    cursor.execute('SELECT stock_actual, costo_promedio, nombre FROM materia_prima WHERE id = ?', (id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Materia prima no encontrada'}), 404

    stock_anterior = row['stock_actual']
    costo_anterior = row['costo_promedio'] or 0

    # Calcular nuevo stock
    if tipo == 'entrada':
        stock_nuevo = stock_anterior + cantidad
        if costo_unitario and costo_unitario > 0:
            costo_total_anterior = stock_anterior * costo_anterior
            costo_total_nuevo = cantidad * costo_unitario
            nuevo_costo_promedio = (costo_total_anterior + costo_total_nuevo) / stock_nuevo if stock_nuevo > 0 else costo_unitario
        else:
            nuevo_costo_promedio = costo_anterior
    elif tipo == 'salida':
        stock_nuevo = stock_anterior - cantidad
        if stock_nuevo < 0:
            conn.close()
            return jsonify({'error': f'Stock insuficiente de {row["nombre"]}. Disponible: {stock_anterior}'}), 400
        nuevo_costo_promedio = costo_anterior
    else:  # ajuste
        stock_nuevo = cantidad
        nuevo_costo_promedio = costo_anterior

    # Actualizar inventario
    cursor.execute('''
        UPDATE materia_prima SET
            stock_actual = ?,
            costo_promedio = ?,
            ultimo_costo = COALESCE(?, ultimo_costo),
            updated_at = ?
        WHERE id = ?
    ''', (stock_nuevo, nuevo_costo_promedio, costo_unitario, datetime.now().isoformat(), id))

    # Registrar movimiento
    cursor.execute('''
        INSERT INTO movimientos_inventario (
            materia_prima_id, tipo, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, motivo, usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        id, tipo, cantidad, stock_anterior, stock_nuevo,
        costo_unitario, motivo, data.get('usuario', 'Sistema')
    ))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'stock_anterior': stock_anterior,
        'stock_nuevo': stock_nuevo,
        'costo_promedio': nuevo_costo_promedio
    })


# ============ ENDPOINTS DE RECETAS ============

@inventario_bp.route('/recetas', methods=['GET'])
def get_recetas():
    """Obtiene todas las recetas"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, p.nombre as producto_nombre, mp.nombre as materia_nombre,
               mp.unidad_medida, mp.stock_actual
        FROM recetas r
        JOIN productos p ON r.producto_id = p.id
        JOIN materia_prima mp ON r.materia_prima_id = mp.id
        ORDER BY p.nombre, mp.nombre
    ''')

    recetas = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(recetas)


@inventario_bp.route('/recetas/producto/<int:producto_id>', methods=['GET'])
def get_receta_producto(producto_id):
    """Obtiene la receta de un producto"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, mp.nombre as materia_nombre, mp.unidad_medida,
               mp.stock_actual, mp.costo_promedio
        FROM recetas r
        JOIN materia_prima mp ON r.materia_prima_id = mp.id
        WHERE r.producto_id = ?
    ''', (producto_id,))

    ingredientes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(ingredientes)


@inventario_bp.route('/recetas', methods=['POST'])
def agregar_ingrediente_receta():
    """Agrega un ingrediente a la receta de un producto"""
    data = request.get_json()

    producto_id = data.get('producto_id')
    materia_prima_id = data.get('materia_prima_id')
    cantidad = data.get('cantidad')

    if not all([producto_id, materia_prima_id, cantidad]):
        return jsonify({'error': 'Producto, materia prima y cantidad son requeridos'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT INTO recetas (producto_id, materia_prima_id, cantidad, unidad)
            VALUES (?, ?, ?, ?)
        ''', (producto_id, materia_prima_id, cantidad, data.get('unidad')))

        conn.commit()
        conn.close()

        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        # Ya existe, actualizar
        cursor.execute('''
            UPDATE recetas SET cantidad = ?, unidad = ?
            WHERE producto_id = ? AND materia_prima_id = ?
        ''', (cantidad, data.get('unidad'), producto_id, materia_prima_id))

        conn.commit()
        conn.close()

        return jsonify({'success': True, 'updated': True})


@inventario_bp.route('/recetas/<int:id>', methods=['DELETE'])
def eliminar_ingrediente_receta(id):
    """Elimina un ingrediente de una receta"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('DELETE FROM recetas WHERE id = ?', (id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


# ============ ALERTAS Y ESTADÍSTICAS ============

@inventario_bp.route('/alertas', methods=['GET'])
def get_alertas_stock():
    """Obtiene materia prima con stock bajo o agotado"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT mp.*,
               CASE
                   WHEN mp.stock_actual <= 0 THEN 'agotado'
                   WHEN mp.stock_actual <= mp.stock_minimo THEN 'bajo'
                   ELSE 'normal'
               END as estado_stock
        FROM materia_prima mp
        WHERE mp.activo = 1 AND mp.stock_actual <= mp.stock_minimo
        ORDER BY mp.stock_actual ASC
    ''')

    alertas = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(alertas)


@inventario_bp.route('/estadisticas', methods=['GET'])
def get_estadisticas_inventario():
    """Obtiene estadísticas generales del inventario"""
    conn = get_db()
    cursor = conn.cursor()

    # Estadísticas de materia prima
    cursor.execute('''
        SELECT
            COUNT(*) as total_materias,
            SUM(stock_actual * costo_promedio) as valor_inventario,
            SUM(CASE WHEN stock_actual <= 0 THEN 1 ELSE 0 END) as materias_agotadas,
            SUM(CASE WHEN stock_actual > 0 AND stock_actual <= stock_minimo THEN 1 ELSE 0 END) as materias_bajo_stock
        FROM materia_prima
        WHERE activo = 1
    ''')
    stats = dict(cursor.fetchone())

    # Proveedores activos
    cursor.execute('SELECT COUNT(*) as total FROM proveedores WHERE activo = 1')
    stats['proveedores_activos'] = cursor.fetchone()['total']

    # Órdenes pendientes
    cursor.execute("SELECT COUNT(*) as total FROM ordenes_compra WHERE estado IN ('borrador', 'enviada', 'parcial')")
    stats['ordenes_pendientes'] = cursor.fetchone()['total']

    # Movimientos del día
    cursor.execute('''
        SELECT COUNT(*) as total FROM movimientos_inventario
        WHERE DATE(created_at) = DATE('now')
    ''')
    stats['movimientos_hoy'] = cursor.fetchone()['total']

    # Recetas configuradas
    cursor.execute('SELECT COUNT(DISTINCT producto_id) as total FROM recetas')
    stats['productos_con_receta'] = cursor.fetchone()['total']

    conn.close()

    return jsonify(stats)


@inventario_bp.route('/movimientos', methods=['GET'])
def get_movimientos():
    """Obtiene historial de movimientos"""
    materia_id = request.args.get('materia_id')
    tipo = request.args.get('tipo')
    limit = int(request.args.get('limit', 100))

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT m.*, mp.nombre as materia_nombre, mp.unidad_medida
        FROM movimientos_inventario m
        JOIN materia_prima mp ON m.materia_prima_id = mp.id
        WHERE 1=1
    '''
    params = []

    if materia_id:
        query += ' AND m.materia_prima_id = ?'
        params.append(materia_id)

    if tipo:
        query += ' AND m.tipo = ?'
        params.append(tipo)

    query += ' ORDER BY m.created_at DESC LIMIT ?'
    params.append(limit)

    cursor.execute(query, params)
    movimientos = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(movimientos)


# ============ ÓRDENES DE COMPRA ============

@inventario_bp.route('/ordenes-compra', methods=['GET'])
def get_ordenes_compra():
    """Obtiene todas las órdenes de compra"""
    estado = request.args.get('estado')

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT oc.*, p.nombre as proveedor_nombre
        FROM ordenes_compra oc
        JOIN proveedores p ON oc.proveedor_id = p.id
    '''
    params = []

    if estado:
        query += ' WHERE oc.estado = ?'
        params.append(estado)

    query += ' ORDER BY oc.created_at DESC'

    cursor.execute(query, params)
    ordenes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(ordenes)


@inventario_bp.route('/ordenes-compra/<int:id>', methods=['GET'])
def get_orden_compra(id):
    """Obtiene una orden de compra con sus items"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT oc.*, p.nombre as proveedor_nombre
        FROM ordenes_compra oc
        JOIN proveedores p ON oc.proveedor_id = p.id
        WHERE oc.id = ?
    ''', (id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Orden no encontrada'}), 404

    orden = dict(row)

    # Obtener items
    cursor.execute('''
        SELECT oci.*, mp.nombre as materia_nombre, mp.unidad_medida
        FROM orden_compra_items oci
        JOIN materia_prima mp ON oci.materia_prima_id = mp.id
        WHERE oci.orden_id = ?
    ''', (id,))
    orden['items'] = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify(orden)


@inventario_bp.route('/ordenes-compra', methods=['POST'])
def crear_orden_compra():
    """Crea una nueva orden de compra"""
    data = request.get_json()

    if not data.get('proveedor_id'):
        return jsonify({'error': 'Proveedor es requerido'}), 400

    if not data.get('items') or len(data['items']) == 0:
        return jsonify({'error': 'La orden debe tener al menos un item'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Generar número de orden
    cursor.execute('SELECT COUNT(*) FROM ordenes_compra')
    count = cursor.fetchone()[0]
    numero = f"OC-{datetime.now().strftime('%Y%m')}-{str(count + 1).zfill(4)}"

    # Calcular totales
    subtotal = 0
    for item in data['items']:
        item['subtotal'] = float(item.get('cantidad', 0)) * float(item.get('costo_unitario', 0))
        subtotal += item['subtotal']

    impuesto = subtotal * 0.13
    total = subtotal + impuesto

    # Crear orden
    cursor.execute('''
        INSERT INTO ordenes_compra (
            numero, proveedor_id, estado, fecha_orden, fecha_esperada,
            subtotal, impuesto, total, notas, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        numero,
        data.get('proveedor_id'),
        'borrador',
        datetime.now().strftime('%Y-%m-%d'),
        data.get('fecha_esperada'),
        subtotal,
        impuesto,
        total,
        data.get('notas'),
        data.get('created_by', 'Sistema')
    ))

    orden_id = cursor.lastrowid

    # Crear items
    for item in data['items']:
        cursor.execute('''
            INSERT INTO orden_compra_items (
                orden_id, materia_prima_id, cantidad_ordenada, costo_unitario, subtotal, notas
            ) VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            orden_id,
            item.get('materia_prima_id'),
            item.get('cantidad'),
            item.get('costo_unitario'),
            item.get('subtotal'),
            item.get('notas')
        ))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'orden_id': orden_id,
        'numero': numero,
        'total': total
    })


@inventario_bp.route('/ordenes-compra/<int:id>/recibir', methods=['POST'])
def recibir_orden_compra(id):
    """Procesa la recepción de una orden de compra"""
    data = request.get_json()
    items_recibidos = data.get('items', [])

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM ordenes_compra WHERE id = ?', (id,))
    orden = cursor.fetchone()

    if not orden:
        conn.close()
        return jsonify({'error': 'Orden no encontrada'}), 404

    if orden['estado'] in ['recibida', 'cancelada']:
        conn.close()
        return jsonify({'error': 'Esta orden ya fue procesada'}), 400

    total_recibido = 0
    total_ordenado = 0

    for item_data in items_recibidos:
        item_id = item_data.get('item_id')
        cantidad_recibida = float(item_data.get('cantidad_recibida', 0))

        if cantidad_recibida <= 0:
            continue

        cursor.execute('''
            SELECT * FROM orden_compra_items WHERE id = ? AND orden_id = ?
        ''', (item_id, id))
        item = cursor.fetchone()

        if not item:
            continue

        # Actualizar cantidad recibida
        nueva_cantidad_recibida = (item['cantidad_recibida'] or 0) + cantidad_recibida
        cursor.execute('''
            UPDATE orden_compra_items SET cantidad_recibida = ? WHERE id = ?
        ''', (nueva_cantidad_recibida, item_id))

        # Actualizar inventario de materia prima
        cursor.execute('''
            SELECT stock_actual, costo_promedio FROM materia_prima WHERE id = ?
        ''', (item['materia_prima_id'],))
        mp = cursor.fetchone()

        if mp:
            stock_anterior = mp['stock_actual']
            costo_anterior = mp['costo_promedio'] or 0
            stock_nuevo = stock_anterior + cantidad_recibida

            # Calcular costo promedio
            costo_total_anterior = stock_anterior * costo_anterior
            costo_total_nuevo = cantidad_recibida * item['costo_unitario']
            nuevo_costo = (costo_total_anterior + costo_total_nuevo) / stock_nuevo if stock_nuevo > 0 else item['costo_unitario']

            cursor.execute('''
                UPDATE materia_prima SET
                    stock_actual = ?,
                    costo_promedio = ?,
                    ultimo_costo = ?,
                    updated_at = ?
                WHERE id = ?
            ''', (stock_nuevo, nuevo_costo, item['costo_unitario'], datetime.now().isoformat(), item['materia_prima_id']))

            # Registrar movimiento
            cursor.execute('''
                INSERT INTO movimientos_inventario (
                    materia_prima_id, tipo, cantidad, stock_anterior, stock_nuevo,
                    costo_unitario, referencia_tipo, referencia_id, motivo, usuario
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                item['materia_prima_id'], 'entrada', cantidad_recibida, stock_anterior, stock_nuevo,
                item['costo_unitario'], 'orden_compra', id,
                f"Recepción OC #{orden['numero']}", data.get('usuario', 'Sistema')
            ))

        total_recibido += nueva_cantidad_recibida
        total_ordenado += item['cantidad_ordenada']

    # Actualizar estado de la orden
    if total_recibido >= total_ordenado:
        nuevo_estado = 'recibida'
        fecha_recepcion = datetime.now().strftime('%Y-%m-%d')
    else:
        nuevo_estado = 'parcial'
        fecha_recepcion = None

    cursor.execute('''
        UPDATE ordenes_compra SET estado = ?, fecha_recepcion = ?, updated_at = ? WHERE id = ?
    ''', (nuevo_estado, fecha_recepcion, datetime.now().isoformat(), id))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'estado': nuevo_estado,
        'total_recibido': total_recibido,
        'total_ordenado': total_ordenado
    })


# ============ ENDPOINTS PARA EXTRACCIONES DE MATERIA PRIMA ============

@inventario_bp.route('/extracciones', methods=['POST'])
@role_required('manager')
def crear_extraccion():
    """Registra una nueva extracción de materia prima"""
    data = request.get_json()

    fecha = data.get('fecha')
    materia_prima_id = data.get('materia_prima_id')
    cantidad_extraida = data.get('cantidad_extraida')
    unidad_medida = data.get('unidad_medida')
    motivo = data.get('motivo')
    descripcion = data.get('descripcion')
    usuario = data.get('usuario', 'Sistema')

    if not fecha or not materia_prima_id or not cantidad_extraida:
        return jsonify({
            'success': False,
            'message': 'Campos requeridos faltando: fecha, materia_prima_id, cantidad_extraida'
        }), 400

    try:
        cantidad_extraida = float(cantidad_extraida)
        if cantidad_extraida <= 0:
            return jsonify({
                'success': False,
                'message': 'La cantidad debe ser mayor a 0'
            }), 400
    except ValueError:
        return jsonify({
            'success': False,
            'message': 'Cantidad inválida'
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Obtener información de la materia prima para la unidad
        cursor.execute('SELECT unidad_medida FROM materia_prima WHERE id = ?', (materia_prima_id,))
        mp_row = cursor.fetchone()
        if not mp_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Materia prima no encontrada'}), 404

        unidad = unidad_medida or mp_row['unidad_medida']

        # Registrar la extracción en la tabla extracciones_materia_prima
        cursor.execute('''
            INSERT INTO extracciones_materia_prima (
                fecha, hora, materia_prima_id, cantidad_extraida, unidad_medida,
                motivo, descripcion, usuario, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            fecha,
            datetime.now().time().isoformat(),
            materia_prima_id,
            cantidad_extraida,
            unidad,
            motivo,
            descripcion,
            usuario,
            datetime.now().isoformat()
        ))

        extraccion_id = cursor.lastrowid

        # Usar función interna para actualizar stock
        result = _actualizar_stock_y_movimiento(
            conn, cursor,
            materia_prima_id,
            cantidad_extraida,
            'extraccion',
            'extraccion',
            extraccion_id,
            motivo or 'Extracción de materia prima',
            usuario
        )

        if 'error' in result:
            conn.close()
            return jsonify({'success': False, 'message': result['error']}), 400

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'id': extraccion_id,
            'materia_prima': result['materia_prima'],
            'stock_anterior': result['stock_anterior'],
            'stock_nuevo': result['stock_nuevo'],
            'message': f'Extracción registrada: {cantidad_extraida} {unidad} de {result["materia_prima"]}'
        }), 201

    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400


@inventario_bp.route('/extracciones', methods=['GET'])
@role_required('manager')
def listar_extracciones():
    """Lista extracciones de materia prima con filtros opcionales"""
    fecha = request.args.get('fecha')  # YYYY-MM-DD
    materia_prima_id = request.args.get('materia_prima_id')
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT e.id, e.fecha, e.hora, e.materia_prima_id, e.cantidad_extraida,
               e.unidad_medida, e.motivo, e.descripcion, e.usuario, e.created_at,
               mp.nombre as materia_prima_nombre, mp.stock_actual
        FROM extracciones_materia_prima e
        JOIN materia_prima mp ON e.materia_prima_id = mp.id
        WHERE 1=1
    '''
    params = []

    if fecha:
        query += ' AND DATE(e.fecha) = ?'
        params.append(fecha)

    if materia_prima_id:
        query += ' AND e.materia_prima_id = ?'
        params.append(materia_prima_id)

    query += ' ORDER BY e.fecha DESC, e.hora DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])

    cursor.execute(query, params)
    extracciones = cursor.fetchall()

    # Obtener total
    count_query = '''
        SELECT COUNT(*) as total FROM extracciones_materia_prima e WHERE 1=1
    '''
    count_params = []
    if fecha:
        count_query += ' AND DATE(e.fecha) = ?'
        count_params.append(fecha)
    if materia_prima_id:
        count_query += ' AND e.materia_prima_id = ?'
        count_params.append(materia_prima_id)

    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']

    conn.close()

    return jsonify({
        'success': True,
        'extracciones': [dict(row) for row in extracciones],
        'total': total,
        'limit': limit,
        'offset': offset
    })


@inventario_bp.route('/extracciones/<int:id>', methods=['PUT'])
@role_required('manager')
def actualizar_extraccion(id):
    """Actualiza una extracción de materia prima"""
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM extracciones_materia_prima WHERE id = ?', (id,))
    extraccion = cursor.fetchone()

    if not extraccion:
        conn.close()
        return jsonify({'success': False, 'message': 'Extracción no encontrada'}), 404

    cantidad_anterior = extraccion['cantidad_extraida']
    materia_prima_id = extraccion['materia_prima_id']

    cantidad_nueva = data.get('cantidad_extraida', cantidad_anterior)
    motivo = data.get('motivo', extraccion['motivo'])
    descripcion = data.get('descripcion', extraccion['descripcion'])

    try:
        cantidad_nueva = float(cantidad_nueva)
        if cantidad_nueva <= 0:
            conn.close()
            return jsonify({'success': False, 'message': 'Cantidad debe ser > 0'}), 400
    except ValueError:
        conn.close()
        return jsonify({'success': False, 'message': 'Cantidad inválida'}), 400

    diferencia = cantidad_nueva - cantidad_anterior

    # Actualizar extracción
    cursor.execute('''
        UPDATE extracciones_materia_prima
        SET cantidad_extraida = ?, motivo = ?, descripcion = ?
        WHERE id = ?
    ''', (cantidad_nueva, motivo, descripcion, id))

    # Registrar movimiento de ajuste si hay diferencia usando función interna
    if diferencia != 0:
        result = _actualizar_stock_y_movimiento(
            conn, cursor,
            materia_prima_id,
            diferencia,
            'ajuste_extraccion',
            'extraccion',
            id,
            f'Ajuste de extracción: {motivo}',
            data.get('usuario', 'Sistema')
        )

        if 'error' in result:
            conn.close()
            return jsonify({'success': False, 'message': result['error']}), 400

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Extracción actualizada',
        'extraccion_id': id
    })


@inventario_bp.route('/extracciones/<int:id>', methods=['DELETE'])
@role_required('manager')
def eliminar_extraccion(id):
    """Elimina una extracción y revierte el descuento de stock"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM extracciones_materia_prima WHERE id = ?', (id,))
    extraccion = cursor.fetchone()

    if not extraccion:
        conn.close()
        return jsonify({'success': False, 'message': 'Extracción no encontrada'}), 404

    materia_prima_id = extraccion['materia_prima_id']
    cantidad_extraida = extraccion['cantidad_extraida']

    # Revertir stock usando función interna (pasar cantidad negativa para sumar)
    result = _actualizar_stock_y_movimiento(
        conn, cursor,
        materia_prima_id,
        -cantidad_extraida,  # Negativo para revertir (sumar stock)
        'reversal_extraccion',
        'extraccion',
        id,
        'Reversión de extracción eliminada',
        'Sistema'
    )

    if 'error' in result:
        conn.close()
        return jsonify({'success': False, 'message': result['error']}), 400

    # Eliminar la extracción
    cursor.execute('DELETE FROM extracciones_materia_prima WHERE id = ?', (id,))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Extracción eliminada y stock revertido'
    })


# ============ FUNCIÓN PARA DESCONTAR STOCK POR VENTA ============

def descontar_stock_pedido(pedido_id):
    """
    Descuenta la materia prima según las recetas de los productos vendidos
    o directamente si es un producto de consumo (agua, gaseosas, cervezas)
    """
    conn = get_db()
    cursor = conn.cursor()

    # Obtener items del pedido con información del producto
    cursor.execute('''
        SELECT pi.producto_id, pi.cantidad, p.nombre as producto_nombre, p.materia_prima_id
        FROM pedido_items pi
        JOIN productos p ON pi.producto_id = p.id
        WHERE pi.pedido_id = ?
    ''', (pedido_id,))

    items = cursor.fetchall()

    for item in items:
        # CASO 1: Producto de consumo directo (tiene materia_prima_id)
        # Se descuenta 1:1 del inventario (bebidas embotelladas, cervezas, etc.)
        if item['materia_prima_id']:
            cursor.execute('''
                SELECT id, nombre, stock_actual FROM materia_prima WHERE id = ?
            ''', (item['materia_prima_id'],))
            mp = cursor.fetchone()

            if mp:
                cantidad_descontar = item['cantidad']
                stock_anterior = mp['stock_actual']
                stock_nuevo = stock_anterior - cantidad_descontar

                # Actualizar stock
                cursor.execute('''
                    UPDATE materia_prima SET stock_actual = ?, updated_at = ?
                    WHERE id = ?
                ''', (stock_nuevo, datetime.now().isoformat(), mp['id']))

                # Registrar movimiento
                cursor.execute('''
                    INSERT INTO movimientos_inventario (
                        materia_prima_id, tipo, cantidad, stock_anterior, stock_nuevo,
                        referencia_tipo, referencia_id, motivo, usuario
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    mp['id'], 'salida', cantidad_descontar,
                    stock_anterior, stock_nuevo, 'pedido', pedido_id,
                    f"Venta: {item['cantidad']}x {item['producto_nombre']}", 'POS'
                ))

        # NOTA: Productos preparados (pupusas, chocolate, café, etc.) NO descuentan automáticamente
        # El descuento de materia prima se registra manualmente mediante "extracciones" en el módulo de inventario

    conn.commit()
    conn.close()


# ============ FUNCIÓN INTERNA PARA ACTUALIZAR STOCK ============

def _actualizar_stock_y_movimiento(conn, cursor, materia_prima_id, cantidad, tipo_movimiento,
                                   referencia_tipo, referencia_id, motivo, usuario):
    """
    Función interna para actualizar stock y registrar movimiento
    Evita redundancia entre ajustar_materia_prima y extracciones

    Args:
        conn, cursor: Conexión y cursor a BD
        materia_prima_id: ID de la materia prima
        cantidad: Cantidad a restar del stock (positive = salida, negative = entrada)
        tipo_movimiento: 'extraccion', 'ajuste_extraccion', 'salida', etc
        referencia_tipo: 'extraccion', 'pedido', etc
        referencia_id: ID de la referencia
        motivo: Motivo del movimiento
        usuario: Usuario que realiza la acción

    Returns:
        dict con stock_anterior, stock_nuevo, materia_prima o error
    """
    cursor.execute('''
        SELECT id, nombre, stock_actual FROM materia_prima WHERE id = ?
    ''', (materia_prima_id,))

    mp = cursor.fetchone()
    if not mp:
        return {'error': f'Materia prima con ID {materia_prima_id} no existe'}

    stock_anterior = mp['stock_actual']
    stock_nuevo = stock_anterior - cantidad

    # Actualizar stock
    cursor.execute('''
        UPDATE materia_prima SET stock_actual = ?, updated_at = ?
        WHERE id = ?
    ''', (stock_nuevo, datetime.now().isoformat(), materia_prima_id))

    # Registrar movimiento
    cursor.execute('''
        INSERT INTO movimientos_inventario (
            materia_prima_id, tipo, cantidad, stock_anterior, stock_nuevo,
            referencia_tipo, referencia_id, motivo, usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        materia_prima_id,
        tipo_movimiento,
        cantidad,
        stock_anterior,
        stock_nuevo,
        referencia_tipo,
        referencia_id,
        motivo,
        usuario or 'Sistema'
    ))

    return {
        'success': True,
        'materia_prima': mp['nombre'],
        'stock_anterior': stock_anterior,
        'stock_nuevo': stock_nuevo
    }
