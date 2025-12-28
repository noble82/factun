/**
 * POS Pupusería - Sistema de Punto de Venta
 * Maneja los flujos de Mesero, Cajero y Cocina
 * Nota: Funciones compartidas (escapeHtml, getAuthToken, etc) están en utils.js
 */

const API_BASE = '/api/pos';
const API_CLIENTES = '/api/clientes';
let rolActual = null;
let mesaSeleccionada = null;
let carrito = [];
let productos = [];
let categorias = [];
let categoriaActiva = null;
let pedidoActualPago = null;

// Intervalos para actualización automática
let updateInterval = null;

// ============ INICIALIZACIÓN ============

document.addEventListener('DOMContentLoaded', () => {
    actualizarReloj();
    setInterval(actualizarReloj, CONFIG.POLLING_INTERVALS.CLOCK);

    // Event listener para calcular cambio
    document.getElementById('monto-recibido')?.addEventListener('input', calcularCambio);

    // Event listeners para mostrar/ocultar datos de cliente
    document.getElementById('tipo-ticket')?.addEventListener('change', toggleDatosCliente);
    document.getElementById('tipo-factura')?.addEventListener('change', toggleDatosCliente);

    // Actualizar botones de crear pedido cuando cambie el nombre del cliente (cajero/mobile)
    document.getElementById('cliente-nombre-cajero')?.addEventListener('input', () => {
        renderizarCarritoCajero();
        actualizarCarritoMobile();
    });
    document.getElementById('cliente-nombre-mobile')?.addEventListener('input', () => {
        actualizarCarritoMobile();
    });

    // Ocultar FAB del carrito hasta que se seleccione un rol
    // Esto será sobrescrito por activarElementosMovil() cuando auth-check.js complete
    const cartFab = document.getElementById('cart-fab');
    if (cartFab) {
        cartFab.classList.add('mobile-hidden');
    }
});

// Callback que será llamado por auth-check.js cuando la verificación esté completa
window.onAuthVerificado = function(usuario) {
    console.log('=== onAuthVerificado llamado ===');
    console.log('Usuario:', usuario);

    // auth-check.js ya muestra el panel, aquí cargamos los datos Y activamos elementos móviles
    if (usuario.rol === 'mesero') {
        console.log('Configurando mesero...');
        rolActual = 'mesero';

        // Cargar datos
        cargarDatosMesero().then(() => {
            console.log('Datos de mesero cargados');
            // Re-activar elementos móviles después de cargar datos (fallback)
            activarElementosMovil('mesero');
        }).catch(err => {
            console.error('Error cargando datos mesero:', err);
        });
        iniciarActualizacionMesero();

        // Activar navegación móvil y FAB inmediatamente
        activarElementosMovil('mesero');

        // Fallback: re-activar después de 500ms por si algo lo oculta
        setTimeout(() => {
            console.log('Fallback timeout - re-activando elementos mesero');
            activarElementosMovil('mesero');
        }, 500);

    } else if (usuario.rol === 'cajero') {
        console.log('Configurando cajero...');
        rolActual = 'cajero';

        // Cargar datos
        cargarDatosCajero().then(() => {
            console.log('Datos de cajero cargados');
            // Re-activar elementos móviles después de cargar datos (fallback)
            activarElementosMovil('cajero');
        }).catch(err => {
            console.error('Error cargando datos cajero:', err);
        });
        iniciarActualizacionCajero();
        iniciarActualizacionReportes();

        // Activar navegación móvil y FAB inmediatamente
        activarElementosMovil('cajero');

        // Fallback: re-activar después de 500ms por si algo lo oculta
        setTimeout(() => {
            console.log('Fallback timeout - re-activando elementos cajero');
            activarElementosMovil('cajero');
        }, 500);

    } else if (usuario.rol === 'manager') {
        console.log('Manager: selector de roles visible');
        // Mostrar enlaces de navegación para manager (desktop)
        const managerNavLinks = document.getElementById('manager-nav-links');
        if (managerNavLinks) {
            managerNavLinks.classList.remove('d-none');
            console.log('Enlaces de manager mostrados');
        }
        // Mostrar items de navegación en dropdown (móvil)
        document.getElementById('li-cambiar-rol').classList.remove('d-none');
        document.getElementById('li-admin').classList.remove('d-none');
        document.getElementById('li-factura').classList.remove('d-none');
    }

    console.log('=== Fin onAuthVerificado ===');
};

// Activar elementos móviles (FAB, navegación inferior)
function activarElementosMovil(rol) {
    console.log('=== activarElementosMovil() ===');
    console.log('Rol:', rol, '- Ancho ventana:', window.innerWidth);

    const esMobile = window.innerWidth <= 768;
    const esRolConCarrito = (rol === 'mesero' || rol === 'cajero');

    console.log('Es móvil:', esMobile, '- Rol con carrito:', esRolConCarrito);

    // Mostrar FAB del carrito para mesero y cajero en móvil
    const cartFab = document.getElementById('cart-fab');
    if (cartFab) {
        // Limpiar estilos inline y clases previas
        cartFab.style.cssText = '';
        cartFab.classList.remove('mobile-active', 'mobile-hidden');

        if (esMobile && esRolConCarrito) {
            cartFab.classList.add('mobile-active');
            console.log('✓ FAB activado con clase mobile-active');
        } else {
            cartFab.classList.add('mobile-hidden');
            console.log('✗ FAB oculto con clase mobile-hidden');
        }
    } else {
        console.error('✗ cart-fab NO encontrado en el DOM');
    }

    // Bottom nav deshabilitado - las opciones están en los tabs superiores
    // Solo mantenemos el FAB del carrito

    // Actualizar el carrito móvil
    if (esRolConCarrito) {
        actualizarCarritoMobile();
    }

    console.log('=== Fin activarElementosMovil() ===');
}

function autoSeleccionarRol(user) {
    // Si no se pasó usuario, intentar obtenerlo del localStorage
    if (!user) {
        user = getUsuarioActual ? getUsuarioActual() : null;
    }

    if (!user || !user.rol) {
        // Sin sesión, redirigir a login
        window.location.href = 'login.html';
        return;
    }

    // Mostrar nombre de usuario
    const userInfo = document.getElementById('usuario-info');
    const userName = document.getElementById('usuario-nombre-display');
    if (userInfo && userName) {
        userName.textContent = user.nombre;
        userInfo.classList.remove('d-none');
    }

    // Auto-seleccionar rol según el usuario
    switch(user.rol) {
        case 'mesero':
            // Mesero va directo a su panel, sin ver selector
            seleccionarRol('mesero');
            break;
        case 'cajero':
            // Cajero va directo a su panel, sin ver selector
            seleccionarRol('cajero');
            break;
            case 'cocina':
                // Cocina no tiene acceso a POS, redirigir a cocina
                window.location.href = 'cocina.html';
            break;
        case 'manager':
            // Manager puede elegir cualquier rol, mostrar selector
            document.getElementById('role-selector').style.display = 'block';
            break;
    }
}

function toggleDatosCliente() {
    const tipoFactura = document.getElementById('tipo-factura')?.checked;
    const container = document.getElementById('datos-cliente-container');
    if (container) {
        container.style.display = tipoFactura ? 'block' : 'none';

        // Mostrar u ocultar campos de crédito: solo si es factura y el cliente es contribuyente
        const creditoField = document.getElementById('cliente-credito');
        const diasField = document.getElementById('cliente-dias-credito');
        const clienteId = document.getElementById('cliente-id-factura')?.value;

        const mostrarCredito = tipoFactura && (clienteId ? true : false);
        if (creditoField) creditoField.closest('.row')?.classList.toggle('d-none', !mostrarCredito);
        if (diasField) diasField.closest('.row')?.classList.toggle('d-none', !mostrarCredito);
    }
}

function toggleOpcionesPago() {
    const tipoPago = document.getElementById('tipo-pago').value;
    const opcionesParaLlevar = document.getElementById('opciones-para-llevar');

    if (opcionesParaLlevar) {
        // Mostrar nombre de cliente solo para pago anticipado (para llevar)
        opcionesParaLlevar.style.display = tipoPago === 'anticipado' ? 'block' : 'none';
    }
}

function actualizarReloj() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleTimeString('es-SV');
}

// ============ GESTIÓN DE ROLES ============

function seleccionarRol(rol) {
    // Validar que el usuario puede seleccionar este rol
    const user = getUsuarioActual ? getUsuarioActual() : null;

    if (!user) {
        alert('Sesión no válida. Por favor inicie sesión nuevamente.');
        window.location.href = 'login.html';
        return;
    }

    // Solo el manager puede elegir cualquier rol
    // Mesero solo puede ser mesero, Cajero solo puede ser cajero
    if (user.rol !== 'manager') {
        if (user.rol === 'mesero' && rol !== 'mesero') {
            alert('Solo tienes acceso al panel de Mesero');
            return;
        }
        if (user.rol === 'cajero' && rol !== 'cajero') {
            alert('Solo tienes acceso al panel de Cajero');
            return;
        }
        if (user.rol === 'cocinero') {
            window.location.href = 'cocina.html';
            return;
        }
    }

    rolActual = rol;

    // Ocultar selector de rol
    document.getElementById('role-selector').style.display = 'none';

    // Mostrar elementos de navegación
    document.getElementById('current-role').textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
    document.getElementById('current-role').classList.remove('d-none');

    // Solo mostrar botón de cambiar rol y enlaces de navegación para managers
    if (user.rol === 'manager') {
        // Desktop buttons
        document.getElementById('btn-cambiar-rol').classList.remove('d-none');
        const managerNavLinks = document.getElementById('manager-nav-links');
        if (managerNavLinks) managerNavLinks.classList.remove('d-none');
        // Mobile dropdown items
        document.getElementById('li-cambiar-rol').classList.remove('d-none');
        document.getElementById('li-admin').classList.remove('d-none');
        document.getElementById('li-factura').classList.remove('d-none');
    } else {
        // Desktop buttons
        document.getElementById('btn-cambiar-rol').classList.add('d-none');
        const managerNavLinks = document.getElementById('manager-nav-links');
        if (managerNavLinks) managerNavLinks.classList.add('d-none');
        // Mobile dropdown items
        document.getElementById('li-cambiar-rol').classList.add('d-none');
        document.getElementById('li-admin').classList.add('d-none');
        document.getElementById('li-factura').classList.add('d-none');
    }

    // Ocultar todos los paneles
    document.querySelectorAll('.work-panel').forEach(p => p.classList.remove('active'));

    // Mostrar panel correspondiente
    document.getElementById(`panel-${rol}`).classList.add('active');

    // Cargar datos según el rol
    switch(rol) {
        case 'mesero':
            cargarDatosMesero();
            iniciarActualizacionMesero();
            break;
        case 'cajero':
            cargarDatosCajero();
            iniciarActualizacionCajero();
            iniciarActualizacionReportes();
            break;
        case 'cocina':
            cargarDatosCocina();
            iniciarActualizacionCocina();
            break;
    }

    // Activar elementos móviles (FAB y navegación)
    activarElementosMovil(rol);

    // Fallback: re-activar después de 500ms por si algo lo oculta
    setTimeout(() => {
        console.log('Fallback timeout (seleccionarRol) - re-activando elementos:', rol);
        activarElementosMovil(rol);
    }, 500);
}

