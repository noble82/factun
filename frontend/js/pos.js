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

    container.innerHTML = mesasDisponibles.map(mesa => {
        // Determinar estado visual de la mesa
        const estado = mesa.estado || 'libre';
        let claseEstado = 'mesa-libre';
        let icono = 'bi-check-circle';
        let textoEstado = 'Disponible';

        if (mesaSeleccionada?.id === mesa.id) {
            claseEstado = 'mesa-seleccionada';
            icono = 'bi-cursor-fill';
            textoEstado = 'Seleccionada';
        } else if (estado === 'ocupada' || estado === 'en_mesa' || estado === 'pendiente_pago') {
            claseEstado = 'mesa-ocupada';
            icono = 'bi-people-fill';
            textoEstado = 'Ocupada';
        } else if (estado === 'en_cocina' || estado === 'preparando') {
            claseEstado = 'mesa-esperando';
            icono = 'bi-fire';
            textoEstado = 'En cocina';
        } else if (estado === 'listo' || estado === 'servido') {
            claseEstado = 'mesa-pagada';
            icono = 'bi-check2-circle';
            textoEstado = 'Por cobrar';
        }

        return `
            <div class="mesa-card ${claseEstado}" onclick="seleccionarMesa(${mesa.id}, '${mesa.numero}')">
                <i class="bi ${icono}"></i>
                <div class="mesa-numero">${mesa.numero}</div>
                <div class="mesa-estado">${textoEstado}</div>
            </div>
        `;
    }).join('');
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

    // Categorías de productos + Combos al final
    container.innerHTML = categorias.map(cat => `
        <button class="btn btn-sm btn-outline-primary cat-btn"
                onclick="cargarProductosPorCategoria(${cat.id})" data-cat="${cat.id}">
            ${cat.nombre}
        </button>
    `).join('') + `
        <button class="btn btn-sm btn-outline-warning cat-btn" onclick="cargarCombos()" data-cat="combos">
            <i class="bi bi-box-seam"></i> Combos
        </button>
    `;

    // Hacer lo mismo para cajero
    const containerCajero = document.getElementById('categorias-container-cajero');
    if (containerCajero) {
        containerCajero.innerHTML = container.innerHTML;
    }
}

// Cargar combos disponibles
async function cargarCombos() {
    try {
        const response = await apiFetch(`${API_POS}/combos`);
        if (!response.ok) {
            mostrarNotificacion('Info', 'No hay combos disponibles', 'info');
            return;
        }

        const combos = await response.json();
        renderizarCombos(combos);

        // Marcar tab activo
        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-cat="combos"]')?.classList.add('active');
    } catch (error) {
        console.error('Error cargarCombos:', error);
    }
}

// Renderizar combos en el grid de productos
function renderizarCombos(combos) {
    const container = document.getElementById('productos-container');
    const containerCajero = document.getElementById('productos-container-cajero');

    const html = combos.length === 0
        ? '<p class="text-muted text-center py-4">No hay combos disponibles</p>'
        : combos.map(combo => `
            <div class="producto-card combo-card" onclick="agregarComboAlCarrito(${combo.id}, '${combo.nombre.replace(/'/g, "\\'")}', ${combo.precio_combo})">
                ${combo.imagen ? `<img src="${combo.imagen}" alt="${combo.nombre}" class="producto-img">` : `<div class="producto-img-placeholder"><i class="bi bi-box-seam"></i></div>`}
                <div class="producto-info">
                    <span class="producto-nombre">${combo.nombre}</span>
                    <span class="producto-precio text-warning">$${parseFloat(combo.precio_combo).toFixed(2)}</span>
                    <small class="text-muted d-block">${combo.descripcion || 'Combo especial'}</small>
                </div>
            </div>
        `).join('');

    if (container) container.innerHTML = html;
    if (containerCajero) containerCajero.innerHTML = html;
}

// Agregar combo al carrito
function agregarComboAlCarrito(comboId, nombre, precio) {
    const existente = carrito.find(i => i.combo_id === comboId);
    if (existente) {
        existente.cantidad++;
    } else {
        carrito.push({
            combo_id: comboId,
            producto_id: null,
            producto_nombre: nombre,
            precio: parseFloat(precio),
            cantidad: 1,
            esCombo: true
        });
    }
    actualizarCarrito();
    validarPedido();
    mostrarNotificacion('Agregado', `${nombre} agregado al pedido`, 'success');
}

async function cargarProductosPorCategoria(categoriaId) {
    try {
        const response = await apiFetch(`${API_POS}/categorias/${categoriaId}/productos`);
        if (!response) throw new Error('Error cargando productos');
        if (!response.ok) throw new Error('Error cargando productos');

        productosDisponibles = await response.json();
        renderizarProductos(productosDisponibles);
    } catch (error) {
        console.error('Error cargarProductosPorCategoria:', error);
        mostrarNotificacion('Error', 'No se pudieron cargar los productos', 'danger');
    }
}

