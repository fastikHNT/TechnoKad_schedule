from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

import requests
from flask import session

from models.schedule import VacationSchedule

RECAPTCHA_SECRET_KEY = "6LciAbUtAAAAAAFp2YOSvgte3Rq12_W6wnP2v9aj"

from flask import Flask, render_template, request, redirect, flash, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import login_user, login_required, logout_user
from config import Config
from extensions import db, login_manager, mail
from models.user import User
from models.role import Role
from models.departement import Department
from models.position import Position
from models.schedule import Employee, VacationSchedule, ScheduleEmployee, Vacation, TypeVacation
from models.report import Report
from models.activation_token import ActivationToken
from services.token_service import generate_token
from services.email_service import send_email
from services.email_validator import email_exists

import os
from permissions import require_permission, can_edit_user, can_assign_role

from flask import jsonify, request, url_for, send_file
from werkzeug.utils import secure_filename
from flask_login import current_user, login_required

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white

from uuid import uuid4

from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user
from flask import redirect, url_for

from permissions import require_permission, validate_user_update

def msk_now():
    """
        Возвращает текущее время по московскому часовому поясу.

        Используется для:
        - фиксации времени изменения пароля
        - установки срока действия токена активации
        - проверки истечения токенов

        Возвращает datetime без tzinfo.
    """
    return datetime.now(ZoneInfo("Europe/Moscow")).replace(tzinfo=None)

app = Flask(__name__)
app.config.from_object(Config)

# Принудительно используем HTTPS
app.config['PREFERRED_URL_SCHEME'] = 'https'

@app.before_request
def force_https():
    request.environ['wsgi.url_scheme'] = 'https'

@app.after_request
def fix_redirect_scheme(response):
    location = response.headers.get('Location')
    if location and location.startswith('http://'):
        response.headers['Location'] = location.replace('http://', 'https://')
    return response

db.init_app(app)
login_manager.init_app(app)
# Куда перенаправляем неавторизованных пользователей
login_manager.login_view = 'authorization'

# Сообщение при попытке доступа к защищённой странице
login_manager.login_message = "Пожалуйста, авторизуйтесь, чтобы получить доступ к данной странице."
login_manager.login_message_category = "warning"
mail.init_app(app)


@app.errorhandler(404)
def page_not_found(e):
    """
        Обработка ошибок 404 - страница не найдена.

        Возвращает кастомную страницу 404 для всех несуществующих маршрутов.
    """
    # Для API-маршрутов возвращаем JSON
    if request.path.startswith('/api/'):
        return jsonify({
            "error": "Страница не найдена",
            "message": "Запрашиваемый ресурс не существует"
        }), 404
    
    # Для всех остальных запросов возвращаем HTML-страницу
    return render_template('404.html'), 404


@app.route('/captcha', methods=['GET', 'POST'])
def captcha():
    if request.method == 'POST':

        recaptcha_response = request.form.get('g-recaptcha-response')

        # Проверка
        verify = requests.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": RECAPTCHA_SECRET_KEY,
                "response": recaptcha_response
            }
        ).json()

        if verify.get("success"):
            session["captcha_passed"] = True  # ← ВАЖНО
            return redirect('/')

        flash("Подтвердите, что вы не робот")
        return redirect('/captcha')

    return render_template('captcha.html')


@login_manager.user_loader
def load_user(user_id):
    """
        Загрузка пользователя для Flask-Login.

        Вызывается автоматически при восстановлении сессии.
        Принимает user_id из сессии и возвращает объект User.
    """
    return User.query.get(int(user_id))


@app.route('/')
def authorization():
    """
        Страница авторизации.

        Отображает форму входа/регистрации и т.д. (auth.html).
    """
    if not session.get("captcha_passed"):
        return redirect('/captcha')

    return render_template('auth.html')
    return render_template('auth.html')



@app.route('/register', methods=['GET', 'POST'])
def register():
    """
        Регистрация пользователя.

        Логика:
        - Проверяет корректность email
        - Проверяет существование email
        - Проверяет, зарегистрирован ли пользователь ранее
        - Создаёт или обновляет пользователя
        - Генерирует токен активации (действует 24 часа)
        - Отправляет письмо с токеном
        - Перенаправляет на страницу авторизации

        Метод GET — отображает форму
        Метод POST — обрабатывает регистрацию
    """

    if request.method == 'POST':

        email = request.form.get('email')
        password = request.form.get('password')
        first_name = request.form.get('first_name')
        last_name = request.form.get('last_name')

        if not email:
            flash("Введите адрес электронной почты")
            return redirect('/')

        email = email.lower()

        user = User.query.filter_by(email=email).first()

        if user and user.is_registered:
            flash(
                f"Пользователь с данным адресом электронной почты {email} уже зарегистрирован. Выполните авторизацию.")
            return redirect('/')

        if not email_exists(email):
            flash("Введенный адрес электронной почты не существует")
            return redirect('/')

        password_hash = generate_password_hash(password)

        if not user:
            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                password_hash=password_hash,
                password_changed_at=msk_now(),
                is_registered=False,
                is_active=True,
                role_id=1  # Employee по умолчанию
            )
            db.session.add(user)
            db.session.commit()
        else:
            user.first_name = first_name
            user.last_name = last_name
            user.password_hash = password_hash
            db.session.commit()

        # Проверяем, есть ли сотрудник без email в таблице employees
        employee = Employee.query.filter_by(
            first_name=first_name,
            last_name=last_name,
            email=None
        ).first()
        
        if employee:
            # Привязываем email к сотруднику
            employee.email = email
            db.session.commit()

        ActivationToken.query.filter_by(user_id=user.id).delete()
        db.session.commit()

        token = generate_token()

        new_token = ActivationToken(
            user_id=user.id,
            token=token,
            expires_at=msk_now() + timedelta(hours=24)
        )

        db.session.add(new_token)
        db.session.commit()

        send_email(email, token, "activation", user.first_name)

        flash(f"На указанный адрес электронной почты {email} было направлено письмо для активации учетной записи.", "success")

        return redirect('/')

    return render_template('auth.html')


@app.route('/activate/<token>')
def activate(token):
    """
        Активация учетной записи пользователя.

        Принимает токен из URL.
        Проверяет:
        - существует ли токен
        - не был ли он использован
        - не истёк ли срок действия

        Если токен валиден:
        - активирует пользователя (is_active = 1)
        - помечает токен как использованный

        Если токен недействителен — отображает страницу ошибки.
    """
    activation = ActivationToken.query.filter_by(token=token, used=False).first()

    if not activation or activation.expires_at < msk_now():
        return render_template("email/token_invalid.html")

    user = User.query.get(activation.user_id)
    user.is_registered = True

    activation.used = True

    db.session.commit()

    login_user(user)

    return redirect('/main')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """
        Авторизация пользователя.

        Метод POST:
        - Проверяет наличие почты и пароля
        - Проверяет существование пользователя
        - Проверяет активацию аккаунта через почту
        - Проверяет, не деактивирован ли аккаунт администратором
        - Проверяет корректность пароля
        - Выполняет вход через login_user
        - Перенаправляет в главное меню

        Метод GET:
        - Перенаправляет на страницу авторизации
    """

    if request.method == 'POST':

        email = request.form.get('email')
        password = request.form.get('password')

        if not email or not password:
            flash("Введите email и пароль")
            return redirect('/')

        email = email.lower()
        user = User.query.filter_by(email=email).first()

        if not user:
            flash("Пользователь не найден")
            return redirect('/')

        # ✅ аккаунт не активирован через email
        if not user.is_registered:
            flash("Аккаунт не активирован.\nДля активации аккаунта необходимо перейти по ссылке из письма, отправленного на указанный адрес электронной почты.")
            return redirect('/')

        # ✅ аккаунт деактивирован администратором
        if not user.is_active:
            flash("Аккаунт деактивирован.\nОбратитесь к администратору.")
            return redirect('/')

        # ✅ проверка пароля
        if not check_password_hash(user.password_hash, password):
            flash("Неверный пароль")
            return redirect('/')

        login_user(user)
        return redirect('/main')

    return redirect('/')


