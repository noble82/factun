/**
 * POS System - Main JavaScript File
 * Maneja mesas, productos, carrito, pagos y pedidos
 */

const API_POS = '/api/pos';
let mesaSeleccionada = null;
let tipoFlujoPago = 'al_final'; // o 'anticipado'
let carrito = [];
let mesasDisponibles = [];
let productosDisponibles = [];

// ============ MESAS ============

async function cargarMesas() {
    try {
        const response = await apiFetch(`${API_POS}/mesas`);
        if (!response.ok) throw new Error('Error cargando mesas');

        mesasDisponibles = await response.json();
        renderizarMesas();
    } catch (error) {
        console.error('Error cargarMesas:', error);
    }
}

function renderizarMesas() {
    const container = document.getElementById('mesas-container');
    if (!container) return;

    container.innerHTML = mesasDisponibles.map(mesa => `
        <div class="mesa-item ${mesaSeleccionada?.id === mesa.id ? 'selected' : ''}"
             onclick="seleccionarMesa(${mesa.id}, '${mesa.numero}')">
            <div class="mesa-numero">Mesa ${mesa.numero}</div>
            <div class="mesa-estado">${mesa.estado || 'libre'}</div>
        </div>
    `).join('');
}

function seleccionarMesa(mesaId, mesaNumero) {
    mesaSeleccionada = { id: mesaId, numero: mesaNumero };
    document.getElementById('mesa-seleccionada').textContent = `Mesa ${mesaNumero}`;
    document.getElementById('mesa-seleccionada').style.display = 'inline-block';
    renderizarMesas();
    validarPedido();
}

// ============ CATEGORÍAS Y PRODUCTOS ============

async function cargarCategorias() {
    try {
        const response = await apiFetch(`${API_POS}/categorias`);
        if (!response.ok) throw new Error('Error cargando categorías');

        const categorias = await response.json();
        renderizarCategorias(categorias);

        // Cargar productos de la primera categoría
        if (categorias.length > 0) {
            await cargarProductosPorCategoria(categorias[0].id);
        }
    } catch (error) {
        console.error('Error cargarCategorias:', error);
    }
}

function renderizarCategorias(categorias) {
    const container = document.getElementById('categorias-container');
    if (!container) return;

    container.innerHTML = categorias.map(cat => `
        <button class="btn btn-sm btn-outline-primary"
                onclick="cargarProductosPorCategoria(${cat.id})">
            ${cat.nombre}
        </button>
    `).join('');

    // Hacer lo mismo para cajero
    const containerCajero = document.getElementById('categorias-container-cajero');
    if (containerCajero) {
        containerCajero.innerHTML = container.innerHTML;
    }
}

async function cargarProductosPorCategoria(categoriaId) {
    try {
        const response = await apiFetch(`${API_POS}/categorias/${categoriaId}/productos`);
        if (!response.ok) throw new Error('Error cargando productos');

        productosDisponibles = await response.json();
        renderizarProductos(productosDisponibles);
    } catch (error) {
        console.error('Error cargarProductosPorCategoria:', error);
    }
}

function renderizarProductos(productos) {
    const container = document.getElementById('productos-container');
    if (!container) return;

    container.innerHTML = productos.map(prod => `
        <div class="producto-card" onclick="agregarAlCarrito(${prod.id}, '${prod.nombre}', ${prod.precio})">
            <div class="producto-nombre">${prod.nombre}</div>
            <div class="producto-precio">$${parseFloat(prod.precio).toFixed(2)}</div>
        </div>
    `).join('');

    // Hacer lo mismo para cajero
    const containerCajero = document.getElementById('productos-container-cajero');
    if (containerCajero) {
        containerCajero.innerHTML = container.innerHTML;
    }
}

// ============ CARRITO ============

function agregarAlCarrito(productoId, nombre, precio) {
    const item = carrito.find(i => i.producto_id === productoId);

    if (item) {
        item.cantidad++;
    } else {
        carrito.push({
            producto_id: productoId,
            producto_nombre: nombre,
            precio: parseFloat(precio),
            cantidad: 1,
            iva: parseFloat(precio) * 0.13
        });
    }

    actualizarCarrito();
    validarPedido();
}