function mostrarSelectorRol() {
    // Solo manager puede cambiar de rol
    const user = getUsuarioActual ? getUsuarioActual() : null;
    if (!user || user.rol !== 'manager') {
        alert('Solo el manager puede cambiar de rol');
        return;
    }

    // Limpiar intervalo de actualización
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }

    rolActual = null;
    mesaSeleccionada = null;
    carrito = [];

    document.getElementById('role-selector').style.display = 'block';
    document.getElementById('current-role').classList.add('d-none');
    document.getElementById('btn-cambiar-rol').classList.add('d-none');
    // Mantener enlaces de navegación visibles para manager
    const managerNavLinks = document.getElementById('manager-nav-links');
    if (managerNavLinks && user && user.rol === 'manager') {
        managerNavLinks.classList.remove('d-none');
    }
    document.querySelectorAll('.work-panel').forEach(p => p.classList.remove('active'));
}

// ============ FUNCIONES DEL MESERO ============

async function cargarDatosMesero() {
    console.log('cargarDatosMesero() iniciando...');
    try {
        await Promise.all([
            cargarMesas(),
            cargarCategorias(),
            cargarProductos(),
            cargarPedidosParaServir()
        ]);
        console.log('cargarDatosMesero() completado');
    } catch (error) {
        console.error('Error en cargarDatosMesero:', error);
        throw error;
    }
}

function iniciarActualizacionMesero() {
    updateInterval = setInterval(() => {
        cargarMesas();
        cargarPedidosParaServir();
    }, CONFIG.POLLING_INTERVALS.MESERO);
}

async function cargarMesas() {
    console.log('cargarMesas() llamado');
    try {
        const response = await fetch(`${API_BASE}/mesas`);
        const mesas = await response.json();
        console.log('Mesas recibidas:', mesas.length);
        renderizarMesas(mesas);
    } catch (error) {
        console.error('Error cargando mesas:', error);
    }
}

function renderizarMesas(mesas) {
    const container = document.getElementById('mesas-container');
    if (!container) {
        console.error('Container mesas-container no encontrado!');
        return;
    }
    console.log('Renderizando', mesas.length, 'mesas en container:', container);
    container.innerHTML = mesas.map(mesa => `
        <div class="mesa-card mesa-${mesa.estado}" onclick="seleccionarMesa(${mesa.id}, ${mesa.numero}, '${mesa.estado}')">
            <i class="bi bi-${mesa.estado === 'libre' ? 'check-circle' : 'people'} fs-4"></i>
            <span>Mesa ${mesa.numero}</span>
            ${mesa.pedidos_activos > 0 ? `<small>${mesa.pedidos_activos} pedido(s)</small>` : ''}
        </div>
    `).join('');
}

function seleccionarMesa(id, numero, estado) {
    mesaSeleccionada = { id, numero, estado };
    document.getElementById('mesa-seleccionada').textContent = `Mesa ${numero}`;

    // Cambiar a tab de menú
    const menuTab = document.querySelector('[data-bs-target="#menu-tab"]');
    bootstrap.Tab.getOrCreateInstance(menuTab).show();

    mostrarNotificacion('Mesa Seleccionada', `Mesa ${numero} seleccionada. Agrega productos al pedido.`);
}

async function cargarCategorias() {
    try {
        const response = await fetch(`${API_BASE}/categorias`);
        categorias = await response.json();
        renderizarCategorias();
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }
}

function renderizarCategorias() {
    const container = document.getElementById('categorias-container');
    container.innerHTML = `
        <div class="categoria-tab ${!categoriaActiva ? 'active' : ''}" onclick="filtrarCategoria(null)">Todos</div>
        ${categorias.map(cat => `
            <div class="categoria-tab ${categoriaActiva === cat.id ? 'active' : ''}" onclick="filtrarCategoria(${cat.id})">${cat.nombre}</div>
        `).join('')}
    `;
}

function filtrarCategoria(categoriaId) {
    categoriaActiva = categoriaId;
    renderizarCategorias();
    renderizarProductos();
}

async function cargarProductos() {
    console.log('cargarProductos() llamado');
    try {
        const response = await fetch(`${API_BASE}/productos`);
        productos = await response.json();
        console.log('Productos recibidos:', productos.length);
        renderizarProductos();
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function renderizarProductos() {
    const container = document.getElementById('productos-container');
    if (!container) {
        console.error('Container productos-container no encontrado!');
        return;
    }
    const productosFiltrados = categoriaActiva
        ? productos.filter(p => p.categoria_id === categoriaActiva)
        : productos;

    console.log('renderizarProductos() - Renderizando', productosFiltrados.length, 'productos');

    container.innerHTML = productosFiltrados.map(producto => `
        <div class="product-card ${!producto.disponible ? 'disabled' : ''}"
             data-producto-id="${producto.id}"
             onclick="window.agregarAlCarrito(${producto.id}); return false;">
            <div class="fw-bold">${escapeHtml(producto.nombre)}</div>
            <small class="text-muted">${escapeHtml(producto.descripcion || '')}</small>
            <div class="product-price">$${producto.precio.toFixed(2)}</div>
        </div>
    `).join('');

    // Añadir event listeners táctiles como respaldo
    container.querySelectorAll('.product-card:not(.disabled)').forEach(card => {
        card.addEventListener('touchend', function(e) {
            e.preventDefault();
            const id = parseInt(this.dataset.productoId);
            console.log('Touch en producto:', id);
            agregarAlCarrito(id);
        }, { passive: false });
    });

    console.log('Productos renderizados con event listeners');
}

function agregarAlCarrito(productoId) {
    // Obtener tipo de pago de móvil o desktop
    const tipoPagoMobile = document.getElementById('tipo-pago-mobile')?.value;
    const tipoPagoDesktop = document.getElementById('tipo-pago')?.value;
    const tipoPago = tipoPagoMobile || tipoPagoDesktop || 'anticipado';

    console.log('Agregando al carrito:', productoId, 'Tipo pago:', tipoPago, 'Mesa:', mesaSeleccionada);

    // Para pago al final (en mesa), se requiere mesa seleccionada
    // Para pago anticipado (para llevar), NO se requiere mesa
    if (tipoPago === 'al_final' && !mesaSeleccionada) {
        mostrarNotificacion('Atención', 'Para pedidos en mesa, primero selecciona una mesa', 'warning');
        return;
    }

    const producto = productos.find(p => p.id === productoId);
    if (!producto || !producto.disponible) {
        console.log('Producto no encontrado o no disponible:', productoId);
        return;
    }

    const itemExistente = carrito.find(item => item.producto_id === productoId);

    if (itemExistente) {
        itemExistente.cantidad++;
        itemExistente.subtotal = itemExistente.cantidad * producto.precio;
    } else {
        carrito.push({
            producto_id: productoId,
            nombre: producto.nombre,
            precio: producto.precio,
            cantidad: 1,
            subtotal: producto.precio
        });
    }

    console.log('Carrito actualizado:', carrito.length, 'items');
    renderizarCarrito();

    // Feedback visual en móvil
    const fab = document.getElementById('cart-fab');
    if (fab) {
        fab.classList.add('pulse');
        setTimeout(() => fab.classList.remove('pulse'), 300);
    }
}

function modificarCantidad(productoId, delta) {
    const item = carrito.find(i => i.producto_id === productoId);
    if (!item) return;

    item.cantidad += delta;

    if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.producto_id !== productoId);
    } else {
        item.subtotal = item.cantidad * item.precio;
    }

    renderizarCarrito();
}

function renderizarCarrito() {
    const container = document.getElementById('cart-items');
    const btnEnviar = document.getElementById('btn-enviar-pedido');
    const subtotalEl = document.getElementById('cart-subtotal');
    const ivaEl = document.getElementById('cart-iva');
    const totalEl = document.getElementById('cart-total');

    // Actualizar carrito desktop si existe
    if (container) {
        if (carrito.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Selecciona productos del menú</p>';
            if (btnEnviar) btnEnviar.disabled = true;
        } else {
            container.innerHTML = carrito.map(item => `
                <div class="cart-item">
                    <div>
                        <strong>${item.nombre}</strong><br>
                        <small>$${item.precio.toFixed(2)} x ${item.cantidad}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary" onclick="modificarCantidad(${item.producto_id}, -1)">-</button>
                        <span>${item.cantidad}</span>
                        <button class="btn btn-sm btn-outline-secondary" onclick="modificarCantidad(${item.producto_id}, 1)">+</button>
                        <strong>$${item.subtotal.toFixed(2)}</strong>
                    </div>
                </div>
            `).join('');
            if (btnEnviar) btnEnviar.disabled = false;
        }
    }

    // Calcular totales
    const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const iva = calculateIVA(subtotal);
    const total = calculateTotal(subtotal);

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (ivaEl) ivaEl.textContent = `$${iva.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

    // SIEMPRE actualizar carrito móvil
    actualizarCarritoMobile();

    console.log('renderizarCarrito() - items en carrito:', carrito.length);
}

async function enviarPedido() {
    const tipoPago = document.getElementById('tipo-pago').value;
    const clienteNombre = document.getElementById('cliente-nombre-pedido')?.value?.trim() || '';

    // Validaciones según tipo de pago
    if (tipoPago === 'al_final') {
        // Para pago al final (en mesa), se requiere mesa
        if (!mesaSeleccionada) {
            mostrarNotificacion('Error', 'Selecciona una mesa para pedidos en mesa', 'danger');
            return;
        }
    } else {
        // Para pago anticipado (para llevar), se REQUIERE nombre si no hay mesa
        if (!mesaSeleccionada && !clienteNombre) {
            mostrarNotificacion('Error', 'Ingresa el nombre del cliente para pedidos para llevar', 'danger');
            document.getElementById('cliente-nombre-pedido')?.focus();
            return;
        }
    }

    if (carrito.length === 0) {
        mostrarNotificacion('Error', 'Agrega productos al pedido', 'danger');
        return;
    }

    // Obtener nombre del usuario autenticado
    const usuario = getUsuarioActual ? getUsuarioActual() : null;
    const nombreMesero = usuario ? usuario.nombre : 'Mesero';

    const pedido = {
        mesa_id: mesaSeleccionada ? mesaSeleccionada.id : null,
        mesero: nombreMesero,
        tipo_pago: tipoPago,
        cliente_nombre: clienteNombre,
        items: carrito.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            notas: item.notas || ''
        }))
    };

    try {
        const response = await fetch(`${API_BASE}/pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedido)
        });

        const result = await response.json();

        if (result.success) {
            const mensajeMesa = mesaSeleccionada ? `Mesa ${mesaSeleccionada.numero}` : clienteNombre || 'Para llevar';
            mostrarNotificacion('Pedido Enviado',
                tipoPago === 'anticipado'
                    ? `Pedido #${result.pedido_id} (${mensajeMesa}) enviado a caja. Total: $${result.total.toFixed(2)}`
                    : `Pedido #${result.pedido_id} (${mensajeMesa}) enviado a cocina.`,
                'success'
            );

            // Limpiar carrito y formulario
            carrito = [];
            mesaSeleccionada = null;
            document.getElementById('mesa-seleccionada').textContent = '';
            document.getElementById('cliente-nombre-pedido').value = '';
            renderizarCarrito();
            cargarMesas();

            // Volver a tab de mesas
            const mesasTab = document.querySelector('[data-bs-target="#mesas-tab"]');
            bootstrap.Tab.getOrCreateInstance(mesasTab).show();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error enviando pedido:', error);
        mostrarNotificacion('Error', 'No se pudo enviar el pedido', 'danger');
    }
}

