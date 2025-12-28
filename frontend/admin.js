/**
 * Panel de Administración - Inventario y Proveedores
 * Sistema de Materia Prima para Pupusería
 * Nota: Funciones compartidas (escapeHtml, mostrarNotificacion, etc) están en utils.js
 */

const API_INV = '/api/inventario';
const API_POS = '/api/pos';

let materiaPrima = [];
let proveedores = [];
let productos = [];
let categorias = [];
let itemsOrden = [];

// ============ INICIALIZACIÓN ============

document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin JS cargado correctamente');
    cargarDatosIniciales().catch(err => console.error('Error en carga inicial:', err));
});

async function cargarDatosIniciales() {
    await Promise.all([
        cargarCategorias(),
        cargarProductosAdmin(),
        cargarEstadisticas(),
        cargarMateriaPrima(),
        cargarProveedores(),
        cargarMovimientos(),
        cargarAlertas()
    ]);
}

// ============ NAVEGACIÓN ============

// Toggle sidebar en móvil
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    const toggleBtn = document.querySelector('.sidebar-toggle');

    if (sidebar && backdrop) {
        sidebar.classList.toggle('show');
        backdrop.classList.toggle('show');

        // Cambiar icono del botón
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (sidebar.classList.contains('show')) {
                icon.className = 'bi bi-x-lg';
            } else {
                icon.className = 'bi bi-list';
            }
        }
    }
}

// Cerrar sidebar al redimensionar a escritorio
window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.querySelector('.sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
    }
});

function showSection(section) {
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));

    // Mostrar sección seleccionada
    document.getElementById(`section-${section}`).classList.add('active');
    event.target.classList.add('active');

    // Cerrar sidebar en móvil después de seleccionar
    if (window.innerWidth <= 992) {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.querySelector('.sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
    }

    // Recargar datos de la sección
    switch(section) {
        case 'dashboard':
            cargarEstadisticas();
            break;
        case 'productos':
            cargarProductosAdmin();
            cargarCategorias();
            break;
        case 'inventario':
            cargarMateriaPrima();
            break;
        case 'proveedores':
            cargarProveedores();
            break;
        case 'ordenes':
            cargarOrdenes();
            break;
        case 'movimientos':
            cargarMovimientos();
            break;
        case 'alertas':
            cargarAlertas();
            break;
        case 'usuarios':
            cargarUsuarios();
            break;
        case 'clientes':
            cargarClientes();
            cargarEstadisticasClientes();
            break;
    }
}

