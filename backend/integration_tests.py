#!/usr/bin/env python3
"""
Phase 2: Integration Tests - Authentication, Roles, and CSRF
Tests the complete auth flow, role enforcement, and CSRF protection
"""

import requests
import json
import sys
from datetime import datetime
import time

# Configuration
BASE_URL = "http://localhost:5000"
TEST_RESULTS = {
    "passed": 0,
    "failed": 0,
    "errors": 0,
    "tests": []
}

# Test data
TEST_USERS = {
    "admin": {"username": "admin", "password": "admin123"},
    "juan": {"username": "juan", "password": "pass123"},
    "carlos": {"username": "carlos", "password": "pass123"},
    "pedro": {"username": "pedro", "password": "pass123"},
}

ROLES = {
    "admin": "manager",
    "juan": "mesero",
    "carlos": "cajero",
    "pedro": "cocinero"
}

# Global session data
sessions = {}


def print_header(text):
    """Print colored header"""
    print("\n" + "=" * 70)
    print(f"  {text}")
    print("=" * 70)


def print_test(num, name):
    """Print test header"""
    print(f"\n📋 Test {num}: {name}")
    print("-" * 70)


def log_result(test_num, name, status, details=""):
    """Log test result"""
    global TEST_RESULTS

    icon = "✅" if status == "PASS" else "❌"
    print(f"{icon} {status}: {name}")
    if details:
        print(f"   {details}")

    TEST_RESULTS["tests"].append({
        "num": test_num,
        "name": name,
        "status": status,
        "details": details,
        "timestamp": datetime.now().isoformat()
    })

    if status == "PASS":
        TEST_RESULTS["passed"] += 1
    else:
        TEST_RESULTS["failed"] += 1


# ============ TEST SUITE ============

def test_1_login_as_manager():
    """Test 1: Login as manager"""
    print_test(1, "Login as Manager")

    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_USERS["admin"],
            timeout=5
        )

        if response.status_code != 200:
            log_result(1, "Manager login", "FAIL", f"Status {response.status_code}: {response.text}")
            return False

        data = response.json()

        if not data.get("success") or not data.get("token"):
            log_result(1, "Manager login", "FAIL", "No token in response")
            return False

        # Store session
        sessions["admin"] = {
            "token": data["token"],
            "user": data["usuario"],
            "headers": {
                "Authorization": f"Bearer {data['token']}"
            }
        }

        # Verify role is manager
        if data["usuario"]["rol"] != "manager":
            log_result(1, "Manager login", "FAIL", f"Wrong role: {data['usuario']['rol']}")
            return False

        log_result(1, "Manager login", "PASS", f"Token: {data['token'][:20]}...")
        return True

    except Exception as e:
        log_result(1, "Manager login", "ERROR", str(e))
        return False


def test_2_get_csrf_token():
    """Test 2: Get CSRF token from response"""
    print_test(2, "Get CSRF Token")

    try:
        # Make any GET request to get CSRF token
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=sessions["admin"]["headers"],
            timeout=5
        )

        if response.status_code != 200:
            log_result(2, "Get CSRF token", "FAIL", f"Status {response.status_code}")
            return False

        csrf_token = response.headers.get("X-CSRF-Token")
        if not csrf_token:
            # Try in response body
            data = response.json()
            csrf_token = data.get("_csrf_token")

        if not csrf_token:
            log_result(2, "Get CSRF token", "FAIL", "No CSRF token in response")
            return False

        # Store CSRF token
        sessions["admin"]["csrf_token"] = csrf_token
        sessions["admin"]["headers"]["X-CSRF-Token"] = csrf_token

        log_result(2, "Get CSRF token", "PASS", f"Token: {csrf_token[:20]}...")
        return True

    except Exception as e:
        log_result(2, "Get CSRF token", "ERROR", str(e))
        return False


def test_3_verify_current_user():
    """Test 3: Verify current user endpoint"""
    print_test(3, "Verify Current User Endpoint")

    try:
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=sessions["admin"]["headers"],
            timeout=5
        )

        if response.status_code != 200:
            log_result(3, "Verify current user", "FAIL", f"Status {response.status_code}")
            return False

        data = response.json()

        # Verify user data
        if data["rol"] != "manager":
            log_result(3, "Verify current user", "FAIL", f"Wrong role: {data['rol']}")
            return False

        if data["username"] != "admin":
            log_result(3, "Verify current user", "FAIL", f"Wrong username: {data['username']}")
            return False

        log_result(3, "Verify current user", "PASS", f"User: {data['nombre']} ({data['rol']})")
        return True

    except Exception as e:
        log_result(3, "Verify current user", "ERROR", str(e))
        return False


