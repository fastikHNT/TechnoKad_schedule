import re
import dns.resolver

def email_exists(email):
    """
    Валидация существования email-адреса.

    Функция email_exists(email):
    1. Проверяет корректность формата email с помощью регулярного выражения
    2. Проверяет наличие MX‑записей у домена

    Используется для предварительной проверки email при регистрации
    или восстановлении доступа.
    """

    # 1. Проверка формата
    pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    if not re.match(pattern, email):
        return False

    domain = email.split('@')[1]

    # 2. Проверка MX записей
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        return len(mx_records) > 0
    except:
        return False
