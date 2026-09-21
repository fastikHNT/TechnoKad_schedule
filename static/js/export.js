(function() {
    "use strict";

    const exportState = {
        departmentId: null,
        scheduleId: null,
        scheduleData: null
    };

    let messageTimeout = null;

    function showMessage(text, type = "info") {
        const messageBox = document.getElementById('messageBox');
        if (!messageBox) return;

        if (messageTimeout) clearTimeout(messageTimeout);

        messageBox.textContent = text;
        messageBox.className = 'admin-message admin-' + type;
        messageBox.classList.add('show');

        messageTimeout = setTimeout(() => {
            messageBox.classList.remove('show');
        }, 5000);
    }

    function toggle(element, show) {
        if (!element) return;
        element.classList.toggle("hidden", !show);
    }

    function getDirectionClass(direction) {
        if (!direction) return "";
        const classMap = {
            "ПО/ЭЦП": "dir-po-ecp",
            "ТЭ/ТГ": "dir-te-tg",
            "ТО/ТМ": "dir-to-tm",
            "ГРП": "dir-grp"
        };
        return classMap[direction] || "";
    }

    function getVacationTypeClass(typeId) {
        switch(parseInt(typeId)) {
            case 2: return "type-education";
            case 3: return "type-planned";
            case 4: return "type-decreetal";
            default: return "type-main";
        }
    }

    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString("ru-RU");
    }

    // Загрузка графиков при выборе отдела
    async function onDepartmentChange() {
        const deptId = document.getElementById('exportDepartmentFilter').value;
        const scheduleFilter = document.getElementById('exportScheduleFilter');
        const grid = document.getElementById('exportVacationGrid');
        const directionLegend = document.getElementById('exportDirectionLegend');
        const vacationLegend = document.getElementById('exportVacationLegend');
        const buttonRow = document.getElementById('exportButtonRow');

        exportState.departmentId = deptId ? parseInt(deptId) : null;
        exportState.scheduleId = null;
        exportState.scheduleData = null;

        scheduleFilter.innerHTML = '<option value="">Выберите график</option>';
        scheduleFilter.disabled = !deptId;

        toggle(grid, false);
        toggle(directionLegend, false);
        toggle(vacationLegend, false);
        toggle(buttonRow, false);

        if (!deptId) return;

        try {
            const r = await fetch(`/api/export/schedules/${deptId}`);
            if (!r.ok) return;
            const schedules = await r.json();

            schedules.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                const yearSuffix = s.year ? ` (${s.year} год)` : '';
                opt.textContent = s.name + yearSuffix + (s.is_default ? ' 📌' : '');
                scheduleFilter.appendChild(opt);
            });
        } catch (e) {
            // ignore
        }
    }

    // Загрузка и рендер графика при выборе
    async function onScheduleChange() {
        const scheduleId = document.getElementById('exportScheduleFilter').value;
        const grid = document.getElementById('exportVacationGrid');
        const directionLegend = document.getElementById('exportDirectionLegend');
        const vacationLegend = document.getElementById('exportVacationLegend');
        const buttonRow = document.getElementById('exportButtonRow');

        exportState.scheduleId = scheduleId ? parseInt(scheduleId) : null;

        if (!scheduleId) {
            toggle(grid, false);
            toggle(directionLegend, false);
            toggle(vacationLegend, false);
            toggle(buttonRow, false);
            return;
        }

        try {
            console.log('Fetching schedule:', `/api/export/schedule/${scheduleId}`);
            const r = await fetch(`/api/export/schedule/${scheduleId}`);
            console.log('Response status:', r.status);
            if (!r.ok) {
                const errorText = await r.text();
                console.error('Error response:', errorText);
                let error;
                try {
                    error = JSON.parse(errorText);
                } catch {
                    error = { error: errorText };
                }
                showMessage(error.error || `Ошибка ${r.status}`, "error");
                return;
            }
            const data = await r.json();
            console.log('Schedule data:', data);
            exportState.scheduleData = data;
            renderSchedulePreview(data);

            toggle(grid, true);
            toggle(directionLegend, true);
            toggle(vacationLegend, true);
            toggle(buttonRow, true);
        } catch (e) {
            showMessage("Ошибка загрузки графика", "error");
        }
    }

    // Рендер таблицы предпросмотра
    function renderSchedulePreview(data) {
        console.log('Rendering schedule preview...');
        const tbody = document.getElementById('exportScheduleTableBody');
        if (!tbody) {
            console.error('Table body not found');
            return;
        }

        try {
            tbody.innerHTML = '';

            if (!data || !data.employees || data.employees.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="15" class="empty">В графике пока нет сотрудников</td>';
                tbody.appendChild(tr);
                return;
            }

            const year = data?.year || 2026;
            console.log('Rendering', data.employees.length, 'employees');

            data.employees.forEach(emp => {
            const tr = document.createElement('tr');
            tr.dataset.employeeId = emp.schedule_employee_id;

            // Определяем отпуска по месяцам
            const monthVacations = new Array(12).fill(null);
            for (const vac of (emp.vacations || [])) {
                const vacStart = new Date(vac.start_date);
                const vacEnd = new Date(vac.end_date);
                const startMonth = vacStart.getMonth();
                const endMonth = vacEnd.getMonth();
                for (let m = startMonth; m <= endMonth; m++) {
                    if (m >= 0 && m < 12) {
                        monthVacations[m] = vac;
                    }
                }
            }

            // Создаём ячейки месяцев
            let months = '';
            for (let m = 0; m < 12; m++) {
                const vacation = monthVacations[m];
                let cellClass = 'month-cell';
                let cellContent = '';
                let tooltip = '';

                if (vacation) {
                    const typeClass = getVacationTypeClass(vacation.type_vacation_id);
                    cellClass += ` vacation-cell ${typeClass}`;

                    let bgColor = '#1e3a8a';
                    if (typeClass === 'type-education') bgColor = '#60a5fa';
                    else if (typeClass === 'type-planned') bgColor = '#fbbf24';
                    else if (typeClass === 'type-decreetal') bgColor = '#16a34a';

                    const vacStart = new Date(vacation.start_date);
                    const vacEnd = new Date(vacation.end_date);
                    const startMonth = vacStart.getMonth();
                    const endMonth = vacEnd.getMonth();
                    const startDay = vacStart.getDate();
                    const endDay = vacEnd.getDate();

                    let leftPercent = 0;
                    let widthPercent = 100;
                    let borderRadius = '0';

                    if (m === startMonth && m === endMonth) {
                        const daysInMonth = new Date(year, m + 1, 0).getDate();
                        leftPercent = ((startDay - 1) / daysInMonth) * 100;
                        widthPercent = ((endDay - startDay + 1) / daysInMonth) * 100;
                        borderRadius = '4px';
                    } else if (m === startMonth) {
                        const daysInMonth = new Date(year, m + 1, 0).getDate();
                        leftPercent = ((startDay - 1) / daysInMonth) * 100;
                        widthPercent = 100 - leftPercent;
                        borderRadius = '4px 0 0 4px';
                    } else if (m === endMonth) {
                        const daysInMonth = new Date(year, m + 1, 0).getDate();
                        widthPercent = (endDay / daysInMonth) * 100;
                        borderRadius = '0 4px 4px 0';
                    }

                    const daysDiff = Math.round((vacEnd - vacStart) / (1000 * 60 * 60 * 24)) + 1;
                    const daysWord = declineVacationDays(daysDiff);
                    const tooltip = `📅 ${formatDate(vacation.start_date)} - ${formatDate(vacation.end_date)} (${daysDiff} ${daysWord})`;

                    cellContent = `<div style="position: absolute; top: 0; left: ${leftPercent}%; width: ${widthPercent}%; height: 100%; background: ${bgColor}; border-radius: ${borderRadius}; pointer-events: none;"></div>`;
                }

                months += `<td class="${cellClass}" data-month="${m}" data-tooltip="${tooltip}" data-vacation-id="${vacation?.id || ''}" data-vacation-type="${vacation?.type_vacation_id || ''}" style="position: relative;">${cellContent}</td>`;
            }

            const directionClass = getDirectionClass(emp.direction);
            tr.innerHTML = `
                <td class="col-name ${directionClass}">${emp.first_name ?? ''}</td>
                <td class="col-name ${directionClass}">${emp.last_name ?? ''}</td>
                <td class="col-position">${emp.position ?? ''}</td>
                ${months}
            `;

            tbody.appendChild(tr);
        });
        console.log('Render complete');
    } catch (err) {
        console.error('Render error:', err);
        showMessage('Ошибка рендеринга: ' + err.message, 'error');
    }
}

    function declineVacationDays(count) {
        const abs = Math.abs(count) % 100;
        const lastDigit = abs % 10;
        if (abs > 10 && abs < 20) return 'дней';
        if (lastDigit > 1 && lastDigit < 5) return 'дня';
        if (lastDigit === 1) return 'день';
        return 'дней';
    }

    // Модальное окно выбора формата
    function showExportFormatModal() {
        if (!exportState.scheduleId) {
            showMessage("Сначала выберите график", "warning");
            return;
        }
        toggle(document.getElementById('exportFormatModal'), true);
    }

    function closeExportFormatModal() {
        toggle(document.getElementById('exportFormatModal'), false);
    }

    async function exportSchedule(format) {
        if (!exportState.scheduleId) return;

        closeExportFormatModal();
        showMessage(`Формирование файла ${format}...`, 'info');

        try {
            const url = `/api/export/${format}/${exportState.scheduleId}`;
            const r = await fetch(url);
            if (!r.ok) {
                const error = await r.json();
                showMessage(error.error || 'Ошибка экспорта', 'error');
                return;
            }
            const blob = await r.blob();
            const filename = r.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `export.${format}`;
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
            showMessage('Файл успешно сформирован', 'success');
        } catch (err) {
            showMessage('Ошибка при экспорте', 'error');
        }
    }

    // Инициализация
    function initExportPage() {
        const deptFilter = document.getElementById('exportDepartmentFilter');
        const scheduleFilter = document.getElementById('exportScheduleFilter');
        const exportBtn = document.getElementById('exportBtn');
        const exportCancelBtn = document.getElementById('exportCancelBtn');
        const pdfOption = document.getElementById('exportPdfOption');
        const excelOption = document.getElementById('exportExcelOption');

        if (deptFilter) {
            deptFilter.addEventListener('change', onDepartmentChange);
        }
        if (scheduleFilter) {
            scheduleFilter.addEventListener('change', onScheduleChange);
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', showExportFormatModal);
        }
        if (exportCancelBtn) {
            exportCancelBtn.addEventListener('click', closeExportFormatModal);
        }
        if (pdfOption) {
            pdfOption.addEventListener('click', () => exportSchedule('pdf'));
        }
        if (excelOption) {
            excelOption.addEventListener('click', () => exportSchedule('excel'));
        }

        // Закрытие по клику на оверлей
        const modal = document.getElementById('exportFormatModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeExportFormatModal();
            });
        }

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeExportFormatModal();
        });
    }

    window.initExportPage = initExportPage;
})();
