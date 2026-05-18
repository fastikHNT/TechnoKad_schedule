from flask_mail import Message
from extensions import mail

def send_activation_email(email, token):

    link = f"http://127.0.0.1:5000/activate/{token}"

    msg = Message(
        subject="Подтверждение регистрации",
        recipients=[email]
    )

    msg.body = f"""
Для завершения регистрации перейдите по ссылке:

{link}
"""

    mail.send(msg)
