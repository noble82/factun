# Configuración del Cron Job para Consolidación de Ventas Diarias

Este documento explica cómo configurar la consolidación automática diaria de ventas.

## Opción 1: Cron Job en Linux/Mac (Recomendado para Producción)

### Paso 1: Hacer el script ejecutable
```bash
chmod +x /home/noble/Documentos/facturacion/backend/consolidar_ventas.py
```

### Paso 2: Editar el crontab
```bash
crontab -e
```

### Paso 3: Agregar la siguiente línea al crontab
Para ejecutar la consolidación todos los días a las 23:55 (11:55 PM):

```cron
# Consolidación de ventas diarias - 23:55 cada día
55 23 * * * /usr/bin/python3 /home/noble/Documentos/facturacion/backend/consolidar_ventas.py >> /var/log/facturacion_consolidacion.log 2>&1
```

### Paso 4: Verificar que se registró correctamente
```bash
crontab -l
```

## Opción 2: Consolidación Manual via API

Puedes ejecutar la consolidación manualmente desde cualquier aplicación cliente:

### Request
```bash
curl -X POST http://localhost:5000/api/pos/reportes/consolidar \
  -H "Authorization: Bearer [TU_TOKEN_JWT]" \
  -H "Content-Type: application/json" \
  -d '{"fecha": "2025-12-26"}'  # Opcional, si no especificas usa ayer
```

### Response
```json
{
  "success": true,
  "fecha": "2025-12-26",
  "total_pedidos": 25,
  "total_ventas": 156.50
}
```

## Opción 3: Consolidación en Docker

Si usas Docker Compose, puedes agregar un servicio de cron:

### Crear Dockerfile para cron
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ /app/

# Instalar cron
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Crear script de entrada
RUN echo "#!/bin/bash\n\
55 23 * * * /usr/local/bin/python /app/consolidar_ventas.py >> /var/log/consolidacion.log 2>&1\n\
" | crontab -

CMD ["cron", "-f"]
```

### Agregar al docker-compose.yml
```yaml
services:
  # ... otros servicios ...

  cron-consolidador:
    build:
      context: .
      dockerfile: Dockerfile.cron
    depends_on:
      - backend
    volumes:
      - /var/log/facturacion:/var/log
    restart: always
```

## Opción 4: Consolidación Automática en app.py (Desarrollo)

Para desarrollo, puedes agregar un job de fondo en Flask:

```python
# En app.py
from apscheduler.schedulers.background import BackgroundScheduler
from pos import consolidar_ventas_diarias
import atexit

def iniciar_scheduler():
    """Inicia el scheduler para consolidación nightly"""
    scheduler = BackgroundScheduler()

    # Ejecutar consolidación a las 23:55 cada día
    scheduler.add_job(
        func=consolidar_ventas_diarias,
        trigger="cron",
        hour=23,
        minute=55,
        id='consolidar_ventas_diarias',
        name='Consolidación de ventas diarias'
    )

    scheduler.start()

    # Detener scheduler al salir
    atexit.register(lambda: scheduler.shutdown())

    print("✓ Scheduler iniciado - Consolidación programada para 23:55 diariamente")

# Llamar al inicio de la aplicación
if __name__ == '__main__':
    iniciar_scheduler()
    app.run(debug=True)
```

## Verificación de Consolidación

### Ver si el script se ejecutó
```bash
tail -f /var/log/facturacion_consolidacion.log
```

### Consultar datos consolidados
```bash
curl -X GET http://localhost:5000/api/pos/reportes/hoy \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

### Consultar reportes por período
```bash
curl -X GET "http://localhost:5000/api/pos/reportes/periodo?inicio=2025-12-20&fin=2025-12-27" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

## Solución de Problemas

### Cron no se ejecuta
1. Verifica que el servicio cron esté activo: `sudo service cron status`
2. Verifica permisos del script: `ls -la /home/noble/Documentos/facturacion/backend/consolidar_ventas.py`
3. Revisa el log del sistema: `grep CRON /var/log/syslog`

### Error de importación en cron
- Asegúrate de usar la ruta completa de Python: `/usr/bin/python3`
- Verifica que el archivo `__init__.py` exista en `/backend/`

### Base de datos bloqueada
- Si se ejecuta mientras la aplicación está escribiendo, puede causar conflictos
- Solución: Agendar la consolidación fuera de horas de operación (ej: 23:55)

## Monitoreo

### Crear log rotativo
```bash
# Crear archivo logrotate
echo "/var/log/facturacion_consolidacion.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
}" | sudo tee /etc/logrotate.d/facturacion
```

### Enviar alertas por email (opcional)
```bash
# Modificar crontab para enviar alertas
MAILTO=admin@example.com
55 23 * * * /usr/bin/python3 /home/noble/Documentos/facturacion/backend/consolidar_ventas.py
```

## Verificación Manual para Desarrollo

Para probar sin esperar a la hora programada:

```bash
cd /home/noble/Documentos/facturacion/backend
python3 consolidar_ventas.py          # Consolida ayer
python3 consolidar_ventas.py 2025-12-25  # Consolida fecha específica
```

---

**Última actualización:** 2025-12-27
**Responsable:** Sistema de Reportes de Ventas
