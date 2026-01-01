#!/usr/bin/env python3
"""
Test Data Population Script
Populates the database with realistic test data for POS system testing

Usage:
    python populate_test_data.py        # Populate with default data
    python populate_test_data.py --reset # Clear all data first
    python populate_test_data.py --users # Only create test users
"""

import sqlite3
import os
from datetime import datetime, timedelta
from database import get_db_pos
import argparse

# Test data constants
TEST_CATEGORIES = [
    {'nombre': 'Pupusas', 'orden': 1},
    {'nombre': 'Bebidas', 'orden': 2},
    {'nombre': 'Postres', 'orden': 3},
    {'nombre': 'Acompañamientos', 'orden': 4},
]

TEST_PRODUCTOS = [
    # Pupusas
    {'nombre': 'Pupusa de Queso', 'descripcion': 'Pupusa rellena de quesillo', 'precio': 1.50, 'categoria_id': 1, 'disponible': 1},
    {'nombre': 'Pupusa Revuelta', 'descripcion': 'Pupusa con queso y chicharrón', 'precio': 2.00, 'categoria_id': 1, 'disponible': 1},
    {'nombre': 'Pupusa de Ayote', 'descripcion': 'Pupusa de ayote y queso', 'precio': 1.75, 'categoria_id': 1, 'disponible': 1},
    {'nombre': 'Pupusa de Loroco', 'descripcion': 'Pupusa con loroco y queso', 'precio': 2.00, 'categoria_id': 1, 'disponible': 1},
    {'nombre': 'Pupusa de Hígado', 'descripcion': 'Pupusa con hígado y queso', 'precio': 2.00, 'categoria_id': 1, 'disponible': 1},

    # Bebidas
    {'nombre': 'Agua Natural', 'descripcion': 'Vaso de agua natural', 'precio': 0.50, 'categoria_id': 2, 'disponible': 1},
    {'nombre': 'Horchata', 'descripcion': 'Horchata salvadoreña', 'precio': 1.00, 'categoria_id': 2, 'disponible': 1},
    {'nombre': 'Licuado de Fresa', 'descripcion': 'Licuado de fresa natural', 'precio': 1.50, 'categoria_id': 2, 'disponible': 1},
    {'nombre': 'Refresco', 'descripcion': 'Refresco variado', 'precio': 0.75, 'categoria_id': 2, 'disponible': 1},
    {'nombre': 'Cerveza', 'descripcion': 'Cerveza fría', 'precio': 1.50, 'categoria_id': 2, 'disponible': 1},

    # Postres
    {'nombre': 'Flan de Cajeta', 'descripcion': 'Flan con cajeta', 'precio': 2.00, 'categoria_id': 3, 'disponible': 1},
    {'nombre': 'Pastel de Tres Leches', 'descripcion': 'Pastel de tres leches', 'precio': 2.50, 'categoria_id': 3, 'disponible': 1},
    {'nombre': 'Helado', 'descripcion': 'Helado variado', 'precio': 1.50, 'categoria_id': 3, 'disponible': 1},

    # Acompañamientos
    {'nombre': 'Curtido', 'descripcion': 'Ensalada de repollo', 'precio': 0.50, 'categoria_id': 4, 'disponible': 1},
    {'nombre': 'Salsa de Tomate', 'descripcion': 'Salsa roja casera', 'precio': 0.50, 'categoria_id': 4, 'disponible': 1},
]

