// Configuración de API
const API_BASE = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api/pos`;

// Variables globales
let datosActuales = null;
let graficoTendencia = null;
let graficoMetodos = null;

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacion();
    inicializarFiltros();
    cargarReportes();
});

// Verificar autenticación y rol
async function verificarAutenticacion() {
    const token = localStorage.getItem('token');
    const rol = localStorage.getItem('rol');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Solo managers pueden ver reportes detallados
    if (rol !== 'manager') {
        mostrarMensajeError('Acceso denegado', 'Solo los managers pueden ver reportes detallados');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
}

// Inicializar filtros con fechas por defecto
function inicializarFiltros() {
    const hoy = new Date();
    const hace30d = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);

    document.getElementById('fecha-fin').valueAsDate = hoy;
    document.getElementById('fecha-inicio').valueAsDate = hace30d;
}

// Cargar reportes con las fechas actuales
function aplicarFiltros() {
    cargarReportes();
}

// Cargar datos de reportes
async function cargarReportes() {
    const inicio = document.getElementById('fecha-inicio').value;
    const fin = document.getElementById('fecha-fin').value;

    if (!inicio || !fin) {
        mostrarMensajeError('Error', 'Selecciona rango de fechas válido');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reportes/periodo?inicio=${inicio}&fin=${fin}`);
        if (!response.ok) throw new Error('Error cargando reportes');

        datosActuales = await response.json();
        renderizarReportes();
    } catch (error) {
        console.error('Error:', error);
        mostrarMensajeError('Error', 'No se pudieron cargar los reportes');
    }
}

// Renderizar todos los datos en la página
function renderizarReportes() {
    if (!datosActuales) return;

    const resumen = datosActuales.resumen || {};
    const dias = datosActuales.dias || [];
    const topProductos = datosActuales.top_productos || [];
    const categorias = datosActuales.categorias || [];

    // Actualizar métricas
    actualizarMetricas(resumen, dias);

    // Renderizar gráficos
    renderizarGraficoTendencia(dias);
    renderizarGraficoMetodos(resumen);

    // Renderizar tablas
    renderizarTablaProductos(topProductos);
    renderizarTablaCategorias(categorias);
    renderizarTablaDetalleDias(dias);
}

// Actualizar tarjetas de métricas
function actualizarMetricas(resumen, dias) {
    const totalVentas = parseFloat(resumen.total_ventas || 0).toFixed(2);
    const totalPedidos = resumen.total_pedidos || 0;
    const promedio = totalPedidos > 0 ? (totalVentas / totalPedidos).toFixed(2) : '0.00';
    const diasCount = dias.length;

    document.getElementById('metrica-total').textContent = `$${totalVentas}`;
    document.getElementById('metrica-pedidos').textContent = totalPedidos;
    document.getElementById('metrica-promedio').textContent = `$${promedio}`;
    document.getElementById('metrica-dias').textContent = diasCount;
}

