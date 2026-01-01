from flask import Flask, request, jsonify, send_file, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
import requests
import os
from datetime import datetime
import base64
import json
from io import BytesIO
from dotenv import load_dotenv
from csrf import generate_csrf_token, validate_csrf_token
from notificaciones import NotificadorPedidos, registrar_socketio_handlers

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'pupuseria-secret-key-2024')
CORS(app, supports_credentials=True)

# Inicializar WebSocket con Socket.IO (para notificaciones en tiempo real)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
    async_mode='threading'
)

# Registrar handlers de Socket.IO
registrar_socketio_handlers(socketio)

# Inicializar rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Registrar Blueprint de Autenticación
from auth import auth_bp, init_auth_db, role_required, set_limiter
app.register_blueprint(auth_bp, url_prefix='/api/auth')

# Pasar el limiter a auth.py para rate limiting en login
set_limiter(limiter)

# ============ CSRF PROTECTION ============

@app.before_request
def csrf_protect():
    """
    Validates CSRF token for state-changing requests (POST, PUT, DELETE).
    Generates a new token for each response.
    """
    # Skip CSRF validation for GET requests and health checks
    if request.method in ['GET', 'HEAD', 'OPTIONS']:
        return

    # Skip CSRF validation for specific endpoints (auth login, health)
    skip_paths = ['/api/auth/login', '/health', '/healthz', '/api/auth/test']
    if any(request.path.startswith(path) for path in skip_paths):
        return

    # Validate CSRF token for POST, PUT, DELETE requests
    if request.method in ['POST', 'PUT', 'DELETE']:
        # Get token from header or form data
        token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token')

        if not token:
            return jsonify({"error": "CSRF token missing"}), 403

        is_valid, message = validate_csrf_token(token)
        if not is_valid:
            return jsonify({"error": f"CSRF validation failed: {message}"}), 403


@app.after_request
def add_csrf_token(response):
    """
    Adds a new CSRF token to every response.
    Token is included in response header and JSON body if applicable.
    """
    # Generate a new CSRF token
    token = generate_csrf_token()

    # Add token to response header
    response.headers['X-CSRF-Token'] = token

    # If response is JSON, try to include token in body
    if response.content_type and 'application/json' in response.content_type:
        try:
            data = json.loads(response.get_data(as_text=True))
            if isinstance(data, dict):
                data['_csrf_token'] = token
                response.set_data(json.dumps(data))
        except Exception:
            # If response is not valid JSON, just use header
            pass

    return response

# Registrar Blueprint del POS
from pos import pos_bp, init_socketio
app.register_blueprint(pos_bp, url_prefix='/api/pos')

# Pasar la instancia de socketio a pos.py para notificaciones
init_socketio(socketio)

# Registrar Blueprint de Inventario
from inventario import inventario_bp
app.register_blueprint(inventario_bp, url_prefix='/api/inventario')

# Registrar Blueprint de Clientes
from clientes import clientes_bp
app.register_blueprint(clientes_bp, url_prefix='/api/clientes')

# Inicializar base de datos de autenticación
init_auth_db()

class DigifactClient:
    def __init__(self):
        self.base_url = os.getenv('DIGIFACT_URL', 'https://felgttestaws.digifact.com.sv')
        self.usuario = os.getenv('DIGIFACT_USER', '')
        self.clave = os.getenv('DIGIFACT_PASS', '')
        self.token = None
        self.token_expiry = None

    def get_token(self):
        """Obtiene token de autenticación"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/login/get_token",
                json={"Username": self.usuario, "Password": self.clave},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            self.token = data.get("Token")
            return self.token
        except Exception as e:
            raise Exception(f"Error obteniendo token: {str(e)}")

    def certificar_dte(self, xml_content):
        """Certifica DTE con Digifact"""
        if not self.token:
            self.get_token()

        try:
            headers = {
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/xml'
            }

            resp = requests.post(
                f"{self.base_url}/api/v2/transform/nuc",
                headers=headers,
                data=xml_content,
                timeout=60
            )

            if resp.status_code == 401:
                self.get_token()
                headers['Authorization'] = f'Bearer {self.token}'
                resp = requests.post(
                    f"{self.base_url}/api/v2/transform/nuc",
                    headers=headers,
                    data=xml_content,
                    timeout=60
                )

            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            raise Exception(f"Error certificando DTE: {str(e)}")

    def anular_dte(self, guid, serie, numero, motivo=""):
        """Anula DTE certificado"""
        if not self.token:
            self.get_token()

        try:
            headers = {
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json'
            }

            payload = {
                "guid": guid,
                "serie": serie,
                "numero": numero,
                "motivo": motivo
            }

            resp = requests.post(
                f"{self.base_url}/api/CancelFeSV",
                headers=headers,
                json=payload,
                timeout=30
            )

            if resp.status_code == 401:
                self.get_token()
                headers['Authorization'] = f'Bearer {self.token}'
                resp = requests.post(
                    f"{self.base_url}/api/CancelFeSV",
                    headers=headers,
                    json=payload,
                    timeout=30
                )

            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            raise Exception(f"Error anulando DTE: {str(e)}")

    def consultar_dte(self, nit, guid):
        """Consulta información de DTE"""
        if not self.token:
            self.get_token()

        try:
            headers = {
                'Authorization': self.token
            }

            # Extraer username del usuario (formato: SV.NIT.USERNAME)
            username = self.usuario.split('.')[-1] if '.' in self.usuario else self.usuario

            params = {
                'TRANSACTION': 'SHARED_INFO_EFACE',
                'NIT': nit,
                'DATA1': 'SHARED_GETDTEINFO',
                'DATA2': f'STAXID|{nit}|AUTHNUMBER|{guid}',
                'USERNAME': username
            }

            resp = requests.get(
                f"{self.base_url}/api/SHAREDINFO",
                headers=headers,
                params=params,
                timeout=30
            )

            if resp.status_code == 401:
                self.get_token()
                headers['Authorization'] = self.token
                resp = requests.get(
                    f"{self.base_url}/api/SHAREDINFO",
                    headers=headers,
                    params=params,
                    timeout=30
                )

            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            raise Exception(f"Error consultando DTE: {str(e)}")

# Instancia global del cliente
digifact = DigifactClient()

@app.route('/health', methods=['GET'])
@role_required('manager')
def health():
    """Endpoint de salud (protegido: solo `manager`)"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route('/healthz', methods=['GET'])
