```markdown
# Sistema POS Backend

Este repositorio contiene el código fuente del backend para un Sistema de Punto de Venta (POS), diseñado específicamente para una "Pupusería". La aplicación gestiona operaciones de venta, inventario, clientes, autenticación de usuarios y otras funcionalidades operativas clave.

## 🚀 Características Principales

*   **Autenticación y Autorización:** Gestión de usuarios, roles (Mesero, Cajero, Cocina), sesiones y control de acceso seguro (`auth.py`).
*   **Módulo POS:** Funcionalidades centrales para el registro de ventas, gestión de órdenes y transacciones (`pos.py`).
*   **Gestión de Inventario:** Control de materia prima, recetas, proveedores y órdenes de compra (`inventario.py`).
*   **Gestión de Clientes:** Administración de la base de datos de clientes (`clientes.py`).
*   **Consolidación de Ventas:** Script para la agregación y consolidación diaria de datos de ventas (`consolidar_ventas.py`).
*   **Protección CSRF:** Implementación de tokens CSRF para proteger contra ataques de falsificación de solicitudes entre sitios (`csrf.py`).
*   **Validación de Datos:** Funciones utilitarias para la validación de entradas de usuario (`validators.py`).
*   **Facturación:** Módulo para la gestión de procesos de facturación (`facturacion.py`).
*   **API RESTful:** Exposición de endpoints para la interacción con el frontend y otros servicios.

## 🛠️ Tecnologías Utilizadas

*   **Lenguaje:** Python 3
*   **Framework Web:** Flask
*   **Base de Datos:** SQLite (observado para `clientes.db` y otros módulos), con soporte potencial para PostgreSQL a través de SQLAlchemy.
*   **Dependencias Clave:**
    *   `Flask==3.0.0`
    *   `flask-cors==4.0.0`
    *   `flask-limiter==3.5.0`
    *   `requests==2.31.0`
    *   `python-dotenv==1.0.0`
*   **Seguridad:** Flask-Limiter para limitación de tasas, CSRF tokens.
*   **Contenerización:** Docker (`Dockerfile`).

## 📁 Estructura del Proyecto

El proyecto sigue una estructura modular, con archivos dedicados a funcionalidades específicas:

*   `./app.py`: Punto de entrada principal de la aplicación Flask, registra Blueprints y define rutas globales.
*   `./auth.py`: Módulo de autenticación y autorización.
*   `./pos.py`: Lógica del Punto de Venta.
*   `./inventario.py`: Lógica de gestión de inventario.
*   `./clientes.py`: Lógica de gestión de clientes.
*   `./consolidar_ventas.py`: Script independiente para la consolidación de ventas.
*   `./csrf.py`: Funciones para la protección CSRF.
*   `./database.py`: (Presumiblemente) Configuración de la conexión a la base de datos.
*   `./facturacion.py`: Lógica de facturación.
*   `./validators.py`: Funciones de validación de datos.
*   `./Dockerfile`: Configuración para la creación de imágenes Docker.
*   `./requirements.txt`: Lista de dependencias del proyecto.

Aquí se presenta la documentación técnica completa del backend del Sistema POS, incluyendo diagramas y una descripción detallada de sus componentes y funcionalidades.

---

## Documentación Técnica del Backend del Sistema POS

### 1. Visión General del Sistema

El Sistema POS (Punto de Venta) es una aplicación web construida con Flask, diseñada para gestionar operaciones de venta, inventario, clientes y autenticación. Está modularizado en Blueprints para facilitar el mantenimiento y la escalabilidad, e incluye mecanismos de seguridad como protección CSRF y limitación de tasas. El sistema soporta flujos específicos para roles como Mesero, Cajero y Cocina, y permite la consolidación de ventas.

### 2. Arquitectura General del Backend

El backend sigue una arquitectura modular basada en Flask Blueprints, interactuando con una base de datos y potencialmente con servicios externos.

```mermaid
graph TD
    subgraph Cliente
        A[Navegador Web/Frontend]
    end

    subgraph Backend Flask (app.py)
        B[Flask Application]
        B -- Registra --> C(Blueprint: Autenticación - auth.py)
        B -- Registra --> D(Blueprint: POS - pos.py)
        B -- Registra --> E(Blueprint: Inventario - inventario.py)
        B -- Registra --> F(Blueprint: Clientes - clientes.py)
        B -- Usa --> G(Módulo: CSRF - csrf.py)
        B -- Usa --> H(Módulo: Validadores - validators.py)
        B -- Usa --> I(Módulo: Facturación - facturacion.py)
        B -- Usa --> J(Flask-Limiter)
        B -- Usa --> K(Flask-CORS)
    end

    subgraph Base de Datos
        L[SQLite/PostgreSQL]
        L -- Almacena --> L1(Usuarios/Roles)
        L -- Almacena --> L2(Sesiones/CSRF Tokens)
        L -- Almacena --> L3(Ventas/Órdenes)
        L -- Almacena --> L4(Productos/Ingredientes/Recetas)
        L -- Almacena --> L5(Proveedores)
        L -- Almacena --> L6(Clientes)
        L -- Almacena --> L7(Facturas)
    end

    subgraph Scripts y Otros
        M[Script: Consolidar Ventas - consolidar_ventas.py]
        N[Tests: test_csrf.py, test_validators.py]
        O[Configuración: Dockerfile, requirements.txt]
    end

    subgraph Servicios Externos
        P[API de Certificación/Anulación (e.g., Hacienda, Pasarela de Pago)]
    end

    A -- Peticiones HTTP --> B
    C -- Accede --> L
    D -- Accede --> L
    E -- Accede --> L
    F -- Accede --> L