// Gráfico de Tendencia Diaria
function renderizarGraficoTendencia(dias) {
    const ctx = document.getElementById('grafico-tendencia').getContext('2d');

    const fechas = dias.map(d => d.fecha).reverse();
    const ventas = dias.map(d => parseFloat(d.total_ventas || 0)).reverse();

    if (graficoTendencia) {
        graficoTendencia.destroy();
    }

    graficoTendencia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fechas,
            datasets: [{
                label: 'Ventas Diarias ($)',
                data: ventas,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// Gráfico Métodos de Pago
function renderizarGraficoMetodos(resumen) {
    const ctx = document.getElementById('grafico-metodos').getContext('2d');

    const efectivo = parseFloat(resumen.efectivo || 0);
    const credito = parseFloat(resumen.credito || 0);

    if (graficoMetodos) {
        graficoMetodos.destroy();
    }

    graficoMetodos = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Efectivo', 'Crédito'],
            datasets: [{
                data: [efectivo, credito],
                backgroundColor: ['#28a745', '#ffc107'],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Tabla de Top Productos
function renderizarTablaProductos(productos) {
    const container = document.getElementById('tabla-top-productos');

    if (productos.length === 0) {
        container.innerHTML = '<p class="no-data">Sin datos de productos</p>';
        return;
    }

    let html = `
        <table class="table table-hover mb-0">
            <thead class="table-light">
                <tr>
                    <th>#</th>
                    <th>Producto</th>
                    <th class="text-end">Cantidad</th>
                    <th class="text-end">Total</th>
                </tr>
            </thead>
            <tbody>
    `;

    productos.forEach((p, idx) => {
        html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${p.producto_nombre}</td>
                <td class="text-end">${p.total_cantidad || 0}</td>
                <td class="text-end">$${parseFloat(p.total_subtotal || 0).toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// Tabla de Categorías
function renderizarTablaCategorias(categorias) {
    const container = document.getElementById('tabla-categorias');

    if (categorias.length === 0) {
        container.innerHTML = '<p class="no-data">Sin datos de categorías</p>';
        return;
    }

    let html = `
        <table class="table table-hover mb-0">
            <thead class="table-light">
                <tr>
                    <th>Categoría</th>
                    <th class="text-end">Cantidad</th>
                    <th class="text-end">Total</th>
                    <th class="text-end">%</th>
                </tr>
            </thead>
            <tbody>
    `;

    const totalVentas = categorias.reduce((sum, c) => sum + parseFloat(c.total_subtotal || 0), 0);

    categorias.forEach(c => {
        const porcentaje = totalVentas > 0 ? ((parseFloat(c.total_subtotal) / totalVentas) * 100).toFixed(1) : 0;
        html += `
            <tr>
                <td>${c.categoria_nombre}</td>
                <td class="text-end">${c.total_cantidad || 0}</td>
                <td class="text-end">$${parseFloat(c.total_subtotal || 0).toFixed(2)}</td>
                <td class="text-end"><span class="badge bg-primary">${porcentaje}%</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// Tabla Detalle Diario
function renderizarTablaDetalleDias(dias) {
    const container = document.getElementById('tabla-detalle-dias');

    if (dias.length === 0) {
        container.innerHTML = '<p class="no-data">Sin datos disponibles</p>';
        return;
    }

    let html = `
        <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
                <tr>
                    <th>Fecha</th>
                    <th class="text-end">Pedidos</th>
                    <th class="text-end">Ventas</th>
                    <th class="text-end">Efectivo</th>
                    <th class="text-end">Crédito</th>
                    <th class="text-end">Promedio</th>
                </tr>
            </thead>
            <tbody>
    `;

    dias.forEach(d => {
        html += `
            <tr>
                <td>${d.fecha}</td>
                <td class="text-end">${d.total_pedidos}</td>
                <td class="text-end font-weight-bold">$${parseFloat(d.total_ventas || 0).toFixed(2)}</td>
                <td class="text-end">$${parseFloat(d.efectivo || 0).toFixed(2)}</td>
                <td class="text-end">$${parseFloat(d.credito || 0).toFixed(2)}</td>
                <td class="text-end">$${parseFloat(d.pedido_promedio || 0).toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// Descargar como CSV
function descargarCSV() {
    if (!datosActuales) {
        mostrarMensajeError('Error', 'No hay datos para descargar');
        return;
    }

    const inicio = document.getElementById('fecha-inicio').value;
    const fin = document.getElementById('fecha-fin').value;

    let csv = 'REPORTE DE VENTAS\n';
    csv += `Período: ${inicio} a ${fin}\n\n`;

    // Resumen
    const resumen = datosActuales.resumen || {};
    csv += 'RESUMEN GENERAL\n';
    csv += `Total Pedidos,Total Ventas,Efectivo,Crédito,Promedio Ticket\n`;
    csv += `${resumen.total_pedidos},$${parseFloat(resumen.total_ventas || 0).toFixed(2)},$${parseFloat(resumen.efectivo || 0).toFixed(2)},$${parseFloat(resumen.credito || 0).toFixed(2)},$${parseFloat(resumen.pedido_promedio_promedio || 0).toFixed(2)}\n\n`;

    // Top Productos
    csv += 'TOP PRODUCTOS\n';
    csv += 'Producto,Cantidad,Total\n';
    (datosActuales.top_productos || []).forEach(p => {
        csv += `"${p.producto_nombre}",${p.total_cantidad},$${parseFloat(p.total_subtotal || 0).toFixed(2)}\n`;
    });
    csv += '\n';

    // Categorías
    csv += 'VENTAS POR CATEGORÍA\n';
    csv += 'Categoría,Cantidad,Total\n';
    (datosActuales.categorias || []).forEach(c => {
        csv += `"${c.categoria_nombre}",${c.total_cantidad},$${parseFloat(c.total_subtotal || 0).toFixed(2)}\n`;
    });
    csv += '\n';

    // Detalle Diario
    csv += 'DETALLE DIARIO\n';
    csv += 'Fecha,Pedidos,Ventas,Efectivo,Crédito,Promedio\n';
    (datosActuales.dias || []).forEach(d => {
        csv += `${d.fecha},${d.total_pedidos},$${parseFloat(d.total_ventas || 0).toFixed(2)},$${parseFloat(d.efectivo || 0).toFixed(2)},$${parseFloat(d.credito || 0).toFixed(2)},$${parseFloat(d.pedido_promedio || 0).toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `reportes_ventas_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
}

// Descargar como PDF
function descargarPDF() {
    if (!datosActuales) {
        mostrarMensajeError('Error', 'No hay datos para descargar');
        return;
    }

    const elemento = document.querySelector('.container-fluid');
    const opt = {
        margin: 10,
        filename: `reportes_ventas_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    html2pdf().set(opt).from(elemento).save();
}

// Imprimir reporte
function imprimirReporte() {
    window.print();
}

// Mostrar mensaje de error
function mostrarMensajeError(titulo, mensaje) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        <strong>${titulo}:</strong> ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const container = document.querySelector('.container-fluid');
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}