TEST_COMBOS = [
    {
        'nombre': 'Combo Almuerzo',
        'descripcion': '3 pupusas + bebida + acompañamiento',
        'precio_combo': 6.50,
        'items': [
            {'producto_id': 1, 'cantidad': 3},  # 3 pupusas de queso
            {'producto_id': 7, 'cantidad': 1},  # Horchata
            {'producto_id': 14, 'cantidad': 1}, # Curtido
        ]
    },
    {
        'nombre': 'Combo Familiar',
        'descripcion': '6 pupusas variadas + 2 bebidas + acompañamientos',
        'precio_combo': 14.99,
        'items': [
            {'producto_id': 1, 'cantidad': 2},  # Pupusas queso
            {'producto_id': 2, 'cantidad': 2},  # Pupusas revueltas
            {'producto_id': 4, 'cantidad': 2},  # Pupusas loroco
            {'producto_id': 8, 'cantidad': 2},  # Licuados
            {'producto_id': 14, 'cantidad': 2}, # Curtido
        ]
    },
    {
        'nombre': 'Combo Postre',
        'descripcion': 'Postre + bebida',
        'precio_combo': 3.50,
        'items': [
            {'producto_id': 11, 'cantidad': 1}, # Flan
            {'producto_id': 7, 'cantidad': 1},  # Horchata
        ]
    },
]

TEST_MESAS = [
    {'numero': 1, 'capacidad': 2},
    {'numero': 2, 'capacidad': 2},
    {'numero': 3, 'capacidad': 4},
    {'numero': 4, 'capacidad': 4},
    {'numero': 5, 'capacidad': 4},
    {'numero': 6, 'capacidad': 6},
    {'numero': 7, 'capacidad': 6},
    {'numero': 8, 'capacidad': 8},
]

TEST_USUARIOS = [
    {'nombre': 'admin', 'email': 'admin@pupuseria.com', 'password': 'admin123', 'rol': 'manager'},
    {'nombre': 'juan', 'email': 'juan@pupuseria.com', 'password': 'pass123', 'rol': 'mesero'},
    {'nombre': 'maria', 'email': 'maria@pupuseria.com', 'password': 'pass123', 'rol': 'mesero'},
    {'nombre': 'carlos', 'email': 'carlos@pupuseria.com', 'password': 'pass123', 'rol': 'cajero'},
    {'nombre': 'pedro', 'email': 'pedro@pupuseria.com', 'password': 'pass123', 'rol': 'cocinero'},
    {'nombre': 'ana', 'email': 'ana@pupuseria.com', 'password': 'pass123', 'rol': 'cocinero'},
]


def reset_database(conn):
    """Delete all test data from tables"""
    cursor = conn.cursor()
    print('🗑️  Limpiando datos existentes...')

    try:
        cursor.execute('DELETE FROM ventas_diarias_categorias')
        cursor.execute('DELETE FROM ventas_diarias_productos')
        cursor.execute('DELETE FROM ventas_diarias')
        cursor.execute('DELETE FROM pedido_items')
        cursor.execute('DELETE FROM pedidos')
        cursor.execute('DELETE FROM combo_items')
        cursor.execute('DELETE FROM combos')
        cursor.execute('DELETE FROM productos')
        cursor.execute('DELETE FROM mesas')
        cursor.execute('DELETE FROM categorias')
        conn.commit()
        print('✅ Datos limpios')
    except Exception as e:
        print(f'❌ Error limpiando datos: {e}')
        return False

    return True


def populate_categories(conn):
    """Populate test categories"""
    cursor = conn.cursor()
    print('\n📂 Creando categorías...')

    try:
        for cat in TEST_CATEGORIES:
            cursor.execute(
                'INSERT INTO categorias (nombre, orden) VALUES (?, ?)',
                (cat['nombre'], cat['orden'])
            )
        conn.commit()
        print(f'✅ {len(TEST_CATEGORIES)} categorías creadas')
    except Exception as e:
        print(f'❌ Error creando categorías: {e}')
        return False

    return True


def populate_productos(conn):
    """Populate test products"""
    cursor = conn.cursor()
    print('🍽️  Creando productos...')

    try:
        for prod in TEST_PRODUCTOS:
            cursor.execute(
                '''INSERT INTO productos
                   (nombre, descripcion, precio, categoria_id, disponible)
                   VALUES (?, ?, ?, ?, ?)''',
                (prod['nombre'], prod['descripcion'], prod['precio'],
                 prod['categoria_id'], prod['disponible'])
            )
        conn.commit()
        print(f'✅ {len(TEST_PRODUCTOS)} productos creados')
    except Exception as e:
        print(f'❌ Error creando productos: {e}')
        return False

    return True


