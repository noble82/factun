/**
 * Módulo de Gestión de Inventario - Extracciones de Materia Prima
 */

const API_BASE = '/api/inventario';
let materiasprimasCache = [];
let extraccionesActuales = [];

/**
 * Inicializa la página
 */
document.addEventListener('DOMContentLoaded', async () => {
    await verificarAutenticacion();
    if (!redirigiendo) {
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('fechaFiltro').value = hoy;
        await cargarMateriasPrimas();
        await cargarExtracciones();
        await cargarHistorial();
    }
});

let redirigiendo = false;

/**
 * Verifica que el usuario esté autenticado y sea manager
 */
async function verificarAutenticacion() {
    try {
        const userStr = localStorage.getItem('user');
        const token = localStorage.getItem('auth_token');

        if (!userStr || !token) {
            window.location.href = 'login.html';
            redirigiendo = true;
            return;
        }

        let user = null;
        try {
            user = JSON.parse(userStr);
        } catch (e) {
            console.error('Error parsing user:', e);
            window.location.href = 'login.html';
            redirigiendo = true;
            return;
        }

        // Fallback server verification
        if (!user || !user.rol) {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                user = await response.json();
            } else {
                window.location.href = 'login.html';
                redirigiendo = true;
                return;
            }
        }

        // Manager-only access
        if (user.rol !== 'manager') {
            document.body.innerHTML = `
                <div class="alert alert-danger m-5" role="alert">
                    <h4 class="alert-heading">Acceso Restringido</h4>
                    <p>Solo managers pueden acceder a la gestión de inventario.</p>
                    <hr>
                    <p class="mb-0">Tu rol actual: <strong>${user.rol}</strong></p>
                </div>
            `;
            redirigiendo = true;
            setTimeout(() => window.location.href = 'admin.html', 3000);
        }

    } catch (error) {
        console.error('Error en verificación:', error);
        window.location.href = 'login.html';
        redirigiendo = true;
    }
}

/**
 * Muestra una alerta en el contenedor de alertas
 */
function mostrarAlerta(mensaje, tipo = 'success') {
    const container = document.getElementById('alertContainer');
    const alertHTML = `
        <div class="alert alert-${tipo} alert-custom alert-dismissible fade show" role="alert">
            <i class="bi bi-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', alertHTML);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = container.querySelector('.alert');
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}

/**
 * Carga las materias primas disponibles
 */
async function cargarMateriasPrimas() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/materia-prima`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Error cargando materias primas');

        const data = await response.json();
        materiasprimasCache = data.materias_primas || [];

        const select = document.getElementById('materiaPrimaId');
        const currentValue = select.value;

        // Llenar el selector
        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        materiasprimasCache.forEach(mp => {
            const option = document.createElement('option');
            option.value = mp.id;
            option.textContent = `${mp.nombre} (Stock: ${mp.stock_actual} ${mp.unidad_medida})`;
            option.dataset.unidad = mp.unidad_medida;
            option.dataset.stock = mp.stock_actual;
            select.appendChild(option);
        });

        // Restaurar valor anterior si existe
        if (currentValue) select.value = currentValue;

    } catch (error) {
        console.error('Error cargando materias primas:', error);
        mostrarAlerta('Error al cargar materias primas', 'danger');
    }
}

/**
 * Actualiza el preview del stock después de la extracción
 */
