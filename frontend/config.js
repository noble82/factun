/**
 * Configuración centralizada de APIs
 * Incluir este archivo al inicio de todas las páginas
 */

// Detectar URL base dinámicamente para soportar diferentes entornos
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;

// Configuración de todos los endpoints
const API_CONFIG = {
    // Autenticación
    AUTH: `${API_BASE_URL}/api/auth`,

    // Punto de Venta
    POS: `${API_BASE_URL}/api/pos`,

    // Inventario
    INVENTARIO: `${API_BASE_URL}/api/inventario`,

    // Clientes
    CLIENTES: `${API_BASE_URL}/api/clientes`
};

// Funciones de utilidad para API calls
function getAuthHeaders(contentType = 'application/json') {
    const token = localStorage.getItem('auth_token');
    return {
        'Content-Type': contentType,
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Función auxiliar para llamadas API con manejo de errores
async function apiFetch(endpoint, options = {}) {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        const response = await apiFetch(url, {
            ...options,
            headers: {
                ...getAuthHeaders(),
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            // Token expirado, redirigir a login
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return null;
        }

        return response;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}
