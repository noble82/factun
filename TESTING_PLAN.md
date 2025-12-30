## TESTING_PLAN.md

### Test Cases

#### TC-SEC-07: CSRF Token Flow Validation (End-to-End)

*   **ID:** TC-SEC-07
*   **Nombre:** CSRF Token Flow Validation (End-to-End)
*   **Objetivo:** Validar que el token CSRF se genera correctamente tras el login, persiste en `sessionStorage`, y se envía automáticamente en las peticiones POST subsiguientes usando `apiFetch`.
*   **Criticidad:** Alta
*   **Precondiciones:**
    *   La aplicación está corriendo y accesible.
    *   El endpoint de login (`/api/login`) está operativo y devuelve un token de autenticación y un token CSRF.
    *   El endpoint de creación de clientes (`/api/clientes`) está operativo y requiere el token CSRF.
    *   `sessionStorage` está vacío o limpio antes de iniciar la prueba.
    *   Las utilidades de JavaScript (`utils.js`) están cargadas en la página.
*   **Pasos Manuales:**
    1.  Abrir la página de login del POS en el navegador.
    2.  Ingresar credenciales de usuario de prueba válidas (ej. `testuser@example.com` / `password123`).
    3.  Hacer clic en el botón de inicio de sesión.
    4.  Una vez dentro de la aplicación, abrir las DevTools del navegador (F12) y navegar a la pestaña "Console".
    5.  Ejecutar el script de prueba pegando el siguiente código en la consola y ejecutando `await testCsrfFullFlow();`:
        ```javascript
        // --- TESTING SCRIPT ---
        // Este script se puede ejecutar en la consola del navegador.
        // Asegúrate de que utils.js, login.js y pos.js estén cargados.

        async function testCsrfFullFlow() {
            console.log("--- Iniciando Test de Flujo CSRF Completo ---");

            // --- Configuración ---
            const TEST_USER_EMAIL = 'testuser@example.com'; // Cambia a un email de prueba válido
            const TEST_USER_PASSWORD = 'password123';      // Cambia a una contraseña de prueba válida
            const LOGIN_URL = '/api/login';                // Endpoint de login
            const CREATE_CLIENT_URL = '/api/clientes';     // Endpoint de creación de clientes

            const TEST_CLIENT_DATA = {
                nombre: 'Test',
                apellido: 'User',
                dui: '12345678-9',
                nit: '1234567890123',
                telefono: '12345678',
                email: 'test.client@example.com',
                direccion: '123 Main St'
            };

            let loginResponse = null;
            let csrfTokenAfterLogin = null;

            // --- Paso 1: Simular Login ---
            console.log("Paso 1: Simulando login...");
            try {
                loginResponse = await apiFetch(LOGIN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
                });

                if (!loginResponse.ok) {
                    console.error(`❌ Error en login: Estado ${loginResponse.status} - ${await loginResponse.text()}`);
                    console.log("--- Test CSRF Completo FALLÓ ---");
                    return false;
                }

                const loginData = await loginResponse.json();
                console.log('✅ Login exitoso.');
                console.log('   Token de autenticación recibido:', loginData.auth_token ? 'Sí' : 'No');

                console.log('   Actualizando token CSRF desde respuesta de login...');
                await updateCsrfTokenFromResponse(loginResponse);

                csrfTokenAfterLogin = getCsrfToken();
                console.log(`   Token CSRF leído de sessionStorage: ${csrfTokenAfterLogin ? `Sí (inicia con ${csrfTokenAfterLogin.substring(0, 10)}...)` : 'NO'}`);

                if (!loginData.auth_token || !csrfTokenAfterLogin) {
                    console.error('❌ Fallo: No se obtuvo token de autenticación o token CSRF después del login.');
                    console.log("--- Test CSRF Completo FALLÓ ---");
                    return false;
                }

            } catch (error) {
                console.error('❌ Excepción durante simulación de login:', error);
                console.log("--- Test CSRF Completo FALLÓ ---");
                return false;
            }

            // --- Paso 2: Simular Creación de Cliente ---
            console.log("
Paso 2: Simulando creación de cliente...");
            try {
                const csrfTokenBeforeApiFetchCall = getCsrfToken();
                console.log(`   Token CSRF leído justo antes de la llamada a apiFetch: ${csrfTokenBeforeApiFetchCall ? `Sí (inicia con ${csrfTokenBeforeApiFetchCall.substring(0, 10)}...)` : 'NO'}`);

                const apiFetchOptions = {
                    method: 'POST',
                    body: JSON.stringify(TEST_CLIENT_DATA)
                };

                console.log(`   Llamando a apiFetch para ${CREATE_CLIENT_URL}...`);
                const clientCreationResponse = await apiFetch(CREATE_CLIENT_URL, apiFetchOptions);

                if (!clientCreationResponse) {
                    console.error('❌ apiFetch para creación de cliente devolvió null (probablemente ya se mostró un error).');
                    console.log("--- Test CSRF Completo FALLÓ ---");
                    return false;
                }

                console.log(`   Respuesta de creación de cliente - Estado: ${clientCreationResponse.status}`);
                console.log('   Respuesta OK:', clientCreationResponse.ok);

                if (clientCreationResponse.ok) {
                    console.log('✅ ¡Creación de cliente exitosa!');
                    const clientData = await clientCreationResponse.json();
                    console.log('   Datos de respuesta:', clientData);

                    await updateCsrfTokenFromResponse(clientCreationResponse);
                    const finalCsrfToken = getCsrfToken();
                    console.log(`   Token CSRF final leído de sessionStorage: ${finalCsrfToken ? `Sí (inicia con ${finalCsrfToken.substring(0, 10)}...)` : 'NO'}`);

                    console.log("--- Test CSRF Completo PASÓ ---");
                    return true;
                } else {
                    console.error(`❌ Fallo: Creación de cliente fallida con estado ${clientCreationResponse.status}.`);
                    console.error('   Cuerpo de respuesta:', await clientCreationResponse.text());
                    console.log("--- Test CSRF Completo FALLÓ ---");
                    return false;
                }

            } catch (error) {
                console.error('❌ Excepción durante simulación de creación de cliente:', error);
                console.log("--- Test CSRF Completo FALLÓ ---");
                return false;
            }
        }

        // Para ejecutar la prueba, llama a:
        // await testCsrfFullFlow();
        ```
*   **Pasos Automáticos:** El script `testCsrfFullFlow()` se ejecuta directamente en la consola del navegador, simulando el flujo completo de login y creación de cliente, e imprimiendo resultados y verificaciones en la consola.
*   **Resultado Esperado:**
    *   El login debe ser exitoso y devolver un token de autenticación.
    *   Se debe obtener un token CSRF válido de la respuesta del login y guardarlo en `sessionStorage`.
    *   La petición POST para crear un cliente debe ser exitosa (status 2xx) y `response.ok` debe ser `true`.
    *   Los logs del script de prueba en la consola deben indicar "✅ Login exitoso." y "✅ ¡Creación de cliente exitosa!".
    *   No deben aparecer errores de "CSRF token missing" o 403 relacionados con CSRF.