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

    return unsafe.replace(/[&<>"'/]/g, function(char) {
        return htmlEntityMap[char];
    });
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
function createSafeElement(tagName, attributes, content) {
    if (!attributes) attributes = {};
    if (!content) content = '';

    const elem = document.createElement(tagName);

    // Aplicar atributos de forma segura
    for (var key in attributes) {
        if (attributes.hasOwnProperty(key)) {
            if (key.indexOf('on') === 0) {
                // No permitir event handlers directos en atributos
                console.warn('Atributo \'' + key + '\' no permitido por seguridad');
                continue;
            }
            elem.setAttribute(key, escapeAttribute(String(attributes[key])));
        }
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
        var userStr = localStorage.getItem('user');
        if (!userStr) return null;

        var user = JSON.parse(userStr);

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
function getAuthHeaders(contentType) {
    if (!contentType) contentType = 'application/json';
    var token = getAuthToken();
    var headers = {
        'Content-Type': contentType
    };

    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
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
            console.log('CSRF token guardado:', token.substring(0, 10) + '...');
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
 * @param {string|null} explicitCsrfToken - CSRF token a usar, si está disponible.
 * @returns {object} Headers con autenticación y CSRF.
 */
function getSecureHeaders(contentType, explicitCsrfToken) {
    if (!contentType) contentType = 'application/json';
    var token = getAuthToken();
    // Si se pasa un token explícito, usarlo; de lo contrario, leer de sessionStorage.
    var csrfToken = explicitCsrfToken !== null ? explicitCsrfToken : getCsrfToken();
    
    var headers = {
        'Content-Type': contentType
    };

    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }

    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    } else {
        delete headers['X-CSRF-Token'];
    }

    return headers;
}

/**
 * Actualiza el CSRF token desde la respuesta (header o body).
 * @param {Response} response - Respuesta del fetch.
 */
function updateCsrfTokenFromResponse(response) {
    // --- Priorizar token del Header ---
    var tokenFromHeader = response.headers.get('X-CSRF-Token');
    if (tokenFromHeader) {
        saveCsrfToken(tokenFromHeader);
        console.log('CSRF token actualizado desde el header de respuesta.');
        return;
    }

    // --- Intentar obtener token del body si es JSON ---
    var contentType = response.headers.get('content-type');
    if (contentType && contentType.indexOf('application/json') !== -1) {
        response.clone().json().then(function(data) {
            if (data && data._csrf_token) {
                saveCsrfToken(data._csrf_token);
                console.log('CSRF token actualizado desde el body de respuesta JSON.');
            }
        }).catch(function(e) {
            console.warn('Error al intentar obtener CSRF token del body JSON:', e);
        });
    }
}

/**
 * Wrapper para fetch que automáticamente incluye autenticación y CSRF tokens.
 * Maneja errores y redirige en caso de 401.
 * @param {string} url - URL del endpoint.
 * @param {object} options - Opciones de fetch (method, body, etc.).
 * @returns {Promise<Response|null>} Respuesta del fetch o null si hubo un error manejado.
 */
function apiFetch(url, options) {
    if (!options) options = {};

    // 1. Obtener el token CSRF FRESCO justo antes de construir las cabeceras.
    var csrfToken = getCsrfToken();
    console.log('apiFetch: Token CSRF leído de sessionStorage justo antes de construir cabeceras: ' + (csrfToken ? 'YES' : 'NO'));

    // 2. Obtener las cabeceras seguras base (Auth y CSRF)
    var contentType = (options.headers && options.headers['Content-Type']) || 'application/json';
    // Pasar el token CSRF fresco explícitamente a getSecureHeaders
    var defaultSecureHeaders = getSecureHeaders(contentType, csrfToken);

    // 3. Construir las cabeceras finales
    var finalHeaders = {};
    if (options.headers) {
        for (var key in options.headers) {
            if (options.headers.hasOwnProperty(key)) {
                finalHeaders[key] = options.headers[key];
            }
        }
    }

    // Asegurar que las cabeceras críticas de seguridad se incluyan y tengan prioridad.
    if (defaultSecureHeaders['X-CSRF-Token']) {
        finalHeaders['X-CSRF-Token'] = defaultSecureHeaders['X-CSRF-Token'];
        console.log('apiFetch: Añadiendo X-CSRF-Token: ' + finalHeaders['X-CSRF-Token'].substring(0, 10) + '...');
    } else {
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

    var mergedOptions = {
        method: options.method || 'GET',
        headers: finalHeaders
    };

    if (options.body) mergedOptions.body = options.body;
    if (options.credentials) mergedOptions.credentials = options.credentials;

    try {
        console.log('apiFetch: Realizando petición a ' + url + ' con método ' + (mergedOptions.method || 'GET'));
        // ✅ Garantizado: usa fetch, no apiFetch
        return fetch(url, mergedOptions).then(function(response) {
            // --- Actualización Asíncrona del Token CSRF ---
            updateCsrfTokenFromResponse(response);

            // Manejo de 401 Unauthorized
            if (response.status === 401) {
                console.warn('Autenticación expirada. Redirigiendo a login.');
                limpiarSesion();
                window.location.href = '/login.html';
                return null;
            }

            // Manejo de otros errores HTTP
            if (!response.ok) {
                var errorDetails = { message: 'HTTP error ' + response.status };
                return response.clone().json().catch(function() {
                    return errorDetails;
                }).then(function(errorData) {
                    if (typeof errorData === 'object' && errorData !== null) {
                        errorDetails = Object.assign(errorDetails, errorData);
                    }
                    console.error('API Error (' + url + '):', errorDetails);
                    mostrarNotificacion(
                        'Error en API',
                        errorDetails.message || errorDetails.error || 'Error ' + response.status,
                        'danger'
                    );
                    return null;
                });
            }

            console.log('apiFetch: Petición a ' + url + ' exitosa (status ' + response.status + ').');
            return response;
        });
    } catch (error) {
        console.error('Error en apiFetch(' + url + '):', error);
        mostrarNotificacion('Error de conexión', error.message || 'No se pudo conectar al servidor.', 'danger');
        return Promise.reject(error);
    }
}

// ============ NOTIFICACIONES - Toast/Alert Handler ============
function mostrarNotificacion(titulo, mensaje, tipo) {
    if (!tipo) tipo = 'info';

    var container = document.getElementById('notificaciones-container');

    if (!container) {
        alert((titulo || '') + (titulo && mensaje ? '\\n' : '') + (mensaje || ''));
        return;
    }

    // Mapeo de tipos Bootstrap
    var tiposBootstrap = {
        'info': 'alert-info',
        'success': 'alert-success',
        'warning': 'alert-warning',
        'danger': 'alert-danger'
    };

    var clase = tiposBootstrap[tipo] || 'alert-info';
    var iconMap = {
        'info': 'info-circle',
        'success': 'check-circle',
        'warning': 'exclamation-circle',
        'danger': 'x-circle'
    };
    var icon = iconMap[tipo] || 'info-circle';

    var html = ''
        + '<div class="alert ' + clase + ' alert-dismissible fade show d-flex align-items-start" role="alert" style="max-width: 500px; word-wrap: break-word;">'
        + '    <i class="bi bi-' + icon + ' me-2" style="margin-top: 3px;"></i>'
        + '    <div>'
        + (titulo ? '<strong>' + escapeHtml(titulo) + '</strong>' : '')
        + (titulo && mensaje ? '<br>' : '')
        + (mensaje ? escapeHtml(mensaje) : '')
        + '    </div>'
        + '    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
        + '</div>';

    var alertDiv = document.createElement('div');
    alertDiv.innerHTML = html;
    container.appendChild(alertDiv.firstElementChild);

    // Auto-remover después de 5 segundos
    setTimeout(function() {
        var alerts = container.querySelectorAll('.alert');
        if (alerts.length > 0) {
            var lastAlert = alerts[alerts.length - 1];
            if (typeof bootstrap !== 'undefined' && bootstrap.Alert) {
                var bsAlert = new bootstrap.Alert(lastAlert);
                bsAlert.close();
            } else {
                lastAlert.remove();
            }
        }
    }, 5000);
}

// ============ FORMATO DE DATOS ============
function formatDateTime(dateString) {
    if (!dateString) return '--:--';

    try {
        var date = new Date(dateString);
        return date.toLocaleString('es-SV', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function formatCurrency(amount) {
    return '$' + parseFloat(amount).toFixed(2);
}

// ============ UTILIDADES DE DOM ============
function ocultarElemento(id) {
    var elem = document.getElementById(id);
    if (elem) elem.classList.add('d-none');
}

function mostrarElemento(id) {
    var elem = document.getElementById(id);
    if (elem) elem.classList.remove('d-none');
}

function toggleElemento(id) {
    var elem = document.getElementById(id);
    if (elem) elem.classList.toggle('d-none');
}

// ============ VALIDACIÓN - Client-side form validation ============

/**
 * Valida que un valor sea un número positivo
 */
function validarNumeroPositivo(value, min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = null;

    if (!value && value !== 0) return false;

    var num = parseFloat(value);
    if (isNaN(num)) return false;
    if (num < min) return false;
    if (max !== null && num > max) return false;

    return true;
}

/**
 * Valida que un valor sea un número entero
 */
function validarNumeroEntero(value) {
    if (!value && value !== 0) return false;

    var num = parseInt(value, 10);
    if (isNaN(num)) return false;
    if (String(num) !== String(parseInt(value, 10))) return false;

    return true;
}

/**
 * Valida que un email tenga formato válido
 */
function validarEmail(email) {
    if (!email) return false;

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).trim());
}

/**
 * Valida que un teléfono tenga formato válido
 */
function validarTelefono(phone) {
    if (!phone) return false;

    // Remover caracteres comunes de formateo
    var phoneClean = String(phone).replace(/[\s-()]/g, '');

    // Verificar que sea solo dígitos y tenga entre 7 y 15 dígitos
    return /^\d{7,15}$/.test(phoneClean);
}

/**
 * Valida que un campo no esté vacío
 */
function validarRequerido(value) {
    return value && String(value).trim().length > 0;
}

/**
 * Obtiene el valor de un campo de forma segura
 */
function getFormValue(elementId) {
    var elem = document.getElementById(elementId);
    return elem ? String(elem.value || '').trim() : '';
}

/**
 * Obtiene un valor numérico de forma segura
 */
function getFormNumber(elementId) {
    var value = getFormValue(elementId);
    var num = parseFloat(value);
    return isNaN(num) ? null : num;
}

/**
 * Limpia un formulario
 */
function limpiarFormulario(formId) {
    var form = typeof formId === 'string'
        ? document.getElementById(formId)
        : formId;

    if (form) {
        form.reset();
    }
}

/**
 * Deshabilita un formulario (útil durante envío)
 */
function deshabilitarFormulario(formId, disabled) {
    if (disabled === undefined) disabled = true;

    var form = typeof formId === 'string'
        ? document.getElementById(formId)
        : formId;

    if (!form) return;

    // Deshabilitar todos los inputs, selects, buttons
    var elements = form.querySelectorAll('input, select, textarea, button');
    for (var i = 0; i < elements.length; i++) {
        elements[i].disabled = disabled;
    }
}

// ============ CONSTANTES Y CONFIGURACIÓN ============

/**
 * Constantes para rates, timings y configuración general
 */
var CONFIG = {
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
 */
function renderItems(container, items, template, emptyMsg) {
    if (!emptyMsg) emptyMsg = 'No hay datos';

    var elem = typeof container === 'string'
        ? document.getElementById(container)
        : container;

    if (!elem) return;

    if (!items || items.length === 0) {
        elem.innerHTML = '<div class="alert alert-info">' + escapeHtml(emptyMsg) + '</div>';
        return;
    }

    elem.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
        elem.innerHTML += template(items[i]);
    }
}

/**
 * Factory para crear funciones de búsqueda con debounce
 */
function createDebouncedFunction(searchFn, debounceMs) {
    if (debounceMs === undefined) debounceMs = CONFIG.POLLING_INTERVALS.DEBOUNCE;
    var timeout = null;

    return function() {
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            searchFn.apply(null, args);
        }, debounceMs);
    };
}

/**
 * Muestra o esconde un modal Bootstrap de forma segura
 */
function toggleModal(modalId, show) {
    if (show === undefined) show = true;

    var modalEl = document.getElementById(modalId);
    if (!modalEl) {
        console.warn('Modal ' + modalId + ' not found');
        return null;
    }

    try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            if (show) {
                modal.show();
            } else {
                modal.hide();
            }
            return modal;
        } else {
            console.warn('Bootstrap no disponible. Modal fallback desactivado.');
            return null;
        }
    } catch (error) {
        console.error('Error toggling modal ' + modalId + ':', error);
        return null;
    }
}

