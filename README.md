# Sistema de Facturación El Salvador - Digifact + POS

Sistema completo de facturación electrónica para El Salvador con integración Digifact y módulo de Punto de Venta (POS) para restaurantes/pupuserías.

## Tabla de Contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación](#instalación)
- [Usuarios del Sistema](#usuarios-del-sistema)
- [Módulo POS](#módulo-pos)
- [Interfaz Móvil](#interfaz-móvil)
- [Flujos de Trabajo](#flujos-de-trabajo)
- [API Endpoints](#api-endpoints)
- [Estados de Pedidos](#estados-de-pedidos)
- [CI/CD con GitHub Actions](#cicd-con-github-actions)
- [Configuración](#configuración)
- [SSL / Certbot](#ssl--certbot-lets-encrypt)
- [Tecnologías](#tecnologías)
- [Comandos Útiles](#comandos-útiles)
- [Troubleshooting](#troubleshooting)
- [Problemas de Despliegue y Soluciones](#problemas-de-despliegue-y-soluciones)

## Características

### Facturación Electrónica (Digifact)
- Certificación de DTE (Documentos Tributarios Electrónicos)
- Anulación de documentos
- Consulta de documentos certificados
- Autenticación automática con renovación de token
- Descarga de PDF certificados

### Punto de Venta (POS)
- Gestión de mesas y pedidos
- Sistema de roles (Manager, Mesero, Cajero, Cocinero)
- Dos flujos de pago: Anticipado (Para Llevar) y Al Final (En Mesa)
- Vista de cocina en tiempo real
- Gestión de productos y categorías
- **Interfaz móvil responsiva** con FAB y bottom sheet
- Control de inventario básico

## Arquitectura

### Diagrama General del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VPS (test.irya.xyz)                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    NGINX (Puertos 80/443)                              │  │
│  │                   - SSL/TLS (Let's Encrypt)                            │  │
│  │                   - Proxy Reverso                                      │  │
│  │                   - Cache-Control Headers                              │  │
│  │                   - UTF-8 Charset                                      │  │
│  └──────────────────────────┬────────────────────────────────────────────┘  │
│                             │                                                │
│           ┌─────────────────┴─────────────────┐                             │
│           │                                   │                             │
│           ▼                                   ▼                             │
│  ┌─────────────────────┐           ┌─────────────────────┐                  │
│  │     Frontend        │           │      Backend        │                  │
│  │   (Static Files)    │           │   Flask (5000)      │                  │
│  │                     │           │                     │                  │
│  │  - pos.html/js      │           │  - API REST         │                  │
│  │  - cocina.html      │           │  - SQLite DB        │                  │
│  │  - login.html       │           │  - Digifact API     │                  │
│  │  - admin.html       │           │  - Auth JWT         │                  │
│  └─────────────────────┘           └──────────┬──────────┘                  │
│                                               │                             │
│                                               ▼                             │
│                                    ┌─────────────────────┐                  │
│                                    │   Digifact API      │                  │
│                                    │   (El Salvador)     │                  │
│                                    └─────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Diagrama de Contenedores Docker

```
┌─────────────────────────────────────────────────────────────────┐
│                     docker-compose.yml                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ digifact-frontend│  │ digifact-backend │  │digifact-certbot│ │
│  │   (nginx:alpine) │  │ (python:3.11)    │  │(certbot/certbot)│ │
│  │                  │  │                  │  │               │  │
│  │  Puertos:        │  │  Puerto:         │  │  Volúmenes:   │  │
│  │  - 80:80         │  │  - 5000:5000     │  │  - certs      │  │
│  │  - 443:443       │  │                  │  │  - certbot-www│  │
│  │                  │  │  Volúmenes:      │  │               │  │
│  │  Volúmenes:      │  │  - ./backend:/app│  │               │  │
│  │  - ./frontend    │  │                  │  │               │  │
│  │  - ./nginx.conf  │  │  Env:            │  │               │  │
│  │  - certs (SSL)   │  │  - .env          │  │               │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────────────┘  │
│           │                     │                                │
│           └──────────┬──────────┘                                │
│                      │                                           │
│              ┌───────▼───────┐                                   │
│              │  digifact_net │                                   │
│              │   (bridge)    │                                   │
│              └───────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Estructura del Proyecto

```
facturacion/
├── .github/
│   └── workflows/
│       └── main.yml              # CI/CD Pipeline
├── backend/
│   ├── app.py                    # Aplicación principal Flask
│   ├── auth.py                   # Módulo de autenticación
│   ├── pos.py                    # Módulo POS (mesas, pedidos, productos)
│   ├── pos.db                    # Base de datos POS (SQLite)
│   ├── pos_database.db           # Base de datos adicional
│   ├── requirements.txt          # Dependencias Python
│   ├── Dockerfile
│   └── .env                      # Variables de entorno (no en repo)
├── frontend/
│   ├── index.html                # Dashboard principal
│   ├── login.html                # Página de login
│   ├── pos.html                  # Punto de Venta (responsivo)
│   ├── pos.js                    # Lógica POS + móvil
│   ├── cocina.html               # Vista de cocina
│   ├── admin.html                # Panel de administración
│   ├── auth-check.js             # Verificación de autenticación
│   ├── style.css                 # Estilos generales
│   └── app.js                    # Lógica facturación
├── docker-compose.yml            # Orquestación de contenedores
├── nginx.conf                    # Configuración Nginx (SSL + cache)
├── deploy-cert.sh                # Script para certificados SSL
└── README.md                     # Esta documentación
```

## Instalación

### Requisitos
- Docker y Docker Compose
- Credenciales Digifact El Salvador (opcional para POS)
- Dominio con DNS apuntando al servidor (para SSL)

### 1. Clonar/Configurar el proyecto

```bash
cd /path/to/facturacion

# Configurar variables de entorno
cd backend
cp .env.example .env
nano .env  # Editar con credenciales
```

### 2. Iniciar con Docker

```bash
# Desde la raíz del proyecto
docker compose up -d

# Ver logs
docker compose logs -f
```

### 3. Acceder al sistema

| Servicio | URL Local | URL Producción |
|----------|-----------|----------------|
| Login | http://localhost/login.html | https://test.irya.xyz/login.html |
| POS | http://localhost/pos.html | https://test.irya.xyz/pos.html |
| Cocina | http://localhost/cocina.html | https://test.irya.xyz/cocina.html |
| Admin | http://localhost/admin.html | https://test.irya.xyz/admin.html |
| Health Check | http://localhost/healthz | https://test.irya.xyz/healthz |

## Usuarios del Sistema

### Usuarios por defecto

| Usuario | Contraseña | Rol | Acceso |
|---------|------------|-----|--------|
| admin | admin123 | manager | Acceso completo a todos los módulos |
| mesero1 | mesero123 | mesero | Solo panel de mesero (mesas y pedidos) |
| cajero1 | cajero123 | cajero | Solo panel de cajero (cobros) |
| cocinero1 | cocinero123 | cocinero | Solo vista de cocina |

### Roles y Permisos

| Rol | Panel Mesero | Panel Cajero | Vista Cocina | Cambiar Rol | Admin |
|-----|:------------:|:------------:|:------------:|:-----------:|:-----:|
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mesero | ✓ | ✗ | ✗ | ✗ | ✗ |
| Cajero | ✗ | ✓ | ✗ | ✗ | ✗ |
| Cocinero | ✗ | ✗ | ✓ | ✗ | ✗ |

## Módulo POS

### Panel de Mesero
- Ver mesas disponibles/ocupadas
- Crear pedidos (para llevar o en mesa)
- Seleccionar productos del menú por categorías
- Agregar notas a pedidos
- Ver pedidos listos para servir

### Panel de Cajero
- Ver pedidos pendientes de pago
- Crear pedidos directos (para llevar)
- Procesar pagos (efectivo, tarjeta)
- Gestión de créditos
- Ver historial de cobros del día

### Vista de Cocina
- Ver pedidos pendientes de preparación
- Marcar pedidos como "Preparando"
- Marcar pedidos como "Listo para servir"
- Alerta visual para pedidos urgentes (+15 min)
- Actualización automática cada 5 segundos

## Interfaz Móvil

El sistema incluye una interfaz móvil completamente responsiva para meseros y cajeros.

### Diagrama de Componentes Móviles

```
┌─────────────────────────────────────────┐
│            VISTA MÓVIL (≤768px)          │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │         NAVBAR COMPACTO           │  │
│  │   Logo | Rol | Usuario | Salir    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │         TABS DE NAVEGACIÓN        │  │
│  │   Mesas | Menú | Servir           │  │
│  │   (Mesero)                        │  │
│  │   ─────────────────────────       │  │
│  │   Cobros | Pedido | Créditos      │  │
│  │   (Cajero)                        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │         CONTENIDO PRINCIPAL       │  │
│  │                                   │  │
│  │   - Grid de productos             │  │
│  │   - Lista de pedidos              │  │
│  │   - Mesas disponibles             │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│                           ┌───────────┐ │
│                           │    FAB    │ │
│                           │   🛒 (3)  │ │
│                           └───────────┘ │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      BOTTOM SHEET (CARRITO)       │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  ═══════ (drag handle)     │  │  │
│  │  │  Pedido Actual         [X] │  │  │
│  │  ├─────────────────────────────┤  │  │
│  │  │  - Producto 1    $X.XX  ±  │  │  │
│  │  │  - Producto 2    $X.XX  ±  │  │  │
│  │  ├─────────────────────────────┤  │  │
│  │  │  Sub: $X.XX | IVA: $X.XX   │  │  │
│  │  │  Total: $XX.XX             │  │  │
│  │  │  [Llevar ▼] [Nombre____]   │  │  │
│  │  │  [    ENVIAR PEDIDO    ]   │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Características Móviles

| Componente | Descripción |
|------------|-------------|
| **FAB (Floating Action Button)** | Botón flotante naranja con contador de items |
| **Bottom Sheet** | Panel deslizable desde abajo para ver/editar carrito |
| **Touch Events** | Soporte táctil para selección de productos |
| **Responsive Grid** | Grid de productos adaptable (2-4 columnas) |
| **Compact Footer** | Totales, tipo de pago y nombre en espacio reducido |

### CSS Classes Móviles

```css
/* Clases para forzar visibilidad */
.cart-fab.mobile-active    /* Muestra FAB en móvil */
.cart-fab.mobile-hidden    /* Oculta FAB */
.cart-sheet.show           /* Muestra bottom sheet */
```

## Flujos de Trabajo

### Flujo 1: Para Llevar (Pago Anticipado)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO PARA LLEVAR                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   MESERO/CAJERO          CAJERO            COCINA           MESERO          │
│   ┌─────────┐         ┌─────────┐       ┌─────────┐      ┌─────────┐        │
│   │ Crea    │────────▶│ Cobra   │──────▶│ Prepara │─────▶│ Entrega │        │
│   │ pedido  │         │ pedido  │       │         │      │         │        │
│   │         │         │         │       │         │      │         │        │
│   │ Nombre: │         │ Efectivo│       │ Marca   │      │ Marca   │        │
│   │ "Juan"  │         │ o       │       │ "Listo" │      │"Servido"│        │
│   └─────────┘         │ Tarjeta │       └─────────┘      └─────────┘        │
│        │              └─────────┘            │                │             │
│        ▼                   │                 ▼                ▼             │
│   ┌─────────┐         ┌─────────┐       ┌─────────┐      ┌─────────┐        │
│   │pendiente│────────▶│ pagado  │──────▶│en_cocina│─────▶│ cerrado │        │
│   │ _pago   │         │         │       │         │      │         │        │
│   └─────────┘         └─────────┘       └─────────┘      └─────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Características:**
- No requiere mesa
- Se ingresa nombre del cliente
- El pago se realiza antes de preparar
- Ideal para órdenes rápidas

### Flujo 2: En Mesa (Pago Al Final)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO EN MESA                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   MESERO              COCINA            COCINA           MESERO     CAJERO  │
│   ┌─────────┐       ┌─────────┐      ┌─────────┐      ┌─────────┐ ┌───────┐ │
│   │ Crea    │──────▶│ Prepara │─────▶│ Marca   │─────▶│ Sirve   │▶│ Cobra │ │
│   │ pedido  │       │         │      │ "Listo" │      │         │ │       │ │
│   │         │       │         │      │         │      │         │ │       │ │
│   │ Mesa: 5 │       │         │      │         │      │ Marca   │ │       │ │
│   └─────────┘       └─────────┘      └─────────┘      │"Servido"│ └───────┘ │
│        │                 │                │           └─────────┘     │     │
│        ▼                 ▼                ▼                │          ▼     │
│   ┌─────────┐       ┌─────────┐      ┌─────────┐      ┌─────────┐ ┌───────┐ │
│   │ en_mesa │──────▶│en_cocina│─────▶│  listo  │─────▶│pendiente│▶│cerrado│ │
│   │         │       │         │      │         │      │ _pago   │ │       │ │
│   └─────────┘       └─────────┘      └─────────┘      └─────────┘ └───────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Características:**
- Requiere asignar mesa
- El pedido va directo a cocina
- El pago se realiza después de servir
- Ideal para servicio en mesa tradicional

## API Endpoints

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Obtener usuario actual |
| GET | `/api/auth/usuarios` | Listar usuarios (admin) |
| POST | `/api/auth/usuarios` | Crear usuario (admin) |

### POS - Mesas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/pos/mesas` | Listar todas las mesas |
| POST | `/api/pos/mesas` | Crear mesa |
| PUT | `/api/pos/mesas/{id}` | Actualizar mesa |
| DELETE | `/api/pos/mesas/{id}` | Eliminar mesa |

### POS - Productos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/pos/productos` | Listar productos |
| POST | `/api/pos/productos` | Crear producto |
| PUT | `/api/pos/productos/{id}` | Actualizar producto |
| DELETE | `/api/pos/productos/{id}` | Eliminar producto |
| GET | `/api/pos/categorias` | Listar categorías |

### POS - Pedidos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/pos/pedidos` | Listar pedidos |
| POST | `/api/pos/pedidos` | Crear pedido |
| GET | `/api/pos/pedidos/{id}` | Obtener pedido |
| PUT | `/api/pos/pedidos/{id}/estado` | Cambiar estado |
| GET | `/api/pos/cocina/pedidos` | Pedidos para cocina |
| GET | `/api/pos/cajero/pedidos` | Pedidos para cajero |
| GET | `/api/pos/mesero/pedidos` | Pedidos listos para servir |
| POST | `/api/pos/cajero/pagar/{id}` | Procesar pago |

### Digifact

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/certificar` | Certificar DTE |
| POST | `/api/anular` | Anular DTE |
| GET | `/api/consultar` | Consultar DTE |

## Estados de Pedidos

```
┌────────────────┐
│ pendiente_pago │ ◄── Pedido creado (para llevar)
└───────┬────────┘
        │ Cajero cobra
        ▼
┌────────────────┐     ┌────────────────┐
│    pagado      │     │    en_mesa     │ ◄── Pedido en mesa (directo a cocina)
└───────┬────────┘     └───────┬────────┘
        │                      │
        └──────────┬───────────┘
                   ▼
          ┌────────────────┐
          │   en_cocina    │ ◄── Cocina preparando
          └───────┬────────┘
                  │ Cocina marca listo
                  ▼
          ┌────────────────┐
          │     listo      │ ◄── Listo para servir
          └───────┬────────┘
                  │ Mesero sirve
                  ▼
          ┌────────────────┐
          │    servido     │ ◄── Entregado (si en mesa, va a cajero)
          └───────┬────────┘
                  │
                  ▼
          ┌────────────────┐
          │    cerrado     │ ◄── Pedido completado
          └────────────────┘
```

## CI/CD con GitHub Actions

### Diagrama del Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Pipeline                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   TRIGGER: push a main/develop                                               │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────┐               │
│   │                  JOB: build-and-test                     │               │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │               │
│   │  │  Checkout   │─▶│ Build Docker│─▶│  Health Check   │  │               │
│   │  │    código   │  │  (backend)  │  │  curl /healthz  │  │               │
│   │  └─────────────┘  └─────────────┘  └─────────────────┘  │               │
│   └────────────────────────────┬────────────────────────────┘               │
│                                │ success                                     │
│                                ▼                                             │
│   ┌─────────────────────────────────────────────────────────┐               │
│   │                    JOB: deploy                           │               │
│   │  (solo en push a main)                                   │               │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │               │
│   │  │  SSH a VPS  │─▶│  git pull   │─▶│ docker restart  │  │               │
│   │  │             │  │  origin/main│  │    frontend     │  │               │
│   │  └─────────────┘  └─────────────┘  └─────────────────┘  │               │
│   └─────────────────────────────────────────────────────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Archivo de Workflow (.github/workflows/main.yml)

```yaml
name: CI/CD Facturacion Electronica Digifact

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - Checkout código
      - Build contenedor backend
      - Health check (curl /healthz)
      - Cleanup

  deploy:
    needs: build-and-test
    if: github.ref == 'refs/heads/main'
    steps:
      - SSH al VPS
      - git pull origin main
      - docker compose restart frontend
```

### Secrets Requeridos

| Secret | Descripción |
|--------|-------------|
| `SERVER_HOST` | IP o dominio del VPS |
| `SSH_PRIVATE_KEY` | Llave SSH privada para acceso |
| `DIGIFACT_URL` | URL de API Digifact |
| `DIGIFACT_USER` | Usuario Digifact |
| `DIGIFACT_PASS` | Contraseña Digifact |
| `DIGIFACT_NIT` | NIT del contribuyente |
| `CERT_EMAIL` | Email para Let's Encrypt |

## Configuración

### Variables de Entorno (.env)

```bash
# Digifact (opcional para POS)
DIGIFACT_URL=https://felgttestaws.digifact.com.sv
DIGIFACT_USER=SV.TU_NIT.usuario
DIGIFACT_PASS=tu_clave_secreta

# Flask
FLASK_ENV=development
SECRET_KEY=tu-clave-secreta-aqui

# Base de datos (SQLite por defecto)
DATABASE_PATH=./database
```

### Nginx (nginx.conf)

Configuración para producción con SSL:

```nginx
resolver 127.0.0.11 valid=30s;

# Redirección HTTP a HTTPS
server {
    listen 80;
    server_name test.irya.xyz;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Servidor HTTPS
server {
    listen 443 ssl;
    server_name test.irya.xyz;

    ssl_certificate /etc/letsencrypt/live/test.irya.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test.irya.xyz/privkey.pem;

    charset utf-8;

    # Anti-cache para desarrollo
    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api {
        proxy_pass http://backend:5000;
    }
}
```

## SSL / Certbot (Let's Encrypt)

### Emisión de Certificados

```bash
# Modo staging (pruebas)
docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot -d test.irya.xyz \
    --email tu@correo.test --agree-tos --no-eff-email --staging

# Modo producción
docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot -d test.irya.xyz \
    --email tu@correo.test --agree-tos --no-eff-email

# Recargar nginx
docker exec digifact-frontend nginx -s reload
```

### Renovación Automática (Cron)

```bash
0 3 * * 0 cd /root/facturacion && docker compose run --rm certbot renew
```

## Tecnologías

### Backend
- Python 3.11+
- Flask 3.0
- SQLite3
- Flask-CORS
- PyJWT
- Requests

### Frontend
- HTML5 / CSS3 / JavaScript (Vanilla)
- Bootstrap 5.3
- Bootstrap Icons
- Diseño Mobile-First

### Infraestructura
- Docker & Docker Compose
- Nginx (proxy reverso + SSL)
- GitHub Actions (CI/CD)
- Let's Encrypt (SSL)

## Comandos Útiles

```bash
# Iniciar servicios
docker compose up -d

# Ver logs en tiempo real
docker compose logs -f

# Reiniciar frontend (aplica cambios CSS/JS)
docker compose restart frontend

# Reconstruir backend
docker compose up -d --build backend

# Ver estado de contenedores
docker compose ps

# Acceder a shell del backend
docker exec -it digifact-backend /bin/sh

# Ver base de datos POS
docker exec -it digifact-backend sqlite3 /app/pos.db ".tables"

# Forzar actualización desde repo
cd /root/facturacion
git apiFetch origin main
git reset --hard origin/main
docker compose restart frontend
```

## Troubleshooting

### El login no funciona
1. Verificar que el backend esté corriendo: `docker compose ps`
2. Revisar logs: `docker compose logs backend`
3. Probar endpoint: `curl http://localhost:5000/healthz`

### La cocina no muestra pedidos
1. Verificar estados de pedidos en la base de datos
2. Revisar consola del navegador (F12)
3. Probar: `curl http://localhost/api/pos/cocina/pedidos`

### Error 502 Bad Gateway
1. El backend puede estar iniciando (esperar 10-15 segundos)
2. Verificar logs: `docker compose logs backend`
3. Reiniciar: `docker compose restart`

### Carrito móvil no aparece
1. Verificar que sea dispositivo móvil (≤768px)
2. Revisar consola para logs de `activarElementosMovil()`
3. Buscar clase `mobile-active` en el FAB

## Problemas de Despliegue y Soluciones

### Problema 1: Archivos no se actualizan en VPS

**Síntoma:** Los cambios funcionan en local pero no en el VPS después del deploy.

**Causa:** `git pull` no sobrescribe archivos modificados localmente o hay conflictos.

**Solución:**
```bash
cd /root/facturacion
git apiFetch origin main
git reset --hard origin/main
docker compose restart frontend
```

### Problema 2: nginx.conf congelado en VPS

**Síntoma:** Los cambios al nginx.conf no se aplican en el VPS.

**Causa:** El archivo estaba marcado como `assume-unchanged` en git.

**Solución:**
```bash
# Descongelar archivo
git update-index --no-assume-unchanged nginx.conf

# Actualizar
git reset --hard origin/main
docker compose restart frontend
```

### Problema 3: Cache del navegador

**Síntoma:** El navegador muestra versión antigua de JS/CSS.

**Causa:** El navegador cachea archivos estáticos.

**Solución:**
1. Agregar headers anti-cache en nginx:
```nginx
add_header Cache-Control "no-cache, no-store, must-revalidate";
```

2. Usar versioning en los scripts:
```html
<script src="pos.js?v=16"></script>
```

3. Forzar recarga: `Ctrl+Shift+R` o modo incógnito

### Problema 4: FAB desaparece después de cargar

**Síntoma:** El botón del carrito aparece brevemente y luego desaparece.

**Causa:** CSS media queries siendo sobrescritas por JavaScript.

**Solución:**
```css
/* Clases con !important para forzar visibilidad */
.cart-fab.mobile-active {
    display: flex !important;
}
```

```javascript
// Usar classList en lugar de style inline
cartFab.classList.add('mobile-active');
```

### Problema 5: Codificación de caracteres

**Síntoma:** Caracteres especiales se muestran incorrectamente.

**Causa:** Nginx no envía header Content-Type con charset.

**Solución:**
```nginx
charset utf-8;
charset_types text/html text/css application/javascript;
```

### Problema 6: SSL/HTTPS no funciona

**Síntoma:** Error de certificado o conexión rechazada en puerto 443.

**Causa:** Certificados no emitidos o nginx no configurado.

**Solución:**
```bash
# Verificar certificados
ls -la /root/facturacion/certs/live/test.irya.xyz/

# Re-emitir si no existen
docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot -d test.irya.xyz \
    --email tu@correo.test --agree-tos --no-eff-email

# Recargar nginx
docker exec digifact-frontend nginx -s reload
```

### Problema 7: Contenedor frontend no aplica cambios

**Síntoma:** Los archivos están actualizados pero el navegador muestra versión vieja.

**Causa:** Nginx cachea internamente o el contenedor necesita restart.

**Solución:**
```bash
# Opción 1: Reload de nginx
docker exec digifact-frontend nginx -s reload

# Opción 2: Restart completo
docker compose restart frontend
```

## Seguridad

- **Nunca exponer** el archivo `.env` en repositorios públicos
- Usar **HTTPS** en producción (Let's Encrypt)
- Cambiar las **contraseñas por defecto** de los usuarios
- Implementar **rate limiting** para la API en producción
- Las sesiones expiran automáticamente

## Licencia

Desarrollado para integración con Digifact El Salvador.

---

**Última actualización:** Diciembre 2025 | Sistema de Facturación + POS v2.0
