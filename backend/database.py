"""
Módulo centralizado de configuración de base de datos
Proporciona funciones compartidas para conexión y gestión de BD
"""

import sqlite3
import os

# Rutas de bases de datos
DB_PATH = os.path.join(os.path.dirname(__file__), 'pos.db')
DB_INVENTORY_PATH = os.path.join(os.path.dirname(__file__), 'pos_database.db')


def get_db(db_file='pos.db'):
    """
    Obtiene conexión a la base de datos especificada.

    Args:
        db_file (str): Nombre del archivo de BD ('pos.db' o 'pos_database.db')

    Returns:
        sqlite3.Connection: Conexión a la base de datos con row factory configurada
    """
    db_path = os.path.join(os.path.dirname(__file__), db_file)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_db_pos():
    """
    Obtiene conexión a la BD principal (pos.db).
    Alias para get_db('pos.db').
    """
    return get_db('pos.db')


def get_db_inventory():
    """
    Obtiene conexión a la BD de inventario (pos_database.db).
    Alias para get_db('pos_database.db').
    """
    return get_db('pos_database.db')
