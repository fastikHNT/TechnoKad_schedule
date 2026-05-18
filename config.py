import datetime

class Config:
    SECRET_KEY = "40e72d60cded4313534060ca1b7cd2680b95d22f910884bdd0c6808c0ff4bed4a4232e6d478a589df9d6a5846f5dfb71dfe116564dc5939d9664d98bdb1b5b41"

    SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:@localhost/technokad"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    REMEMBER_COOKIE_DURATION = datetime.timedelta(hours=24)

    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False

    MAIL_USERNAME = "technokadschedule@gmail.com"
    MAIL_PASSWORD = "owzvanazsdxggblh"

    MAIL_DEFAULT_SENDER = "technokadschedule@gmail.com"
