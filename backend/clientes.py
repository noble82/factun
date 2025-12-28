"""
Módulo de Gestión de Clientes
Sistema de Facturación - El Salvador
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_db

clientes_bp = Blueprint('clientes', __name__)

def init_db():
    """Inicializa la tabla de clientes"""
    conn = get_db()
    cursor = conn.cursor()

    # Crear tabla de clientes
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            tipo_documento TEXT DEFAULT 'DUI',
            numero_documento TEXT,
            nrc TEXT,
            nombre TEXT NOT NULL,
            nombre_comercial TEXT,
            direccion TEXT,
            departamento TEXT,
            municipio TEXT,
            telefono TEXT,
            email TEXT,
            tipo_cliente TEXT DEFAULT 'consumidor_final',
            actividad_economica TEXT,
            credito_autorizado REAL DEFAULT 0,
            dias_credito INTEGER DEFAULT 0,
            notas TEXT,
            activo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Crear índices para búsquedas rápidas
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clientes_documento ON clientes(numero_documento)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clientes_nrc ON clientes(nrc)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON clientes(codigo)')

    # Insertar cliente genérico si no existe
    cursor.execute('SELECT COUNT(*) FROM clientes')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO clientes (codigo, nombre, tipo_cliente, tipo_documento)
            VALUES ('CF-0001', 'Consumidor Final', 'consumidor_final', 'DUI')
        ''')

    conn.commit()
    conn.close()

# Inicializar base de datos al importar el módulo
init_db()

def generar_codigo_cliente():
    """Genera código único para cliente"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(id) FROM clientes")
    max_id = cursor.fetchone()[0] or 0
    conn.close()
    return f"CLI-{(max_id + 1):04d}"


# ============ ENDPOINTS API ============

