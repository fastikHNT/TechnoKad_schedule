import sys
sys.path.insert(0, '.')

from datetime import datetime, date
from app import generate_pdf

# Тестовые данные
class MockSchedule:
    year = 2024
    department = None

class MockVacation:
    start_date = date(2024, 6, 1)
    end_date = date(2024, 6, 14)

class MockEmployee:
    employee_name = "Иванов Иван"
    position = "Инженер"
    direction = "ПО/ЭЦП"
    vacations = [MockVacation()]

report_data = [{
    "department": "",
    "employee_name": "Иванов Иван",
    "position": "Инженер",
    "direction": "ПО/ЭЦП",
    "vacations": [MockVacation()]
}]

try:
    generate_pdf(
        file_path="test_output.pdf",
        schedule=MockSchedule(),
        date_from=date(2024, 1, 1),
        date_to=date(2024, 12, 31),
        report_data=report_data,
        report_name="Тестовый отчет",
        user_info={"full_name": "Тест Тестов", "department": "Тест", "position": "Инженер"},
        scope="department"
    )
    print("PDF generated successfully!")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
