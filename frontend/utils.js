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
function window.escapeHtml(unsafe) {
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

    return unsafe.replace(/[&<>"'/]/g, char => htmlEntityMap[char]);
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
        sessionStorage.removeItem('csrf_token');
    } catch (e) {
        console.error('Error limpiando sesión:', e);
    }
}

// ============ CSRF PROTECTION ============

/**
 * Obtiene el token CSRF almacenado en sesión.
 * @returns {string|null} Token CSRF si existe, null caso contrario.
 */
function getCsrfToken() {
    try {
        // Asegurarse de que la clave 'csrf_token' es la que se usa consistentemente.
        return sessionStorage.getItem('csrf_token');
    } catch (e) {
        console.error('Error accediendo CSRF token desde sessionStorage:', e);
        return null;
    }
}

/**
 * Guarda el token CSRF de forma segura en sessionStorage.
 * @param {string} token - Token CSRF a guardar.
 */
function saveCsrfToken(token) {
    try {
        if (token) {
            sessionStorage.setItem('csrf_token', token);
            console.log('CSRF token guardado:', token.substring(0, 10) + '...'); // Log de confirmación (parcial para seguridad)
        } else {
            sessionStorage.removeItem('csrf_token');
            console.log('CSRF token removido de sessionStorage.');
        }
    } catch (e) {
        console.error('Error guardando CSRF token en sessionStorage:', e);
    }
}

/**
 * Obtiene headers con autenticación y CSRF token.
 * @param {string} contentType - Content-Type del request.
 * @param {string|null} explicitCsrfToken - CSRF token a usar, si está disponible. Esto permite a apiFetch pasar el token fresco leído justo antes de construir cabeceras.
 * @returns {object} Headers con autenticación y CSRF.
 */
function getSecureHeaders(contentType = 'application/json', explicitCsrfToken = null) {
    const token = getAuthToken();
    // Si se pasa un token explícito, usarlo; de lo contrario, leer de sessionStorage.
    const csrfToken = explicitCsrfToken !== null ? explicitCsrfToken : getCsrfToken(); 
    
    const headers = {
        'Content-Type': contentType || 'application/json' // Asegurar siempre un Content-Type
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken; // La cabecera clave para CSRF
    } else {
        // Si no hay token CSRF explícito o leído de sessionStorage, nos aseguramos de no incluir una cabecera vacía.
        delete headers['X-CSRF-Token'];
    }

    return headers;
}

/**
 * Actualiza el CSRF token desde la respuesta (header o body).
 * Ejecuta la actualización de forma asíncrona. La respuesta de apiFetch se
 * devuelve inmediatamente, mientras que esta función trabaja en segundo plano.
 * @param {Response} response - Respuesta del apiFetch.
 */
async function updateCsrfTokenFromResponse(response) {
    // --- Priorizar token del Header ---
    const tokenFromHeader = response.headers.get('X-CSRF-Token');
    if (tokenFromHeader) {
        saveCsrfToken(tokenFromHeader);
        console.log('CSRF token actualizado desde el header de respuesta.');
        return; // Si se obtuvo del header, no es necesario procesar el body para el token CSRF.
    }

    // --- Intentar obtener token del body si es JSON y no se obtuvo del header ---
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
        try {
            // Usamos clone() para poder leer el body. Usamos await para parsear el JSON.
            const data = await response.clone().json();
            if (data && data._csrf_token) { // Verificar que data existe y tiene _csrf_token
                saveCsrfToken(data._csrf_token);
                console.log('CSRF token actualizado desde el body de respuesta JSON.');
            }
        } catch (e) {
            // Solo loguear el error, no lanzar, para no interrumpir el flujo principal de apiFetch.
            console.warn('Error al intentar obtener CSRF token del body JSON:', e);
        }
    }
}

/**
 * Wrapper para apiFetch que automáticamente incluye autenticación y CSRF tokens.
 * Maneja errores y redirige en caso de 401.
 * @param {string} url - URL del endpoint.
 * @param {object} options - Opciones de apiFetch (method, body, etc.).
 * @returns {Promise<Response|null>} Respuesta del apiFetch o null si hubo un error manejado.
 */
