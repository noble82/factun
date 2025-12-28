/**
 * Utilidades compartidas para toda la aplicación
 * Incluir este archivo antes que otros scripts
 */

// ============ SEGURIDAD - Escape HTML para prevenir XSS ============

/**
 * Escapa caracteres HTML para prevenir inyección XSS
 * @param {string} unsafe - String sin escapar
 * @returns {string} String escapado seguro para insertar en HTML
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    if (typeof unsafe !== 'string') unsafe = String(unsafe);

    const htmlEntityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
    };

    return unsafe.replace(/[&<>"'\/]/g, char => htmlEntityMap[char]);
}

/**
 * Escapa un string para ser usado en atributos HTML (data-* attributes)
 * @param {string} value - Valor a escapar
 * @returns {string} Valor escapado seguro para atributos
 */
function escapeAttribute(value) {
    if (!value) return '';
    if (typeof value !== 'string') value = String(value);

    // Escapa quotes y caracteres peligrosos en atributos
    return value
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Crea un elemento seguro sin riesgo de XSS
 * @param {string} tagName - Nombre de la etiqueta
 * @param {object} attributes - Atributos del elemento
 * @param {string|HTMLElement} content - Contenido (text o elemento)
 * @returns {HTMLElement} Elemento creado
 */
function createSafeElement(tagName, attributes = {}, content = '') {
    const elem = document.createElement(tagName);

    // Aplicar atributos de forma segura
    for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith('on')) {
            // No permitir event handlers directos en atributos
            console.warn(`Atributo '${key}' no permitido por seguridad`);
            continue;
        }
        elem.setAttribute(key, escapeAttribute(String(value)));
    }

    // Aplicar contenido de forma segura
    if (content) {
        if (typeof content === 'string') {
            elem.textContent = content;  // textContent es seguro contra XSS
        } else if (content instanceof HTMLElement) {
            elem.appendChild(content);
        }
    }

    return elem;
}

// ============ AUTENTICACIÓN - Token Management ============

/**
 * Obtiene el token de autenticación del localStorage
 * @returns {string|null} Token si existe, null caso contrario
 */
function getAuthToken() {
    try {
        return localStorage.getItem('auth_token');
    } catch (e) {
        console.error('Error accediendo localStorage:', e);
        return null;
    }
}

/**
 * Obtiene el usuario actual del localStorage
 * @returns {object|null} Usuario si existe y es válido, null caso contrario
 */
function getUsuarioActual() {
    try {
        const userStr = localStorage.getItem('user');
        if (!userStr) return null;

        const user = JSON.parse(userStr);

        // Validar estructura mínima
        if (!user.id || !user.rol) {
            console.warn('Usuario almacenado tiene estructura inválida');
            return null;
        }

        return user;
    } catch (e) {
        console.error('Error parseando usuario:', e);
        return null;
    }
}

/**
 * Obtiene los headers de autenticación para API calls
 * @param {string} contentType - Content-Type del request
 * @returns {object} Headers con autenticación
 */
function getAuthHeaders(contentType = 'application/json') {
    const token = getAuthToken();
    const headers = {
        'Content-Type': contentType
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

/**
 * Guarda el token de autenticación de forma segura
 * @param {string} token - Token a guardar
 */
function saveAuthToken(token) {
    try {
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    } catch (e) {
        console.error('Error guardando token:', e);
    }
}

/**
 * Guarda el usuario actual de forma segura
 * @param {object} user - Usuario a guardar
 */
function saveUsuarioActual(user) {
    try {
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            localStorage.removeItem('user');
        }
    } catch (e) {
        console.error('Error guardando usuario:', e);
    }
}

/**
 * Limpia la sesión del usuario
 */
function limpiarSesion() {
    try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
    } catch (e) {
        console.error('Error limpiando sesión:', e);
    }
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

// ============ VALIDACIÓN - Client-side form validation ============

/**
 * Valida que un valor sea un número positivo
 * @param {any} value - Valor a validar
 * @param {number} min - Valor mínimo (default 0)
 * @param {number} max - Valor máximo (default sin límite)
 * @returns {boolean} True si es válido
 */
function validarNumeroPositivo(value, min = 0, max = null) {
    if (!value && value !== 0) return false;

    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (num < min) return false;
    if (max !== null && num > max) return false;

    return true;
}

/**
 * Valida que un valor sea un número entero
 * @param {any} value - Valor a validar
 * @returns {boolean} True si es válido
 */
function validarNumeroEntero(value) {
    if (!value && value !== 0) return false;

    const num = parseInt(value);
    if (isNaN(num)) return false;
    if (String(num) !== String(parseInt(value))) return false;

    return true;
}

/**
 * Valida que un email tenga formato válido
 * @param {string} email - Email a validar
 * @returns {boolean} True si es válido
 */
function validarEmail(email) {
    if (!email) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).trim());
}

/**
 * Valida que un teléfono tenga formato válido
 * @param {string} phone - Teléfono a validar
 * @returns {boolean} True si es válido
 */
function validarTelefono(phone) {
    if (!phone) return false;

    // Remover caracteres comunes de formateo
    const phoneClean = String(phone).replace(/[\s\-()]/g, '');

    // Verificar que sea solo dígitos y tenga entre 7 y 15 dígitos
    return /^\d{7,15}$/.test(phoneClean);
}

/**
 * Valida que un campo no esté vacío
 * @param {string} value - Valor a validar
 * @returns {boolean} True si no está vacío
 */
function validarRequerido(value) {
    return value && String(value).trim().length > 0;
}

/**
 * Obtiene el valor de un campo de forma segura
 * @param {string} elementId - ID del elemento
 * @returns {string} Valor del elemento o string vacío si no existe
 */
function getFormValue(elementId) {
    const elem = document.getElementById(elementId);
    return elem ? String(elem.value || '').trim() : '';
}

/**
 * Obtiene un valor numérico de forma segura
 * @param {string} elementId - ID del elemento
 * @returns {number|null} Valor numérico o null si inválido
 */
function getFormNumber(elementId) {
    const value = getFormValue(elementId);
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

/**
 * Limpia un formulario
 * @param {string|HTMLFormElement} formId - ID del formulario o elemento form
 */
function limpiarFormulario(formId) {
    const form = typeof formId === 'string'
        ? document.getElementById(formId)
        : formId;

    if (form) {
        form.reset();
    }
}

/**
 * Deshabilita un formulario (útil durante envío)
 * @param {string|HTMLFormElement} formId - ID del formulario o elemento form
 * @param {boolean} disabled - True para deshabilitar
 */
function deshabilitarFormulario(formId, disabled = true) {
    const form = typeof formId === 'string'
        ? document.getElementById(formId)
        : formId;

    if (!form) return;

    // Deshabilitar todos los inputs, selects, buttons
    form.querySelectorAll('input, select, textarea, button').forEach(elem => {
        elem.disabled = disabled;
    });
}
