"""
Конфигурационный файл приложения.

Содержит:
- секретный ключ Flask
- параметры подключения к базе данных
- настройки cookies для remember-me
- параметры SMTP‑почты (для отправки уведомлений и системных писем)

Класс Config используется Flask при инициализации приложения
"""

import datetime


class Config:
    # Секретный ключ для защиты сессий, CSRF и подписи cookies
    SECRET_KEY = "40e72d60cded4313534060ca1b7cd2680b95d22f910884bdd0c6808c0ff4bed4a4232e6d478a589df9d6a5846f5dfb71dfe116564dc5939d9664d98bdb1b5b41"

    # Строка подключения к MySQL через PyMySQL
    SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:@localhost/technokad"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Длительность действия remember-me cookies
    REMEMBER_COOKIE_DURATION = datetime.timedelta(hours=24)

    # SMTP‑конфигурация для Flask-Mail
    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False

    # Аккаунт для отправки писем
    MAIL_USERNAME = "technokadschedule@gmail.com"

    # Пароль приложения (Gmail App Password)
    MAIL_PASSWORD = "owzvanazsdxggblh"

    # Адрес отправителя по умолчанию
    MAIL_DEFAULT_SENDER = "technokadschedule@gmail.com"
