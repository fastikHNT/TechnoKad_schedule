(function() {
    "use strict";

    const exportState = {
        departmentId: null,
        scheduleId: null,
        scheduleData: null,
        currentUserId: null,
        userRole: null,
        userDepartmentId: null
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

    // Маппинг названий отделов
    const DEPARTMENT_NAMES = {
        '1': 'Отдел по работе с клиентами',
        '2': 'Отдел технической поддержки',
        'ОК': 'Отдел по работе с клиентами',
        'ОТП': 'Отдел технической поддержки'
    };

    function getDepartmentName(id, shortName) {
        if (DEPARTMENT_NAMES[id]) return DEPARTMENT_NAMES[id];
        if (DEPARTMENT_NAMES[shortName]) return DEPARTMENT_NAMES[shortName];
        return shortName || 'Отдел';
    }

    // Загрузка текущего пользователя
    async function loadCurrentUser() {
        try {
            const r = await fetch("/api/current-user");
            if (!r.ok) return;
            const user = await r.json();
            exportState.currentUserId = user.id;
            exportState.userRole = user.role_id;
            exportState.userDepartmentId = user.department_id;

            const deptSelect = document.getElementById('exportDepartmentFilter');
            const scheduleFilter = document.getElementById('exportScheduleFilter');
            
            // Заполняем отделы для супер-админов и разработчиков
            if (exportState.userRole === 3 || exportState.userRole === 4) {
                // Загружаем отделы из API
                try {
                    const optsResp = await fetch('/api/admin/options');
                    if (optsResp.ok) {
                        const opts = await optsResp.json();
                        const departments = opts.departments || [];
                        
                        // Очищаем и заполняем отделы
                        deptSelect.innerHTML = '<option value="">Выберите отдел</option>';
                        departments.forEach(d => {
                            const opt = document.createElement('option');
                            opt.value = d.id;
                            opt.textContent = getDepartmentName(d.id, d.name);
                            deptSelect.appendChild(opt);
                        });
                        
                        // Выбираем отдел текущего супер-админа/разработчика
                        if (exportState.userDepartmentId) {
                            deptSelect.value = exportState.userDepartmentId;
                            await onDepartmentChange();
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
            // Для сотрудников (role_id = 1) и админов (role_id = 2) - автозаполнение отдела
            else if (exportState.userDepartmentId) {
                // Ищем опцию с нужным department_id
                let deptName = '';
                for (let i = 0; i < deptSelect.options.length; i++) {
                    if (Number(deptSelect.options[i].value) === exportState.userDepartmentId) {
                        deptName = deptSelect.options[i].textContent;
                        break;
                    }
                }
                
                // Если не нашли в опциях, пробуем получить из API
                if (!deptName) {
                    try {
                        const optsResp = await fetch('/api/admin/options');
                        if (optsResp.ok) {
                            const opts = await optsResp.json();
                            const dept = opts.departments?.find(d => Number(d.id) === exportState.userDepartmentId);
                            if (dept) deptName = getDepartmentName(dept.id, dept.name);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                
                // Если всё ещё нет названия, используем дефолтное
                if (!deptName) {
                    deptName = getDepartmentName(exportState.userDepartmentId, 'Отдел');
                }
                
                // Оставляем только один отдел текущего пользователя
                deptSelect.innerHTML = '';
                const opt = document.createElement('option');
                opt.value = exportState.userDepartmentId;
                opt.textContent = deptName;
                deptSelect.appendChild(opt);
                deptSelect.value = exportState.userDepartmentId;
                
                // Блокируем изменение отдела
                deptSelect.disabled = true;
                
                // Автоматически загружаем графики
                await onDepartmentChange();
            }
        } catch (e) {
            // ignore
        }
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

        const titleEl = document.getElementById('exportScheduleTitle');
        if (titleEl) titleEl.classList.add('hidden');

        scheduleFilter.innerHTML = '<option value="">Выберите график</option>';

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

            // Разблокируем фильтр графика для админов (role_id = 2), супер-админов (3) и разработчиков (4)
            if (exportState.userRole >= 2) {
                scheduleFilter.disabled = false;
            }

            // Автовыбор графика по умолчанию (первый или is_default)
            if (schedules.length > 0) {
                const defaultSchedule = schedules.find(s => s.is_default) || schedules[0];
                if (defaultSchedule) {
                    scheduleFilter.value = defaultSchedule.id;
                    await onScheduleChange();
                }
            }
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
            const titleEl = document.getElementById('exportScheduleTitle');
            if (titleEl) titleEl.classList.add('hidden');
            toggle(grid, false);
            toggle(directionLegend, false);
            toggle(vacationLegend, false);
            toggle(buttonRow, false);
            return;
        }

        try {
            const r = await fetch(`/api/export/schedule/${scheduleId}`);
            if (!r.ok) {
                const errorText = await r.text();
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
            exportState.scheduleData = data;
            renderSchedulePreview(data);

            // Устанавливаем заголовок с названием графика
            const titleEl = document.getElementById('exportScheduleTitle');
            if (titleEl && data.name) {
                titleEl.textContent = data.name;
                titleEl.classList.remove('hidden');
            }

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
                        tooltip = `📅 ${formatDate(vacation.start_date)} - ${formatDate(vacation.end_date)} (${daysDiff} ${daysWord})`;

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

        // Загрузка текущего пользователя для автозаполнения
        loadCurrentUser();
    }

    window.initExportPage = initExportPage;
})();
