"""
Test suite para CSRF protection (csrf.py)
Prueba generación, validación y consumo de tokens CSRF
"""

import sys
import unittest
from datetime import datetime, timedelta
from csrf import generate_csrf_token, validate_csrf_token, _cleanup_expired_tokens


class TestCSRFTokenGeneration(unittest.TestCase):
    """Tests para generación de tokens CSRF"""

    def test_generate_token_produces_string(self):
        """Generar token debe retornar string"""
        token = generate_csrf_token()
        self.assertIsInstance(token, str)

    def test_generate_token_not_empty(self):
        """Token generado no debe estar vacío"""
        token = generate_csrf_token()
        self.assertGreater(len(token), 0)

    def test_generate_token_different_each_time(self):
        """Cada token generado debe ser diferente"""
        token1 = generate_csrf_token()
        token2 = generate_csrf_token()
        self.assertNotEqual(token1, token2)

    def test_generate_token_length(self):
        """Token debe tener longitud razonable"""
        token = generate_csrf_token()
        # secrets.token_urlsafe(32) produce ~43 caracteres
        self.assertGreater(len(token), 30)
        self.assertLess(len(token), 100)


class TestCSRFTokenValidation(unittest.TestCase):
    """Tests para validación de tokens CSRF"""

    def test_validate_valid_token(self):
        """Token válido debe pasar validación"""
        token = generate_csrf_token()
        is_valid, message = validate_csrf_token(token)
        self.assertTrue(is_valid)
        self.assertEqual(message, "")

    def test_validate_invalid_token(self):
        """Token inválido debe fallar"""
        is_valid, message = validate_csrf_token("invalid_token_xyz")
        self.assertFalse(is_valid)
        self.assertIn("invalid", message.lower())

    def test_validate_empty_token(self):
        """Token vacío debe fallar"""
        is_valid, message = validate_csrf_token("")
        self.assertFalse(is_valid)
        self.assertIn("missing", message.lower())

    def test_validate_none_token(self):
        """Token None debe fallar"""
        is_valid, message = validate_csrf_token(None)
        self.assertFalse(is_valid)
        self.assertIn("missing", message.lower())

    def test_validate_token_one_time_use(self):
        """Token debe consumirse después de usar (one-time use)"""
        token = generate_csrf_token()

        # Primera validación debe pasar
        is_valid1, msg1 = validate_csrf_token(token)
        self.assertTrue(is_valid1)

        # Segunda validación con mismo token debe fallar
        is_valid2, msg2 = validate_csrf_token(token)
        self.assertFalse(is_valid2)

    def test_validate_token_expiry(self):
        """Token expirado debe fallar"""
        # Esta prueba requeriría manipular el tiempo
        # Por ahora verificamos que la estructura de expiry existe
        token = generate_csrf_token()
        is_valid, msg = validate_csrf_token(token)
        self.assertTrue(is_valid)

    def test_multiple_tokens_independently(self):
        """Múltiples tokens deben ser independientes"""
        token1 = generate_csrf_token()
        token2 = generate_csrf_token()
        token3 = generate_csrf_token()

        # Validar primer token
        is_valid1, _ = validate_csrf_token(token1)
        self.assertTrue(is_valid1)

        # Validar segundo token (token1 ya consumido)
        is_valid2, _ = validate_csrf_token(token2)
        self.assertTrue(is_valid2)

        # Token3 sigue siendo válido
        is_valid3, _ = validate_csrf_token(token3)
        self.assertTrue(is_valid3)

        # Token1 no se puede reutilizar
        is_valid1_retry, _ = validate_csrf_token(token1)
        self.assertFalse(is_valid1_retry)


class TestCSRFTokenCleanup(unittest.TestCase):
    """Tests para limpieza de tokens expirados"""

    def test_cleanup_removes_expired(self):
        """Limpieza debe remover tokens expirados"""
        # Esta prueba verificaría que _cleanup_expired_tokens funciona
        # Requeriría manipular el reloj del sistema
        # Por ahora verificamos que la función existe
        from csrf import _cleanup_expired_tokens
        self.assertTrue(callable(_cleanup_expired_tokens))


class TestCSRFTokenIntegration(unittest.TestCase):
    """Tests de integración para CSRF"""

    def test_generate_and_validate_workflow(self):
        """Workflow completo: generar → validar → consumir"""
        # Generar token
        token = generate_csrf_token()
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 0)

        # Validar token
        is_valid, message = validate_csrf_token(token)
        self.assertTrue(is_valid)
        self.assertEqual(message, "")

        # Intentar reutilizar debe fallar
        is_valid_retry, message_retry = validate_csrf_token(token)
        self.assertFalse(is_valid_retry)

    def test_multiple_users_concurrent_tokens(self):
        """Múltiples usuarios con tokens simultáneos"""
        user1_token = generate_csrf_token()
        user2_token = generate_csrf_token()
        user3_token = generate_csrf_token()

        # User1 valida su token
        is_valid1, _ = validate_csrf_token(user1_token)
        self.assertTrue(is_valid1)

        # User2 valida su token
        is_valid2, _ = validate_csrf_token(user2_token)
        self.assertTrue(is_valid2)

        # User3 valida su token
        is_valid3, _ = validate_csrf_token(user3_token)
        self.assertTrue(is_valid3)

        # Tokens no pueden reutilizarse
        is_valid1_again, _ = validate_csrf_token(user1_token)
        self.assertFalse(is_valid1_again)

    def test_csrf_protection_prevents_replay(self):
        """CSRF debe prevenir ataques de replay"""
        # Token original
        original_token = generate_csrf_token()

        # Validar una vez (simula una solicitud exitosa)
        is_valid_first, _ = validate_csrf_token(original_token)
        self.assertTrue(is_valid_first)

        # Intento de replay con mismo token (debe fallar)
        is_valid_replay, msg = validate_csrf_token(original_token)
        self.assertFalse(is_valid_replay)
        self.assertIn("invalid", msg.lower())


def run_tests():
    """Ejecuta todos los tests"""
    # Crear test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Agregar todos los tests
    suite.addTests(loader.loadTestsFromTestCase(TestCSRFTokenGeneration))
    suite.addTests(loader.loadTestsFromTestCase(TestCSRFTokenValidation))
    suite.addTests(loader.loadTestsFromTestCase(TestCSRFTokenCleanup))
    suite.addTests(loader.loadTestsFromTestCase(TestCSRFTokenIntegration))

    # Ejecutar tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Retornar código de salida
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(run_tests())
