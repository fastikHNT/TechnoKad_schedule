from flask import abort
from flask_login import current_user
from functools import wraps
from flask import jsonify

# ---- РОЛИ ----

ROLE_EMPLOYEE = 1
ROLE_ADMIN = 2
ROLE_SUPER_ADMIN = 3
ROLE_DEVELOPER = 4

# ---- ПРАВА СИСТЕМЫ ----

PERMISSIONS = {

    # страницы
    "view_admin_page": [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_DEVELOPER],
    "view_reports": [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_DEVELOPER],
    "view_manual": [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_DEVELOPER],

    # действия
    "edit_user": [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_DEVELOPER],
    "delete_user": [ROLE_SUPER_ADMIN, ROLE_DEVELOPER],
    "restore_user": [ROLE_SUPER_ADMIN, ROLE_DEVELOPER],
}

# ---- ДЕКОРАТОР ПРОВЕРКИ ПРАВ ----

def require_permission(permission):
    """
    Декоратор проверки прав доступа.

    Принимает строку permission и проверяет:
    - авторизован ли пользователь
    - входит ли его роль в список разрешённых

    - возвращает 401 при отсутствии авторизации
    - возвращает 403 при недостатке прав
    """

    def decorator(func):
        """
        Внутренний декоратор для оборачивания Flask‑маршрута.
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            """
            Проверяет права текущего пользователя
            перед выполнением функции маршрута.
            """

            if not current_user.is_authenticated:
                return jsonify({
                    "success": False,
                    "error": "Необходимо войти в систему"
                }), 401

            allowed_roles = PERMISSIONS.get(permission, [])

            if current_user.role_id not in allowed_roles:
                return jsonify({
                    "success": False,
                    "error": "Недостаточно прав"
                }), 403

            return func(*args, **kwargs)

        return wrapper

    return decorator

# ---- ПРОВЕРКА РЕДАКТИРОВАНИЯ ПОЛЬЗОВАТЕЛЯ ----

def can_edit_user(target_user):
    """
    Проверяет, может ли текущий пользователь редактировать target_user.

    Логика:
    - Никто не может редактировать сам себя
    - Разработчик может редактировать всех, кроме себя
    - Супер Админ не может редактировать других Супер-админов и разработчика
    - Админ может редактировать только пользователя
    - Пользователь не может редактировать никого
    """

    if target_user.id == current_user.id:
        return False

    if current_user.role_id == ROLE_DEVELOPER:
        return True

    if current_user.role_id == ROLE_SUPER_ADMIN:

        if target_user.role_id in [ROLE_SUPER_ADMIN, ROLE_DEVELOPER]:
            return False

        return True

    if current_user.role_id == ROLE_ADMIN:
        return target_user.role_id == ROLE_EMPLOYEE

    return False

# ---- ПРОВЕРКА НАЗНАЧЕНИЯ РОЛИ ----

def can_assign_role(new_role_id):
    """
    Проверяет, может ли текущий пользователь назначить новую роль.

    Логика:
    - Разработчик может назначать любые роли, кроме своей собственной
    - Супер-админ не может назначать роль Разработчик
    - Админ может назначать только роль пользователя
    - Пользователь не может назначать роли
    """

    if current_user.role_id == ROLE_DEVELOPER:
        return new_role_id != ROLE_DEVELOPER or False

    if current_user.role_id == ROLE_SUPER_ADMIN:
        return new_role_id != ROLE_DEVELOPER

    if current_user.role_id == ROLE_ADMIN:
        return new_role_id == ROLE_EMPLOYEE

    return False

# ---- КОМПЛЕКСНАЯ ПРОВЕРКА ----

def validate_user_update(target_user, new_role_id=None):
    """
    Проверяет можно ли изменить пользователя.

    Выполняет:
    1. Проверку права редактирования пользователя
    2. Проверку права назначения новой роли (если передана)

    Возвращает:
    (True, None) — если изменение разрешено
    (False, "сообщение") — если прав недостаточно
    """

    if not can_edit_user(target_user):
        return False, "Недостаточно прав для редактирования данного пользователя"

    if new_role_id is not None:
        if not can_assign_role(int(new_role_id)):
            return False, "Недостаточно прав для назначения этой роли"

    return True, None