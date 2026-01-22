"""
Encryption utilities for storing sensitive user data.

Uses Fernet symmetric encryption for storing Kalshi API credentials.
"""

import base64
import hashlib
import secrets
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _get_fernet() -> Optional[Fernet]:
    """Get Fernet instance from encryption key."""
    if not settings.encryption_key:
        return None

    # Derive a 32-byte key from the encryption_key setting
    # This allows using any string as the key
    key_bytes = hashlib.sha256(settings.encryption_key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_value(value: str) -> Optional[str]:
    """
    Encrypt a string value.

    Args:
        value: Plain text value to encrypt

    Returns:
        Base64-encoded encrypted value, or None if encryption not configured
    """
    fernet = _get_fernet()
    if not fernet:
        return None

    encrypted = fernet.encrypt(value.encode())
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_value(encrypted_value: str) -> Optional[str]:
    """
    Decrypt an encrypted value.

    Args:
        encrypted_value: Base64-encoded encrypted value

    Returns:
        Decrypted plain text, or None if decryption fails
    """
    fernet = _get_fernet()
    if not fernet:
        return None

    try:
        encrypted_bytes = base64.urlsafe_b64decode(encrypted_value.encode())
        decrypted = fernet.decrypt(encrypted_bytes)
        return decrypted.decode()
    except (InvalidToken, ValueError):
        return None


def generate_encryption_key() -> str:
    """
    Generate a new random encryption key.

    Returns:
        Base64-encoded 32-byte key suitable for ENCRYPTION_KEY setting
    """
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


def is_encryption_configured() -> bool:
    """Check if encryption is properly configured."""
    return bool(settings.encryption_key)
