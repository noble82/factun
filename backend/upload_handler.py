"""
Manejo de uploads de imágenes para productos y combos
"""

import os
import hashlib
from datetime import datetime
from werkzeug.utils import secure_filename
from pathlib import Path

# Configuración
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB

def allowed_file(filename):
    """Valida que el archivo sea una imagen permitida"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_image(file):
    """
    Valida imagen
    Retorna: (is_valid, error_message)
    """
    if not file:
        return False, "No file provided"

    if file.filename == '':
        return False, "No file selected"

    if not allowed_file(file.filename):
        return False, "Format must be JPG, JPEG or PNG"

    if len(file.read()) > MAX_FILE_SIZE:
        file.seek(0)
        return False, "File size must not exceed 2 MB"

    file.seek(0)
    return True, ""

def save_image(file, category):
    """
    Guarda una imagen en el servidor

    Args:
        file: File object from request
        category: 'productos' o 'combos'

    Returns:
        (success, filename or error_message)
    """
    try:
        is_valid, error_msg = validate_image(file)
        if not is_valid:
            return False, error_msg

        # Generar nombre único
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_hash = hashlib.md5(file.read()).hexdigest()[:8]
        file.seek(0)

        ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
        filename = f"{timestamp}_{file_hash}.{ext}"

        # Crear directorio si no existe
        upload_path = os.path.join(UPLOAD_DIR, category)
        Path(upload_path).mkdir(parents=True, exist_ok=True)

        # Guardar archivo
        filepath = os.path.join(upload_path, filename)
        file.save(filepath)

        # Retornar ruta relativa para BD
        return True, f"uploads/{category}/{filename}"

    except Exception as e:
        return False, str(e)

def delete_image(image_path):
    """
    Elimina una imagen del servidor

    Args:
        image_path: Ruta relativa de la imagen
    """
    try:
        full_path = os.path.join(os.path.dirname(__file__), image_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            return True
    except Exception as e:
        print(f"Error deleting image: {e}")
    return False
