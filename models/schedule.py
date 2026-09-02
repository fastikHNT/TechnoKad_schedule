from datetime import datetime
from extensions import db


class TypeVacation(db.Model):
    __tablename__ = "type_vacation"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    def __repr__(self):
        return f"<TypeVacation {self.name}>"


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(255))
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="SET NULL"))

    department = db.relationship("Department", backref="employees")

    def __repr__(self):
        return f"<Employee {self.last_name} {self.first_name}>"


class VacationSchedule(db.Model):
    __tablename__ = "vacation_schedules"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    who_created = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    department = db.relationship("Department", backref="vacation_schedules")

    employees = db.relationship(
        "ScheduleEmployee",
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="ScheduleEmployee.sort_order"
    )

    def __repr__(self):
        return f"<VacationSchedule {self.name} {self.year}>"


class ScheduleEmployee(db.Model):
    __tablename__ = "schedule_employees"

    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(
        db.Integer,
        db.ForeignKey("vacation_schedules.id", ondelete="CASCADE"),
        nullable=False
    )
    employee_id = db.Column(
        db.Integer,
        db.ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False
    )
    sort_order = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.UniqueConstraint("schedule_id", "employee_id", name="uq_schedule_employee"),
    )

    schedule = db.relationship(
        "VacationSchedule",
        back_populates="employees"
    )

    employee = db.relationship("Employee")

    vacation_entries = db.relationship(
        "Vacation",
        back_populates="schedule_employee",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<ScheduleEmployee schedule={self.schedule_id} employee={self.employee_id}>"


class Vacation(db.Model):
    __tablename__ = "vacations"

    id = db.Column(db.Integer, primary_key=True)

    schedule_employee_id = db.Column(
        db.Integer,
        db.ForeignKey("schedule_employees.id", ondelete="CASCADE"),
        nullable=False
    )

    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    position = db.Column(db.String(255))

    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    type_vacation_id = db.Column(
        db.Integer,
        db.ForeignKey("type_vacation.id"),
        nullable=True
    )

    type_vacation = db.relationship("TypeVacation")

    __table_args__ = (
        db.CheckConstraint("end_date >= start_date", name="check_dates"),
    )

    schedule_employee = db.relationship(
        "ScheduleEmployee",
        back_populates="vacation_entries"
    )

    def __repr__(self):
        return f"<Vacation {self.start_date} - {self.end_date}>"