def populate_combos(conn):
    """Populate test combos"""
    cursor = conn.cursor()
    print('📦 Creando combos...')

    try:
        for combo in TEST_COMBOS:
            cursor.execute(
                '''INSERT INTO combos
                   (nombre, descripcion, precio_combo, activo)
                   VALUES (?, ?, ?, 1)''',
                (combo['nombre'], combo['descripcion'], combo['precio_combo'])
            )
            combo_id = cursor.lastrowid

            # Insert combo items
            for item in combo['items']:
                cursor.execute(
                    '''INSERT INTO combo_items
                       (combo_id, producto_id, cantidad)
                       VALUES (?, ?, ?)''',
                    (combo_id, item['producto_id'], item['cantidad'])
                )

        conn.commit()
        print(f'✅ {len(TEST_COMBOS)} combos creados')
    except Exception as e:
        print(f'❌ Error creando combos: {e}')
        return False

    return True


def populate_mesas(conn):
    """Populate test tables"""
    cursor = conn.cursor()
    print('🪑 Creando mesas...')

    try:
        for mesa in TEST_MESAS:
            cursor.execute(
                '''INSERT INTO mesas
                   (numero, capacidad, estado)
                   VALUES (?, ?, 'libre')''',
                (mesa['numero'], mesa['capacidad'])
            )
        conn.commit()
        print(f'✅ {len(TEST_MESAS)} mesas creadas')
    except Exception as e:
        print(f'❌ Error creando mesas: {e}')
        return False

    return True


def populate_sample_orders(conn):
    """Create sample orders for testing"""
    cursor = conn.cursor()
    print('📝 Creando órdenes de ejemplo...')

    try:
        # Order 1: Mesa 1 - pending (for mesero to see)
        cursor.execute(
            '''INSERT INTO pedidos
               (mesa_id, mesero, estado, tipo_pago, subtotal, impuesto, total, tipo_comprobante)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (1, 'juan', 'pendiente_pago', 'al_final', 3.00, 0.39, 3.39, 'ticket')
        )
        pedido1_id = cursor.lastrowid

        cursor.execute(
            '''INSERT INTO pedido_items
               (pedido_id, producto_id, cantidad, precio_unitario, subtotal,
                iva_porcentaje, iva_monto, total_item)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (pedido1_id, 1, 2, 1.50, 3.00, 13.0, 0.39, 3.39)
        )

        # Order 2: Mesa 3 - being prepared (for cocinero to see)
        cursor.execute(
            '''INSERT INTO pedidos
               (mesa_id, mesero, estado, tipo_pago, subtotal, impuesto, total,
                tipo_comprobante, cocina_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (3, 'juan', 'en_cocina', 'al_final', 4.00, 0.52, 4.52, 'ticket', datetime.now())
        )
        pedido2_id = cursor.lastrowid

        cursor.execute(
            '''INSERT INTO pedido_items
               (pedido_id, producto_id, cantidad, precio_unitario, subtotal,
                iva_porcentaje, iva_monto, total_item)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (pedido2_id, 2, 2, 2.00, 4.00, 13.0, 0.52, 4.52)
        )

        # Order 3: Para llevar - for cashier to process
        cursor.execute(
            '''INSERT INTO pedidos
               (mesa_id, mesero, estado, tipo_pago, subtotal, impuesto, total,
                cliente_nombre, tipo_comprobante)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (None, 'juan', 'listo', 'anticipado', 6.50, 0.85, 7.35, 'Cliente 1', 'ticket')
        )
        pedido3_id = cursor.lastrowid

        cursor.execute(
            '''INSERT INTO pedido_items
               (pedido_id, combo_id, producto_id, cantidad, precio_unitario, subtotal,
                iva_porcentaje, iva_monto, total_item)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (pedido3_id, 1, None, 1, 6.50, 6.50, 13.0, 0.85, 7.35)
        )

        conn.commit()
        print(f'✅ 3 órdenes de ejemplo creadas')
    except Exception as e:
        print(f'❌ Error creando órdenes: {e}')
        return False

    return True