async function cargarPedidosParaServir() {
    try {
        const response = await fetch(`${API_BASE}/mesero/pedidos`);
        const pedidos = await response.json();

        const badge = document.getElementById('badge-servir');
        if (pedidos.length > 0) {
            badge.textContent = pedidos.length;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }

        renderizarPedidosServir(pedidos);
    } catch (error) {
        console.error('Error cargando pedidos para servir:', error);
    }
}

function renderizarPedidosServir(pedidos) {
    const container = document.getElementById('pedidos-servir-container');

    if (pedidos.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No hay pedidos listos para servir</div>';
        return;
    }

    container.innerHTML = pedidos.map(pedido => {
        const esParaLlevar = pedido.tipo_pago === 'anticipado' || !pedido.mesa_id;
        const nombreCliente = escapeHtml(pedido.cliente_nombre || 'Cliente');

        return `
            <div class="pedido-card">
                <div class="pedido-header listo">
                    <div>
                        <strong>Pedido #${pedido.id}</strong>
                        ${esParaLlevar
                            ? `<span class="badge bg-warning text-dark ms-2"><i class="bi bi-bag"></i> PARA LLEVAR</span>`
                            : `<span class="ms-2">Mesa ${pedido.mesa_numero || 'N/A'}</span>`
                        }
                    </div>
                    <span class="badge bg-light text-dark">LISTO</span>
                </div>
                <div class="pedido-body">
                    ${esParaLlevar ? `
                        <div class="alert alert-warning py-2 mb-2">
                            <i class="bi bi-person-fill"></i>
                            <strong class="fs-5">${nombreCliente}</strong>
                        </div>
                    ` : ''}
                    ${pedido.items.map(item => `
                        <div class="pedido-item">
                            <span>${item.cantidad}x ${escapeHtml(item.producto_nombre)}</span>
                        </div>
                    `).join('')}
                    <hr>
                    <div class="d-flex justify-content-between align-items-center">
                        <strong>Total: $${pedido.total.toFixed(2)}</strong>
                        <button class="btn btn-info" onclick="marcarServido(${pedido.id}, '${escapeAttribute(pedido.tipo_pago)}')">
                            <i class="bi bi-check2-circle"></i> ${esParaLlevar ? 'Entregar' : 'Marcar Servido'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function marcarServido(pedidoId, tipoPago) {
    try {
        // Primero marcar como servido
        await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'servido' })
        });

        // Si es pago al final, cambiar a pendiente_pago
        if (tipoPago === 'al_final') {
            await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'pendiente_pago' })
            });
            mostrarNotificacion('Pedido Servido', 'El pedido fue servido. Pendiente de cobro en caja.', 'success');
        } else {
            // Si ya estaba pagado, cerrar el pedido
            await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'cerrado' })
            });
            mostrarNotificacion('Pedido Completado', 'El pedido fue servido y cerrado.', 'success');
        }

        cargarPedidosParaServir();
        cargarMesas();
    } catch (error) {
        console.error('Error marcando servido:', error);
        mostrarNotificacion('Error', 'No se pudo actualizar el pedido', 'danger');
    }
}

// ============ FUNCIONES DEL CAJERO ============

let carritoCajero = [];
let categoriaActivaCajero = null;

async function cargarDatosCajero() {
    // Verificar si el usuario es manager para mostrar botón de reportes detallados
    verificarPermisosReportes();

    await Promise.all([
        cargarPedidosCajero(),
        cargarEstadisticas(),
        cargarProductosCajero(),
        cargarCategoriasCajero(),
        cargarCreditosPendientes(),
        cargarReportesRapidos()
    ]);
}

// Mostrar botón de reportes detallados solo si es manager
function verificarPermisosReportes() {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    const botonReportes = document.getElementById('boton-reportes-detallados');
    if (!botonReportes) return;

    if (user && user.rol === 'manager') {
        botonReportes.style.display = 'block';
    } else {
        botonReportes.style.display = 'none';
    }
}

// Cargar categorías para el cajero
async function cargarCategoriasCajero() {
    try {
        const response = await fetch(`${API_BASE}/categorias`);
        const cats = await response.json();
        renderizarCategoriasCajero(cats);
    } catch (error) {
        console.error('Error cargando categorías cajero:', error);
    }
}

function renderizarCategoriasCajero(cats) {
    const container = document.getElementById('categorias-container-cajero');
    if (!container) return;
    container.innerHTML = `
        <div class="categoria-tab ${!categoriaActivaCajero ? 'active' : ''}" onclick="filtrarCategoriaCajero(null)">Todos</div>
        ${cats.map(cat => `
            <div class="categoria-tab ${categoriaActivaCajero === cat.id ? 'active' : ''}" onclick="filtrarCategoriaCajero(${cat.id})">${cat.nombre}</div>
        `).join('')}
    `;
}

function filtrarCategoriaCajero(categoriaId) {
    categoriaActivaCajero = categoriaId;
    cargarCategoriasCajero();
    renderizarProductosCajero();
}

// Cargar productos para el cajero
async function cargarProductosCajero() {
    try {
        const response = await fetch(`${API_BASE}/productos`);
        const prods = await response.json();
        // Guardar en variable global si no existe
        if (!productos || productos.length === 0) {
            productos = prods;
        }
        renderizarProductosCajero();
    } catch (error) {
        console.error('Error cargando productos cajero:', error);
    }
}

function renderizarProductosCajero() {
    const container = document.getElementById('productos-container-cajero');
    if (!container) {
        console.log('productos-container-cajero no encontrado');
        return;
    }

    const productosFiltrados = categoriaActivaCajero
        ? productos.filter(p => p.categoria_id === categoriaActivaCajero)
        : productos;

    console.log('renderizarProductosCajero() - Renderizando', productosFiltrados.length, 'productos');

    container.innerHTML = productosFiltrados.map(producto => `
        <div class="product-card ${!producto.disponible ? 'disabled' : ''}"
             data-producto-id="${producto.id}"
             onclick="window.agregarAlCarritoCajero(${producto.id}); return false;">
            <div class="fw-bold">${producto.nombre}</div>
            <small class="text-muted">${producto.descripcion || ''}</small>
            <div class="product-price">$${producto.precio.toFixed(2)}</div>
        </div>
    `).join('');

    // Añadir event listeners táctiles como respaldo
    container.querySelectorAll('.product-card:not(.disabled)').forEach(card => {
        card.addEventListener('touchend', function(e) {
            e.preventDefault();
            const id = parseInt(this.dataset.productoId);
            console.log('Touch en producto cajero:', id);
            agregarAlCarritoCajero(id);
        }, { passive: false });
    });

    console.log('Productos cajero renderizados con event listeners');
}

function agregarAlCarritoCajero(productoId) {
    console.log('agregarAlCarritoCajero:', productoId);

    const producto = productos.find(p => p.id === productoId);
    if (!producto || !producto.disponible) {
        console.log('Producto no encontrado o no disponible:', productoId);
        return;
    }

    const itemExistente = carritoCajero.find(item => item.producto_id === productoId);

    if (itemExistente) {
        itemExistente.cantidad++;
        itemExistente.subtotal = itemExistente.cantidad * producto.precio;
    } else {
        carritoCajero.push({
            producto_id: productoId,
            nombre: producto.nombre,
            precio: producto.precio,
            cantidad: 1,
            subtotal: producto.precio
        });
    }

    console.log('Carrito cajero actualizado:', carritoCajero.length, 'items');
    renderizarCarritoCajero();

    // También actualizar el carrito móvil
    actualizarCarritoMobile();

    // Feedback visual en móvil
    const fab = document.getElementById('cart-fab');
    if (fab) {
        fab.classList.add('pulse');
        setTimeout(() => fab.classList.remove('pulse'), 300);
    }
}

function modificarCantidadCajero(productoId, delta) {
    const item = carritoCajero.find(i => i.producto_id === productoId);
    if (!item) return;

    item.cantidad += delta;

    if (item.cantidad <= 0) {
        carritoCajero = carritoCajero.filter(i => i.producto_id !== productoId);
    } else {
        item.subtotal = item.cantidad * item.precio;
    }

    renderizarCarritoCajero();
    actualizarCarritoMobile();
}

function renderizarCarritoCajero() {
    const container = document.getElementById('cart-items-cajero');
    if (!container) return;

    if (carritoCajero.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Selecciona productos del menú</p>';
    } else {
        container.innerHTML = carritoCajero.map(item => `
            <div class="cart-item">
                <div>
                    <strong>${item.nombre}</strong><br>
                    <small>$${item.precio.toFixed(2)} x ${item.cantidad}</small>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="modificarCantidadCajero(${item.producto_id}, -1)">-</button>
                    <span>${item.cantidad}</span>
                    <button class="btn btn-sm btn-outline-secondary" onclick="modificarCantidadCajero(${item.producto_id}, 1)">+</button>
                    <strong>$${item.subtotal.toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
        // Habilitar botón crear pedido solo si hay nombre de cliente
        const btnCrear = document.getElementById('btn-crear-pedido-cajero');
        const nombreCliente = document.getElementById('cliente-nombre-cajero')?.value?.trim();
        if (btnCrear) btnCrear.disabled = carritoCajero.length === 0 || !nombreCliente;
    }

    // Calcular totales
    const subtotal = carritoCajero.reduce((sum, item) => sum + item.subtotal, 0);
    const iva = calculateIVA(subtotal);
    const total = calculateTotal(subtotal);

    document.getElementById('cart-subtotal-cajero').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('cart-iva-cajero').textContent = `$${iva.toFixed(2)}`;
    document.getElementById('cart-total-cajero').textContent = `$${total.toFixed(2)}`;
}

// Crear pedido desde cajero (para llevar con pago inmediato)
async function crearPedidoCajero() {
    const clienteNombre = document.getElementById('cliente-nombre-cajero')?.value?.trim();

    if (!clienteNombre) {
        mostrarNotificacion('Error', 'Ingresa el nombre del cliente', 'danger');
        document.getElementById('cliente-nombre-cajero')?.focus();
        return;
    }

    if (carritoCajero.length === 0) {
        mostrarNotificacion('Error', 'Agrega productos al pedido', 'danger');
        return;
    }

    const usuario = getUsuarioActual ? getUsuarioActual() : null;

    const pedido = {
        mesa_id: null,  // Para llevar, sin mesa
        mesero: usuario ? usuario.nombre : 'Cajero',
        tipo_pago: 'anticipado',
        cliente_nombre: clienteNombre,
        items: carritoCajero.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            notas: ''
        }))
    };

    try {
        // 1. Crear el pedido
        const response = await fetch(`${API_BASE}/pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedido)
        });

        const result = await response.json();

        if (result.success) {
            // 2. Abrir modal de pago inmediatamente
            pedidoActualPago = { id: result.pedido_id, total: result.total };
            document.getElementById('detalle-pago').innerHTML = `
                <h4 class="text-center">Pedido Para Llevar</h4>
                <p class="text-center text-muted">${clienteNombre}</p>
                <h2 class="text-center text-success">$${result.total.toFixed(2)}</h2>
            `;
            document.getElementById('monto-recibido').value = '';
            document.getElementById('cambio-container').style.display = 'none';
            document.getElementById('pago-efectivo').checked = true;
            onMetodoPagoChange();

            const modal = new bootstrap.Modal(document.getElementById('modalPago'));
            modal.show();

            // 3. Limpiar carrito del cajero
            carritoCajero = [];
            document.getElementById('cliente-nombre-cajero').value = '';
            renderizarCarritoCajero();
        } else {
            mostrarNotificacion('Error', result.error, 'danger');
        }
    } catch (error) {
        console.error('Error creando pedido:', error);
        mostrarNotificacion('Error', 'No se pudo crear el pedido', 'danger');
    }
}

// ============ FUNCIONES DE GESTIÓN DE CRÉDITOS (CAJERO) ============

let timeoutBusquedaCredito = null;

async function buscarClienteCredito(texto) {
    const resultadosDiv = document.getElementById('resultados-cliente-credito');

    clearTimeout(timeoutBusquedaCredito);

    if (texto.length < 2) {
        resultadosDiv.innerHTML = '';
        return;
    }

    timeoutBusquedaCredito = setTimeout(async () => {
        try {
            const response = await fetch(`${API_CLIENTES}/clientes?buscar=${encodeURIComponent(texto)}&activo=1`);
            const clientes = await response.json();

            if (clientes.length === 0) {
                resultadosDiv.innerHTML = '<div class="list-group-item text-muted">No se encontraron clientes</div>';
                return;
            }

            resultadosDiv.innerHTML = clientes.slice(0, 5).map(cliente => `
                <button type="button" class="list-group-item list-group-item-action"
                        onclick="seleccionarClienteCredito(${cliente.id})">
                    <strong>${escapeHtml(cliente.nombre)}</strong>
                    <small class="text-muted d-block">${escapeHtml(cliente.numero_documento || 'Sin documento')}</small>
                </button>
            `).join('');
        } catch (error) {
            console.error('Error buscando clientes:', error);
        }
    }, 300);
}

async function seleccionarClienteCredito(clienteId) {
    try {
        // Obtener datos del cliente
        const response = await fetch(`${API_CLIENTES}/clientes/${clienteId}`);
        const cliente = await response.json();

        // Obtener info de crédito
        const creditoResponse = await fetch(`${API_CLIENTES}/clientes/${clienteId}/credito`);
        const credito = await creditoResponse.json();

        // Mostrar formulario
        document.getElementById('form-credito-cliente').style.display = 'block';
        document.getElementById('nombre-cliente-credito').textContent = cliente.nombre;
        document.getElementById('id-cliente-credito').value = clienteId;
        document.getElementById('monto-credito-autorizado').value = credito.credito_autorizado || 0;
        document.getElementById('dias-credito-cliente').value = cliente.dias_credito || 30;
        document.getElementById('credito-utilizado-info').textContent = `$${(credito.credito_utilizado || 0).toFixed(2)}`;
        document.getElementById('credito-disponible-info').textContent = `$${(credito.credito_disponible || 0).toFixed(2)}`;

        // Limpiar búsqueda
        document.getElementById('resultados-cliente-credito').innerHTML = '';
        document.getElementById('buscar-cliente-credito').value = cliente.nombre;

    } catch (error) {
        console.error('Error cargando cliente:', error);
        mostrarNotificacion('Error', 'No se pudo cargar el cliente', 'danger');
    }
}

async function guardarCreditoCliente() {
    const clienteId = document.getElementById('id-cliente-credito').value;
    const creditoAutorizado = parseFloat(document.getElementById('monto-credito-autorizado').value) || 0;
    const diasCredito = parseInt(document.getElementById('dias-credito-cliente').value) || 30;

    if (!clienteId) {
        mostrarNotificacion('Error', 'Selecciona un cliente primero', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${clienteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credito_autorizado: creditoAutorizado,
                dias_credito: diasCredito
            })
        });

        if (response.ok) {
            mostrarNotificacion('Éxito', `Crédito de $${creditoAutorizado.toFixed(2)} autorizado correctamente`, 'success');
            // Refrescar info
            await seleccionarClienteCredito(clienteId);
        } else {
            const error = await response.json();
            mostrarNotificacion('Error', error.error || 'No se pudo guardar', 'danger');
        }
    } catch (error) {
        console.error('Error guardando crédito:', error);
        mostrarNotificacion('Error', 'Error de conexión', 'danger');
    }
}

async function cargarCreditosPendientes() {
    const container = document.getElementById('lista-creditos-pendientes');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/pedidos?estado=credito`);
        const pedidos = await response.json();

        if (pedidos.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No hay ventas a crédito pendientes</p>';
            return;
        }

        container.innerHTML = pedidos.map(pedido => `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${pedido.cliente_nombre || 'Cliente #' + pedido.cliente_id}</strong>
                            <small class="d-block text-muted">${new Date(pedido.created_at).toLocaleDateString()}</small>
                        </div>
                        <div class="text-end">
                            <strong class="text-danger">$${pedido.total.toFixed(2)}</strong>
                            <button class="btn btn-sm btn-success ms-2" onclick="cobrarCredito(${pedido.id}, ${pedido.total})">
                                <i class="bi bi-cash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando créditos:', error);
        container.innerHTML = '<p class="text-danger text-center">Error cargando datos</p>';
    }
}

async function cobrarCredito(pedidoId, total) {
    if (!confirm(`¿Cobrar crédito de $${total.toFixed(2)}?`)) return;

    try {
        // Cambiar estado a cerrado (pagado)
        await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'cerrado' })
        });

        mostrarNotificacion('Éxito', `Crédito de $${total.toFixed(2)} cobrado`, 'success');
        cargarCreditosPendientes();
        cargarEstadisticas();
    } catch (error) {
        console.error('Error cobrando crédito:', error);
        mostrarNotificacion('Error', 'No se pudo cobrar el crédito', 'danger');
    }
}

function iniciarActualizacionCajero() {
    updateInterval = setInterval(() => {
        cargarPedidosCajero();
        cargarEstadisticas();
    }, CONFIG.POLLING_INTERVALS.CAJERO);
}

async function cargarPedidosCajero() {
    try {
        const response = await fetch(`${API_BASE}/cajero/pedidos`);
        const pedidos = await response.json();
        renderizarPedidosCajero(pedidos);
    } catch (error) {
        console.error('Error cargando pedidos cajero:', error);
    }
}

function renderizarPedidosCajero(pedidos) {
    const container = document.getElementById('pedidos-cajero-container');

    if (pedidos.length === 0) {
        container.innerHTML = '<div class="alert alert-success">No hay pedidos pendientes de pago</div>';
        return;
    }

    container.innerHTML = pedidos.map(pedido => {
        const identificacion = pedido.mesa_numero ? `Mesa ${pedido.mesa_numero}` : (pedido.cliente_nombre || 'Para llevar');
        const headerClass = pedido.estado === 'servido' ? 'en_mesa' : 'pendiente_pago';
        const badgeText = pedido.tipo_pago === 'anticipado' ? 'PARA LLEVAR' : 'SERVIDO - COBRAR';

        return `
        <div class="pedido-card">
            <div class="pedido-header ${headerClass}">
                <div>
                    <strong>Pedido #${pedido.id}</strong>
                    <span class="ms-2">${identificacion}</span>
                </div>
                <span class="badge bg-dark">${badgeText}</span>
            </div>
            <div class="pedido-body">
                ${pedido.items.map(item => `
                    <div class="pedido-item">
                        <span>${item.cantidad}x ${item.producto_nombre}</span>
                        <span>$${item.subtotal.toFixed(2)}</span>
                    </div>
                `).join('')}
                <hr>
                <div class="d-flex justify-content-between mb-2">
                    <span>Subtotal:</span>
                    <span>$${pedido.subtotal.toFixed(2)}</span>
                </div>
                <div class="d-flex justify-content-between mb-2">
                    <span>IVA (13%):</span>
                    <span>$${pedido.impuesto.toFixed(2)}</span>
                </div>
                <div class="d-flex justify-content-between mb-3">
                    <strong>TOTAL:</strong>
                    <strong class="fs-4">$${pedido.total.toFixed(2)}</strong>
                </div>
                <div class="d-grid gap-2">
                    <button class="btn btn-success btn-lg" onclick="abrirModalPago(${pedido.id}, ${pedido.total})">
                        <i class="bi bi-cash"></i> Cobrar $${pedido.total.toFixed(2)}
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function abrirModalPago(pedidoId, total) {
    pedidoActualPago = { id: pedidoId, total: total };

    document.getElementById('detalle-pago').innerHTML = `
        <h4 class="text-center">Total a cobrar</h4>
        <h2 class="text-center text-success">$${total.toFixed(2)}</h2>
    `;

    document.getElementById('monto-recibido').value = '';
    document.getElementById('cambio-container').style.display = 'none';

    const modal = new bootstrap.Modal(document.getElementById('modalPago'));
    modal.show();

    // Limpiar propina al abrir modal
    document.getElementById('propina-monto').value = '';
    establecerPropina(0);

    // Mostrar/ocultar sección de propina basada en tipo de comprobante
    toggleSeccionPropina();
}

// Variable global para almacenar propina actual
let propinaActual = 0;

function establecerPropina(porcentaje) {
    const total = pedidoActualPago?.total || 0;

    if (porcentaje === 0) {
        propinaActual = 0;
    } else {
        propinaActual = total * porcentaje;
    }

    document.getElementById('propina-monto').value = propinaActual.toFixed(2);
    document.getElementById('propina-display').textContent = `$${propinaActual.toFixed(2)}`;
    actualizarTotalConPropina();
}

function actualizarPropinaPersonalizada() {
    propinaActual = parseFloat(document.getElementById('propina-monto').value) || 0;
    document.getElementById('propina-display').textContent = `$${propinaActual.toFixed(2)}`;
    actualizarTotalConPropina();
}

function actualizarTotalConPropina() {
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value || 'ticket';
    const total = pedidoActualPago?.total || 0;

    // Si es factura, el IVA se aplicará en el backend
    // Si es ticket, solo sumamos propina
    let nuevoTotal = total + propinaActual;

    document.getElementById('detalle-pago').innerHTML = `
        <h4 class="text-center">Total a cobrar</h4>
        <p class="text-center text-muted">${tipoComprobante === 'factura' ? 'Factura' : 'Ticket'}</p>
        <div class="text-center">
            <small class="text-muted">Subtotal: $${total.toFixed(2)}</small><br>
            ${tipoComprobante === 'factura' ? `<small class="text-muted">+ IVA 13% (se aplicará)</small><br>` : ''}
            ${propinaActual > 0 ? `<small class="text-muted">+ Propina: $${propinaActual.toFixed(2)}</small><br>` : ''}
        </div>
        <h2 class="text-center text-success mt-2">$${nuevoTotal.toFixed(2)}</h2>
    `;
}

function toggleSeccionPropina() {
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value || 'ticket';
    const seccionPropina = document.getElementById('seccion-propina');

    // Mostrar propina solo si es ticket (no factura)
    if (tipoComprobante === 'ticket') {
        seccionPropina.style.display = 'block';
    } else {
        seccionPropina.style.display = 'none';
        propinaActual = 0;
        document.getElementById('propina-monto').value = '';
    }

    actualizarTotalConPropina();
}

function calcularCambio() {
    const montoRecibido = parseFloat(document.getElementById('monto-recibido').value) || 0;
    const total = pedidoActualPago?.total || 0;
    const cambio = montoRecibido - total;

    const container = document.getElementById('cambio-container');
    const montoElement = document.getElementById('monto-cambio');

    if (montoRecibido >= total) {
        container.style.display = 'block';
        montoElement.textContent = `$${cambio.toFixed(2)}`;
        container.className = 'alert alert-success';
    } else if (montoRecibido > 0) {
        container.style.display = 'block';
        montoElement.textContent = `Falta: $${Math.abs(cambio).toFixed(2)}`;
        container.className = 'alert alert-warning';
    } else {
        container.style.display = 'none';
    }
}

async function confirmarPago() {
    if (!pedidoActualPago) return;

    const montoRecibido = parseFloat(document.getElementById('monto-recibido').value) || 0;
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value || 'ticket';
    const aplicarIva = tipoComprobante === 'factura' ? 1 : 0;

    if (montoRecibido < pedidoActualPago.total) {
        mostrarNotificacion('Error', 'El monto recibido es insuficiente', 'danger');
        return;
    }

    try {
        // 1. Actualizar información de pago (propina, tipo_comprobante, IVA)
        const pagoPut = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_comprobante: tipoComprobante,
                aplicar_iva: aplicarIva,
                propina: propinaActual
            })
        });

        if (!pagoPut.ok) {
            throw new Error('No se pudo guardar información de pago');
        }

        // 2. Marcar pedido como pagado
        const estadoResponse = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'pagado' })
        });

        if (estadoResponse.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
            const totalFinal = pedidoActualPago.total + propinaActual;
            mostrarNotificacion('Pago Exitoso', `Pago de $${totalFinal.toFixed(2)} procesado correctamente`, 'success');
            pedidoActualPago = null;
            cargarPedidosCajero();
            cargarEstadisticas();
        }
    } catch (error) {
        console.error('Error procesando pago:', error);
        mostrarNotificacion('Error', 'No se pudo procesar el pago', 'danger');
    }
}