/**
 * Calcula el IVA basado en un subtotal
 */
function calculateIVA(subtotal, rate) {
    if (rate === undefined) rate = CONFIG.IVA_RATE;
    if (!validarNumeroPositivo(subtotal)) return 0;
    return parseFloat((subtotal * rate).toFixed(2));
}

/**
 * Calcula el total incluyendo IVA
 */
function calculateTotal(subtotal, includeIVA) {
    if (includeIVA === undefined) includeIVA = false;
    if (!validarNumeroPositivo(subtotal)) return 0;

    if (!includeIVA) return parseFloat(subtotal).toFixed(2);

    var iva = calculateIVA(subtotal);
    return parseFloat((parseFloat(subtotal) + iva).toFixed(2));
}

/**
 * Obtiene la clase de color para un estado
 */
function getEstadoColor(estado) {
    return CONFIG.ESTADO_COLORES[estado] || 'bg-secondary';
}

/**
 * Limpia listeners y timers cuando cambia de rol
 */
function limpiarListeners() {
    // Limpiar todos los timeouts pendientes (aproximado)
    for (var i = 1; i < 1000; i++) {
        try { clearTimeout(i); } catch (e) {}
    }
}

/**
 * Obtiene el texto de un elemento de forma segura
 */
function getElementText(elementId) {
    var elem = document.getElementById(elementId);
    return elem ? elem.textContent.trim() : '';
}