async function apiFetch(url, options = {}) {
    // 1. Obtener el token CSRF FRESCO justo antes de construir las cabeceras.
    const csrfToken = getCsrfToken();
    console.log(`apiFetch: Token CSRF leído de sessionStorage justo antes de construir cabeceras: ${csrfToken ? 'YES' : 'NO'}`);

    // 2. Obtener las cabeceras seguras base (Auth y CSRF)
    const contentType = options.headers?.['Content-Type'] || 'application/json';
    // Pasar el token CSRF fresco explícitamente a getSecureHeaders
    const defaultSecureHeaders = getSecureHeaders(contentType, csrfToken); 

    // 3. Construir las cabeceras finales:
    //    - Combinar las cabeceras del usuario (options.headers) con las seguras.
    //    - Priorizar las cabeceras seguras ('X-CSRF-Token', 'Authorization') para evitar que sean sobrescritas incorrectamente.
    const finalHeaders = {
        ...(options.headers || {}), // Empieza con las cabeceras del usuario
    };

    // Asegurar que las cabeceras críticas de seguridad se incluyan y tengan prioridad.
    if (defaultSecureHeaders['X-CSRF-Token']) {
        finalHeaders['X-CSRF-Token'] = defaultSecureHeaders['X-CSRF-Token'];
        console.log(`apiFetch: Añadiendo X-CSRF-Token: ${finalHeaders['X-CSRF-Token'].substring(0, 10)}...`);
    } else {
        // Si no hay token CSRF, nos aseguramos de que no haya uno vacío si el usuario intentó ponerlo.
        delete finalHeaders['X-CSRF-Token'];
        console.log('apiFetch: No se añadió X-CSRF-Token (ninguno disponible o vacío).');
    }

    if (defaultSecureHeaders['Authorization']) {
        finalHeaders['Authorization'] = defaultSecureHeaders['Authorization'];
    } else {
        delete finalHeaders['Authorization'];
    }
    
    // Asegurar Content-Type si no está definido y se envía body
    if (!finalHeaders['Content-Type'] && options.body) {
        finalHeaders['Content-Type'] = 'application/json';
    }

    const mergedOptions = {
        ...options,
        headers: finalHeaders, // Usar las cabeceras finales construidas
    };

    try {
        console.log(`apiFetch: Realizando petición a ${url} con método ${mergedOptions.method || 'GET'}`);
        // Ejecutar la petición apiFetch
        const response = await apiFetch(url, mergedOptions);

        // --- Actualización Asíncrona del Token CSRF ---
        // Esta función se ejecuta en segundo plano para actualizar el token
        // para la SIGUIENTE petición. apiFetch retorna la respuesta principal
        // de inmediato.
        updateCsrfTokenFromResponse(response);
        // --------------------------------------------

        // Manejo de 401 Unauthorized: Token de autenticación expirado
        if (response.status === 401) {
            console.warn('Autenticación expirada. Redirigiendo a login.');
            limpiarSesion(); // Limpiar tokens y sesión del usuario
            window.location.href = '/login.html'; // Redirigir a la página de login
            return null; // Detener procesamiento
        }

        // Manejo de otros errores HTTP (ej. 400, 403 CSRF missing, 500)
        if (!response.ok) {
            let errorDetails = { message: `HTTP error ${response.status}` };
            try {
                // Intentar obtener detalles del error del body JSON
                const errorData = await response.clone().json();
                // Combinar detalles del error si existen en el cuerpo de la respuesta
                errorDetails = { ...errorDetails, ...(typeof errorData === 'object' ? errorData : { message: errorData }) };
            } catch { /* Ignorar si no es JSON o falla el parseo */ }
            console.error(`API Error (${url}):`, errorDetails);
            // Mostrar notificación al usuario
            mostrarNotificacion(
                'Error en API',
                errorDetails.message || errorDetails.error || `Error ${response.status}`,
                'danger'
            );
            return null; // Devolver null para indicar fallo
        }

        // Si la respuesta es OK, devolver la respuesta para que el llamador la procese
        console.log(`apiFetch: Petición a ${url} exitosa (status ${response.status}).`);
        return response;

    } catch (error) {
        // Capturar errores de red o de la propia llamada apiFetch()
        console.error(`Error en apiFetch(${url}):`, error);
        mostrarNotificacion('Error de conexión', error.message || 'No se pudo conectar al servidor.', 'danger');
        throw error; // Relanzar el error para que el código superior sepa que algo falló gravemente
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
        alert(`${titulo}\\n${mensaje}`);
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
                ${titulo ? `<strong>${window.escapeHtml(titulo)}</strong>` : ''}
                ${titulo && mensaje ? '<br>' : ''}
                ${mensaje ? window.escapeHtml(mensaje) : ''}
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
     * @param {object} options - Opciones de apiFetch (method, body, etc)
     * @returns {object} Respuesta JSON o null si error
     */
    try {
        const response = await apiFetch(endpoint, {
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
    const phoneClean = String(phone).replace(/[\s-()]/g, '');

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

// ============ CONSTANTES Y CONFIGURACIÓN ============

/**
 * Constantes para rates, timings y configuración general
 */
const CONFIG = {
    // Tasas fiscales
    IVA_RATE: 0.13,  // 13% IVA El Salvador

    // Polling intervals (ms)
    POLLING_INTERVALS: {
        MESERO: 5000,      // Update mesas and orders
        CAJERO: 5000,      // Update orders and stats
        REPORTS: 5000,     // Update sales reports
        COCINA: 3000,      // Faster kitchen updates
        CLOCK: 1000,       // Real-time clock
        DEBOUNCE: 300      // Search debounce
    },

    // Colors for status badges
    ESTADO_COLORES: {
        'borrador': 'bg-secondary',
        'enviada': 'bg-primary',
        'parcial': 'bg-warning',
        'recibida': 'bg-success',
        'cancelada': 'bg-danger',
        'pagado': 'bg-success',
        'pendiente_pago': 'bg-warning',
        'credito': 'bg-info',
        'cerrado': 'bg-success',
        'servido': 'bg-info',
        'listo': 'bg-success',
        'en_cocina': 'bg-warning'
    },

    // Validation rules
    VALIDATION: {
        MIN_PASSWORD_LENGTH: 8,
        MAX_SEARCH_LENGTH: 100,
        MIN_SEARCH_LENGTH: 2
    }
};

// ============ OPTIMIZACIÓN - Consolidación de Funciones ============

/**
 * Renderiza una lista genérica de items
 * @param {HTMLElement|string} container - Contenedor o su ID
 * @param {Array} items - Items a renderizar
 * @param {Function} template - Función que retorna HTML para cada item
 * @param {string} emptyMsg - Mensaje cuando no hay items
 */
function renderItems(container, items, template, emptyMsg = 'No hay datos') {
    const elem = typeof container === 'string'
        ? document.getElementById(container)
        : container;

    if (!elem) return;

    if (!items || items.length === 0) {
        elem.innerHTML = `<div class="alert alert-info">${window.escapeHtml(emptyMsg)}</div>`;
        return;
    }

    elem.innerHTML = items.map(item => template(item)).join('');
}

/**
 * Factory para crear funciones de búsqueda con debounce
 * @param {Function} searchFn - Función que realiza la búsqueda
 * @param {number} debounceMs - Millisegundos de debounce
 * @returns {Function} Función de búsqueda con debounce
 */
function createDebouncedFunction(searchFn, debounceMs = CONFIG.POLLING_INTERVALS.DEBOUNCE) {
    let timeout = null;

    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            searchFn(...args);
        }, debounceMs);
    };
}

/**
 * Muestra o esconde un modal Bootstrap de forma segura
 * @param {string} modalId - ID del modal
 * @param {boolean} show - True para mostrar, false para esconder
 */
function toggleModal(modalId, show = true) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
        console.warn(`Modal ${modalId} not found`);
        return null;
    }

    try {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if (show) {
            modal.show();
        } else {
            modal.hide();
        }
        return modal;
    } catch (error) {
        console.error(`Error toggling modal ${modalId}:`, error);
        return null;
    }
}