function renderizarProductos(productos) {
    const container = document.getElementById('productos-container');
    if (!container) return;

    container.innerHTML = productos.map(prod => `
        <div class="product-card" onclick="agregarAlCarrito(${prod.id}, '${prod.nombre}', ${prod.precio})">
            ${prod.imagen ? `<img src="/${prod.imagen}" alt="${prod.nombre}" loading="lazy">` : ''}
            ${prod.es_combo ? '<span class="badge-combo">COMBO</span>' : ''}
            <div class="fw-bold">${prod.nombre}</div>
            <div class="product-price">$${parseFloat(prod.precio).toFixed(2)}</div>
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

    // HTML para vista de escritorio (más detallado)
    const htmlDesktop = carrito.map((item, idx) => {
        const subtotalItem = item.precio * item.cantidad;
        const ivaItem = subtotalItem * 0.13;
        const totalItem = subtotalItem + ivaItem;
        return `
            <div class="cart-item">
                <div class="item-info">
                    <strong>${item.producto_nombre}</strong>
                    <div class="small text-muted">
                        $${item.precio.toFixed(2)} x ${item.cantidad} = $${subtotalItem.toFixed(2)}
                        <span class="text-info">+ IVA $${ivaItem.toFixed(2)}</span>
                    </div>
                    <div class="small fw-bold text-success">Total: $${totalItem.toFixed(2)}</div>
                </div>
                <div class="item-controls">
                    <button onclick="cambiarCantidad(${idx}, ${item.cantidad - 1})" class="btn btn-sm btn-outline-danger">-</button>
                    <span class="mx-2">${item.cantidad}</span>
                    <button onclick="cambiarCantidad(${idx}, ${item.cantidad + 1})" class="btn btn-sm btn-outline-success">+</button>
                    <button onclick="removerDelCarrito(${idx})" class="btn btn-sm btn-outline-danger ms-1">✕</button>
                </div>
            </div>
        `;
    }).join('');

    // HTML para vista móvil (más compacto pero con desglose)
    const htmlMobile = carrito.map((item, idx) => {
        const subtotalItem = item.precio * item.cantidad;
        const ivaItem = subtotalItem * 0.13;
        const totalItem = subtotalItem + ivaItem;
        return `
            <div class="cart-item-mobile">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="fw-bold">${item.producto_nombre}</div>
                        <div class="small">
                            <span class="text-muted">$${item.precio.toFixed(2)} × ${item.cantidad}</span>
                            <span class="text-info ms-1">+IVA $${ivaItem.toFixed(2)}</span>
                        </div>
                        <div class="small fw-bold text-success">$${totalItem.toFixed(2)}</div>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        <button onclick="cambiarCantidad(${idx}, ${item.cantidad - 1})" class="btn btn-sm btn-outline-danger py-0 px-2">−</button>
                        <span class="badge bg-secondary">${item.cantidad}</span>
                        <button onclick="cambiarCantidad(${idx}, ${item.cantidad + 1})" class="btn btn-sm btn-outline-success py-0 px-2">+</button>
                        <button onclick="removerDelCarrito(${idx})" class="btn btn-sm btn-danger py-0 px-2">×</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (carritoContainer) carritoContainer.innerHTML = htmlDesktop || '<p class="text-muted text-center">Selecciona productos del menú</p>';
    if (carritoContainerCajero) carritoContainerCajero.innerHTML = htmlDesktop || '<p class="text-muted text-center">Selecciona productos del menú</p>';
    if (cartSheetItems) cartSheetItems.innerHTML = htmlMobile || '<p class="text-muted text-center py-3">Carrito vacío</p>';

    actualizarTotal();
    actualizarFabCount();
}

// Actualizar contador del FAB móvil
function actualizarFabCount() {
    const fabCount = document.getElementById('cart-fab-count');
    if (fabCount) {
        const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
        fabCount.textContent = totalItems;
        fabCount.style.display = totalItems > 0 ? 'flex' : 'none';
    }
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

    // IVA solo aplica para crédito fiscal (factura)
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value;
    const aplicaIVA = tipoComprobante === 'factura';
    const iva = aplicaIVA ? subtotal * 0.13 : 0;
    const total = subtotal + iva;

    // Actualizar en mesero
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartIva = document.getElementById('cart-iva');
    const cartTotal = document.getElementById('cart-total');
    if (cartSubtotal) cartSubtotal.textContent = '$' + subtotal.toFixed(2);
    if (cartIva) cartIva.textContent = aplicaIVA ? '$' + iva.toFixed(2) : '$0.00';
    if (cartTotal) cartTotal.textContent = '$' + total.toFixed(2);

    // Actualizar en cajero
    const cartSubtotalCaj = document.getElementById('cart-subtotal-cajero');
    const cartIvaCaj = document.getElementById('cart-iva-cajero');
    const cartTotalCaj = document.getElementById('cart-total-cajero');
    if (cartSubtotalCaj) cartSubtotalCaj.textContent = '$' + subtotal.toFixed(2);
    if (cartIvaCaj) cartIvaCaj.textContent = aplicaIVA ? '$' + iva.toFixed(2) : '$0.00';
    if (cartTotalCaj) cartTotalCaj.textContent = '$' + total.toFixed(2);

    // Actualizar en móvil
    const cartSheetSubtotal = document.getElementById('cart-sheet-subtotal');
    const cartSheetIva = document.getElementById('cart-sheet-iva');
    const cartSheetTotal = document.getElementById('cart-sheet-total');
    if (cartSheetSubtotal) cartSheetSubtotal.textContent = '$' + subtotal.toFixed(2);
    if (cartSheetIva) cartSheetIva.textContent = aplicaIVA ? '$' + iva.toFixed(2) : '$0.00';
    if (cartSheetTotal) cartSheetTotal.textContent = '$' + total.toFixed(2);
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
    const datosClienteContainer = document.getElementById('datos-cliente-container');

    if (tipoComprobante === 'ticket') {
        if (seccionPropina) seccionPropina.style.display = 'block';
        if (datosClienteContainer) datosClienteContainer.style.display = 'none';
    } else if (tipoComprobante === 'factura') {
        if (seccionPropina) seccionPropina.style.display = 'none';
        if (datosClienteContainer) datosClienteContainer.style.display = 'block';
    }

    // Recalcular totales (IVA solo para factura)
    actualizarTotal();
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

// Lock para prevenir doble envío de pedidos
let enviandoPedido = false;

async function enviarPedido() {
    // Prevenir doble envío
    if (enviandoPedido) {
        console.log('Pedido ya en proceso, ignorando clic duplicado');
        return;
    }

    if (!mesaSeleccionada) {
        mostrarNotificacion('Error', 'Selecciona una mesa', 'danger');
        return;
    }

    if (carrito.length === 0) {
        mostrarNotificacion('Error', 'El carrito está vacío', 'danger');
        return;
    }

    // Activar lock
    enviandoPedido = true;
    const btnEnviar = document.getElementById('btn-enviar-pedido');
    const btnEnviarMobile = document.getElementById('btn-enviar-mobile');
    if (btnEnviar) btnEnviar.disabled = true;
    if (btnEnviarMobile) btnEnviarMobile.disabled = true;

    const tipoFlojo = document.getElementById('tipo-pago')?.value || 'al_final';
    const nombreCliente = document.getElementById('cliente-nombre-pedido')?.value || '';

    const pedido = {
        mesa_id: mesaSeleccionada.id,
        mesero: localStorage.getItem('username') || 'Sistema',
        tipo_pago: tipoFlojo,
        cliente_nombre: nombreCliente,
        items: carrito.map(item => ({
            producto_id: item.producto_id || null,
            combo_id: item.combo_id || null,
            cantidad: item.cantidad,
            es_combo: item.esCombo || false
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
    } finally {
        // Liberar lock después de un breve delay
        setTimeout(() => {
            enviandoPedido = false;
            if (btnEnviar) btnEnviar.disabled = false;
            if (btnEnviarMobile) btnEnviarMobile.disabled = false;
        }, 1000);
    }
}

async function enviarPedidoMobile() {
    await enviarPedido();
}

// Lock para prevenir doble envío de pedidos cajero
let enviandoPedidoCajero = false;

async function crearPedidoCajero() {
    // Prevenir doble envío
    if (enviandoPedidoCajero) {
        console.log('Pedido cajero ya en proceso, ignorando clic duplicado');
        return;
    }

    if (carrito.length === 0) {
        mostrarNotificacion('Error', 'El carrito está vacío', 'danger');
        return;
    }

    // Activar lock
    enviandoPedidoCajero = true;
    const btnCajero = document.getElementById('btn-crear-pedido-cajero');
    if (btnCajero) btnCajero.disabled = true;

    const nombreCliente = document.getElementById('cliente-nombre-cajero')?.value || 'Cliente';

    const pedido = {
        tipo_pago: 'anticipado',
        cliente_nombre: nombreCliente,
        items: carrito.map(item => ({
            producto_id: item.producto_id || null,
            combo_id: item.combo_id || null,
            cantidad: item.cantidad,
            es_combo: item.esCombo || false
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
    } finally {
        // Liberar lock después de un breve delay
        setTimeout(() => {
            enviandoPedidoCajero = false;
            if (btnCajero) btnCajero.disabled = false;
        }, 1000);
    }
}

// ============ PAGO ============

let pedidoActualPago = null;

// Función para abrir modal de pago desde la lista de pedidos del cajero
async function abrirModalPago(pedidoId, total) {
    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}`);
        if (!response.ok) throw new Error('No se pudo cargar el pedido');

        const pedido = await response.json();

        // Calcular subtotal real (sin IVA)
        const subtotalReal = pedido.items?.reduce((sum, item) => {
            return sum + (parseFloat(item.precio_unitario || 0) * parseInt(item.cantidad || 1));
        }, 0) || parseFloat(pedido.subtotal || total);

        pedidoActualPago = {
            id: pedidoId,
            subtotal: subtotalReal,
            items: pedido.items || [],
            mesa_numero: pedido.mesa_numero,
            cliente_nombre: pedido.cliente_nombre
        };

        // Renderizar items del pedido
        renderizarItemsPago(pedidoActualPago);

        // Pre-llenar datos del cliente si existe
        if (pedido.cliente_nombre) {
            const nombreInput = document.getElementById('cliente-nombre');
            if (nombreInput) nombreInput.value = pedido.cliente_nombre;
        }

        // Resetear a ticket (sin IVA) por defecto
        document.getElementById('tipo-ticket').checked = true;
        onTipoComprobanteChange();

        // Limpiar monto recibido
        document.getElementById('monto-recibido').value = '';
        document.getElementById('vuelto-container').style.display = 'none';

        // Mostrar modal
        new bootstrap.Modal(document.getElementById('modalPago')).show();

    } catch (error) {
        console.error('Error abrirModalPago:', error);
        mostrarNotificacion('Error', 'No se pudo cargar los detalles del pedido', 'danger');
    }
}

// Versión simple para pagos rápidos
function mostrarModalPago(pedidoId, total) {
    const subtotal = parseFloat(total) / 1.13; // Aproximar subtotal
    pedidoActualPago = { id: pedidoId, subtotal: parseFloat(total), items: [] };

    renderizarItemsPago(pedidoActualPago);
    document.getElementById('tipo-ticket').checked = true;
    onTipoComprobanteChange();
    document.getElementById('monto-recibido').value = '';

    new bootstrap.Modal(document.getElementById('modalPago')).show();
}

// Renderizar items del pedido en el modal
function renderizarItemsPago(pedido) {
    const container = document.getElementById('detalle-pago-items');
    if (!container) return;

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0"><i class="bi bi-receipt"></i> Pedido #${pedido.id}</h6>
            <span class="badge ${pedido.mesa_numero ? 'bg-primary' : 'bg-warning text-dark'}">
                ${pedido.mesa_numero ? `Mesa ${pedido.mesa_numero}` : 'Para llevar'}
            </span>
        </div>
    `;

    if (pedido.items && pedido.items.length > 0) {
        html += `<div class="list-group list-group-flush small mb-2">`;
        pedido.items.forEach(item => {
            const precio = parseFloat(item.precio_unitario || item.precio || 0);
            const cantidad = parseInt(item.cantidad || 1);
            const subtotalItem = precio * cantidad;
            html += `
                <div class="list-group-item px-0 py-1 d-flex justify-content-between">
                    <span>${cantidad}x ${item.producto_nombre || item.nombre}</span>
                    <span>$${subtotalItem.toFixed(2)}</span>
                </div>
            `;
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

// Cambio de tipo de comprobante (ticket vs crédito fiscal)
function onTipoComprobanteChange() {
    const esFactura = document.getElementById('tipo-factura')?.checked;
    const subtotal = pedidoActualPago?.subtotal || 0;

    // Calcular valores según tipo
    const iva = esFactura ? subtotal * 0.13 : 0;
    const total = subtotal + iva;

    // Actualizar pedido actual
    if (pedidoActualPago) {
        pedidoActualPago.total = total;
        pedidoActualPago.iva = iva;
    }

    // Actualizar display de totales
    document.getElementById('pago-subtotal').textContent = `$${subtotal.toFixed(2)}`;

    const ivaRow = document.getElementById('pago-iva-row');
    if (esFactura) {
        ivaRow.style.display = 'flex';
        ivaRow.style.setProperty('display', 'flex', 'important');
        document.getElementById('pago-iva').textContent = `$${iva.toFixed(2)}`;
    } else {
        ivaRow.style.display = 'none';
        ivaRow.style.setProperty('display', 'none', 'important');
    }

    document.getElementById('pago-total').textContent = `$${total.toFixed(2)}`;

    // Mostrar/ocultar datos del cliente
    const datosCliente = document.getElementById('datos-cliente-container');
    if (datosCliente) {
        datosCliente.style.display = esFactura ? 'block' : 'none';
    }

    // Generar botones de monto rápido
    generarBotonesMontoRapido(total);

    // Recalcular vuelto si hay monto ingresado
    calcularVuelto();
}

// Generar botones de múltiplos de $5
function generarBotonesMontoRapido(total) {
    const container = document.getElementById('botones-monto-rapido');
    if (!container) return;

    // Calcular primer múltiplo de 5 >= total
    const primerMultiplo = Math.ceil(total / 5) * 5;
    // Si el total es exactamente múltiplo de 5, usar ese valor
    const base = total === primerMultiplo ? primerMultiplo : primerMultiplo;

    // Generar 4 botones consecutivos
    const montos = [base, base + 5, base + 10, base + 20];

    container.innerHTML = montos.map(monto => `
        <div class="col-3">
            <button type="button" class="btn btn-outline-primary w-100 btn-monto-rapido"
                    onclick="seleccionarMontoRapido(${monto})">
                $${monto}
            </button>
        </div>
    `).join('');
}

// Seleccionar monto rápido
function seleccionarMontoRapido(monto) {
    document.getElementById('monto-recibido').value = monto.toFixed(2);

    // Marcar botón activo
    document.querySelectorAll('.btn-monto-rapido').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
        if (btn.textContent.includes(monto)) {
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-primary');
        }
    });

    calcularVuelto();
}

// Calcular vuelto automáticamente
function calcularVuelto() {
    const montoRecibido = parseFloat(document.getElementById('monto-recibido')?.value) || 0;
    const totalPagar = pedidoActualPago?.total || 0;
    const vueltoContainer = document.getElementById('vuelto-container');
    const vueltoLabel = document.getElementById('vuelto-label');
    const montoVuelto = document.getElementById('monto-vuelto');

    if (montoRecibido <= 0) {
        vueltoContainer.style.display = 'none';
        return;
    }

    vueltoContainer.style.display = 'block';
    const diferencia = montoRecibido - totalPagar;

    if (diferencia >= 0) {
        vueltoLabel.textContent = 'Vuelto:';
        montoVuelto.textContent = `$${diferencia.toFixed(2)}`;
        vueltoContainer.className = 'mt-2 p-2 rounded text-center bg-success bg-opacity-25';
        montoVuelto.className = 'fs-4 fw-bold text-success';
    } else {
        vueltoLabel.textContent = 'Falta:';
        montoVuelto.textContent = `$${Math.abs(diferencia).toFixed(2)}`;
        vueltoContainer.className = 'mt-2 p-2 rounded text-center bg-danger bg-opacity-25';
        montoVuelto.className = 'fs-4 fw-bold text-danger';
    }
}

// Mantener compatibilidad con función anterior
function toggleSeccionPropina() {
    onTipoComprobanteChange();
}

// Función vacía para compatibilidad (propina ya no se usa)
// La función original está en línea 442

async function confirmarPagoConComprobante() {
    if (!pedidoActualPago) return;

    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value;
    const btnPagar = document.querySelector('#modalPago .btn-success');

    // Obtener datos del cliente
    const datosCliente = {
        nombre: document.getElementById('cliente-nombre')?.value || '',
        tipo_doc: document.getElementById('cliente-tipo-doc')?.value || '36',
        num_doc: document.getElementById('cliente-num-doc')?.value || '',
        nrc: document.getElementById('cliente-nrc')?.value || '',
        direccion: document.getElementById('cliente-direccion')?.value || '',
        telefono: document.getElementById('cliente-telefono')?.value || '',
        correo: document.getElementById('cliente-correo')?.value || ''
    };

    // Validar datos para factura electrónica (crédito fiscal)
    if (tipoComprobante === 'factura') {
        if (!datosCliente.num_doc) {
            mostrarNotificacion('Error', 'Para factura electrónica se requiere NIT o DUI del cliente', 'warning');
            document.getElementById('cliente-num-doc')?.focus();
            return;
        }
        if (!datosCliente.nombre) {
            mostrarNotificacion('Error', 'Se requiere el nombre del cliente para factura', 'warning');
            document.getElementById('cliente-nombre')?.focus();
            return;
        }
    }

    // Deshabilitar botón mientras procesa
    if (btnPagar) {
        btnPagar.disabled = true;
        btnPagar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
    }

    try {
        // 1. Procesar el pago
        const responsePago = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_comprobante: tipoComprobante,
                cliente: datosCliente,
                propina: propinaActual
            })
        });

        if (!responsePago.ok) {
            const errorData = await responsePago.json();
            throw new Error(errorData.error || 'Error al procesar pago');
        }

        // 2. Generar comprobante (factura o ticket)
        const responseFactura = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/facturar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo: tipoComprobante,
                cliente: datosCliente
            })
        });

        const facturaData = await responseFactura.json();

        if (responseFactura.ok && facturaData.success) {
            if (tipoComprobante === 'factura') {
                // Factura electrónica - generada localmente (NO enviar automáticamente a Digifact)
                // El envío a Digifact debe ser manual/controlado desde el panel de administración
                mostrarNotificacion('Factura Generada', `Número: ${facturaData.numero_control || facturaData.codigo_generacion}`, 'success');

                // Mostrar factura para imprimir
                mostrarComprobanteParaImprimir(facturaData, 'factura', datosCliente);
            } else {
                // Ticket simple
                mostrarNotificacion('Ticket Generado', `#${facturaData.numero || pedidoActualPago.id}`, 'success');

                // Mostrar ticket para imprimir
                mostrarComprobanteParaImprimir(facturaData, 'ticket', null);
            }
        } else {
            // Pago procesado pero comprobante falló
            mostrarNotificacion('Advertencia', 'Pago procesado. Error generando comprobante: ' + (facturaData.error || ''), 'warning');
        }

        // Cerrar modal y recargar
        bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();

        // Recargar lista de pedidos según el rol
        if (typeof cargarPedidosCajero === 'function') {
            cargarPedidosCajero();
        }

    } catch (error) {
        console.error('Error confirmarPagoConComprobante:', error);
        mostrarNotificacion('Error', error.message || 'Error al procesar pago', 'danger');
    } finally {
        // Rehabilitar botón
        if (btnPagar) {
            btnPagar.disabled = false;
            btnPagar.innerHTML = '<i class="bi bi-check-circle"></i> Confirmar Pago';
        }
    }
}

// Función para enviar DTE a Digifact (retorna resultado)
async function enviarDTEDigifact(pedidoId, facturaData) {
    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}/enviar-dte`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            return {
                success: true,
                dte_numero: result.data?.dte_numero || result.dte_numero || '',
                mensaje: 'DTE certificado exitosamente'
            };
        } else {
            console.warn('Digifact error:', result.error);
            return {
                success: false,
                error: result.error || 'No se pudo certificar el DTE'
            };
        }
    } catch (error) {
        console.error('Error enviarDTEDigifact:', error);
        return {
            success: false,
            error: 'Error de conexión con Digifact'
        };
    }
}

// Función para mostrar comprobante para imprimir
function mostrarComprobanteParaImprimir(facturaData, tipo, cliente) {
    const pedido = pedidoActualPago;
    const fecha = new Date().toLocaleString('es-SV');
    const items = pedido.items || facturaData.ticket?.items || [];

    // Generar detalle de productos
    let detalleProductos = '';
    let subtotalCalculado = 0;

    if (items.length > 0) {
        detalleProductos = items.map(item => {
            const cantidad = parseInt(item.cantidad || 1);
            const precio = parseFloat(item.precio_unitario || item.precio || 0);
            const subtotalItem = cantidad * precio;
            subtotalCalculado += subtotalItem;
            return `
                <tr>
                    <td style="text-align: left;">${cantidad}x ${item.producto_nombre || item.nombre || item.descripcion || 'Producto'}</td>
                    <td style="text-align: right;">$${precio.toFixed(2)}</td>
                    <td style="text-align: right;">$${subtotalItem.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
    }

    let contenido = '';

    if (tipo === 'ticket') {
        // Ticket simple CON detalle de productos
        const subtotal = facturaData.ticket?.subtotal || subtotalCalculado || parseFloat(pedido.subtotal || 0);
        const total = facturaData.ticket?.total || parseFloat(pedido.total || subtotal);

        contenido = `
            <div style="font-family: monospace; width: 320px; padding: 10px;">
                <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px;">
                    <h3 style="margin: 0;">PUPUSERÍA EL BUEN SABOR</h3>
                    <p style="margin: 5px 0; font-size: 11px;">Comprobante de Venta</p>
                </div>
                <div style="padding: 10px 0; font-size: 11px;">
                    <p><strong>Ticket:</strong> #${facturaData.numero || pedido.id}</p>
                    <p><strong>Fecha:</strong> ${fecha}</p>
                    ${pedido.mesa_numero ? `<p><strong>Mesa:</strong> ${pedido.mesa_numero}</p>` : ''}
                    ${pedido.cliente_nombre ? `<p><strong>Cliente:</strong> ${pedido.cliente_nombre}</p>` : ''}
                </div>
                <hr style="border: none; border-top: 1px dashed #000;">
                <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px dashed #000;">
                            <th style="text-align: left;">Producto</th>
                            <th style="text-align: right;">P.Unit</th>
                            <th style="text-align: right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detalleProductos || '<tr><td colspan="3">Sin detalle</td></tr>'}
                    </tbody>
                </table>
                <hr style="border: none; border-top: 1px dashed #000;">
                <table style="width: 100%; font-size: 12px;">
                    <tr><td>Subtotal:</td><td style="text-align: right;">$${subtotal.toFixed(2)}</td></tr>
                    <tr style="font-weight: bold; font-size: 14px;">
                        <td>TOTAL:</td><td style="text-align: right;">$${total.toFixed(2)}</td>
                    </tr>
                </table>
                <div style="text-align: center; font-size: 10px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px;">
                    <p>¡Gracias por su compra!</p>
                </div>
            </div>
        `;
    } else {
        // Factura con crédito fiscal CON detalle de productos
        const subtotal = facturaData.subtotal || subtotalCalculado || parseFloat(pedido.subtotal || 0);
        const iva = facturaData.iva || (subtotal * 0.13);
        const total = facturaData.total || (subtotal + iva);

        contenido = `
            <div style="font-family: Arial, sans-serif; width: 420px; padding: 15px; border: 1px solid #000;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px;">
                    <h2 style="margin: 0;">FACTURA ELECTRÓNICA</h2>
                    <p style="margin: 5px 0; font-size: 11px;">Documento Tributario Electrónico</p>
                </div>
                <div style="padding: 10px 0; font-size: 12px;">
                    <p><strong>No. Control:</strong> ${facturaData.numero_control || 'N/A'}</p>
                    <p><strong>Código Generación:</strong> ${facturaData.codigo_generacion || 'N/A'}</p>
                    <p><strong>Fecha:</strong> ${fecha}</p>
                    <hr>
                    <p><strong>Cliente:</strong> ${cliente?.nombre || 'Consumidor Final'}</p>
                    <p><strong>NIT/DUI:</strong> ${cliente?.num_doc || 'N/A'}</p>
                    ${cliente?.nrc ? `<p><strong>NRC:</strong> ${cliente.nrc}</p>` : ''}
                    ${cliente?.direccion ? `<p><strong>Dirección:</strong> ${cliente.direccion}</p>` : ''}
                </div>
                <hr>
                <table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-bottom: 10px;">
                    <thead>
                        <tr style="background: #f0f0f0; border-bottom: 1px solid #000;">
                            <th style="text-align: left; padding: 5px;">Descripción</th>
                            <th style="text-align: right; padding: 5px;">P.Unit</th>
                            <th style="text-align: right; padding: 5px;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detalleProductos || '<tr><td colspan="3">Sin detalle</td></tr>'}
                    </tbody>
                </table>
                <hr>
                <table style="width: 100%; font-size: 12px;">
                    <tr><td>Subtotal (sin IVA):</td><td style="text-align: right;">$${subtotal.toFixed(2)}</td></tr>
                    <tr><td>IVA (13%):</td><td style="text-align: right;">$${iva.toFixed(2)}</td></tr>
                    <tr style="font-weight: bold; font-size: 14px; border-top: 2px solid #000;">
                        <td>TOTAL:</td><td style="text-align: right;">$${total.toFixed(2)}</td>
                    </tr>
                </table>
                <div style="text-align: center; font-size: 10px; margin-top: 15px; border-top: 1px solid #000; padding-top: 10px;">
                    <p>Documento generado electrónicamente</p>
                    <p>Conserve este documento para cualquier reclamo</p>
                </div>
            </div>
        `;
    }

    // Abrir ventana de impresión
    const ventanaImpresion = window.open('', '_blank', 'width=450,height=600');
    ventanaImpresion.document.write(`
        <html>
        <head><title>${tipo === 'ticket' ? 'Ticket' : 'Factura'} #${pedido.id}</title></head>
        <body style="margin: 0; display: flex; justify-content: center; padding: 20px;">
            ${contenido}
            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);
    ventanaImpresion.document.close();
}

async function confirmarPagoSinComprobante() {
    if (!pedidoActualPago) return;

    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_comprobante: 'ninguno',
                propina: propinaActual
            })
        });

        if (response.ok) {
            mostrarNotificacion('Éxito', 'Pedido pagado', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
            cargarPedidosCajero();
        } else {
            const err = await response.json();
            mostrarNotificacion('Error', err.error || 'Error al procesar', 'danger');
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
        let endpoint;
        let fechaInicio, fechaFin;

        if (periodo === 'hoy') {
            endpoint = `${API_POS}/reportes/hoy`;
        } else {
            // Para 7d o 30d, usar el endpoint de período
            const hoy = new Date();
            fechaFin = hoy.toISOString().split('T')[0];

            if (periodo === '7d') {
                const hace7dias = new Date(hoy);
                hace7dias.setDate(hace7dias.getDate() - 7);
                fechaInicio = hace7dias.toISOString().split('T')[0];
            } else if (periodo === '30d') {
                const hace30dias = new Date(hoy);
                hace30dias.setDate(hace30dias.getDate() - 30);
                fechaInicio = hace30dias.toISOString().split('T')[0];
            }
            endpoint = `${API_POS}/reportes/periodo?inicio=${fechaInicio}&fin=${fechaFin}`;
        }

        const response = await apiFetch(endpoint);
        if (!response.ok) return;

        const datos = await response.json();
        const resumen = datos.resumen || datos;
        const productos = datos.productos || [];
        const categorias = datos.categorias || [];

        // Actualizar métricas principales
        const totalVentas = resumen.total_ventas || 0;
        const totalPedidos = resumen.total_pedidos || 0;
        const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
        const efectivo = resumen.efectivo || 0;
        const credito = resumen.credito || 0;

        document.getElementById('metrica-total-ventas').textContent = '$' + totalVentas.toFixed(2);
        document.getElementById('metrica-total-pedidos').textContent = totalPedidos;
        document.getElementById('metrica-ticket-promedio').textContent = '$' + ticketPromedio.toFixed(2);
        document.getElementById('metrica-efectivo').textContent = '$' + efectivo.toFixed(2);
        document.getElementById('metrica-credito').textContent = '$' + credito.toFixed(2);

        // Actualizar tabla de top productos
        const tablaTopProductos = document.getElementById('tabla-top-productos');
        if (tablaTopProductos && productos.length > 0) {
            tablaTopProductos.innerHTML = productos.slice(0, 10).map((prod, idx) => `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <div class="d-flex align-items-center">
                        <span class="badge bg-primary me-2">${idx + 1}</span>
                        <span>${prod.producto_nombre || prod.nombre}</span>
                    </div>
                    <div>
                        <span class="badge bg-info">${prod.cantidad_vendida || prod.cantidad}</span>
                        <span class="text-success ms-2">$${(prod.subtotal || 0).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
        } else if (tablaTopProductos) {
            tablaTopProductos.innerHTML = '<p class="text-muted text-center">Sin datos</p>';
        }

        // Actualizar tabla de categorías
        const tablaCategorias = document.getElementById('tabla-categorias');
        if (tablaCategorias && categorias.length > 0) {
            tablaCategorias.innerHTML = categorias.map(cat => `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span>${cat.categoria_nombre || cat.nombre}</span>
                    <div>
                        <span class="badge bg-secondary">${cat.cantidad_vendida || cat.cantidad}</span>
                        <span class="text-success ms-2">$${(cat.subtotal || 0).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
        } else if (tablaCategorias) {
            tablaCategorias.innerHTML = '<p class="text-muted text-center">Sin datos</p>';
        }

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
        // Toggle both 'show' and 'active' classes for compatibility
        const isOpen = sheet.classList.contains('show') || sheet.classList.contains('active');

        if (isOpen) {
            sheet.classList.remove('show', 'active');
            overlay.classList.remove('show', 'active');
            document.body.style.overflow = '';
        } else {
            sheet.classList.add('show', 'active');
            overlay.classList.add('show', 'active');
            document.body.style.overflow = 'hidden';
            // Actualizar carrito al abrir
            actualizarCarrito();
        }
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

        if (pedidos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="bi bi-check-circle text-success" style="font-size: 3rem;"></i>
                    <h5 class="mt-3 text-muted">Sin pedidos pendientes</h5>
                    <p class="text-muted">Los pedidos por cobrar aparecerán aquí</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pedidos.map(pedido => {
            const esParaLlevar = !pedido.mesa_numero || pedido.tipo_pago === 'anticipado';
            const estadoClase = pedido.estado === 'listo' || pedido.estado === 'servido' ? 'listo' : '';
            const estadoBadge = pedido.estado === 'listo' ? 'bg-success' :
                               pedido.estado === 'servido' ? 'bg-info' :
                               pedido.estado === 'en_cocina' ? 'bg-warning text-dark' : 'bg-secondary';

            // Mostrar resumen de items si están disponibles
            let itemsPreview = '';
            if (pedido.items && pedido.items.length > 0) {
                const maxItems = 3;
                const itemsToShow = pedido.items.slice(0, maxItems);
                itemsPreview = itemsToShow.map(item =>
                    `<span class="badge bg-light text-dark me-1">${item.cantidad}× ${item.producto_nombre || item.nombre}</span>`
                ).join('');
                if (pedido.items.length > maxItems) {
                    itemsPreview += `<span class="badge bg-secondary">+${pedido.items.length - maxItems} más</span>`;
                }
            }

            return `
                <div class="cobro-card ${estadoClase}">
                    <div class="cobro-header">
                        <div class="d-flex align-items-center gap-2">
                            ${esParaLlevar
                                ? `<span class="badge bg-warning text-dark"><i class="bi bi-bag"></i> Llevar</span>`
                                : `<span class="badge bg-primary"><i class="bi bi-table"></i> Mesa ${pedido.mesa_numero}</span>`
                            }
                            <span class="badge ${estadoBadge}">${pedido.estado}</span>
                            <small class="text-muted">#${pedido.id}</small>
                        </div>
                        ${pedido.cliente_nombre ? `<small class="text-muted"><i class="bi bi-person"></i> ${pedido.cliente_nombre}</small>` : ''}
                    </div>
                    ${itemsPreview ? `<div class="cobro-items">${itemsPreview}</div>` : ''}
                    <div class="cobro-footer">
                        <span class="total-cobrar">$${parseFloat(pedido.total).toFixed(2)}</span>
                        <button class="btn btn-success" onclick="abrirModalPago(${pedido.id}, ${pedido.total})">
                            <i class="bi bi-cash-coin"></i> Cobrar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        // Nota: cargarEstadisticasDia() se llama desde iniciarAutoRefresh() para evitar duplicación
    } catch (error) {
        console.error('Error cargarPedidosCajero:', error);
    }
}

// Cargar estadísticas del día para el resumen del cajero
async function cargarEstadisticasDia() {
    try {
        const response = await apiFetch(`${API_POS}/reportes/hoy`);
        if (!response.ok) return;

        const datos = await response.json();
        const resumen = datos.resumen || datos;
        const productos = datos.productos || [];

        // Actualizar los elementos de estadísticas
        const statPedidos = document.getElementById('stat-pedidos');
        const statVentas = document.getElementById('stat-ventas');
        const topProductos = document.getElementById('stat-top-productos');

        if (statPedidos) statPedidos.textContent = resumen.total_pedidos || 0;
        if (statVentas) statVentas.textContent = '$' + (resumen.total_ventas || 0).toFixed(2);

        // Renderizar top productos
        if (topProductos && productos.length > 0) {
            topProductos.innerHTML = productos.slice(0, 5).map((prod, idx) => `
                <div class="top-producto-item">
                    <span class="ranking">${idx + 1}</span>
                    <span class="nombre">${prod.producto_nombre || prod.nombre}</span>
                    <span class="cantidad">${prod.cantidad_vendida || prod.cantidad}</span>
                </div>
            `).join('');
        } else if (topProductos) {
            topProductos.innerHTML = '<p class="text-muted small">Sin ventas hoy</p>';
        }
    } catch (error) {
        console.error('Error cargarEstadisticasDia:', error);
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

        if (pedidos.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-check-circle text-success fs-1"></i>
                    <h5 class="mt-3 text-muted">No hay pedidos pendientes</h5>
                </div>
            `;
            return;
        }

        container.innerHTML = pedidos.map(pedido => {
            const esParaLlevar = !pedido.mesa_numero || pedido.tipo_pago === 'anticipado';
            const ubicacion = esParaLlevar ? `Para Llevar - ${pedido.cliente_nombre || 'Cliente'}` : `Mesa ${pedido.mesa_numero}`;
            const estadoActual = pedido.estado || 'en_mesa';

            // Botones según el estado
            let botones = '';
            if (estadoActual === 'en_mesa' || estadoActual === 'pagado') {
                botones = `<button class="btn btn-warning w-100" onclick="iniciarPreparacion(${pedido.id})">
                    <i class="bi bi-fire"></i> Iniciar Preparación
                </button>`;
            } else if (estadoActual === 'en_cocina') {
                botones = `<button class="btn btn-success w-100" onclick="marcarListo(${pedido.id})">
                    <i class="bi bi-check-circle"></i> Marcar Listo
                </button>`;
            } else if (estadoActual === 'listo') {
                botones = `<span class="badge bg-success w-100 py-2">✓ Listo para servir</span>`;
            }

            return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card cocina-card ${estadoActual === 'en_cocina' ? 'border-warning' : ''}" data-pedido-id="${pedido.id}">
                    <div class="card-header d-flex justify-content-between align-items-center ${estadoActual === 'en_cocina' ? 'bg-warning text-dark' : 'bg-dark text-white'}">
                        <span><strong>#${pedido.id}</strong> - ${ubicacion}</span>
                        <span class="badge ${estadoActual === 'en_cocina' ? 'bg-dark' : 'bg-secondary'}">${estadoActual}</span>
                    </div>
                    <div class="card-body">
                        <ul class="list-unstyled mb-0">
                            ${pedido.items.map(item => `
                                <li class="d-flex justify-content-between py-1 border-bottom">
                                    <span><strong>${item.cantidad}x</strong> ${item.producto_nombre}</span>
                                    ${item.notas ? `<small class="text-muted">${item.notas}</small>` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    <div class="card-footer">
                        ${botones}
                    </div>
                </div>
            </div>
        `}).join('');
    } catch (error) {
        console.error('Error cargarPedidosCocina:', error);
    }
}

// Iniciar preparación de pedido
async function iniciarPreparacion(pedidoId) {
    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'en_cocina' })
        });
        if (response.ok) {
            mostrarNotificacion('Preparación iniciada', `Pedido #${pedidoId} en cocina`, 'warning');
            cargarPedidosCocina();
        } else {
            const err = await response.json();
            mostrarNotificacion('Error', err.error || 'No se pudo iniciar', 'danger');
        }
    } catch (error) {
        console.error('Error iniciarPreparacion:', error);
    }
}

// Marcar pedido como listo
async function marcarListo(pedidoId) {
    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'listo' })
        });
        if (response.ok) {
            mostrarNotificacion('¡Pedido Listo!', `Pedido #${pedidoId} listo para servir`, 'success');
            cargarPedidosCocina();
        } else {
            const err = await response.json();
            mostrarNotificacion('Error', err.error || 'No se pudo marcar', 'danger');
        }
    } catch (error) {
        console.error('Error marcarListo:', error);
    }
}