@clientes_bp.route('/clientes', methods=['GET'])
def get_clientes():
    """Obtiene lista de clientes con filtros opcionales"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Parámetros de filtro
        tipo = request.args.get('tipo')  # contribuyente, consumidor_final
        activo = request.args.get('activo', '1')
        buscar = request.args.get('buscar', '')

        query = '''
            SELECT * FROM clientes
            WHERE activo = ?
        '''
        params = [int(activo)]

        if tipo:
            query += ' AND tipo_cliente = ?'
            params.append(tipo)

        if buscar:
            query += ''' AND (
                nombre LIKE ? OR
                numero_documento LIKE ? OR
                nrc LIKE ? OR
                codigo LIKE ? OR
                telefono LIKE ?
            )'''
            buscar_param = f'%{buscar}%'
            params.extend([buscar_param] * 5)

        query += ' ORDER BY nombre ASC'

        cursor.execute(query, params)
        clientes = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return jsonify(clientes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>', methods=['GET'])
def get_cliente(id):
    """Obtiene un cliente por ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM clientes WHERE id = ?', (id,))
        cliente = cursor.fetchone()
        conn.close()

        if cliente:
            return jsonify(dict(cliente))
        return jsonify({'error': 'Cliente no encontrado'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/buscar', methods=['GET'])
def buscar_cliente():
    """Busca cliente por documento o NRC (para autocompletado)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        documento = request.args.get('documento', '')
        nrc = request.args.get('nrc', '')

        if documento:
            cursor.execute('''
                SELECT * FROM clientes
                WHERE numero_documento = ? AND activo = 1
            ''', (documento,))
        elif nrc:
            cursor.execute('''
                SELECT * FROM clientes
                WHERE nrc = ? AND activo = 1
            ''', (nrc,))
        else:
            return jsonify({'error': 'Debe proporcionar documento o NRC'}), 400

        cliente = cursor.fetchone()
        conn.close()

        if cliente:
            return jsonify({'encontrado': True, 'cliente': dict(cliente)})
        return jsonify({'encontrado': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes', methods=['POST'])
def crear_cliente():
    """Crea un nuevo cliente"""
    try:
        data = request.get_json()

        # Validaciones
        if not data.get('nombre'):
            return jsonify({'error': 'El nombre es requerido'}), 400

        # Validar documento único si se proporciona
        conn = get_db()
        cursor = conn.cursor()

        if data.get('numero_documento'):
            cursor.execute(
                'SELECT id FROM clientes WHERE numero_documento = ? AND activo = 1',
                (data['numero_documento'],)
            )
            if cursor.fetchone():
                conn.close()
                return jsonify({'error': 'Ya existe un cliente con ese documento'}), 400

        # Validar NRC único si se proporciona
        if data.get('nrc'):
            cursor.execute(
                'SELECT id FROM clientes WHERE nrc = ? AND activo = 1',
                (data['nrc'],)
            )
            if cursor.fetchone():
                conn.close()
                return jsonify({'error': 'Ya existe un cliente con ese NRC'}), 400

        # Generar código
        codigo = generar_codigo_cliente()

        cursor.execute('''
            INSERT INTO clientes (
                codigo, tipo_documento, numero_documento, nrc, nombre,
                nombre_comercial, direccion, departamento, municipio,
                telefono, email, tipo_cliente, actividad_economica,
                credito_autorizado, dias_credito, notas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            codigo,
            data.get('tipo_documento', 'DUI'),
            data.get('numero_documento'),
            data.get('nrc'),
            data['nombre'],
            data.get('nombre_comercial'),
            data.get('direccion'),
            data.get('departamento'),
            data.get('municipio'),
            data.get('telefono'),
            data.get('email'),
            data.get('tipo_cliente', 'consumidor_final'),
            data.get('actividad_economica'),
            data.get('credito_autorizado', 0),
            data.get('dias_credito', 0),
            data.get('notas')
        ))

        cliente_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'id': cliente_id,
            'codigo': codigo,
            'mensaje': 'Cliente creado correctamente'
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>', methods=['PUT'])
def actualizar_cliente(id):
    """Actualiza un cliente existente (actualización parcial permitida)"""
    try:
        data = request.get_json()

        conn = get_db()
        cursor = conn.cursor()

        # Verificar que existe y obtener datos actuales
        cursor.execute('SELECT * FROM clientes WHERE id = ?', (id,))
        cliente_actual = cursor.fetchone()
        if not cliente_actual:
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        cliente_actual = dict(cliente_actual)

        # Validar documento único (excluyendo el actual)
        if 'numero_documento' in data and data.get('numero_documento'):
            cursor.execute(
                'SELECT id FROM clientes WHERE numero_documento = ? AND id != ? AND activo = 1',
                (data['numero_documento'], id)
            )
            if cursor.fetchone():
                conn.close()
                return jsonify({'error': 'Ya existe otro cliente con ese documento'}), 400

        # Validar NRC único (excluyendo el actual)
        if 'nrc' in data and data.get('nrc'):
            cursor.execute(
                'SELECT id FROM clientes WHERE nrc = ? AND id != ? AND activo = 1',
                (data['nrc'], id)
            )
            if cursor.fetchone():
                conn.close()
                return jsonify({'error': 'Ya existe otro cliente con ese NRC'}), 400

        # Usar valores actuales si no se proporcionan nuevos (actualización parcial)
        cursor.execute('''
            UPDATE clientes SET
                tipo_documento = COALESCE(?, tipo_documento),
                numero_documento = COALESCE(?, numero_documento),
                nrc = COALESCE(?, nrc),
                nombre = COALESCE(?, nombre),
                nombre_comercial = COALESCE(?, nombre_comercial),
                direccion = COALESCE(?, direccion),
                departamento = COALESCE(?, departamento),
                municipio = COALESCE(?, municipio),
                telefono = COALESCE(?, telefono),
                email = COALESCE(?, email),
                tipo_cliente = COALESCE(?, tipo_cliente),
                actividad_economica = COALESCE(?, actividad_economica),
                credito_autorizado = COALESCE(?, credito_autorizado),
                dias_credito = COALESCE(?, dias_credito),
                notas = COALESCE(?, notas),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            data.get('tipo_documento'),
            data.get('numero_documento'),
            data.get('nrc'),
            data.get('nombre'),
            data.get('nombre_comercial'),
            data.get('direccion'),
            data.get('departamento'),
            data.get('municipio'),
            data.get('telefono'),
            data.get('email'),
            data.get('tipo_cliente'),
            data.get('actividad_economica'),
            data.get('credito_autorizado'),
            data.get('dias_credito'),
            data.get('notas'),
            id
        ))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'mensaje': 'Cliente actualizado correctamente'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>', methods=['DELETE'])
def eliminar_cliente(id):
    """Desactiva un cliente (soft delete)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Verificar que existe
        cursor.execute('SELECT id, codigo FROM clientes WHERE id = ?', (id,))
        cliente = cursor.fetchone()
        if not cliente:
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        # No permitir eliminar el cliente genérico
        if cliente['codigo'] == 'CF-0001':
            conn.close()
            return jsonify({'error': 'No se puede eliminar el cliente genérico'}), 400

        # Soft delete
        cursor.execute('''
            UPDATE clientes SET activo = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (id,))

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'mensaje': 'Cliente eliminado correctamente'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/estadisticas', methods=['GET'])
def estadisticas_clientes():
    """Obtiene estadísticas de clientes"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Total de clientes activos
        cursor.execute('SELECT COUNT(*) FROM clientes WHERE activo = 1')
        total = cursor.fetchone()[0]

        # Por tipo
        cursor.execute('''
            SELECT tipo_cliente, COUNT(*) as cantidad
            FROM clientes WHERE activo = 1
            GROUP BY tipo_cliente
        ''')
        por_tipo = {row['tipo_cliente']: row['cantidad'] for row in cursor.fetchall()}

        # Clientes con crédito
        cursor.execute('''
            SELECT COUNT(*) FROM clientes
            WHERE activo = 1 AND credito_autorizado > 0
        ''')
        con_credito = cursor.fetchone()[0]

        # Nuevos este mes
        cursor.execute('''
            SELECT COUNT(*) FROM clientes
            WHERE activo = 1
            AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        ''')
        nuevos_mes = cursor.fetchone()[0]

        conn.close()

        return jsonify({
            'total': total,
            'por_tipo': por_tipo,
            'con_credito': con_credito,
            'nuevos_mes': nuevos_mes
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Departamentos de El Salvador para select
DEPARTAMENTOS_SV = [
    'Ahuachapán', 'Cabañas', 'Chalatenango', 'Cuscatlán',
    'La Libertad', 'La Paz', 'La Unión', 'Morazán',
    'San Miguel', 'San Salvador', 'San Vicente',
    'Santa Ana', 'Sonsonate', 'Usulután'
]

@clientes_bp.route('/clientes/departamentos', methods=['GET'])
def get_departamentos():
    """Retorna lista de departamentos de El Salvador"""
    return jsonify(DEPARTAMENTOS_SV)


# ============ NUEVAS FUNCIONALIDADES ============

@clientes_bp.route('/clientes/crear-rapido', methods=['POST'])
def crear_cliente_rapido():
    """Crea un cliente rápidamente desde el proceso de facturación"""
    try:
        data = request.get_json()

        if not data.get('nombre'):
            return jsonify({'error': 'El nombre es requerido'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Verificar si ya existe por documento
        if data.get('numero_documento'):
            cursor.execute(
                'SELECT id, nombre FROM clientes WHERE numero_documento = ? AND activo = 1',
                (data['numero_documento'],)
            )
            existente = cursor.fetchone()
            if existente:
                conn.close()
                return jsonify({
                    'success': True,
                    'id': existente['id'],
                    'mensaje': f'Cliente existente: {existente["nombre"]}',
                    'existente': True
                })

        # Generar código
        codigo = generar_codigo_cliente()

        # Determinar tipo de cliente basado en si tiene NRC
        tipo_cliente = 'contribuyente' if data.get('nrc') else 'consumidor_final'

        cursor.execute('''
            INSERT INTO clientes (
                codigo, tipo_documento, numero_documento, nrc, nombre,
                direccion, telefono, email, tipo_cliente,
                credito_autorizado, dias_credito
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            codigo,
            data.get('tipo_documento', 'DUI'),
            data.get('numero_documento'),
            data.get('nrc'),
            data['nombre'],
            data.get('direccion'),
            data.get('telefono'),
            data.get('email'),
            tipo_cliente,
            data.get('credito_autorizado', 0),
            data.get('dias_credito', 0)
        ))

        cliente_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'id': cliente_id,
            'codigo': codigo,
            'mensaje': 'Cliente creado correctamente',
            'existente': False
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>/historial', methods=['GET'])
def get_historial_cliente(id):
    """Obtiene el historial de compras de un cliente"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Verificar que el cliente existe
        cursor.execute('SELECT id, nombre FROM clientes WHERE id = ?', (id,))
        cliente = cursor.fetchone()
        if not cliente:
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        # Obtener pedidos del cliente
        cursor.execute('''
            SELECT
                p.id,
                p.created_at as fecha,
                p.total,
                p.estado,
                p.tipo_pago,
                m.numero as mesa_numero,
                p.dte_tipo,
                p.dte_numero_control
            FROM pedidos p
            LEFT JOIN mesas m ON p.mesa_id = m.id
            WHERE p.cliente_id = ?
            ORDER BY p.created_at DESC
            LIMIT 50
        ''', (id,))

        pedidos = [dict(row) for row in cursor.fetchall()]

        # Estadísticas del cliente
        cursor.execute('''
            SELECT
                COUNT(*) as total_pedidos,
                COALESCE(SUM(total), 0) as total_compras,
                COALESCE(AVG(total), 0) as promedio_compra,
                MAX(created_at) as ultima_compra
            FROM pedidos
            WHERE cliente_id = ? AND estado NOT IN ('cancelado')
        ''', (id,))

        stats = dict(cursor.fetchone())

        # Productos más comprados
        cursor.execute('''
            SELECT
                pr.nombre as producto,
                SUM(pi.cantidad) as cantidad_total,
                SUM(pi.subtotal) as total_gastado
            FROM pedido_items pi
            JOIN pedidos p ON pi.pedido_id = p.id
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE p.cliente_id = ?
            GROUP BY pr.id
            ORDER BY cantidad_total DESC
            LIMIT 5
        ''', (id,))

        productos_favoritos = [dict(row) for row in cursor.fetchall()]

        conn.close()

        return jsonify({
            'cliente': dict(cliente),
            'estadisticas': stats,
            'pedidos': pedidos,
            'productos_favoritos': productos_favoritos
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>/credito', methods=['GET'])
def get_credito_cliente(id):
    """Obtiene información de crédito del cliente"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Obtener datos del cliente
        cursor.execute('''
            SELECT id, nombre, credito_autorizado, dias_credito
            FROM clientes WHERE id = ? AND activo = 1
        ''', (id,))

        cliente = cursor.fetchone()
        if not cliente:
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        credito_autorizado = cliente['credito_autorizado'] or 0
        conn.close()

        # Calcular crédito utilizado desde la base de datos de POS
        # Los pedidos con estado 'credito' son ventas a crédito pendientes de pago
        import sqlite3 as sqlite_pos
        try:
            conn_pos = sqlite_pos.connect('pos.db')
            conn_pos.row_factory = sqlite_pos.Row
            cursor_pos = conn_pos.cursor()

            cursor_pos.execute('''
                SELECT COALESCE(SUM(total), 0) as credito_utilizado
                FROM pedidos
                WHERE cliente_id = ? AND estado = 'credito'
            ''', (id,))

            credito_utilizado = cursor_pos.fetchone()['credito_utilizado'] or 0

            # Obtener pedidos pendientes de pago (crédito)
            cursor_pos.execute('''
                SELECT id, created_at, total, estado
                FROM pedidos
                WHERE cliente_id = ? AND estado = 'credito'
                ORDER BY created_at ASC
            ''', (id,))

            pedidos_pendientes = [dict(row) for row in cursor_pos.fetchall()]
            conn_pos.close()
        except Exception as e:
            print(f"Error consultando pos.db: {e}")
            credito_utilizado = 0
            pedidos_pendientes = []

        credito_disponible = credito_autorizado - credito_utilizado

        return jsonify({
            'cliente_id': id,
            'nombre': cliente['nombre'],
            'credito_autorizado': credito_autorizado,
            'credito_utilizado': credito_utilizado,
            'credito_disponible': credito_disponible,
            'dias_credito': cliente['dias_credito'] or 0,
            'pedidos_pendientes': pedidos_pendientes,
            'puede_comprar_credito': credito_disponible > 0,
            'alerta': credito_disponible <= (credito_autorizado * 0.2) if credito_autorizado > 0 else False
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/<int:id>/verificar-credito', methods=['POST'])
def verificar_credito_cliente(id):
    """Verifica si el cliente puede realizar una compra a crédito"""
    try:
        data = request.get_json()
        monto = data.get('monto', 0)

        conn = get_db()
        cursor = conn.cursor()

        # Obtener crédito autorizado
        cursor.execute('''
            SELECT credito_autorizado FROM clientes
            WHERE id = ? AND activo = 1
        ''', (id,))

        cliente = cursor.fetchone()
        if not cliente:
            conn.close()
            return jsonify({'error': 'Cliente no encontrado'}), 404

        credito_autorizado = cliente['credito_autorizado'] or 0
        conn.close()

        if credito_autorizado <= 0:
            return jsonify({
                'aprobado': False,
                'mensaje': 'El cliente no tiene crédito autorizado'
            })

        # Calcular crédito utilizado desde pos.db
        import sqlite3 as sqlite_pos
        try:
            conn_pos = sqlite_pos.connect('pos.db')
            conn_pos.row_factory = sqlite_pos.Row
            cursor_pos = conn_pos.cursor()

            cursor_pos.execute('''
                SELECT COALESCE(SUM(total), 0) as credito_utilizado
                FROM pedidos
                WHERE cliente_id = ? AND estado = 'credito'
            ''', (id,))

            credito_utilizado = cursor_pos.fetchone()['credito_utilizado'] or 0
            conn_pos.close()
        except Exception:
            credito_utilizado = 0

        credito_disponible = credito_autorizado - credito_utilizado

        if monto > credito_disponible:
            return jsonify({
                'aprobado': False,
                'mensaje': f'Crédito insuficiente. Disponible: ${credito_disponible:.2f}, Solicitado: ${monto:.2f}',
                'credito_disponible': credito_disponible,
                'monto_solicitado': monto
            })

        return jsonify({
            'aprobado': True,
            'mensaje': 'Crédito aprobado',
            'credito_disponible': credito_disponible,
            'credito_restante': credito_disponible - monto
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@clientes_bp.route('/clientes/alertas-credito', methods=['GET'])
def get_alertas_credito():
    """Obtiene clientes con alertas de crédito (>80% utilizado)"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Obtener clientes con crédito autorizado
        cursor.execute('''
            SELECT id, codigo, nombre, credito_autorizado
            FROM clientes
            WHERE activo = 1 AND credito_autorizado > 0
        ''')

        clientes = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not clientes:
            return jsonify([])

        # Consultar crédito utilizado desde pos.db
        import sqlite3 as sqlite_pos
        alertas = []

        try:
            conn_pos = sqlite_pos.connect('pos.db')
            conn_pos.row_factory = sqlite_pos.Row
            cursor_pos = conn_pos.cursor()

            for cliente in clientes:
                cursor_pos.execute('''
                    SELECT COALESCE(SUM(total), 0) as credito_utilizado
                    FROM pedidos
                    WHERE cliente_id = ? AND estado = 'credito'
                ''', (cliente['id'],))

                credito_utilizado = cursor_pos.fetchone()['credito_utilizado'] or 0
                credito_autorizado = cliente['credito_autorizado']

                if credito_autorizado > 0:
                    porcentaje = (credito_utilizado / credito_autorizado) * 100

                    # Solo incluir si está por encima del 80%
                    if porcentaje >= 80:
                        cliente['credito_utilizado'] = credito_utilizado
                        cliente['porcentaje_utilizado'] = round(porcentaje, 1)
                        cliente['credito_disponible'] = credito_autorizado - credito_utilizado

                        if porcentaje >= 100:
                            cliente['nivel_alerta'] = 'critico'
                        elif porcentaje >= 90:
                            cliente['nivel_alerta'] = 'alto'
                        else:
                            cliente['nivel_alerta'] = 'medio'

                        alertas.append(cliente)

            conn_pos.close()
        except Exception as e:
            print(f"Error consultando pos.db para alertas: {e}")

        # Ordenar por porcentaje descendente
        alertas.sort(key=lambda x: x.get('porcentaje_utilizado', 0), reverse=True)

        return jsonify(alertas)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
