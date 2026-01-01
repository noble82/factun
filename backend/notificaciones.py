"""
Módulo de Notificaciones en Tiempo Real
Maneja WebSocket y fallback con polling para actualizaciones de pedidos
"""

from flask import request
from flask_socketio import emit, join_room, leave_room
from datetime import datetime
import json

# Almacén de conexiones activas
# Estructura: { session_id: { role, username, rooms } }
conexiones_activas = {}

# Cola de eventos para polling
# Estructura: { user_id: [eventos] }
cola_eventos = {}

# Salas de WebSocket
# Estructura: { room_name: set(session_ids) }
salas_socketio = {}


class NotificadorPedidos:
    """Gestor de notificaciones de pedidos en tiempo real"""

    @staticmethod
    def registrar_conexion(socketio, sid, usuario_id, rol, username):
        """
        Registra una nueva conexión WebSocket

        Args:
            socketio: Instancia de SocketIO
            sid: Session ID
            usuario_id: ID del usuario
            rol: Role del usuario (mesero, cocinero, cajero, manager)
            username: Nombre de usuario
        """
        conexiones_activas[sid] = {
            "usuario_id": usuario_id,
            "rol": rol,
            "username": username,
            "timestamp": datetime.now().isoformat(),
            "salas": set()
        }

    @staticmethod
    def desregistrar_conexion(sid):
        """Desregistra una conexión WebSocket cerrada"""
        if sid in conexiones_activas:
            del conexiones_activas[sid]

    @staticmethod
    def suscribir_a_sala(socketio, sid, sala):
        """
        Suscribe un usuario a una sala específica
        Salas: 'cocina', 'meseros', 'cajeros', 'pedido_<id>'

        Args:
            socketio: Instancia de SocketIO
            sid: Session ID
            sala: Nombre de la sala
        """
        if sid in conexiones_activas:
            conexiones_activas[sid]["salas"].add(sala)
            join_room(sala, sid=sid)

    @staticmethod
    def desuscribir_de_sala(socketio, sid, sala):
        """Desuscribe un usuario de una sala"""
        if sid in conexiones_activas:
            conexiones_activas[sid]["salas"].discard(sala)
            leave_room(sala, sid=sid)

    @staticmethod
    def notificar_nuevo_pedido(socketio, pedido):
        """
        Notifica a la cocina de un nuevo pedido

        Args:
            socketio: Instancia de SocketIO
            pedido: dict con datos del pedido {
                id, mesa_numero, mesa_id, items, tipo, cliente_nombre,
                mesero, subtotal, impuesto, total
            }
        """
        evento = {
            "tipo": "nuevo_pedido",
            "pedido": pedido,
            "timestamp": datetime.now().isoformat()
        }

        # Emitir a cocina en tiempo real (WebSocket)
        socketio.emit(
            "evento_pedido",
            evento,
            room="cocina",
            namespace="/"
        )

        # Guardar en cola para polling
        NotificadorPedidos._agregar_a_cola_eventos(evento, "cocina")

    @staticmethod
    def notificar_pedido_listo(socketio, pedido_id, items_listos):
        """
        Notifica que un pedido está listo

        Args:
            socketio: Instancia de SocketIO
            pedido_id: ID del pedido
            items_listos: list de items que están listos
        """
        evento = {
            "tipo": "pedido_listo",
            "pedido_id": pedido_id,
            "items_listos": items_listos,
            "timestamp": datetime.now().isoformat()
        }

        # Notificar a meseros
        socketio.emit(
            "evento_pedido",
            evento,
            room="meseros",
            namespace="/"
        )

        # Notificar al pedido específico (en caso de que esté en pantalla de cliente)
        socketio.emit(
            "evento_pedido",
            evento,
            room=f"pedido_{pedido_id}",
            namespace="/"
        )

        NotificadorPedidos._agregar_a_cola_eventos(evento, "meseros")

    @staticmethod
    def notificar_cambio_estado_pedido(socketio, pedido_id, nuevo_estado):
        """
        Notifica cambio de estado de un pedido

        Args:
            socketio: Instancia de SocketIO
            pedido_id: ID del pedido
            nuevo_estado: Nuevo estado (en_cocina, listo, servido, pagado, etc.)
        """
        evento = {
            "tipo": "cambio_estado",
            "pedido_id": pedido_id,
            "estado": nuevo_estado,
            "timestamp": datetime.now().isoformat()
        }

        # Notificar a todos interesados
        socketio.emit(
            "evento_pedido",
            evento,
            room=f"pedido_{pedido_id}",
            namespace="/"
        )

        # Emitir a cocina si es relevante
        if nuevo_estado in ["en_cocina", "pendiente"]:
            socketio.emit(
                "evento_pedido",
                evento,
                room="cocina",
                namespace="/"
            )

        # Emitir a meseros si es relevante
        if nuevo_estado in ["listo", "servido"]:
            socketio.emit(
                "evento_pedido",
                evento,
                room="meseros",
                namespace="/"
            )

        NotificadorPedidos._agregar_a_cola_eventos(evento, "general")

    @staticmethod
    def notificar_item_modificado(socketio, pedido_id, item_id, cambios):
        """
        Notifica que un item del pedido fue modificado

        Args:
            socketio: Instancia de SocketIO
            pedido_id: ID del pedido
            item_id: ID del item
            cambios: dict con cambios {cantidad_anterior, cantidad_nueva, etc.}
        """
        evento = {
            "tipo": "item_modificado",
            "pedido_id": pedido_id,
            "item_id": item_id,
            "cambios": cambios,
            "timestamp": datetime.now().isoformat()
        }

        # Notificar a cocina y meseros
        socketio.emit(
            "evento_pedido",
            evento,
            room="cocina",
            namespace="/"
        )
        socketio.emit(
            "evento_pedido",
            evento,
            room="meseros",
            namespace="/"
        )

        NotificadorPedidos._agregar_a_cola_eventos(evento, "general")

    @staticmethod
    def notificar_pedido_cancelado(socketio, pedido_id, razon):
        """Notifica que un pedido fue cancelado"""
        evento = {
            "tipo": "pedido_cancelado",
            "pedido_id": pedido_id,
            "razon": razon,
            "timestamp": datetime.now().isoformat()
        }

        socketio.emit(
            "evento_pedido",
            evento,
            room=f"pedido_{pedido_id}",
            namespace="/"
        )
        socketio.emit(
            "evento_pedido",
            evento,
            room="cocina",
            namespace="/"
        )

        NotificadorPedidos._agregar_a_cola_eventos(evento, "general")

    @staticmethod
    def notificar_stock_bajo(socketio, producto_id, nombre, stock_actual):
        """Notifica que el stock de un producto está bajo"""
        evento = {
            "tipo": "alerta_stock",
            "producto_id": producto_id,
            "nombre": nombre,
            "stock_actual": stock_actual,
            "timestamp": datetime.now().isoformat()
        }

        socketio.emit(
            "evento_alerta",
            evento,
            room="managers",
            namespace="/"
        )

        NotificadorPedidos._agregar_a_cola_eventos(evento, "managers")

    @staticmethod
    def _agregar_a_cola_eventos(evento, rol_destinatario):
        """
        Agrega un evento a la cola para clientes que usan polling

        Args:
            evento: dict con información del evento
            rol_destinatario: 'cocina', 'meseros', 'cajeros', 'managers' o 'general'
        """
        if rol_destinatario not in cola_eventos:
            cola_eventos[rol_destinatario] = []

        # Mantener un máximo de 100 eventos por cola
        if len(cola_eventos[rol_destinatario]) >= 100:
            cola_eventos[rol_destinatario].pop(0)

        cola_eventos[rol_destinatario].append(evento)

    @staticmethod
    def obtener_eventos_pendientes(rol):
        """
        Obtiene eventos pendientes para un rol (polling fallback)

        Args:
            rol: Rol del usuario (cocina, meseros, etc.)

        Returns:
            list: Eventos pendientes
        """
        eventos = cola_eventos.get(rol, []) + cola_eventos.get("general", [])

        # Limpiar eventos después de 5 minutos (timestamp check en frontend)
        ahora = datetime.now()
        eventos_validos = [
            e for e in eventos
            if (ahora - datetime.fromisoformat(e["timestamp"])).seconds < 300
        ]

        return eventos_validos

    @staticmethod
    def obtener_estado_conexiones():
        """Retorna información sobre conexiones activas (para debugging)"""
        return {
            "total_conexiones": len(conexiones_activas),
            "por_rol": {},
            "conexiones": [
                {
                    "sid": sid[:8] + "...",  # Mostrar solo primeros 8 chars
                    "usuario_id": conn["usuario_id"],
                    "rol": conn["rol"],
                    "username": conn["username"],
                    "salas": list(conn["salas"]),
                    "conectado_desde": conn["timestamp"]
                }
                for sid, conn in conexiones_activas.items()
            ]
        }


