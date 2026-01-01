# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a complete invoicing and Point of Sale (POS) system for restaurants/pupuserías in El Salvador. It includes:
- **Backend**: Flask-based REST API with SQLite databases
- **Frontend**: Vanilla JavaScript with responsive mobile UI
- **Infrastructure**: Docker/Docker Compose with Nginx and Let's Encrypt SSL
- **Integration**: Digifact API for electronic invoice certification (optional)

Current branch: `developer` | Main deployments to: `main` branch

---

## Core Build & Execution Commands

### Development (Local)

```bash
# Install backend dependencies
pip install -r backend/requirements.txt

# Run Flask backend locally (port 5000)
cd backend && python app.py

# Run frontend (serve static files on http://localhost)
# Option 1: Using Python
cd frontend && python -m http.server 8000

# Option 2: Using Node/npm
npx serve frontend
```

### Docker (Recommended)

```bash
# Build and start all services
docker compose up -d

# View logs (all containers)
docker compose logs -f

# View specific container logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart frontend (applies CSS/JS changes)
docker compose restart frontend

# Rebuild backend after dependency changes
docker compose up -d --build backend

# Stop all services
docker compose down

# Access backend shell
docker exec -it digifact-backend /bin/sh

# View database
docker exec -it digifact-backend sqlite3 /app/pos.db ".tables"
```

### Testing & Health Checks

```bash
# Backend health check
curl http://localhost:5000/healthz
curl http://localhost/healthz  # Through Nginx

# Frontend health check
curl http://localhost/login.html
curl https://test.irya.xyz/login.html  # Production
```

---

## Architecture Overview

### System Layers

```
┌─────────────────────────────────────────────────────┐
│           Frontend (Vanilla JS + HTML5)              │
│  - pos.html/pos.js: POS interface with cart/FAB     │
│  - cocina.html: Kitchen/cook view (real-time)       │
│  - admin.html: Admin panel (users, roles)           │
│  - login.html: Authentication                       │
│  - Responsive design: Mobile FAB + bottom sheet      │
└──────────────────┬──────────────────────────────────┘
                   │ (HTTP/HTTPS via Nginx proxy)
┌──────────────────┴──────────────────────────────────┐
│         Nginx (Reverse proxy + SSL/TLS)             │
│  - Port 80→443 redirect                             │
│  - Static file serving (frontend/)                  │
│  - API proxying to /api → http://backend:5000       │
│  - Cache control: no-cache for JS/CSS               │
│  - Let's Encrypt SSL support                        │
└──────────────────┬──────────────────────────────────┘
                   │ (Internal Docker network)
┌──────────────────┴──────────────────────────────────┐
│    Flask Backend (Python 3.11 + SQLite)             │
│                                                     │
│  Blueprints (modular):                              │
│  ├─ auth.py: Users, roles, JWT sessions             │
│  ├─ pos.py: Orders, tables, products                │
│  ├─ inventario.py: Inventory & stock control        │
│  ├─ clientes.py: Customer management                │
│  ├─ facturacion.py: DTE generation                  │
│  └─ csrf.py: CSRF token protection                  │
│                                                     │
│  Databases:                                         │
│  ├─ pos.db: Main POS database                       │
│  ├─ pos_database.db: Alternate DB (legacy)          │
│  └─ clientes.db: Customer data (if separate)        │
└─────────────────────────────────────────────────────┘
         │
         └─→ (Optional) Digifact API integration
             for electronic invoice certification
```

### Key File Locations

**Backend Structure:**
- `backend/app.py`: Flask app initialization, blueprint registration, CSRF middleware
- `backend/auth.py`: Authentication blueprint (login, users, JWT tokens)
- `backend/pos.py`: POS blueprint (mesas, pedidos, productos, categorías)
- `backend/inventario.py`: Inventory management
- `backend/facturacion.py`: DTE generation for Digifact
- `backend/database.py`: Database connection utilities
- `backend/requirements.txt`: Python dependencies
- `backend/Dockerfile`: Container image definition
- `backend/.env`: Environment variables (not in repo)