@app.route('/main')
@login_required
def main():
    """
        Главная страница системы.

        Доступна только авторизованным пользователям.
        Отображает основной интерфейс веба
    """
    return render_template('main.html')


@app.route('/logout')
@login_required
def logout():
    """
        Выход пользователя из системы.

        Завершает сессию через logout_user
        и перенаправляет на страницу авторизации.
    """

    logout_user()
    return redirect('/')


@app.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
        Инициирует процедуру восстановления пароля.

        Логика:
        - Проверяет существование пользователя по почте
        - Удаляет старые токены активации
        - Генерирует новый токен (действует 1 час)
        - Сохраняет токен в базе
        - Отправляет письмо для восстановления пароля
        - Перенаправляет на страницу авторизации
    """

    email = request.form.get("email")

    user = User.query.filter_by(email=email).first()

    if not user:
        flash("Пользователь с таким email не найден")
        return redirect('/')

    ActivationToken.query.filter_by(user_id=user.id).delete()
    db.session.commit()

    token = generate_token()

    # Use UTC time for consistent token validation
    reset_token = ActivationToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(hours=1)
    )

    db.session.add(reset_token)
    db.session.commit()

    send_email(email, token, "reset", user.first_name)

    flash(f"На указанный адрес электронной почты {email} было направлено письмо с инструкцией по восстановлению учетной записи.", "success")

    return redirect('/')


@app.route('/reset/<token>', methods=['GET', 'POST'])
def reset_password(token):
    """
       Сброс пароля пользователя по токену:

       Проверяет:
       - существует ли токен
       - не был ли использован
       - не истёк ли срок действия

       Метод GET:
       - Отображает форму ввода нового пароля

       Метод POST:
       - Сохраняет новый пароль (с хешированием)
       - Обновляет дату изменения пароля
       - Помечает токен использованным
       - Сохраняет изменения в базе
       - Перенаправляет на страницу авторизации
    """

    activation = ActivationToken.query.filter_by(token=token, used=False).first()

    if not activation:
        return render_template("email/token_invalid.html")

    # Check expiration using UTC time (consistent with token creation)
    if activation.expires_at < datetime.utcnow():
        return render_template("email/token_invalid.html")

    user = User.query.get(activation.user_id)

    if request.method == 'POST':

        password = request.form.get("password")

        user.password_hash = generate_password_hash(password)
        user.password_changed_at = datetime.now(ZoneInfo("Europe/Moscow"))

        activation.used = True

        db.session.commit()

        flash("Пароль успешно изменён")

        return redirect('/')

    return render_template("email/reset_password.html", token=token)

@app.route("/upload-avatar", methods=["POST"])
@login_required
def upload_avatar():
    """
        Загрузка аватара пользователя.

        Логика:
        - Проверяет наличие файла в запросе
        - Проверяет, что имя файла не пустое
        - Проверяет расширение файла и сравнивает с разрешёнными форматами
        - Генерирует уникальное имя файла
        - Создаёт папку avatars при необходимости
        - Сохраняет файл на сервер
        - Удаляет старый аватар пользователя, если он был установлен
        - Обновляет путь к аватару в базе
        - Возвращает URL нового аватара

        Доступ: только авторизованные пользователи.
    """

    if "avatar" not in request.files:
        return {"error": "no file"}

    file = request.files["avatar"]

    if file.filename == "":
        return {"error": "empty"}

    filename = secure_filename(file.filename)

    ext = filename.split(".")[-1].lower()

    allowed = {"png", "jpg", "jpeg", "webp"}

    if ext not in allowed:
        return {"error": "invalid file"}

    new_filename = f"{uuid4()}.{ext}"

    upload_folder = os.path.join("static", "avatars")

    os.makedirs(upload_folder, exist_ok=True)

    path = os.path.join(upload_folder, new_filename)

    file.save(path)

    # удаляем старый аватар
    if current_user.avatar:
        old_path = os.path.join("static", current_user.avatar)
        if os.path.exists(old_path):
            os.remove(old_path)

    current_user.avatar = f"avatars/{new_filename}"

    db.session.commit()

    return {
        "avatar_url": url_for("static", filename=current_user.avatar)
    }


@app.route("/save-phone", methods=["POST"])
@login_required
def save_phone():
    """
        Сохранение телефона пользователя.

        Логика:
        - Получает JSON из запроса
        - Извлекает номер телефона
        - Если номер пустой или равен '+7' — очищает поле
        - В противном случае записывает переданный номер
        - Сохраняет изменения в базе
        - Возвращает JSON со статусом выполнения

        Обрабатывает ошибки и возвращает статус 500 в случае исключения.

        Доступ: только авторизованные пользователи.
    """
    try:
        data = request.get_json()
        phone = data.get("phone")

        if not phone or phone == "+7":
            current_user.phone = None
        else:
            current_user.phone = phone

        db.session.commit()

        return jsonify({"success": True})

    except Exception as e:
        print(e)
        return jsonify({
            "success": False,
            "error": "Server Error"
        }), 500


@app.route("/change-password", methods=["POST"])
@login_required
def change_password():
    """
        Смена пароля пользователя.

        Логика:
        - Получает старый и новый пароль из JSON
        - Проверяет корректность текущего пароля
        - Запрещает устанавливать тот же самый пароль
        - Хеширует и сохраняет новый пароль
        - Обновляет дату изменения пароля
        - Сохраняет изменения в базе
        - Возвращает JSON со статусом операции

        В случае ошибки возвращает JSON с описанием и статусом 500.
        Доступ: только авторизованные пользователи.
    """
    try:
        data = request.get_json()

        old_password = data.get("old_password")
        new_password = data.get("new_password")

        if not check_password_hash(current_user.password_hash, old_password):
            return jsonify({
                "success": False,
                "error": "Неверный текущий пароль"
            })

        if check_password_hash(current_user.password_hash, new_password):
            return jsonify({
                "success": False,
                "error": "Новый пароль должен отличаться от старого"
            })

        current_user.password_hash = generate_password_hash(new_password)
        current_user.password_changed_at = msk_now()

        db.session.commit()

        return jsonify({"success": True})

    except Exception as e:
        print(e)
        return jsonify({
            "success": False,
            "error": "Server Error"
        }), 500


# Словарь текстовых обозначений ролей. Используется для отображения ролей в интерфейсе (например, в профиле).
ROLE_TRANSLATIONS = {
        "employee": "Пользователь",
        "admin": "Админ",
        "super_admin": "Супер-админ",
        "developer": "Разработчик"
    }


@app.route("/api/users")
def get_users():
    """
        Получение списка всех пользователей.

        Возвращает JSON со всеми пользователями системы,
        включая:
        - персональные данные
        - отдел и должность
        - роль
        - статус активности

        Используется для отображения таблицы пользователей
        в административной панели.
    """
    users = User.query.all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "email": u.email,
                "phone": u.phone,
                "department_name": u.department.name if u.department else None,
                "department_id": u.department_id,
                "position_name": u.position.name if u.position else None,
                "position_id": u.position_id,
                "role_id": u.role_id,
                "role": u.role.name if u.role else None,
                "role_display": ROLE_TRANSLATIONS.get(
                    u.role.name if u.role else None,
                    u.role.name if u.role else None
                ),
                "is_active": u.is_active,
            }
            for u in users
        ]
    })

@app.route("/positions/<int:department_id>")
def get_positions(department_id):
    """
        Получение списка должностей по ID отдела.

        Принимает:
        - department_id — идентификатор отдела

        Возвращает JSON-массив должностей,
        относящихся к указанному отделу.

        Используется для динамического заполнения
        выпадающих списков в интерфейсе.
    """
    positions = Position.query.filter_by(department_id=department_id).all()

    return jsonify([
        {
            "id": p.id,
            "name": p.name
        } for p in positions
    ])


@app.route("/admin/", methods=["GET", "POST"])
@login_required
@require_permission("view_admin_page")
def admin():
    """
        Страница административной панели.

        Доступ:
        - Только авторизованные пользователи
        - Только пользователи с разрешением "view_admin_page"

        Загружает список отделов для отображения
        в интерфейсе управления.
    """
    departments = Department.query.all()

    return render_template(
        "administration.html",
        departments=departments
    )


@app.route("/api/admin/delete-user", methods=["POST"])
@login_required
@require_permission("delete_user")
def delete_user():
    """
        Деактивация пользователя.

        Доступ:
        - Только авторизованные пользователи
        - Только с разрешением "delete_user"

        Логика:
        - Получает user_id из JSON-запроса
        - Проверяет существование пользователя
        - Вместо удаления выполняет мягкое удаление
          (устанавливает is_active = False)
        - Сохраняет изменения в базе
        - Возвращает JSON со статусом операции
    """

    data = request.json
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "No user id"}), 400

    user = db.session.get(User, int(user_id))

    if not user:
        return jsonify({"error": "User not found"}), 404

    # не будем удалять, вместо этого — деактивация
    user.is_active = 0   # True или False

    db.session.commit()

    return jsonify({"message": "User deactivated"})


@app.route("/api/admin/options")
@login_required
@require_permission("view_admin_page")
def admin_options():
    """
        Получение справочных данных для админ-панели.

        Доступ:
        - Только авторизованные пользователи
        - Только с разрешением "view_admin_page"

        Возвращает:
        - список отделов
        - список должностей
        - список ролей

        Используется для заполнения форм создания
        и редактирования пользователей.
    """

    departments = Department.query.all()
    positions = Position.query.all()
    roles = Role.query.all()

    return jsonify({
        "departments": [
            {"id": d.id, "name": d.name} for d in departments
        ],
        "positions": [
            {
                "id": p.id,
                "name": p.name,
                "department_id": p.department_id
            } for p in positions
        ],
        "roles": [
            {
                "id": r.id,
                "name": r.name,
                "display_name": ROLE_TRANSLATIONS.get(r.name, r.name)
            } for r in roles
        ]
    })

@app.route("/admin/deleted")
@login_required
@require_permission("delete_user")
def get_deleted_users():
    """
        Получение списка деактивированных пользователей.

        Доступ:
        - Только авторизованные пользователи
        - Только с разрешением "delete_user"

        Возвращает JSON-массив пользователей,
        у которых is_active = False.

        Используется для отображения списка
        "удалённых" (деактивированных) сотрудников.
    """

    users = User.query.filter_by(is_active=False).all()

    return jsonify([
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "phone": u.phone or "",
            "department": u.department.name if u.department else "",
            "position": u.position.name if u.position else ""
        }
        for u in users
    ])

@app.route("/admin/restore/<int:user_id>", methods=["POST"])
@login_required
@require_permission("restore_user")
def restore_user(user_id):
    """
        Восстановление (активация) пользователя.

        Доступ:
        - Только авторизованные пользователи
        - Только с разрешением "restore_user"

        Логика:
        - Получает пользователя по ID
        - Проверяет существование пользователя
        - Проверяет, что пользователь действительно деактивирован
        - Устанавливает is_active = True
        - Сохраняет изменения в базе
        - Возвращает JSON со статусом операции
    """

    user = User.query.get(user_id)
    if not user:
        return jsonify({
            "success": False,
            "error": "Пользователь не найден"
        }), 404

    if user.is_active:
        return jsonify({
            "success": False,
            "error": "Пользователь уже активен"
        }), 400

    user.is_active = 1
    db.session.commit()

    return jsonify({"success": True})


@app.route("/api/admin/update-user", methods=["POST"])
@login_required
@require_permission("edit_user")
def update_user():
    """
        Обновление данных пользователя в административной панели.

        Доступ:
        - Только авторизованные пользователи
        - Только с разрешением "edit_user"

        Логика:
        - Получает данные из JSON-запроса
        - Проверяет наличие user_id
        - Проверяет существование пользователя
        - Проверяет заполненность обязательных полей
        - Приводит ID к числовому типу
        - Выполняет централизованную проверку прав через validate_user_update
        - Проверяет корректность связи "отдел" и "должность"
        - Применяет изменения (отдел, должность, роль)
        - Сохраняет изменения в базе
        - Возвращает JSON со статусом операции
    """

    data = request.json or {}

    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Не указан пользователь"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "error": "Пользователь не найден"}), 404

    department_id = data.get("department_id")
    position_id = data.get("position_id")
    role_id = data.get("role_id")

    # department_id и position_id обязательны, role_id может быть пустым (если не меняется)
    if not department_id or not position_id:
        return jsonify({"success": False, "error": "Не заполнены обязательные поля (отдел, должность)"}), 400

    try:
        department_id = int(department_id)
        position_id = int(position_id)
        role_id = int(role_id) if role_id is not None else None
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Некорректный формат данных"}), 400

    # ---- ЕДИНАЯ ПРОВЕРКА ПРАВ ----
    is_valid, error = validate_user_update(
        target_user=user,
        new_role_id=role_id
    )

    if not is_valid:
        return jsonify({"success": False, "error": error}), 403

    # ---- ПРОВЕРКА СВЯЗИ ОТДЕЛ и ДОЛЖНОСТЬ ----
    position = Position.query.get(position_id)
    if not position:
        return jsonify({"success": False, "error": "Должность не найдена"}), 404

    if position.department_id != department_id:
        return jsonify({
            "success": False,
            "error": "Должность не относится к выбранному отделу"
        }), 400

    # ---- ПРИМЕНЯЕМ ИЗМЕНЕНИЯ ----
    user.department_id = department_id
    user.position_id = position_id
    
    # Обновляем роль только если она передана
    if role_id is not None:
        user.role_id = role_id

    db.session.commit()

    return jsonify({"success": True})




@app.route("/schedule")
@login_required
def schedule_page():
    return render_template("schedule.html")


@app.route("/api/current-user")
@login_required
def get_current_user():
    """
        Получение данных текущего пользователя.

        Возвращает:
        - id
        - role (название роли)
        - role_display (отображаемое имя роли)
        - department_id (ID отдела пользователя)
    """
    return jsonify({
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.name if current_user.role else None,
        "role_display": ROLE_TRANSLATIONS.get(
            current_user.role.name if current_user.role else None,
            current_user.role.name if current_user.role else None
        ),
        "role_id": current_user.role_id,
        "department_id": current_user.department_id
    })


@app.route("/api/schedules/<int:department_id>")
def get_schedules(department_id):

    schedules = VacationSchedule.query.filter_by(
        department_id=department_id
    ).all()

    return jsonify([
        {
            "id": s.id,
            "name": s.name,
            "year": s.year,
            "is_default": s.is_default
        }
        for s in schedules
    ])

@app.route("/api/schedule/<int:schedule_id>")
def get_schedule(schedule_id):

    schedule = VacationSchedule.query.get_or_404(schedule_id)

    employees_data = []

    for se in schedule.employees:

        employee = se.employee

        vacations = []
        for v in se.vacation_entries:
            vacations.append({
                "id": v.id,
                "start_date": v.start_date.strftime("%Y-%m-%d"),
                "end_date": v.end_date.strftime("%Y-%m-%d"),
                "type_vacation_id": v.type_vacation_id
            })

        employees_data.append({
            "id": employee.id,
            "schedule_employee_id": se.id,
            "user_id": se.user_id,
            "email": employee.email,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "position": employee.position,
            "direction": employee.direction,
            "vacations": vacations
        })

    # Старый формат для совместимости
    tasks = []
    for se in schedule.employees:
        for v in se.vacation_entries:
            tasks.append({
                "id": v.id,
                "name": f"{se.employee.last_name} {se.employee.first_name}",
                "start": v.start_date.strftime("%Y-%m-%d"),
                "end": v.end_date.strftime("%Y-%m-%d"),
                "progress": 100
            })

    return jsonify({
        "id": schedule.id,
        "name": schedule.name,
        "year": schedule.year,
        "department_id": schedule.department_id,
        "is_default": schedule.is_default,
        "employees": employees_data,
        "tasks": tasks
    })


@app.route("/api/schedules/create", methods=["POST"])
def create_schedule():

    data = request.get_json()

    name = data.get("name")
    department_id = data.get("department_id")
    year = data.get("year")
    is_default = data.get("is_default", False)
    who_created = current_user.id

    if not name:
        return jsonify({"error": "Название обязательно"}), 400

    # Если устанавливаем график как обязательный, сначала сбрасываем старый
    if is_default:
        VacationSchedule.query.filter_by(
            department_id=department_id,
            is_default=True
        ).update({"is_default": False})

    schedule = VacationSchedule(
        name=name,
        department_id=department_id,
        year=year,
        is_default=is_default,
        who_created=who_created
    )

    db.session.add(schedule)
    db.session.commit()

    return jsonify({
        "success": True,
        "id": schedule.id
    })


@app.route("/api/users/department/<int:department_id>")
def get_users_by_department(department_id):
    users = User.query.filter_by(department_id=department_id).all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "position_name": u.position.name if u.position else None
            }
            for u in users
        ]
    })


@app.route("/api/users/registered/<int:department_id>")
def get_registered_users(department_id):
    """
        Получение зарегистрированных сотрудников отдела.

        Возвращает только пользователей с is_registered = True.
    """
    users = User.query.filter_by(
        department_id=department_id,
        is_registered=True,
        is_active=True
    ).all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "email": u.email,
                "position_name": u.position.name if u.position else None,
                "direction": u.direction if hasattr(u, 'direction') else None
            }
            for u in users
        ]
    })


@app.route("/api/schedules/<int:department_id>/default")
def get_default_schedule(department_id):
    """
        Получение обязательного графика для отдела.

        Возвращает только один график, отмеченный как is_default.
        Если такого нет — возвращает пустой ответ.
    """
    schedule = VacationSchedule.query.filter_by(
        department_id=department_id,
        is_default=True
    ).first()

    if not schedule:
        return jsonify(None)

    employees_data = []

    for se in schedule.employees:

        employee = se.employee

        vacations = []
        for v in se.vacation_entries:
            vacations.append({
                "id": v.id,
                "start_date": v.start_date.strftime("%Y-%m-%d"),
                "end_date": v.end_date.strftime("%Y-%m-%d"),
                "type_vacation_id": v.type_vacation_id
            })

        employees_data.append({
            "id": employee.id,
            "schedule_employee_id": se.id,
            "user_id": se.user_id,
            "email": employee.email,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "position": employee.position,
            "direction": employee.direction,
            "vacations": vacations
        })

    return jsonify({
        "id": schedule.id,
        "name": schedule.name,
        "year": schedule.year,
        "is_default": schedule.is_default,
        "employees": employees_data
    })


@app.route("/api/schedules/<int:schedule_id>/set-default", methods=["POST"])
def set_default_schedule(schedule_id):
    """
        Установка графика как обязательного для просмотра.

        Логика:
        - Получает schedule_id из URL
        - Находит график по ID
        - Сбрасывает is_default у всех графиков этого отдела
        - Устанавливает is_default = True для выбранного графика
        - Сохраняет изменения в базе
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)

    # Сбрасываем старый обязательный график
    VacationSchedule.query.filter_by(
        department_id=schedule.department_id,
        is_default=True
    ).update({"is_default": False})

    # Устанавливаем новый
    schedule.is_default = True
    db.session.commit()

    return jsonify({"success": True, "schedule_id": schedule.id})


