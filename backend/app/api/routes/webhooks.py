"""Webhook routes for Telegram and other external services."""

import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

# Global bot instance (initialized on startup)
_telegram_bot = None


def set_telegram_bot(bot) -> None:
    """Set the global Telegram bot instance."""
    global _telegram_bot
    _telegram_bot = bot


def get_telegram_bot():
    """Get the global Telegram bot instance."""
    return _telegram_bot


def verify_telegram_signature(request_body: bytes, signature: str) -> bool:
    """
    Verify Telegram webhook signature.

    Args:
        request_body: Raw request body
        signature: X-Telegram-Bot-Api-Secret-Token header

    Returns:
        True if signature is valid
    """
    if not settings.telegram_webhook_secret:
        # No secret configured, skip verification (not recommended for production)
        return True

    return hmac.compare_digest(signature, settings.telegram_webhook_secret)


@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Receive Telegram bot updates via webhook.

    This endpoint should be registered with Telegram using:
    https://api.telegram.org/bot<token>/setWebhook?url=<your_url>/api/v1/webhooks/telegram
    """
    # Verify webhook secret if configured
    signature = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    body = await request.body()

    if not verify_telegram_signature(body, signature):
        logger.warning("Invalid Telegram webhook signature")
        raise HTTPException(status_code=403, detail="Invalid signature")

    bot = get_telegram_bot()
    if not bot or not bot.app:
        logger.warning("Telegram bot not initialized")
        raise HTTPException(status_code=503, detail="Bot not available")

    try:
        # Parse the update
        import json
        from telegram import Update

        update_data = json.loads(body)
        update = Update.de_json(update_data, bot.app.bot)

        if update:
            # Process the update
            await bot.app.process_update(update)

        return {"ok": True}

    except Exception as e:
        logger.error(f"Error processing Telegram update: {e}")
        # Return 200 to prevent Telegram from retrying
        return {"ok": False, "error": str(e)}


@router.get("/telegram/info")
async def telegram_webhook_info() -> dict:
    """
    Get Telegram webhook information.

    Returns current webhook URL and pending update count.
    """
    bot = get_telegram_bot()
    if not bot or not bot.app:
        raise HTTPException(status_code=503, detail="Bot not available")

    try:
        info = await bot.app.bot.get_webhook_info()
        return {
            "url": info.url,
            "has_custom_certificate": info.has_custom_certificate,
            "pending_update_count": info.pending_update_count,
            "last_error_date": info.last_error_date,
            "last_error_message": info.last_error_message,
            "max_connections": info.max_connections,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/set-webhook")
async def set_telegram_webhook(webhook_url: str) -> dict:
    """
    Set the Telegram webhook URL.

    Args:
        webhook_url: Full URL for the webhook endpoint
    """
    bot = get_telegram_bot()
    if not bot or not bot.app:
        raise HTTPException(status_code=503, detail="Bot not available")

    try:
        success = await bot.app.bot.set_webhook(
            url=webhook_url,
            secret_token=settings.telegram_webhook_secret if settings.telegram_webhook_secret else None,
        )
        return {"success": success, "webhook_url": webhook_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/delete-webhook")
async def delete_telegram_webhook() -> dict:
    """
    Delete the Telegram webhook (switch to polling mode).
    """
    bot = get_telegram_bot()
    if not bot or not bot.app:
        raise HTTPException(status_code=503, detail="Bot not available")

    try:
        success = await bot.app.bot.delete_webhook()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
