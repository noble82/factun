"""
Test suite para validators.py
Prueba todas las funciones de validación del sistema POS
"""

import sys
import unittest
from validators import (
    validar_email,
    validar_telefono,
    validar_numero_positivo,
    validar_numero_entero,
    validar_nit,
    validar_nrc,
    validar_dui,
    validar_codigo_alfanumerico
)


class TestValidarEmail(unittest.TestCase):
    """Tests para validación de email"""

    def test_email_valido(self):
        """Email con formato correcto debe pasar"""
        is_valid, msg = validar_email("usuario@example.com")
        self.assertTrue(is_valid)

    def test_email_invalido_sin_arroba(self):
        """Email sin @ debe fallar"""
        is_valid, msg = validar_email("usuarioexample.com")
        self.assertFalse(is_valid)

    def test_email_invalido_sin_dominio(self):
        """Email sin dominio debe fallar"""
        is_valid, msg = validar_email("usuario@")
        self.assertFalse(is_valid)

    def test_email_vacio_opcional(self):
        """Email vacío es opcional"""
        is_valid, msg = validar_email("")
        self.assertTrue(is_valid)

    def test_email_muy_largo(self):
        """Email muy largo debe fallar"""
        long_email = "a" * 250 + "@example.com"
        is_valid, msg = validar_email(long_email)
        self.assertFalse(is_valid)


class TestValidarTelefono(unittest.TestCase):
    """Tests para validación de teléfono"""

    def test_telefono_valido_basico(self):
        """Teléfono con 8 dígitos debe pasar"""
        is_valid, msg = validar_telefono("23456789")
        self.assertTrue(is_valid)

    def test_telefono_valido_con_guion(self):
        """Teléfono con formato 2345-6789 debe pasar"""
        is_valid, msg = validar_telefono("2345-6789")
        self.assertTrue(is_valid)

    def test_telefono_valido_con_espacio(self):
        """Teléfono con espacio debe pasar"""
        is_valid, msg = validar_telefono("2345 6789")
        self.assertTrue(is_valid)

    def test_telefono_valido_internacional(self):
        """Teléfono con código país debe pasar"""
        is_valid, msg = validar_telefono("+503 2345 6789")
        self.assertTrue(is_valid)

    def test_telefono_muy_corto(self):
        """Teléfono con menos de 7 dígitos debe fallar"""
        is_valid, msg = validar_telefono("123456")
        self.assertFalse(is_valid)

    def test_telefono_muy_largo(self):
        """Teléfono con más de 15 dígitos debe fallar"""
        is_valid, msg = validar_telefono("1234567890123456")
        self.assertFalse(is_valid)

    def test_telefono_con_caracteres_invalidos(self):
        """Teléfono con letras debe fallar"""
        is_valid, msg = validar_telefono("234a5678")
        self.assertFalse(is_valid)

    def test_telefono_vacio_opcional(self):
        """Teléfono vacío es opcional"""
        is_valid, msg = validar_telefono("")
        self.assertTrue(is_valid)


class TestValidarNumeroPositivo(unittest.TestCase):
    """Tests para validación de números positivos"""

    def test_numero_positivo_valido(self):
        """Número positivo válido debe pasar"""
        is_valid, valor, msg = validar_numero_positivo(10.5)
        self.assertTrue(is_valid)
        self.assertEqual(valor, 10.5)

    def test_numero_string_valido(self):
        """String convertible a número debe pasar"""
        is_valid, valor, msg = validar_numero_positivo("50.00")
        self.assertTrue(is_valid)
        self.assertEqual(valor, 50.0)

    def test_numero_negativo(self):
        """Número negativo debe fallar"""
        is_valid, valor, msg = validar_numero_positivo(-5)
        self.assertFalse(is_valid)

    def test_numero_con_maximo(self):
        """Número mayor que máximo debe fallar"""
        is_valid, valor, msg = validar_numero_positivo(100, maximo=50)
        self.assertFalse(is_valid)

    def test_numero_con_minimo(self):
        """Número menor que mínimo debe fallar"""
        is_valid, valor, msg = validar_numero_positivo(5, minimo=10)
        self.assertFalse(is_valid)

    def test_numero_cero(self):
        """Cero debe pasar (minimo=0 por defecto)"""
        is_valid, valor, msg = validar_numero_positivo(0)
        self.assertTrue(is_valid)

    def test_numero_invalido(self):
        """String no convertible debe fallar"""
        is_valid, valor, msg = validar_numero_positivo("abc")
        self.assertFalse(is_valid)


class TestValidarNumeroEntero(unittest.TestCase):
    """Tests para validación de números enteros"""

    def test_numero_entero_valido(self):
        """Número entero válido debe pasar"""
        is_valid, valor, msg = validar_numero_entero(42)
        self.assertTrue(is_valid)
        self.assertEqual(valor, 42)

    def test_numero_entero_string(self):
        """String convertible a entero debe pasar"""
        is_valid, valor, msg = validar_numero_entero("100")
        self.assertTrue(is_valid)
        self.assertEqual(valor, 100)

    def test_numero_con_decimales(self):
        """Número con decimales debe fallar"""
        is_valid, valor, msg = validar_numero_entero(10.5)
        self.assertFalse(is_valid)

    def test_numero_entero_negativo(self):
        """Número entero negativo debe pasar"""
        is_valid, valor, msg = validar_numero_entero(-5)
        self.assertTrue(is_valid)

    def test_numero_entero_invalido(self):
        """String no convertible debe fallar"""
        is_valid, valor, msg = validar_numero_entero("xyz")
        self.assertFalse(is_valid)