@app.route("/api/schedules/<int:schedule_id>/remove-default", methods=["POST"])
def remove_default_schedule(schedule_id):
    """
        Снятие флага обязательного графика.

        Логика:
        - Получает schedule_id из URL
        - Находит график по ID
        - Сбрасывает is_default = False
        - Сохраняет изменения в базе
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)
    schedule.is_default = False
    db.session.commit()

    return jsonify({"success": True, "schedule_id": schedule.id})


@app.route("/api/schedules/<int:schedule_id>/add-employee", methods=["POST"])
def add_employee_to_schedule(schedule_id):
    """
        Добавление сотрудника в график.

        Принимает:
        - employee_id: ID зарегистрированного сотрудника ИЛИ
        - first_name, last_name, position: данные нового сотрудника

        Логика:
        - Находит график по ID
        - Создаёт запись ScheduleEmployee
        - Если сотрудник новый — создаёт запись в employees
        - Сохраняет изменения в базе
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)
    data = request.get_json()

    employee = None

    # Вариант 1: добавление из списка зарегистрированных пользователей
    if data.get("employee_id"):
        user_id = data["employee_id"]
        
        # Ищем пользователя
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404
        
        # Проверяем, нет ли уже в графике по email
        existing_se = ScheduleEmployee.query.join(Employee).filter(
            ScheduleEmployee.schedule_id == schedule.id,
            Employee.first_name == user.first_name,
            Employee.last_name == user.last_name
        ).first()
        
        if existing_se:
            return jsonify({"error": "Этот сотрудник уже есть в графике"}), 400
        
        # Ищем или создаём запись Employee
        employee = Employee.query.filter_by(
            first_name=user.first_name,
            last_name=user.last_name,
            department_id=schedule.department_id
        ).first()
        
        if not employee:
            employee = Employee(
                first_name=user.first_name,
                last_name=user.last_name,
                position=user.position.name if user.position else None,
                department_id=schedule.department_id,
                direction=data.get("direction"),
                email=user.email
            )
            db.session.add(employee)
            db.session.flush()
        else:
            # Обновляем направление и email для существующего сотрудника
            employee.direction = data.get("direction")
            employee.email = user.email

    # Вариант 2: добавление вручную
    elif data.get("first_name") and data.get("last_name"):
        # Проверяем дубли по имени и фамилии
        existing_emp = Employee.query.filter_by(
            first_name=data["first_name"],
            last_name=data["last_name"],
            department_id=schedule.department_id
        ).first()
        
        if existing_emp:
            # Проверяем, нет ли уже в графике
            existing_se = ScheduleEmployee.query.filter_by(
                schedule_id=schedule.id,
                employee_id=existing_emp.id
            ).first()
            
            if existing_se:
                return jsonify({"error": "Этот сотрудник уже есть в графике"}), 400
            
            employee = existing_emp
            # Обновляем направление для существующего сотрудника
            employee.direction = data.get("direction")
        else:
            employee = Employee(
                first_name=data["first_name"],
                last_name=data["last_name"],
                position=data.get("position", ""),
                department_id=schedule.department_id,
                direction=data.get("direction"),
                email=None  # Для ручного добавления email не заполняется
            )
            db.session.add(employee)
            db.session.flush()

    else:
        return jsonify({"error": "Не указаны данные сотрудника"}), 400

    # Создаём связь
    if data.get("employee_id"):
        # При добавлении из списка пользователей используем user_id добавляемого сотрудника
        schedule_employee = ScheduleEmployee(
            schedule_id=schedule.id,
            employee_id=employee.id,
            user_id=user_id
        )
    else:
        # При ручном добавлении используем current_user
        schedule_employee = ScheduleEmployee(
            schedule_id=schedule.id,
            employee_id=employee.id,
            user_id=current_user.id if current_user.is_authenticated else None
        )

    db.session.add(schedule_employee)
    db.session.commit()

    return jsonify({
        "success": True,
        "employee_id": employee.id,
        "schedule_employee_id": schedule_employee.id
    })


