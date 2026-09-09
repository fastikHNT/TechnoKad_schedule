(function() {
    "use strict";
    
    console.log("reports.js loaded");

    const reportsState = {
        reports: [],
        currentUserId: null,
        currentUserEmail: null,
        userRole: null,
        userDepartmentId: null,
        schedules: []
    };

    let messageTimeout = null;

    function showMessage(text, type = "info") {
        const messageBox = document.getElementById('messageBox');
        if (!messageBox) {
            console.log(`[${type}] ${text}`);
            return;
        }

        // Очищаем предыдущий таймер
        if (messageTimeout) {
            clearTimeout(messageTimeout);
        }

        messageBox.textContent = text;
        messageBox.className = 'admin-message admin-' + type;
        messageBox.classList.add('show');

        messageTimeout = setTimeout(() => {
            messageBox.classList.remove('show');
        }, 5000);
    }

    // API методы
    const reportsApi = {
        async getCurrentUser() {
            const r = await fetch("/api/current-user");
            if (!r.ok) return null;
            return await r.json();
        },

        async getSchedules(departmentId) {
            const r = await fetch(`/api/schedules/${departmentId}`);
            if (!r.ok) return [];
            return await r.json();
        },

        async getReports() {
            const r = await fetch("/api/reports");
            if (!r.ok) return [];
            return await r.json();
        },

        async getScheduleEmployees(scheduleId) {
            const r = await fetch(`/api/schedule/${scheduleId}`);
            if (!r.ok) return [];
            const data = await r.json();
            return data.employees || [];
        },

        async generateReport(data) {
            const r = await fetch("/api/reports/generate", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(data)
            });
            if (!r.ok) {
                const error = await r.json();
                throw new Error(error.error || "Ошибка формирования отчета");
            }
            return await r.json();
        },

        async getScheduleDirections(scheduleId) {
            const r = await fetch(`/api/schedules/${scheduleId}/directions`);
            if (!r.ok) return [];
            const data = await r.json();
            return data.directions || [];
        },

        async deleteReport(reportId) {
            const r = await fetch(`/api/reports/${reportId}`, {
                method: "DELETE"
            });
            if (!r.ok) {
                throw new Error("Ошибка удаления отчета");
            }
            return await r.json();
        }
    };

    // Перевод типа отчета
    function getReportTypeTranslation(scope) {
        const types = {
            'department': 'по отделу',
            'direction': 'по направлению',
            'employee': 'по сотруднику'
        };
        return types[scope] || scope;
    }

    // Загрузка текущего пользователя
    async function loadCurrentUser() {
        const user = await reportsApi.getCurrentUser();
        if (user) {
            reportsState.currentUserId = user.id;
            reportsState.currentUserEmail = user.email;
            reportsState.userRole = user.role_id;
            reportsState.userDepartmentId = user.department_id;

            // Для админов (role_id = 2) - показываем только их отдел, блокируем изменение
            if (reportsState.userRole === 2) {
                const deptSelect = document.getElementById('reportDepartment');
                if (deptSelect && reportsState.userDepartmentId) {
                    // Ищем опцию с нужным department_id ДО очистки
                    let deptName = '';
                    for (let i = 0; i < deptSelect.options.length; i++) {
                        if (Number(deptSelect.options[i].value) === reportsState.userDepartmentId) {
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
                                const dept = opts.departments?.find(d => Number(d.id) === reportsState.userDepartmentId);
                                if (dept) deptName = dept.name;
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                    
                    // Если всё ещё нет названия, используем дефолтное
                    if (!deptName) {
                        deptName = 'Отдел';
                    }
                    
                    // Оставляем только один отдел текущего админа
                    deptSelect.innerHTML = '';
                    const opt = document.createElement('option');
                    opt.value = reportsState.userDepartmentId;
                    opt.textContent = deptName;
                    deptSelect.appendChild(opt);
                    deptSelect.value = reportsState.userDepartmentId;
                    
                    // Блокируем изменение
                    deptSelect.disabled = true;
                    
                    // Автоматически загружаем графики (без очистки deptSelect)
                    const schedules = await reportsApi.getSchedules(reportsState.userDepartmentId);
                    reportsState.schedules = schedules;
                    
                    const scheduleSelect = document.getElementById('reportSchedule');
                    if (scheduleSelect) {
                        scheduleSelect.innerHTML = '<option value="">Сначала выберите график</option>';
                        if (schedules.length === 0) {
                            showMessage('Для выбранного отдела графики не найдены', 'warning');
                            scheduleSelect.disabled = true;
                        } else {
                            schedules.forEach(s => {
                                const opt = document.createElement('option');
                                opt.value = s.id;
                                opt.textContent = s.name + (s.year ? ` (${s.year} год)` : '');
                                scheduleSelect.appendChild(opt);
                            });
                            scheduleSelect.disabled = false;
                            showMessage('Выберите график из списка', 'info');
                        }
                    }
                }
            }
            // Для обычных сотрудников (role_id = 1) - блокируем фильтры
            else if (reportsState.userRole !== 3 && reportsState.userRole !== 4) {
                const deptSelect = document.getElementById('reportDepartment');
                if (deptSelect) {
                    deptSelect.disabled = true;
                    deptSelect.value = reportsState.userDepartmentId || '';
                    if (reportsState.userDepartmentId) {
                        await onDepartmentChange();
                    }
                }
            }
        }
    }

    // Загрузка отчетов
    async function loadReports() {
        const reports = await reportsApi.getReports();
        reportsState.reports = reports;
        renderReportsTable();
    }

    // Рендер таблицы отчетов
    function renderReportsTable() {
        const tbody = document.getElementById('reportsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Фильтрация по роли
        let filteredReports = reportsState.reports;
        if (reportsState.userRole === 2) {
            // Для админов - только отчеты своего отдела
            filteredReports = reportsState.reports.filter(r => {
                return Number(r.department_id) === Number(reportsState.userDepartmentId);
            });
        }

        if (filteredReports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">Отчеты не найдены</td></tr>';
            return;
        }

        filteredReports.forEach(report => {
            const tr = document.createElement('tr');
            const isErrored = report.status === 'error';
            const displayName = report.user_name || report.name;
            tr.innerHTML = `
                <td class="col-name">${displayName}</td>
                <td class="col-type">${getReportTypeTranslation(report.scope)}</td>
                <td class="col-date">${report.created_at}</td>
                <td class="col-author">${report.created_by}</td>
                <td class="col-status ${isErrored ? 'status-error' : 'status-success'}">${isErrored ? 'Не сформирован' : 'Сформирован'}</td>
                <td class="col-action">
                    ${isErrored 
                        ? '<span class="disabled-action">—</span>' 
                        : `<a href="/api/reports/${report.id}/download" class="pdf-link" target="_blank">Открыть PDF</a>`}
                </td>
                <td class="col-delete">
                    ${isErrored 
                        ? '<span class="disabled-action">—</span>'
                        : `<button class="btn-delete-report" data-report-id="${report.id}">Удалить</button>`}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Обработчик изменения отдела
    async function onDepartmentChange() {
        const deptId = document.getElementById('reportDepartment').value;
        const scheduleSelect = document.getElementById('reportSchedule');
        const employeeSelect = document.getElementById('reportEmployee');
        const typeSelect = document.getElementById('reportType');
        const employeeBlock = document.getElementById('employeeSelectBlock');
        const directionBlock = document.getElementById('directionSelectBlock');
        const directionSelect = document.getElementById('reportDirection');
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        
        // Сбрасываем все поля
        scheduleSelect.innerHTML = '<option value="">Сначала выберите график</option>';
        scheduleSelect.disabled = !deptId;
        
        employeeSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
        employeeSelect.disabled = true;
        
        typeSelect.innerHTML = '<option value="">Сначала выберите график</option>';
        typeSelect.disabled = true;
        
        employeeBlock.classList.add('hidden');
        directionBlock.classList.add('hidden');
        
        directionSelect.innerHTML = '<option value="">Выберите направление</option>';
        directionSelect.disabled = true;
        
        // Сбрасываем даты на текущий год
        const currentYear = new Date().getFullYear();
        dateFrom.value = `${currentYear}-01-01`;
        dateTo.value = `${currentYear}-12-31`;

        if (!deptId) return;

        const schedules = await reportsApi.getSchedules(deptId);
        reportsState.schedules = schedules;

        if (schedules.length === 0) {
            showMessage('Для выбранного отдела графики не найдены', 'warning');
        } else {
            showMessage('Выберите график из списка', 'info');
        }

        schedules.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name + (s.year ? ` (${s.year} год)` : '');
            scheduleSelect.appendChild(opt);
        });

        // Разблокируем селект если есть графики
        scheduleSelect.disabled = schedules.length === 0;
    }

    // Устанавливает ограничения дат для года графика
    function setDateConstraints(year) {
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        
        if (!year || !dateFrom || !dateTo) return;
        
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        
        dateFrom.min = yearStart;
        dateFrom.max = yearEnd;
        dateTo.min = yearStart;
        dateTo.max = yearEnd;
        
        // Устанавливаем значения по умолчанию: с 1 января по 31 декабря
        dateFrom.value = yearStart;
        dateTo.value = yearEnd;
    }

    // Обработчик изменения графика
    async function onScheduleChange() {
        const scheduleId = document.getElementById('reportSchedule').value;
        const employeeSelect = document.getElementById('reportEmployee');
        const reportType = document.getElementById('reportType');
        const employeeBlock = document.getElementById('employeeSelectBlock');
        const directionBlock = document.getElementById('directionSelectBlock');
        const directionSelect = document.getElementById('reportDirection');

        if (!scheduleId) {
            employeeSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
            employeeSelect.disabled = true;
            directionSelect.innerHTML = '<option value="">Выберите направление</option>';
            directionSelect.disabled = true;
            reportType.innerHTML = '<option value="">Сначала выберите график</option>';
            reportType.disabled = true;
            return;
        }

        // Восстанавливаем типы отчета
        reportType.innerHTML = `
            <option value="">Выберите тип</option>
            <option value="department">По отделу</option>
            <option value="direction">По подразделению</option>
            <option value="employee">По сотруднику</option>
        `;
        reportType.disabled = false;
        
        // Сбрасываем тип на "Выберите тип"
        reportType.value = '';

        // Сбрасываем сотрудника при смене графика
        employeeSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
        employeeSelect.disabled = true;
        
        // Скрываем блоки при смене графика
        employeeBlock.classList.add('hidden');
        directionBlock.classList.add('hidden');
        directionSelect.innerHTML = '<option value="">Выберите направление</option>';
        directionSelect.disabled = true;
        
        showMessage('Выберите тип отчета', 'info');
    }

    // Обработчик изменения графика для установки ограничений дат
    function onScheduleForDateChange() {
        const scheduleId = document.getElementById('reportSchedule').value;
        if (!scheduleId) return;
        
        const schedule = reportsState.schedules.find(s => s.id == scheduleId);
        if (schedule && schedule.year) {
            setDateConstraints(schedule.year);
        }
    }

    // Загрузка сотрудников для отчета
    async function loadEmployeesForReport() {
        const scheduleId = document.getElementById('reportSchedule').value;
        const employeeSelect = document.getElementById('reportEmployee');

        if (!scheduleId) {
            employeeSelect.innerHTML = '<option value="">Сначала выберите график</option>';
            employeeSelect.disabled = true;
            return;
        }

        const employees = await reportsApi.getScheduleEmployees(scheduleId);
        employeeSelect.innerHTML = '<option value="">Выберите сотрудника</option>';

        if (employees.length === 0) {
            showMessage('В выбранном графике нет сотрудников', 'warning');
            employeeSelect.disabled = true;
            return;
        }

        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.last_name} ${emp.first_name}`;
            employeeSelect.appendChild(opt);
        });

        employeeSelect.disabled = false;
        
        // Восстанавливаем даты после загрузки сотрудников
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        if (dateFrom && dateTo && !dateFrom.value) {
            const currentYear = new Date().getFullYear();
            dateFrom.value = `${currentYear}-01-01`;
            dateTo.value = `${currentYear}-12-31`;
        }
        
        showMessage('Выберите период для формирования отчета', 'info');
    }

    // Загрузка направлений для отчета
    async function loadDirectionsForReport() {
        const scheduleId = document.getElementById('reportSchedule').value;
        const directionSelect = document.getElementById('reportDirection');

        if (!scheduleId) {
            directionSelect.innerHTML = '<option value="">Сначала выберите график</option>';
            directionSelect.disabled = true;
            return;
        }

        const directions = await reportsApi.getScheduleDirections(scheduleId);
        directionSelect.innerHTML = '<option value="">Выберите направление</option>';

        if (directions.length === 0) {
            showMessage('В выбранном графике нет направлений', 'warning');
            directionSelect.disabled = true;
            return;
        }

        directions.forEach(dir => {
            const opt = document.createElement('option');
            opt.value = dir;
            opt.textContent = dir;
            directionSelect.appendChild(opt);
        });

        directionSelect.disabled = false;
        
        // Восстанавливаем даты после загрузки направлений
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        if (dateFrom && dateTo && !dateFrom.value) {
            const currentYear = new Date().getFullYear();
            dateFrom.value = `${currentYear}-01-01`;
            dateTo.value = `${currentYear}-12-31`;
        }
        
        showMessage('Выберите период для формирования отчета', 'info');
    }

    // Обработчик изменения типа отчета
    function onReportTypeChange() {
        const reportType = document.getElementById('reportType').value;
        const employeeBlock = document.getElementById('employeeSelectBlock');
        const employeeSelect = document.getElementById('reportEmployee');
        const directionBlock = document.getElementById('directionSelectBlock');
        const directionSelect = document.getElementById('reportDirection');

        // Скрываем оба блока
        employeeBlock.classList.add('hidden');
        directionBlock.classList.add('hidden');
        employeeSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
        employeeSelect.disabled = true;
        directionSelect.innerHTML = '<option value="">Выберите направление</option>';
        directionSelect.disabled = true;

        if (reportType === 'employee') {
            employeeBlock.classList.remove('hidden');
            loadEmployeesForReport();
            showMessage('Выберите сотрудника', 'info');
        } else if (reportType === 'direction') {
            directionBlock.classList.remove('hidden');
            loadDirectionsForReport();
            showMessage('Выберите направление', 'info');
        } else if (reportType === 'department') {
            showMessage('Выберите период для формирования отчета', 'info');
        }
    }

    // Обработчик генерации отчета
    async function generateReport() {
        const reportName = document.getElementById('reportName').value.trim();
        const departmentId = document.getElementById('reportDepartment').value;
        const scheduleId = document.getElementById('reportSchedule').value;
        const reportType = document.getElementById('reportType').value;
        const employeeId = document.getElementById('reportEmployee').value;
        const dateFrom = document.getElementById('reportDateFrom').value;
        const dateTo = document.getElementById('reportDateTo').value;

        // Валидация - проверяем все обязательные поля
        if (!reportName) {
            showMessage('Заполните поле наименования отчета', 'warning');
            return;
        }

        if (!departmentId) {
            showMessage('Выберите отдел', 'warning');
            return;
        }

        if (!scheduleId) {
            showMessage('Выберите график', 'warning');
            return;
        }

        if (!reportType) {
            showMessage('Выберите тип отчета', 'warning');
            return;
        }

        if (!dateFrom || !dateTo) {
            showMessage('Укажите период (даты начала и окончания)', 'warning');
            return;
        }

        if (dateFrom && dateTo && new Date(dateFrom) >= new Date(dateTo)) {
            showMessage('Дата начала должна быть раньше даты окончания', 'warning');
            return;
        }

        if (reportType === 'employee' && !employeeId) {
            showMessage('Выберите сотрудника', 'warning');
            return;
        }

        if (reportType === 'direction') {
            const directionSelect = document.getElementById('reportDirection');
            const selectedDirection = directionSelect ? directionSelect.value : '';
            if (!selectedDirection) {
                showMessage('Выберите направление', 'warning');
                return;
            }
        }

        // Блокируем кнопку на время формирования
        const btn = document.getElementById('generateReportBtn');
        btn.disabled = true;
        btn.textContent = 'Формируется...';

        try {
            const directionSelect = document.getElementById('reportDirection');
            const selectedDirection = directionSelect ? directionSelect.value : null;
            
            const payload = {
                name: reportName,
                schedule_id: scheduleId,
                scope: reportType,
                employee_id: reportType === 'employee' ? employeeId : null,
                direction: reportType === 'direction' ? selectedDirection : null,
                date_from: dateFrom,
                date_to: dateTo
            };
            
            await reportsApi.generateReport(payload);

            showMessage('Отчет успешно сформирован', 'success');
            
            // Небольшая задержка перед обновлением, чтобы БД успела сохранить
            setTimeout(() => {
                loadReports();
                resetForm();
            }, 300);
        } catch (error) {
            showMessage('Ошибка: ' + error.message, 'error');
            // Обновляем список отчетов даже при ошибке
            loadReports();
            // Сбрасываем форму при ошибке
            resetForm();
        } finally {
            // Возвращаем кнопку
            btn.disabled = false;
            btn.textContent = 'Сформировать';
        }
    }

    // Сброс формы
    function resetForm() {
        document.getElementById('reportName').value = '';
        document.getElementById('reportDepartment').value = '';
        document.getElementById('reportSchedule').innerHTML = '<option value="">Сначала выберите отдел</option>';
        document.getElementById('reportSchedule').disabled = true;
        document.getElementById('reportType').innerHTML = '<option value="">Сначала выберите график</option>';
        document.getElementById('reportType').disabled = true;
        document.getElementById('reportEmployee').innerHTML = '<option value="">Выберите сотрудника</option>';
        document.getElementById('reportEmployee').disabled = true;
        document.getElementById('reportDirection').innerHTML = '<option value="">Выберите направление</option>';
        document.getElementById('reportDirection').disabled = true;
        document.getElementById('employeeSelectBlock').classList.add('hidden');
        document.getElementById('directionSelectBlock').classList.add('hidden');
        
        // Даты оставляем по умолчанию (текущий год)
        const currentYear = new Date().getFullYear();
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        if (dateFrom) dateFrom.value = `${currentYear}-01-01`;
        if (dateTo) dateTo.value = `${currentYear}-12-31`;
    }

    // Кастомное модальное окно подтверждения удаления
    function showDeleteConfirm(message) {
        return new Promise((resolve) => {
            // Создаём модальное окно
            const modal = document.createElement('div');
            modal.className = 'custom-modal';
            modal.id = 'deleteConfirmModal';
            
            modal.innerHTML = `
                <div class="custom-modal-content">
                    <h3>Подтверждение удаления</h3>
                    <p>${message}</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="confirmDeleteBtn">Да</button>
                        <button id="cancelDeleteBtn">Нет</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Обработчик "Да"
            document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });
            
            // Обработчик "Нет"
            document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
            
            // Закрытие по клику на оверлей
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
        });
    }

    // Обработчик удаления отчета
    async function handleDeleteReport(reportId) {
        const confirmed = await showDeleteConfirm('Вы уверены, что хотите удалить этот отчет?');
        
        if (!confirmed) {
            return;
        }

        try {
            await reportsApi.deleteReport(reportId);
            showMessage('Отчет успешно удален', 'success');
            loadReports();
        } catch (error) {
            showMessage('Ошибка при удалении отчета', 'error');
        }
    }

    // Настройка обработчиков событий
    function setupEventListeners() {
        const deptSelect = document.getElementById('reportDepartment');
        const scheduleSelect = document.getElementById('reportSchedule');
        const typeSelect = document.getElementById('reportType');
        const generateBtn = document.getElementById('generateReportBtn');

        if (deptSelect) {
            deptSelect.addEventListener('change', onDepartmentChange);
        }
        if (scheduleSelect) {
            scheduleSelect.addEventListener('change', () => {
                onScheduleChange();
                onScheduleForDateChange();
            });
        }
        if (typeSelect) {
            typeSelect.addEventListener('change', onReportTypeChange);
        }
        if (generateBtn) {
            generateBtn.addEventListener('click', generateReport);
        }

        // Обработчик удаления отчетов (делегирование событий)
        const tbody = document.getElementById('reportsTableBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.btn-delete-report');
                if (deleteBtn) {
                    const reportId = deleteBtn.dataset.reportId;
                    if (reportId) {
                        handleDeleteReport(parseInt(reportId));
                    }
                }
            });
        }
    }

    // Инициализация страницы
    function initReportsPage() {
        loadCurrentUser();
        loadReports();
        setupEventListeners();
        
        // Устанавливаем даты по умолчанию (текущий год)
        const currentYear = new Date().getFullYear();
        setDateConstraints(currentYear);
        
        // Устанавливаем значения дат по умолчанию
        const dateFrom = document.getElementById('reportDateFrom');
        const dateTo = document.getElementById('reportDateTo');
        if (dateFrom && dateTo && !dateFrom.value) {
            dateFrom.value = `${currentYear}-01-01`;
            dateTo.value = `${currentYear}-12-31`;
        }
        
        // Устанавливаем тип отчета в начальное состояние
        const typeSelect = document.getElementById('reportType');
        if (typeSelect) {
            typeSelect.innerHTML = '<option value="">Сначала выберите график</option>';
            typeSelect.disabled = true;
        }
    }

    // Экспорт только initReportsPage в глобальную область
    window.initReportsPage = initReportsPage;

})();
