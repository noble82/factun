"""
Módulo de Autenticación para Sistema POS
Maneja usuarios, roles y sesiones
"""

from flask import Blueprint, request, jsonify, session
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps

auth_bp = Blueprint('auth', __name__)

DATABASE = 'pos_database.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password, salt=None):
    """Hash password with salt"""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return salt + ':' + hashed.hex()

def verify_password(password, stored_hash):
    """Verify password against stored hash"""
    try:
        salt, hash_value = stored_hash.split(':')
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return new_hash.hex() == hash_value
    except:
        return False

def init_auth_db():
    """Inicializa las tablas de autenticación"""
    conn = get_db()
    cursor = conn.cursor()

    # Tabla de usuarios
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL CHECK(rol IN ('manager', 'mesero', 'cajero', 'cocinero')),
            activo INTEGER DEFAULT 1,
            ultimo_login TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES usuarios(id)
        )
    ''')

    # Tabla de sesiones
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            ip_address TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    ''')

    # Crear usuario manager por defecto si no existe
    cursor.execute('SELECT COUNT(*) FROM usuarios WHERE rol = "manager"')
    if cursor.fetchone()[0] == 0:
        password_hash = hash_password('admin123')
        cursor.execute('''
            INSERT INTO usuarios (username, password_hash, nombre, rol)
            VALUES (?, ?, ?, ?)
        ''', ('admin', password_hash, 'Administrador', 'manager'))
        print("Usuario manager creado: admin / admin123")

    conn.commit()
    conn.close()

# Decorador para requerir autenticación
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            token = request.cookies.get('session_token')

        if not token:
            return jsonify({'error': 'No autorizado', 'code': 'NO_TOKEN'}), 401

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.* FROM usuarios u
            JOIN sesiones s ON u.id = s.usuario_id
            WHERE s.token = ? AND s.expires_at > datetime('now') AND u.activo = 1
        ''', (token,))
        user = cursor.fetchone()
        conn.close()

        if not user:
            return jsonify({'error': 'Sesión inválida o expirada', 'code': 'INVALID_SESSION'}), 401

        request.current_user = dict(user)
        return f(*args, **kwargs)
    return decorated_function

# Decorador para requerir rol específico
def role_required(*roles):
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if request.current_user['rol'] not in roles:
                return jsonify({'error': 'No tiene permisos para esta acción'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ============ ENDPOINTS DE AUTENTICACIÓN ============

@auth_bp.route('/login', methods=['POST'])
def login():
    """Iniciar sesión"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Usuario y contraseña requeridos'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM usuarios WHERE username = ? AND activo = 1', (username,))
    user = cursor.fetchone()

    if not user or not verify_password(password, user['password_hash']):
        conn.close()
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401

    # Crear token de sesión
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(hours=12)).isoformat()
    ip_address = request.remote_addr

    cursor.execute('''
        INSERT INTO sesiones (usuario_id, token, expires_at, ip_address)
        VALUES (?, ?, ?, ?)
    ''', (user['id'], token, expires_at, ip_address))

    # Actualizar último login
    cursor.execute('UPDATE usuarios SET ultimo_login = datetime("now") WHERE id = ?', (user['id'],))

    conn.commit()
    conn.close()

    response = jsonify({
        'success': True,
        'token': token,
        'usuario': {
            'id': user['id'],
            'username': user['username'],
            'nombre': user['nombre'],
            'rol': user['rol']
        }
    })

    # También establecer cookie
    response.set_cookie('session_token', token, httponly=True, max_age=43200)

    return response

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Cerrar sesión"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        token = request.cookies.get('session_token')

    if token:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sesiones WHERE token = ?', (token,))
        conn.commit()
        conn.close()

    response = jsonify({'success': True, 'mensaje': 'Sesión cerrada'})
    response.delete_cookie('session_token')
    return response

@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    """Obtener usuario actual"""
    user = request.current_user
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'nombre': user['nombre'],
        'rol': user['rol']
    })

@auth_bp.route('/cambiar-password', methods=['POST'])
@login_required
def cambiar_password():
    """Cambiar contraseña del usuario actual"""
    data = request.get_json()
    password_actual = data.get('password_actual', '')
    password_nueva = data.get('password_nueva', '')

    if not password_actual or not password_nueva:
        return jsonify({'error': 'Contraseña actual y nueva son requeridas'}), 400

    if len(password_nueva) < 4:
        return jsonify({'error': 'La contraseña debe tener al menos 4 caracteres'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT password_hash FROM usuarios WHERE id = ?', (request.current_user['id'],))
    user = cursor.fetchone()

    if not verify_password(password_actual, user['password_hash']):
        conn.close()
        return jsonify({'error': 'Contraseña actual incorrecta'}), 400

    new_hash = hash_password(password_nueva)
    cursor.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?',
                   (new_hash, request.current_user['id']))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'mensaje': 'Contraseña actualizada'})

# ============ GESTIÓN DE USUARIOS (SOLO MANAGER) ============

@auth_bp.route('/usuarios', methods=['GET'])
@role_required('manager')
def listar_usuarios():
    """Listar todos los usuarios"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, nombre, rol, activo, ultimo_login, created_at
        FROM usuarios
        ORDER BY rol, nombre
    ''')

    usuarios = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(usuarios)

