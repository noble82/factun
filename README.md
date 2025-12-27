# Sistema de Facturación El Salvador - Digifact + POS

Sistema completo de facturación electrónica para El Salvador con integración Digifact y módulo de Punto de Venta (POS) para restaurantes/pupuserías.

## Tabla de Contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación](#instalación)
- [Usuarios del Sistema](#usuarios-del-sistema)
- [Módulo POS](#módulo-pos)
- [Flujos de Trabajo](#flujos-de-trabajo)
- [API Endpoints](#api-endpoints)
- [Estados de Pedidos](#estados-de-pedidos)
- [Configuración](#configuración)
- [Tecnologías](#tecnologías)
- [Comandos Útiles](#comandos-útiles)
- [Troubleshooting](#troubleshooting)

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
- Dos flujos de pago: Anticipado y Al Final
- Vista de cocina en tiempo real
- Gestión de productos y categorías
- Control de inventario básico

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        NGINX (Puerto 80)                     │
│                     Proxy Reverso + Static                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│     Frontend        │         │      Backend        │
│   (Static Files)    │         │   Flask (Puerto     │
│                     │         │        5000)        │
│  - index.html       │         │                     │
│  - pos.html         │         │  - API REST         │
│  - cocina.html      │         │  - SQLite DB        │
│  - login.html       │         │  - Digifact API     │
└─────────────────────┘         └─────────────────────┘
```

## Estructura del Proyecto

```
facturacion/
├── backend/
│   ├── app.py                # Aplicación principal Flask
│   ├── auth.py               # Módulo de autenticación
│   ├── pos.py                # Módulo POS (mesas, pedidos, productos)
│   ├── database/
│   │   ├── auth.db           # Base de datos de usuarios
│   │   └── pos.db            # Base de datos POS
│   ├── requirements.txt      # Dependencias Python
│   ├── Dockerfile
│   └── .env                  # Variables de entorno
├── frontend/
│   ├── index.html            # Dashboard principal
│   ├── login.html            # Página de login
│   ├── pos.html              # Punto de Venta
│   ├── cocina.html           # Vista de cocina
│   ├── auth-check.js         # Verificación de autenticación
│   ├── pos.js                # Lógica POS
│   ├── style.css             # Estilos generales
│   └── app.js                # Lógica facturación
├── docker-compose.yml        # Orquestación de contenedores
├── nginx.conf                # Configuración Nginx
└── README.md
```

## Instalación

### Requisitos
- Docker y Docker Compose
- Credenciales Digifact El Salvador (opcional para POS)

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

| Servicio | URL |
|----------|-----|
| Frontend Principal | http://localhost |
| Login | http://localhost/login.html |
| POS | http://localhost/pos.html |
| Cocina | http://localhost/cocina.html |
| API Backend | http://localhost/api |
| Health Check (CI) | http://localhost/healthz |

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
- Crear pedidos
- Seleccionar productos del menú
- Agregar notas a pedidos
- Ver estado de pedidos propios

### Panel de Cajero
- Ver pedidos pendientes de pago
- Procesar pagos (efectivo, tarjeta)
- Ver historial de cobros del día

### Vista de Cocina
- Ver pedidos pendientes de preparación
- Marcar pedidos como "Preparando"
- Marcar pedidos como "Listo para servir"
- Alerta visual para pedidos urgentes (+15 min)
- Actualización automática cada 5 segundos

## Flujos de Trabajo

### Flujo 1: Pago Anticipado (Para Llevar)

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ MESERO  │───▶│ CAJERO  │───▶│ COCINA  │───▶│ COCINA  │───▶│ MESERO  │
│ Crea    │    │ Cobra   │    │ Prepara │    │ Marca   │    │ Entrega │
│ pedido  │    │ pedido  │    │         │    │ Listo   │    │         │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
pendiente_pago → pagado → en_cocina → listo → servido
```

**Características:**
- No requiere mesa (para llevar)
- Se ingresa nombre del cliente
- El pago se realiza antes de preparar
- Ideal para órdenes rápidas

### Flujo 2: Pago Al Final (En Mesa)

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ MESERO  │───▶│ COCINA  │───▶│ COCINA  │───▶│ MESERO  │───▶│ CAJERO  │
│ Crea    │    │ Prepara │    │ Marca   │    │ Sirve   │    │ Cobra   │
│ pedido  │    │         │    │ Listo   │    │         │    │         │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
  en_mesa → en_cocina → listo → servido → pagado
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
| GET | `/api/auth/verify` | Verificar token |
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
| POST | `/api/pos/cajero/pagar/{id}` | Procesar pago |

### Digifact

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/certificar` | Certificar DTE |
| POST | `/api/anular` | Anular DTE |
| GET | `/api/consultar` | Consultar DTE |
| POST | `/api/auth/test` | Probar conexión Digifact |

## Estados de Pedidos

| Estado | Descripción | Visible en |
|--------|-------------|------------|
| `pendiente_pago` | Pedido creado, esperando pago (flujo anticipado) | Cajero |
| `pagado` | Pagado, listo para cocina (flujo anticipado) | Cocina |
| `en_mesa` | Asignado a mesa, esperando preparación (flujo al final) | Cocina |
| `en_cocina` | En preparación | Cocina |
| `listo` | Preparado, listo para servir | Mesero |
| `servido` | Entregado al cliente | Cajero (si flujo al final) |

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

- Puerto 80 para frontend
- Proxy a backend en puerto 5000
- Rutas `/api/*` redirigidas al backend
- Health check público para CI en `/healthz` y health protegido en `/health` (solo `manager`)
- Asegúrate de configurar `server_name` y certificados para tu dominio (ej. `test.irya.xyz`)

## SSL / Certbot (Let's Encrypt)

Recomendado para emitir certificados TLS y habilitar HTTPS. Pruebas con el entorno `staging` de Let's Encrypt evitan límites durante las pruebas.

Requisitos:
- DNS A record apuntando a la IP de tu servidor para `test.irya.xyz`.
- Volúmenes `certs` y `certbot-www` creados y accesibles por Docker.

Comandos de ejemplo (primero probar con `--staging`):

```bash
# Levantar servicios necesarios (backend + nginx + contenedor certbot)
docker compose up -d backend frontend certbot

# Emisión de prueba (staging) - no produce certificados válidos pero permite probar flujo
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d test.irya.xyz \
     --email tu@correo.test --agree-tos --no-eff-email --staging

# Emisión (producción) - usar solo cuando DNS ya apunte correctamente
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d test.irya.xyz \
     --email tu@correo.test --agree-tos --no-eff-email

# Recargar nginx para aplicar certificados
docker compose exec frontend nginx -s reload
```

Renovación recomendada (cron o systemd timer). Ejemplo cron semanal:

```bash
# Crontab (ejecutar como root):
# 0 3 * * 0 cd /root/facturacion && docker compose run --rm certbot renew --deploy-hook "docker compose exec frontend nginx -s reload"
```

Notas operativas:
- Si certbot falla por permisos, comprueba que `./certs` y `./certbot-www` existan y sean escribibles por Docker.
- Para depuración, revisa los logs del contenedor certbot:
     `docker compose logs certbot`.

### Script de ayuda: `deploy-cert.sh`

Se ha incluido un script auxiliar `deploy-cert.sh` en la raíz del proyecto para automatizar la emisión y recarga de nginx.

Uso recomendado (ejemplo de staging):

```bash
# Hacer ejecutable si aún no lo es
chmod +x deploy-cert.sh

# Emisión en modo staging (pruebas)
./deploy-cert.sh -d test.irya.xyz -e tu@correo.test -m staging

# Emisión en producción (cuando DNS ya apunte)
./deploy-cert.sh -d test.irya.xyz -e tu@correo.test -m prod
```

Opciones principales:
- `-d DOMAIN` dominio a emitir (ej. `test.irya.xyz`)
- `-e EMAIL` correo para registro en Let's Encrypt
- `-m staging|prod` modo (`staging` para pruebas)
- `-f` forzar re-emisión si ya existen certificados

El script crea los directorios `./certs` y `./certbot-www` si no existen, levanta los contenedores necesarios y solicita el certificado con `certbot`, luego recarga nginx.

## Tecnologías

### Backend
- Python 3.11+
- Flask 3.0
- SQLite3
- Flask-CORS
- Requests (para Digifact API)

Nota: la aplicación se inicia con `python app.py` dentro del contenedor. No se usa Gunicorn en esta configuración por decisión del despliegue actual.

### Frontend
- HTML5 / CSS3 / JavaScript (Vanilla)
- Bootstrap 5.3
- Bootstrap Icons

### Infraestructura
- Docker & Docker Compose
- Nginx (proxy reverso)

## Comandos Útiles

```bash
# Iniciar servicios
docker compose up -d

# Ver logs en tiempo real
docker compose logs -f

# Reiniciar backend
docker compose restart backend

# Reconstruir después de cambios
docker compose up -d --build

# Detener servicios
docker compose down

# Ver estado de contenedores
docker compose ps

# Acceder a shell del backend
docker exec -it facturacion-backend-1 /bin/sh

# Ver base de datos POS
docker exec -it facturacion-backend-1 sqlite3 /app/database/pos.db ".tables"

# Backup de base de datos
docker cp facturacion-backend-1:/app/database/pos.db ./backup_pos.db
```

## Troubleshooting

### El login no funciona
1. Verificar que el backend esté corriendo: `docker compose ps`
2. Revisar logs: `docker compose logs backend`
3. Verificar que existe la base de datos auth.db

### La cocina no muestra pedidos
1. Verificar que haya pedidos en estado `pagado`, `en_mesa` o `en_cocina`
2. Revisar la consola del navegador (F12)
3. Probar endpoint directamente: `curl http://localhost/api/pos/cocina/pedidos`

### Los roles no funcionan correctamente
1. Limpiar caché del navegador
2. Cerrar sesión y volver a entrar
3. Verificar el rol del usuario: `curl http://localhost/api/auth/verify`

### Error 502 Bad Gateway
1. El backend puede estar iniciando: esperar 10-15 segundos
2. Verificar logs del backend: `docker compose logs backend`
3. Reiniciar servicios: `docker compose restart`

### Error de CORS
- Nginx maneja CORS automáticamente
- Verificar que las peticiones vayan a `/api/*`

### Base de datos corrupta
```bash
# Backup y reinicio
docker cp facturacion-backend-1:/app/database ./backup_db
docker compose down -v
docker compose up -d
```

## Seguridad

- **Nunca exponer** el archivo `.env` en repositorios públicos
- Usar **HTTPS** en producción
- Cambiar las **contraseñas por defecto** de los usuarios
- Implementar **rate limiting** para la API en producción
- Las sesiones expiran automáticamente

## Licencia

Desarrollado para integración con Digifact El Salvador.

---

Generado: 2024 | Sistema de Facturación + POS