async function confirmarPagoSinComprobante() {
    if (!pedidoActualPago) return;

    const montoRecibido = parseFloat(document.getElementById('monto-recibido').value) || 0;
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value || 'ticket';
    const aplicarIva = 0;  // Sin comprobante = sin IVA

    if (montoRecibido < pedidoActualPago.total) {
        mostrarNotificacion('Error', 'El monto recibido es insuficiente', 'danger');
        return;
    }

    try {
        // 1. Actualizar información de pago
        const pagoPut = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_comprobante: tipoComprobante,
                aplicar_iva: aplicarIva,
                propina: propinaActual
            })
        });

        if (!pagoPut.ok) {
            throw new Error('No se pudo guardar información de pago');
        }

        // 2. Marcar pedido como pagado
        const response = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'pagado' })
        });

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
            const totalFinal = pedidoActualPago.total + propinaActual;
            mostrarNotificacion('Pago Exitoso', `Pago de $${totalFinal.toFixed(2)} procesado sin comprobante`, 'success');
            limpiarFormularioCliente();
            pedidoActualPago = null;
            cargarPedidosCajero();
            cargarEstadisticas();
        }
    } catch (error) {
        console.error('Error procesando pago:', error);
        mostrarNotificacion('Error', 'No se pudo procesar el pago', 'danger');
    }
}

