/**
 * Control de Roles y Permisos del POS
 * Define qué puede ver y hacer cada rol
 */

const ROLE_PERMISSIONS = {
    mesero: {
        canViewTables: true,
        canViewMenu: true,
        canCreateOrder: true,
        canViewPayments: false,
        canViewCombos: true,
        canCreateCombos: false,
        canViewReports: false,
        canViewCreditMgmt: false,
        panelId: 'panel-mesero'
    },
    cajero: {
        canViewTables: false,
        canViewMenu: true,
        canCreateOrder: true,
        canViewPayments: true,
        canViewCombos: true,
        canCreateCombos: false,
        canViewReports: true,
        canViewCreditMgmt: true,
        panelId: 'panel-cajero'
    },
    cocinero: {
        canViewTables: false,
        canViewMenu: false,
        canCreateOrder: false,
        canViewPayments: false,
        canViewCombos: false,
        canCreateCombos: false,
        canViewReports: false,
        canViewCreditMgmt: false,
        panelId: 'panel-cocina'
    },
    manager: {
        canViewTables: true,
        canViewMenu: true,
        canCreateOrder: true,
        canViewPayments: true,
        canViewCombos: true,
        canCreateCombos: true,
        canViewReports: true,
        canViewCreditMgmt: true,
        panelId: 'panel-manager'
    }
};

/**
 * Obtiene el rol actual del usuario
 */
function obtenerRolActual() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.rol || null;
}

/**
 * Verifica si el usuario actual tiene un permiso
 */
function tienePermiso(permiso) {
    const rol = obtenerRolActual();
    if (!rol || !ROLE_PERMISSIONS[rol]) return false;
    return ROLE_PERMISSIONS[rol][permiso] === true;
}

/**
 * Controla la visibilidad de elementos según roles
 */
function aplicarRestriccionesRoles() {
    const rol = obtenerRolActual();
    if (!rol) return;

    const permisos = ROLE_PERMISSIONS[rol];

    // Mostrar/ocultar elementos según permisos
    const elementosControlados = [
        { selector: '[data-permission="canViewTables"]', permiso: 'canViewTables' },
        { selector: '[data-permission="canCreateCombos"]', permiso: 'canCreateCombos' },
        { selector: '[data-permission="canViewPayments"]', permiso: 'canViewPayments' },
        { selector: '[data-permission="canViewReports"]', permiso: 'canViewReports' },
        { selector: '[data-permission="canViewCreditMgmt"]', permiso: 'canViewCreditMgmt' }
    ];

    elementosControlados.forEach(({ selector, permiso }) => {
        const elementos = document.querySelectorAll(selector);
        elementos.forEach(el => {
            el.style.display = permisos[permiso] ? 'block' : 'none';
        });
    });

    // Ocultar todos los paneles
    document.querySelectorAll('.work-panel').forEach(panel => {
        panel.style.display = 'none';
    });

    // Mostrar solo el panel del rol
    if (permisos.panelId) {
        const panelActual = document.getElementById(permisos.panelId);
        if (panelActual) {
            panelActual.style.display = 'block';
        }
    }
}

/**
 * Valida si el usuario puede hacer una acción
 */
function puedeHacerAccion(accion) {
    const rol = obtenerRolActual();
    if (!rol || !ROLE_PERMISSIONS[rol]) return false;

    const accionMap = {
        'crear_pedido': ROLE_PERMISSIONS[rol].canCreateOrder,
        'ver_pagos': ROLE_PERMISSIONS[rol].canViewPayments,
        'crear_combo': ROLE_PERMISSIONS[rol].canCreateCombos,
        'ver_reportes': ROLE_PERMISSIONS[rol].canViewReports,
        'gestionar_credito': ROLE_PERMISSIONS[rol].canViewCreditMgmt
    };

    return accionMap[accion] === true;
}

/**
 * Verifica permisos antes de ejecutar una acción
 */
function verificarPermiso(accion) {
    if (!puedeHacerAccion(accion)) {
        mostrarNotificacion('Acceso Denegado', 'No tienes permiso para hacer esto', 'danger');
        return false;
    }
    return true;
}

// Aplicar restricciones cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    aplicarRestriccionesRoles();
});
