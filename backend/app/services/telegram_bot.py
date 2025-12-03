"""Telegram bot for Basilisk trading signals and execution."""

import logging
from typing import Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


class BasiliskBot:
    """Telegram bot for trading signals and execution."""

    def __init__(
        self,
        signal_service,
        trade_service,
    ) -> None:
        """
        Initialize the Basilisk Telegram bot.

        Args:
            signal_service: Service for fetching signals
            trade_service: Service for executing trades
        """
        self.signal_service = signal_service
        self.trade_service = trade_service
        self.app: Optional[Application] = None

        if settings.telegram_bot_token:
            self.app = Application.builder().token(settings.telegram_bot_token).build()
            self._register_handlers()

    def _register_handlers(self) -> None:
        """Register command and callback handlers."""
        if not self.app:
            return

        self.app.add_handler(CommandHandler("start", self.cmd_start))
        self.app.add_handler(CommandHandler("help", self.cmd_help))
        self.app.add_handler(CommandHandler("signals", self.cmd_signals))
        self.app.add_handler(CommandHandler("signal", self.cmd_signal_detail))
        self.app.add_handler(CommandHandler("trade", self.cmd_trade))
        self.app.add_handler(CommandHandler("positions", self.cmd_positions))
        self.app.add_handler(CommandHandler("pnl", self.cmd_pnl))
        self.app.add_handler(CommandHandler("settings", self.cmd_settings))
        self.app.add_handler(CommandHandler("alerts", self.cmd_alerts))
        self.app.add_handler(CallbackQueryHandler(self.handle_callback))

    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /start command - onboarding."""
        if not update.message:
            return

        chat_id = update.effective_chat.id if update.effective_chat else None

        welcome_text = (
            "*Welcome to Basilisk* \n\n"
            "I help you find and trade mispriced binary options on Kalshi.\n\n"
            "*Quick Start:*\n"
            "/signals - View current high-EV opportunities\n"
            "/positions - Check your open positions\n"
            "/pnl - See your P&L summary\n"
            "/help - Full command reference\n\n"
            f"Your chat ID: `{chat_id}`\n"
            "_Add this to your settings to receive alerts._"
        )

        await update.message.reply_text(welcome_text, parse_mode="Markdown")

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /help command."""
        if not update.message:
            return

        help_text = (
            "*Basilisk Commands*\n\n"
            "*Signals & Trading*\n"
            "/signals - Current high-EV opportunities (top 5)\n"
            "/signal <id> - Detailed view of specific signal\n"
            "/trade <id> <size> - Execute trade from signal\n\n"
            "*Positions & P&L*\n"
            "/positions - Active positions with live P&L\n"
            "/pnl - Today's P&L summary\n"
            "/pnl week - Weekly P&L\n"
            "/pnl all - All-time P&L\n\n"
            "*Settings*\n"
            "/settings - View current alert settings\n"
            "/alerts on - Enable notifications\n"
            "/alerts off - Disable notifications\n\n"
            "_Tap the Trade button on any signal to start a trade._"
        )

        await update.message.reply_text(help_text, parse_mode="Markdown")

    async def cmd_signals(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /signals command - show current high-EV signals."""
        if not update.message:
            return

        try:
            signals = await self.signal_service.get_active_signals(limit=5)

            if not signals:
                await update.message.reply_text(
                    " No active signals right now.\n"
                    "_Check back later or lower your EV threshold._",
                    parse_mode="Markdown",
                )
                return

            for signal in signals:
                keyboard = [
                    [
                        InlineKeyboardButton(
                            f" Trade {signal.direction}",
                            callback_data=f"trade:{signal.id}",
                        )
                    ]
                ]

                # Format time to expiry
                hours = signal.time_to_expiry_hours or 0
                if hours < 1:
                    time_str = f"{int(hours * 60)}m"
                else:
                    time_str = f"{hours:.1f}h"

                message = (
                    f"*{signal.asset}* {signal.direction} @ ${signal.strike:,.0f}\n"
                    f"EV: *{signal.ev:.1%}* | Confidence: {signal.confidence:.0%}\n"
                    f"Expires: {time_str}\n"
                    f"Edge: {signal.edge:+.1%}"
                )

                await update.message.reply_text(
                    message,
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                )

        except Exception as e:
            logger.error(f"Error fetching signals: {e}")
            await update.message.reply_text(
                " Error fetching signals. Please try again.",
            )

    async def cmd_signal_detail(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """Handle /signal <id> command - show detailed signal info."""
        if not update.message:
            return

        if not context.args:
            await update.message.reply_text("Usage: /signal <signal_id>")
            return

        try:
            signal_id = int(context.args[0])
            signal = await self.signal_service.get_signal(signal_id)

            if not signal:
                await update.message.reply_text(f"Signal {signal_id} not found.")
                return

            keyboard = [
                [
                    InlineKeyboardButton(
                        f" Trade {signal.direction}",
                        callback_data=f"trade:{signal.id}",
                    )
                ]
            ]

            message = (
                f"*Signal #{signal.id}*\n\n"
                f"*Asset:* {signal.asset}\n"
                f"*Direction:* {signal.direction}\n"
                f"*Strike:* ${signal.strike:,.0f}\n"
                f"*Ticker:* `{signal.ticker}`\n\n"
                f"*Expected Value:* {signal.ev:.2%}\n"
                f"*Edge:* {signal.edge:+.2%}\n"
                f"*Confidence:* {signal.confidence:.0%}\n\n"
                f"*Market Price:* {signal.market_price:.0f}\n"
                f"*Model Price:* {signal.model_price:.0f}\n"
                f"*Time to Expiry:* {signal.time_to_expiry_hours:.1f}h"
            )

            await update.message.reply_text(
                message,
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(keyboard),
            )

        except ValueError:
            await update.message.reply_text("Invalid signal ID. Use a number.")
        except Exception as e:
            logger.error(f"Error fetching signal detail: {e}")
            await update.message.reply_text(" Error fetching signal details.")

    async def cmd_trade(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /trade <signal_id> <size> command."""
        if not update.message:
            return

        if len(context.args or []) != 2:
            await update.message.reply_text(
                "Usage: /trade <signal_id> <contracts>\n"
                "Example: /trade 42 5"
            )
            return

        try:
            signal_id = int(context.args[0])
            size = int(context.args[1])

            if size < 1 or size > 1000:
                await update.message.reply_text("Contract size must be between 1 and 1000.")
                return

            # Show confirmation
            signal = await self.signal_service.get_signal(signal_id)
            if not signal:
                await update.message.reply_text(f"Signal {signal_id} not found.")
                return

            estimated_cost = signal.market_price * size / 100

            keyboard = [
                [
                    InlineKeyboardButton(
                        " Confirm",
                        callback_data=f"confirm:{signal_id}:{size}",
                    ),
                    InlineKeyboardButton(
                        " Cancel",
                        callback_data="cancel",
                    ),
                ]
            ]

            await update.message.reply_text(
                f"*Confirm Trade*\n\n"
                f"Signal: #{signal_id}\n"
                f"{signal.asset} {signal.direction} @ ${signal.strike:,.0f}\n"
                f"Contracts: {size}\n"
                f"Est. Cost: ${estimated_cost:.2f}\n\n"
                f"_This will place a market order._",
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(keyboard),
            )

        except ValueError:
            await update.message.reply_text("Invalid input. Use numbers for signal_id and size.")
        except Exception as e:
            logger.error(f"Error preparing trade: {e}")
            await update.message.reply_text(" Error preparing trade.")

    async def cmd_positions(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /positions command - show open positions."""
        if not update.message:
            return

        try:
            positions = await self.trade_service.get_open_positions()

            if not positions:
                await update.message.reply_text(
                    " No open positions.\n"
                    "_Use /signals to find trading opportunities._",
                    parse_mode="Markdown",
                )
                return

            for pos in positions:
                pnl_str = f"${pos.unrealized_pnl:+.2f}" if pos.unrealized_pnl else "N/A"
                pnl_emoji = "" if (pos.unrealized_pnl or 0) >= 0 else ""

                keyboard = [
                    [
                        InlineKeyboardButton(
                            " Close",
                            callback_data=f"close:{pos.trade_id}",
                        )
                    ]
                ]

                message = (
                    f"*{pos.asset}* {pos.direction} @ ${pos.strike:,.0f}\n"
                    f"Contracts: {pos.contracts}\n"
                    f"Entry: ${pos.entry_price:.2f}\n"
                    f"Current: ${pos.current_price:.2f if pos.current_price else 'N/A'}\n"
                    f"P&L: {pnl_emoji} {pnl_str}"
                )

                await update.message.reply_text(
                    message,
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                )

        except Exception as e:
            logger.error(f"Error fetching positions: {e}")
            await update.message.reply_text(" Error fetching positions.")

    async def cmd_pnl(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /pnl command - show P&L summary."""
        if not update.message:
            return

        period = "today"
        if context.args:
            period = context.args[0].lower()
            if period not in ("today", "week", "all"):
                await update.message.reply_text(
                    "Usage: /pnl [today|week|all]\n"
                    "Default: today"
                )
                return

        try:
            summary = await self.trade_service.get_pnl_summary(period)

            pnl_emoji = "" if summary["net_pnl"] >= 0 else ""
            period_label = {"today": "Today", "week": "This Week", "all": "All Time"}[period]

            message = (
                f"*P&L Summary - {period_label}*\n\n"
                f"{pnl_emoji} Net P&L: *${summary['net_pnl']:+.2f}*\n"
                f" Fees: ${summary['total_fees']:.2f}\n\n"
                f" Trades: {summary['trade_count']}\n"
                f" Wins: {summary['wins']}\n"
                f" Losses: {summary['losses']}\n"
                f" Win Rate: {summary['win_rate']:.0%}"
            )

            await update.message.reply_text(message, parse_mode="Markdown")

        except Exception as e:
            logger.error(f"Error fetching P&L: {e}")
            await update.message.reply_text(" Error fetching P&L summary.")

    async def cmd_settings(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /settings command."""
        if not update.message:
            return

        # TODO: Fetch from UserPreferences
        await update.message.reply_text(
            "*Alert Settings*\n\n"
            "Min EV Threshold: 5%\n"
            "Assets: BTC, ETH, XRP\n"
            "Alerts: Enabled\n\n"
            "_Use /alerts on|off to toggle notifications._",
            parse_mode="Markdown",
        )

    async def cmd_alerts(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /alerts command."""
        if not update.message:
            return

        if not context.args:
            await update.message.reply_text("Usage: /alerts on|off")
            return

        action = context.args[0].lower()
        if action == "on":
            # TODO: Update UserPreferences
            await update.message.reply_text(" Alerts enabled!")
        elif action == "off":
            # TODO: Update UserPreferences
            await update.message.reply_text(" Alerts disabled.")
        else:
            await update.message.reply_text("Usage: /alerts on|off")

    async def handle_callback(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        """Handle inline button callbacks."""
        query = update.callback_query
        if not query or not query.data:
            return

        await query.answer()

        parts = query.data.split(":")
        action = parts[0]

        if action == "trade":
            signal_id = parts[1]
            await query.message.reply_text(
                f"Enter trade size:\n`/trade {signal_id} <contracts>`",
                parse_mode="Markdown",
            )

        elif action == "confirm":
            signal_id = int(parts[1])
            size = int(parts[2])

            await query.message.reply_text(" Executing trade...")

            try:
                result = await self.trade_service.execute_from_signal(
                    signal_id=signal_id,
                    contracts=size,
                )

                if result.success:
                    await query.message.reply_text(
                        f" *Trade Executed*\n\n"
                        f"Filled: {result.filled} contracts\n"
                        f"Price: ${result.price:.2f}\n"
                        f"Cost: ${result.cost:.2f}",
                        parse_mode="Markdown",
                    )
                else:
                    await query.message.reply_text(
                        f" Trade failed: {result.error}",
                    )

            except Exception as e:
                logger.error(f"Trade execution error: {e}")
                await query.message.reply_text(f" Error: {e}")

        elif action == "close":
            trade_id = int(parts[1])

            await query.message.reply_text(" Closing position...")

            try:
                result = await self.trade_service.close_position(trade_id)

                if result.success:
                    pnl_emoji = "" if (result.cost or 0) >= 0 else ""
                    await query.message.reply_text(
                        f" *Position Closed*\n\n"
                        f"Filled: {result.filled} contracts\n"
                        f"Exit Price: ${result.price:.2f}\n"
                        f"P&L: {pnl_emoji} ${result.cost:+.2f}",
                        parse_mode="Markdown",
                    )
                else:
                    await query.message.reply_text(
                        f" Close failed: {result.error}",
                    )

            except Exception as e:
                logger.error(f"Close position error: {e}")
                await query.message.reply_text(f" Error: {e}")

        elif action == "cancel":
            await query.message.reply_text(" Trade cancelled.")

    async def send_signal_alert(self, chat_id: str, signal) -> bool:
        """
        Send a signal alert to a user.

        Args:
            chat_id: Telegram chat ID
            signal: Signal object

        Returns:
            True if sent successfully
        """
        if not self.app:
            return False

        try:
            keyboard = [
                [
                    InlineKeyboardButton(
                        f" Trade {signal.direction}",
                        callback_data=f"trade:{signal.id}",
                    )
                ]
            ]

            message = (
                f" *New Signal*\n\n"
                f"*{signal.asset}* {signal.direction} @ ${signal.strike:,.0f}\n"
                f"EV: *{signal.ev:.1%}* | Edge: {signal.edge:+.1%}\n"
                f"Confidence: {signal.confidence:.0%}"
            )

            await self.app.bot.send_message(
                chat_id=chat_id,
                text=message,
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send alert to {chat_id}: {e}")
            return False

    async def send_fill_alert(self, chat_id: str, trade) -> bool:
        """Send trade fill notification."""
        if not self.app:
            return False

        try:
            message = (
                f" *Trade Filled*\n\n"
                f"{trade.asset} {trade.direction} @ ${trade.strike:,.0f}\n"
                f"Filled: {trade.filled_contracts} contracts\n"
                f"Price: ${trade.entry_price:.2f}"
            )

            await self.app.bot.send_message(
                chat_id=chat_id,
                text=message,
                parse_mode="Markdown",
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send fill alert to {chat_id}: {e}")
            return False

    async def send_settlement_alert(self, chat_id: str, trade, won: bool) -> bool:
        """Send settlement result notification."""
        if not self.app:
            return False

        try:
            emoji = "" if won else ""
            result = "WON" if won else "LOST"

            message = (
                f"{emoji} *Settlement: {result}*\n\n"
                f"{trade.asset} {trade.direction} @ ${trade.strike:,.0f}\n"
                f"P&L: ${trade.pnl:+.2f}"
            )

            await self.app.bot.send_message(
                chat_id=chat_id,
                text=message,
                parse_mode="Markdown",
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send settlement alert to {chat_id}: {e}")
            return False

    async def start_polling(self) -> None:
        """Start the bot in polling mode (for development)."""
        if self.app:
            await self.app.run_polling()

    async def start_webhook(self, webhook_url: str) -> None:
        """Start the bot in webhook mode (for production)."""
        if self.app:
            await self.app.bot.set_webhook(webhook_url)