// ============ ESTADÍSTICAS / DASHBOARD ============

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_INV}/estadisticas`);
        if (!response.ok) {
            console.error(`Error cargando estadísticas: ${response.status}`);
            return;
        }
        const stats = await response.json();

        document.getElementById('stat-productos').textContent = stats.total_materias || 0;
        document.getElementById('stat-valor').textContent = `$${(stats.valor_inventario || 0).toFixed(2)}`;
        document.getElementById('stat-bajo-stock').textContent = (stats.materias_bajo_stock || 0) + (stats.materias_agotadas || 0);
        document.getElementById('stat-proveedores').textContent = stats.proveedores_activos || 0;

        // Cargar alertas para dashboard
        const alertasResp = await fetch(`${API_INV}/alertas`);
        if (!alertasResp.ok) {
            console.error(`Error cargando alertas: ${alertasResp.status}`);
            return;
        }
        const alertas = await alertasResp.json();
        renderDashboardAlertas(alertas.slice(0, 5));

        // Cargar últimos movimientos para dashboard
        const movResp = await fetch(`${API_INV}/movimientos?limit=5`);
        if (!movResp.ok) {
            console.error(`Error cargando movimientos: ${movResp.status}`);
            return;
        }
        const movimientos = await movResp.json();
        renderDashboardMovimientos(movimientos);

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

function renderDashboardAlertas(alertas) {
    const container = document.getElementById('dashboard-alertas');

    if (alertas.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay alertas de stock</p>';
        return;
    }

    container.innerHTML = `
        <table class="table table-sm">
            <tbody>
                ${alertas.map(a => `
                    <tr>
                        <td>${escapeHtml(a.nombre)}</td>
                        <td>
                            <span class="badge ${a.stock_actual <= 0 ? 'bg-danger' : 'bg-warning'}">
                                ${escapeHtml(String(a.stock_actual))} ${escapeHtml(a.unidad_medida)} / ${escapeHtml(String(a.stock_minimo))}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderDashboardMovimientos(movimientos) {
    const container = document.getElementById('dashboard-movimientos');

    if (movimientos.length === 0) {
        container.innerHTML = '<p class="text-muted">No hay movimientos recientes</p>';
        return;
    }

    container.innerHTML = `
        <table class="table table-sm">
            <tbody>
                ${movimientos.map(m => `
                    <tr>
                        <td><small>${escapeHtml(formatDateTime(m.created_at))}</small></td>
                        <td>${escapeHtml(m.materia_nombre)}</td>
                        <td>
                            <span class="badge ${m.tipo === 'entrada' ? 'bg-success' : m.tipo === 'salida' ? 'bg-danger' : 'bg-secondary'}">
                                ${m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : ''}${escapeHtml(String(m.cantidad))}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ============ PRODUCTOS ============

async function cargarProductosAdmin() {
    try {
        const response = await fetch(`${API_POS}/productos`);
        productos = await response.json();
        renderProductosTabla();
        actualizarSelectProductos();
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function actualizarSelectProductos() {
    // Los selects de ajuste y órdenes ahora usan materia prima
    actualizarSelectMateriaPrima();
}

async function cargarCategorias() {
    try {
        const response = await fetch(`${API_POS}/categorias`);
        categorias = await response.json();
        renderCategoriasTabla();
        actualizarSelectCategorias();
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }
}

function actualizarSelectCategorias() {
    // Select en modal de producto
    const selectProd = document.getElementById('producto-categoria');
    if (selectProd) {
        const currentValue = selectProd.value;
        selectProd.innerHTML = '<option value="">Seleccionar categoría...</option>' +
            categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        selectProd.value = currentValue;
    }

    // Select en filtro de productos
    const selectFiltro = document.getElementById('filtro-categoria-prod');
    if (selectFiltro) {
        const currentValue = selectFiltro.value;
        selectFiltro.innerHTML = '<option value="">Todas las categorías</option>' +
            categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        selectFiltro.value = currentValue;
    }
}

function renderProductosTabla() {
    const tbody = document.querySelector('#tabla-productos tbody');
    if (!tbody) return;

    const filtroCategoria = document.getElementById('filtro-categoria-prod')?.value || '';
    const filtroDisponible = document.getElementById('filtro-disponible-prod')?.value || '';
    const busqueda = (document.getElementById('buscar-producto')?.value || '').toLowerCase();

    // Filtrar productos
    let productosFiltrados = productos;

    if (filtroCategoria) {
        productosFiltrados = productosFiltrados.filter(p => p.categoria_id == filtroCategoria);
    }
    if (filtroDisponible !== '') {
        productosFiltrados = productosFiltrados.filter(p => p.disponible == (filtroDisponible === '1' ? 1 : 0));
    }
    if (busqueda) {
        productosFiltrados = productosFiltrados.filter(p =>
            p.nombre.toLowerCase().includes(busqueda) ||
            (p.descripcion || '').toLowerCase().includes(busqueda)
        );
    }

    if (productosFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay productos</td></tr>';
        return;
    }

    tbody.innerHTML = productosFiltrados.map(prod => {
        const categoria = categorias.find(c => c.id === prod.categoria_id);
        const materiaPrimaVinculada = prod.materia_prima_id ?
            materiaPrima.find(m => m.id === prod.materia_prima_id) : null;

        return `
            <tr class="${!prod.disponible ? 'table-secondary' : ''}">
                <td><strong>${escapeHtml(prod.nombre)}</strong></td>
                <td><small>${escapeHtml(prod.descripcion || '-')}</small></td>
                <td>${categoria ? escapeHtml(categoria.nombre) : '-'}</td>
                <td><strong>$${parseFloat(prod.precio).toFixed(2)}</strong></td>
                <td>
                    ${materiaPrimaVinculada ?
                        `<span class="badge bg-info">${escapeHtml(materiaPrimaVinculada.nombre)}</span>` :
                        '<span class="text-muted">-</span>'}
                </td>
                <td>
                    <span class="badge ${prod.disponible ? 'bg-success' : 'bg-secondary'}">
                        ${prod.disponible ? 'Sí' : 'No'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editarProducto(${prod.id})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${prod.id})" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderCategoriasTabla() {
    const tbody = document.querySelector('#tabla-categorias tbody');
    if (!tbody) return;

    if (categorias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay categorías</td></tr>';
        return;
    }

    tbody.innerHTML = categorias.map(cat => {
        const numProductos = productos.filter(p => p.categoria_id === cat.id).length;
        return `
            <tr>
                <td>${cat.id}</td>
                <td><strong>${cat.nombre}</strong></td>
                <td><span class="badge bg-secondary">${numProductos}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editarCategoria(${cat.id})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    ${numProductos === 0 ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria(${cat.id})" title="Eliminar">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function mostrarModalProducto() {
    // Actualizar select de categorías primero
    actualizarSelectCategorias();

    document.getElementById('producto-id').value = '';
    document.getElementById('producto-nombre').value = '';
    document.getElementById('producto-precio').value = '';
    document.getElementById('producto-descripcion').value = '';
    document.getElementById('producto-categoria').value = '';
    document.getElementById('producto-materia-prima').value = '';
    document.getElementById('producto-tiempo').value = '5';
    document.getElementById('producto-disponible').value = '1';
    document.getElementById('modal-producto-titulo').textContent = 'Nuevo Producto';

    // Actualizar select de materia prima (solo productos de consumo)
    const selectMateria = document.getElementById('producto-materia-prima');
    if (selectMateria) {
        selectMateria.innerHTML = '<option value="">Sin vincular (producto preparado)</option>' +
            materiaPrima.filter(m => m.tipo === 'producto').map(m =>
                `<option value="${m.id}">${m.nombre}</option>`
            ).join('');
    }

    const modalEl = document.getElementById('modalProducto');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function editarProducto(id) {
    try {
        const response = await fetch(`${API_POS}/productos/${id}`);
        const prod = await response.json();

        // Actualizar select de categorías primero
        actualizarSelectCategorias();

        document.getElementById('producto-id').value = prod.id;
        document.getElementById('producto-nombre').value = prod.nombre || '';
        document.getElementById('producto-precio').value = prod.precio || '';
        document.getElementById('producto-descripcion').value = prod.descripcion || '';
        document.getElementById('producto-categoria').value = prod.categoria_id || '';
        document.getElementById('producto-tiempo').value = prod.tiempo_preparacion || 5;
        document.getElementById('producto-disponible').value = prod.disponible ? '1' : '0';
        document.getElementById('modal-producto-titulo').textContent = 'Editar Producto';

        // Actualizar select de materia prima
        const selectMateria = document.getElementById('producto-materia-prima');
        if (selectMateria) {
            selectMateria.innerHTML = '<option value="">Sin vincular (producto preparado)</option>' +
                materiaPrima.filter(m => m.tipo === 'producto').map(m =>
                    `<option value="${m.id}">${m.nombre}</option>`
                ).join('');
            selectMateria.value = prod.materia_prima_id || '';
        }

        const modalEl = document.getElementById('modalProducto');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    } catch (error) {
        console.error('Error cargando producto:', error);
        mostrarNotificacion('Error', 'No se pudo cargar el producto', 'danger');
    }
}

async function guardarProducto() {
    const id = document.getElementById('producto-id').value;
    const data = {
        nombre: document.getElementById('producto-nombre').value.trim(),
        precio: parseFloat(document.getElementById('producto-precio').value),
        descripcion: document.getElementById('producto-descripcion').value.trim(),
        categoria_id: parseInt(document.getElementById('producto-categoria').value) || null,
        materia_prima_id: parseInt(document.getElementById('producto-materia-prima').value) || null,
        tiempo_preparacion: parseInt(document.getElementById('producto-tiempo').value) || 5,
        disponible: document.getElementById('producto-disponible').value === '1'
    };

    if (!data.nombre || !data.precio) {
        mostrarNotificacion('Error', 'Nombre y precio son requeridos', 'danger');
        return;
    }

    if (!data.categoria_id) {
        mostrarNotificacion('Error', 'Debe seleccionar una categoría', 'danger');
        return;
    }

    try {
        const url = id ? `${API_POS}/productos/${id}` : `${API_POS}/productos`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && (result.success || result.producto_id || result.id)) {
            const modalEl = document.getElementById('modalProducto');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
            mostrarNotificacion('Guardado', `Producto ${id ? 'actualizado' : 'creado'} correctamente`, 'success');
            cargarProductosAdmin();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al guardar', 'danger');
        }
    } catch (error) {
        console.error('Error guardando producto:', error);
        mostrarNotificacion('Error', 'No se pudo guardar el producto', 'danger');
    }
}

async function eliminarProducto(id) {
    const prod = productos.find(p => p.id === id);
    if (!confirm(`¿Está seguro de eliminar el producto "${prod?.nombre}"?`)) return;

    try {
        const response = await fetch(`${API_POS}/productos/${id}`, { method: 'DELETE' });
        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion('Eliminado', 'Producto eliminado correctamente', 'success');
            cargarProductosAdmin();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al eliminar', 'danger');
        }
    } catch (error) {
        console.error('Error eliminando producto:', error);
        mostrarNotificacion('Error', 'No se pudo eliminar el producto', 'danger');
    }
}

function mostrarModalCategoria() {
    document.getElementById('categoria-id').value = '';
    document.getElementById('categoria-nombre').value = '';
    document.getElementById('modal-categoria-titulo').textContent = 'Nueva Categoría';

    const modalEl = document.getElementById('modalCategoria');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function editarCategoria(id) {
    const cat = categorias.find(c => c.id === id);
    if (!cat) return;

    document.getElementById('categoria-id').value = cat.id;
    document.getElementById('categoria-nombre').value = cat.nombre || '';
    document.getElementById('modal-categoria-titulo').textContent = 'Editar Categoría';

    const modalEl = document.getElementById('modalCategoria');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function guardarCategoria() {
    const id = document.getElementById('categoria-id').value;
    const nombre = document.getElementById('categoria-nombre').value.trim();

    if (!nombre) {
        mostrarNotificacion('Error', 'El nombre es requerido', 'danger');
        return;
    }

    try {
        const url = id ? `${API_POS}/categorias/${id}` : `${API_POS}/categorias`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });

        const result = await response.json();

        if (response.ok && (result.success || result.categoria_id || result.id)) {
            const modalEl = document.getElementById('modalCategoria');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
            mostrarNotificacion('Guardado', `Categoría ${id ? 'actualizada' : 'creada'} correctamente`, 'success');
            cargarCategorias();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al guardar', 'danger');
        }
    } catch (error) {
        console.error('Error guardando categoría:', error);
        mostrarNotificacion('Error', 'No se pudo guardar la categoría', 'danger');
    }
}

async function eliminarCategoria(id) {
    const cat = categorias.find(c => c.id === id);
    if (!confirm(`¿Está seguro de eliminar la categoría "${cat?.nombre}"?`)) return;

    try {
        const response = await fetch(`${API_POS}/categorias/${id}`, { method: 'DELETE' });
        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion('Eliminada', 'Categoría eliminada correctamente', 'success');
            cargarCategorias();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al eliminar', 'danger');
        }
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        mostrarNotificacion('Error', 'No se pudo eliminar la categoría', 'danger');
    }
}

function actualizarSelectMateriaPrima() {
    const selects = ['ajuste-materia', 'item-materia'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Seleccionar materia prima...</option>' +
                materiaPrima.map(m => `<option value="${m.id}">${m.nombre} (${m.unidad_medida})</option>`).join('');
            select.value = currentValue;
        }
    });
}

// ============ MATERIA PRIMA (INVENTARIO) ============

async function cargarMateriaPrima() {
    try {
        const response = await fetch(`${API_INV}/materia-prima`);
        materiaPrima = await response.json();
        renderMateriaPrima();
        actualizarSelectMateriaPrima();
    } catch (error) {
        console.error('Error cargando materia prima:', error);
    }
}

function renderMateriaPrima() {
    const tbody = document.querySelector('#tabla-inventario tbody');
    const filtroTipo = document.getElementById('filtro-tipo-inv')?.value || '';
    const filtroCategoria = document.getElementById('filtro-categoria-inv')?.value || '';

    // Filtrar datos
    let datosFiltrados = materiaPrima;
    if (filtroTipo) {
        datosFiltrados = datosFiltrados.filter(m => m.tipo === filtroTipo);
    }
    if (filtroCategoria) {
        datosFiltrados = datosFiltrados.filter(m => m.categoria === filtroCategoria);
    }

    // Actualizar select de categorías
    const categorias = [...new Set(materiaPrima.map(m => m.categoria))].sort();
    const selectCat = document.getElementById('filtro-categoria-inv');
    if (selectCat && selectCat.options.length <= 1) {
        categorias.forEach(cat => {
            if (cat) selectCat.add(new Option(cat, cat));
        });
    }

    tbody.innerHTML = datosFiltrados.map(item => {
        let estadoClass = 'badge-stock-ok';
        let estadoTexto = 'OK';

        if (item.stock_actual <= 0) {
            estadoClass = 'badge-stock-agotado';
            estadoTexto = 'Agotado';
        } else if (item.stock_actual <= item.stock_minimo) {
            estadoClass = 'badge-stock-bajo';
            estadoTexto = 'Bajo';
        }

        const tipoLabel = item.tipo === 'producto' ?
            '<span class="badge bg-info">Producto</span>' :
            '<span class="badge bg-secondary">Ingrediente</span>';

        return `
            <tr>
                <td><strong>${item.nombre}</strong></td>
                <td>${tipoLabel}</td>
                <td>${item.categoria || '-'}</td>
                <td>${item.stock_actual} ${item.unidad_medida}</td>
                <td>${item.stock_minimo} ${item.unidad_medida}</td>
                <td><span class="badge ${estadoClass}">${estadoTexto}</span></td>
                <td>$${(item.costo_promedio || 0).toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="verDetalleMateria(${item.id})" title="Ver detalle">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning" onclick="ajustarMateria(${item.id})" title="Ajustar stock">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function mostrarModalAjuste() {
    document.getElementById('ajuste-materia').value = '';
    document.getElementById('ajuste-tipo').value = 'entrada';
    document.getElementById('ajuste-cantidad').value = '';
    document.getElementById('ajuste-costo').value = '';
    document.getElementById('ajuste-motivo').value = '';
    toggleCostoField();

    const modal = new bootstrap.Modal(document.getElementById('modalAjuste'));
    modal.show();
}

function ajustarMateria(materiaId) {
    document.getElementById('ajuste-materia').value = materiaId;
    document.getElementById('ajuste-tipo').value = 'entrada';
    document.getElementById('ajuste-cantidad').value = '';
    document.getElementById('ajuste-costo').value = '';
    document.getElementById('ajuste-motivo').value = '';
    toggleCostoField();

    const modal = new bootstrap.Modal(document.getElementById('modalAjuste'));
    modal.show();
}

function toggleCostoField() {
    const tipo = document.getElementById('ajuste-tipo').value;
    document.getElementById('ajuste-costo-container').style.display = tipo === 'entrada' ? 'block' : 'none';
}

async function realizarAjuste() {
    const materiaId = document.getElementById('ajuste-materia').value;
    const tipo = document.getElementById('ajuste-tipo').value;
    const cantidad = parseFloat(document.getElementById('ajuste-cantidad').value);
    const costoUnitario = parseFloat(document.getElementById('ajuste-costo').value) || null;
    const motivo = document.getElementById('ajuste-motivo').value;

    if (!materiaId || !cantidad) {
        mostrarNotificacion('Error', 'Materia prima y cantidad son requeridos', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_INV}/materia-prima/${materiaId}/ajuste`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo,
                cantidad,
                costo_unitario: costoUnitario,
                motivo,
                usuario: 'Admin'
            })
        });

        const result = await response.json();

        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalAjuste')).hide();
            mostrarNotificacion('Ajuste Aplicado',
                `Stock actualizado: ${result.stock_anterior} → ${result.stock_nuevo}`, 'success');
            cargarMateriaPrima();
            cargarEstadisticas();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error realizando ajuste:', error);
        mostrarNotificacion('Error', 'No se pudo realizar el ajuste', 'danger');
    }
}

async function verDetalleMateria(materiaId) {
    try {
        const response = await fetch(`${API_INV}/materia-prima/${materiaId}`);
        const data = await response.json();
        alert(`Materia Prima: ${data.nombre}\nUnidad: ${data.unidad_medida}\nCategoría: ${data.categoria || '-'}\nStock: ${data.stock_actual} ${data.unidad_medida}\nMínimo: ${data.stock_minimo} ${data.unidad_medida}\nCosto Promedio: $${(data.costo_promedio || 0).toFixed(2)}/${data.unidad_medida}`);
    } catch (error) {
        console.error('Error:', error);
    }
}

// ============ PROVEEDORES ============

async function cargarProveedores() {
    try {
        const response = await fetch(`${API_INV}/proveedores?activos=false`);
        proveedores = await response.json();
        renderProveedores();
        actualizarSelectProveedores();
    } catch (error) {
        console.error('Error cargando proveedores:', error);
    }
}

function renderProveedores() {
    const tbody = document.querySelector('#tabla-proveedores tbody');

    tbody.innerHTML = proveedores.map(prov => `
        <tr class="${!prov.activo ? 'table-secondary' : ''}">
            <td><code>${prov.codigo}</code></td>
            <td><strong>${prov.nombre}</strong></td>
            <td>${prov.telefono || '-'}</td>
            <td>${prov.contacto_nombre || '-'}</td>
            <td>${prov.condiciones_pago}${prov.dias_credito > 0 ? ` (${prov.dias_credito} días)` : ''}</td>
            <td>
                <span class="badge ${prov.activo ? 'bg-success' : 'bg-secondary'}">
                    ${prov.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editarProveedor(${prov.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                ${prov.activo ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="desactivarProveedor(${prov.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function actualizarSelectProveedores() {
    const select = document.getElementById('orden-proveedor');
    if (select) {
        select.innerHTML = '<option value="">Seleccionar proveedor...</option>' +
            proveedores.filter(p => p.activo).map(p =>
                `<option value="${p.id}">${p.nombre}</option>`
            ).join('');
    }
}

function mostrarModalProveedor() {
    document.getElementById('proveedor-id').value = '';
    document.getElementById('proveedor-nombre').value = '';
    document.getElementById('proveedor-nombre-comercial').value = '';
    document.getElementById('proveedor-nit').value = '';
    document.getElementById('proveedor-nrc').value = '';
    document.getElementById('proveedor-direccion').value = '';
    document.getElementById('proveedor-telefono').value = '';
    document.getElementById('proveedor-correo').value = '';
    document.getElementById('proveedor-contacto').value = '';
    document.getElementById('proveedor-contacto-tel').value = '';
    document.getElementById('proveedor-condiciones').value = 'contado';
    document.getElementById('proveedor-dias-credito').value = '0';
    document.getElementById('proveedor-notas').value = '';
    document.getElementById('modal-proveedor-titulo').textContent = 'Nuevo Proveedor';

    const modal = new bootstrap.Modal(document.getElementById('modalProveedor'));
    modal.show();
}

async function editarProveedor(id) {
    try {
        const response = await fetch(`${API_INV}/proveedores/${id}`);
        const prov = await response.json();

        document.getElementById('proveedor-id').value = prov.id;
        document.getElementById('proveedor-nombre').value = prov.nombre || '';
        document.getElementById('proveedor-nombre-comercial').value = prov.nombre_comercial || '';
        document.getElementById('proveedor-nit').value = prov.nit || '';
        document.getElementById('proveedor-nrc').value = prov.nrc || '';
        document.getElementById('proveedor-direccion').value = prov.direccion || '';
        document.getElementById('proveedor-telefono').value = prov.telefono || '';
        document.getElementById('proveedor-correo').value = prov.correo || '';
        document.getElementById('proveedor-contacto').value = prov.contacto_nombre || '';
        document.getElementById('proveedor-contacto-tel').value = prov.contacto_telefono || '';
        document.getElementById('proveedor-condiciones').value = prov.condiciones_pago || 'contado';
        document.getElementById('proveedor-dias-credito').value = prov.dias_credito || 0;
        document.getElementById('proveedor-notas').value = prov.notas || '';
        document.getElementById('modal-proveedor-titulo').textContent = 'Editar Proveedor';

        const modal = new bootstrap.Modal(document.getElementById('modalProveedor'));
        modal.show();
    } catch (error) {
        console.error('Error cargando proveedor:', error);
    }
}

async function guardarProveedor() {
    const id = document.getElementById('proveedor-id').value;
    const data = {
        nombre: document.getElementById('proveedor-nombre').value,
        nombre_comercial: document.getElementById('proveedor-nombre-comercial').value,
        nit: document.getElementById('proveedor-nit').value,
        nrc: document.getElementById('proveedor-nrc').value,
        direccion: document.getElementById('proveedor-direccion').value,
        telefono: document.getElementById('proveedor-telefono').value,
        correo: document.getElementById('proveedor-correo').value,
        contacto_nombre: document.getElementById('proveedor-contacto').value,
        contacto_telefono: document.getElementById('proveedor-contacto-tel').value,
        condiciones_pago: document.getElementById('proveedor-condiciones').value,
        dias_credito: parseInt(document.getElementById('proveedor-dias-credito').value) || 0,
        notas: document.getElementById('proveedor-notas').value
    };

    if (!data.nombre) {
        mostrarNotificacion('Error', 'El nombre es requerido', 'danger');
        return;
    }

    try {
        const url = id ? `${API_INV}/proveedores/${id}` : `${API_INV}/proveedores`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success || result.proveedor_id) {
            bootstrap.Modal.getInstance(document.getElementById('modalProveedor')).hide();
            mostrarNotificacion('Guardado', 'Proveedor guardado correctamente', 'success');
            cargarProveedores();
            cargarEstadisticas();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error guardando proveedor:', error);
        mostrarNotificacion('Error', 'No se pudo guardar el proveedor', 'danger');
    }
}

async function desactivarProveedor(id) {
    if (!confirm('¿Está seguro de desactivar este proveedor?')) return;

    try {
        await fetch(`${API_INV}/proveedores/${id}`, { method: 'DELETE' });
        mostrarNotificacion('Proveedor Desactivado', 'El proveedor ha sido desactivado', 'success');
        cargarProveedores();
    } catch (error) {
        console.error('Error:', error);
    }
}

// ============ ÓRDENES DE COMPRA ============

async function cargarOrdenes() {
    try {
        const response = await fetch(`${API_INV}/ordenes-compra`);
        const ordenes = await response.json();
        renderOrdenes(ordenes);
    } catch (error) {
        console.error('Error cargando órdenes:', error);
    }
}

function renderOrdenes(ordenes) {
    const tbody = document.querySelector('#tabla-ordenes tbody');

    if (ordenes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay órdenes de compra</td></tr>';
        return;
    }

    const estadoClases = {
        'borrador': 'bg-secondary',
        'enviada': 'bg-primary',
        'parcial': 'bg-warning',
        'recibida': 'bg-success',
        'cancelada': 'bg-danger'
    };

    tbody.innerHTML = ordenes.map(orden => `
        <tr>
            <td><code>${orden.numero}</code></td>
            <td>${orden.proveedor_nombre}</td>
            <td>${orden.fecha_orden || '-'}</td>
            <td>$${orden.total.toFixed(2)}</td>
            <td><span class="badge ${estadoClases[orden.estado] || 'bg-secondary'}">${orden.estado}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="verOrden(${orden.id})">
                    <i class="bi bi-eye"></i>
                </button>
                ${['borrador', 'enviada', 'parcial'].includes(orden.estado) ? `
                    <button class="btn btn-sm btn-outline-success" onclick="abrirModalRecibir(${orden.id})">
                        <i class="bi bi-box-arrow-in-down"></i> Recibir
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function mostrarModalOrden() {
    itemsOrden = [];
    document.getElementById('orden-proveedor').value = '';
    document.getElementById('orden-fecha-esperada').value = '';
    document.getElementById('orden-notas').value = '';
    document.getElementById('item-materia').value = '';
    document.getElementById('item-cantidad').value = '';
    document.getElementById('item-costo').value = '';
    renderItemsOrden();

    const modal = new bootstrap.Modal(document.getElementById('modalOrden'));
    modal.show();
}

function agregarItemOrden() {
    const materiaId = document.getElementById('item-materia').value;
    const cantidad = parseFloat(document.getElementById('item-cantidad').value);
    const costo = parseFloat(document.getElementById('item-costo').value);

    if (!materiaId || !cantidad || !costo) {
        mostrarNotificacion('Error', 'Complete todos los campos del item', 'warning');
        return;
    }

    const materia = materiaPrima.find(m => m.id == materiaId);

    // Verificar si ya existe la materia
    const existente = itemsOrden.find(i => i.materia_prima_id == materiaId);
    if (existente) {
        existente.cantidad += cantidad;
        existente.subtotal = existente.cantidad * existente.costo_unitario;
    } else {
        itemsOrden.push({
            materia_prima_id: materiaId,
            materia_nombre: materia.nombre,
            unidad_medida: materia.unidad_medida,
            cantidad,
            costo_unitario: costo,
            subtotal: cantidad * costo
        });
    }

    document.getElementById('item-materia').value = '';
    document.getElementById('item-cantidad').value = '';
    document.getElementById('item-costo').value = '';

    renderItemsOrden();
}

function eliminarItemOrden(index) {
    itemsOrden.splice(index, 1);
    renderItemsOrden();
}

function renderItemsOrden() {
    const tbody = document.querySelector('#tabla-items-orden tbody');

    tbody.innerHTML = itemsOrden.map((item, index) => `
        <tr>
            <td>${item.materia_nombre}</td>
            <td>${item.cantidad} ${item.unidad_medida}</td>
            <td>$${item.costo_unitario.toFixed(2)}/${item.unidad_medida}</td>
            <td>$${item.subtotal.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarItemOrden(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Calcular totales
    const subtotal = itemsOrden.reduce((sum, i) => sum + i.subtotal, 0);
    const iva = calculateIVA(subtotal);
    const total = calculateTotal(subtotal);

    document.getElementById('orden-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('orden-iva').textContent = `$${iva.toFixed(2)}`;
    document.getElementById('orden-total').innerHTML = `<strong>$${total.toFixed(2)}</strong>`;
}

async function crearOrdenCompra() {
    const proveedorId = document.getElementById('orden-proveedor').value;

    if (!proveedorId) {
        mostrarNotificacion('Error', 'Seleccione un proveedor', 'danger');
        return;
    }

    if (itemsOrden.length === 0) {
        mostrarNotificacion('Error', 'Agregue al menos un item', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_INV}/ordenes-compra`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proveedor_id: proveedorId,
                fecha_esperada: document.getElementById('orden-fecha-esperada').value || null,
                notas: document.getElementById('orden-notas').value,
                items: itemsOrden.map(i => ({
                    materia_prima_id: i.materia_prima_id,
                    cantidad: i.cantidad,
                    costo_unitario: i.costo_unitario
                }))
            })
        });

        const result = await response.json();

        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalOrden')).hide();
            mostrarNotificacion('Orden Creada', `Orden ${result.numero} creada. Total: $${result.total.toFixed(2)}`, 'success');
            cargarOrdenes();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error creando orden:', error);
        mostrarNotificacion('Error', 'No se pudo crear la orden', 'danger');
    }
}

async function verOrden(id) {
    try {
        const response = await fetch(`${API_INV}/ordenes-compra/${id}`);
        const orden = await response.json();
        alert(`Orden: ${orden.numero}\nProveedor: ${orden.proveedor_nombre}\nTotal: $${orden.total.toFixed(2)}\nEstado: ${orden.estado}\nItems: ${orden.items.length}`);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function abrirModalRecibir(ordenId) {
    try {
        const response = await fetch(`${API_INV}/ordenes-compra/${ordenId}`);
        const orden = await response.json();

        document.getElementById('recibir-orden-id').value = ordenId;

        const tbody = document.querySelector('#tabla-recibir-items tbody');
        tbody.innerHTML = orden.items.map(item => `
            <tr>
                <td>${item.materia_nombre}</td>
                <td>${item.cantidad_ordenada} ${item.unidad_medida || ''}</td>
                <td>${item.cantidad_recibida || 0}</td>
                <td>
                    <input type="number" class="form-control form-control-sm recibir-cantidad"
                           data-item-id="${item.id}"
                           value="${item.cantidad_ordenada - (item.cantidad_recibida || 0)}"
                           min="0" max="${item.cantidad_ordenada - (item.cantidad_recibida || 0)}"
                           step="0.01">
                </td>
            </tr>
        `).join('');

        const modal = new bootstrap.Modal(document.getElementById('modalRecibir'));
        modal.show();
    } catch (error) {
        console.error('Error:', error);
    }
}

async function procesarRecepcion() {
    const ordenId = document.getElementById('recibir-orden-id').value;
    const inputs = document.querySelectorAll('.recibir-cantidad');

    const items = [];
    inputs.forEach(input => {
        const cantidad = parseFloat(input.value) || 0;
        if (cantidad > 0) {
            items.push({
                item_id: input.dataset.itemId,
                cantidad_recibida: cantidad
            });
        }
    });

    if (items.length === 0) {
        mostrarNotificacion('Error', 'No hay items para recibir', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_INV}/ordenes-compra/${ordenId}/recibir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, usuario: 'Admin' })
        });

        const result = await response.json();

        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalRecibir')).hide();
            mostrarNotificacion('Recepción Procesada',
                `Estado: ${result.estado}. Recibido: ${result.total_recibido}/${result.total_ordenado}`, 'success');
            cargarOrdenes();
            cargarMateriaPrima();
            cargarEstadisticas();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error', 'No se pudo procesar la recepción', 'danger');
    }
}

// ============ MOVIMIENTOS ============

async function cargarMovimientos() {
    const tipo = document.getElementById('filtro-tipo-mov')?.value || '';

    try {
        let url = `${API_INV}/movimientos?limit=100`;
        if (tipo) url += `&tipo=${tipo}`;

        const response = await fetch(url);
        const movimientos = await response.json();
        renderMovimientos(movimientos);
    } catch (error) {
        console.error('Error cargando movimientos:', error);
    }
}

function renderMovimientos(movimientos) {
    const tbody = document.querySelector('#tabla-movimientos tbody');

    if (movimientos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay movimientos</td></tr>';
        return;
    }

    const tipoClases = {
        'entrada': 'bg-success',
        'salida': 'bg-danger',
        'ajuste': 'bg-secondary'
    };

    tbody.innerHTML = movimientos.map(m => `
        <tr>
            <td><small>${formatDateTime(m.created_at)}</small></td>
            <td>${m.materia_nombre}</td>
            <td><span class="badge ${tipoClases[m.tipo]}">${m.tipo}</span></td>
            <td>${m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : ''}${m.cantidad}</td>
            <td>${m.stock_anterior}</td>
            <td>${m.stock_nuevo}</td>
            <td><small>${m.motivo || '-'}</small></td>
        </tr>
    `).join('');
}

// ============ ALERTAS ============

async function cargarAlertas() {
    try {
        const response = await fetch(`${API_INV}/alertas`);
        const alertas = await response.json();
        renderAlertas(alertas);
    } catch (error) {
        console.error('Error cargando alertas:', error);
    }
}

function renderAlertas(alertas) {
    const container = document.getElementById('lista-alertas');

    if (alertas.length === 0) {
        container.innerHTML = `
            <div class="text-center text-success py-4">
                <i class="bi bi-check-circle fs-1"></i>
                <p class="mt-2">No hay alertas de stock. Todo está bien.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = alertas.map(a => `
        <div class="alert ${a.stock_actual <= 0 ? 'alert-danger' : 'alert-warning'} d-flex justify-content-between align-items-center">
            <div>
                <strong>${escapeHtml(a.nombre)}</strong>
                <span class="badge ${a.stock_actual <= 0 ? 'bg-danger' : 'bg-warning'} ms-2">
                    ${a.stock_actual <= 0 ? 'AGOTADO' : 'STOCK BAJO'}
                </span>
                <br>
                <small>Stock actual: ${a.stock_actual} ${escapeHtml(a.unidad_medida)} | Mínimo: ${a.stock_minimo} ${escapeHtml(a.unidad_medida)}</small>
            </div>
            <button class="btn btn-sm btn-outline-primary" onclick="ajustarMateria(${a.id})">
                <i class="bi bi-plus-circle"></i> Reabastecer
            </button>
        </div>
    `).join('');
}

// ============ UTILIDADES ============

// Nota: formatDateTime() y mostrarNotificacion() están centralizadas en utils.js

// ============ USUARIOS ============

const API_AUTH = '/api/auth';
let usuarios = [];

// Nota: getAuthToken() y getAuthHeaders() están en utils.js

async function cargarUsuarios() {
    try {
        const response = await fetch(`${API_AUTH}/usuarios`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }

        if (response.ok) {
            usuarios = await response.json();
            renderUsuariosTabla();
            cargarEstadisticasUsuarios();
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
    }
}

async function cargarEstadisticasUsuarios() {
    try {
        const response = await fetch(`${API_AUTH}/usuarios/estadisticas`, {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const stats = await response.json();
            document.getElementById('stat-users-total').textContent = stats.total || 0;
            document.getElementById('stat-users-managers').textContent = stats.managers || 0;
            document.getElementById('stat-users-meseros').textContent = stats.meseros || 0;
            document.getElementById('stat-users-cajeros').textContent = stats.cajeros || 0;
            document.getElementById('stat-users-cocineros').textContent = stats.cocineros || 0;
        }
    } catch (error) {
        console.error('Error cargando estadísticas usuarios:', error);
    }
}

function renderUsuariosTabla() {
    const tbody = document.querySelector('#tabla-usuarios tbody');
    if (!tbody) return;

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay usuarios</td></tr>';
        return;
    }

    const rolClases = {
        'manager': 'bg-purple',
        'mesero': 'bg-primary',
        'cajero': 'bg-success',
        'cocinero': 'bg-warning text-dark'
    };

    const rolIconos = {
        'manager': 'star-fill',
        'mesero': 'person-badge',
        'cajero': 'cash-register',
        'cocinero': 'fire'
    };

    tbody.innerHTML = usuarios.map(user => `
        <tr class="${!user.activo ? 'table-secondary' : ''}">
            <td><code>${user.username}</code></td>
            <td><strong>${user.nombre}</strong></td>
            <td>
                <span class="badge ${rolClases[user.rol] || 'bg-secondary'}" style="${user.rol === 'manager' ? 'background:#9b59b6!important' : ''}">
                    <i class="bi bi-${rolIconos[user.rol] || 'person'}"></i> ${user.rol}
                </span>
            </td>
            <td>
                <span class="badge ${user.activo ? 'bg-success' : 'bg-secondary'}">
                    ${user.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td><small>${user.ultimo_login ? formatDateTime(user.ultimo_login) : 'Nunca'}</small></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editarUsuario(${user.id})" title="Editar">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="mostrarResetPassword(${user.id}, '${user.nombre}')" title="Cambiar contraseña">
                    <i class="bi bi-key"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarUsuario(${user.id})" title="Desactivar">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function mostrarModalUsuario() {
    document.getElementById('usuario-id').value = '';
    document.getElementById('usuario-nombre').value = '';
    document.getElementById('usuario-username').value = '';
    document.getElementById('usuario-password').value = '';
    document.getElementById('usuario-rol').value = '';
    document.getElementById('usuario-activo').value = '1';
    document.getElementById('password-container').style.display = 'block';
    document.getElementById('usuario-activo-container').style.display = 'none';
    document.getElementById('usuario-username').disabled = false;
    document.getElementById('modal-usuario-titulo').textContent = 'Nuevo Usuario';

    const modalEl = document.getElementById('modalUsuario');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarUsuario(id) {
    const user = usuarios.find(u => u.id === id);
    if (!user) return;

    document.getElementById('usuario-id').value = user.id;
    document.getElementById('usuario-nombre').value = user.nombre;
    document.getElementById('usuario-username').value = user.username;
    document.getElementById('usuario-password').value = '';
    document.getElementById('usuario-rol').value = user.rol;
    document.getElementById('usuario-activo').value = user.activo ? '1' : '0';
    document.getElementById('password-container').style.display = 'none';
    document.getElementById('usuario-activo-container').style.display = 'block';
    document.getElementById('usuario-username').disabled = true;
    document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuario';

    const modalEl = document.getElementById('modalUsuario');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function guardarUsuario() {
    const id = document.getElementById('usuario-id').value;
    const nombre = document.getElementById('usuario-nombre').value.trim();
    const username = document.getElementById('usuario-username').value.trim().toLowerCase();
    const password = document.getElementById('usuario-password').value;
    const rol = document.getElementById('usuario-rol').value;
    const activo = document.getElementById('usuario-activo').value === '1';

    if (!nombre || !rol) {
        mostrarNotificacion('Error', 'Nombre y rol son requeridos', 'danger');
        return;
    }

    if (!id && (!username || !password)) {
        mostrarNotificacion('Error', 'Usuario y contraseña son requeridos para nuevo usuario', 'danger');
        return;
    }

    if (!id && password.length < 4) {
        mostrarNotificacion('Error', 'La contraseña debe tener al menos 4 caracteres', 'danger');
        return;
    }

    try {
        let url, method, body;

        if (id) {
            url = `${API_AUTH}/usuarios/${id}`;
            method = 'PUT';
            body = JSON.stringify({ nombre, rol, activo });
        } else {
            url = `${API_AUTH}/usuarios`;
            method = 'POST';
            body = JSON.stringify({ username, password, nombre, rol });
        }

        const response = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body
        });

        const result = await response.json();

        if (response.ok && (result.success || result.usuario_id)) {
            const modalEl = document.getElementById('modalUsuario');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
            mostrarNotificacion('Guardado', `Usuario ${id ? 'actualizado' : 'creado'} correctamente`, 'success');
            cargarUsuarios();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al guardar', 'danger');
        }
    } catch (error) {
        console.error('Error guardando usuario:', error);
        mostrarNotificacion('Error', 'No se pudo guardar el usuario', 'danger');
    }
}

function mostrarResetPassword(id, nombre) {
    document.getElementById('reset-usuario-id').value = id;
    document.getElementById('reset-usuario-nombre').textContent = nombre;
    document.getElementById('reset-password').value = '';

    const modalEl = document.getElementById('modalResetPassword');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function resetearPassword() {
    const id = document.getElementById('reset-usuario-id').value;
    const password = document.getElementById('reset-password').value;

    if (!password || password.length < 4) {
        mostrarNotificacion('Error', 'La contraseña debe tener al menos 4 caracteres', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_AUTH}/usuarios/${id}/reset-password`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const modalEl = document.getElementById('modalResetPassword');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
            mostrarNotificacion('Contraseña Restablecida', 'La contraseña ha sido cambiada', 'success');
        } else {
            mostrarNotificacion('Error', result.error || 'Error al restablecer', 'danger');
        }
    } catch (error) {
        console.error('Error reseteando password:', error);
        mostrarNotificacion('Error', 'No se pudo restablecer la contraseña', 'danger');
    }
}

async function eliminarUsuario(id) {
    const user = usuarios.find(u => u.id === id);
    if (!confirm(`¿Está seguro de desactivar al usuario "${user?.nombre}"?`)) return;

    try {
        const response = await fetch(`${API_AUTH}/usuarios/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion('Usuario Desactivado', 'El usuario ha sido desactivado', 'success');
            cargarUsuarios();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al desactivar', 'danger');
        }
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        mostrarNotificacion('Error', 'No se pudo desactivar el usuario', 'danger');
    }
}

function cerrarSesion() {
    if (!confirm('¿Está seguro de cerrar sesión?')) return;

    fetch(`${API_AUTH}/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
    }).finally(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });
}

// Exponer funciones globalmente para onclick handlers
window.showSection = showSection;
window.mostrarModalProducto = mostrarModalProducto;
window.mostrarModalCategoria = mostrarModalCategoria;
window.editarProducto = editarProducto;
window.eliminarProducto = eliminarProducto;
window.guardarProducto = guardarProducto;
window.editarCategoria = editarCategoria;
window.eliminarCategoria = eliminarCategoria;
window.guardarCategoria = guardarCategoria;
window.renderProductosTabla = renderProductosTabla;
window.mostrarModalAjuste = mostrarModalAjuste;
window.ajustarMateria = ajustarMateria;
window.toggleCostoField = toggleCostoField;
window.realizarAjuste = realizarAjuste;
window.verDetalleMateria = verDetalleMateria;
window.mostrarModalProveedor = mostrarModalProveedor;
window.editarProveedor = editarProveedor;
window.guardarProveedor = guardarProveedor;
window.desactivarProveedor = desactivarProveedor;
window.mostrarModalOrden = mostrarModalOrden;
window.agregarItemOrden = agregarItemOrden;
window.eliminarItemOrden = eliminarItemOrden;
window.crearOrdenCompra = crearOrdenCompra;
window.verOrden = verOrden;
window.abrirModalRecibir = abrirModalRecibir;
window.procesarRecepcion = procesarRecepcion;
window.cargarMovimientos = cargarMovimientos;
window.cargarMateriaPrima = cargarMateriaPrima;
window.cargarUsuarios = cargarUsuarios;
window.mostrarModalUsuario = mostrarModalUsuario;
window.editarUsuario = editarUsuario;
window.guardarUsuario = guardarUsuario;
window.mostrarResetPassword = mostrarResetPassword;
window.resetearPassword = resetearPassword;
window.eliminarUsuario = eliminarUsuario;
window.cerrarSesion = cerrarSesion;

// ============ GESTIÓN DE CLIENTES ============

const API_CLIENTES = '/api/clientes';
let clientes = [];
let timeoutBusquedaCliente = null;

async function cargarClientes() {
    try {
        const tipo = document.getElementById('filtro-tipo-cliente')?.value || '';
        const buscar = document.getElementById('buscar-cliente')?.value || '';

        let url = `${API_CLIENTES}/clientes?activo=1`;
        if (tipo) url += `&tipo=${tipo}`;
        if (buscar) url += `&buscar=${encodeURIComponent(buscar)}`;

        const response = await fetch(url);
        clientes = await response.json();
        renderTablaClientes();
    } catch (error) {
        console.error('Error cargando clientes:', error);
    }
}

async function cargarEstadisticasClientes() {
    try {
        const response = await fetch(`${API_CLIENTES}/clientes/estadisticas`);
        const stats = await response.json();

        document.getElementById('stat-clientes-total').textContent = stats.total || 0;
        document.getElementById('stat-clientes-contribuyentes').textContent = stats.por_tipo?.contribuyente || 0;
        document.getElementById('stat-clientes-consumidores').textContent = stats.por_tipo?.consumidor_final || 0;
        document.getElementById('stat-clientes-nuevos').textContent = stats.nuevos_mes || 0;
    } catch (error) {
        console.error('Error cargando estadísticas de clientes:', error);
    }
}

function renderTablaClientes() {
    const tbody = document.querySelector('#tabla-clientes tbody');

    if (clientes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="bi bi-person-x fs-1 d-block mb-2"></i>
                    No se encontraron clientes
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = clientes.map(cliente => `
        <tr>
            <td><code>${cliente.codigo}</code></td>
            <td>
                <strong>${cliente.nombre}</strong>
                ${cliente.nombre_comercial ? `<br><small class="text-muted">${cliente.nombre_comercial}</small>` : ''}
            </td>
            <td>
                ${cliente.numero_documento ?
                    `<span class="badge bg-secondary">${cliente.tipo_documento}</span> ${cliente.numero_documento}` :
                    '<span class="text-muted">-</span>'}
            </td>
            <td>${cliente.nrc || '<span class="text-muted">-</span>'}</td>
            <td>${cliente.telefono || '<span class="text-muted">-</span>'}</td>
            <td>
                <span class="badge ${cliente.tipo_cliente === 'contribuyente' ? 'bg-success' : 'bg-info'}">
                    ${cliente.tipo_cliente === 'contribuyente' ? 'Contribuyente' : 'Consumidor Final'}
                </span>
                ${cliente.credito_autorizado > 0 ? `<br><small class="text-warning"><i class="bi bi-credit-card"></i> $${cliente.credito_autorizado}</small>` : ''}
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-info" onclick="verHistorialCliente(${cliente.id})" title="Ver historial">
                        <i class="bi bi-clock-history"></i>
                    </button>
                    ${cliente.credito_autorizado > 0 ? `
                        <button class="btn btn-outline-warning" onclick="verCreditoCliente(${cliente.id})" title="Ver cr&eacute;dito">
                            <i class="bi bi-credit-card"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-outline-primary" onclick="editarCliente(${cliente.id})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="eliminarCliente(${cliente.id})" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function buscarClientes() {
    clearTimeout(timeoutBusquedaCliente);
    timeoutBusquedaCliente = setTimeout(() => {
        cargarClientes();
    }, 300);
}

function mostrarModalCliente() {
    // Limpiar formulario
    document.getElementById('cliente-id').value = '';
    document.getElementById('cliente-tipo').value = 'consumidor_final';
    document.getElementById('cliente-tipo-doc').value = 'DUI';
    document.getElementById('cliente-documento').value = '';
    document.getElementById('cliente-nrc').value = '';
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-nombre-comercial').value = '';
    document.getElementById('cliente-telefono').value = '';
    document.getElementById('cliente-email').value = '';
    document.getElementById('cliente-direccion').value = '';
    document.getElementById('cliente-departamento').value = '';
    document.getElementById('cliente-municipio').value = '';
    document.getElementById('cliente-actividad').value = '';
    document.getElementById('cliente-credito').value = '0';
    document.getElementById('cliente-dias-credito').value = '0';
    document.getElementById('cliente-notas').value = '';

    // Actualizar título
    document.getElementById('modal-cliente-titulo').textContent = 'Nuevo Cliente';

    // Ocultar campos de contribuyente
    toggleCamposContribuyente();

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalCliente'));
    modal.show();
}

async function editarCliente(id) {
    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${id}`);
        const cliente = await response.json();

        if (response.ok) {
            document.getElementById('cliente-id').value = cliente.id;
            document.getElementById('cliente-tipo').value = cliente.tipo_cliente || 'consumidor_final';
            document.getElementById('cliente-tipo-doc').value = cliente.tipo_documento || 'DUI';
            document.getElementById('cliente-documento').value = cliente.numero_documento || '';
            document.getElementById('cliente-nrc').value = cliente.nrc || '';
            document.getElementById('cliente-nombre').value = cliente.nombre || '';
            document.getElementById('cliente-nombre-comercial').value = cliente.nombre_comercial || '';
            document.getElementById('cliente-telefono').value = cliente.telefono || '';
            document.getElementById('cliente-email').value = cliente.email || '';
            document.getElementById('cliente-direccion').value = cliente.direccion || '';
            document.getElementById('cliente-departamento').value = cliente.departamento || '';
            document.getElementById('cliente-municipio').value = cliente.municipio || '';
            document.getElementById('cliente-actividad').value = cliente.actividad_economica || '';
            document.getElementById('cliente-credito').value = cliente.credito_autorizado || 0;
            document.getElementById('cliente-dias-credito').value = cliente.dias_credito || 0;
            document.getElementById('cliente-notas').value = cliente.notas || '';

            // Actualizar título
            document.getElementById('modal-cliente-titulo').textContent = 'Editar Cliente';

            // Mostrar/ocultar campos de contribuyente
            toggleCamposContribuyente();

            // Mostrar modal
            const modal = new bootstrap.Modal(document.getElementById('modalCliente'));
            modal.show();
        }
    } catch (error) {
        console.error('Error cargando cliente:', error);
        mostrarNotificacion('Error', 'No se pudo cargar el cliente', 'danger');
    }
}

async function guardarCliente() {
    const id = document.getElementById('cliente-id').value;
    const nombre = document.getElementById('cliente-nombre').value.trim();

    if (!nombre) {
        mostrarNotificacion('Error', 'El nombre es requerido', 'danger');
        return;
    }

    const data = {
        tipo_cliente: document.getElementById('cliente-tipo').value,
        tipo_documento: document.getElementById('cliente-tipo-doc').value,
        numero_documento: document.getElementById('cliente-documento').value.trim(),
        nrc: document.getElementById('cliente-nrc').value.trim(),
        nombre: nombre,
        nombre_comercial: document.getElementById('cliente-nombre-comercial').value.trim(),
        telefono: document.getElementById('cliente-telefono').value.trim(),
        email: document.getElementById('cliente-email').value.trim(),
        direccion: document.getElementById('cliente-direccion').value.trim(),
        departamento: document.getElementById('cliente-departamento').value,
        municipio: document.getElementById('cliente-municipio').value.trim(),
        actividad_economica: document.getElementById('cliente-actividad').value.trim(),
        credito_autorizado: parseFloat(document.getElementById('cliente-credito').value) || 0,
        dias_credito: parseInt(document.getElementById('cliente-dias-credito').value) || 0,
        notas: document.getElementById('cliente-notas').value.trim()
    };

    try {
        const url = id ? `${API_CLIENTES}/clientes/${id}` : `${API_CLIENTES}/clientes`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalCliente')).hide();
            mostrarNotificacion('Guardado', result.mensaje || 'Cliente guardado correctamente', 'success');
            cargarClientes();
            cargarEstadisticasClientes();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al guardar cliente', 'danger');
        }
    } catch (error) {
        console.error('Error guardando cliente:', error);
        mostrarNotificacion('Error', 'No se pudo guardar el cliente', 'danger');
    }
}

async function eliminarCliente(id) {
    const cliente = clientes.find(c => c.id === id);

    if (!confirm(`¿Está seguro de eliminar al cliente "${cliente?.nombre}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion('Eliminado', 'Cliente eliminado correctamente', 'success');
            cargarClientes();
            cargarEstadisticasClientes();
        } else {
            mostrarNotificacion('Error', result.error || 'Error al eliminar cliente', 'danger');
        }
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        mostrarNotificacion('Error', 'No se pudo eliminar el cliente', 'danger');
    }
}

function toggleCamposContribuyente() {
    const tipoCliente = document.getElementById('cliente-tipo').value;
    const camposContribuyente = document.getElementById('campos-contribuyente');
    const campoNrc = document.getElementById('campo-nrc');
    const campoNombreComercial = document.getElementById('campo-nombre-comercial');

    if (tipoCliente === 'contribuyente') {
        camposContribuyente.style.display = 'block';
        campoNrc.style.display = 'block';
        campoNombreComercial.style.display = 'block';
    } else {
        camposContribuyente.style.display = 'none';
        campoNrc.style.display = 'none';
        campoNombreComercial.style.display = 'none';
    }
}

function exportarClientes() {
    // Crear CSV
    let csv = 'Codigo,Nombre,Nombre Comercial,Tipo Documento,Numero Documento,NRC,Telefono,Email,Direccion,Departamento,Municipio,Tipo Cliente\n';

    clientes.forEach(c => {
        csv += `"${c.codigo}","${c.nombre}","${c.nombre_comercial || ''}","${c.tipo_documento}","${c.numero_documento || ''}","${c.nrc || ''}","${c.telefono || ''}","${c.email || ''}","${c.direccion || ''}","${c.departamento || ''}","${c.municipio || ''}","${c.tipo_cliente}"\n`;
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// ============ HISTORIAL Y CRÉDITO DE CLIENTES ============

async function verHistorialCliente(id) {
    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${id}/historial`);
        const data = await response.json();

        if (!response.ok) {
            mostrarNotificacion('Error', data.error || 'Error al cargar historial', 'danger');
            return;
        }

        // Llenar nombre del cliente
        document.getElementById('historial-cliente-nombre').textContent = data.cliente.nombre;

        // Estadísticas
        document.getElementById('historial-total-pedidos').textContent = data.estadisticas.total_pedidos || 0;
        document.getElementById('historial-total-compras').textContent = `$${(data.estadisticas.total_compras || 0).toFixed(2)}`;
        document.getElementById('historial-promedio').textContent = `$${(data.estadisticas.promedio_compra || 0).toFixed(2)}`;
        document.getElementById('historial-ultima-compra').textContent = data.estadisticas.ultima_compra ?
            formatDateTime(data.estadisticas.ultima_compra) : 'Nunca';

        // Productos favoritos
        const favoritosEl = document.getElementById('historial-productos-favoritos');
        if (data.productos_favoritos.length > 0) {
            favoritosEl.innerHTML = data.productos_favoritos.map(p => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${p.producto}
                    <span class="badge bg-primary rounded-pill">${p.cantidad_total} uds</span>
                </li>
            `).join('');
        } else {
            favoritosEl.innerHTML = '<li class="list-group-item text-muted">Sin datos</li>';
        }

        // Tabla de pedidos
        const tablaEl = document.getElementById('historial-pedidos-tabla');
        if (data.pedidos.length > 0) {
            tablaEl.innerHTML = data.pedidos.map(p => {
                const estadoClase = {
                    'cerrado': 'bg-success',
                    'pagado': 'bg-primary',
                    'cancelado': 'bg-danger',
                    'pendiente_pago': 'bg-warning'
                }[p.estado] || 'bg-secondary';

                return `
                    <tr>
                        <td><strong>#${p.id}</strong></td>
                        <td>${formatDateTime(p.fecha)}</td>
                        <td>$${(p.total || 0).toFixed(2)}</td>
                        <td><span class="badge ${estadoClase}">${p.estado}</span></td>
                        <td>
                            ${p.dte_numero_control ?
                                `<code>${p.dte_numero_control}</code>` :
                                '<span class="text-muted">-</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tablaEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin pedidos</td></tr>';
        }

        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('modalHistorialCliente'));
        modal.show();
    } catch (error) {
        console.error('Error cargando historial:', error);
        mostrarNotificacion('Error', 'No se pudo cargar el historial', 'danger');
    }
}

async function verCreditoCliente(id) {
    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${id}/credito`);
        const data = await response.json();

        if (!response.ok) {
            mostrarNotificacion('Error', data.error || 'Error al cargar crédito', 'danger');
            return;
        }

        // Nombre del cliente
        document.getElementById('credito-cliente-nombre').textContent = data.nombre;

        // Datos de crédito
        document.getElementById('credito-autorizado').textContent = `$${(data.credito_autorizado || 0).toFixed(2)}`;
        document.getElementById('credito-utilizado').textContent = `$${(data.credito_utilizado || 0).toFixed(2)}`;
        document.getElementById('credito-disponible').textContent = `$${(data.credito_disponible || 0).toFixed(2)}`;

        // Barra de progreso
        const porcentaje = data.credito_autorizado > 0 ?
            Math.min(100, (data.credito_utilizado / data.credito_autorizado) * 100) : 0;
        const barraEl = document.getElementById('credito-barra');
        const porcentajeEl = document.getElementById('credito-porcentaje');

        porcentajeEl.textContent = `${porcentaje.toFixed(1)}%`;
        barraEl.style.width = `${porcentaje}%`;

        // Color según porcentaje
        barraEl.className = 'progress-bar';
        if (porcentaje >= 90) {
            barraEl.classList.add('bg-danger');
        } else if (porcentaje >= 70) {
            barraEl.classList.add('bg-warning');
        } else {
            barraEl.classList.add('bg-success');
        }

        // Pedidos pendientes
        const tablaEl = document.getElementById('credito-pedidos-pendientes');
        if (data.pedidos_pendientes.length > 0) {
            tablaEl.innerHTML = data.pedidos_pendientes.map(p => `
                <tr>
                    <td><strong>#${p.id}</strong></td>
                    <td>${formatDateTime(p.created_at)}</td>
                    <td>$${(p.total || 0).toFixed(2)}</td>
                    <td><span class="badge bg-warning">${p.estado}</span></td>
                </tr>
            `).join('');
        } else {
            tablaEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin pedidos pendientes</td></tr>';
        }

        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('modalCreditoCliente'));
        modal.show();
    } catch (error) {
        console.error('Error cargando crédito:', error);
        mostrarNotificacion('Error', 'No se pudo cargar la información de crédito', 'danger');
    }
}

// ============ FUNCIONES PARA EXTRACCIONES DE MATERIA PRIMA ============

// Exponer funciones de clientes globalmente
window.cargarClientes = cargarClientes;
window.cargarEstadisticasClientes = cargarEstadisticasClientes;
window.buscarClientes = buscarClientes;
window.mostrarModalCliente = mostrarModalCliente;
window.editarCliente = editarCliente;
window.guardarCliente = guardarCliente;
window.eliminarCliente = eliminarCliente;
window.toggleCamposContribuyente = toggleCamposContribuyente;
window.exportarClientes = exportarClientes;
window.verHistorialCliente = verHistorialCliente;
window.verCreditoCliente = verCreditoCliente;