function actualizarPreviewStock() {
    const select = document.getElementById('materiaPrimaId');
    const cantidad = parseFloat(document.getElementById('cantidadExtraida').value) || 0;
    const unidadInput = document.getElementById('unidadMedida');
    const previewDiv = document.getElementById('stockPreview');

    if (!select.value || cantidad <= 0) {
        previewDiv.classList.add('d-none');
        return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const stockActual = parseFloat(selectedOption.dataset.stock);
    const unidad = selectedOption.dataset.unidad;
    const stockDespues = stockActual - cantidad;

    unidadInput.value = unidad;

    // Actualizar preview
    document.getElementById('stockActual').textContent = `${stockActual.toFixed(2)} ${unidad}`;
    document.getElementById('aExtraer').textContent = `${cantidad.toFixed(2)} ${unidad}`;
    document.getElementById('stockDespues').textContent = `${stockDespues.toFixed(2)} ${unidad}`;

    // Mostrar preview con color apropiado
    previewDiv.classList.remove('d-none', 'warning', 'danger');
    if (stockDespues < 0) {
        previewDiv.classList.add('danger');
    } else if (stockDespues < stockActual * 0.2) {
        previewDiv.classList.add('warning');
    }
}

/**
 * Registra una nueva extracción
 */
async function registrarExtraccion(event) {
    event.preventDefault();

    const fecha = document.getElementById('fechaFiltro').value;
    const materiaPrimaId = document.getElementById('materiaPrimaId').value;
    const cantidadExtraida = parseFloat(document.getElementById('cantidadExtraida').value);
    const unidadMedida = document.getElementById('unidadMedida').value;
    const motivo = document.getElementById('motivo').value;
    const descripcion = document.getElementById('descripcion').value;
    const token = localStorage.getItem('auth_token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!fecha || !materiaPrimaId || !cantidadExtraida) {
        mostrarAlerta('Por favor completa todos los campos requeridos', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/extracciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fecha: fecha,
                materia_prima_id: parseInt(materiaPrimaId),
                cantidad_extraida: cantidadExtraida,
                unidad_medida: unidadMedida,
                motivo: motivo,
                descripcion: descripcion,
                usuario: user.username
            })
        });

        const data = await response.json();

        if (!response.ok) {
            mostrarAlerta(data.message || 'Error registrando extracción', 'danger');
            return;
        }

        mostrarAlerta(`✓ ${data.message}`, 'success');

        // Limpiar formulario
        document.getElementById('formularioExtraccion').reset();
        document.getElementById('stockPreview').classList.add('d-none');
        document.getElementById('unidadMedida').value = '';

        // Recargar datos
        await cargarMateriasPrimas();
        await cargarExtracciones();

    } catch (error) {
        console.error('Error registrando extracción:', error);
        mostrarAlerta('Error al registrar extracción', 'danger');
    }
}

/**
 * Carga las extracciones del día seleccionado
 */
async function cargarExtracciones() {
    try {
        const fecha = document.getElementById('fechaFiltro').value;
        const token = localStorage.getItem('auth_token');

        const response = await fetch(`${API_BASE}/extracciones?fecha=${fecha}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Error cargando extracciones');

        const data = await response.json();
        extraccionesActuales = data.extracciones || [];

        renderizarTablaExtracciones(extraccionesActuales);

    } catch (error) {
        console.error('Error cargando extracciones:', error);
        document.getElementById('tablaContainer').innerHTML = `
            <div class="alert alert-danger">Error cargando extracciones: ${error.message}</div>
        `;
    }
}

/**
 * Renderiza la tabla de extracciones del día
 */
function renderizarTablaExtracciones(extracciones) {
    const container = document.getElementById('tablaContainer');

    if (extracciones.length === 0) {
        container.innerHTML = '<div class="no-data"><p>No hay extracciones registradas para esta fecha</p></div>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover table-extracciones">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>Materia Prima</th>
                        <th>Cantidad</th>
                        <th>Motivo</th>
                        <th>Descripción</th>
                        <th>Usuario</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    extracciones.forEach(ext => {
        const hora = ext.hora ? ext.hora.substring(0, 5) : '--:--';
        const descripcion = ext.descripcion || '-';

        html += `
            <tr>
                <td><strong>${hora}</strong></td>
                <td>${ext.materia_prima_nombre}</td>
                <td><span class="badge bg-info">${ext.cantidad_extraida.toFixed(2)} ${ext.unidad_medida}</span></td>
                <td><small class="text-muted">${ext.motivo}</small></td>
                <td><small>${descripcion}</small></td>
                <td><small class="text-muted">${ext.usuario}</small></td>
                <td>
                    <button class="btn btn-sm btn-warning btn-accion" onclick="editarExtraccion(${ext.id})">
                        <i class="bi bi-pencil"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-danger btn-accion" onclick="eliminarExtraccion(${ext.id})">
                        <i class="bi bi-trash"></i> Eliminar
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Edita una extracción existente
 */
async function editarExtraccion(id) {
    const extraccion = extraccionesActuales.find(e => e.id === id);
    if (!extraccion) return;

    const nuevaCantidad = prompt(
        `Cantidad actual: ${extraccion.cantidad_extraida}\nNueva cantidad:`,
        extraccion.cantidad_extraida
    );

    if (nuevaCantidad === null || nuevaCantidad === '') return;

    try {
        const nuevaCantidadNum = parseFloat(nuevaCantidad);
        if (isNaN(nuevaCantidadNum) || nuevaCantidadNum <= 0) {
            mostrarAlerta('Cantidad inválida', 'danger');
            return;
        }

        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/extracciones/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                cantidad_extraida: nuevaCantidadNum,
                motivo: extraccion.motivo,
                descripcion: extraccion.descripcion
            })
        });

        const data = await response.json();

        if (!response.ok) {
            mostrarAlerta(data.message || 'Error actualizando extracción', 'danger');
            return;
        }

        mostrarAlerta('✓ Extracción actualizada', 'success');
        await cargarMateriasPrimas();
        await cargarExtracciones();

    } catch (error) {
        console.error('Error editando extracción:', error);
        mostrarAlerta('Error al actualizar extracción', 'danger');
    }
}

