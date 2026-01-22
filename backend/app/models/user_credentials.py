"""
User Kalshi credentials model.

Stores encrypted API credentials for multi-user support.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from app.core.encryption import encrypt_value, decrypt_value


class UserKalshiCredentials(BaseModel):
    """Encrypted Kalshi API credentials for a user."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    encrypted_key_id: str
    encrypted_private_key_pem: str
    environment: str = "demo"  # "demo" or "production"
    tier: str = "basic"  # basic, advanced, premier, prime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None
    is_active: bool = True

    @classmethod
    def create(
        cls,
        user_id: str,
        key_id: str,
        private_key_pem: str,
        environment: str = "demo",
    ) -> Optional["UserKalshiCredentials"]:
        """
        Create encrypted credentials for a user.

        Args:
            user_id: Unique user identifier
            key_id: Kalshi API Key ID
            private_key_pem: RSA private key in PEM format
            environment: "demo" or "production"

        Returns:
            UserKalshiCredentials instance, or None if encryption fails
        """
        encrypted_key_id = encrypt_value(key_id)
        encrypted_private_key = encrypt_value(private_key_pem)

        if not encrypted_key_id or not encrypted_private_key:
            return None

        return cls(
            user_id=user_id,
            encrypted_key_id=encrypted_key_id,
            encrypted_private_key_pem=encrypted_private_key,
            environment=environment,
        )

    def get_key_id(self) -> Optional[str]:
        """Decrypt and return the API Key ID."""
        return decrypt_value(self.encrypted_key_id)

    def get_private_key_pem(self) -> Optional[str]:
        """Decrypt and return the private key PEM."""
        return decrypt_value(self.encrypted_private_key_pem)

    def update_last_used(self) -> None:
        """Update the last_used_at timestamp."""
        self.last_used_at = datetime.utcnow()


class CredentialsValidationResult(BaseModel):
    """Result of validating Kalshi credentials."""

    valid: bool
    error: Optional[str] = None
    account_balance: Optional[float] = None
    tier: Optional[str] = None