// ============ PEDIDOS POR SERVIR ============

let ultimoConteoPorServir = 0;
let pedidosNotificados = new Set(); // IDs de pedidos ya notificados

async function actualizarPedidosPorServir() {
    try {
        const response = await apiFetch(`${API_POS}/mesero/pedidos-listos`);
        if (!response || !response.ok) return;

        const pedidos = await response.json();
        const badge = document.getElementById('badge-servir');

        // Detectar pedidos REALMENTE nuevos (no notificados antes)
        const nuevos = pedidos.filter(p => !pedidosNotificados.has(p.id));
        if (nuevos.length > 0) {
            reproducirSonidoServir();
            mostrarNotificacion('¡Pedido Listo!', `${nuevos.length} pedido(s) listo(s) para servir`, 'success');
            // Agregar los nuevos a la lista de notificados
            nuevos.forEach(p => pedidosNotificados.add(p.id));
        }

        // Limpiar pedidos que ya no están listos (servidos)
        const idsActuales = new Set(pedidos.map(p => p.id));
        pedidosNotificados.forEach(id => {
            if (!idsActuales.has(id)) pedidosNotificados.delete(id);
        });

        ultimoConteoPorServir = pedidos.length;

        if (badge) {
            badge.textContent = pedidos.length;
            badge.classList.toggle('d-none', pedidos.length === 0);
        }

        const container = document.getElementById('pedidos-servir-container');
        if (!container) return;

        if (pedidos.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-check-circle fs-1 text-success"></i>
                    <h5 class="mt-3">No hay pedidos por servir</h5>
                    <p>Los pedidos listos aparecerán aquí automáticamente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pedidos.map(pedido => {
            const esParaLlevar = !pedido.mesa_numero || pedido.tipo_pago === 'anticipado';
            const nombreCliente = pedido.cliente_nombre || 'Cliente';
            const tiempoListo = calcularTiempoDesde(pedido.updated_at || pedido.created_at);

            return `
                <div class="servir-card ${tiempoListo > 5 ? 'urgente' : ''}">
                    <div class="servir-header">
                        <div>
                            ${esParaLlevar
                                ? `<span class="mesa-badge bg-warning text-dark"><i class="bi bi-bag"></i> LLEVAR</span>`
                                : `<span class="mesa-badge"><i class="bi bi-table"></i> Mesa ${pedido.mesa_numero}</span>`
                            }
                            <span class="badge bg-secondary ms-2">#${pedido.id}</span>
                        </div>
                        <div class="tiempo-listo">
                            <i class="bi bi-clock-fill"></i> Listo hace ${tiempoListo} min
                        </div>
                    </div>
                    ${esParaLlevar ? `
                        <div class="alert alert-warning py-2 mb-2">
                            <i class="bi bi-person-fill"></i>
                            <strong>${nombreCliente}</strong>
                        </div>
                    ` : ''}
                    <div class="servir-items">
                        ${pedido.items ? pedido.items.map(item => `
                            <div class="servir-item">
                                <span class="cantidad">${item.cantidad}x</span>
                                <span>${item.producto_nombre}</span>
                            </div>
                        `).join('') : ''}
                    </div>
                    <button class="btn-servir" onclick="marcarServido(${pedido.id})">
                        <i class="bi bi-check-circle-fill me-2"></i> MARCAR SERVIDO
                    </button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error actualizarPedidosPorServir:', error);
    }
}

function calcularTiempoDesde(fecha) {
    if (!fecha) return 0;
    const ahora = new Date();
    const desde = new Date(fecha);
    const diff = Math.floor((ahora - desde) / 60000);
    return diff > 0 ? diff : 0;
}

function reproducirSonidoServir() {
    try {
        // Sonido de notificación (puede personalizarse)
        const audio = document.getElementById('audio-notificacion');
        if (audio) audio.play();
    } catch (e) {
        console.log('No se pudo reproducir sonido');
    }
}

async function marcarServido(pedidoId) {
    try {
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'servido' })
        });
        if (response.ok) {
            mostrarNotificacion('Servido', `Pedido #${pedidoId} entregado`, 'success');
            actualizarPedidosPorServir();
        }
    } catch (error) {
        console.error('Error marcarServido:', error);
    }
}

// ============ GESTIÓN DE COMBOS (MANAGER) ============

let productosParaCombo = [];
let productosSeleccionadosCombo = [];

async function cargarProductosParaCombo() {
    try {
        const response = await apiFetch(`${API_POS}/productos`);
        if (!response || !response.ok) return;

        productosParaCombo = await response.json();
        renderizarProductosCombo();
    } catch (error) {
        console.error('Error cargarProductosParaCombo:', error);
    }
}

function renderizarProductosCombo() {
    const container = document.getElementById('combo-productos-lista');
    if (!container) return;

    container.innerHTML = productosParaCombo.map(prod => `
        <div class="list-group-item">
            <div class="d-flex justify-content-between align-items-center">
                <span>${prod.nombre} - $${parseFloat(prod.precio).toFixed(2)}</span>
                <button class="btn btn-sm btn-primary"
                        onclick="agregarProductoACombo(${prod.id}, '${prod.nombre}', ${prod.precio})">
                    Agregar
                </button>
            </div>
        </div>
    `).join('');
}

function agregarProductoACombo(productoId, nombre, precio) {
    const existe = productosSeleccionadosCombo.find(p => p.id === productoId);

    if (!existe) {
        productosSeleccionadosCombo.push({
            id: productoId,
            nombre: nombre,
            precio: parseFloat(precio)
        });
        renderizarProductosSeleccionadosCombo();
    } else {
        mostrarNotificacion('Aviso', 'Este producto ya está en el combo', 'info');
    }
}

function renderizarProductosSeleccionadosCombo() {
    const container = document.getElementById('combo-productos-seleccionados');
    if (!container) return;

    container.innerHTML = productosSeleccionadosCombo.map((prod, idx) => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <span>${prod.nombre} - $${prod.precio.toFixed(2)}</span>
            <button class="btn btn-sm btn-danger"
                    onclick="removerProductoDeCombo(${idx})">
                Remover
            </button>
        </div>
    `).join('');
}

function removerProductoDeCombo(idx) {
    productosSeleccionadosCombo.splice(idx, 1);
    renderizarProductosSeleccionadosCombo();
}

async function guardarCombo() {
    const nombre = document.getElementById('combo-nombre')?.value?.trim();
    const descripcion = document.getElementById('combo-descripcion')?.value?.trim() || '';
    const precio = parseFloat(document.getElementById('combo-precio')?.value);

    // Validaciones del frontend
    if (!nombre) {
        mostrarNotificacion('Error', 'Ingresa el nombre del combo', 'danger');
        return;
    }

    if (!precio || precio <= 0) {
        mostrarNotificacion('Error', 'Ingresa un precio válido', 'danger');
        return;
    }

    if (productosSeleccionadosCombo.length < 2) {
        mostrarNotificacion('Error', 'El combo debe tener al menos 2 productos', 'warning');
        return;
    }

    const combo = {
        nombre,
        descripcion,
        precio_combo: precio,
        productos: productosSeleccionadosCombo.map(p => ({
            producto_id: p.id,
            cantidad: p.cantidad || 1
        }))
    };

    console.log('Enviando combo:', combo);

    try {
        const response = await apiFetch(`${API_POS}/combos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(combo)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion('Éxito', `Combo "${nombre}" creado exitosamente`, 'success');
            // Limpiar formulario
            document.getElementById('combo-nombre').value = '';
            document.getElementById('combo-descripcion').value = '';
            document.getElementById('combo-precio').value = '';
            productosSeleccionadosCombo = [];
            renderizarProductosSeleccionadosCombo();
            cargarCombosExistentes();
        } else {
            mostrarNotificacion('Error', result.error || 'No se pudo crear el combo', 'danger');
        }
    } catch (error) {
        console.error('Error guardarCombo:', error);
        mostrarNotificacion('Error', 'Error de conexión al guardar combo', 'danger');
    }
}

async function cargarCombosExistentes() {
    try {
        const response = await apiFetch(`${API_POS}/combos`);
        if (!response || !response.ok) return;

        const combos = await response.json();
        const container = document.getElementById('combos-lista');
        if (!container) return;

        container.innerHTML = combos.map(combo => `
            <div class="list-group-item">
                <h6>${combo.nombre}</h6>
                <small class="text-muted">${combo.descripcion}</small>
                <p class="mb-2"><strong>$${parseFloat(combo.precio).toFixed(2)}</strong></p>
                <button class="btn btn-sm btn-danger" onclick="eliminarCombo(${combo.id})">
                    Eliminar
                </button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargarCombosExistentes:', error);
    }
}

async function eliminarCombo(comboId) {
    if (!confirm('¿Estás seguro?')) return;

    try {
        const response = await apiFetch(`${API_POS}/combos/${comboId}`, {
            method: 'DELETE'
        });

        if (response && response.ok) {
            mostrarNotificacion('Éxito', 'Combo eliminado', 'success');
            cargarCombosExistentes();
        }
    } catch (error) {
        console.error('Error eliminarCombo:', error);
    }
}

// ============ INICIALIZACIÓN ============

// Variables para intervalos de auto-refresh
let refreshIntervals = {
    cocina: null,
    cajero: null,
    mesero: null,
    mesas: null
};

// Configuración de intervalos (en milisegundos)
// Ajustados para evitar saturación de API (HTTP 429)
const REFRESH_CONFIG = {
    cocina: 15000,   // 15 segundos para cocina (pedidos entrantes)
    cajero: 30000,   // 30 segundos para cajero
    mesero: 20000,   // 20 segundos para mesero (pedidos listos)
    mesas: 30000     // 30 segundos para mesas
};

// Función para iniciar auto-refresh según el panel activo
function iniciarAutoRefresh(panel) {
    // Limpiar todos los intervalos anteriores
    Object.values(refreshIntervals).forEach(interval => {
        if (interval) clearInterval(interval);
    });

    // Iniciar refresh según el panel
    switch (panel) {
        case 'panel-cocina':
            refreshIntervals.cocina = setInterval(() => {
                cargarPedidosCocina();
            }, REFRESH_CONFIG.cocina);
            cargarPedidosCocina(); // Cargar inmediatamente
            break;

        case 'panel-cajero':
            refreshIntervals.cajero = setInterval(() => {
                cargarPedidosCajero();
                cargarEstadisticasDia();
            }, REFRESH_CONFIG.cajero);
            cargarPedidosCajero();
            cargarEstadisticasDia();
            break;

        case 'panel-mesero':
            refreshIntervals.mesero = setInterval(() => {
                actualizarPedidosPorServir();
            }, REFRESH_CONFIG.mesero);
            refreshIntervals.mesas = setInterval(() => {
                cargarMesas();
            }, REFRESH_CONFIG.mesas);
            actualizarPedidosPorServir();
            break;

        case 'panel-manager':
            // Manager solo carga estadísticas
            if (typeof cargarEstadisticasManager === 'function') {
                cargarEstadisticasManager();
            }
            break;
    }

    console.log(`Auto-refresh iniciado para: ${panel}`);
}

// Función para detener auto-refresh
function detenerAutoRefresh() {
    Object.keys(refreshIntervals).forEach(key => {
        if (refreshIntervals[key]) {
            clearInterval(refreshIntervals[key]);
            refreshIntervals[key] = null;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Cargar datos iniciales (se filtra según el rol activo)
    cargarMesas();
    cargarCategorias();

    // Inicializar componentes opcionales (si existen)
    if (document.getElementById('combo-productos-lista')) {
        cargarProductosParaCombo();
        cargarCombosExistentes();
    }

    // Listener para cargar reportes cuando se activa esa pestaña
    const tabReportes = document.querySelector('[data-bs-target="#cajero-reportes-tab"]');
    if (tabReportes) {
        tabReportes.addEventListener('shown.bs.tab', () => {
            cambiarPeriodoReportes('hoy');
        });
    }

    // Inicializar FAB y carrito móvil
    inicializarCarritoMovil();

    // Detectar visibilidad de página para pausar/reanudar refresh
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            detenerAutoRefresh();
        } else {
            // Reanudar según el panel activo
            const panelActivo = document.querySelector('.work-panel:not([style*="display: none"])');
            if (panelActivo) {
                iniciarAutoRefresh(panelActivo.id);
            }
        }
    });
});

// Inicializar componentes móviles
function inicializarCarritoMovil() {
    const cartFab = document.getElementById('cart-fab');
    const cartSheet = document.getElementById('cart-sheet');

    // Detectar si es móvil
    const esMobile = window.innerWidth <= 768;

    if (esMobile && cartFab) {
        cartFab.style.display = 'flex';
    }

    // Agregar soporte para gestos de deslizar en el bottom sheet
    if (cartSheet) {
        let startY = 0;
        let currentY = 0;

        const dragHandle = cartSheet.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
            });

            dragHandle.addEventListener('touchmove', (e) => {
                currentY = e.touches[0].clientY;
                const diff = currentY - startY;

                // Si desliza hacia abajo más de 50px, cerrar
                if (diff > 50) {
                    toggleCartSheet();
                }
            });
        }
    }

    // Escuchar cambios de tamaño de ventana
    window.addEventListener('resize', () => {
        const fab = document.getElementById('cart-fab');
        if (fab) {
            if (window.innerWidth <= 768) {
                fab.style.display = 'flex';
            } else {
                fab.style.display = 'none';
                // Cerrar bottom sheet si está abierto
                const sheet = document.getElementById('cart-sheet');
                const overlay = document.getElementById('cart-sheet-overlay');
                if (sheet) sheet.classList.remove('show', 'active');
                if (overlay) overlay.classList.remove('show', 'active');
            }
        }
    });
}
