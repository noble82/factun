#!/usr/bin/env python3
"""
Script para resetear la contraseña del usuario admin
Ejecutar desde la carpeta backend:
    cd backend && python3 ../reset_admin_password.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from database import get_db_inventory as get_db
import hashlib
import secrets

def hash_password(password, salt=None):
    """Hash password with salt"""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return salt + ':' + hashed.hex()

def reset_admin_password():
    """Reset admin password to a new secure random password"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Generar nueva contraseña segura
        new_password = secrets.token_urlsafe(12)
        password_hash = hash_password(new_password)

        # Actualizar contraseña del admin
        cursor.execute(
            'UPDATE usuarios SET password_hash = ? WHERE username = ?',
            (password_hash, 'admin')
        )

        # Verificar que se actualizó
        if cursor.rowcount == 0:
            print("❌ Error: Usuario 'admin' no encontrado")
            conn.close()
            return False

        conn.commit()
        conn.close()

        print("=" * 70)
        print("✅ CONTRASEÑA DEL ADMIN RESETADA")
        print("=" * 70)
        print(f"Usuario:     admin")
        print(f"Contraseña:  {new_password}")
        print("=" * 70)
        print("⚠️  IMPORTANTE: Guarda estas credenciales de forma segura")
        print("=" * 70)
        return True

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == '__main__':
    reset_admin_password()