**Frontend Structure:**
- `frontend/pos.html`: POS interface
- `frontend/cocina.html`: Kitchen view
- `frontend/admin.html`: Admin panel
- `frontend/login.html`: Login page
- `frontend/js/pos.js`: Main POS logic (includes mobile FAB + bottom sheet)
- `frontend/js/auth-check.js`: Session validation
- `frontend/js/app.js`: Additional utilities
- `frontend/css/pos.css`: POS styling
- `frontend/css/styles-responsive.css`: Mobile responsive styles

**Infrastructure:**
- `docker-compose.yml`: Service orchestration (backend, frontend, certbot)
- `nginx.conf`: Nginx configuration (SSL, proxy, cache headers)
- `.github/workflows/main.yml`: CI/CD pipeline

---

## API Architecture

### Authentication Flow

1. **Login**: `POST /api/auth/login` → JWT token issued
2. **Token Storage**: Client stores in localStorage/sessionStorage
3. **Protected Routes**: Backend validates JWT via `role_required` decorator
4. **Session Expiry**: Automatic token refresh or logout

### Key API Endpoints

**Auth:**
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

**POS (Orders & Tables):**
- `GET /api/pos/mesas` - List tables
- `POST /api/pos/pedidos` - Create order
- `PUT /api/pos/pedidos/{id}/estado` - Update order status
- `GET /api/pos/cocina/pedidos` - Kitchen orders
- `GET /api/pos/cajero/pedidos` - Cashier pending payments

**Products:**
- `GET /api/pos/productos` - List products
- `GET /api/pos/categorias` - List categories

**Order States:**
- `pendiente_pago` → `pagado` (takeout flow)
- `en_mesa` → `en_cocina` → `listo` → `servido` → `cerrado` (dine-in flow)

---

## Data Flow & Workflows

### Two Payment Workflows

**1. Takeout (Para Llevar) - Immediate Payment:**
```
Create → Pending Payment → Cashier Pays → Kitchen Prepares → Ready → Served → Closed
```

**2. Dine-in (En Mesa) - Pay at End:**
```
Create (assign table) → Kitchen → Ready → Served → Cashier Collects → Closed
```

### Database Schema Overview

**Core Tables:**
- `usuarios`: User accounts with roles (manager/mesero/cajero/cocinero)
- `mesas`: Restaurant tables
- `productos`: Menu items with price/category
- `pedidos`: Orders with state tracking
- `pedido_items`: Order line items (product + qty)
- `categorias`: Product categories
- `pagos`: Payment records
- `materia_prima`: Inventory items
- `recetas`: Product recipes (if applicable)

---

## Mobile Responsive Architecture

The POS interface is **mobile-first** with special mobile components:

### Mobile Components (activated at ≤768px)

**FAB (Floating Action Button):**
- Orange button at bottom-right with item counter
- Class: `.cart-fab` with `.mobile-active` when shown
- Toggles bottom sheet visibility

**Bottom Sheet (Cart Panel):**
- Draggable from bottom with drag handle
- Class: `.cart-sheet` with `.show` when expanded
- Contains: cart items, subtotal, tax, total, payment type selector
- Responsive: full-screen on mobile, overlay on desktop

**CSS Strategy:**
- `frontend/css/styles-responsive.css`: Media queries for ≤768px
- Classes use `!important` to override on mobile
- JavaScript: `activarElementosMovil()` function manages visibility

### Implementation Example
```javascript
// In pos.js
if (window.innerWidth <= 768) {
    cartFab.classList.add('mobile-active');
    // Show FAB and bottom sheet
}
```

---

## Critical Implementation Details

### CSRF Protection