@app.route("/api/vacations/add", methods=["POST"])
def add_vacation():
    """
        Добавление отпуска сотруднику в график.

        Принимает:
        - schedule_employee_id: ID записи ScheduleEmployee
        - start_date: дата начала (YYYY-MM-DD)
        - end_date: дата окончания (YYYY-MM-DD)
        - type_vacation_id: ID типа отпуска (опционально)
    """
    data = request.get_json()

    schedule_employee_id = data.get("schedule_employee_id")
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    type_vacation_id = data.get("type_vacation_id", 1)  # По умолчанию - основной

    # Преобразуем type_vacation_id в целое число
    try:
        type_vacation_id = int(type_vacation_id)
    except (ValueError, TypeError):
        type_vacation_id = 1

    if not all([schedule_employee_id, start_date, end_date]):
        return jsonify({"error": "Не указаны обязательные поля"}), 400

    schedule_employee = ScheduleEmployee.query.get_or_404(schedule_employee_id)
    employee = schedule_employee.employee

    vacation = Vacation(
        schedule_employee_id=schedule_employee_id,
        first_name=employee.first_name,
        last_name=employee.last_name,
        position=employee.position,
        direction=employee.direction,
        start_date=datetime.strptime(start_date, "%Y-%m-%d").date(),
        end_date=datetime.strptime(end_date, "%Y-%m-%d").date(),
        type_vacation_id=type_vacation_id
    )

    db.session.add(vacation)
    db.session.commit()

    return jsonify({
        "success": True,
        "vacation_id": vacation.id
    })


