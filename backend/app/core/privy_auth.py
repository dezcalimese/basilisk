"""Privy JWT authentication for FastAPI."""

from datetime import datetime
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.db.models import User

# Security scheme for Bearer token authentication
security = HTTPBearer(auto_error=False)


class PrivyUser(BaseModel):
    """Privy user data extracted from JWT."""

    privy_user_id: str
    wallet_address: Optional[str] = None
    email: Optional[str] = None
    created_at: Optional[datetime] = None


class AuthenticatedUser(BaseModel):
    """Authenticated user with database record."""

    id: int
    privy_user_id: str
    wallet_address: Optional[str] = None
    email: Optional[str] = None


def verify_privy_token(token: str) -> PrivyUser:
    """
    Verify a Privy JWT token and extract user information.

    Privy JWTs are signed with ES256 (ECDSA with P-256 curve).
    The verification key is the public key from your Privy dashboard.
    """
    if not settings.privy_verification_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Privy verification key not configured",
        )

    try:
        # Decode and verify the JWT
        # Privy tokens use ES256 algorithm
        payload = jwt.decode(
            token,
            settings.privy_verification_key,
            algorithms=["ES256"],
            audience=settings.privy_app_id,
            issuer="privy.io",
        )

        # Extract user information from the token
        privy_user_id = payload.get("sub")
        if not privy_user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )

        # Extract linked accounts
        linked_accounts = payload.get("linked_accounts", [])

        # Find wallet address
        wallet_address = None
        for account in linked_accounts:
            if account.get("type") == "wallet" and account.get("chain_type") == "solana":
                wallet_address = account.get("address")
                break

        # Find email
        email = None
        for account in linked_accounts:
            if account.get("type") == "email":
                email = account.get("address")
                break

        # Parse creation time
        created_at = None
        if "iat" in payload:
            created_at = datetime.fromtimestamp(payload["iat"])

        return PrivyUser(
            privy_user_id=privy_user_id,
            wallet_address=wallet_address,
            email=email,
            created_at=created_at,
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
        )
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_or_create_user(
    privy_user: PrivyUser,
    db: AsyncSession,
) -> User:
    """Get existing user or create a new one based on Privy ID."""
    from sqlalchemy import select

    # Try to find existing user
    result = await db.execute(
        select(User).where(User.privy_user_id == privy_user.privy_user_id)
    )
    user = result.scalar_one_or_none()

    if user:
        # Update wallet address if changed
        if privy_user.wallet_address and user.wallet_address != privy_user.wallet_address:
            user.wallet_address = privy_user.wallet_address
            user.updated_at = datetime.utcnow()

        # Update last login
        user.last_login_at = datetime.utcnow()
        await db.commit()
        return user

    # Create new user
    user = User(
        privy_user_id=privy_user.privy_user_id,
        wallet_address=privy_user.wallet_address,
        email=privy_user.email,
        last_login_at=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency to get the current authenticated user.

    Usage:
        @router.get("/protected")
        async def protected_endpoint(user: User = Depends(get_current_user)):
            return {"user_id": user.id}
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    privy_user = verify_privy_token(credentials.credentials)
    user = await get_or_create_user(privy_user, db)
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    FastAPI dependency to get the current user if authenticated, or None.

    Usage:
        @router.get("/public")
        async def public_endpoint(user: Optional[User] = Depends(get_current_user_optional)):
            if user:
                return {"message": f"Hello, {user.wallet_address}!"}
            return {"message": "Hello, anonymous!"}
    """
    if credentials is None:
        return None

    try:
        privy_user = verify_privy_token(credentials.credentials)
        return await get_or_create_user(privy_user, db)
    except HTTPException:
        return None