async function confirmarPagoConComprobante() {
    if (!pedidoActualPago) return;

    const metodoPago = document.querySelector('input[name="metodoPago"]:checked')?.value || 'efectivo';
    const tipoComprobante = document.querySelector('input[name="tipoComprobante"]:checked')?.value || 'ticket';
    const esCredito = metodoPago === 'credito';

    // Validaciones según método de pago
    if (esCredito) {
        // Validar crédito
        const clienteId = document.getElementById('cliente-id-factura')?.value;
        if (!clienteId) {
            mostrarNotificacion('Error', 'Debe seleccionar un cliente para pagar a crédito', 'danger');
            return;
        }
        if (!creditoClienteActual || creditoClienteActual.credito_autorizado <= 0) {
            mostrarNotificacion('Error', 'Este cliente no tiene crédito autorizado', 'danger');
            return;
        }
        if (creditoClienteActual.credito_disponible < pedidoActualPago.total) {
            mostrarNotificacion('Error',
                `Crédito insuficiente. Disponible: $${creditoClienteActual.credito_disponible.toFixed(2)}, Pedido: $${pedidoActualPago.total.toFixed(2)}`,
                'danger');
            return;
        }
    } else {
        // Validar efectivo
        const montoRecibido = parseFloat(document.getElementById('monto-recibido').value) || 0;
        if (montoRecibido < pedidoActualPago.total) {
            mostrarNotificacion('Error', 'El monto recibido es insuficiente', 'danger');
            return;
        }
    }

    try {
        let clienteId = document.getElementById('cliente-id-factura')?.value || null;

        // 1. Guardar datos del cliente (siempre para crédito, opcional para factura)
        if (esCredito || tipoComprobante === 'factura') {
            const datosCliente = {
                nombre: document.getElementById('cliente-nombre')?.value || '',
                tipo_doc: document.getElementById('cliente-tipo-doc')?.value || '',
                num_doc: document.getElementById('cliente-num-doc')?.value || '',
                nrc: document.getElementById('cliente-nrc')?.value || '',
                direccion: document.getElementById('cliente-direccion')?.value || '',
                telefono: document.getElementById('cliente-telefono')?.value || '',
                correo: document.getElementById('cliente-correo')?.value || ''
            };

            // Campos opcionales para crédito, si existen en la UI
            const creditoField = document.getElementById('cliente-credito');
            const diasCreditoField = document.getElementById('cliente-dias-credito');
            if (creditoField) datosCliente.credito_autorizado = parseFloat(creditoField.value) || 0;
            if (diasCreditoField) datosCliente.dias_credito = parseInt(diasCreditoField.value) || 0;

            // Si hay datos del cliente pero no hay cliente_id, crear nuevo cliente
            if (datosCliente.nombre && datosCliente.num_doc && !clienteId) {
                try {
                    const nuevoCliente = await crearClienteRapido(datosCliente);
                    if (nuevoCliente && nuevoCliente.id) {
                        clienteId = nuevoCliente.id;
                        if (!nuevoCliente.existente) {
                            mostrarNotificacion('Cliente', `Cliente "${datosCliente.nombre}" guardado automáticamente`, 'info');
                        }
                    }
                } catch (e) {
                    console.log('Cliente ya existe o error al crear:', e);
                }
            }

            if (datosCliente.nombre || clienteId) {
                // Actualizar datos del cliente en el pedido
                await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/cliente`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cliente_id: clienteId,
                        ...datosCliente
                    })
                });
            }
        }

        // 2. Actualizar información de pago (propina, tipo_comprobante, IVA)
        const aplicarIva = tipoComprobante === 'factura' ? 1 : 0;
        await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_comprobante: tipoComprobante,
                aplicar_iva: aplicarIva,
                propina: propinaActual
            })
        });

        // 3. Procesar según método de pago
        if (esCredito) {
            // Para crédito: el pedido queda como "pendiente_credito" (no pagado aún)
            // Se factura pero no se cierra hasta que paguen
            const pagoResponse = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/credito`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: clienteId,
                    monto: pedidoActualPago.total
                })
            });

            if (!pagoResponse.ok) {
                const errorData = await pagoResponse.json();
                throw new Error(errorData.error || 'Error al procesar crédito');
            }
        } else {
            // Para efectivo: marcar como pagado
            const pagoResponse = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'pagado' })
            });

            if (!pagoResponse.ok) {
                throw new Error('Error al procesar el pago');
            }
        }

        // 4. Generar el comprobante
        const facturaResponse = await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/facturar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: tipoComprobante })
        });

        const facturaResult = await facturaResponse.json();

        if (facturaResult.success) {
            // 5. Cerrar el pedido (para efectivo inmediatamente, para crédito también)
            await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: esCredito ? 'credito' : 'cerrado' })
            });

            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();

            const tipoNombre = tipoComprobante === 'factura' ? 'Factura Electrónica' : 'Ticket';
            const numero = facturaResult.numero_control || facturaResult.numero;
            const metodoPagoNombre = esCredito ? ' (Crédito)' : '';

            mostrarNotificacion(
                'Pago y Comprobante',
                `${esCredito ? 'Venta a crédito registrada' : 'Pago procesado'}. ${tipoNombre}: ${numero}${metodoPagoNombre}`,
                'success'
            );

            // Abrir ventana para imprimir el comprobante
            abrirComprobante(pedidoActualPago.id);

            limpiarFormularioCliente();
            pedidoActualPago = null;
            cargarPedidosCajero();
            cargarEstadisticas();
            cargarMesas();

            // Actualizar reportes rápidos inmediatamente para ver cambios en tiempo real
            cargarReportesRapidos(periodoReportesActual || 'hoy');
        } else {
            // Hubo error en facturación pero la transacción continúa
            await fetch(`${API_BASE}/pedidos/${pedidoActualPago.id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: esCredito ? 'credito' : 'cerrado' })
            });

            mostrarNotificacion(
                esCredito ? 'Crédito registrado' : 'Pago procesado',
                `${esCredito ? 'Venta a crédito' : 'Pago'} exitoso pero error al generar comprobante: ${facturaResult.error}`,
                'warning'
            );
            bootstrap.Modal.getInstance(document.getElementById('modalPago')).hide();
            limpiarFormularioCliente();
            pedidoActualPago = null;
            cargarPedidosCajero();
            cargarMesas();

            // Actualizar reportes rápidos incluso con error en comprobante
            cargarReportesRapidos(periodoReportesActual || 'hoy');
        }
    } catch (error) {
        console.error('Error procesando pago con comprobante:', error);
        mostrarNotificacion('Error', error.message || 'No se pudo procesar el pago', 'danger');
    }
}

// Crear cliente rápidamente desde el proceso de facturación
async function crearClienteRapido(datos) {
    const tipoDoc = datos.tipo_doc;
    let tipoDocumento = null;
    if (tipoDoc === '36') tipoDocumento = 'NIT';
    else if (tipoDoc === '13') tipoDocumento = 'DUI';
    else if (tipoDoc === '37') tipoDocumento = 'Otro';

    const clienteData = {
        nombre: datos.nombre,
        tipo_documento: tipoDocumento,
        numero_documento: datos.num_doc,
        nrc: datos.nrc || null,
        tipo_cliente: datos.nrc ? 'contribuyente' : 'consumidor_final',
        direccion: datos.direccion || null,
        telefono: datos.telefono || null,
        email: datos.correo || null
    };

    // Enviar crédito si fue provisto en "datos" o existe un campo en la UI
    if (typeof datos.credito_autorizado !== 'undefined' && datos.credito_autorizado !== null) {
        clienteData.credito_autorizado = Number(datos.credito_autorizado) || 0;
    } else {
        const campoCredito = document.getElementById('cliente-credito');
        if (campoCredito) clienteData.credito_autorizado = parseFloat(campoCredito.value) || 0;
    }

    if (typeof datos.dias_credito !== 'undefined' && datos.dias_credito !== null) {
        clienteData.dias_credito = parseInt(datos.dias_credito) || 0;
    } else {
        const campoDias = document.getElementById('cliente-dias-credito');
        if (campoDias) clienteData.dias_credito = parseInt(campoDias.value) || 0;
    }

    const response = await fetch(`${API_CLIENTES}/clientes/crear-rapido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clienteData)
    });

    return await response.json();
}

