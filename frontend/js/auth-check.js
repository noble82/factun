/**
 * Sistema de verificación de autenticación por roles
 * Incluir este script en todas las páginas protegidas
 */

const AUTH_API = '/api/auth';

// Roles permitidos por página
const ROLES_PERMITIDOS = {
    'admin.html': ['manager'],
    'index.html': ['manager'],
    'pos.html': ['manager', 'mesero', 'cajero'],
    'cocina.html': ['manager', 'cocinero'],
    'ticket.html': ['manager', 'cajero'],
    'reportes.html': ['manager']
};

// Páginas públicas (no requieren autenticación)
const PAGINAS_PUBLICAS = ['login.html'];

// Obtener página actual
function getPaginaActual() {
    const path = window.location.pathname;
    let pagina = path.substring(path.lastIndexOf('/') + 1);

    // Si la URL es raíz o vacía, es index.html
    if (!pagina || pagina === '' || pagina === '/') {
        pagina = 'index.html';
    }

    return pagina;
}

// Obtener token de autenticación
function getAuthToken() {
    return localStorage.getItem('auth_token');
}

// Obtener usuario almacenado
function getUsuarioActual() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// Verificar sesión con el servidor (usa fetch directo para evitar bucle)
async function verificarSesion() {
    const token = getAuthToken();

    if (!token) {
        return null;
    }

    try {
        // ✅ Usa fetch directo (no apiFetch) para evitar bucle en verificación inicial
        const response = await fetch(`${AUTH_API}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const user = await response.json();
            localStorage.setItem('user', JSON.stringify(user));
            return user;
        } else {
            // Token inválido, limpiar storage
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            return null;
        }
    } catch (error) {
        console.error('Error verificando sesión:', error);
        return null;
    }
}

// Verificar si el usuario tiene acceso a la página actual
function tieneAcceso(usuario, pagina) {
    const rolesPermitidos = ROLES_PERMITIDOS[pagina];

    if (!rolesPermitidos) {
        // Página no requiere autenticación
        return true;
    }

    if (!usuario) {
        return false;
    }

    return rolesPermitidos.includes(usuario.rol);
}

// Redirigir según el rol
function redirigirPorRol(rol) {
    switch(rol) {
        case 'manager':
            window.location.href = 'admin.html';
            break;
        case 'mesero':
            window.location.href = 'pos.html';
            break;
        case 'cajero':
            window.location.href = 'pos.html';
            break;
        case 'cocinero':
            window.location.href = 'cocina.html';
            break;
        default:
            window.location.href = 'login.html';
    }
}

// Mostrar mensaje de acceso denegado
function mostrarAccesoDenegado(rolRequerido, rolActual) {
    const mensaje = `Acceso denegado. Esta página es solo para: ${rolRequerido.join(', ')}. Tu rol es: ${rolActual}`;
    alert(mensaje);
}

// Función principal de verificación
async function verificarAcceso() {
    const pagina = getPaginaActual();

    // Si es página pública (login), no verificar
    if (PAGINAS_PUBLICAS.includes(pagina)) {
        return true;
    }

    const rolesPermitidos = ROLES_PERMITIDOS[pagina];

    // Si la página no está en la lista de permitidas ni públicas,
    // es una URL desconocida - requiere autenticación
    const paginaDesconocida = !rolesPermitidos;

    // Verificar sesión primero
    const usuario = await verificarSesion();

    if (!usuario) {
        // No hay sesión válida, redirigir a login
        window.location.href = 'login.html';
        return false;
    }

    // Si es página desconocida, redirigir según el rol del usuario
    if (paginaDesconocida) {
        console.log('Página desconocida, redirigiendo según rol:', usuario.rol);
        redirigirPorRol(usuario.rol);
        return false;
    }

    // Verificar rol para la página actual
    if (!tieneAcceso(usuario, pagina)) {
        mostrarAccesoDenegado(rolesPermitidos, usuario.rol);
        redirigirPorRol(usuario.rol);
        return false;
    }

    // Actualizar UI con info del usuario
    actualizarUIUsuario(usuario);

    // ✅ Para pos.html, activar permisos por rol
    if (pagina === 'pos.html') {
        // Si pos.js define aplicarPermisosPorRol, usarla
        if (typeof window.aplicarPermisosPorRol === 'function') {
            window.aplicarPermisosPorRol(usuario.rol);
        } else {
            // Fallback: usar lógica básica
            const panel = document.getElementById(`panel-${usuario.rol}`);
            if (panel) {
                document.querySelectorAll('.work-panel').forEach(p => p.classList.remove('active'));
                panel.classList.add('active');
            }
        }
    }

    // Llamar función de callback si existe (para pos.js)
    if (typeof window.onAuthVerificado === 'function') {
        window.onAuthVerificado(usuario);
    }

    return true;
}

// Actualizar elementos de UI con información del usuario
function actualizarUIUsuario(usuario) {
    // Actualizar nombre de usuario
    const userNameEl = document.getElementById('usuario-nombre-display');
    if (userNameEl) {
        userNameEl.textContent = usuario.nombre || '';
    }

    // Actualizar rol (badge)
    const currentRole = document.getElementById('current-role');
    if (currentRole) {
        currentRole.textContent = usuario.rol.charAt(0).toUpperCase() + usuario.rol.slice(1);
        currentRole.classList.remove('d-none');
    }
}

// Cerrar sesión
async function logout() {
    const token = getAuthToken();

    try {
        // ✅ Usa fetch directo para logout (no requiere CSRF en logout)
        await fetch(`${AUTH_API}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
        });
    } catch (e) {
        console.error('Error en logout:', e);
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('csrf_token');
    window.location.href = 'login.html';
}

// Ejecutar verificación al cargar la página
document.addEventListener('DOMContentLoaded', verificarAcceso);

// Exportar funciones globales
window.verificarAcceso = verificarAcceso;
window.getUsuarioActual = getUsuarioActual;
window.getAuthToken = getAuthToken;
window.logout = logout;
window.redirigirPorRol = redirigirPorRol;