/**
 * Calcula el IVA basado en un subtotal
 * @param {number} subtotal - Subtotal sin IVA
 * @param {number} rate - Tasa IVA (default 0.13)
 * @returns {number} Monto de IVA
 */
function calculateIVA(subtotal, rate = CONFIG.IVA_RATE) {
    if (!validarNumeroPositivo(subtotal)) return 0;
    return parseFloat((subtotal * rate).toFixed(2));
}

/**
 * Calcula el total incluyendo IVA
 * @param {number} subtotal - Subtotal
 * @param {boolean} includeIVA - Si incluir IVA
 * @returns {number} Total con IVA si aplica
 */
function calculateTotal(subtotal, includeIVA = false) {
    if (!validarNumeroPositivo(subtotal)) return 0;

    if (!includeIVA) return parseFloat(subtotal).toFixed(2);

    const iva = calculateIVA(subtotal);
    return parseFloat((subtotal + iva).toFixed(2));
}

/**
 * Obtiene la clase de color para un estado
 * @param {string} estado - Estado a colorear
 * @returns {string} Clase Bootstrap de color
 */
function getEstadoColor(estado) {
    return CONFIG.ESTADO_COLORES[estado] || 'bg-secondary';
}

/**
 * Limpia listeners y timers cuando cambia de rol
 * Evita memory leaks y comportamiento duplicado
 */
