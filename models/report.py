from datetime import datetime
from zoneinfo import ZoneInfo
from extensions import db

MSK = ZoneInfo("Europe/Moscow")

class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    schedule_id = db.Column(db.Integer, db.ForeignKey("vacation_schedules.id"))
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    scope = db.Column(db.String(50))  # employee, department, schedule
    employee_id = db.Column(db.Integer, db.ForeignKey("users.id"))  # None = все сотрудники
    date_from = db.Column(db.Date)
    date_to = db.Column(db.Date)
    file_path = db.Column(db.String(500))
    status = db.Column(db.String(50), default='success')  # success, error
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(MSK))
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    schedule = db.relationship("VacationSchedule")
    department = db.relationship("Department")
    employee = db.relationship("User", foreign_keys=[employee_id])
    created_by_user = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<Report {self.name} {self.year}>"