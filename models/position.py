from extensions import db

class Position(db.Model):
    __tablename__ = "positions"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    department_id = db.Column(
        db.Integer,
        db.ForeignKey("departments.id")
    )

    users = db.relationship(
        "User",
        back_populates="position"
    )