function actualizarCarrito() {
    const carritoContainer = document.getElementById('cart-items');
    const carritoContainerCajero = document.getElementById('cart-items-cajero');
    const cartSheetItems = document.getElementById('cart-sheet-items');

    const html = carrito.map((item, idx) => `
        <div class="cart-item">
            <div class="item-info">
                <strong>${item.producto_nombre}</strong><br>
                <small>$${item.precio.toFixed(2)} x ${item.cantidad}</small>
            </div>
            <div class="item-controls">
                <button onclick="cambiarCantidad(${idx}, ${item.cantidad - 1})" class="btn btn-sm btn-outline-danger">-</button>
                <span class="mx-2">${item.cantidad}</span>
                <button onclick="cambiarCantidad(${idx}, ${item.cantidad + 1})" class="btn btn-sm btn-outline-success">+</button>
                <button onclick="removerDelCarrito(${idx})" class="btn btn-sm btn-outline-danger">✕</button>
            </div>
        </div>
    `).join('');

    if (carritoContainer) carritoContainer.innerHTML = html || '<p class="text-muted">Carrito vacío</p>';
    if (carritoContainerCajero) carritoContainerCajero.innerHTML = html || '<p class="text-muted">Carrito vacío</p>';
    if (cartSheetItems) cartSheetItems.innerHTML = html || '<p class="text-muted text-center py-3">Carrito vacío</p>';

    actualizarTotal();
}

function cambiarCantidad(idx, nuevaCantidad) {
    if (nuevaCantidad <= 0) {
        removerDelCarrito(idx);
    } else {
        carrito[idx].cantidad = nuevaCantidad;
        actualizarCarrito();
    }
}

function removerDelCarrito(idx) {
    carrito.splice(idx, 1);
    actualizarCarrito();
}

function actualizarTotal() {
    const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const iva = subtotal * 0.13;
    const total = subtotal + iva;

    // Actualizar en mesero
    document.getElementById('cart-subtotal').textContent = '$' + subtotal.toFixed(2);
    document.getElementById('cart-iva').textContent = '$' + iva.toFixed(2);
    document.getElementById('cart-total').textContent = '$' + total.toFixed(2);

    // Actualizar en cajero
    document.getElementById('cart-subtotal-cajero').textContent = '$' + subtotal.toFixed(2);
    document.getElementById('cart-iva-cajero').textContent = '$' + iva.toFixed(2);
    document.getElementById('cart-total-cajero').textContent = '$' + total.toFixed(2);

    // Actualizar en móvil
    document.getElementById('cart-sheet-subtotal').textContent = '$' + subtotal.toFixed(2);
    document.getElementById('cart-sheet-iva').textContent = '$' + iva.toFixed(2);
    document.getElementById('cart-sheet-total').textContent = '$' + total.toFixed(2);
}

function validarPedido() {
    const btnEnviar = document.getElementById('btn-enviar-pedido');
    const btnEnviarMobile = document.getElementById('btn-enviar-mobile');
    const btnCrearPedido = document.getElementById('btn-crear-pedido-cajero');

    const puedeEnviar = carrito.length > 0;

    if (btnEnviar) btnEnviar.disabled = !puedeEnviar;
    if (btnEnviarMobile) btnEnviarMobile.disabled = !puedeEnviar;
    if (btnCrearPedido) btnCrearPedido.disabled = !puedeEnviar;
}

// ============ FLUJO DE PAGO ============

function toggleOpcionesPago() {
    const tipoFlojo = document.getElementById('tipo-pago')?.value || 'anticipado';
    const opcionesLlevar = document.getElementById('opciones-para-llevar');

    if (tipoFlojo === 'anticipado') {
        opcionesLlevar.style.display = 'block';
    } else {
        opcionesLlevar.style.display = 'none';
    }
}

function toggleOpcionesPagoMobile() {
    const tipoFlojo = document.getElementById('tipo-pago-mobile')?.value || 'anticipado';
    // Lógica similar para móvil
}

function onMetodoPagoChange() {
    const metodo = document.querySelector('input[name="metodoPago"]:checked')?.value;
    const seccionRecibido = document.getElementById('seccion-monto-recibido');
    const infoCreditoCliente = document.getElementById('info-credito-cliente');
    const alertaSinCredito = document.getElementById('alerta-sin-credito');

    if (metodo === 'efectivo') {
        seccionRecibido.style.display = 'block';
        infoCreditoCliente.classList.add('d-none');
        alertaSinCredito.classList.add('d-none');
    } else {
        seccionRecibido.style.display = 'none';
        infoCreditoCliente.classList.remove('d-none');
    }
}