function abrirComprobante(pedidoId) {
    const url = `ticket.html?pedido=${pedidoId}`;
    window.open(url, '_blank', 'width=400,height=600');
}

function limpiarFormularioCliente() {
    document.getElementById('tipo-ticket').checked = true;
    document.getElementById('datos-cliente-container').style.display = 'none';
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-tipo-doc').value = '';
    document.getElementById('cliente-num-doc').value = '';
    document.getElementById('cliente-nrc').value = '';
    document.getElementById('cliente-direccion').value = '';
    document.getElementById('cliente-telefono').value = '';
    document.getElementById('cliente-correo').value = '';
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_BASE}/estadisticas/hoy`);
        const stats = await response.json();

        document.getElementById('stat-pedidos').textContent = stats.ventas.total_pedidos;
        document.getElementById('stat-ventas').textContent = `$${parseFloat(stats.ventas.total_ventas).toFixed(2)}`;

        const topList = document.getElementById('stat-top-productos');
        if (stats.top_productos.length > 0) {
            topList.innerHTML = stats.top_productos.map(p => `
                <li>${p.nombre}: ${p.cantidad} unidades</li>
            `).join('');
        } else {
            topList.innerHTML = '<li class="text-muted">Sin ventas aún</li>';
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// ============ FUNCIONES DE REPORTES RÁPIDOS ============

let periodoReportesActual = 'hoy';

async function cargarReportesRapidos(periodo = 'hoy') {
    try {
        let endpoint = `${API_BASE}/reportes/hoy`;

        if (periodo === '7d') {
            const hoy = new Date();
            const hace7d = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
            const inicio = hace7d.toISOString().split('T')[0];
            const fin = hoy.toISOString().split('T')[0];
            endpoint = `${API_BASE}/reportes/periodo?inicio=${inicio}&fin=${fin}`;
        } else if (periodo === '30d') {
            const hoy = new Date();
            const hace30d = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
            const inicio = hace30d.toISOString().split('T')[0];
            const fin = hoy.toISOString().split('T')[0];
            endpoint = `${API_BASE}/reportes/periodo?inicio=${inicio}&fin=${fin}`;
        }

        const response = await fetch(endpoint);
        const data = await response.json();
        renderizarMetricasReportes(data);
    } catch (error) {
        console.error('Error cargando reportes rápidos:', error);
        mostrarNotificacion('Error', 'No se pudieron cargar los reportes', 'danger');
    }
}

function cambiarPeriodoReportes(periodo) {
    periodoReportesActual = periodo;
    cargarReportesRapidos(periodo);
}

function renderizarMetricasReportes(data) {
    // Obtener datos según si es hoy o período
    const resumen = data.resumen || data;
    const productos = data.productos || [];
    const categorias = data.categorias || [];

    // Actualizar métricas principales
    const totalVentas = parseFloat(resumen.total_ventas || 0).toFixed(2);
    const totalPedidos = resumen.total_pedidos || 0;
    const ticketPromedio = totalPedidos > 0 ? (totalVentas / totalPedidos).toFixed(2) : '0.00';
    const efectivo = parseFloat(resumen.efectivo || 0).toFixed(2);
    const credito = parseFloat(resumen.credito || 0).toFixed(2);

    document.getElementById('metrica-total-ventas').textContent = `$${totalVentas}`;
    document.getElementById('metrica-total-pedidos').textContent = totalPedidos;
    document.getElementById('metrica-ticket-promedio').textContent = `$${ticketPromedio}`;
    document.getElementById('metrica-efectivo').textContent = `$${efectivo}`;
    document.getElementById('metrica-credito').textContent = `$${credito}`;

    // Renderizar tabla de top productos
    const tablProductos = document.getElementById('tabla-top-productos');
    if (productos.length > 0) {
        tablProductos.innerHTML = `
            <table class="table table-sm mb-0">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th class="text-end">Cantidad</th>
                        <th class="text-end">Venta</th>
                    </tr>
                </thead>
                <tbody>
                    ${productos.map(p => `
                        <tr>
                            <td>${p.producto_nombre || 'N/A'}</td>
                            <td class="text-end">${p.cantidad_vendida || p.total_cantidad || 0}</td>
                            <td class="text-end">$${parseFloat(p.subtotal || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        tablProductos.innerHTML = '<p class="text-muted text-center">Sin datos</p>';
    }

    // Renderizar tabla de categorías
    const tablCategorias = document.getElementById('tabla-categorias');
    if (categorias.length > 0) {
        tablCategorias.innerHTML = `
            <table class="table table-sm mb-0">
                <thead>
                    <tr>
                        <th>Categoría</th>
                        <th class="text-end">Cantidad</th>
                        <th class="text-end">Venta</th>
                    </tr>
                </thead>
                <tbody>
                    ${categorias.map(c => `
                        <tr>
                            <td>${c.categoria_nombre || 'N/A'}</td>
                            <td class="text-end">${c.cantidad_vendida || c.total_cantidad || 0}</td>
                            <td class="text-end">$${parseFloat(c.subtotal || c.total_subtotal || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        tablCategorias.innerHTML = '<p class="text-muted text-center">Sin datos</p>';
    }
}

function iniciarActualizacionReportes() {
    // Actualizar reportes cada 5 segundos mientras estén en la pestaña
    // (para ver datos en tiempo real conforme se procesan pagos)
    setInterval(() => {
        const tabActiva = document.querySelector('#cajeroTabs .nav-link.active');
        if (tabActiva && tabActiva.getAttribute('data-bs-target') === '#cajero-reportes-tab') {
            cargarReportesRapidos(periodoReportesActual);
        }
    }, CONFIG.POLLING_INTERVALS.REPORTS);  // 5 segundos en lugar de 30
}

// ============ FUNCIONES DE COCINA ============

async function cargarDatosCocina() {
    await cargarPedidosCocina();
}

function iniciarActualizacionCocina() {
    updateInterval = setInterval(cargarPedidosCocina, CONFIG.POLLING_INTERVALS.COCINA);
}

async function cargarPedidosCocina() {
    try {
        const response = await fetch(`${API_BASE}/cocina/pedidos`);
        const pedidos = await response.json();
        renderizarPedidosCocina(pedidos);
    } catch (error) {
        console.error('Error cargando pedidos cocina:', error);
    }
}

function renderizarPedidosCocina(pedidos) {
    const container = document.getElementById('pedidos-cocina-container');

    if (pedidos.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info">No hay pedidos en cola</div></div>';
        return;
    }

    container.innerHTML = pedidos.map(pedido => `
        <div class="col-md-4 col-lg-3">
            <div class="pedido-card ${pedido.estado === 'pagado' ? 'pedido-nuevo' : ''}">
                <div class="pedido-header ${pedido.estado}">
                    <div>
                        <strong>#${pedido.id}</strong>
                        <span class="ms-2">Mesa ${pedido.mesa_numero || 'N/A'}</span>
                    </div>
                    <span class="badge bg-light text-dark">
                        ${pedido.estado === 'pagado' ? 'NUEVO' : 'EN PREPARACIÓN'}
                    </span>
                </div>
                <div class="pedido-body">
                    ${pedido.items.map(item => `
                        <div class="pedido-item">
                            <strong>${item.cantidad}x</strong> ${item.producto_nombre}
                            ${item.notas ? `<br><small class="text-muted">${item.notas}</small>` : ''}
                        </div>
                    `).join('')}
                    <hr>
                    <small class="text-muted">
                        ${calcularTiempoTranscurrido(pedido.created_at)}
                    </small>
                    <div class="d-grid gap-2 mt-2">
                        ${pedido.estado === 'pagado' ? `
                            <button class="btn btn-warning" onclick="iniciarPreparacion(${pedido.id})">
                                <i class="bi bi-play-fill"></i> Iniciar Preparación
                            </button>
                        ` : `
                            <button class="btn btn-success" onclick="marcarListo(${pedido.id})">
                                <i class="bi bi-check-lg"></i> Listo para Servir
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function calcularTiempoTranscurrido(fechaStr) {
    const fecha = new Date(fechaStr);
    const ahora = new Date();
    const diffMs = ahora - fecha;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    return `Hace ${diffHours}h ${diffMins % 60}min`;
}

async function iniciarPreparacion(pedidoId) {
    try {
        await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'en_cocina' })
        });

        cargarPedidosCocina();
    } catch (error) {
        console.error('Error iniciando preparación:', error);
        mostrarNotificacion('Error', 'No se pudo actualizar el pedido', 'danger');
    }
}

async function marcarListo(pedidoId) {
    try {
        await fetch(`${API_BASE}/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'listo' })
        });

        mostrarNotificacion('Pedido Listo', `Pedido #${pedidoId} listo para servir`, 'success');
        cargarPedidosCocina();
    } catch (error) {
        console.error('Error marcando listo:', error);
        mostrarNotificacion('Error', 'No se pudo actualizar el pedido', 'danger');
    }
}

// ============ UTILIDADES ============
// Nota: mostrarNotificacion() está centralizada en utils.js

// Reproducir sonido de notificación (opcional)
function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH6AgnqGiYeAd3V4fYOHg4B6fYKHg4B7foSHhYJ+gISDg4GAgYKCgoKBgYGBgYGBgQ==');
        audio.volume = 0.5;
        audio.play();
    } catch (e) {
        // Ignorar errores de audio
    }
}

// ============ BÚSQUEDA DE CLIENTES PARA FACTURACIÓN ============

let timeoutBusquedaCliente = null;

async function buscarClienteFactura(texto) {
    const resultadosDiv = document.getElementById('resultados-busqueda-cliente');

    // Limpiar timeout anterior
    clearTimeout(timeoutBusquedaCliente);

    // Si el texto es muy corto, limpiar resultados
    if (texto.length < 2) {
        resultadosDiv.innerHTML = '';
        return;
    }

    // Esperar 300ms antes de buscar (debounce)
    timeoutBusquedaCliente = setTimeout(async () => {
        try {
            const response = await fetch(`${API_CLIENTES}/clientes?buscar=${encodeURIComponent(texto)}&activo=1`);
            const clientes = await response.json();

            if (clientes.length === 0) {
                resultadosDiv.innerHTML = `
                    <div class="list-group-item list-group-item-light text-muted small">
                        No se encontraron clientes. Los datos se guardarán como nuevo.
                    </div>
                `;
                return;
            }

            resultadosDiv.innerHTML = clientes.slice(0, 5).map(cliente => `
                <button type="button" class="list-group-item list-group-item-action py-2"
                        onclick="seleccionarClienteFactura(${cliente.id})">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${escapeHtml(cliente.nombre)}</strong>
                            ${cliente.nombre_comercial ? `<br><small class="text-muted">${escapeHtml(cliente.nombre_comercial)}</small>` : ''}
                        </div>
                        <div class="text-end">
                            <small class="text-muted">${escapeHtml(cliente.numero_documento || '')}</small>
                            <br>
                            <span class="badge ${cliente.tipo_cliente === 'contribuyente' ? 'bg-success' : 'bg-info'} badge-sm">
                                ${cliente.tipo_cliente === 'contribuyente' ? 'Contrib.' : 'C. Final'}
                            </span>
                        </div>
                    </div>
                </button>
            `).join('');
        } catch (error) {
            console.error('Error buscando clientes:', error);
            resultadosDiv.innerHTML = '';
        }
    }, 300);
}

