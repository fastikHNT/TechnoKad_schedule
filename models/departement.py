from extensions import db
from flask_login import UserMixin


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    users = db.relationship(
        "User",
        back_populates="department",
        cascade="all, delete"
    )
