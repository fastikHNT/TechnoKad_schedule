from extensions import db
from flask_login import UserMixin


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)

    users = db.relationship(
        "User",
        back_populates="role"
    )

    @property
    def display_name(self):
        return {
            "employee": "пользователь",
            "admin": "администратор",
            "super_admin": "супер-админ",
            "developer": "разработчик"
        }.get(self.name, self.name)
