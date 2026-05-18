from extensions import db
from flask_login import UserMixin

class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    email = db.Column(db.String(255), unique=True, nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))

    password_hash = db.Column(db.String(255), nullable=False)

    is_registered = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime)



