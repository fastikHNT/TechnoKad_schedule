from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from flask import session

from models.schedule import VacationSchedule

RECAPTCHA_SECRET_KEY = "6LfgCSQtAAAAAOSljwxPwatX3zfBF7YMj9co5-m3"

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


from models.activation_token import ActivationToken

from services.token_service import generate_token
from services.email_service import send_email
from services.email_validator import email_exists

import os
from permissions import require_permission, can_edit_user, can_assign_role

from flask import jsonify, request, url_for
from werkzeug.utils import secure_filename
from flask_login import current_user, login_required

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

db.init_app(app)
login_manager.init_app(app)
# Куда перенаправляем неавторизованных пользователей
login_manager.login_view = 'authorization'

# Сообщение при попытке доступа к защищённой странице
login_manager.login_message = "Пожалуйста, авторизуйтесь, чтобы получить доступ к данной странице."
login_manager.login_message_category = "warning"
mail.init_app(app)


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
                is_active = True
            )
            db.session.add(user)
            db.session.commit()
        else:
            user.first_name = first_name
            user.last_name = last_name
            user.password_hash = password_hash
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

    if not activation or activation.expires_at > msk_now():
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

    reset_token = ActivationToken(
        user_id=user.id,
        token=token,
        expires_at=msk_now() + timedelta(hours=1)
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

    if not activation or activation.expires_at < msk_now():
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

    if department_id is None or position_id is None or role_id is None:
        return jsonify({"success": False, "error": "Не заполнены обязательные поля"}), 400

    try:
        department_id = int(department_id)
        position_id = int(position_id)
        role_id = int(role_id)
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
        "role": current_user.role.name if current_user.role else None,
        "role_display": ROLE_TRANSLATIONS.get(
            current_user.role.name if current_user.role else None,
            current_user.role.name if current_user.role else None
        ),
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
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "position": employee.position,
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
                "position_name": u.position.name if u.position else None
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
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "position": employee.position,
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
                department_id=schedule.department_id
            )
            db.session.add(employee)
            db.session.flush()

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
        else:
            employee = Employee(
                first_name=data["first_name"],
                last_name=data["last_name"],
                position=data.get("position", ""),
                department_id=schedule.department_id
            )
            db.session.add(employee)
            db.session.flush()

    else:
        return jsonify({"error": "Не указаны данные сотрудника"}), 400

    # Создаём связь
    schedule_employee = ScheduleEmployee(
        schedule_id=schedule.id,
        employee_id=employee.id
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

    if not all([schedule_employee_id, start_date, end_date]):
        return jsonify({"error": "Не указаны обязательные поля"}), 400

    schedule_employee = ScheduleEmployee.query.get_or_404(schedule_employee_id)
    employee = schedule_employee.employee

    vacation = Vacation(
        schedule_employee_id=schedule_employee_id,
        first_name=employee.first_name,
        last_name=employee.last_name,
        position=employee.position,
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
    """
    schedule_employee = ScheduleEmployee.query.get_or_404(schedule_employee_id)
    db.session.delete(schedule_employee)
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




if __name__ == "__main__":
    """
        Точка входа для запуска приложения в режиме разработки.

        Запускает Flask-сервер с включённым debug-режимом.
        Используется при прямом запуске файла.
    """
    app.run(debug=True)
