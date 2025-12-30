/**
 * Script para la funcionalidad del Punto de Venta (POS).
 * Se asume que utils.js está disponible globalmente.
 */

// Asume que las utilidades están disponibles globalmente o importadas.
// const { apiFetch, getFormValue, mostrarNotificacion, limpiarFormulario, validarRequerido, validarDUI /* ...otras validaciones*/ } = window;

const crearClienteForm = document.getElementById('form-crear-cliente'); // Asume un <form> con id="form-crear-cliente"

if (crearClienteForm) {
    crearClienteForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevenir envío de formulario por defecto

        // 1. Obtener valores del formulario usando utilidades
        const nombre = getFormValue('input-cliente-nombre'); // Ajusta los IDs a tu HTML
        const apellido = getFormValue('input-cliente-apellido');
        const dui = getFormValue('input-cliente-dui');
        const nit = getFormValue('input-cliente-nit');
        const telefono = getFormValue('input-cliente-telefono');
        const email = getFormValue('input-cliente-email');
        const direccion = getFormValue('input-cliente-direccion');

        // 2. Realizar validaciones del lado del cliente
        if (!validarRequerido(nombre) || !validarRequerido(apellido) || !validarRequerido(dui)) {
            mostrarNotificacion('Campos incompletos', 'Por favor, complete Nombre, Apellido y DUI.', 'warning');
            return;
        }
        // Asume que tienes una función validarDUI en utils.js o definida localmente
        // if (!validarDUI(dui)) { // Descomentar y añadir función si no existe
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

        // --- 4. Realizar la llamada API usando apiFetch ---
        // apiFetch se encargará automáticamente de:
        //  - Recuperar el token CSRF válido de sessionStorage.
        //  - Añadir la cabecera 'X-CSRF-Token' a la petición.
        //  - Añadir la cabecera 'Authorization' si hay un token de auth.
        //  - Manejar la respuesta, incluyendo la actualización del token CSRF para la próxima petición.
        //  - Manejar errores de red, HTTP, 401 (token de auth expira), etc.

        const endpoint = '/api/clientes'; // URL del endpoint de creación de clientes

        try {
            // Las opciones de fetch (method, body) se pasan directamente.
            // NO es necesario ni recomendable añadir 'X-CSRF-Token' manualmente aquí.
            const response = await apiFetch(endpoint, {
                method: 'POST',
                // 'Content-Type': 'application/json' se gestiona dentro de apiFetch si no se provee.
                body: JSON.stringify(clienteData)
            });

            // Si apiFetch devolvió null, significa que ya mostró una notificación de error.
            if (!response) {
                console.error('La llamada a apiFetch para crear cliente falló y ya mostró error.');
                return; // No continuar si hubo un error manejado.
            }

            // Procesar la respuesta exitosa del backend
            const result = await response.json(); // Obtener el cuerpo de la respuesta

            // Asume que el backend responde con { success: true, message: "...", data: {...} } o similar.
            if (result.success) {
                mostrarNotificacion('Éxito', 'Cliente creado correctamente.', 'success');
                limpiarFormulario('form-crear-cliente'); // Limpiar campos del formulario

                // Opcional: Actualizar UI, recargar lista de clientes, etc.
                // await cargarListaClientes();

            } else {
                // El backend respondió con un código 2xx pero indicó un fallo lógico.
                const errorMessage = result.message || 'Error desconocido al crear el cliente.';
                mostrarNotificacion('Error al crear cliente', errorMessage, 'danger');
                console.error('Respuesta del backend al crear cliente (fallo lógico):', result);
            }

        } catch (error) {
            // Este catch captura errores que apiFetch podría relanzar (ej. network errors).
            // apiFetch ya debería haber mostrado una notificación.
            console.error('Excepción no manejada al enviar formulario de cliente:', error);
        }
    });
}

// --- Notas de Seguridad ---
// - apiFetch asegura la inclusión automática de tokens de seguridad.
// - La validación del lado del cliente es una capa de UX, la VALIDACIÓN DEL LADO DEL SERVIDOR ES MANDATORIA.
// - Nunca confíes en datos provenientes del cliente sin validación exhaustiva en el backend.
// - La función `limpiarFormulario` ayuda a mantener la interfaz limpia.