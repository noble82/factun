"""
CSRF Token protection module for Sistema POS
Provides functions to generate, store, and validate CSRF tokens
"""

import secrets
import hashlib
import json
from datetime import datetime, timedelta
import os

# CSRF tokens store in memory (in production, use Redis or database)
# Format: {token: (timestamp, ip_address, user_id)}
_csrf_tokens = {}
CSRF_TOKEN_EXPIRY = 3600  # 1 hour


def generate_csrf_token():
    """
    Generates a new CSRF token using secure random bytes.

    Returns:
        str: A secure CSRF token
    """
    token = secrets.token_urlsafe(32)
    timestamp = datetime.now()
    _csrf_tokens[token] = timestamp

    # Clean up expired tokens every 100 generations
    if len(_csrf_tokens) % 100 == 0:
        _cleanup_expired_tokens()

    return token


def validate_csrf_token(token):
    """
    Validates a CSRF token.

    Args:
        token (str): The CSRF token to validate

    Returns:
        tuple: (is_valid, message)
    """
    if not token:
        return False, "CSRF token is missing"

    if token not in _csrf_tokens:
        return False, "CSRF token is invalid"

    token_time = _csrf_tokens[token]
    age_seconds = (datetime.now() - token_time).total_seconds()

    if age_seconds > CSRF_TOKEN_EXPIRY:
        del _csrf_tokens[token]
        return False, "CSRF token has expired"

    # Allow token reuse within 5 seconds to handle rapid requests
    # This prevents 403 errors when buttons are double-clicked
    # or when both mobile/desktop buttons trigger simultaneously
    REUSE_WINDOW = 5  # seconds
    if age_seconds > REUSE_WINDOW:
        # Token older than 5 seconds - consume it (one-time use)
        del _csrf_tokens[token]
    # If within reuse window, don't delete - allow reuse

    return True, ""


def _cleanup_expired_tokens():
    """Removes expired tokens from the store."""
    cutoff_time = datetime.now() - timedelta(seconds=CSRF_TOKEN_EXPIRY)
    expired = [token for token, time in _csrf_tokens.items() if time < cutoff_time]
    for token in expired:
        del _csrf_tokens[token]
