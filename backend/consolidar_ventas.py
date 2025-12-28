#!/usr/bin/env python3
"""
Script para consolidar ventas diarias.
Puede ejecutarse manualmente o mediante cron job.

Uso:
    python3 consolidar_ventas.py              # Consolida el día anterior
    python3 consolidar_ventas.py 2025-12-26  # Consolida una fecha específica
"""

import sys
import os
from datetime import datetime, timedelta

# Agregar ruta del backend al path para importar módulos
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pos import consolidar_ventas_diarias

def main():
    """Función principal para ejecutar la consolidación"""

    fecha = None

    # Verificar si se proporcionó una fecha como argumento
    if len(sys.argv) > 1:
        fecha = sys.argv[1]
        # Validar formato de fecha
        try:
            datetime.strptime(fecha, '%Y-%m-%d')
            print(f"[INFO] Consolidando ventas para la fecha: {fecha}")
        except ValueError:
            print(f"[ERROR] Formato de fecha inválido: {fecha}")
            print(f"[INFO] Use formato YYYY-MM-DD")
            sys.exit(1)
    else:
        # Si no se proporciona fecha, usar el día anterior
        fecha = None
        ayer = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        print(f"[INFO] Consolidando ventas para el día anterior: {ayer}")

    # Ejecutar consolidación
    resultado = consolidar_ventas_diarias(fecha)

    # Mostrar resultado
    if resultado['success']:
        print(f"[SUCCESS] Consolidación completada exitosamente")
        print(f"  - Fecha: {resultado['fecha']}")
        print(f"  - Total Pedidos: {resultado['total_pedidos']}")
        print(f"  - Total Ventas: ${resultado['total_ventas']:.2f}")
        sys.exit(0)
    else:
        print(f"[ERROR] Fallo en consolidación: {resultado.get('error', 'Error desconocido')}")
        sys.exit(1)

if __name__ == '__main__':
    main()