async function seleccionarClienteFactura(clienteId) {
    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${clienteId}`);
        const cliente = await response.json();

        if (response.ok) {
            // Guardar ID del cliente
            document.getElementById('cliente-id-factura').value = cliente.id;

            // Llenar campos del formulario
            document.getElementById('cliente-nombre').value = cliente.nombre || '';
            document.getElementById('cliente-num-doc').value = cliente.numero_documento || '';
            document.getElementById('cliente-nrc').value = cliente.nrc || '';
            document.getElementById('cliente-direccion').value = cliente.direccion || '';
            document.getElementById('cliente-telefono').value = cliente.telefono || '';
            document.getElementById('cliente-correo').value = cliente.email || '';

            // Seleccionar tipo de documento
            const tipoDocSelect = document.getElementById('cliente-tipo-doc');
            if (cliente.tipo_documento === 'NIT') {
                tipoDocSelect.value = '36';
            } else if (cliente.tipo_documento === 'DUI') {
                tipoDocSelect.value = '13';
            } else if (cliente.tipo_documento) {
                tipoDocSelect.value = '37';
            } else {
                tipoDocSelect.value = '';
            }

            // Limpiar búsqueda
            document.getElementById('buscar-cliente-factura').value = cliente.nombre;
            document.getElementById('resultados-busqueda-cliente').innerHTML = '';

            // Cargar información de crédito del cliente
            await cargarCreditoCliente(cliente.id);

            // Mostrar campos de crédito solo si el cliente es contribuyente
            const creditoField = document.getElementById('cliente-credito');
            const diasField = document.getElementById('cliente-dias-credito');
            const filaCredito = creditoField ? creditoField.closest('.row') : null;
            const filaDias = diasField ? diasField.closest('.row') : null;
            const esContribuyente = cliente.tipo_cliente === 'contribuyente';
            if (filaCredito) filaCredito.classList.toggle('d-none', !esContribuyente);
            if (filaDias) filaDias.classList.toggle('d-none', !esContribuyente);

            mostrarNotificacion('Cliente', `Datos de "${cliente.nombre}" cargados`, 'success');
        }
    } catch (error) {
        console.error('Error cargando cliente:', error);
    }
}

// Variable global para almacenar el crédito del cliente actual
let creditoClienteActual = null;

// Cargar información de crédito del cliente
async function cargarCreditoCliente(clienteId) {
    const infoCreditoDiv = document.getElementById('info-credito-cliente');
    const alertaSinCredito = document.getElementById('alerta-sin-credito');
    const btnPagoCredito = document.getElementById('pago-credito');

    try {
        const response = await fetch(`${API_CLIENTES}/clientes/${clienteId}/credito`);
        const credito = await response.json();

        if (response.ok && credito.credito_autorizado > 0) {
            creditoClienteActual = credito;

            // Mostrar información de crédito
            document.getElementById('credito-disponible-pago').textContent = `$${credito.credito_disponible.toFixed(2)}`;
            document.getElementById('credito-usado-pago').textContent = `$${credito.credito_utilizado.toFixed(2)}`;
            document.getElementById('credito-limite-pago').textContent = `$${credito.credito_autorizado.toFixed(2)}`;

            // Calcular porcentaje de uso
            const porcentaje = (credito.credito_utilizado / credito.credito_autorizado) * 100;
            const barraCredito = document.getElementById('barra-credito-pago');
            barraCredito.style.width = `${Math.min(porcentaje, 100)}%`;

            // Color según porcentaje
            barraCredito.className = 'progress-bar';
            if (porcentaje >= 90) {
                barraCredito.classList.add('bg-danger');
            } else if (porcentaje >= 70) {
                barraCredito.classList.add('bg-warning');
            } else {
                barraCredito.classList.add('bg-success');
            }

            // Habilitar botón de crédito
            btnPagoCredito.disabled = false;
            infoCreditoDiv.classList.remove('d-none');
            alertaSinCredito.classList.add('d-none');

            // Verificar si el crédito disponible es suficiente para el pedido
            if (pedidoActualPago && credito.credito_disponible < pedidoActualPago.total) {
                alertaSinCredito.classList.remove('d-none');
                document.getElementById('mensaje-sin-credito').textContent =
                    `Crédito insuficiente. Disponible: $${credito.credito_disponible.toFixed(2)}, Pedido: $${pedidoActualPago.total.toFixed(2)}`;
            }
        } else {
            // Cliente sin crédito autorizado
            creditoClienteActual = null;
            infoCreditoDiv.classList.add('d-none');

            // Si está seleccionado pago a crédito, mostrar alerta
            if (document.getElementById('pago-credito').checked) {
                alertaSinCredito.classList.remove('d-none');
                document.getElementById('mensaje-sin-credito').textContent = 'Este cliente no tiene crédito autorizado.';
            }
        }
    } catch (error) {
        console.error('Error cargando crédito:', error);
        creditoClienteActual = null;
        infoCreditoDiv.classList.add('d-none');
    }
}

// Manejar cambio de método de pago
function onMetodoPagoChange() {
    const metodoPago = document.querySelector('input[name="metodoPago"]:checked')?.value || 'efectivo';
    const seccionMonto = document.getElementById('seccion-monto-recibido');
    const cambioContainer = document.getElementById('cambio-container');
    const alertaSinCredito = document.getElementById('alerta-sin-credito');
    const infoCreditoDiv = document.getElementById('info-credito-cliente');
    const clienteId = document.getElementById('cliente-id-factura')?.value;

    if (metodoPago === 'credito') {
        // Ocultar sección de monto recibido
        seccionMonto.style.display = 'none';
        cambioContainer.style.display = 'none';

        // Verificar si hay cliente seleccionado con crédito
        if (!clienteId) {
            alertaSinCredito.classList.remove('d-none');
            document.getElementById('mensaje-sin-credito').textContent = 'Debe seleccionar un cliente para pagar a crédito.';
            infoCreditoDiv.classList.add('d-none');
        } else if (!creditoClienteActual || creditoClienteActual.credito_autorizado <= 0) {
            alertaSinCredito.classList.remove('d-none');
            document.getElementById('mensaje-sin-credito').textContent = 'Este cliente no tiene crédito autorizado.';
            infoCreditoDiv.classList.add('d-none');
        } else if (pedidoActualPago && creditoClienteActual.credito_disponible < pedidoActualPago.total) {
            alertaSinCredito.classList.remove('d-none');
            document.getElementById('mensaje-sin-credito').textContent =
                `Crédito insuficiente. Disponible: $${creditoClienteActual.credito_disponible.toFixed(2)}, Pedido: $${pedidoActualPago.total.toFixed(2)}`;
            infoCreditoDiv.classList.remove('d-none');
        } else {
            alertaSinCredito.classList.add('d-none');
            if (creditoClienteActual) {
                infoCreditoDiv.classList.remove('d-none');
            }
        }
    } else {
        // Mostrar sección de monto recibido
        seccionMonto.style.display = 'block';
        alertaSinCredito.classList.add('d-none');

        // Mostrar info de crédito solo si el cliente tiene
        if (creditoClienteActual && creditoClienteActual.credito_autorizado > 0) {
            infoCreditoDiv.classList.remove('d-none');
        } else {
            infoCreditoDiv.classList.add('d-none');
        }
    }
}

function limpiarClienteFactura() {
    document.getElementById('cliente-id-factura').value = '';
    document.getElementById('buscar-cliente-factura').value = '';
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-tipo-doc').value = '';
    document.getElementById('cliente-num-doc').value = '';
    document.getElementById('cliente-nrc').value = '';
    document.getElementById('cliente-direccion').value = '';
    document.getElementById('cliente-telefono').value = '';
    document.getElementById('cliente-correo').value = '';
    document.getElementById('resultados-busqueda-cliente').innerHTML = '';

    // Limpiar información de crédito
    creditoClienteActual = null;
    document.getElementById('info-credito-cliente').classList.add('d-none');
    document.getElementById('alerta-sin-credito').classList.add('d-none');

    // Ocultar campos de crédito del formulario
    const creditoField = document.getElementById('cliente-credito');
    const diasField = document.getElementById('cliente-dias-credito');
    if (creditoField) creditoField.closest('.row')?.classList.add('d-none');
    if (diasField) diasField.closest('.row')?.classList.add('d-none');

    // Resetear método de pago a efectivo
    const pagoEfectivo = document.getElementById('pago-efectivo');
    const seccionMonto = document.getElementById('seccion-monto-recibido');
    if (pagoEfectivo) pagoEfectivo.checked = true;
    if (seccionMonto) seccionMonto.style.display = 'block';
}

// Cerrar resultados al hacer clic fuera
document.addEventListener('click', function(e) {
    const resultados = document.getElementById('resultados-busqueda-cliente');
    const buscador = document.getElementById('buscar-cliente-factura');
    if (resultados && buscador && !resultados.contains(e.target) && !buscador.contains(e.target)) {
        resultados.innerHTML = '';
    }
});

// ============ FUNCIONES MÓVIL ============

// Toggle del carrito bottom sheet
function toggleCartSheet() {
    console.log('toggleCartSheet() llamado');
    const sheet = document.getElementById('cart-sheet');
    const overlay = document.getElementById('cart-sheet-overlay');

    console.log('Sheet encontrado:', !!sheet, 'Overlay encontrado:', !!overlay);

    if (sheet && overlay) {
        sheet.classList.toggle('show');
        overlay.classList.toggle('show');
        console.log('Cart sheet ahora tiene clase show:', sheet.classList.contains('show'));

        // Actualizar contenido del carrito móvil
        if (sheet.classList.contains('show')) {
            actualizarCarritoMobile();
        }
    } else {
        console.error('No se encontró cart-sheet o cart-sheet-overlay');
    }
}

// Obtener el carrito actual según el rol
function getCarritoActual() {
    if (rolActual === 'cajero') {
        return carritoCajero;
    }
    return carrito;
}

// Actualizar el carrito en el bottom sheet móvil
function actualizarCarritoMobile() {
    const carritoActual = getCarritoActual();
    console.log('actualizarCarritoMobile() - rol:', rolActual, '- items:', carritoActual.length);

    const container = document.getElementById('cart-sheet-items');
    const fabCount = document.getElementById('cart-fab-count');
    const btnEnviar = document.getElementById('btn-enviar-mobile');

    if (!container) {
        console.log('cart-sheet-items no encontrado');
        return;
    }

    // Actualizar contador del FAB
    const totalItems = carritoActual.reduce((sum, item) => sum + item.cantidad, 0);
    if (fabCount) {
        fabCount.textContent = totalItems;
        fabCount.style.display = totalItems > 0 ? 'flex' : 'none';
    }

    if (carritoActual.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Carrito vacío</p>';
        if (btnEnviar) btnEnviar.disabled = true;
        return;
    }

    container.innerHTML = carritoActual.map(item => `
        <div class="cart-item d-flex justify-content-between align-items-center py-2 border-bottom">
            <div>
                <strong>${item.nombre}</strong><br>
                <small class="text-muted">$${item.precio.toFixed(2)} x ${item.cantidad}</small>
            </div>
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-outline-secondary rounded-circle" style="width:36px;height:36px;" onclick="modificarCantidadMobile(${item.producto_id}, -1)">
                    <i class="bi bi-dash"></i>
                </button>
                <span class="fw-bold">${item.cantidad}</span>
                <button class="btn btn-sm btn-outline-secondary rounded-circle" style="width:36px;height:36px;" onclick="modificarCantidadMobile(${item.producto_id}, 1)">
                    <i class="bi bi-plus"></i>
                </button>
                <strong class="ms-2">$${item.subtotal.toFixed(2)}</strong>
            </div>
        </div>
    `).join('');

    // Calcular totales
    const subtotal = carritoActual.reduce((sum, item) => sum + item.subtotal, 0);
    const iva = calculateIVA(subtotal);
    const total = calculateTotal(subtotal);

    const subtotalEl = document.getElementById('cart-sheet-subtotal');
    const ivaEl = document.getElementById('cart-sheet-iva');
    const totalEl = document.getElementById('cart-sheet-total');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (ivaEl) ivaEl.textContent = `$${iva.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

    // Habilitar envío solo si hay items y (si es cajero) existe nombre de cliente
    let puedeEnviar = carritoActual.length > 0;
    if (rolActual === 'cajero') {
        const clienteMobile = document.getElementById('cliente-nombre-mobile')?.value?.trim();
        const clienteCajero = document.getElementById('cliente-nombre-cajero')?.value?.trim();
        puedeEnviar = puedeEnviar && (!!clienteMobile || !!clienteCajero);
    }

    if (btnEnviar) btnEnviar.disabled = !puedeEnviar;
}

// Modificar cantidad desde móvil
function modificarCantidadMobile(productoId, delta) {
    if (rolActual === 'cajero') {
        modificarCantidadCajero(productoId, delta);
    } else {
        modificarCantidad(productoId, delta);
    }
    actualizarCarritoMobile();
}

// Toggle opciones de pago en móvil
function toggleOpcionesPagoMobile() {
    const tipoPago = document.getElementById('tipo-pago-mobile')?.value;
    const opcionesLlevar = document.getElementById('opciones-para-llevar-mobile');

    if (opcionesLlevar) {
        opcionesLlevar.style.display = tipoPago === 'anticipado' ? 'block' : 'none';
    }

    // Sincronizar con el select del carrito desktop
    const tipoPagoDesktop = document.getElementById('tipo-pago');
    if (tipoPagoDesktop) {
        tipoPagoDesktop.value = tipoPago;
        toggleOpcionesPago();
    }
}

// Enviar pedido desde móvil
async function enviarPedidoMobile() {
    console.log('enviarPedidoMobile() - rol:', rolActual);

    const clienteNombre = document.getElementById('cliente-nombre-mobile')?.value?.trim() || '';
    const carritoActual = getCarritoActual();

    // Validar nombre del cliente
    if (!clienteNombre) {
        mostrarNotificacion('Error', 'Ingresa el nombre del cliente', 'danger');
        document.getElementById('cliente-nombre-mobile')?.focus();
        return;
    }

    // Validar que hay productos en el carrito
    if (carritoActual.length === 0) {
        mostrarNotificacion('Error', 'Agrega productos al pedido', 'danger');
        return;
    }

    // Cerrar el sheet antes de enviar
    toggleCartSheet();

    if (rolActual === 'cajero') {
        // Para cajero, sincronizar con su formulario y usar su función
        const clienteNombreCajero = document.getElementById('cliente-nombre-cajero');
        if (clienteNombreCajero) clienteNombreCajero.value = clienteNombre;

        await crearPedidoCajero();
    } else {
        // Para mesero, sincronizar con su formulario
        const tipoPago = document.getElementById('tipo-pago-mobile')?.value || 'anticipado';
        const tipoPagoDesktop = document.getElementById('tipo-pago');
        const clienteNombreDesktop = document.getElementById('cliente-nombre-pedido');

        if (tipoPagoDesktop) tipoPagoDesktop.value = tipoPago;
        if (clienteNombreDesktop) clienteNombreDesktop.value = clienteNombre;

        await enviarPedido();
    }

    // Limpiar campos móviles
    const campoNombre = document.getElementById('cliente-nombre-mobile');
    if (campoNombre) campoNombre.value = '';
    actualizarCarritoMobile();
}

// Navegación móvil entre tabs
function navegarMobile(destino) {
    console.log('navegarMobile() - destino:', destino);

    // Actualizar navegación activa
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-${destino}`)?.classList.add('active');

    // Activar el tab correspondiente
    let tabId;
    switch(destino) {
        case 'mesas':
            tabId = 'mesas-tab';
            break;
        case 'menu':
            tabId = 'menu-tab';
            break;
        case 'servir':
            tabId = 'servir-tab';
            break;
    }

    if (tabId) {
        const tabTrigger = document.querySelector(`[data-bs-target="#${tabId}"]`);
        console.log('Tab trigger encontrado:', !!tabTrigger, tabId);
        if (tabTrigger) {
            const tab = new bootstrap.Tab(tabTrigger);
            tab.show();
            console.log('Tab mostrado:', tabId);
        }
    }
}

// Inicializar navegación móvil según el rol
function actualizarBottomNavPorRol(rol) {
    const bottomNav = document.getElementById('bottom-nav');
    if (!bottomNav) return;

    // Hacer visible la navegación inferior
    bottomNav.style.visibility = 'visible';

    // Verificar si es manager para agregar botones extra
    const usuario = getUsuarioActual ? getUsuarioActual() : null;
    const esManager = usuario && usuario.rol === 'manager';

    if (rol === 'cajero') {
        bottomNav.innerHTML = `
            <div class="bottom-nav-items">
                <button class="bottom-nav-item active" onclick="navegarCajeroMobile('cobros')" id="nav-cobros">
                    <i class="bi bi-cash-stack"></i>
                    <span>Cobros</span>
                </button>
                <button class="bottom-nav-item" onclick="navegarCajeroMobile('pedido')" id="nav-pedido">
                    <i class="bi bi-bag-plus"></i>
                    <span>Pedido</span>
                </button>
                <button class="bottom-nav-item" onclick="navegarCajeroMobile('creditos')" id="nav-creditos">
                    <i class="bi bi-credit-card"></i>
                    <span>Créditos</span>
                </button>
                ${esManager ? `
                    <button class="bottom-nav-item" onclick="mostrarMenuManager()">
                        <i class="bi bi-three-dots"></i>
                        <span>Más</span>
                    </button>
                ` : `
                    <button class="bottom-nav-item" onclick="logout()">
                        <i class="bi bi-box-arrow-right"></i>
                        <span>Salir</span>
                    </button>
                `}
            </div>
        `;
    } else if (rol === 'mesero') {
        // Actualizar navegación para mesero
        bottomNav.innerHTML = `
            <div class="bottom-nav-items">
                <button class="bottom-nav-item active" onclick="navegarMobile('mesas')" id="nav-mesas">
                    <i class="bi bi-grid-3x3"></i>
                    <span>Mesas</span>
                </button>
                <button class="bottom-nav-item" onclick="navegarMobile('menu')" id="nav-menu">
                    <i class="bi bi-list-ul"></i>
                    <span>Menú</span>
                </button>
                <button class="bottom-nav-item" onclick="navegarMobile('servir')" id="nav-servir">
                    <i class="bi bi-bell"></i>
                    <span>Servir</span>
                </button>
                ${esManager ? `
                    <button class="bottom-nav-item" onclick="mostrarMenuManager()">
                        <i class="bi bi-three-dots"></i>
                        <span>Más</span>
                    </button>
                ` : `
                    <button class="bottom-nav-item" onclick="logout()">
                        <i class="bi bi-box-arrow-right"></i>
                        <span>Salir</span>
                    </button>
                `}
            </div>
        `;
    }
}

// Menú de opciones para manager en móvil
function mostrarMenuManager() {
    // Crear modal de opciones si no existe
    let modal = document.getElementById('modalMenuManager');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalMenuManager';
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-sm">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"><i class="bi bi-gear"></i> Opciones</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0">
                        <div class="list-group list-group-flush">
                            <a href="admin.html" class="list-group-item list-group-item-action py-3">
                                <i class="bi bi-gear me-3"></i> Administración
                            </a>
                            <a href="index.html" class="list-group-item list-group-item-action py-3">
                                <i class="bi bi-receipt me-3"></i> Facturación
                            </a>
                            <button class="list-group-item list-group-item-action py-3" onclick="mostrarSelectorRol(); bootstrap.Modal.getInstance(document.getElementById('modalMenuManager')).hide();">
                                <i class="bi bi-arrow-repeat me-3"></i> Cambiar Rol
                            </button>
                            <button class="list-group-item list-group-item-action py-3 text-danger" onclick="logout()">
                                <i class="bi bi-box-arrow-right me-3"></i> Cerrar Sesión
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function navegarCajeroMobile(destino) {
    // Actualizar navegación activa
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-${destino}`)?.classList.add('active');

    // Activar el tab correspondiente
    let tabId;
    switch(destino) {
        case 'cobros':
            tabId = 'cajero-cobros-tab';
            break;
        case 'pedido':
            tabId = 'cajero-pedido-tab';
            break;
        case 'creditos':
            tabId = 'cajero-creditos-tab';
            break;
    }

    if (tabId) {
        const tabTrigger = document.querySelector(`[data-bs-target="#${tabId}"]`);
        if (tabTrigger) {
            const tab = new bootstrap.Tab(tabTrigger);
            tab.show();
        }
    }
}



// ============ EXPORTAR FUNCIONES GLOBALES ============
window.agregarAlCarrito = agregarAlCarrito;
window.agregarAlCarritoCajero = agregarAlCarritoCajero;
window.toggleCartSheet = toggleCartSheet;
window.enviarPedidoMobile = enviarPedidoMobile;
window.navegarMobile = navegarMobile;
window.navegarCajeroMobile = navegarCajeroMobile;
window.modificarCantidadMobile = modificarCantidadMobile;
window.modificarCantidadCajero = modificarCantidadCajero;
window.mostrarMenuManager = mostrarMenuManager;
window.filtrarCategoriaCajero = filtrarCategoriaCajero;

// ============ MANEJADOR DE RESIZE PARA RESPONSIVIDAD ============
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        console.log('Window resize detectado - ancho:', window.innerWidth);
        if (rolActual) {
            activarElementosMovil(rolActual);
        }
    }, 150);
});

// Handler de orientationchange para móviles
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        console.log('Orientation change detectado');
        if (rolActual) {
            activarElementosMovil(rolActual);
        }
    }, 100);
});

console.log("POS.js cargado completamente - rol actual:", rolActual);
