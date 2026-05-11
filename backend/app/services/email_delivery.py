from __future__ import annotations

from email.message import EmailMessage
import logging
import smtplib
import ssl

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email_change_code(*, to_email: str, code: str) -> str:
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning("Email change code for %s: %s", to_email, code)
        return "log"

    message = EmailMessage()
    message["Subject"] = "MakeLayer email confirmation"
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "Your MakeLayer confirmation code:",
                "",
                code,
                "",
                "The code expires in 15 minutes.",
            ]
        )
    )

    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
            client.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    else:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as client:
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    return "smtp"
