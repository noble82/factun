"""
Módulo de Validadores para Sistema POS
Proporciona funciones para validar diferentes tipos de entrada
"""

import re


def validar_email(email):
    """
    Valida que el email tenga un formato correcto.

    Args:
        email (str): Email a validar

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not email:
        return True, ""  # Email es opcional en muchos casos

    email = email.strip()
    if not email:
        return True, ""

    # Patrón regex para validar email
    patron = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    if not re.match(patron, email):
        return False, "El email no tiene un formato válido"

    if len(email) > 254:
        return False, "El email es demasiado largo (máximo 254 caracteres)"

    return True, ""


def validar_telefono(telefono):
    """
    Valida que el teléfono tenga un formato correcto.
    Acepta formatos: 2345-6789, 2345 6789, 23456789, +503 2345 6789, etc.

    Args:
        telefono (str): Teléfono a validar

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not telefono:
        return True, ""  # Teléfono es opcional en muchos casos

    telefono = telefono.strip()
    if not telefono:
        return True, ""

    # Remover caracteres permitidos y verificar que solo queden dígitos
    telefono_limpio = re.sub(r'[\s\-()]+', '', telefono)

    # Puede comenzar con + para código país
    if telefono_limpio.startswith('+'):
        telefono_limpio = telefono_limpio[1:]

    # Verificar que todos los caracteres restantes sean dígitos
    if not telefono_limpio.isdigit():
        return False, "El teléfono contiene caracteres inválidos"

    # Validar longitud (El Salvador: 8 dígitos, otros países: 7-15)
    if len(telefono_limpio) < 7 or len(telefono_limpio) > 15:
        return False, "El teléfono debe tener entre 7 y 15 dígitos"

    return True, ""


def validar_numero_positivo(valor, nombre_campo="valor", minimo=0, maximo=None):
    """
    Valida que un valor sea un número positivo.

    Args:
        valor: Valor a validar (puede ser string o número)
        nombre_campo (str): Nombre del campo para el mensaje de error
        minimo (float): Valor mínimo permitido (default: 0)
        maximo (float): Valor máximo permitido (default: None, sin límite)

    Returns:
        tuple: (es_válido, valor_convertido, mensaje_error)
    """
    try:
        if isinstance(valor, str):
            valor = float(valor.strip())
        else:
            valor = float(valor)
    except (ValueError, TypeError, AttributeError):
        return False, None, f"El {nombre_campo} debe ser un número válido"

    if valor < minimo:
        return False, None, f"El {nombre_campo} debe ser mayor o igual a {minimo}"

    if maximo is not None and valor > maximo:
        return False, None, f"El {nombre_campo} debe ser menor o igual a {maximo}"

    return True, valor, ""


def validar_numero_entero(valor, nombre_campo="valor", minimo=None, maximo=None):
    """
    Valida que un valor sea un número entero.

    Args:
        valor: Valor a validar (puede ser string o número)
        nombre_campo (str): Nombre del campo para el mensaje de error
        minimo (int): Valor mínimo permitido (default: None, sin límite)
        maximo (int): Valor máximo permitido (default: None, sin límite)

    Returns:
        tuple: (es_válido, valor_convertido, mensaje_error)
    """
    try:
        if isinstance(valor, str):
            valor = int(valor.strip())
        else:
            valor = int(valor)
    except (ValueError, TypeError, AttributeError):
        return False, None, f"El {nombre_campo} debe ser un número entero válido"

    if minimo is not None and valor < minimo:
        return False, None, f"El {nombre_campo} debe ser mayor o igual a {minimo}"

    if maximo is not None and valor > maximo:
        return False, None, f"El {nombre_campo} debe ser menor o igual a {maximo}"

    return True, valor, ""


def validar_nit(nit):
    """
    Valida que el NIT tenga un formato correcto.
    Formato El Salvador: NNNNNNNNNN (10 dígitos) o NNN-NNNNNNNN-NNN (formato con guiones)

    Args:
        nit (str): NIT a validar

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not nit:
        return True, ""  # NIT es opcional

    nit = nit.strip()
    if not nit:
        return True, ""

    # Remover guiones si existen
    nit_limpio = nit.replace('-', '')

    # Verificar que solo contenga dígitos
    if not nit_limpio.isdigit():
        return False, "El NIT debe contener solo dígitos"

    # El Salvador: NIT debe tener 10 dígitos
    if len(nit_limpio) != 10:
        return False, "El NIT debe tener exactamente 10 dígitos"

    return True, ""


def validar_nrc(nrc):
    """
    Valida que el NRC tenga un formato correcto.
    Formato El Salvador: NNNNNNN-N (7 dígitos - 1 dígito verificador) o NNNNNNNN (8 dígitos)

    Args:
        nrc (str): NRC a validar

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not nrc:
        return True, ""  # NRC es opcional

    nrc = nrc.strip()
    if not nrc:
        return True, ""

    # Remover guiones si existen
    nrc_limpio = nrc.replace('-', '')

    # Verificar que solo contenga dígitos
    if not nrc_limpio.isdigit():
        return False, "El NRC debe contener solo dígitos"

    # El Salvador: NRC debe tener 7-8 dígitos
    if len(nrc_limpio) < 7 or len(nrc_limpio) > 8:
        return False, "El NRC debe tener entre 7 y 8 dígitos"

    return True, ""


def validar_dui(dui):
    """
    Valida que el DUI tenga un formato correcto.
    Formato El Salvador: NNNNNNNN-N (8 dígitos - 1 dígito verificador) o NNNNNNNNN (9 dígitos)

    Args:
        dui (str): DUI a validar

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not dui:
        return True, ""  # DUI es opcional

    dui = dui.strip()
    if not dui:
        return True, ""

    # Remover guiones si existen
    dui_limpio = dui.replace('-', '')

    # Verificar que solo contenga dígitos
    if not dui_limpio.isdigit():
        return False, "El DUI debe contener solo dígitos"

    # El Salvador: DUI debe tener 9 dígitos
    if len(dui_limpio) != 9:
        return False, "El DUI debe tener exactamente 9 dígitos"

    return True, ""


def validar_codigo_alfanumerico(codigo, longitud_minima=1, longitud_maxima=50):
    """
    Valida que un código sea alfanumérico con guiones y guiones bajos permitidos.

    Args:
        codigo (str): Código a validar
        longitud_minima (int): Longitud mínima
        longitud_maxima (int): Longitud máxima

    Returns:
        tuple: (es_válido, mensaje_error)
    """
    if not codigo:
        return False, "El código no puede estar vacío"

    codigo = codigo.strip()
    if not codigo:
        return False, "El código no puede estar vacío"

    # Patrón: letras, números, guiones y guiones bajos
    patron = r'^[a-zA-Z0-9\-_]+$'

    if not re.match(patron, codigo):
        return False, "El código solo puede contener letras, números, guiones y guiones bajos"

    if len(codigo) < longitud_minima:
        return False, f"El código debe tener al menos {longitud_minima} carácter(es)"

    if len(codigo) > longitud_maxima:
        return False, f"El código no puede exceder {longitud_maxima} caracteres"

    return True, ""
