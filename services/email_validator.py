import re
import dns.resolver
import smtplib

def email_exists(email):
    """
    Валидация существования email-адреса.

    Функция email_exists(email):
    1. Проверяет корректность формата email с помощью регулярного выражения
    2. Проверяет наличие MX‑записей у домена
    3. Пытается установить SMTP‑соединение и выполнить RCPT команду,
       чтобы определить, принимает ли сервер письма на указанный email

    Используется для предварительной проверки email при регистрации
    или восстановлении доступа.
    """

    # 1. Проверка формата
    pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    if not re.match(pattern, email):
        return False

    domain = email.split('@')[1]

    # 2. Проверка MX записи
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        mx_record = str(mx_records[0].exchange)
    except:
        return False

    # 3. SMTP проверка
    try:
        server = smtplib.SMTP(timeout=7)
        server.connect(mx_record)
        server.ehlo()

        server.mail("technokadschedule@gmail.com")
        code, message = server.rcpt(email)

        server.quit()

        return code == 250

    except:
        return False
