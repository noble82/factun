/**
 * Script para la funcionalidad del Punto de Venta (POS).
 * Se asume que utils.js está disponible globalmente.
 */

// Asume que las utilidades están disponibles globalmente o importadas.
// const { apiFetch, getFormValue, mostrarNotificacion, limpiarFormulario, validarRequerido, validarDUI /* ...otras validaciones*/ } = window;

const crearClienteFormId = 'form-crear-cliente'; // ID del formulario a manejar

// Handler para la creación de cliente
async function handleCreateClientSubmit(event) {
    event.preventDefault(); // Prevenir envío de formulario por defecto

    // 1. Obtener valores del formulario
    const nombre = getFormValue('input-cliente-nombre'); // Ajusta los IDs a tu HTML
    const apellido = getFormValue('input-cliente-apellido');
    const dui = getFormValue('input-cliente-dui');
    const nit = getFormValue('input-cliente-nit');
    const telefono = getFormValue('input-cliente-telefono');
    const email = getFormValue('input-cliente-email');
    const direccion = getFormValue('input-cliente-direccion');

    // 2. Validaciones del lado del cliente
    if (!validarRequerido(nombre) || !validarRequerido(apellido) || !validarRequerido(dui)) {
        mostrarNotificacion('Campos incompletos', 'Por favor, complete Nombre, Apellido y DUI.', 'warning');
        return;
    }
    // if (!validarDUI(dui)) { // Descomentar y asegurar que validarDUI existe en utils.js
    //      mostrarNotificacion('Formato DUI inválido', 'El DUI debe tener el formato 00000000-0.', 'warning');
    //      return;
    // }
    // ... (añadir validaciones para NIT, teléfono, email, etc.) ...

    // 3. Preparar el objeto de datos a enviar
    const clienteData = {
        nombre: nombre,
        apellido: apellido,
        dui: dui,
        nit: nit,
        telefono: telefono,
        email: email,
        direccion: direccion,
        // ... otros campos del cliente
    };

    // 4. Realizar la llamada API usando apiFetch
    const endpoint = '/api/clientes'; // URL del endpoint de creación de clientes
    console.log(`pos.js: Iniciando llamada a ${endpoint} con datos de cliente.`);

    try {
        // apiFetch se encargará automáticamente de añadir Auth y CSRF tokens.
        const response = await apiFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(clienteData)
        });

        // Si apiFetch devolvió null, significa que ya mostró una notificación de error.
        if (!response) {
            console.error('pos.js: La llamada a apiFetch para crear cliente falló y ya mostró error.');
            return; // No continuar si hubo un error manejado.
        }

        // Procesar la respuesta exitosa del backend
        const result = await response.json(); // Obtener el cuerpo de la respuesta

        if (result.success) {
            mostrarNotificacion('Éxito', 'Cliente creado correctamente.', 'success');
            limpiarFormulario(crearClienteFormId); // Limpiar campos del formulario
            // Opcional: Actualizar UI, recargar lista de clientes, etc.
            // await cargarListaClientes();
        } else {
            // El backend respondió con un código 2xx pero indicó un fallo lógico.
            const errorMessage = result.message || 'Error desconocido al crear el cliente.';
            mostrarNotificacion('Error al crear cliente', errorMessage, 'danger');
            console.error('pos.js: Respuesta del backend al crear cliente (fallo lógico):', result);
        }

    } catch (error) {
        // Este catch captura errores que apiFetch podría relanzar (ej. network errors).
        // apiFetch ya debería haber mostrado una notificación.
        console.error('pos.js: Excepción no manejada al enviar formulario de cliente:', error);
    }
}

// --- Adjuntar listener usando Event Delegation ---
// Buscar un elemento padre persistente (ej. document.body o un contenedor principal)
// Esto asegura que el listener esté activo incluso si el formulario se reemplaza o re-renderiza.
// Si el formulario existe al cargar la página, podemos adjuntar el listener directamente.
const crearClienteForm = document.getElementById(crearClienteFormId);