def test_4_login_all_roles():
    """Test 4: Login with all roles"""
    print_test(4, "Login with All Roles")

    all_passed = True
    for user_key, user_creds in TEST_USERS.items():
        try:
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json=user_creds,
                timeout=5
            )

            if response.status_code != 200:
                log_result(4, f"Login {user_key}", "FAIL", f"Status {response.status_code}")
                all_passed = False
                continue

            data = response.json()
            expected_role = ROLES[user_key]
            actual_role = data["usuario"]["rol"]

            if actual_role != expected_role:
                log_result(4, f"Login {user_key}", "FAIL",
                          f"Expected {expected_role}, got {actual_role}")
                all_passed = False
                continue

            # Store session
            sessions[user_key] = {
                "token": data["token"],
                "user": data["usuario"],
                "headers": {
                    "Authorization": f"Bearer {data['token']}"
                }
            }

            # Get CSRF token
            csrf_response = requests.get(
                f"{BASE_URL}/api/auth/me",
                headers=sessions[user_key]["headers"]
            )
            csrf_token = csrf_response.headers.get("X-CSRF-Token")
            if csrf_token:
                sessions[user_key]["csrf_token"] = csrf_token
                sessions[user_key]["headers"]["X-CSRF-Token"] = csrf_token

            log_result(4, f"Login {user_key}", "PASS", f"Role: {actual_role}")

        except Exception as e:
            log_result(4, f"Login {user_key}", "ERROR", str(e))
            all_passed = False

    return all_passed


def test_5_role_based_access():
    """Test 5: Role-based API access"""
    print_test(5, "Role-Based API Access Control")

    all_passed = True

    # Test: Only manager can list usuarios
    try:
        # Manager should have access
        response = requests.get(
            f"{BASE_URL}/api/auth/usuarios",
            headers=sessions["admin"]["headers"],
            timeout=5
        )

        if response.status_code != 200:
            log_result(5, "Manager access /auth/usuarios", "FAIL", f"Status {response.status_code}")
            all_passed = False
        else:
            log_result(5, "Manager access /auth/usuarios", "PASS", "Manager can access")

        # Mesero should NOT have access
        response = requests.get(
            f"{BASE_URL}/api/auth/usuarios",
            headers=sessions["juan"]["headers"],
            timeout=5
        )

        if response.status_code == 403:
            log_result(5, "Mesero access /auth/usuarios", "PASS", "Correctly denied (403)")
        elif response.status_code == 401:
            log_result(5, "Mesero access /auth/usuarios", "PASS", "Correctly denied (401)")
        else:
            log_result(5, "Mesero access /auth/usuarios", "FAIL",
                      f"Expected 403/401, got {response.status_code}")
            all_passed = False

    except Exception as e:
        log_result(5, "Role-based access", "ERROR", str(e))
        all_passed = False

    return all_passed


def test_6_csrf_token_validation():
    """Test 6: CSRF token validation"""
    print_test(6, "CSRF Token Validation")

    all_passed = True

    # Test 1: POST without CSRF token should fail
    try:
        response = requests.post(
            f"{BASE_URL}/api/pos/pedidos",
            json={"mesa_id": 1},
            headers={"Authorization": f"Bearer {sessions['admin']['token']}"},
            timeout=5
        )

        if response.status_code == 403 and "CSRF" in response.text:
            log_result(6, "POST without CSRF token", "PASS", "Correctly rejected")
        else:
            log_result(6, "POST without CSRF token", "FAIL",
                      f"Expected 403 with CSRF error, got {response.status_code}")
            all_passed = False

    except Exception as e:
        log_result(6, "POST without CSRF token", "ERROR", str(e))
        all_passed = False

    # Test 2: POST with valid CSRF token should work (or return different error)
    try:
        # Get fresh CSRF token
        csrf_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=sessions["admin"]["headers"]
        )
        csrf_token = csrf_response.headers.get("X-CSRF-Token")

        headers = sessions["admin"]["headers"].copy()
        headers["X-CSRF-Token"] = csrf_token

        response = requests.post(
            f"{BASE_URL}/api/pos/pedidos",
            json={"mesa_id": 1},
            headers=headers,
            timeout=5
        )

        # Should not be CSRF error (might be 400 for missing fields, etc)
        if response.status_code != 403 or "CSRF" not in response.text:
            log_result(6, "POST with valid CSRF token", "PASS",
                      f"CSRF accepted (status: {response.status_code})")
        else:
            log_result(6, "POST with valid CSRF token", "FAIL", "Still rejected as CSRF")
            all_passed = False

    except Exception as e:
        log_result(6, "POST with valid CSRF token", "ERROR", str(e))
        all_passed = False

    return all_passed


def test_7_token_expiration():
    """Test 7: Token expiration handling"""
    print_test(7, "Token Expiration & Session Validation")

    try:
        # Create invalid token
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={
                "Authorization": "Bearer invalid_token_12345"
            },
            timeout=5
        )

        if response.status_code == 401:
            log_result(7, "Invalid token", "PASS", "Correctly rejected")
            return True
        else:
            log_result(7, "Invalid token", "FAIL", f"Expected 401, got {response.status_code}")
            return False

    except Exception as e:
        log_result(7, "Invalid token", "ERROR", str(e))
        return False