/**
 * Elimina una extracción
 */
async function eliminarExtraccion(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta extracción? El stock será revertido.')) {
        return;
    }

    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/extracciones/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (!response.ok) {
            mostrarAlerta(data.message || 'Error eliminando extracción', 'danger');
            return;
        }

        mostrarAlerta('✓ Extracción eliminada y stock revertido', 'success');
        await cargarMateriasPrimas();
        await cargarExtracciones();

    } catch (error) {
        console.error('Error eliminando extracción:', error);
        mostrarAlerta('Error al eliminar extracción', 'danger');
    }
}

/**
 * Carga el historial de extracciones (últimos 7 días)
 */
async function cargarHistorial() {
    try {
        const token = localStorage.getItem('auth_token');
        const hoy = new Date();
        const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Obtener extracciones de los últimos 7 días
        const response = await fetch(`${API_BASE}/extracciones?limit=500`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Error cargando historial');

        const data = await response.json();
        const extracciones = data.extracciones || [];

        // Filtrar solo las de los últimos 7 días
        const historial = extracciones.filter(e => e.fecha >= hace7Dias).slice(0, 50);

        renderizarHistorial(historial);

    } catch (error) {
        console.error('Error cargando historial:', error);
        document.getElementById('historialContainer').innerHTML = `
            <div class="alert alert-danger">Error cargando historial: ${error.message}</div>
        `;
    }
}

/**
 * Renderiza el historial de extracciones
 */
function renderizarHistorial(extracciones) {
    const container = document.getElementById('historialContainer');

    if (extracciones.length === 0) {
        container.innerHTML = '<div class="no-data"><p>No hay extracciones en los últimos 7 días</p></div>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead class="table-light">
                    <tr>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Materia Prima</th>
                        <th>Cantidad</th>
                        <th>Motivo</th>
                        <th>Usuario</th>
                    </tr>
                </thead>
                <tbody>
    `;

    extracciones.forEach(ext => {
        const hora = ext.hora ? ext.hora.substring(0, 5) : '--:--';
        html += `
            <tr>
                <td>${ext.fecha}</td>
                <td>${hora}</td>
                <td>${ext.materia_prima_nombre}</td>
                <td><strong>${ext.cantidad_extraida.toFixed(2)} ${ext.unidad_medida}</strong></td>
                <td><small>${ext.motivo}</small></td>
                <td><small class="text-muted">${ext.usuario}</small></td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}
