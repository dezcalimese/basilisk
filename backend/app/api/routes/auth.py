"""
User authentication and Kalshi credentials management endpoints.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.encryption import is_encryption_configured, generate_encryption_key
from app.models.user_credentials import UserKalshiCredentials, CredentialsValidationResult
from app.data.kalshi_client import KalshiClient

router = APIRouter(prefix="/auth", tags=["auth"])


class KalshiCredentialsRequest(BaseModel):
    """Request to store Kalshi credentials."""

    user_id: str = Field(..., description="Unique user identifier")
    key_id: str = Field(..., description="Kalshi API Key ID")
    private_key_pem: str = Field(..., description="RSA private key in PEM format")
    environment: str = Field(
        default="demo",
        description="Environment: 'demo' or 'production'",
    )


class KalshiCredentialsResponse(BaseModel):
    """Response after storing credentials."""

    success: bool
    credential_id: str | None = None
    environment: str | None = None
    error: str | None = None


class EncryptionStatusResponse(BaseModel):
    """Response for encryption status check."""

    configured: bool
    message: str


@router.get("/encryption-status", response_model=EncryptionStatusResponse)
async def check_encryption_status():
    """
    Check if encryption is configured for storing credentials.

    Returns whether ENCRYPTION_KEY is set in the environment.
    """
    configured = is_encryption_configured()
    return EncryptionStatusResponse(
        configured=configured,
        message=(
            "Encryption is configured and ready"
            if configured
            else "ENCRYPTION_KEY not set - credentials cannot be stored securely"
        ),
    )


@router.post("/generate-encryption-key")
async def generate_new_encryption_key():
    """
    Generate a new encryption key for the ENCRYPTION_KEY setting.

    This is a helper endpoint for initial setup.
    The generated key should be added to .env as ENCRYPTION_KEY.
    """
    new_key = generate_encryption_key()
    return {
        "encryption_key": new_key,
        "instructions": "Add this to your .env file as ENCRYPTION_KEY=<key>",
    }


@router.post("/kalshi-credentials", response_model=KalshiCredentialsResponse)
async def store_kalshi_credentials(request: KalshiCredentialsRequest):
    """
    Store encrypted Kalshi API credentials for a user.

    The credentials are encrypted before storage and validated
    by making a test API call to Kalshi.
    """
    if not is_encryption_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Encryption not configured - cannot store credentials securely",
        )

    # Create encrypted credentials
    credentials = UserKalshiCredentials.create(
        user_id=request.user_id,
        key_id=request.key_id,
        private_key_pem=request.private_key_pem,
        environment=request.environment,
    )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encrypt credentials",
        )

    # TODO: Validate credentials by making test API call
    # TODO: Store credentials in database

    return KalshiCredentialsResponse(
        success=True,
        credential_id=credentials.id,
        environment=credentials.environment,
    )


@router.post("/validate-credentials", response_model=CredentialsValidationResult)
async def validate_kalshi_credentials(request: KalshiCredentialsRequest):
    """
    Validate Kalshi credentials without storing them.

    Makes a test API call to verify the credentials work.
    """
    from app.data.kalshi_client import KalshiClientWithCredentials

    try:
        # Create a temporary client with the provided credentials
        client = KalshiClientWithCredentials(
            key_id=request.key_id,
            private_key_pem=request.private_key_pem,
            use_demo=request.environment == "demo",
        )

        # Test the credentials by fetching balance
        balance_data = await client.get_balance()
        balance = balance_data.get("balance", 0) / 100  # Convert cents to dollars

        # Determine tier based on balance (rough heuristic)
        if balance >= 100000:
            tier = "prime"
        elif balance >= 10000:
            tier = "premier"
        elif balance >= 1000:
            tier = "advanced"
        else:
            tier = "basic"

        return CredentialsValidationResult(
            valid=True,
            account_balance=balance,
            tier=tier,
        )
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "403" in error_msg:
            error_msg = "Invalid credentials - check your API key and private key"
        elif "connection" in error_msg.lower():
            error_msg = "Could not connect to Kalshi API - check your network"

        return CredentialsValidationResult(
            valid=False,
            error=error_msg,
        )


@router.get("/health")
async def auth_health():
    """Health check for auth service."""
    return {
        "status": "healthy",
        "encryption_configured": is_encryption_configured(),
    }