- **Location**: `backend/csrf.py` with middleware in `app.py`
- **Skip paths**: `/api/auth/login`, `/healthz` (no token required)
- **Token**: Passed via `X-CSRF-Token` header or form data
- **Generation**: New token added to every response (header + JSON body)
- **Validation**: Required for POST/PUT/DELETE requests

```javascript
// Frontend: include CSRF token in requests
fetch('/api/pos/pedidos', {
    method: 'POST',
    headers: {
        'X-CSRF-Token': getCsrfToken(),
        'Content-Type': 'application/json'
    }
})
```

### Rate Limiting

- **Location**: `app.py` with Flask-Limiter
- **Default**: 200 per day, 50 per hour
- **Login**: Special limit of 5 per 15 minutes
- **Storage**: In-memory (suitable for single server)

### SSL/HTTPS Setup

- **Certificate Provider**: Let's Encrypt via Certbot container
- **Auto-renewal**: Cron job at `0 3 * * 0` (weekly)
- **Nginx Config**: HTTP→HTTPS redirect on port 80, HTTPS on 443
- **Domain**: `test.irya.xyz` (update in nginx.conf for different domain)

Commands:
```bash
# Issue certificate (staging first for testing)
docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot -d test.irya.xyz \
    --email your@email.com --agree-tos --no-eff-email

# Renew (manual)
docker compose run --rm certbot renew

# Reload nginx after cert update
docker exec digifact-frontend nginx -s reload
```

### Role-Based Access Control

**Roles defined in `auth.py`:**
- `manager`: Full access to all modules
- `mesero`: POS tables & orders only
- `cajero`: Cashier panel only
- `cocinero`: Kitchen view only

**Protection Decorator:**
```python
@role_required(['manager', 'mesero'])
def protected_endpoint():
    # Only manager and mesero can access
    pass
```

### Database Initialization

- **Init Function**: `init_db()` in `pos.py` creates tables on first run
- **Multiple DBs**: `pos.db` (main), `pos_database.db` (legacy)
- **Migrations**: Manual SQL updates (no ORM framework)

---

## Common Development Tasks

### Adding a New Product

1. Use admin panel or API: `POST /api/pos/productos`
2. Required fields: `nombre`, `precio`, `categoria_id`
3. Optional: `descripcion`, `imagen`, `materia_prima_id` (for inventory tracking)
4. Frontend auto-refreshes from API

### Modifying Order States

1. Edit state machine in `pos.py` if changing workflows
2. Update state checks in frontend (`pos.js`) and kitchen view
3. Ensure database states match code constants
4. Test both takeout and dine-in flows

### Frontend CSS/JS Changes

1. Edit files in `frontend/css/` or `frontend/js/`
2. Restart Nginx to clear cache: `docker compose restart frontend`
3. Use cache-busting: `<script src="pos.js?v=16"></script>`
4. Or hard-refresh browser: `Ctrl+Shift+R`

### Backend API Changes

1. Edit blueprint file (`auth.py`, `pos.py`, etc.)
2. Rebuild container: `docker compose up -d --build backend`
3. Container auto-restarts with new code
4. Check logs: `docker compose logs -f backend`

---

## Common Issues & Solutions

### Login Not Working
- Verify backend running: `docker compose ps`
- Check logs: `docker compose logs backend`
- Test: `curl http://localhost:5000/healthz`
- Ensure JWT secret configured in `.env`

### Order Status Not Updating
- Check browser console for API errors
- Verify state exists in database: `sqlite3 pos.db "SELECT DISTINCT estado FROM pedidos;"`
- Restart frontend for UI updates: `docker compose restart frontend`

### Mobile FAB Disappears
- Check viewport: View → Responsive Design Mode (Firefox) or Dev Tools (Chrome)
- Verify CSS classes applied: Check `.cart-fab.mobile-active` in DOM
- Verify JavaScript: `activarElementosMovil()` called on load