def populate_users(conn):
    """Populate test users in auth database"""
    print('👥 Creando usuarios de prueba...')

    try:
        from auth import init_auth_db, hash_password

        # Initialize auth database
        init_auth_db()

        # Connect to auth database
        auth_db = sqlite3.connect(os.path.join(os.path.dirname(__file__), 'pos.db'))
        auth_cursor = auth_db.cursor()

        # Check if users table exists
        auth_cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
        )

        if not auth_cursor.fetchone():
            print('⚠️  Tabla usuarios no existe, creando...')
            return False

        # Clear existing test users
        auth_cursor.execute('DELETE FROM usuarios WHERE nombre IN (?, ?, ?, ?, ?, ?)',
                           tuple([u['nombre'] for u in TEST_USUARIOS]))

        # Insert test users
        for user in TEST_USUARIOS:
            try:
                hashed_password = hash_password(user['password'])
                auth_cursor.execute(
                    '''INSERT INTO usuarios
                       (nombre, email, password_hash, rol)
                       VALUES (?, ?, ?, ?)''',
                    (user['nombre'], user['email'], hashed_password, user['rol'])
                )
            except Exception as e:
                print(f'⚠️  Error creando usuario {user["nombre"]}: {e}')

        auth_db.commit()
        auth_db.close()
        print(f'✅ {len(TEST_USUARIOS)} usuarios de prueba creados')
        return True

    except Exception as e:
        print(f'❌ Error creando usuarios: {e}')
        return False


def show_summary(conn):
    """Show summary of created data"""
    cursor = conn.cursor()
    print('\n' + '='*50)
    print('📊 RESUMEN DE DATOS CREADOS')
    print('='*50)

    queries = [
        ('Categorías', 'SELECT COUNT(*) FROM categorias'),
        ('Productos', 'SELECT COUNT(*) FROM productos'),
        ('Combos', 'SELECT COUNT(*) FROM combos'),
        ('Mesas', 'SELECT COUNT(*) FROM mesas'),
        ('Pedidos', 'SELECT COUNT(*) FROM pedidos'),
        ('Items en Pedidos', 'SELECT COUNT(*) FROM pedido_items'),
    ]

    for label, query in queries:
        count = cursor.execute(query).fetchone()[0]
        print(f'  ✅ {label}: {count}')

    print('='*50 + '\n')


def main():
    parser = argparse.ArgumentParser(description='Populate test data for POS system')
    parser.add_argument('--reset', action='store_true', help='Clear all data first')
    parser.add_argument('--users-only', action='store_true', help='Only create test users')
    parser.add_argument('--orders-only', action='store_true', help='Only create sample orders')

    args = parser.parse_args()

    print('🚀 Iniciando población de datos de prueba...\n')

    try:
        conn = get_db_pos()

        if args.users_only:
            populate_users(conn)
            return

        if args.reset:
            if not reset_database(conn):
                return

        # Populate data
        if not populate_categories(conn):
            return
        if not populate_productos(conn):
            return
        if not populate_combos(conn):
            return
        if not populate_mesas(conn):
            return

        if not args.orders_only:
            if not populate_users(conn):
                print('⚠️  Usuarios no poblados (problema con auth)')
        else:
            if not populate_sample_orders(conn):
                return

        # Always populate sample orders unless users-only
        if not args.users_only:
            if not populate_sample_orders(conn):
                return

        show_summary(conn)
        conn.close()

        print('✨ ¡Población de datos completada exitosamente!')
        print('\nCredenciales de prueba:')
        for user in TEST_USUARIOS:
            print(f'  👤 {user["nombre"]} / {user["password"]} ({user["rol"]})')

    except Exception as e:
        print(f'\n❌ Error fatal: {e}')
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