@app.route("/api/vacations/<int:vacation_id>", methods=["PUT"])
def update_vacation(vacation_id):
    """
        Обновление отпуска.

        Принимает:
        - start_date: дата начала (YYYY-MM-DD)
        - end_date: дата окончания (YYYY-MM-DD)
        - type_vacation_id: ID типа отпуска
    """
    vacation = Vacation.query.get_or_404(vacation_id)
    data = request.get_json()

    if data.get("start_date"):
        vacation.start_date = datetime.strptime(data["start_date"], "%Y-%m-%d").date()

    if data.get("end_date"):
        vacation.end_date = datetime.strptime(data["end_date"], "%Y-%m-%d").date()

    if data.get("type_vacation_id"):
        vacation.type_vacation_id = int(data["type_vacation_id"])

    db.session.commit()

    return jsonify({"success": True})


@app.route("/api/vacations/<int:vacation_id>", methods=["DELETE"])
def delete_vacation(vacation_id):
    """
        Удаление отпуска.
    """
    vacation = Vacation.query.get_or_404(vacation_id)
    db.session.delete(vacation)
    db.session.commit()

    return jsonify({"success": True})


@app.route("/api/schedule-employees/<int:schedule_employee_id>", methods=["PUT"])
def update_schedule_employee(schedule_employee_id):
    """
        Обновление данных сотрудника в графике (имя, фамилия).
    """
    schedule_employee = ScheduleEmployee.query.get_or_404(schedule_employee_id)
    employee = schedule_employee.employee
    data = request.get_json()

    if data.get("first_name"):
        employee.first_name = data["first_name"]

    if data.get("last_name"):
        employee.last_name = data["last_name"]

    db.session.commit()

    return jsonify({"success": True})


@app.route("/api/schedule-employees/<int:schedule_employee_id>", methods=["DELETE"])
def delete_schedule_employee(schedule_employee_id):
    """
        Удаление сотрудника из графика.
        Если сотрудник больше не используется в других графиках,
        удаляется также из таблицы employees.
    """
    schedule_employee = ScheduleEmployee.query.get_or_404(schedule_employee_id)
    employee = schedule_employee.employee
    
    # Удаляем связь ScheduleEmployee
    db.session.delete(schedule_employee)
    
    # Проверяем, используется ли сотрудник в других графиках
    other_usage = ScheduleEmployee.query.filter(
        ScheduleEmployee.employee_id == employee.id,
        ScheduleEmployee.id != schedule_employee_id
    ).first()
    
    # Если сотрудник больше нигде не используется - удаляем из таблицы employees
    if not other_usage:
        db.session.delete(employee)
    
    db.session.commit()

    return jsonify({"success": True})


@app.route("/api/vacation-types")
def get_vacation_types():
    """
        Получение списка типов отпусков.

        Возвращает JSON-массив типов отпусков из таблицы type_vacation.
    """
    types = TypeVacation.query.all()

    return jsonify([
        {
            "id": t.id,
            "name": t.name
        }
        for t in types
    ])