def registrar_socketio_handlers(socketio):
    """
    Registra los event handlers de SocketIO

    Args:
        socketio: Instancia de Flask-SocketIO
    """

    @socketio.on("conectar_usuario", namespace="/")
    def handle_conectar_usuario(data):
        """Handler cuando un usuario se conecta"""
        sid = request.sid
        usuario_id = data.get("usuario_id")
        rol = data.get("rol")
        username = data.get("username", "Usuario")

        # Registrar conexión
        NotificadorPedidos.registrar_conexion(
            socketio, sid, usuario_id, rol, username
        )

        # Suscribir a sala según su rol
        if rol == "cocinero":
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "cocina")
        elif rol == "mesero":
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "meseros")
        elif rol == "cajero":
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "cajeros")
        elif rol == "manager":
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "managers")
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "cocina")
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "meseros")
            NotificadorPedidos.suscribir_a_sala(socketio, sid, "cajeros")

        # Confirmar conexión
        emit("conexion_confirmada", {
            "mensaje": f"Bienvenido {username}",
            "rol": rol,
            "timestamp": datetime.now().isoformat()
        })

    @socketio.on("suscribir_pedido", namespace="/")
    def handle_suscribir_pedido(data):
        """Handler para suscribirse a actualizaciones de un pedido específico"""
        sid = request.sid
        pedido_id = data.get("pedido_id")

        NotificadorPedidos.suscribir_a_sala(
            socketio, sid, f"pedido_{pedido_id}"
        )

        emit("suscripcion_confirmada", {
            "pedido_id": pedido_id,
            "mensaje": f"Suscrito a actualizaciones del pedido {pedido_id}"
        })

    @socketio.on("desuscribir_pedido", namespace="/")
    def handle_desuscribir_pedido(data):
        """Handler para desuscribirse de actualizaciones de un pedido"""
        sid = request.sid
        pedido_id = data.get("pedido_id")

        NotificadorPedidos.desuscribir_de_sala(
            socketio, sid, f"pedido_{pedido_id}"
        )

        emit("desuscripcion_confirmada", {
            "pedido_id": pedido_id
        })

    @socketio.on("disconnect", namespace="/")
    def handle_disconnect():
        """Handler cuando un usuario se desconecta"""
        sid = request.sid
        NotificadorPedidos.desregistrar_conexion(sid)

    @socketio.on("ping", namespace="/")
    def handle_ping():
        """Handler para mantener viva la conexión"""
        emit("pong", {
            "timestamp": datetime.now().isoformat()
        })
