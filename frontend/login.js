/**
 * Manejador para el login de usuario.
 * Se asume que utils.js está disponible globalmente.
 */

// Asume que las utilidades están disponibles globalmente o importadas.
// const { apiFetch, saveAuthToken, saveUsuarioActual, updateCsrfTokenFromResponse, mostrarNotificacion, getCsrfToken } = window;

const loginForm = document.getElementById('login-form'); // Asume que el <form> tiene id="login-form"

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevenir envío de formulario por defecto del navegador

        // Obtener credenciales del formulario (ajusta los IDs según tu HTML)
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        // --- Validaciones Básicas del lado del cliente ---
        if (!email || !password) {
            mostrarNotificacion('Campos incompletos', 'Por favor, ingrese su email y contraseña.', 'warning');
            return;
        }
        // Podrías añadir validación de formato de email aquí si lo deseas.

        const loginUrl = '/api/login'; // Asegúrate que esta es la URL correcta de tu endpoint de login

        try {
            // --- Llamada al Endpoint de Login ---
            // Para el login inicial, típicamente no se envía un token CSRF.
            // Usamos fetch directo aquí para evitar enviar un token CSRF que aún no tenemos.
            // El backend DEBE responder con un nuevo token CSRF para la sesión.
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // NO enviamos 'X-CSRF-Token' aquí, ya que es la autenticación inicial.
                },
                body: JSON.stringify({ email, password })
            });

            // --- ¡CRÍTICO! Actualizar el Token CSRF desde la respuesta del Login ---
            // Asegurarse de que esto se completa antes de realizar otras verificaciones.
            await updateCsrfTokenFromResponse(response);
            // ---------------------------------------------------------------------

            // Procesar la respuesta del servidor
            if (response.ok) {
                const data = await response.json(); // Obtener datos del login (ej. token de auth, info del usuario)

                // Guardar información de sesión
                if (data.auth_token) {
                    saveAuthToken(data.auth_token); // Guardar token de autenticación
                }
                if (data.user) {
                    saveUsuarioActual(data.user); // Guardar datos del usuario
                }

                // --- Verificación post-login (Opcional pero recomendable para debug) ---
                const csrfTokenAfterLogin = getCsrfToken(); // Lee de sessionStorage
                if (!csrfTokenAfterLogin) {
                    // Si después de la llamada a updateCsrfTokenFromResponse, no hay token,
                    // algo falló en el proceso de login/respuesta del backend.
                    console.warn('¡ADVERTENCIA! No se pudo obtener el token CSRF después del login.');
                    mostrarNotificacion(
                        'Login exitoso pero token CSRF ausente',
                        'Puede que algunas funcionalidades no estén protegidas. Por favor, recargue la página o contacte soporte.',
                        'warning'
                    );
                } else {
                    console.log('Token CSRF inicial obtenido y guardado correctamente.');
                    mostrarNotificacion('¡Bienvenido!', 'Inicio de sesión exitoso.', 'success');
                }
                // ---------------------------------------------------------------------

                // Redirigir al dashboard o página principal
                window.location.href = '/index.html'; // Ajusta la ruta si es necesario

            } else {
                // Error en el login (ej. credenciales incorrectas)
                const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
                const errorMessage = errorData.message || errorData.error || `Error ${response.status}`;
                console.error('Login failed:', errorData);
                mostrarNotificacion('Error de inicio de sesión', errorMessage, 'danger');
            }

        } catch (error) {
            // Captura de errores de red o de la llamada fetch()
            console.error('Error general durante el login:', error);
            mostrarNotificacion('Error de conexión', 'No se pudo conectar al servidor.', 'danger');
        }
    });
}

// --- Notas de Seguridad ---
// - El endpoint de login NO debe requerir un token CSRF inicial, pero SÍ debe devolver uno nuevo.
// - La validación de email/password en el cliente es útil pero la validación robusta debe ser en el backend.
// - Evitar logs que contengan contraseñas o tokens sensibles.