function toggleSeccionPropina() {
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value;
    const seccionPropina = document.getElementById('seccion-propina');

    if (tipoComprobante === 'ticket') {
        seccionPropina.style.display = 'block';
    } else {
        seccionPropina.style.display = 'none';
    }
}

// ============ PROPINA ============

let propinaActual = 0;

function establecerPropina(porcentaje) {
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) +
                  (carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) * 0.13);

    if (porcentaje === 0) {
        propinaActual = 0;
    } else {
        propinaActual = total * porcentaje;
    }

    actualizarDisplayPropina();
}

function actualizarPropinaPersonalizada() {
    const input = document.getElementById('propina-monto');
    propinaActual = parseFloat(input.value) || 0;
    actualizarDisplayPropina();
}

function actualizarDisplayPropina() {
    document.getElementById('propina-display').textContent = '$' + propinaActual.toFixed(2);
}

// ============ ENVÍO DE PEDIDOS ============

async function enviarPedido() {
    if (!mesaSeleccionada) {
        mostrarNotificacion('Error', 'Selecciona una mesa', 'danger');
        return;
    }

    if (carrito.length === 0) {
        mostrarNotificacion('Error', 'El carrito está vacío', 'danger');
        return;
    }

    const tipoFlojo = document.getElementById('tipo-pago')?.value || 'al_final';
    const nombreCliente = document.getElementById('cliente-nombre-pedido')?.value || '';

    const pedido = {
        mesa_id: mesaSeleccionada.id,
        mesero: localStorage.getItem('username') || 'Sistema',
        tipo_pago: tipoFlojo,
        cliente_nombre: nombreCliente,
        items: carrito.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad
        }))
    };

    try {
        const response = await apiFetch(`${API_POS}/pedidos`, {
            method: 'POST',
            body: JSON.stringify(pedido)
        });

        if (response.ok) {
            const result = await response.json();
            mostrarNotificacion('Éxito', `Pedido #${result.pedido_id} creado`, 'success');
            carrito = [];
            actualizarCarrito();
            mesaSeleccionada = null;
        } else {
            mostrarNotificacion('Error', 'No se pudo crear el pedido', 'danger');
        }
    } catch (error) {
        console.error('Error enviarPedido:', error);
        mostrarNotificacion('Error', 'Error de conexión', 'danger');
    }
}

async function enviarPedidoMobile() {
    await enviarPedido();
}

async function crearPedidoCajero() {
    if (carrito.length === 0) {
        mostrarNotificacion('Error', 'El carrito está vacío', 'danger');
        return;
    }

    const nombreCliente = document.getElementById('cliente-nombre-cajero')?.value || 'Cliente';

    const pedido = {
        tipo_pago: 'anticipado',
        cliente_nombre: nombreCliente,
        items: carrito.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad
        }))
    };

    try {
        const response = await apiFetch(`${API_POS}/pedidos`, {
            method: 'POST',
            body: JSON.stringify(pedido)
        });

        if (response.ok) {
            const result = await response.json();
            // Mostrar modal de pago
            mostrarModalPago(result.pedido_id, result.total);
            carrito = [];
            actualizarCarrito();
        }
    } catch (error) {
        console.error('Error crearPedidoCajero:', error);
        mostrarNotificacion('Error', 'Error de conexión', 'danger');
    }
}

// ============ PAGO ============

let pedidoActualPago = null;

function mostrarModalPago(pedidoId, total) {
    pedidoActualPago = { id: pedidoId, total };
    document.getElementById('detalle-pago').innerHTML = `
        <h6>Pedido #${pedidoId}</h6>
        <h5>Total: $${total.toFixed(2)}</h5>
    `;

    new bootstrap.Modal(document.getElementById('modalPago')).show();
}

