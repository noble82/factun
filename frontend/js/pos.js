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
    const datosClienteContainer = document.getElementById('datos-cliente-container');

    if (tipoComprobante === 'ticket') {
        if (seccionPropina) seccionPropina.style.display = 'block';
        if (datosClienteContainer) datosClienteContainer.style.display = 'none';
    } else if (tipoComprobante === 'factura') {
        if (seccionPropina) seccionPropina.style.display = 'none';
        if (datosClienteContainer) datosClienteContainer.style.display = 'block';
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

// Función para abrir modal de pago desde la lista de pedidos del cajero
async function abrirModalPago(pedidoId, total) {
    try {
        // Cargar detalles del pedido incluyendo items
        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}`);
        if (!response.ok) {
            throw new Error('No se pudo cargar el pedido');
        }

        const pedido = await response.json();
        pedidoActualPago = {
            id: pedidoId,
            total: parseFloat(total),
            items: pedido.items || [],
            mesa_numero: pedido.mesa_numero,
            cliente_nombre: pedido.cliente_nombre
        };

        // Calcular subtotal e IVA
        const subtotal = pedido.subtotal || (total / 1.13);
        const iva = pedido.impuesto || (total - subtotal);

        // Renderizar detalle del pago con desglose de items
        let itemsHtml = '';
        if (pedidoActualPago.items && pedidoActualPago.items.length > 0) {
            itemsHtml = `
                <div class="table-responsive mb-3">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th class="text-center">Cant</th>
                                <th class="text-end">Precio</th>
                                <th class="text-end">IVA</th>
                                <th class="text-end">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pedidoActualPago.items.map(item => {
                                const precioUnit = parseFloat(item.precio_unitario || item.precio || 0);
                                const cantidad = parseInt(item.cantidad || 1);
                                const ivaItem = precioUnit * cantidad * 0.13;
                                const totalItem = precioUnit * cantidad + ivaItem;
                                return `
                                    <tr>
                                        <td>${item.producto_nombre || item.nombre}</td>
                                        <td class="text-center">${cantidad}</td>
                                        <td class="text-end">$${(precioUnit * cantidad).toFixed(2)}</td>
                                        <td class="text-end text-muted">$${ivaItem.toFixed(2)}</td>
                                        <td class="text-end fw-bold">$${totalItem.toFixed(2)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        document.getElementById('detalle-pago').innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="mb-0"><i class="bi bi-receipt"></i> Pedido #${pedidoId}</h6>
                <span class="badge ${pedido.mesa_numero ? 'bg-primary' : 'bg-warning text-dark'}">
                    ${pedido.mesa_numero ? `Mesa ${pedido.mesa_numero}` : 'Para llevar'}
                </span>
            </div>
            ${pedido.cliente_nombre ? `<p class="text-muted mb-2"><i class="bi bi-person"></i> ${pedido.cliente_nombre}</p>` : ''}
            ${itemsHtml}
            <div class="border-top pt-2">
                <div class="d-flex justify-content-between">
                    <span>Subtotal:</span>
                    <span>$${subtotal.toFixed(2)}</span>
                </div>
                <div class="d-flex justify-content-between text-muted">
                    <span>IVA (13%):</span>
                    <span>$${iva.toFixed(2)}</span>
                </div>
                <div class="d-flex justify-content-between mt-2">
                    <strong class="fs-5">Total:</strong>
                    <strong class="fs-5 text-success">$${parseFloat(total).toFixed(2)}</strong>
                </div>
            </div>
        `;

        // Pre-llenar datos del cliente si existe
        if (pedido.cliente_nombre) {
            const nombreInput = document.getElementById('cliente-nombre');
            if (nombreInput) nombreInput.value = pedido.cliente_nombre;
        }

        // Resetear propina
        propinaActual = 0;
        actualizarDisplayPropina();

        // Mostrar sección de propina solo para ticket
        toggleSeccionPropina();

        // Mostrar modal
        new bootstrap.Modal(document.getElementById('modalPago')).show();

    } catch (error) {
        console.error('Error abrirModalPago:', error);
        mostrarNotificacion('Error', 'No se pudo cargar los detalles del pedido', 'danger');
    }
}

// Versión simple para pagos rápidos sin cargar items
function mostrarModalPago(pedidoId, total) {
    pedidoActualPago = { id: pedidoId, total: parseFloat(total), items: [] };

    document.getElementById('detalle-pago').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="mb-0"><i class="bi bi-receipt"></i> Pedido #${pedidoId}</h6>
        </div>
        <div class="text-center py-3">
            <span class="fs-4 fw-bold text-success">$${parseFloat(total).toFixed(2)}</span>
        </div>
    `;

    // Resetear propina
    propinaActual = 0;
    actualizarDisplayPropina();
    toggleSeccionPropina();

    new bootstrap.Modal(document.getElementById('modalPago')).show();
}

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
        const responsePago = await apiFetch(`${API_POS}/pedidos/${pedidoActualPago.id}/pagar`, {
            method: 'POST',
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
            body: JSON.stringify({
                tipo: tipoComprobante,
                cliente: datosCliente
            })
        });

        const facturaData = await responseFactura.json();

        if (responseFactura.ok && facturaData.success) {
            if (tipoComprobante === 'factura') {
                // Mostrar información del DTE generado
                mostrarNotificacion(
                    'Factura Generada',
                    `DTE: ${facturaData.numero_control}\nTotal: $${facturaData.total?.toFixed(2) || pedidoActualPago.total}`,
                    'success'
                );

                // Preguntar si desea enviar a Digifact para certificación
                if (confirm('¿Desea enviar la factura a Digifact para certificación?')) {
                    await enviarDTEDigifact(pedidoActualPago.id, facturaData);
                }
            } else {
                mostrarNotificacion('Éxito', `Ticket generado: ${facturaData.numero}`, 'success');
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

// Función para enviar DTE a Digifact
async function enviarDTEDigifact(pedidoId, facturaData) {
    try {
        mostrarNotificacion('Enviando', 'Enviando factura a Digifact...', 'info');

        const response = await apiFetch(`${API_POS}/pedidos/${pedidoId}/enviar-dte`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            mostrarNotificacion(
                'Certificado',
                `DTE certificado exitosamente\n${result.data?.dte_numero || ''}`,
                'success'
            );
        } else {
            mostrarNotificacion(
                'Error Digifact',
                result.error || 'No se pudo certificar el DTE',
                'danger'
            );
        }
    } catch (error) {
        console.error('Error enviarDTEDigifact:', error);
        mostrarNotificacion('Error', 'Error de conexión con Digifact', 'danger');
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

        // También cargar estadísticas del día
        cargarEstadisticasDia();
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

let ultimoConteoPorServir = 0;

async function actualizarPedidosPorServir() {
    try {
        const response = await apiFetch(`${API_POS}/mesero/pedidos-listos`);
        if (!response.ok) return;

        const pedidos = await response.json();
        const badge = document.getElementById('badge-servir');

        // Notificar si hay nuevos pedidos listos
        if (pedidos.length > ultimoConteoPorServir && ultimoConteoPorServir >= 0) {
            reproducirSonidoServir();
            mostrarNotificacion('¡Pedido Listo!', `${pedidos.length - ultimoConteoPorServir} pedido(s) listo(s) para servir`, 'success');
        }
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
        await apiFetch(`${API_POS}/pedidos/${pedidoId}/servido`, { method: 'PUT' });
        actualizarPedidosPorServir();
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
    const nombre = document.getElementById('combo-nombre')?.value;
    const descripcion = document.getElementById('combo-descripcion')?.value;
    const precio = parseFloat(document.getElementById('combo-precio')?.value);

    if (!nombre || !precio || productosSeleccionadosCombo.length === 0) {
        mostrarNotificacion('Error', 'Completa todos los campos y agrega productos', 'danger');
        return;
    }

    const combo = {
        nombre,
        descripcion,
        precio,
        productos: productosSeleccionadosCombo.map(p => ({
            producto_id: p.id,
            cantidad: 1
        }))
    };

    try {
        const response = await apiFetch(`${API_POS}/combos`, {
            method: 'POST',
            body: JSON.stringify(combo)
        });

        if (response && response.ok) {
            mostrarNotificacion('Éxito', 'Combo creado exitosamente', 'success');
            // Limpiar formulario
            document.getElementById('combo-nombre').value = '';
            document.getElementById('combo-descripcion').value = '';
            document.getElementById('combo-precio').value = '';
            productosSeleccionadosCombo = [];
            renderizarProductosSeleccionadosCombo();
            cargarCombosExistentes();
        }
    } catch (error) {
        console.error('Error guardarCombo:', error);
        mostrarNotificacion('Error', 'No se pudo guardar el combo', 'danger');
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