def healthz():
    """Public health endpoint for CI / load balancers."""
    # Intentar obtener información de commit/version desde variables de entorno
    git_commit = os.getenv('GIT_COMMIT')
    app_version = os.getenv('APP_VERSION')

    if not git_commit:
        # Intentar leer .git (si está disponible en la imagen de CI)
        try:
            head_path = os.path.join(os.path.dirname(__file__), '..', '.git', 'HEAD')
            head_path = os.path.abspath(head_path)
            if os.path.exists(head_path):
                with open(head_path, 'r') as f:
                    ref = f.read().strip()
                if ref.startswith('ref:'):
                    ref_path = ref.split(' ', 1)[1].strip()
                    ref_file = os.path.join(os.path.dirname(__file__), '..', '.git', ref_path)
                    ref_file = os.path.abspath(ref_file)
                    if os.path.exists(ref_file):
                        with open(ref_file, 'r') as rf:
                            git_commit = rf.read().strip()[:40]
                else:
                    git_commit = ref[:40]
        except Exception:
            git_commit = None

    payload = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "git_commit": git_commit,
        "version": app_version
    }
    return jsonify(payload)

@app.route('/api/auth/test', methods=['POST'])
def test_auth():
    """Prueba credenciales y conexión"""
    try:
        token = digifact.get_token()
        return jsonify({
            "success": True,
            "message": "Autenticación exitosa",
            "token_preview": token[:20] + "..." if token else None
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/api/certificar', methods=['POST'])
def certificar():
    """Certifica DTE desde archivo XML"""
    try:
        if 'xml' not in request.files:
            return jsonify({"error": "No se envió archivo XML"}), 400

        xml_file = request.files['xml']
        xml_content = xml_file.read()

        resultado = digifact.certificar_dte(xml_content)

        return jsonify({
            "success": True,
            "data": resultado,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/anular', methods=['POST'])
def anular():
    """Anula DTE certificado"""
    try:
        data = request.get_json()

        if not all(k in data for k in ['guid', 'serie', 'numero']):
            return jsonify({"error": "Faltan parámetros requeridos"}), 400

        resultado = digifact.anular_dte(
            data['guid'],
            data['serie'],
            data['numero'],
            data.get('motivo', '')
        )

        return jsonify({
            "success": True,
            "data": resultado,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/consultar', methods=['GET'])
def consultar():
    """Consulta información de DTE"""
    try:
        nit = request.args.get('nit')
        guid = request.args.get('guid')

        if not nit or not guid:
            return jsonify({"error": "Se requieren parámetros nit y guid"}), 400

        resultado = digifact.consultar_dte(nit, guid)

        return jsonify({
            "success": True,
            "data": resultado,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download/pdf', methods=['POST'])
def download_pdf():
    """Descarga PDF desde base64"""
    try:
        data = request.get_json()
        pdf_base64 = data.get('pdfBase64', '')

        if not pdf_base64:
            return jsonify({"error": "No se proporcionó PDF"}), 400

        pdf_bytes = base64.b64decode(pdf_base64)

        return send_file(
            BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'factura_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ NOTIFICACIONES EN TIEMPO REAL ============

@app.route('/api/notificaciones/polling/<rol>', methods=['GET'])
@role_required(['cocinero', 'mesero', 'cajero', 'manager'])
def obtener_notificaciones_polling(rol):
    """
    Endpoint de polling para clientes que no pueden usar WebSocket
    Retorna eventos pendientes para el rol del usuario

    Parámetro:
        rol: Rol del usuario (cocina, meseros, etc.)

    Respuesta:
        {
            "eventos": [
                {
                    "tipo": "nuevo_pedido|pedido_listo|cambio_estado|...",
                    "datos": {...},
                    "timestamp": "ISO-8601"
                },
                ...
            ],
            "timestamp": "ISO-8601"
        }
    """
    try:
        eventos = NotificadorPedidos.obtener_eventos_pendientes(rol)

        return jsonify({
            "eventos": eventos,
            "timestamp": datetime.now().isoformat(),
            "total": len(eventos)
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/notificaciones/estado', methods=['GET'])
@role_required(['manager'])
def obtener_estado_notificaciones():
    """
    Endpoint para debugging: retorna el estado de conexiones WebSocket activas
    Solo disponible para managers

    Respuesta:
        {
            "total_conexiones": int,
            "conexiones": [...]
        }
    """
    try:
        estado = NotificadorPedidos.obtener_estado_conexiones()
        return jsonify(estado), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Usar socketio.run() para soporte WebSocket
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True
    )