function limpiarListeners() {
    // Limpiar todos los timeouts pendientes
    let maxTimeout = setTimeout(() => {}, 0);
    for (let i = 1; i <= maxTimeout; i++) {
        clearTimeout(i);
    }
}

/**
 * Obtiene el texto de un elemento de forma segura
 * @param {string} elementId - ID del elemento
 * @returns {string} Texto limpio del elemento
 */
function getElementText(elementId) {
    const elem = document.getElementById(elementId);
    return elem ? elem.textContent.trim() : '';
}

/**
 * Establece el texto de un elemento de forma segura (contra XSS)
 * @param {string} elementId - ID del elemento
 * @param {string} text - Texto a establecer
 */
function setElementText(elementId, text) {
    const elem = document.getElementById(elementId);
    if (elem) {
        elem.textContent = text;  // textContent es seguro contra XSS
    }
}

/**
 * Realiza una acción después de que se completa una transición CSS
 * Útil para esperar a que se cierre un modal antes de recargar datos
 * @param {HTMLElement} element - Elemento con transición
 * @param {Function} callback - Función a ejecutar después
 */
function afterTransition(element, callback) {
    if (!element) {
        callback();
        return;
    }

    const handler = () => {
        element.removeEventListener('transitionend', handler);
        callback();
    };

    element.addEventListener('transitionend', handler);
}

// ============ EXPOSICIÓN GLOBAL DE FUNCIONES DE UTILIDAD ============
// Esto asegura que las funciones definidas en utils.js estén disponibles
// globalmente para otros scripts que se carguen después.
window.escapeHtml = escapeHtml;
window.escapeAttribute = escapeAttribute;
window.createSafeElement = createSafeElement;
window.getAuthToken = getAuthToken;
window.getUsuarioActual = getUsuarioActual;
window.getAuthHeaders = getAuthHeaders;
window.saveAuthToken = saveAuthToken;
window.saveUsuarioActual = saveUsuarioActual;
window.limpiarSesion = limpiarSesion;
window.getCsrfToken = getCsrfToken;
window.saveCsrfToken = saveCsrfToken;
window.getSecureHeaders = getSecureHeaders;
window.updateCsrfTokenFromResponse = updateCsrfTokenFromResponse;
window.apiFetch = apiFetch;
window.mostrarNotificacion = mostrarNotificacion;
window.apiCall = apiCall;
window.formatDateTime = formatDateTime;
window.formatCurrency = formatCurrency;
window.ocultarElemento = ocultarElemento;
window.mostrarElemento = mostrarElemento;
window.toggleElemento = toggleElemento;
window.validarNumeroPositivo = validarNumeroPositivo;
window.validarNumeroEntero = validarNumeroEntero;
window.validarEmail = validarEmail;
window.validarTelefono = validarTelefono;
window.validarRequerido = validarRequerido;
window.getFormValue = getFormValue;
window.getFormNumber = getFormNumber;
window.limpiarFormulario = limpiarFormulario;
window.deshabilitarFormulario = deshabilitarFormulario;
window.renderItems = renderItems;
window.createDebouncedFunction = createDebouncedFunction;
window.toggleModal = toggleModal;
window.calculateIVA = calculateIVA;
window.calculateTotal = calculateTotal;
window.getEstadoColor = getEstadoColor;
window.limpiarListeners = limpiarListeners;
window.getElementText = getElementText;
window.setElementText = setElementText;
window.afterTransition = afterTransition;