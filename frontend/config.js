/**
 * Configuración centralizada de APIs
 * ✅ Incluir DESPUÉS de utils.js
 * ✅ No define funciones duplicadas
 * ✅ Usa apiFetch de utils.js
 */

// Detectar URL base dinámicamente
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;

// Configuración de endpoints (usa con apiFetch(`${API_CONFIG.AUTH}/login`))
const API_CONFIG = {
    // Autenticación
    AUTH: '/api/auth',
    // Punto de Venta
    POS: '/api/pos',
    // Inventario
    INVENTARIO: '/api/inventario',
    // Clientes
    CLIENTES: '/api/clientes'
};

// Helpers para construir URLs completas
function buildUrl(endpoint) {
    return `${API_BASE_URL}${endpoint}`;
}

function buildApiUrl(configKey, path = '') {
    const base = API_CONFIG[configKey];
    if (!base) {
        console.warn(`API_CONFIG: clave '${configKey}' no encontrada`);
        return buildUrl(path);
    }
    return buildUrl(`${base}${path}`);
}

// Exponer globalmente (solo si utils.js ya cargó apiFetch)
if (typeof window !== 'undefined') {
    window.API_BASE_URL = API_BASE_URL;
    window.API_CONFIG = API_CONFIG;
    window.buildUrl = buildUrl;
    window.buildApiUrl = buildApiUrl;

    // Verificación de compatibilidad
    if (typeof window.apiFetch !== 'function') {
        console.warn('⚠️ config.js cargado antes que utils.js. Asegura orden: utils.js → config.js');
    }
}