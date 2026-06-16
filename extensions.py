"""
Инициализация основных расширений Flask.

Содержит:
- SQLAlchemy: работа с базой данных
- LoginManager: управление аутентификацией пользователей
- Mail: отправка писем
"""

from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail


db = SQLAlchemy()

# Менеджер логинов — отвечает за:
# - хранение текущего пользователя
# - защиту маршрутов через @login_required
# - перенаправление на страницу логина при необходимости
login_manager = LoginManager()

# Почтовый клиент — используется для отправки писем
mail = Mail()

# Указываем маршрут, куда будет перенаправляться пользователь, если он не авторизован и пытается открыть защищённую страницу
login_manager.login_view = "login"