if (crearClienteForm) {
    // Si el formulario existe en el DOM inicial, adjuntar listener directamente.
    // Si el formulario se carga dinámicamente, se necesitaría delegación a un elemento padre.
    crearClienteForm.addEventListener('submit', handleCreateClientSubmit);
    console.log(`pos.js: Listener de submit adjuntado directamente a #${crearClienteFormId}.`);
} else {
    // Fallback: buscar un contenedor más genérico si el formulario no está inicialmente.
    // Esto es menos común para formularios de creación inicial, pero útil si se modalizan o recargan.
    const generalContainer = document.getElementById('app-container') || document.body;
    if (generalContainer) {
        generalContainer.addEventListener('submit', (event) => {
            // Verificar si el evento submit provino del formulario de creación de cliente.
            if (event.target && event.target.id === crearClienteFormId) {
                console.log(`pos.js: Event delegation capturó submit para #${crearClienteFormId}.`);
                handleCreateClientSubmit(event);
            }
            // Se pueden añadir condiciones para otros formularios aquí si es necesario.
        });
        console.log(`pos.js: Listener de submit adjuntado con event delegation a #${generalContainer.id || 'body'}.`);
    } else {
        console.error('pos.js: No se pudo encontrar un elemento contenedor para adjuntar el listener de submit.');
    }
}

// ✅ CONTROL DE ACCESO POR ROL (RBAC) — Definido aquí para que auth-check.js pueda usarlo
/**
 * Control de acceso por rol — Oculta/muestra elementos según permisos
 * @param {string} rol - Rol del usuario autenticado
 */
function aplicarPermisosPorRol(rol) {
    if (!rol) {
        console.warn('Rol no especificado. Redirigiendo a login.');
        if (typeof logout === 'function') logout();
        return;
    }

    // 1. Limpieza inicial
    document.querySelectorAll('.work-panel').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none'; // Asegura ocultamiento
    });
    const roleSelector = document.getElementById('role-selector');
    if (roleSelector) roleSelector.style.display = 'none';

    // 2. Activación de Paneles y CARGA DE DATOS
    switch (rol) {
        case 'manager':
            document.getElementById('panel-mesero')?.classList.add('active');
            document.getElementById('panel-cajero')?.classList.add('active');
            document.getElementById('panel-cocina')?.classList.add('active');
            if (roleSelector) roleSelector.style.display = 'block';
            
            // ✅ EJECUTAR CARGA DE DATOS
            if (typeof cargarMesas === 'function') cargarMesas();
            if (typeof cargarCategorias === 'function') cargarCategorias();
            break;

        case 'mesero':
            const pMesero = document.getElementById('panel-mesero');
            if (pMesero) {
                pMesero.classList.add('active');
                pMesero.style.display = 'block';
                // ✅ EJECUTAR CARGA PARA MESERO
                if (typeof cargarMesas === 'function') cargarMesas();
                if (typeof cargarCategorias === 'function') cargarCategorias();
            }
            break;

        case 'cajero':
            document.getElementById('panel-cajero')?.classList.add('active');
            const pMeseroCajero = document.getElementById('panel-mesero');
            if (pMeseroCajero) {
                pMeseroCajero.classList.add('active');
                // Al cajero solo le interesa el menú para pedidos rápidos
                if (typeof cargarCategorias === 'function') cargarCategorias();
            }
            break;

        case 'cocinero':
            window.location.href = 'cocina.html';
            return;

        default:
            console.error(`Rol no reconocido: ${rol}`);
            if (typeof logout === 'function') logout();
            return;
    }

    // Actualizar badge
    const currentRole = document.getElementById('current-role');
    if (currentRole) {
        currentRole.textContent = rol.toUpperCase();
        currentRole.classList.remove('d-none');
    }
}

    // ✅ Actualizar badge de rol
    const currentRole = document.getElementById('current-role');
    if (currentRole) {
        currentRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
        currentRole.classList.remove('d-none');
    }

    console.log(`✅ Permisos aplicados: rol ${rol}`);
    

// ✅ Callback para auth-check.js — se llama cuando la autenticación está verificada
function onAuthVerificado(usuario) {
    if (usuario && usuario.rol) {
        aplicarPermisosPorRol(usuario.rol);
    } else {
        console.error('onAuthVerificado: usuario sin rol');
        logout();
    }
}

// Exportar funciones globales
window.handleCreateClientSubmit = handleCreateClientSubmit;
window.aplicarPermisosPorRol = aplicarPermisosPorRol;
window.onAuthVerificado = onAuthVerificado;

// --- Notas de Seguridad ---
// - apiFetch asegura la inclusión automática de tokens de seguridad.
// - La validación del lado del cliente es una capa de UX, la VALIDACIÓN DEL LADO DEL SERVIDOR ES MANDATORIA.
// - Nunca confíes en datos provenientes del cliente sin validación exhaustiva en el backend.
// - La función `limpiarFormulario` ayuda a mantener la interfaz limpia.