@app.route("/api/schedules/<int:schedule_id>/reorder-employees", methods=["POST"])
def reorder_employees(schedule_id):
    """
        Сохранение нового порядка сотрудников в графике.

        Принимает:
        - employee_order: массив schedule_employee_id в новом порядке

        Логика:
        - Добавляет поле sort_order к ScheduleEmployee
        - Сохраняет новый порядок
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)
    data = request.get_json()
    
    employee_order = data.get("employee_order", [])
    
    if not employee_order:
        return jsonify({"error": "Не указан порядок сотрудников"}), 400
    
    for index, schedule_employee_id in enumerate(employee_order):
        se = ScheduleEmployee.query.get(schedule_employee_id)
        if se and se.schedule_id == schedule_id:
            se.sort_order = index
    
    db.session.commit()
    
    return jsonify({"success": True})


def generate_pdf(file_path, schedule, date_from, date_to, report_data, report_name="", user_info=None, scope="", extra_info=None):
    """
    Генерация PDF-отчёта с таблицей отпусков.
    """
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    
    # Регистрируем шрифт с поддержкой кириллицы из папки проекта
    font_path_base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
    
    regular_path = os.path.join(font_path_base, 'times.ttf')
    bold_path = os.path.join(font_path_base, 'timesbd.ttf')
    
    font_registered = False
    if os.path.exists(regular_path) and os.path.exists(bold_path):
        try:
            pdfmetrics.registerFont(TTFont('TimesNewRoman', regular_path))
            pdfmetrics.registerFont(TTFont('TimesNewRomanBold', bold_path))
            font_registered = True
            app.logger.info("Times New Roman fonts loaded successfully")
        except Exception as e:
            app.logger.error(f"Font registration error: {e}")
    
    # Если шрифт не зарегистрирован, используем стандартный (без кириллицы)
    font_name = 'TimesNewRomanBold' if font_registered else 'Times-Bold'
    font_name_regular = 'TimesNewRoman' if font_registered else 'Times-Roman'
    
    # Открываем файл с UTF-8 кодировкой для поддержки кириллицы
    from io import BytesIO
    file_buffer = BytesIO()
    
    c = SimpleDocTemplate(
        file_buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    styles_dict = getSampleStyleSheet()
    
    # Создаём стили с кириллицей
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles_dict['Normal'],
        fontName=font_name,
        fontSize=14,
        spaceAfter=12,
        alignment=1
    )
    
    base_style = ParagraphStyle(
        'BaseStyle',
        parent=styles_dict['Normal'],
        fontName=font_name_regular,
        fontSize=9,
        leading=11
    )
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles_dict['Normal'],
        fontName=font_name,
        fontSize=8,
        leading=10,
        textColor=white
    )
    
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles_dict['Normal'],
        fontName=font_name_regular,
        fontSize=8,
        leading=10
    )
    
    info_style = ParagraphStyle(
        'UserInfo',
        parent=styles_dict['Normal'],
        fontName=font_name_regular,
        fontSize=8,
        leading=10,
        alignment=2,
        spaceAfter=3
    )
    
    elements = []
    
    year = schedule.year if schedule else datetime.now().year
    
    # Информация о пользователе (справа сверху)
    if user_info:
        info_style = ParagraphStyle(
            'UserInfo',
            parent=styles_dict['Normal'],
            fontName='TimesNewRoman',
            fontSize=9,
            leading=11,
            alignment=2,
            spaceAfter=4
        )
        elements.append(Paragraph("<b>Отчет сформировал:</b>", info_style))
        elements.append(Paragraph(f"<b>Фамилия, имя:</b> {user_info.get('full_name', '')}", info_style))
        if user_info.get('department'):
            elements.append(Paragraph(f"<b>Отдел:</b> {user_info['department']}", info_style))
        if user_info.get('position'):
            elements.append(Paragraph(f"<b>Должность:</b> {user_info['position']}", info_style))
        
        # Перевод типа отчета
        scope_translations = {
            'schedule': 'по графику',
            'department': 'по отделу',
            'employee': 'по сотруднику',
            'direction': 'по подразделению'
        }
        elements.append(Paragraph(f"Тип отчета: {scope_translations.get(scope, scope)}", info_style))
        
        # Дополнительная информация по типу отчета
        if extra_info:
            if scope == "employee" and extra_info.get('employee_name'):
                elements.append(Paragraph(f"<b>Сотрудник:</b> {extra_info['employee_name']}", info_style))
            elif scope == "direction" and extra_info.get('direction'):
                elements.append(Paragraph(f"<b>Подразделение:</b> {extra_info['direction']}", info_style))
        
        if date_from and date_to:
            elements.append(Paragraph(f"Период: {date_from.strftime('%d.%m.%Y')} - {date_to.strftime('%d.%m.%Y')}", info_style))
        elif date_from:
            elements.append(Paragraph(f"Период: с {date_from.strftime('%d.%m.%Y')}", info_style))
        
        elements.append(Spacer(1, 8*mm))
    
    # Наименование отчета (по центру)
    title = report_name if report_name else f"Отчет по отпускам за {year} год"
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 6*mm))
    
    # Создаем компактную таблицу с информацией о сотрудниках
    headers = ["№", "Фамилия Имя", "Должность", "Направление", "Отгуляно дней", "Остаток отпуска"]
    
    table_data = [headers]
    
    # Стандартная продолжительность отпуска в России - 28 дней
    standard_vacation_days = 28
    
    for idx, item in enumerate(report_data, 1):
        # Разбираем имя сотрудника
        name_parts = item['employee_name'].split()
        last_name = name_parts[0] if len(name_parts) > 0 else ""
        first_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        full_name = f"{last_name} {first_name}"
        
        # Считаем отгулянные дни в выбранном периоде
        worked_days = 0
        
        # Конвертируем даты в объекты date если это строки
        if date_from and not isinstance(date_from, type(datetime.now().date())):
            date_from_obj = datetime.strptime(date_from, "%Y-%m-%d").date()
        else:
            date_from_obj = date_from
        
        if date_to and not isinstance(date_to, type(datetime.now().date())):
            date_to_obj = datetime.strptime(date_to, "%Y-%m-%d").date()
        else:
            date_to_obj = date_to
        
        for vac in item['vacations']:
            vac_start = vac.start_date
            vac_end = vac.end_date
            
            # Фильтр по дате
            if date_from_obj and vac_end < date_from_obj:
                continue
            if date_to_obj and vac_start > date_to_obj:
                continue
            
            # Ограничиваем диапазон
            if date_from_obj:
                vac_start = max(vac_start, date_from_obj)
            if date_to_obj:
                vac_end = min(vac_end, date_to_obj)
            
            if vac_end >= vac_start:
                worked_days += (vac_end - vac_start).days + 1
        
        # Остаток отпуска
        remaining_days = standard_vacation_days - worked_days
        if remaining_days < 0:
            remaining_days = 0
        
        row = [
            Paragraph(str(idx), cell_style),
            Paragraph(f"<b>{full_name}</b>", cell_style),
            Paragraph(item['position'] or "", cell_style),
            Paragraph(item['direction'] or "", cell_style),
            Paragraph(str(worked_days), cell_style),
            Paragraph(str(remaining_days), cell_style)
        ]
        
        table_data.append(row)
    
    col_count = len(headers)
    col_widths = [0.8*cm, 4*cm, 3.5*cm, 3*cm, 2.5*cm, 2.5*cm]
    
    t = Table(table_data, colWidths=col_widths)
    
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#667eea')),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'TimesNewRomanBold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'TimesNewRoman'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f9f9f9')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#f9f9f9'), white]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]
    
    t.setStyle(TableStyle(style_commands))
    elements.append(t)
    
    elements.append(Spacer(1, 8*mm))
    
    # Блок подписи (слева внизу)
    signature_style = ParagraphStyle('Signature', parent=base_style, fontSize=10, alignment=0)
    signature_text = "_______________ /_____________"
    elements.append(Paragraph(signature_text, signature_style))
    
    # Подписи под чертами - table с двумя колонками
    sig_table_data = [
        [Paragraph("<b>Подпись</b>", cell_style), Paragraph("<b>Расшифровка</b>", cell_style)]
    ]
    sig_table = Table(sig_table_data, colWidths=[4*cm, 32*cm])
    sig_style_cmds = [
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'LEFT'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 0),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]
    sig_table.setStyle(TableStyle(sig_style_cmds))
    elements.append(sig_table)
    elements.append(Spacer(1, 6*mm))
    
    footer_style = ParagraphStyle('Footer', parent=base_style, fontSize=8, alignment=2)
    elements.append(Paragraph(f"Дата формирования: {datetime.now().strftime('%d.%m.%Y %H:%M')}", footer_style))
    
    c.build(elements)
    
    # Сохраняем buffer в файл
    with open(file_path, 'wb') as f:
        f.write(file_buffer.getvalue())
    file_buffer.close()


@app.route("/api/reports-page")
@login_required
@require_permission("view_reports")
def reports_page_api():
    """API для загрузки страницы отчетов через AJAX"""
    return render_template("reports.html")


@app.route("/reports")
@login_required
@require_permission("view_reports")
def reports_page():
    """Страница формирования отчетов"""
    return render_template("reports.html")


@app.route("/api/reports/generate", methods=["POST"])
@login_required
@require_permission("view_reports")
def generate_report():
    import traceback as tb
    try:
        data = request.get_json()
        
        schedule_id = data.get("schedule_id")
        scope = data.get("scope")  # employee, department, schedule, direction
        employee_id = data.get("employee_id")
        direction = data.get("direction")
        date_from = data.get("date_from")
        date_to = data.get("date_to")
        user_name = data.get("name", "")  # Пользовательское наименование
        
        app.logger.info(f"Generating report: schedule={schedule_id}, scope={scope}")
        
        if not schedule_id:
            return jsonify({"error": "Выберите график"}), 400
        
        schedule = VacationSchedule.query.get_or_404(schedule_id)
        
        # Преобразуем employee_id в int
        employee_id_int = None
        if employee_id:
            try:
                employee_id_int = int(employee_id)
            except (ValueError, TypeError):
                employee_id_int = None
        
        # ID сотрудника для отчета (user_id из ScheduleEmployee)
        report_employee_id = None
        
        # Преобразуем direction в строку
        direction = str(direction) if direction else None
        
        # Фильтруем сотрудников в зависимости от scope
        employees_to_report = []
        
        if scope == "direction" and direction:
            # Отчёт по направлению
            for se in schedule.employees:
                if se.employee.direction == direction:
                    employees_to_report.append(se)
        elif scope == "employee" and employee_id_int:
            # Отчёт по конкретному сотруднику
            # employee_id - это employee.id из Employee таблицы
            se = None
            
            # Ищем по employee_id (связь с таблицей Employee)
            se = ScheduleEmployee.query.filter(
                ScheduleEmployee.schedule_id == schedule_id,
                ScheduleEmployee.employee_id == employee_id_int
            ).first()
            
            # Если не нашли, ищем по user_id
            if not se:
                se = ScheduleEmployee.query.filter_by(
                    schedule_id=schedule_id,
                    user_id=employee_id_int
                ).first()
            
            # Если всё ещё не нашли, ищем по schedule_employee_id
            if not se:
                se = ScheduleEmployee.query.get(employee_id_int)
                if se and se.schedule_id == schedule_id:
                    pass
                else:
                    se = None
            
            if se:
                employees_to_report.append(se)
                # Сохраняем user_id для отчета
                report_employee_id = se.user_id or report_employee_id
        elif scope == "department":
            # Отчёт по отделу (все сотрудники графика)
            employees_to_report = schedule.employees
        else:  # scope == "schedule"
            # Отчёт по всему графику
            employees_to_report = schedule.employees
        
        if not employees_to_report:
            return jsonify({"error": "Нет сотрудников для отчёта"}), 400
        
        # Собираем данные
        report_data = []
        for se in employees_to_report:
            employee = se.employee
            vacations = []
            for v in se.vacation_entries:
                # Фильтр по дате
                if date_from:
                    date_from_obj = datetime.strptime(date_from, "%Y-%m-%d").date()
                    if v.end_date < date_from_obj:
                        continue
                if date_to:
                    date_to_obj = datetime.strptime(date_to, "%Y-%m-%d").date()
                    if v.start_date > date_to_obj:
                        continue
                vacations.append(v)
            
            report_data.append({
                "department": schedule.department.name if schedule.department else "",
                "employee_name": f"{employee.last_name} {employee.first_name}",
                "position": employee.position,
                "direction": employee.direction,
                "vacations": vacations
            })
        
        # Формируем имя файла (без кириллицы для совместимости с Linux)
        import unicodedata
        
        def transliterate(text):
            """Преобразует кириллицу в латиницу"""
            symbols = {
                'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
                'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
                'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
                'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
                'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
                'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
                'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
                'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
                'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
            }
            result = ''
            for char in text:
                result += symbols.get(char, char)
            return result
        
        # Оригинальное название для отображения в PDF
        display_report_file_name = f"Отчёт_{schedule.year}"
        if schedule.department:
            display_report_file_name += f"_{schedule.department.name}"
        
        # Латинизированное имя для файла
        report_file_name = f"Report_{schedule.year}"
        if schedule.department:
            report_file_name += f"_{transliterate(schedule.department.name)}"
        
        # Папка для отчетов - вне проекта для shared-хостинга
        reports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_reports")
        os.makedirs(reports_dir, exist_ok=True)
        
        filename = f"{report_file_name}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = os.path.join(reports_dir, filename)
        abs_file_path = file_path  # Уже абсолютный путь
        
        # Парсим даты для PDF
        parsed_date_from = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else None
        parsed_date_to = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else None
        
        # Информация о пользователе для PDF
        user_info = None
        if current_user.is_authenticated:
            user_info = {
                'full_name': f"{current_user.last_name} {current_user.first_name}",
                'department': current_user.department.name if current_user.department else '',
                'position': current_user.position.name if current_user.position else ''
            }
        
        # Дополнительная информация для PDF
        extra_info = {}
        if scope == "employee" and report_employee_id:
            # report_employee_id - это user_id из ScheduleEmployee
            user = User.query.get(report_employee_id)
            if user:
                extra_info['employee_name'] = f"{user.last_name} {user.first_name}"
        elif scope == "direction" and direction:
            extra_info['direction'] = direction
        
        # Сохраняем заготовку отчёта в БД
        report = Report(
            user_name=user_name if user_name else None,
            name=filename,
            schedule_id=schedule_id,
            department_id=schedule.department_id,
            scope=scope,
            employee_id=report_employee_id if scope == "employee" else None,
            date_from=parsed_date_from,
            date_to=parsed_date_to,
            file_path=file_path,
            status='success',
            created_by=current_user.id
        )
        db.session.add(report)
        db.session.commit()
        
        try:
            generate_pdf(abs_file_path, schedule, parsed_date_from, parsed_date_to, report_data, user_name if user_name else display_report_file_name, user_info, scope, extra_info)
        except Exception as e:
            import traceback
            error_msg = f"Отчет не был сформирован из-за внутренней ошибки: {str(e)}.\n\n{traceback.format_exc()}"
            report.status = 'error'
            db.session.commit()
            return jsonify({
                "success": False,
                "error": error_msg
            }), 500
        
        return jsonify({
            "success": True,
            "report_id": report.id,
            "file_path": file_path
        })
    
    except Exception as e:
        import traceback
        error_details = f"{str(e)}\n\n{traceback.format_exc()}"
        app.logger.error(f"Error generating report: {error_details}")
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@app.route("/api/reports/<int:report_id>/download")
@login_required
@require_permission("view_reports")
def download_report(report_id):
    report = Report.query.get_or_404(report_id)
    # абсолютный путь
    file_path = report.file_path
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=report.name
    )


@app.route("/api/reports")
@login_required
@require_permission("view_reports")
def get_reports():
    reports = Report.query.order_by(Report.created_at.desc()).all()
    
    return jsonify([{
        "id": r.id,
        "user_name": r.user_name,
        "name": r.name,
        "department": r.department.name if r.department else "Все отделы",
        "department_id": r.department_id,
        "schedule": r.schedule.name if r.schedule else "",
        "scope": r.scope,
        "date_from": r.date_from.strftime("%Y-%m-%d") if r.date_from else None,
        "date_to": r.date_to.strftime("%Y-%m-%d") if r.date_to else None,
        "created_by": f"{r.created_by_user.last_name} {r.created_by_user.first_name}" if r.created_by_user else "",
        "created_at": r.created_at.astimezone(MSK).strftime("%d.%m.%Y %H:%M"),
        "file_path": r.file_path,
        "status": r.status
    } for r in reports])


@app.route("/api/reports/<int:report_id>", methods=["DELETE"])
@login_required
@require_permission("view_reports")
def delete_report(report_id):
    report = Report.query.get_or_404(report_id)
    
    # абсолютный путь
    file_path = report.file_path
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    db.session.delete(report)
    db.session.commit()
    
    return jsonify({"success": True})


@app.route("/api/schedules/<int:schedule_id>/employees")
@login_required
def get_schedule_employees(schedule_id):
    """
        Получение списка сотрудников графика.

        Возвращает всех сотрудников, присутствующих в графике.
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)
    
    employees = []
    for se in schedule.employees:
        employee = se.employee
        user = User.query.get(se.user_id) if se.user_id else None
        
        employees.append({
            "id": employee.id,  # employee.id из таблицы Employee
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "position": employee.position,
            "email": user.email if user else None
        })
    
    return jsonify({"employees": employees})


