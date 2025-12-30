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

// Verificar sesión con el servidor
async function verificarSesion() {
    const token = getAuthToken();

    if (!token) {
        return null;
    }

    try {
        const response = await apiFetch(`${AUTH_API}/me`, {
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
    // (esto cubre el caso de nginx redirigiendo URLs inexistentes a index.html)
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

    // Actualizar UI con info del usuario si existe el elemento
    actualizarUIUsuario(usuario);

    // Para pos.html, aplicar restricciones de rol directamente
    if (pagina === 'pos.html') {
        aplicarRestriccionesPOS(usuario);
    }

    // Llamar función de callback si existe (para pos.js)
    if (typeof window.onAuthVerificado === 'function') {
        window.onAuthVerificado(usuario);
    }

    return true;
}

// Aplicar restricciones de rol en POS
function aplicarRestriccionesPOS(usuario) {
    console.log('aplicarRestriccionesPOS llamado con usuario:', usuario);

    const roleSelector = document.getElementById('role-selector');
    const btnCambiarRol = document.getElementById('btn-cambiar-rol');
    const managerNavLinks = document.getElementById('manager-nav-links');

    console.log('Elementos encontrados:', {
        roleSelector: !!roleSelector,
        btnCambiarRol: !!btnCambiarRol,
        managerNavLinks: !!managerNavLinks
    });

    // Ocultar selector para todos excepto manager
    if (usuario.rol !== 'manager') {
        if (roleSelector) roleSelector.style.display = 'none';
        if (btnCambiarRol) btnCambiarRol.classList.add('d-none');
        if (managerNavLinks) managerNavLinks.classList.add('d-none');
    }

    console.log('Usuario rol:', usuario.rol);

    switch(usuario.rol) {
        case 'mesero':
            mostrarPanelPOS('mesero');
            break;
        case 'cajero':
            mostrarPanelPOS('cajero');
            break;
        case 'cocinero':
            window.location.href = 'cocina.html';
            break;
        case 'manager':
            console.log('Activando elementos para manager');
            if (roleSelector) roleSelector.style.display = 'block';
            // El botón "Cambiar Rol" solo se muestra después de seleccionar un rol
            if (btnCambiarRol) btnCambiarRol.classList.add('d-none');
            if (managerNavLinks) {
                managerNavLinks.classList.remove('d-none');
                console.log('manager-nav-links después de remove d-none:', managerNavLinks.className);
            }
            break;
    }
}

// Mostrar panel específico en POS
function mostrarPanelPOS(rol) {
    console.log('Mostrando panel:', rol);

    // Mostrar badge de rol actual
    const currentRole = document.getElementById('current-role');
    if (currentRole) {
        currentRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
        currentRole.classList.remove('d-none');
    }

    // Ocultar todos los paneles
    document.querySelectorAll('.work-panel').forEach(p => p.classList.remove('active'));

    // Mostrar panel correspondiente
    const panel = document.getElementById(`panel-${rol}`);
    if (panel) {
        panel.classList.add('active');
        console.log('Panel activado:', panel.id);
    } else {
        console.error('Panel no encontrado:', `panel-${rol}`);
    }
}

// Actualizar elementos de UI con información del usuario
function actualizarUIUsuario(usuario) {
    // Actualizar nombre de usuario si existe el elemento
    const userNameEl = document.getElementById('usuario-nombre-display');
    if (userNameEl) {
        userNameEl.textContent = usuario.nombre;
    }

    const userRolEl = document.getElementById('usuario-rol-display');
    if (userRolEl) {
        userRolEl.textContent = usuario.rol;
    }
}

// Cerrar sesión
async function logout() {
    const token = getAuthToken();

    try {
        await apiFetch(`${AUTH_API}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
        });
    } catch (e) {
        console.error('Error en logout:', e);
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
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