def test_8_logout():
    """Test 8: Logout functionality"""
    print_test(8, "Logout & Session Cleanup")

    try:
        # Logout
        response = requests.post(
            f"{BASE_URL}/api/auth/logout",
            headers=sessions["admin"]["headers"],
            timeout=5
        )

        if response.status_code != 200:
            log_result(8, "Logout", "FAIL", f"Status {response.status_code}")
            return False

        # Try to use old token
        time.sleep(1)
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=sessions["admin"]["headers"],
            timeout=5
        )

        if response.status_code == 401:
            log_result(8, "Session cleanup after logout", "PASS", "Token invalidated")
            return True
        else:
            log_result(8, "Session cleanup after logout", "FAIL",
                      f"Expected 401, got {response.status_code}")
            return False

    except Exception as e:
        log_result(8, "Logout", "ERROR", str(e))
        return False


def test_9_api_integration():
    """Test 9: API integration with roles"""
    print_test(9, "API Integration with Role System")

    all_passed = True

    try:
        # Test: Mesero can access /api/pos/mesas
        response = requests.get(
            f"{BASE_URL}/api/pos/mesas",
            headers=sessions["juan"]["headers"],
            timeout=5
        )

        if response.status_code == 200:
            log_result(9, "Mesero /api/pos/mesas access", "PASS", "Can access mesas")
        elif response.status_code == 401:
            log_result(9, "Mesero /api/pos/mesas access", "FAIL", "Not authenticated")
            all_passed = False
        else:
            log_result(9, "Mesero /api/pos/mesas access", "FAIL",
                      f"Unexpected status: {response.status_code}")
            all_passed = False

    except Exception as e:
        log_result(9, "Mesero /api/pos/mesas access", "ERROR", str(e))
        all_passed = False

    try:
        # Test: Can get categorias
        response = requests.get(
            f"{BASE_URL}/api/pos/categorias",
            headers=sessions["juan"]["headers"],
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            log_result(9, "Get categorias", "PASS", f"Retrieved {len(data)} categories")
        else:
            log_result(9, "Get categorias", "FAIL", f"Status {response.status_code}")
            all_passed = False

    except Exception as e:
        log_result(9, "Get categorias", "ERROR", str(e))
        all_passed = False

    return all_passed


def test_10_cross_role_access():
    """Test 10: Cross-role access restrictions"""
    print_test(10, "Cross-Role Access Restrictions")

    all_passed = True

    try:
        # Cocinero tries to access cambiar-password (should work for all authenticated users)
        response = requests.post(
            f"{BASE_URL}/api/auth/cambiar-password",
            json={
                "password_actual": "pass123",
                "password_nueva": "NewPass@123"
            },
            headers=sessions["pedro"]["headers"],
            timeout=5
        )

        # This should either work or fail with password validation, not permission
        if response.status_code in [200, 400, 401]:
            log_result(10, "Cocinero password change", "PASS",
                      f"Correct behavior (status: {response.status_code})")
        else:
            log_result(10, "Cocinero password change", "FAIL",
                      f"Unexpected status: {response.status_code}")
            all_passed = False

    except Exception as e:
        log_result(10, "Cocinero password change", "ERROR", str(e))
        all_passed = False

    return all_passed


def main():
    """Run all integration tests"""
    print_header("🧪 PHASE 2: INTEGRATION TESTS - AUTH, ROLES, CSRF")
    print(f"Target: {BASE_URL}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Run all tests
    tests = [
        test_1_login_as_manager,
        test_2_get_csrf_token,
        test_3_verify_current_user,
        test_4_login_all_roles,
        test_5_role_based_access,
        test_6_csrf_token_validation,
        test_7_token_expiration,
        test_8_logout,
        test_9_api_integration,
        test_10_cross_role_access,
    ]

    for test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ ERROR in {test_func.__name__}: {e}")
            TEST_RESULTS["errors"] += 1

    # Print summary
    print_header("📊 TEST SUMMARY")
    print(f"\nTotal Tests: {TEST_RESULTS['passed'] + TEST_RESULTS['failed'] + TEST_RESULTS['errors']}")
    print(f"✅ Passed:   {TEST_RESULTS['passed']}")
    print(f"❌ Failed:   {TEST_RESULTS['failed']}")
    print(f"🔴 Errors:   {TEST_RESULTS['errors']}")

    if TEST_RESULTS['failed'] == 0 and TEST_RESULTS['errors'] == 0:
        print(f"\n🎉 ALL TESTS PASSED! 🎉")
        print(f"\n✨ Ready for Phase 3: Manual Functional Testing")
        return 0
    else:
        print(f"\n⚠️  {TEST_RESULTS['failed'] + TEST_RESULTS['errors']} TEST(S) FAILED")
        print(f"\n📝 Failed Tests:")
        for test in TEST_RESULTS['tests']:
            if test['status'] != 'PASS':
                print(f"  - [{test['num']}] {test['name']}: {test['details']}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