async function confirmarPagoConComprobante() {
    if (!pedidoActualPago) return;

    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value;

    const datosCliente = {
        nombre: document.getElementById('cliente-nombre')?.value,
        tipo_doc: document.getElementById('cliente-tipo-doc')?.value,
        num_doc: document.getElementById('cliente-num-doc')?.value,
        nrc: document.getElementById('cliente-nrc')?.value,
        direccion: document.getElementById('cliente-direccion')?.value,
        telefono: document.getElementById('cliente-telefono')?.value,
        correo: document.getElementById('cliente-correo')?.value
    };

    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/pagar`, {
            method: 'POST',
            body: JSON.stringify({
                tipo_comprobante: tipoComprobante,
                cliente: datosCliente,
                propina: propinaActual
            })
        });

        if (response.ok) {
            mostrarNotificacion('Éxito', 'Pedido pagado', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
        }
    } catch (error) {
        mostrarNotificacion('Error', 'Error al procesar pago', 'danger');
    }
}

async function confirmarPagoSinComprobante() {
    if (!pedidoActualPago) return;

    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/pagar`, {
            method: 'POST',
            body: JSON.stringify({
                tipo_comprobante: 'ninguno',
                propina: propinaActual
            })
        });

        if (response.ok) {
            mostrarNotificacion('Éxito', 'Pedido pagado', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
        }
    } catch (error) {
        mostrarNotificacion('Error', 'Error al procesar pago', 'danger');
    }
}

// ============ CLIENTE PARA FACTURA ============