### SSL Certificate Issues
- Check cert status: `ls -la certs/live/test.irya.xyz/`
- Check renewal logs: `docker compose logs certbot`
- Force renewal: `docker compose run --rm certbot renew --force-renewal`
- Reload Nginx: `docker exec digifact-frontend nginx -s reload`

### File Updates Not Reflecting in VPS
- Hard reset git: `git fetch origin main && git reset --hard origin/main`
- Restart containers: `docker compose down && docker compose up -d`
- Clear browser cache: `Ctrl+Shift+R` or incognito mode

---

## Deployment (CI/CD)

### GitHub Actions Pipeline

**Trigger:** Push to `main` or `develop` branch

**Steps:**
1. Checkout code
2. Build backend Docker image
3. Health check: `curl /healthz`
4. On `main`: SSH to VPS, `git pull`, restart frontend

**Secrets Required:**
- `SERVER_HOST`: VPS IP/domain
- `SSH_PRIVATE_KEY`: Key for VPS access
- `DIGIFACT_URL`, `DIGIFACT_USER`, `DIGIFACT_PASS`: Digifact credentials
- `CERT_EMAIL`: Email for Let's Encrypt

### Manual Deployment

```bash
# On VPS
cd /root/facturacion
git fetch origin main
git reset --hard origin/main
docker compose down
docker compose up -d
```

---

## Environment Variables (.env)

Required in `backend/.env`:
```bash
# Flask
FLASK_ENV=production
SECRET_KEY=your-secret-key-here

# Digifact (optional)
DIGIFACT_URL=https://felgttestaws.digifact.com.sv
DIGIFACT_USER=SV.NIT.usuario
DIGIFACT_PASS=password

# Database (defaults to ./pos.db)
DATABASE_PATH=./database
```

---

## Git Workflow

**Current branch:** `developer`

**Commits style:** Descriptive messages (e.g., "Add table combo feature", "Fix mobile FAB visibility")

**Key files to watch:**
- `frontend/pos.js`: Most frequently modified (POS logic)
- `backend/pos.py`: Order state changes
- `nginx.conf`: If SSL/proxy changes needed
- `.github/workflows/main.yml`: If deployment process changes

---

## Key Technical Constraints

1. **Single Database**: SQLite (not suitable for >10 concurrent users; consider PostgreSQL for production)
2. **In-Memory Rate Limiting**: Storage resets on container restart
3. **No ORM**: Manual SQL queries (watch for SQL injection in `database.py`)
4. **Vanilla JS Frontend**: No framework; careful with DOM manipulation
5. **Static Nginx Serving**: Frontend is static files only; changes require container restart
6. **Docker Network**: Backend accessible internally as `http://backend:5000`, not via localhost in containers

## Business Workflows

### Flujo 1: Servicio en Mesa (Dine-in) - Pago al Final

```
Cliente llega
    ↓
Mesero asigna mesa
    ↓
Mesero toma pedido inicial (1+ items, productos o combos)
    ↓
Pedido enviado a cocina (Estado: en_mesa)
    ↓
Cocina marca "en_cocina" luego "listo"
    ↓
Mesero puede AGREGAR más items al pedido activo
    ↓
Mesero entrega pedido (Estado: servido)
    ↓
Cliente solicita cuenta
    ↓
Cajero procesa pago (Estado: pendiente_pago → pagado)
    ↓
Mesa liberada automáticamente
```

**Key Points:**
- Solo mesero puede crear/modificar pedido
- Items pueden agregarse MIENTRAS no esté pagado
- Cocina ve desglose de todos los items (combos desglosados)
- No hay pago anticipado
- Mesa se libera cuando se cierra pedido

### Flujo 2: Para Llevar (Takeout) - Pago Anticipado

