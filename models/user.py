from extensions import db
from flask_login import UserMixin
from datetime import datetime

class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    email = db.Column(db.String(120), unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)

    password_hash = db.Column(db.String(255), nullable=False)
    password_changed_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_registered = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    avatar = db.Column(db.String(255))
    phone = db.Column(db.String(30))
    is_active = db.Column(db.Boolean, default=True)

    position_id = db.Column(
        db.Integer,
        db.ForeignKey("positions.id"),
        nullable=True
    )

    department_id = db.Column(
        db.Integer,
        db.ForeignKey("departments.id"),
        nullable=True
    )

    role_id = db.Column(
        db.Integer,
        db.ForeignKey("roles.id"),
        nullable=False
    )


    position = db.relationship(
        "Position",
        back_populates="users"
    )

    department = db.relationship(
        "Department",
        back_populates="users"
    )

    role = db.relationship(
        "Role",
        back_populates="users"
    )
