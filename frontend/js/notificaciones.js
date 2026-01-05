/**
 * Sistema de Notificaciones en Tiempo Real
 * Soporta WebSocket (primario) y polling (fallback)
 *
 * Uso:
 *   const notif = new ClienteNotificaciones({ rol: 'cocinero' });
 *   notif.conectar();
 *   notif.on('evento_pedido', (datos) => { ... });
 */

class ClienteNotificaciones {
    constructor(opciones = {}) {
        this.rol = opciones.rol || 'mesero';
        this.usuario_id = opciones.usuario_id || null;
        this.username = opciones.username || 'Usuario';

        this.socket = null;
        this.websocketActivo = false;
        this.pollingActivo = false;
        // Polling solo como fallback - intervalo más largo para evitar saturación
        this.intervaloPolling = opciones.intervaloPolling || 30000; // 30 segundos (antes 3s)
        this.idIntervalo = null;

        // Event handlers
        this.handlers = {
            'evento_pedido': [],
            'evento_alerta': [],
            'conexion_confirmada': [],
            'error': []
        };

        this.debug = opciones.debug || false;
    }

    /**
     * Conecta usando WebSocket si está disponible, sino fallback a polling
     */
    conectar() {
        this.log('Iniciando conexión...');

        // Intentar conectar con WebSocket primero
        if (this._soportaWebSocket()) {
            this._conectarWebSocket();
        } else {
            this.log('WebSocket no disponible, usando polling');
            this._iniciarPolling();
        }
    }

    /**
     * Desconecta y limpia recursos
     */
    desconectar() {
        this.log('Desconectando...');

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.websocketActivo = false;
        }