```
Cliente llega
    ↓
Mesero O Cajero toma pedido con NOMBRE del cliente
    ↓
Pedido enviado a cocina (Estado: pendiente_pago)
    ↓
Cajero cobra AL CLIENTE ANTES de preparar (Estado: pagado)
    ↓
Cocina recibe pedido para preparar
    ↓
Cocina marca "en_cocina" luego "listo"
    ↓
Cliente es LLAMADO POR NOMBRE para recoger
    ↓
Mesero entrega (Estado: servido → cerrado)
```

**Key Points:**
- Requiere NOMBRE del cliente (campo `cliente_nombre` en pedido)
- PAGO ANTES de preparar
- Cocina ve nombre del cliente
- No libera mesa (no hay mesa asignada)

### Flujo 3: Proceso de Facturación Digifact (FASE 4 MEJORADO)

```
Pedido pagado (cualquier flujo)
    ↓
Cajero solicita generar factura/ticket
    ↓
Sistema calcula IVA DESGLOSADO por cada item (FASE 3):
    - item 1: $10.00 + $1.30 (13% IVA) = $11.30
    - item 2: $20.00 + $2.60 (13% IVA) = $22.60
    - Total: $30.00 + $3.90 IVA = $33.90
    ↓
GeneradorDTE genera estructura DIGIFACT OFICIAL:
    - JSON format: Estructura completa según NUC 1-FAC.json
    - XML format: Convertido automáticamente desde JSON
    - Incluye desglose IVA por item en campo "IvaItem"
    - Solo items principales (sin desgloces de combo)
    - Metadata: Secuencial (15 dígitos), códigos actividad, etc.
    ↓
Si requiere factura (crédito fiscal):
    - Enviar JSON a API Digifact para certificación
    - Digifact responde con número de DTE certificado
    - Guardar: numero_dte, dte_json, dte_xml, fecha_certificacion
    ↓
Si es ticket (consumidor final):
    - Usar GeneradorDTE.generar_ticket() para comprobante local
    - No enviar a Digifact
    - Imprime ticket simple en POS
```

**Critical:** IVA DESGLOSADO es requerimiento de Digifact - INTEGRADO EN FASE 4

### Digifact DTE Format (FASE 4 Implementation)

**Class: `GeneradorDTE` in `backend/facturacion.py`**

The improved implementation generates DTEs in **official Digifact format** matching El Salvador Ministry of Finance specs:

**Method: `generar_factura_consumidor(pedido, cliente_info, correlativo)`**

Returns dict with:
```python
{
    "json": {  # Official Digifact JSON format
        "Version": "1",
        "CountryCode": "SV",
        "Header": {
            "DocType": "01",  # Factura
            "IssuedDateTime": "2025-12-31T14:30:00-06:00",
            "Currency": "USD",
            "AdditionalIssueDocInfo": [
                {"Name": "Secuencial", "Value": "000100010000001"}  # 15 digits
            ]
        },
        "Seller": {  # Company info from env vars
            "TaxID": "06142308221025",
            "Name": "PUPUSERÍA EL BUEN SABOR",
            "Contact": {"PhoneList": {...}, "EmailList": {...}},
            "AddressInfo": {...}
        },
        "Buyer": {  # Client or "Consumidor Final"
            "TaxID": null,  # For final consumer
            "Name": "Consumidor Final",
            "AddressInfo": {...}
        },
        "Items": [
            {
                "Number": "1",
                "Description": "Pupusas Revueltas",
                "Qty": 3.0,
                "Price": 1.50,
                "UnitOfMeasure": "59",  # Unit/UNIDAD
                "Charges": {
                    "Charge": [
                        {"Code": "VENTA_GRAVADA", "Amount": 4.50}
                    ]
                },
                "AdditionalInfo": [
                    {"Name": "IvaItem", "Value": "0.59"}  # Per-item VAT from FASE 3
                ],
                "Totals": {"TotalItem": 5.09}
            }
        ],
        "Totals": {
            "TotalCharges": {
                "TotalCharge": [
                    {"Code": "TOTAL_GRAVADA", "Amount": 4.50},
                    {"Code": "TOTAL_EXENTA", "Amount": 0.00},
                    {"Code": "TOTAL_NO_SUJETA", "Amount": 0.00}
                ]
            },
            "GrandTotal": {"InvoiceTotal": 5.09},
            "InWords": "Cinco dólares con 09/100 DÓLARES",
            "AdditionalInfo": [
                {"Name": "CondicionOperacion", "Value": "1"},  # Contado/Cash
                {"Name": "IvaRetenido", "Value": "0.00"}
            ]
        },
        "Payments": [
            {"Code": "01", "Amount": 5.09}  # 01=Efectivo/Cash
        ]
    },
    "xml": "<Root>...</Root>",  # Same data in XML format
    "codigo_generacion": "UUID-STRING",
    "numero_control": "000100010000001",  # Secuencial
    "secuencial": "000100010000001",
    "total": 5.09,
    "subtotal": 4.50,
    "iva": 0.59
}
```