@auth_bp.route('/usuarios/<int:id>', methods=['GET'])
@role_required('manager')
def get_usuario(id):
    """Obtener usuario por ID"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, nombre, rol, activo, ultimo_login, created_at
        FROM usuarios WHERE id = ?
    ''', (id,))

    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    return jsonify(dict(user))

@auth_bp.route('/usuarios', methods=['POST'])
@role_required('manager')
def crear_usuario():
    """Crear nuevo usuario"""
    data = request.get_json()

    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    nombre = data.get('nombre', '').strip()
    rol = data.get('rol', '')

    if not username or not password or not nombre or not rol:
        return jsonify({'error': 'Todos los campos son requeridos'}), 400

    if rol not in ['mesero', 'cajero', 'cocinero', 'manager']:
        return jsonify({'error': 'Rol inválido'}), 400

    if len(password) < 4:
        return jsonify({'error': 'La contraseña debe tener al menos 4 caracteres'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verificar username único
    cursor.execute('SELECT id FROM usuarios WHERE username = ?', (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': 'El nombre de usuario ya existe'}), 400

    password_hash = hash_password(password)

    cursor.execute('''
        INSERT INTO usuarios (username, password_hash, nombre, rol, created_by)
        VALUES (?, ?, ?, ?, ?)
    ''', (username, password_hash, nombre, rol, request.current_user['id']))

    usuario_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'usuario_id': usuario_id,
        'mensaje': f'Usuario {username} creado exitosamente'
    })

@auth_bp.route('/usuarios/<int:id>', methods=['PUT'])
@role_required('manager')
def actualizar_usuario(id):
    """Actualizar usuario"""
    data = request.get_json()

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM usuarios WHERE id = ?', (id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'Usuario no encontrado'}), 404

    nombre = data.get('nombre', user['nombre']).strip()
    rol = data.get('rol', user['rol'])
    activo = data.get('activo', user['activo'])

    if rol not in ['mesero', 'cajero', 'cocinero', 'manager']:
        conn.close()
        return jsonify({'error': 'Rol inválido'}), 400

    # No permitir desactivar al único manager
    if not activo and user['rol'] == 'manager':
        cursor.execute('SELECT COUNT(*) FROM usuarios WHERE rol = "manager" AND activo = 1 AND id != ?', (id,))
        if cursor.fetchone()[0] == 0:
            conn.close()
            return jsonify({'error': 'No puede desactivar al único manager activo'}), 400

    cursor.execute('''
        UPDATE usuarios SET nombre = ?, rol = ?, activo = ?
        WHERE id = ?
    ''', (nombre, rol, activo, id))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'mensaje': 'Usuario actualizado'})

@auth_bp.route('/usuarios/<int:id>/reset-password', methods=['POST'])
@role_required('manager')
def reset_password(id):
    """Resetear contraseña de usuario"""
    data = request.get_json()
    nueva_password = data.get('password', '')

    if not nueva_password or len(nueva_password) < 4:
        return jsonify({'error': 'La contraseña debe tener al menos 4 caracteres'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM usuarios WHERE id = ?', (id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Usuario no encontrado'}), 404

    password_hash = hash_password(nueva_password)
    cursor.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', (password_hash, id))

    # Invalidar sesiones existentes
    cursor.execute('DELETE FROM sesiones WHERE usuario_id = ?', (id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'mensaje': 'Contraseña restablecida'})

@auth_bp.route('/usuarios/<int:id>', methods=['DELETE'])
@role_required('manager')
def eliminar_usuario(id):
    """Eliminar (desactivar) usuario"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM usuarios WHERE id = ?', (id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'Usuario no encontrado'}), 404

    # No permitir eliminar al propio usuario
    if id == request.current_user['id']:
        conn.close()
        return jsonify({'error': 'No puede eliminarse a sí mismo'}), 400

    # No permitir eliminar al único manager
    if user['rol'] == 'manager':
        cursor.execute('SELECT COUNT(*) FROM usuarios WHERE rol = "manager" AND activo = 1 AND id != ?', (id,))
        if cursor.fetchone()[0] == 0:
            conn.close()
            return jsonify({'error': 'No puede eliminar al único manager activo'}), 400

    # Desactivar en lugar de eliminar
    cursor.execute('UPDATE usuarios SET activo = 0 WHERE id = ?', (id,))

    # Invalidar sesiones
    cursor.execute('DELETE FROM sesiones WHERE usuario_id = ?', (id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'mensaje': 'Usuario desactivado'})

# ============ ESTADÍSTICAS DE USUARIOS ============

@auth_bp.route('/usuarios/estadisticas', methods=['GET'])
@role_required('manager')
def estadisticas_usuarios():
    """Obtener estadísticas de usuarios"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) as activos,
            SUM(CASE WHEN rol = 'manager' THEN 1 ELSE 0 END) as managers,
            SUM(CASE WHEN rol = 'mesero' THEN 1 ELSE 0 END) as meseros,
            SUM(CASE WHEN rol = 'cajero' THEN 1 ELSE 0 END) as cajeros,
            SUM(CASE WHEN rol = 'cocinero' THEN 1 ELSE 0 END) as cocineros
        FROM usuarios
    ''')

    stats = dict(cursor.fetchone())
    conn.close()

    return jsonify(stats)