async function buscarClienteFactura(valor) {
    if (!valor) {
        document.getElementById('resultados-busqueda-cliente').innerHTML = '';
        return;
    }

    try {
        const response = await apiFetch(`/api/clientes/buscar?q=${encodeURIComponent(valor)}`);
        if (!response.ok) return;

        const clientes = await response.json();
        const container = document.getElementById('resultados-busqueda-cliente');

        container.innerHTML = clientes.map(cliente => `
            <div class="list-group-item" onclick="seleccionarClienteFactura(${cliente.id}, '${cliente.nombre}')">
                ${cliente.nombre} - ${cliente.tipo_doc}: ${cliente.num_doc}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error buscarClienteFactura:', error);
    }
}

function seleccionarClienteFactura(clienteId, clienteNombre) {
    document.getElementById('cliente-id-factura').value = clienteId;
    document.getElementById('cliente-nombre').value = clienteNombre;
    document.getElementById('resultados-busqueda-cliente').innerHTML = '';
}

function limpiarClienteFactura() {
    document.getElementById('buscar-cliente-factura').value = '';
    document.getElementById('cliente-id-factura').value = '';
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('resultados-busqueda-cliente').innerHTML = '';
}

// ============ CRÉDITO ============

async function buscarClienteCredito(valor) {
    if (!valor) {
        document.getElementById('resultados-cliente-credito').innerHTML = '';
        return;
    }

    try {
        const response = await apiFetch(`/api/clientes/buscar?q=${encodeURIComponent(valor)}`);
        if (!response.ok) return;

        const clientes = await response.json();
        const container = document.getElementById('resultados-cliente-credito');

        container.innerHTML = clientes.map(cliente => `
            <div class="list-group-item" onclick="seleccionarClienteCredito(${cliente.id}, '${cliente.nombre}')">
                ${cliente.nombre}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error buscarClienteCredito:', error);
    }
}

function seleccionarClienteCredito(clienteId, clienteNombre) {
    document.getElementById('id-cliente-credito').value = clienteId;
    document.getElementById('nombre-cliente-credito').textContent = clienteNombre;
    document.getElementById('form-credito-cliente').style.display = 'block';
    document.getElementById('resultados-cliente-credito').innerHTML = '';
}

async function guardarCreditoCliente() {
    const clienteId = document.getElementById('id-cliente-credito').value;
    const montoAutorizado = document.getElementById('monto-credito-autorizado').value;
    const diasCredito = document.getElementById('dias-credito-cliente').value;

    try {
        const response = await apiFetch(`/api/clientes/${clienteId}/credito`, {
            method: 'POST',
            body: JSON.stringify({
                monto_autorizado: parseFloat(montoAutorizado),
                dias_credito: parseInt(diasCredito)
            })
        });

        if (response.ok) {
            mostrarNotificacion('Éxito', 'Crédito guardado', 'success');
            document.getElementById('form-credito-cliente').style.display = 'none';
        }
    } catch (error) {
        mostrarNotificacion('Error', 'Error al guardar crédito', 'danger');
    }
}

// ============ REPORTES ============

async function cambiarPeriodoReportes(periodo) {
    try {
        const response = await apiFetch(`${API_POS}/reportes?periodo=${periodo}`);
        if (!response.ok) return;

        const datos = await response.json();

        document.getElementById('metrica-total-ventas').textContent = '$' + datos.total_ventas.toFixed(2);
        document.getElementById('metrica-total-pedidos').textContent = datos.total_pedidos;
        document.getElementById('metrica-ticket-promedio').textContent = '$' + datos.ticket_promedio.toFixed(2);
        document.getElementById('metrica-efectivo').textContent = '$' + datos.efectivo.toFixed(2);
        document.getElementById('metrica-credito').textContent = '$' + datos.credito.toFixed(2);
    } catch (error) {
        console.error('Error cambiarPeriodoReportes:', error);
    }
}

// ============ MOBILE ============

function navegarMobile(seccion) {
    const tabs = ['mesas', 'menu', 'servir'];
    tabs.forEach(tab => {
        const el = document.getElementById(`${tab}-tab`);
        if (el) el.classList.toggle('active', tab === seccion);
    });
}

function toggleCartSheet() {
    const sheet = document.getElementById('cart-sheet');
    const overlay = document.getElementById('cart-sheet-overlay');

    if (sheet && overlay) {
        sheet.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// ============ PEDIDOS CAJERO ============

async function cargarPedidosCajero() {
    try {
        const response = await apiFetch(`${API_POS}/cajero/pedidos`);
        if (!response.ok) return;

        const pedidos = await response.json();
        const container = document.getElementById('pedidos-cajero-container');

        if (!container) return;

        container.innerHTML = pedidos.map(pedido => `
            <div class="card mb-2">
                <div class="card-body">
                    <h6 class="card-title">Pedido #${pedido.id}</h6>
                    <p class="card-text">Mesa ${pedido.mesa_numero || 'Para llevar'}</p>
                    <p class="card-text"><strong>$${pedido.total.toFixed(2)}</strong></p>
                    <button class="btn btn-sm btn-success" onclick="abrirModalPago(${pedido.id}, ${pedido.total})">
                        Cobrar
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargarPedidosCajero:', error);
    }
}

// ============ PEDIDOS COCINA ============

async function cargarPedidosCocina() {
    try {
        const response = await apiFetch(`${API_POS}/cocina/pedidos`);
        if (!response.ok) return;

        const pedidos = await response.json();
        const container = document.getElementById('pedidos-cocina-container');

        if (!container) return;

        container.innerHTML = pedidos.map(pedido => `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-header">Pedido #${pedido.id} - Mesa ${pedido.mesa_numero}</div>
                    <div class="card-body">
                        ${pedido.items.map(item => `
                            <p>• ${item.cantidad}x ${item.producto_nombre}</p>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargarPedidosCocina:', error);
    }
}

// ============ PEDIDOS POR SERVIR ============

async function actualizarPedidosPorServir() {
    try {
        const response = await apiFetch(`${API_POS}/mesero/pedidos-listos`);
        if (!response.ok) return;

        const pedidos = await response.json();
        const badge = document.getElementById('badge-servir');

        if (badge) {
            badge.textContent = pedidos.length;
            badge.classList.toggle('d-none', pedidos.length === 0);
        }

        const container = document.getElementById('pedidos-servir-container');
        if (!container) return;

        container.innerHTML = pedidos.map(pedido => `
            <div class="card mb-2">
                <div class="card-body">
                    <h6>Mesa ${pedido.mesa_numero}</h6>
                    <small>${pedido.items.map(i => i.producto_nombre).join(', ')}</small>
                    <button class="btn btn-sm btn-success mt-2" onclick="marcarServido(${pedido.id})">
                        Servido
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error actualizarPedidosPorServir:', error);
    }
}

async function marcarServido(pedidoId) {
    try {
        await apiFetch(`${API_POS}/pedidos/${pedidoId}/servido`, { method: 'PUT' });
        actualizarPedidosPorServir();
    } catch (error) {
        console.error('Error marcarServido:', error);
    }
}

// ============ INICIALIZACIÓN ============

document.addEventListener('DOMContentLoaded', () => {
    cargarMesas();
    cargarCategorias();
});