**Key Features (FASE 4):**
- ✅ Generates **official Digifact JSON format** (not custom format)
- ✅ Auto-generates **XML format** from JSON via `_generar_xml_desde_json()`
- ✅ Integrates **IVA desglosado per item** from FASE 3 database fields
- ✅ Excludes **combo breakdown items** (notas='Desglose de combo') from invoice
- ✅ Only shows **main items** on invoice (combos appear as single line items)
- ✅ Proper **sequential number** format (15 digits): TT + EEEE + PPPP + CCCCC
- ✅ Handles **consumer final** (no NIT) and **registered clients** (with NIT)
- ✅ Metadata: Company activity codes, location codes, payment method codes
- ✅ Number to words conversion in Spanish (amounts in letters)

---

## Database Schema - Key Models

### Mesa (Table)
```sql
id, numero (UNIQUE), capacidad (DEFAULT 4),
estado (libre/ocupada), created_at
```
- **Estado Flow:** libre → ocupada → libre
- **Auto-libera:** cuando pedido se cierra

### Producto (Menu Item)
```sql
id, nombre, descripcion, precio, categoria_id,
disponible (0/1), imagen, materia_prima_id (inventory link)
```
- **No combos aquí** - ver tabla `combos` separada

### Combo (Bundle/Menu) - ⭐ NEW
```sql
id, nombre, descripcion, precio_combo, imagen,
activo (0/1), created_at, updated_at
```
- **Relationships:** combo → combo_items → productos
- **Validation:** `precio_combo ≤ SUM(productos.precio * cantidad)`
- **Ejemplo:** Combo Pupusa + Bebida + Postre

### Combo_Items (M:M relationship)
```sql
id, combo_id, producto_id, cantidad
```
- Defines which productos belong to a combo
- Multiple entries per combo

### Pedido (Order)
```sql
id, mesa_id (nullable), mesero, estado, tipo_pago,
cliente_nombre, cliente_tipo_doc, cliente_num_doc, cliente_nrc,
cliente_direccion, cliente_telefono, cliente_correo,
subtotal, impuesto (IVA), total, propina,
dte_tipo, dte_numero_control, dte_json (Digifact),
created_at, pagado_at, cocina_at, listo_at, servido_at
```
- **Estado Flow:**
  - **Para llevar:** pendiente_pago → pagado → en_cocina → listo → servido → cerrado
  - **En mesa:** en_mesa → en_cocina → listo → servido → pendiente_pago → pagado → cerrado
- **`tipo_pago`:** anticipado (para llevar) or al_final (en mesa)

### Pedido_Items (Order Line)
```sql
id, pedido_id, producto_id, combo_id (nullable),
cantidad, precio_unitario,
subtotal, iva_porcentaje (13.0), iva_monto, total_item,
notas (e.g., 'Parte de combo', 'Sin cebolla', etc.),
created_at
```
- **IVA Desglosado:** cada item tiene su propio cálculo
- **combo_id:** si el item es parte de un combo
- **Ejemplo fila:**
  - Product 1: $10 + $1.30 IVA = $11.30
  - Product 2: $20 + $2.60 IVA = $22.60