@app.route("/api/schedules/<int:schedule_id>/directions")
@login_required
def get_schedule_directions(schedule_id):
    """
        Получение уникальных направлений из графика.

        Возвращает список направлений, которые есть у сотрудников в графике.
    """
    schedule = VacationSchedule.query.get_or_404(schedule_id)
    
    directions = set()
    for se in schedule.employees:
        if se.employee.direction:
            directions.add(se.employee.direction)
    
    return jsonify({"directions": sorted(list(directions))})



@app.route("/api/memo/generate", methods=["POST"])
@login_required
def generate_memo():
    """
        Генерация служебной записки в PDF по шаблону.
    """
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.colors import HexColor
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
        from io import BytesIO
        from datetime import datetime
        import os

        data = request.get_json()

        head_name = data.get("head_name", "")
        head_position = data.get("head_position", "")
        head_department = data.get("head_department", "")
        employee_name = data.get("employee_name", "")
        employee_position = data.get("employee_position", "")
        employee_department = data.get("employee_department", "")
        vac_from = data.get("vac_from", "")
        vac_to = data.get("vac_to", "")
        transfer_from = data.get("transfer_from", "")
        transfer_to = data.get("transfer_to", "")
        reason = data.get("reason", "")

        # Форматируем даты
        def fmt_date_full(date_str):
            """Формат: __.__.____"""
            if not date_str:
                return "__.__.__"
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d")
                return d.strftime("%d.%m.%Y")
            except:
                return "__.__.__"

        def fmt_date_range(date_from, date_to):
            """Формат: __.__ - __.__.__"""
            try:
                d_from = datetime.strptime(date_from, "%Y-%m-%d")
                d_to = datetime.strptime(date_to, "%Y-%m-%d")
                return f"{d_from.strftime('%d.%m')} - {d_to.strftime('%d.%m.%Y')}"
            except:
                return "__.__ - __.__.__"

        # Регистрируем шрифт
        try:
            pdfmetrics.registerFont(TTFont('TimesNewRoman', 'C:/Windows/Fonts/times.ttf'))
            pdfmetrics.registerFont(TTFont('TimesNewRomanBold', 'C:/Windows/Fonts/timesbd.ttf'))
        except:
            pass

        # Строим PDF с помощью canvas для полного контроля
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        page_width, page_height = A4

        # Отступы
        left_margin = 2 * cm
        right_margin = 2 * cm

        # ===== Логотип из файла (левый верхний угол) =====
        logo_path = os.path.join(app.root_path, "static", "img", "logo_for_memo.png")
        if os.path.exists(logo_path):
            try:
                logo_img = ImageReader(logo_path)
                logo_width = 6 * cm
                logo_height = 2.3 * cm
                c.drawImage(
                    logo_img,
                    left_margin,
                    page_height - logo_height - 0.3 * cm,
                    width=logo_width,
                    height=logo_height,
                    preserveAspectRatio=True
                )
            except:
                pass

        # ===== Шапка справа: данные руководителя =====
        # Поднимаем выше и уменьшаем отступ справа
        header_right_x = page_width - 1 * cm
        header_y = page_height - 2.5 * cm

        c.setFillColor(HexColor('#111827'))

        
        c.setFont('TimesNewRomanBold', 12)
        c.drawRightString(header_right_x, header_y, "Генеральному директору")
        header_y -= 13
        c.drawRightString(header_right_x, header_y, 'ООО «ТехноКад»')
        header_y -= 13
        c.drawRightString(header_right_x, header_y, "Елисееву О.Н.")
        header_y -= 15
        c.drawRightString(header_right_x, header_y, "от")
        header_y -= 14

        # Обычным: ФИО / Должность / Отдел
        c.setFont('TimesNewRoman', 12)
        data_line_h = 14

        c.drawRightString(header_right_x, header_y, f"Ф.И.О: {head_name}")
        header_y -= data_line_h
        c.drawRightString(header_right_x, header_y, f"Должность: {head_position}")
        header_y -= data_line_h
        c.drawRightString(header_right_x, header_y, f"Отдел: {head_department}")
        header_y -= data_line_h

        # Обычным: "Управления по работе с клиентами"
        c.drawRightString(header_right_x, header_y - 4, "Управления по работе с клиентами")

        # ===== Заголовок по центру =====
        title_y = page_height - 11.2 * cm
        c.setFont('TimesNewRomanBold', 12)
        title_text = "Служебная записка"
        title_width = c.stringWidth(title_text, 'TimesNewRomanBold', 12)
        c.drawString((page_width - title_width) / 2, title_y, title_text)

        # ===== Основной текст  =====
        # Отступ между заголовком и текстом
        body_y = title_y - 60
        body_font = 'TimesNewRoman'
        body_size = 12
        left_margin_body = 3 * cm    # левое поле 3 см
        right_margin_body = 1.5 * cm  # правое поле 1.5 см
        para_indent = 1.25 * cm       # абзацный отступ
        line_height = 14              # высота строки

        # Доступная ширина текста
        text_width = page_width - left_margin_body - right_margin_body

        c.setFont(body_font, body_size)

        # Функция для рисования текста: 1-я строка с красной строки, остальные с одинаковым левым и правым краем
        def draw_text_block(y, text):
            words = text.split()
            if not words:
                return y - line_height

            lines = []
            current_line = ""
            for word in words:
                test = (current_line + " " + word) if current_line else word
                if c.stringWidth(test, body_font, body_size) <= text_width:
                    current_line = test
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            if not lines:
                lines = [words[0]]

            # Правый край всех строк
            right_edge = left_margin_body + text_width

            # Рисуем строки — все строки с одинаковым правым краем
            for i, line in enumerate(lines):
                lw = c.stringWidth(line, body_font, body_size)
                if i == 0:
                    # Первая строка — с красной строки, дополняем пробелами до правого края
                    draw_x = left_margin_body + para_indent
                    spaces_needed = right_edge - draw_x - lw
                    if spaces_needed < 0:
                        spaces_needed = 0
                    space_char_width = c.stringWidth(" ", body_font, body_size)
                    num_spaces = int(spaces_needed / space_char_width)
                    full_line = line + " " * num_spaces
                    c.drawString(draw_x, y, full_line)
                else:
                    # Остальные строки — дополняем пробелами до правого края
                    draw_x = left_margin_body
                    spaces_needed = right_edge - draw_x - lw
                    if spaces_needed < 0:
                        spaces_needed = 0
                    space_char_width = c.stringWidth(" ", body_font, body_size)
                    num_spaces = int(spaces_needed / space_char_width)
                    full_line = line + " " * num_spaces
                    c.drawString(draw_x, y, full_line)
                y -= line_height
            return y

        # Весь текст одним блоком
        full_text = f"Прошу перенести очередной оплачиваемый отпуск {employee_position} " \
                    f"отдела {employee_department} Управления по работе с клиентами {employee_name} " \
                    f"с {fmt_date_range(vac_from, vac_to)} г. на {fmt_date_range(transfer_from, transfer_to)} г. в связи с {reason}."
        body_y = draw_text_block(body_y, full_text)

        # ===== Подпись и дата =====
        # Отступ 4 строки между телом записки и датой
        sig_y = body_y - 56

        c.setFont('TimesNewRoman', 12)
        date_x = left_margin_body

        # Дата
        c.drawString(date_x, sig_y, f"Дата: {fmt_date_full(vac_from)} г.")

        # Отступ 3 строки между датой и подписью
        sig_text_y = sig_y - 42
        c.drawString(date_x, sig_text_y, "Подпись: ________")

        # Сохраняем страницу
        c.showPage()
        c.save()
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='Служебная_записка.pdf'
        )

    except Exception as e:
        import traceback
        app.logger.error(f"Error generating memo: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Ошибка генерации документа: {str(e)}"}), 500


if __name__ == "__main__":
    """
        Точка входа для запуска приложения в режиме разработки.

        Запускает Flask-сервер с включённым debug-режимом.
        Используется при прямом запуске файла.
    """
    app.run(debug=True)