class TestValidarNIT(unittest.TestCase):
    """Tests para validación de NIT (El Salvador)"""

    def test_nit_valido(self):
        """NIT con 10 dígitos debe pasar"""
        is_valid, msg = validar_nit("0614123456")
        self.assertTrue(is_valid)

    def test_nit_valido_con_guion(self):
        """NIT con formato 061-412345-6 debe pasar"""
        is_valid, msg = validar_nit("061-412345-6")
        self.assertTrue(is_valid)

    def test_nit_muy_corto(self):
        """NIT con menos de 10 dígitos debe fallar"""
        is_valid, msg = validar_nit("061412345")
        self.assertFalse(is_valid)

    def test_nit_muy_largo(self):
        """NIT con más de 10 dígitos debe fallar"""
        is_valid, msg = validar_nit("06141234567")
        self.assertFalse(is_valid)

    def test_nit_con_letras(self):
        """NIT con letras debe fallar"""
        is_valid, msg = validar_nit("061a123456")
        self.assertFalse(is_valid)

    def test_nit_vacio_opcional(self):
        """NIT vacío es opcional"""
        is_valid, msg = validar_nit("")
        self.assertTrue(is_valid)


class TestValidarNRC(unittest.TestCase):
    """Tests para validación de NRC (El Salvador)"""

    def test_nrc_valido_7_digitos(self):
        """NRC con 7 dígitos debe pasar"""
        is_valid, msg = validar_nrc("1234567")
        self.assertTrue(is_valid)

    def test_nrc_valido_8_digitos(self):
        """NRC con 8 dígitos debe pasar"""
        is_valid, msg = validar_nrc("12345678")
        self.assertTrue(is_valid)

    def test_nrc_valido_con_guion(self):
        """NRC con formato 1234567-8 debe pasar"""
        is_valid, msg = validar_nrc("1234567-8")
        self.assertTrue(is_valid)

    def test_nrc_muy_corto(self):
        """NRC con menos de 7 dígitos debe fallar"""
        is_valid, msg = validar_nrc("123456")
        self.assertFalse(is_valid)

    def test_nrc_muy_largo(self):
        """NRC con más de 8 dígitos debe fallar"""
        is_valid, msg = validar_nrc("123456789")
        self.assertFalse(is_valid)

    def test_nrc_vacio_opcional(self):
        """NRC vacío es opcional"""
        is_valid, msg = validar_nrc("")
        self.assertTrue(is_valid)


class TestValidarDUI(unittest.TestCase):
    """Tests para validación de DUI (El Salvador)"""

    def test_dui_valido(self):
        """DUI con 9 dígitos debe pasar"""
        is_valid, msg = validar_dui("123456789")
        self.assertTrue(is_valid)

    def test_dui_valido_con_guion(self):
        """DUI con formato 12345678-9 debe pasar"""
        is_valid, msg = validar_dui("12345678-9")
        self.assertTrue(is_valid)

    def test_dui_muy_corto(self):
        """DUI con menos de 9 dígitos debe fallar"""
        is_valid, msg = validar_dui("12345678")
        self.assertFalse(is_valid)

    def test_dui_muy_largo(self):
        """DUI con más de 9 dígitos debe fallar"""
        is_valid, msg = validar_dui("1234567890")
        self.assertFalse(is_valid)

    def test_dui_con_letras(self):
        """DUI con letras debe fallar"""
        is_valid, msg = validar_dui("1234567a9")
        self.assertFalse(is_valid)

    def test_dui_vacio_opcional(self):
        """DUI vacío es opcional"""
        is_valid, msg = validar_dui("")
        self.assertTrue(is_valid)


class TestValidarCodigoAlfanumerico(unittest.TestCase):
    """Tests para validación de códigos alfanuméricos"""

    def test_codigo_valido(self):
        """Código con letras, números, guión debe pasar"""
        is_valid, msg = validar_codigo_alfanumerico("PROD-2024-001")
        self.assertTrue(is_valid)

    def test_codigo_con_underscore(self):
        """Código con underscore debe pasar"""
        is_valid, msg = validar_codigo_alfanumerico("PROD_2024_001")
        self.assertTrue(is_valid)

    def test_codigo_vacio(self):
        """Código vacío debe fallar"""
        is_valid, msg = validar_codigo_alfanumerico("")
        self.assertFalse(is_valid)

    def test_codigo_con_caracteres_especiales(self):
        """Código con caracteres especiales debe fallar"""
        is_valid, msg = validar_codigo_alfanumerico("PROD@2024")
        self.assertFalse(is_valid)

    def test_codigo_muy_largo(self):
        """Código que excede máximo debe fallar"""
        is_valid, msg = validar_codigo_alfanumerico("A" * 60)
        self.assertFalse(is_valid)

    def test_codigo_muy_corto(self):
        """Código debajo de mínimo debe fallar"""
        is_valid, msg = validar_codigo_alfanumerico("", longitud_minima=5)
        self.assertFalse(is_valid)


def run_tests():
    """Ejecuta todos los tests"""
    # Crear test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Agregar todos los tests
    suite.addTests(loader.loadTestsFromTestCase(TestValidarEmail))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarTelefono))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarNumeroPositivo))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarNumeroEntero))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarNIT))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarNRC))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarDUI))
    suite.addTests(loader.loadTestsFromTestCase(TestValidarCodigoAlfanumerico))

    # Ejecutar tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Retornar código de salida
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(run_tests())