        if (this.idIntervalo) {
            clearInterval(this.idIntervalo);
            this.idIntervalo = null;
            this.pollingActivo = false;
        }
    }

    /**
     * Registra un handler para un tipo de evento
     */
    on(tipo_evento, callback) {
        if (!this.handlers[tipo_evento]) {
            this.handlers[tipo_evento] = [];
        }
        this.handlers[tipo_evento].push(callback);
        this.log(`Handler registrado para: ${tipo_evento}`);
    }

    /**
     * Desregistra un handler
     */
    off(tipo_evento, callback) {
        if (this.handlers[tipo_evento]) {
            const idx = this.handlers[tipo_evento].indexOf(callback);
            if (idx > -1) {
                this.handlers[tipo_evento].splice(idx, 1);
            }
        }
    }

    /**
     * Suscribirse a actualizaciones de un pedido específico
     */
    suscribirPedido(pedido_id) {
        if (this.websocketActivo && this.socket) {
            this.socket.emit('suscribir_pedido', { pedido_id });
            this.log(`Suscrito a pedido: ${pedido_id}`);
        } else {
            this.log(`No se puede suscribir a pedido sin WebSocket activo`);
        }
    }

    /**
     * Desuscribirse de actualizaciones de un pedido
     */
    desuscribirPedido(pedido_id) {
        if (this.websocketActivo && this.socket) {
            this.socket.emit('desuscribir_pedido', { pedido_id });
            this.log(`Desuscrito de pedido: ${pedido_id}`);
        }
    }

    /**
     * Obtiene el estado actual de la conexión
     */
    getEstado() {
        return {
            websocket_activo: this.websocketActivo,
            polling_activo: this.pollingActivo,
            rol: this.rol,
            usuario_id: this.usuario_id
        };
    }

    // ==================== MÉTODOS PRIVADOS ====================

    /**
     * Verifica si el navegador soporta WebSocket
     */
    _soportaWebSocket() {
        if (typeof window === 'undefined') return false;
        return 'WebSocket' in window || 'MozWebSocket' in window;
    }

    /**
     * Conecta usando WebSocket
     */
    _conectarWebSocket() {
        try {
            // Usar Socket.IO si está disponible (incluido en la página)
            if (typeof io !== 'undefined') {
                this.log('Conectando con Socket.IO...');

                this.socket = io('/', {
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: 10,
                    transports: ['websocket', 'polling'] // Socket.IO manejapolling como fallback
                });

                this._configurarHandlersSocket();
                this.websocketActivo = true;

                // Si fallamos con WebSocket, activar polling como respaldo
                this.socket.on('connect_error', () => {
                    if (!this.pollingActivo) {
                        this.log('Error en WebSocket, iniciando polling...');
                        this._iniciarPolling();
                    }
                });
            } else {
                this.log('Socket.IO no disponible, usando polling');
                this._iniciarPolling();
            }
        } catch (err) {
            this.log(`Error al conectar WebSocket: ${err.message}`, 'error');
            this._iniciarPolling();
        }
    }

    /**
     * Configura los handlers de Socket.IO
     */
    _configurarHandlersSocket() {
        this.socket.on('connect', () => {
            this.log('Conectado a servidor WebSocket');
            this.websocketActivo = true;

            // ===== DETENER POLLING SI ESTABA ACTIVO =====
            if (this.pollingActivo && this.idIntervalo) {
                clearInterval(this.idIntervalo);
                this.idIntervalo = null;
                this.pollingActivo = false;
                this.log('Polling detenido - WebSocket activo');
            }

            // Enviar información del usuario
            this.socket.emit('conectar_usuario', {
                usuario_id: this.usuario_id,
                rol: this.rol,
                username: this.username
            });
        });

        this.socket.on('conexion_confirmada', (datos) => {
            this.log('Conexión confirmada por servidor');
            this._ejecutarHandlers('conexion_confirmada', datos);
        });

        this.socket.on('evento_pedido', (evento) => {
            this.log(`Evento recibido: ${evento.tipo}`);
            this._ejecutarHandlers('evento_pedido', evento);
        });

        this.socket.on('evento_alerta', (evento) => {
            this.log(`Alerta recibida: ${evento.tipo}`);
            this._ejecutarHandlers('evento_alerta', evento);
        });

        this.socket.on('disconnect', () => {
            this.log('Desconectado del servidor WebSocket');
            this.websocketActivo = false;

            // Intentar reconectar automáticamente
            if (!this.pollingActivo) {
                this._iniciarPolling();
            }
        });

        this.socket.on('error', (error) => {
            this.log(`Error en Socket.IO: ${error}`, 'error');
            this._ejecutarHandlers('error', { mensaje: error });
        });

        this.socket.on('pong', (datos) => {
            this.log('Pong recibido (keep-alive)');
        });

        // Keep-alive: enviar ping cada 30 segundos
        setInterval(() => {
            if (this.websocketActivo && this.socket) {
                this.socket.emit('ping');
            }
        }, 30000);
    }

    /**
     * Inicia el sistema de polling como fallback
     */
    _iniciarPolling() {
        if (this.pollingActivo) return;

        this.log(`Iniciando polling cada ${this.intervaloPolling}ms`);
        this.pollingActivo = true;

        // Obtener eventos iniciales
        this._obtenerEventosPolling();

        // Configurar polling periódico
        this.idIntervalo = setInterval(() => {
            this._obtenerEventosPolling();
        }, this.intervaloPolling);
    }

    /**
     * Obtiene eventos mediante polling (HTTP GET)
     */
    _obtenerEventosPolling() {
        fetch(`/api/notificaciones/polling/${this.rol}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        })
            .then(response => {
                if (response.status === 401) {
                    this.log('No autorizado para recibir notificaciones', 'error');
                    this.desconectar();
                    return;
                }
                return response.json();
            })
            .then(datos => {
                if (datos && datos.eventos && datos.eventos.length > 0) {
                    this.log(`${datos.eventos.length} evento(s) recibido(s) por polling`);
                    datos.eventos.forEach(evento => {
                        this._procesarEvento(evento);
                    });
                }
            })
            .catch(err => {
                this.log(`Error en polling: ${err.message}`, 'error');
            });
    }

    /**
     * Procesa un evento recibido
     */
    _procesarEvento(evento) {
        const tipo = evento.tipo;

        if (tipo === 'nuevo_pedido' || tipo === 'cambio_estado' ||
            tipo === 'item_modificado' || tipo === 'pedido_listo' ||
            tipo === 'pedido_cancelado') {
            this._ejecutarHandlers('evento_pedido', evento);
        } else if (tipo === 'alerta_stock') {
            this._ejecutarHandlers('evento_alerta', evento);
        }
    }

    /**
     * Ejecuta los handlers registrados para un tipo de evento
     */
    _ejecutarHandlers(tipo, datos) {
        if (this.handlers[tipo]) {
            this.handlers[tipo].forEach(callback => {
                try {
                    callback(datos);
                } catch (err) {
                    this.log(`Error en handler de ${tipo}: ${err.message}`, 'error');
                }
            });
        }
    }

    /**
     * Log con prefijo para debugging
     */
    log(mensaje, nivel = 'info') {
        if (!this.debug && nivel === 'info') return;

        const prefijo = `[Notificaciones-${this.rol}]`;
        console.log(`${prefijo} ${mensaje}`);
    }
}

// Exportar para módulos (si es necesario)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClienteNotificaciones;
}
