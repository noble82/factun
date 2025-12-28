/**
 * Utilidades compartidas para toda la aplicación
 * Incluir este archivo antes que otros scripts
 */

// ============ SEGURIDAD - Escape HTML para prevenir XSS ============
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============ AUTENTICACIÓN - Token Management ============
function getAuthToken() {
    return localStorage.getItem('auth_token');
}

function getUsuarioActual() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

function getAuthHeaders(contentType = 'application/json') {
    const token = getAuthToken();
    return {
        'Content-Type': contentType,
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// ============ NOTIFICACIONES - Toast/Alert Handler ============
function mostrarNotificacion(titulo, mensaje, tipo = 'info') {
    /**
     * Muestra una notificación visual al usuario
     *
     * @param {string} titulo - Título de la notificación
     * @param {string} mensaje - Mensaje a mostrar
     * @param {string} tipo - Tipo: 'info', 'success', 'warning', 'danger'
     */
    const container = document.getElementById('notificaciones-container');

    if (!container) {
        // Fallback a alert si no existe el contenedor
        alert(`${titulo}\n${mensaje}`);
        return;
    }

    // Mapeo de tipos Bootstrap
    const tiposBootstrap = {
        'info': 'alert-info',
        'success': 'alert-success',
        'warning': 'alert-warning',
        'danger': 'alert-danger'
    };

    const clase = tiposBootstrap[tipo] || 'alert-info';
    const iconMap = {
        'info': 'info-circle',
        'success': 'check-circle',
        'warning': 'exclamation-circle',
        'danger': 'x-circle'
    };
    const icon = iconMap[tipo] || 'info-circle';

    const html = `
        <div class="alert ${clase} alert-dismissible fade show d-flex align-items-start" role="alert" style="max-width: 500px; word-wrap: break-word;">
            <i class="bi bi-${icon} me-2" style="margin-top: 3px;"></i>
            <div>
                ${titulo ? `<strong>${escapeHtml(titulo)}</strong>` : ''}
                ${titulo && mensaje ? '<br>' : ''}
                ${mensaje ? escapeHtml(mensaje) : ''}
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = html;
    container.appendChild(alertDiv.firstElementChild);

    // Auto-remover después de 5 segundos
    setTimeout(() => {
        const alerts = container.querySelectorAll('.alert');
        if (alerts.length > 0) {
            const lastAlert = alerts[alerts.length - 1];
            const bsAlert = new bootstrap.Alert(lastAlert);
            bsAlert.close();
        }
    }, 5000);
}

// ============ API CALLS - Wrapper con error handling ============
async function apiCall(endpoint, options = {}) {
    /**
     * Realiza una llamada a API con manejo de errores
     *
     * @param {string} endpoint - URL del endpoint (ej: '/api/pos/productos')
     * @param {object} options - Opciones de fetch (method, body, etc)
     * @returns {object} Respuesta JSON o null si error
     */
    try {
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                ...getAuthHeaders(),
                ...(options.headers || {})
            }
        });

        // Manejar 401 Unauthorized
        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return null;
        }

        // Manejar otros errores HTTP
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
            mostrarNotificacion(
                'Error en API',
                error.message || error.error || `Error ${response.status}`,
                'danger'
            );
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        mostrarNotificacion('Error de conexión', error.message, 'danger');
        return null;
    }
}

// ============ FORMATO DE DATOS ============
function formatDateTime(dateString) {
    /**
     * Formatea fecha y hora a formato local
     */
    if (!dateString) return '--:--';

    try {
        const date = new Date(dateString);
        return date.toLocaleString('es-SV', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return dateString;
    }
}

function formatCurrency(amount) {
    /**
     * Formatea cantidad como moneda ($)
     */
    return `$${parseFloat(amount).toFixed(2)}`;
}

// ============ UTILIDADES DE DOM ============
function ocultarElemento(id) {
    const elem = document.getElementById(id);
    if (elem) elem.classList.add('d-none');
}

function mostrarElemento(id) {
    const elem = document.getElementById(id);
    if (elem) elem.classList.remove('d-none');
}

function toggleElemento(id) {
    const elem = document.getElementById(id);
    if (elem) elem.classList.toggle('d-none');
}