/**
 * Establece el texto de un elemento de forma segura (contra XSS)
 */
function setElementText(elementId, text) {
    var elem = document.getElementById(elementId);
    if (elem) {
        elem.textContent = text;
    }
}

/**
 * Realiza una acción después de que se completa una transición CSS
 */
function afterTransition(element, callback) {
    if (!element) {
        if (callback) callback();
        return;
    }

    var handler = function() {
        element.removeEventListener('transitionend', handler);
        if (callback) callback();
    };

    element.addEventListener('transitionend', handler);
}
/**
 * Control de acceso por rol — Oculta/muestra elementos según permisos
 * @param {string} rol - Rol del usuario autenticado
 */
function aplicarPermisosPorRol(rol) {
    if (!rol) {
        console.warn('Rol no especificado. Redirigiendo a login.');
        if (typeof window.logout === 'function') window.logout();
        else window.location.href = 'login.html';
        return;
    }

    // Ocultar todos los paneles y el selector
    document.querySelectorAll('.work-panel').forEach(el => el.classList.remove('active'));
    const roleSelector = document.getElementById('role-selector');
    if (roleSelector) roleSelector.style.display = 'none';

    // ✅ Activar paneles según rol
    switch (rol) {
        case 'manager':
            document.getElementById('panel-mesero')?.classList.add('active');
            document.getElementById('panel-cajero')?.classList.add('active');
            document.getElementById('panel-cocina')?.classList.add('active');
            if (roleSelector) roleSelector.style.display = 'block';
            break;

        case 'mesero':
            document.getElementById('panel-mesero')?.classList.add('active');
            break;

        case 'cajero':
            document.getElementById('panel-cajero')?.classList.add('active');
            // ✅ Acceso a menú (pedido para llevar)
            document.getElementById('panel-mesero')?.classList.add('active');
            const meseroTabs = document.getElementById('meseroTabs');
            if (meseroTabs) meseroTabs.classList.add('d-none');
            break;

        case 'cocinero':
            window.location.href = 'cocina.html';
            return;

        default:
            console.error('Rol no reconocido:', rol);
            if (typeof window.logout === 'function') window.logout();
            return;
    }

    // ✅ Actualizar badge de rol
    const currentRole = document.getElementById('current-role');
    if (currentRole) {
        currentRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
        currentRole.classList.remove('d-none');
    }

    console.log(`✅ Permisos aplicados: rol ${rol}`);
}
// ============ EXPOSICIÓN GLOBAL DE FUNCIONES ============
if (typeof window !== 'undefined') {
  // --- Seguridad: CSRF & Auth ---
  window.getCsrfToken = getCsrfToken;
  window.saveCsrfToken = saveCsrfToken;
  window.getSecureHeaders = getSecureHeaders;
  window.updateCsrfTokenFromResponse = updateCsrfTokenFromResponse;
  window.apiFetch = apiFetch;

  window.getAuthToken = getAuthToken;
  window.getUsuarioActual = getUsuarioActual;
  window.getAuthHeaders = getAuthHeaders;
  window.saveAuthToken = saveAuthToken;
  window.saveUsuarioActual = saveUsuarioActual;
  window.limpiarSesion = limpiarSesion;

  // --- Escaping & XSS Protection ---
  window.escapeHtml = escapeHtml;
  window.escapeAttribute = escapeAttribute;
  window.createSafeElement = createSafeElement;

  // --- Validación Cliente ---
  window.validarNumeroPositivo = validarNumeroPositivo;
  window.validarNumeroEntero = validarNumeroEntero;
  window.validarEmail = validarEmail;
  window.validarTelefono = validarTelefono;
  window.validarRequerido = validarRequerido;

  // --- Form Helpers ---
  window.getFormValue = getFormValue;
  window.getFormNumber = getFormNumber;
  window.limpiarFormulario = limpiarFormulario;
  window.deshabilitarFormulario = deshabilitarFormulario;

  // --- UI / Notificaciones ---
  window.mostrarNotificacion = mostrarNotificacion;

  // --- DOM Utilities ---
  window.setElementText = setElementText;
  window.getElementText = getElementText;
  window.ocultarElemento = ocultarElemento;
  window.mostrarElemento = mostrarElemento;
  window.toggleElemento = toggleElemento;
  window.limpiarListeners = limpiarListeners;
  window.afterTransition = afterTransition;

  // --- Optimización / Helpers ---
  window.renderItems = renderItems;
  window.createDebouncedFunction = createDebouncedFunction;
  window.toggleModal = toggleModal;
  window.calculateIVA = calculateIVA;
  window.calculateTotal = calculateTotal;
  window.getEstadoColor = getEstadoColor;

  // --- Formato y Utilidades Generales ---
  window.formatDateTime = formatDateTime;
  window.formatCurrency = formatCurrency;
window.aplicarPermisosPorRol = aplicarPermisosPorRol;

}