"""
Модуль отправки email‑уведомлений.

Функция send_email():
- Формирует письмо в зависимости от типа (активация или восстановление пароля)
- Генерирует ссылку с токеном
- Рендерит HTML‑шаблон
- Отправляет письмо через Flask‑Mail

Используется при:
- регистрации пользователя
- восстановлении пароля
"""

from flask_mail import Message
from flask import url_for, render_template
from extensions import mail

def send_email(email, token, email_type, first_name=None):
    """
    Отправка письма пользователю.

    :param email: адрес получателя
    :param token: токен подтверждения
    :param email_type: тип письма ("activation" или "reset")
    :param first_name: имя пользователя (необязательно)
    """

    # Если имя не передано — используем пустую строку
    if not first_name:
        first_name = ""

    # ================= АКТИВАЦИЯ АККАУНТА =================
    if email_type == "activation":
        link = url_for("activate", token=token, _external=True)
        subject = "Активация учетной записи"

        html = render_template(
            "email/activation.html",
            link=link,
            first_name=first_name
        )

        text = (
            f"Здравствуйте, {first_name}!\n\n"
            f"Для завершения регистрации перейдите по ссылке:\n{link}"
        )

    # ================= ВОССТАНОВЛЕНИЕ ПАРОЛЯ =================
    elif email_type == "reset":
        link = url_for("reset_password", token=token, _external=True)
        subject = "Восстановление пароля"

        html = render_template(
            "email/reset.html",
            link=link,
            first_name=first_name
        )

        text = (
            f"Здравствуйте, {first_name}!\n\n"
            f"Для восстановления пароля перейдите по ссылке:\n{link}"
        )

    # Если передан неизвестный тип письма — ничего не делаем
    else:
        return

    # Создание сообщения
    msg = Message(
        subject=subject,
        recipients=[email],
        body=text,
        html=html
    )

    # Отправка письма
    mail.send(msg)