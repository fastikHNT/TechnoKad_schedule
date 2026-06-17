from extensions import db
from datetime import datetime, timedelta


class ActivationToken(db.Model):
    __tablename__ = "activation_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    token = db.Column(db.String(200), unique=True, nullable=False)
    used = db.Column(db.Boolean, default=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.utcnow() + timedelta(hours=3),
        nullable=False
    )