---

## Business Rules & Validations

### Order Management
- ✓ NUNCA permitir agregar items a pedido con estado 'pagado'
- ✓ NUNCA permitir modificar/remover items de pedido pagado
- ✓ SIEMPRE liberar mesa cuando pedido se cierra/cancela
- ✓ Pedidos **para llevar DEBEN incluir** `cliente_nombre`
- ✓ Pedidos **en mesa DEBEN incluir** `mesa_id`

### Combo Rules
- ✓ Combo debe tener **mínimo 2 productos**
- ✓ `precio_combo ≤ SUM(product_price * quantity)` - sin descuentos ilegales
- ✓ Al agregar combo a pedido: crea 1 item del combo + N items desglosados para cocina
- ✓ Remover combo: elimina item del combo + items desglosados

### Roles & Permissions
- **Manager:** Crear/editar combos, usuarios, reportes
- **Mesero:** Crear pedidos en mesa, agregar items, ver pedidos listos
- **Cajero:** Crear pedidos para llevar, procesar pagos, **acceso menú completo**
- **Cocinero:** Ver pedidos, marcar estados (en_cocina, listo)

### IVA & Facturación
- ✓ IVA **13%** (El Salvador estándar)
- ✓ IVA **desglosado por item** (requerimiento Digifact)
- ✓ Digifact requiere estructura: items + IVA individual + total
- ✓ Ticket (no fiscal): genera local, no envía a Digifact
- ✓ Factura (fiscal): envía a Digifact, guarda número DTE

---

## Current Tech Stack (Actual)

**Backend:**
- Framework: `Flask 3.0.0`
- Database: `SQLite3` (dos instancias: pos.db + pos_database.db)
- Auth: Session-based JWT (no external auth library)
- Rate Limiting: `Flask-Limiter 3.5.0`
- CORS: `Flask-CORS 4.0.0`
- HTTP: `Requests 2.31.0`
- Config: `python-dotenv 1.0.0`

**Frontend:**
- Vanilla JavaScript (no framework)
- HTML5 + CSS3
- Bootstrap 5.3 (optional)
- Responsive: CSS Media Queries + FAB/Bottom Sheet

**Infrastructure:**
- Containerization: Docker + Docker Compose
- Web Server: Nginx (reverse proxy + SSL)
- SSL Provider: Let's Encrypt + Certbot
- CI/CD: GitHub Actions

**Note:** NO ORM (SQLAlchemy), NO migrations framework - using raw SQL queries

---

## Coding Standards (Current Project)

1. **SQL Queries:**
   - Manual parameterized queries (avoid SQL injection)
   - Use `?` placeholders in execute()
   - Example: `cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))`

2. **API Endpoints:**
   - Return JSON with appropriate HTTP codes (200, 201, 400, 404, 500)
   - Include error messages: `jsonify({'error': 'message'})`
   - Role protection: `@role_required('role1', 'role2')`
   - Example: `return jsonify({'id': 1, 'name': 'John'}), 201`

3. **Database Transactions:**
   - Use `conn.commit()` for writes, `conn.rollback()` for errors
   - Always wrap in try/except
   - Close connections properly

4. **Validation:**
   - Use validators.py functions (email, phone, NIT, etc.)
   - Validate required fields before inserting
   - Check state transitions (can't go from cerrado → en_cocina)

5. **Security:**
   - CSRF tokens on all POST/PUT/DELETE
   - Password hashing: PBKDF2-HMAC-SHA256
   - Rate limiting on login: 5 per 15 minutes
   - Session expiry: 12 hours

6. **Logging & Audit:**
   - Log financial operations (payments, invoices)
   - Use timestamps for state changes
   - Digifact responses must be stored for audit trail

