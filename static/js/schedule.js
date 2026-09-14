console.log("schedule.js loaded");

const state = {
    editMode:false,
    suggestMode: false,
    schedules:[],
    selectedSchedule:null,
    originalSchedule:null,
    departmentId:null,
    userDepartmentId: null,
    currentUserId: null,
    currentEmail: null,
    currentFirstName: null,
    currentLastName: null,
    userRole: null,
    vacationTypes: [],
    pendingChanges: {
        updatedNames: {},
        addedVacations: [],
        deletedVacations: [],
        modifiedVacations: []
    }
};

// Функция склонения слова "изменение"
function declineChange(count) {
    const abs = Math.abs(count) % 100;
    const lastDigit = abs % 10;
    
    if(abs > 10 && abs < 20) return "изменений";
    if(lastDigit > 1 && lastDigit < 5) return "изменения";
    if(lastDigit === 1) return "изменение";
    return "изменений";
}

// Получить CSS класс для направления
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

// Склонение слова "день"
function declineVacationDays(count) {
    const abs = Math.abs(count) % 100;
    const lastDigit = abs % 10;
    
    if(abs > 10 && abs < 20) return "дней";
    if(lastDigit > 1 && lastDigit < 5) return "дня";
    if(lastDigit === 1) return "день";
    return "дней";
}

// Проверка: является ли сотрудник руководителем или заместителем
function isHeadOrDeputy(position) {
    if (!position) return false;
    const posLower = position.toLowerCase();
    return posLower.includes("заместитель") || 
           posLower.includes("руководитель");
}

// Проверка: пересекаются ли два периода
function datesOverlap(start1, end1, start2, end2) {
    const s1 = new Date(start1);
    const e1 = new Date(end1);
    const s2 = new Date(start2);
    const e2 = new Date(end2);
    return s1 <= e2 && s2 <= e1;
}

// Проверка 1: пересечение отпусков сотрудников одного направления (исключая руководителей)
function checkDirectionOverlap(newStart, newEnd, currentEmpId, schedule) {
    const employees = schedule.employees || [];
    
    for (const emp of employees) {
        // Пропускаем текущего сотрудника
        if (emp.schedule_employee_id == currentEmpId) continue;
        
        // Пропускаем руководителей и заместителей
        if (isHeadOrDeputy(emp.position)) continue;
        
        // Пропускаем сотрудников без направления
        if (!emp.direction) continue;
        
        // Проверяем направление
        const currentUser = schedule.employees.find(e => e.schedule_employee_id == currentEmpId);
        if (!currentUser || emp.direction !== currentUser.direction) continue;
        
        // Проверяем отпуска этого сотрудника
        for (const vac of (emp.vacations || [])) {
            const vacStart = new Date(vac.start_date);
            const vacEnd = new Date(vac.end_date);
            
            if (datesOverlap(newStart, newEnd, vacStart, vacEnd)) {
                return {
                    overlap: true,
                    employeeName: `${emp.last_name} ${emp.first_name}`,
                    direction: emp.direction
                };
            }
        }
    }
    
    return { overlap: false };
}

// Проверка 2: максимум 14 дней летом (июнь, июль, август)
function checkSummerVacationLimit(empId, newStart, newEnd, schedule) {
    const year = schedule.year || new Date(newStart).getFullYear();
    const employees = schedule.employees || [];
    const emp = employees.find(e => e.schedule_employee_id == empId);
    
    if (!emp) return { limit: false, message: "" };
    
    // Считаем все летние отпуска сотрудника
    let summerDays = 0;
    
    for (const vac of (emp.vacations || [])) {
        const vacStart = new Date(vac.start_date);
        const vacEnd = new Date(vac.end_date);
        
        // Проверяем, попадает ли отпуск на лето
        if (datesOverlap(vacStart, vacEnd, 
            new Date(year, 5, 1), new Date(year, 8, 0))) {
            // Считаем дни в летний период
            const summerStart = vacStart < new Date(year, 5, 1) ? new Date(year, 5, 1) : vacStart;
            const summerEnd = vacEnd > new Date(year, 8, 0) ? new Date(year, 8, 0) : vacEnd;
            const days = Math.round((summerEnd - summerStart) / (1000 * 60 * 60 * 24)) + 1;
            summerDays += days;
        }
    }
    
    // Добавляем новые дни отпуска
    const newVacStart = newStart < new Date(year, 5, 1) ? new Date(year, 5, 1) : newStart;
    const newVacEnd = newEnd > new Date(year, 8, 0) ? new Date(year, 8, 0) : newEnd;
    
    if (newVacStart <= newVacEnd) {
        const newDays = Math.round((newVacEnd - newVacStart) / (1000 * 60 * 60 * 24)) + 1;
        summerDays += newDays;
    }
    
    if (summerDays > 14) {
        return {
            limit: false,
            message: `Летом (${emp.last_name} ${emp.first_name}) уже запланировано ${summerDays} дней отпуска. Максимум 14 дней за лето.`
        };
    }
    
    return { limit: true, summerDays };
}

// Проверка 3: пересечение отпусков руководителя и его заместителя
function checkHeadDeputyOverlap(currentEmpId, newStart, newEnd, schedule) {
    const employees = schedule.employees || [];
    
    // Находим всех руководителей и заместителей в графике
    const heads = employees.filter(emp => 
        emp.schedule_employee_id != currentEmpId && 
        emp.vacations && emp.vacations.length > 0
    );
    
    // Проверяем каждого руководителя на пересечение с новым отпуском
    for (const head of heads) {
        if (!isHeadOrDeputy(head.position)) continue;
        
        for (const vac of head.vacations) {
            const vacStart = new Date(vac.start_date);
            const vacEnd = new Date(vac.end_date);
            
            if (datesOverlap(newStart, newEnd, vacStart, vacEnd)) {
                return {
                    overlap: true,
                    employeeName: `${head.last_name} ${head.first_name}`,
                    position: head.position
                };
            }
        }
    }
    
    return { overlap: false };
}

// Проверка 4: максимум 28 дней отпуска в году (без учёта учебного и декретного)
function checkYearlyVacationLimit(empId, newStart, newEnd, typeId, schedule) {
    // Не проверяем учебный и декретный отпуска
    if (typeId === 2 || typeId === 4) {
        return { limit: true };
    }
    
    const year = schedule.year || new Date(newStart).getFullYear();
    const employees = schedule.employees || [];
    const emp = employees.find(e => e.schedule_employee_id == empId);
    
    if (!emp) return { limit: true };
    
    // Считаем все основные дни отпуска в году
    let totalDays = 0;
    
    for (const vac of (emp.vacations || [])) {
        // Пропускаем учебный и декретный
        if (vac.type_vacation_id === 2 || vac.type_vacation_id === 4) continue;
        
        const vacStart = new Date(vac.start_date);
        const vacEnd = new Date(vac.end_date);
        
        // Проверяем, попадает ли отпуск на год графика
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        
        if (datesOverlap(vacStart, vacEnd, yearStart, yearEnd)) {
            const calcStart = vacStart < yearStart ? yearStart : vacStart;
            const calcEnd = vacEnd > yearEnd ? yearEnd : vacEnd;
            const days = Math.round((calcEnd - calcStart) / (1000 * 60 * 60 * 24)) + 1;
            totalDays += days;
        }
    }
    
    // Добавляем новые дни
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const newCalcStart = newStart < yearStart ? yearStart : newStart;
    const newCalcEnd = newEnd > yearEnd ? yearEnd : newEnd;
    
    if (newCalcStart <= newCalcEnd) {
        const newDays = Math.round((newCalcEnd - newCalcStart) / (1000 * 60 * 60 * 24)) + 1;
        totalDays += newDays;
    }
    
    if (totalDays > 28) {
        return {
            limit: false,
            message: `На ${year} год для ${emp.last_name} ${emp.first_name} запланировано ${totalDays} дней отпуска. Максимум 28 дней.`
        };
    }
    
    return { limit: true, totalDays };
}

const DOM = {
    departmentFilter:"#departmentFilter",
    scheduleFilter:"#scheduleFilter",
    title:"#selectedScheduleTitle",
    grid:"#vacationGrid",

    btnEdit:"#editBtn",
    btnSave:"#btnSave",
    btnCancel:"#btnCancel",

    btnCreateSchedule:"#createScheduleBtn",
    btnDeleteSchedule:"#deleteScheduleBtn",

    btnAddEmployee:"#createEmployeeBtn",
    btnSuggest:"#suggestVacationBtn",

    editIndicator:"#editIndicator",
    editButtonsRow:"#editButtonsRow",
    isDefaultCheckbox:"#isDefaultCheckbox",
    messageBox:"#messageBox",

    createScheduleModal:"#createScheduleModal",
    confirmCreateScheduleBtn:"#confirmCreateScheduleBtn",
    closeCreateScheduleModalBtn:"#closeCreateScheduleModalBtn",
    csName:"#csName",
    csDepartment:"#csDepartment",
    csYear:"#csYear",
    csIsDefault:"#csIsDefault",

    createEmployeeModal:"#createEmployeeModal",
    ceSave:"#ceSave",
    ceCancel:"#ceCancel",
    ceModeRow:"#ceModeRow",
    ceModeList:"#ceModeList",
    ceModeManual:"#ceModeManual",
    ceListBlock:"#ceListBlock",
    ceManualBlock:"#ceManualBlock",
    ceSearch:"#ceSearch",
    ceUsersList:"#ceUsersList",
    ceAddSelected:"#ceAddSelected",
    ceBackToMenu:"#ceBackToMenu",
    ceBackToMenuManual:"#ceBackToMenuManual",
    ceFirstName:"#ceFirstName",
    ceLastName:"#ceLastName",
    cePosition:"#cePosition",
    ceDepartment:"#ceDepartment",
    ceDirection:"#ceDirection",
    ceDirectionBlock:"#ceDirectionBlock",
    ceDirectionFilter:"#ceDirectionFilter",
    ceDirectionFilterBlock:"#ceDirectionFilterBlock",
    ceCloseModal:"#ceCloseModal",

    deleteConfirmModal:"#deleteConfirmModal",
    deleteModalTitle:"#deleteModalTitle",
    deleteModalText:"#deleteModalText",
    confirmDeleteBtn:"#confirmDeleteBtn",
    cancelDeleteBtn:"#cancelDeleteBtn",

    saveConfirmModal:"#saveConfirmModal",
    saveModalText:"#saveModalText",
    confirmSaveBtn:"#confirmSaveBtn",
    cancelSaveBtn:"#cancelSaveBtn",

    directionLegend:"#directionLegend",
    vacationLegend:"#vacationLegend",

    // Memo
    memoBtn:"#memoBtn",
    memoModal:"#memoModal",
    memoHeadName:"#memoHeadName",
    memoHeadPosition:"#memoHeadPosition",
    memoHeadDepartment:"#memoHeadDepartment",
    memoEmployeeName:"#memoEmployeeName",
    memoEmployeePosition:"#memoEmployeePosition",
    memoEmployeeDepartment:"#memoEmployeeDepartment",
    memoVacFrom:"#memoVacFrom",
    memoVacTo:"#memoVacTo",
    memoTransferFrom:"#memoTransferFrom",
    memoTransferTo:"#memoTransferTo",
    memoReason:"#memoReason",
    memoGenerateBtn:"#memoGenerateBtn",
    memoCancelBtn:"#memoCancelBtn"
};

let el = {};

function cacheDom(){
    Object.entries(DOM).forEach(([k,s])=>{
        el[k] = document.querySelector(s);
    });
}

function toggle(element,show,disable=false){
    if(!element) return;
    element.classList.toggle("hidden",!show);
    element.disabled = disable;
}

function toggleGroup(names,show){
    names.forEach(n=>toggle(el[n],show));
}

let messageTimeout = null;

function showMessage(text,type="info"){
    if(!el.messageBox) return;

    // Очищаем предыдущий таймер, если есть
    if(messageTimeout) {
        clearTimeout(messageTimeout);
    }

    el.messageBox.textContent = text;
    el.messageBox.className = "admin-message admin-" + type;
    el.messageBox.classList.add("show");

    messageTimeout = setTimeout(()=>{
        el.messageBox.classList.remove("show");
    },5000);
}

const api = {

    async getCurrentUser(){
        const r = await fetch("/api/current-user");
        if(!r.ok) return null;
        return await r.json();
    },

    async getVacationTypes(){
        const r = await fetch("/api/vacation-types");
        if(!r.ok) return [];
        return await r.json();
    },

    async getSchedules(departmentId){

        const r = await fetch(`/api/schedules/${departmentId}`);

        if(!r.ok){
            showMessage("Ошибка загрузки графиков","error");
        }

        return await r.json();
    },

    async getSchedule(scheduleId){

        const r = await fetch(`/api/schedule/${scheduleId}`);

        if(!r.ok){
            showMessage("Ошибка загрузки графика","error");
            return [];
        }

        return await r.json();
    },

    async setDefault(scheduleId){

        const r = await fetch(`/api/schedules/${scheduleId}/set-default`, {
            method: "POST"
        });

        if(!r.ok){
            showMessage("Ошибка установки графика по умолчанию","error");
            return false;
        }

        return true;
    },

    async removeDefault(scheduleId){
        const r = await fetch(`/api/schedules/${scheduleId}/remove-default`, {
            method: "POST"
        });

        if(!r.ok){
            showMessage("Ошибка снятия обязательного графика","error");
            return false;
        }

        return true;
    },

    async addVacation(scheduleEmployeeId, startDate, endDate, typeVacationId = 1){

        const r = await fetch("/api/vacations/add", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                schedule_employee_id: scheduleEmployeeId,
                start_date: startDate,
                end_date: endDate,
                type_vacation_id: typeVacationId
            })
        });

        if(!r.ok){
            showMessage("Ошибка добавления отпуска","error");
            return false;
        }

        return true;
    },

    async addEmployee(scheduleId, employeeData){

        const r = await fetch(`/api/schedules/${scheduleId}/add-employee`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(employeeData)
        });

        if(!r.ok){
            const error = await r.json();
            showMessage(error.error || "Ошибка добавления сотрудника","error");
            return false;
        }

        return true;
    },

    async updateVacation(vacationId, data){
        const r = await fetch(`/api/vacations/${vacationId}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(data)
        });

        if(!r.ok){
            showMessage("Ошибка обновления отпуска","error");
            return false;
        }

        return true;
    },

    async deleteVacation(vacationId){
        const r = await fetch(`/api/vacations/${vacationId}`, {
            method: "DELETE"
        });

        if(!r.ok){
            showMessage("Ошибка удаления отпуска","error");
            return false;
        }

        return true;
    },

    async updateScheduleEmployee(scheduleEmployeeId, data){
        const r = await fetch(`/api/schedule-employees/${scheduleEmployeeId}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(data)
        });

        if(!r.ok){
            showMessage("Ошибка обновления сотрудника","error");
            return false;
        }

        return true;
    },

    async deleteScheduleEmployee(scheduleEmployeeId){
        const r = await fetch(`/api/schedule-employees/${scheduleEmployeeId}`, {
            method: "DELETE"
        });

        if(!r.ok){
            showMessage("Ошибка удаления сотрудника","error");
            return false;
        }

        return true;
    }
};

function updateUi(){

    const hasSchedule = !!state.selectedSchedule;
    const isEdit = state.editMode;
    const isDefault = state.selectedSchedule?.is_default || false;
    const isAdmin = state.userRole === 2 || state.userRole === 3 || state.userRole === 4;

    // Блокируем чекбокс если график не выбран или пользователь не администратор
    if(el.isDefaultCheckbox){
        el.isDefaultCheckbox.disabled = !hasSchedule || !isAdmin;

        // Добавляем/убираем класс для визуального отображения disabled
        const label = el.isDefaultCheckbox.closest('.schedule-default-label');
        if(label) {
            if(!isAdmin) {
                label.classList.add('disabled-label');
            } else {
                label.classList.remove('disabled-label');
            }
        }
    }

    // Отображение названия графика
    if(el.title && state.selectedSchedule){
        const yearSuffix = state.selectedSchedule.year ? ` на ${state.selectedSchedule.year}` : '';
        el.title.textContent = `График${yearSuffix}`;
        toggle(el.title, true);
    }

    if(!hasSchedule){

        toggleGroup([
            "btnTransfer",
            "btnSuggest"
        ], false);

        return;
    }

    if(!isEdit && !state.suggestMode){

        // Показываем кнопки
        toggle(el.btnAddEmployee, true, !isAdmin);
        toggle(el.btnSuggest, true, false);
        toggle(el.btnCreateSchedule, true, !isAdmin);
        toggle(el.btnDeleteSchedule, true, !isAdmin);

        toggleGroup([
            "btnTransfer",
            "btnSuggest"
        ], true);

        toggle(el.editIndicator, false);
        toggle(el.editButtonsRow, false);

        // Показываем кнопку "Редактировать" только для администраторов
        toggle(el.btnEdit, true, !isAdmin);

        // Визуально выделяем disabled кнопки
        if(!isAdmin) {
            el.btnAddEmployee.style.opacity = '0.5';
            el.btnAddEmployee.style.cursor = 'not-allowed';
            el.btnCreateSchedule.style.opacity = '0.5';
            el.btnCreateSchedule.style.cursor = 'not-allowed';
            el.btnDeleteSchedule.style.opacity = '0.5';
            el.btnDeleteSchedule.style.cursor = 'not-allowed';
            el.btnEdit.style.opacity = '0.5';
            el.btnEdit.style.cursor = 'not-allowed';
        } else {
            el.btnAddEmployee.style.opacity = '1';
            el.btnAddEmployee.style.cursor = 'pointer';
            el.btnCreateSchedule.style.opacity = '1';
            el.btnCreateSchedule.style.cursor = 'pointer';
            el.btnDeleteSchedule.style.opacity = '1';
            el.btnDeleteSchedule.style.cursor = 'pointer';
            el.btnEdit.style.opacity = '1';
            el.btnEdit.style.cursor = 'pointer';
        }

        // Блокируем фильтры для обычных сотрудников
        if(!isAdmin) {
            el.departmentFilter.disabled = true;
            el.scheduleFilter.disabled = true;
            el.departmentFilter.style.opacity = '0.5';
            el.scheduleFilter.style.opacity = '0.5';
            el.departmentFilter.style.cursor = 'not-allowed';
            el.scheduleFilter.style.cursor = 'not-allowed';
        } else {
            el.departmentFilter.disabled = false;
            el.scheduleFilter.disabled = false;
            el.departmentFilter.style.opacity = '1';
            el.scheduleFilter.style.opacity = '1';
            el.departmentFilter.style.cursor = 'pointer';
            el.scheduleFilter.style.cursor = 'pointer';
        }

        return;
    }

    // Режим редактирования или предложения отпуска
    toggleGroup([
        "btnTransfer",
        "btnSuggest"
    ], true);

    toggle(el.editIndicator, true);
    toggle(el.editButtonsRow, true);

    // Скрываем кнопку "Редактировать"
    toggle(el.btnEdit, false);

    // Показываем кнопку удаления только в режиме редактирования, не в suggestMode
    toggle(el.btnDeleteSchedule, !state.suggestMode);

    // Блокируем кнопки в режиме редактирования
    toggle(el.btnAddEmployee, true, true);
    toggle(el.btnTransfer, true, true);
    toggle(el.btnSuggest, true, true);
    toggle(el.btnCreateSchedule, true, true);
}

function handleEditClick(){

    const hasDepartment = !!state.departmentId;
    const hasSchedule = !!state.selectedSchedule;

    if(!hasDepartment){
        showMessage("Выберите отдел","warning");
        return;
    }

    if(!hasSchedule){
        showMessage("Выберите график","warning");
        return;
    }

    enableEditMode();
}


// Фильтр отдела
async function onDepartmentChange(){

    const depId = el.departmentFilter.value;

    state.departmentId = depId;

    state.editMode = false;
    state.suggestMode = false;
    state.selectedSchedule = null;

    el.scheduleFilter.innerHTML = `<option value="">Выберите график</option>`;
    el.scheduleFilter.disabled = true;

    renderSchedule(null);

    updateUi();

    if(!depId){
        showMessage("Выберите отдел", "warning");
        return;
    }

    const schedules = await api.getSchedules(depId);

    if(!schedules || schedules.length === 0){
        showMessage("Для выбранного отдела графики не найдены", "warning");
        return;
    }

    state.schedules = schedules;

    // Показываем все графики
    schedules.forEach(s=>{

        const opt = document.createElement("option");

        opt.value = s.id;
        const yearSuffix = s.year ? ` (${s.year} год)` : '';
        opt.textContent = s.name + yearSuffix + (s.is_default ? ' 📌' : '');

        el.scheduleFilter.appendChild(opt);

    });

    // Автовыбор графика по умолчанию (первый или is_default)
    const defaultSchedule = schedules.find(s => s.is_default) || schedules[0];
    if(defaultSchedule){
        el.scheduleFilter.value = defaultSchedule.id;
        await onScheduleChange();
    }

}

// Фильтр графика
async function onScheduleChange(){

    const id = el.scheduleFilter.value;

    state.editMode = false;
    state.suggestMode = false;

    if(!id){

        state.selectedSchedule = null;

        renderSchedule(null);

        updateUi();

        showMessage("Выберите график", "warning");

        return;

    }

    const data = await api.getSchedule(id);

    if(!data){
        showMessage("Не удалось загрузить график", "error");
        return;
    }

    state.selectedSchedule = data;

    renderSchedule(state.selectedSchedule);

    updateUi();

    // Обновляем состояние чекбокса
    if(el.isDefaultCheckbox){
        el.isDefaultCheckbox.checked = data.is_default || false;
        el.isDefaultCheckbox.disabled = false;
    }

    const defaultText = data.is_default ? "" : "";
    showMessage(`График успешно загружен${defaultText}`, "success");

}

// Включение режима редактирования
function enableEditMode(){

    if(!state.departmentId){
        showMessage("Сначала выберите отдел", "warning");
        return;
    }

    if(!state.selectedSchedule){
        showMessage("Сначала выберите график", "warning");
        return;
    }

    // Сохраняем оригинальные данные для отмены
    state.originalSchedule = JSON.parse(JSON.stringify(state.selectedSchedule));
    state.pendingChanges = {
        updatedNames: {},
        addedVacations: [],
        deletedVacations: [],
        modifiedVacations: [],
        employeeOrder: null
    };

    state.editMode = true;
    state.suggestMode = false;

    // Перерендериваем таблицу с редактируемыми ячейками
    renderSchedule(state.selectedSchedule);
    updateUi();

    showMessage("Включен режим редактирования", "info");

}

// Включение режима предложения отпуска
function enableSuggestMode(){

    if(!state.departmentId){
        showMessage("Сначала выберите отдел", "warning");
        return;
    }

    if(!state.selectedSchedule){
        showMessage("Сначала выберите график", "warning");
        return;
    }

    // Проверяем, что текущий пользователь есть в графике
    const currentUserInSchedule = state.selectedSchedule.employees?.some(emp =>
        emp.user_id === state.currentUserId || emp.email === state.currentEmail
    );

    if(!currentUserInSchedule){
        showMessage("Вы отсутсвуете в данном графике", "warning");
        return;
    }

    // Сохраняем оригинальные данные для отмены
    state.originalSchedule = JSON.parse(JSON.stringify(state.selectedSchedule));
    state.pendingChanges = {
        updatedNames: {},
        addedVacations: [],
        deletedVacations: [],
        modifiedVacations: [],
        employeeOrder: null
    };

    state.suggestMode = true;
    state.editMode = true;

    // Добавляем класс для CSS
    document.body.classList.add("suggest-mode");

    // Скрываем кнопку удаления графика
    toggle(el.btnDeleteSchedule, false);

    // Перерендериваем таблицу с редактируемыми ячейками
    renderSchedule(state.selectedSchedule);
    updateUi();

    showMessage("Вы можете запланировать свой отпуск", "info");

}

// Выключение режима редактирования
async function cancelEdit(){

    if(state.originalSchedule && (Object.keys(state.pendingChanges.updatedNames).length > 0 ||
        state.pendingChanges.addedVacations.length > 0 ||
        state.pendingChanges.modifiedVacations.length > 0 ||
        state.pendingChanges.deletedVacations.length > 0 ||
        (state.pendingChanges.employeeOrder && state.pendingChanges.employeeOrder.length > 0))){

        showDeleteConfirmModal(
            "Отмена редактирования",
            "Вы уверены, что хотите отменить все изменения и восстановить исходный график?",
            async () => {
                state.editMode = false;
                state.suggestMode = false;
                document.body.classList.remove("suggest-mode");

                // Восстанавливаем оригинальные данные
                state.selectedSchedule = state.originalSchedule;
                state.originalSchedule = null;
                state.pendingChanges = {
                    updatedNames: {},
                    addedVacations: [],
                    deletedVacations: [],
                    modifiedVacations: [],
                    employeeOrder: null
                };

                // Перезагружаем график с сервера
                const data = await api.getSchedule(state.selectedSchedule.id);
                state.selectedSchedule = data;
                renderSchedule(data);
                updateUi();

                showMessage("Редактирование отменено, изменения не сохранены","info");
            }
        );
        return;
    }

    state.editMode = false;
    state.suggestMode = false;
    state.originalSchedule = null;
    document.body.classList.remove("suggest-mode");
    toggle(el.btnDeleteSchedule, true);
    state.pendingChanges = {
        updatedNames: {},
        addedVacations: [],
        deletedVacations: [],
        modifiedVacations: [],
        employeeOrder: null
    };

    // Перезагружаем график с сервера
    const data = await api.getSchedule(state.selectedSchedule.id);
    state.selectedSchedule = data;
    renderSchedule(data);
    updateUi();

    showMessage("Редактирование отменено","info");

}

// Обработчик чекбокса "по умолчанию"
async function onDefaultChange(){
    // Для обычных сотрудников блокируем
    if(state.userRole !== 2 && state.userRole !== 3 && state.userRole !== 4) {
        el.isDefaultCheckbox.checked = !el.isDefaultCheckbox.checked;
        showMessage("Недостаточно прав", "error");
        return;
    }

    if(!state.selectedSchedule){
        return;
    }

    const isChecked = el.isDefaultCheckbox.checked;

    if(isChecked){
        // Показываем модальное окно подтверждения
        showDefaultConfirmModal(
            "Назначение графика по умолчанию",
            `Назначить график «${state.selectedSchedule.name}» обязательным для просмотра?`,
            async () => {
                const result = await api.setDefault(state.selectedSchedule.id);
                if(result){
                    showMessage("График установлен как график по умолчанию", "success");
                    await onDepartmentChange();
                }
            }
        );
    } else {
        // Проверяем, есть ли другие графики по умолчанию в отделе
        const hasOtherDefaults = state.schedules.some(s => s.is_default && s.id !== state.selectedSchedule.id);

        if(!hasOtherDefaults){
            // Блокируем снятие чекбокса
            el.isDefaultCheckbox.checked = true;
            showMessage("Невозможно снять отметку: в отделе должен быть хотя бы один график по умолчанию", "warning");
            return;
        }

        // Снимаем флаг "по умолчанию"
        const result = await api.removeDefault(state.selectedSchedule.id);
        if(result){
            showMessage("График больше не является графиком по умолчанию", "info");
            await onDepartmentChange();
        }
    }
}

// Модальное окно подтверждения назначения графика по умолчанию
let defaultCallback = null;

function showDefaultConfirmModal(title, text, callback){
    el.deleteModalTitle.textContent = title;
    el.deleteModalText.textContent = text;
    defaultCallback = callback;
    toggle(el.deleteConfirmModal, true);
}

function confirmDefaultAction(){
    if(defaultCallback){
        defaultCallback();
    }
    closeDeleteConfirmModal();
}

// Сохранение всех изменений
async function saveAllChanges(){

    const hasNames = Object.keys(state.pendingChanges.updatedNames).length > 0;
    const hasAddedVacations = state.pendingChanges.addedVacations.length > 0;
    const hasModifiedVacations = state.pendingChanges.modifiedVacations.length > 0;
    const hasDeletedVacations = state.pendingChanges.deletedVacations.length > 0;
    const hasEmployeeOrder = state.pendingChanges.employeeOrder && state.pendingChanges.employeeOrder.length > 0;

    const totalChanges = (hasNames ? 1 : 0) +
        (hasAddedVacations ? 1 : 0) +
        (hasModifiedVacations ? 1 : 0) +
        (hasDeletedVacations ? 1 : 0) +
        (hasEmployeeOrder ? 1 : 0);

    if(totalChanges === 0){
        showMessage("Нет изменений для сохранения","warning");
        return;
    }

    if(!state.selectedSchedule){
        showMessage("Ошибка: график не выбран","error");
        return;
    }

    let success = true;
    let changesCount = 0;

    // Функция фактического сохранения
    const performSave = async () => {
        // 1. Сохраняем изменения имён
        for(const [empId, data] of Object.entries(state.pendingChanges.updatedNames)){
            const result = await api.updateScheduleEmployee(parseInt(empId), data);
            if(result) changesCount++;
            success = success && result;
        }

        // 2. Сохраняем добавленные отпуска
        for(const vac of state.pendingChanges.addedVacations){
            const result = await api.addVacation(vac.scheduleEmployeeId, vac.startDate, vac.endDate, vac.typeId);
            if(result) changesCount++;
            success = success && result;
        }

        // 3. Сохраняем изменённые отпуска
        for(const vac of state.pendingChanges.modifiedVacations){
            const result = await api.updateVacation(vac.id, {
                start_date: vac.startDate,
                end_date: vac.endDate,
                type_vacation_id: vac.typeId
            });
            if(result) changesCount++;
            success = success && result;
        }

        // 4. Удаляем отпуска
        for(const vacId of state.pendingChanges.deletedVacations){
            const result = await api.deleteVacation(vacId);
            if(result) changesCount++;
            success = success && result;
        }

        // 5. Сохраняем порядок сотрудников
        if(state.pendingChanges.employeeOrder){
            const reorderResponse = await fetch(`/api/schedules/${state.selectedSchedule.id}/reorder-employees`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ employee_order: state.pendingChanges.employeeOrder })
            });

            if(reorderResponse.ok) changesCount++;
            success = success && reorderResponse.ok;
        }

        if(success){
            state.editMode = false;
            state.suggestMode = false;
            state.originalSchedule = null;
            document.body.classList.remove("suggest-mode");
            toggle(el.btnDeleteSchedule, true);
            state.pendingChanges = {
                updatedNames: {},
                addedVacations: [],
                deletedVacations: [],
                modifiedVacations: [],
                employeeOrder: null
            };

            // Перезагружаем график
            const data = await api.getSchedule(state.selectedSchedule.id);
            state.selectedSchedule = data;
            renderSchedule(data);
            updateUi();

            showMessage(`Сохранено ${changesCount} ${declineChange(changesCount)}`, "success");
        } else {
            showMessage("Ошибка при сохранении некоторых изменений","error");
        }
    };

    // Показываем модальное окно подтверждения
    showSaveConfirmModal(
        `Сохранить ${totalChanges} ${declineChange(totalChanges)}?`,
        performSave
    );
}

function openCreateScheduleModal(){
    if(!el.createScheduleModal) return;
    el.createScheduleModal.classList.remove("hidden");
}

function closeCreateScheduleModal(){
    if(el.createScheduleModal) {
        el.createScheduleModal.classList.add("hidden");
    }
}

function openCreateEmployeeModal(){

    if(!state.selectedSchedule){
        showMessage("Сначала выберите график","warning");
        return;
    }

    // Загружаем должности для отдела графика
    const deptId = state.selectedSchedule.department_id;
    if(deptId) {
        loadPositions(deptId);
    }

    // Сбрасываем на начальный экран выбора режима
    showModeSelection();
    toggle(el.createEmployeeModal,true);

}

function closeCreateEmployeeModal(){
    toggle(el.createEmployeeModal,false);
}

// Закрытие по ESC
function handleEscKey(e){
    if(e.key === "Escape"){
        if(el.createEmployeeModal && !el.createEmployeeModal.classList.contains("hidden")){
            closeCreateEmployeeModal();
        }
        if(el.deleteConfirmModal && !el.deleteConfirmModal.classList.contains("hidden")){
            closeDeleteConfirmModal();
        }
        if(el.saveConfirmModal && !el.saveConfirmModal.classList.contains("hidden")){
            closeSaveConfirmModal();
        }
    }
}

// Модальное окно подтверждения удаления
let deleteCallback = null;

function showDeleteConfirmModal(title, text, callback){
    el.deleteModalTitle.textContent = title;
    el.deleteModalText.textContent = text;
    deleteCallback = callback;
    toggle(el.deleteConfirmModal, true);
}

// Показываем confirmation modal поверх vacation modal
function showDeleteConfirmModalAboveModal(title, text, callback){
    el.deleteModalTitle.textContent = title;
    el.deleteModalText.textContent = text;
    deleteCallback = callback;

    // Скрываем vacationModal временно
    const vacationModal = document.getElementById("vacationModal");
    if(vacationModal) {
        vacationModal.dataset.wasVisible = "true";
        vacationModal.style.display = "none";
    }

    el.deleteConfirmModal.style.zIndex = "5000";
    toggle(el.deleteConfirmModal, true);
}

function closeDeleteConfirmModal(){
    deleteCallback = null;

    // Восстанавливаем vacationModal если он был
    const vacationModal = document.getElementById("vacationModal");
    if(vacationModal && vacationModal.dataset.wasVisible === "true") {
        vacationModal.style.display = "";
        delete vacationModal.dataset.wasVisible;
    }

    el.deleteConfirmModal.style.zIndex = "";
    toggle(el.deleteConfirmModal, false);
}

function confirmDeleteAction(){
    if(deleteCallback){
        deleteCallback();
    }
    closeDeleteConfirmModal();
}

// Модальное окно подтверждения сохранения
let saveCallback = null;

function showSaveConfirmModal(text, callback){
    el.saveModalText.textContent = text;
    saveCallback = callback;
    toggle(el.saveConfirmModal, true);
}

function closeSaveConfirmModal(){
    saveCallback = null;
    toggle(el.saveConfirmModal, false);
}

function confirmSaveAction(){
    if(saveCallback){
        saveCallback();
    }
    closeSaveConfirmModal();
}

// Обработчик крестика
function setupCloseButton(){
    if(el.ceCloseModal){
        el.ceCloseModal.addEventListener("click", closeCreateEmployeeModal);
    } else {
        console.error("ceCloseModal not found!");
    }
}

// Показ списка зарегистрированных сотрудников
async function showEmployeeList(){
    toggle(el.ceListBlock, true);
    toggle(el.ceManualBlock, false);

    // Подсвечиваем активную кнопку
    el.ceModeList?.classList.add("active");
    el.ceModeManual?.classList.remove("active");

    if(!state.departmentId) return;

    const r = await fetch(`/api/users/registered/${state.departmentId}`);
    const data = await r.json();

    const container = el.ceUsersList;
    container.innerHTML = "";

    if(!data.users || data.users.length === 0){
        container.innerHTML = "<p class='empty'>Сотрудников не найдено</p>";
        return;
    }

    data.users.forEach(user => {
        const div = document.createElement("div");
        div.className = "ce-user-item";
        div.dataset.userId = user.id;
        div.dataset.direction = user.direction || "";
        div.innerHTML = `
            <div class="ce-user-checkbox">
                <input type="checkbox" id="user-${user.id}" value="${user.id}">
                <label for="user-${user.id}">
                    <span class="ce-user-name">${user.last_name} ${user.first_name}</span>
                    ${user.email ? `<span class="ce-user-email">${user.email}</span>` : ''}
                    <span class="ce-user-position">${user.position_name || ""}</span>
                    ${user.direction ? `<span class="ce-user-direction" style="color: var(--direction-color); font-weight: 500;">${user.direction}</span>` : ""}
                </label>
            </div>
        `;
        container.appendChild(div);
    });

    // Показываем фильтр по направлению только для отдела ТП
    if(el.ceDirectionFilterBlock) {
        if(state.departmentId === "2") {
            toggle(el.ceDirectionFilterBlock, true);
        } else {
            toggle(el.ceDirectionFilterBlock, false);
        }
    }

    // Предотвращаем закрытие модалки при клике на элементы списка
    if(el.ceListBlock) {
        el.ceListBlock.addEventListener("click", function(e){
            e.stopPropagation();
        });
    }
}

// Добавление сотрудника из списка
async function addEmployeeFromList(user){
    const success = await api.addEmployee(state.selectedSchedule.id, {
        employee_id: user.id
    });

    if(success){
        showMessage(`Сотрудник ${user.first_name} ${user.last_name} добавлен в график`, "success");
        closeCreateEmployeeModal();

        // Перезагружаем график
        const data = await api.getSchedule(state.selectedSchedule.id);
        state.selectedSchedule = data;
        renderSchedule(data);
    }
}

// Добавление выбранного сотрудника из списка
async function addSelectedEmployees(){
    const checkedItems = el.ceUsersList.querySelectorAll(".ce-user-item input:checked");

    if(checkedItems.length === 0){
        showMessage("Выберите хотя бы одного сотрудника", "warning");
        return;
    }

    // Получаем направление из фильтра
    const selectedDirection = el.ceDirectionFilter?.value || "";

    let success = true;

    // Для отдела ТП проверяем, что выбрано направление
    if(state.departmentId === "2" && !selectedDirection) {
        showMessage("Выберите направление для сотрудников", "warning");
        return;
    }

    for(const checkbox of checkedItems) {
        const item = checkbox.closest(".ce-user-item");
        const userId = item.dataset.userId;

        const result = await api.addEmployee(state.selectedSchedule.id, {
            employee_id: parseInt(userId),
            direction: selectedDirection || null
        });

        if(!result){
            success = false;
            break;
        }
    }

    if(success){
        showMessage(`${checkedItems.length} сотрудников добавлено в график`, "success");
        closeCreateEmployeeModal();

        // Перезагружаем график
        const data = await api.getSchedule(state.selectedSchedule.id);
        state.selectedSchedule = data;
        renderSchedule(data);
    } else {
        showMessage("Ошибка при добавлении сотрудников", "error");
    }
}

// Переключение режимов добавления
function showManualEntry(){
    // Кнопки остаются видимыми - не скрываем ceModeRow
    toggle(el.ceListBlock, false);
    toggle(el.ceManualBlock, true);

    // Подсвечиваем активную кнопку
    el.ceModeManual?.classList.add("active");
    el.ceModeList?.classList.remove("active");

    // Очищаем поля, но сохраняем отдел из графика
    el.ceFirstName.value = "";
    el.ceLastName.value = "";
    el.cePosition.value = "";

    // Всегда блокируем отдел, если есть выбранный график
    const deptId = state.selectedSchedule?.department_id;
    if(deptId && el.ceDepartment) {
        el.ceDepartment.value = deptId;
        el.ceDepartment.disabled = true;

        // Показываем/скрываем блок направления
        if(el.ceDirectionBlock) {
            if(deptId == 2) {
                toggle(el.ceDirectionBlock, true);
            } else {
                toggle(el.ceDirectionBlock, false);
                if(el.ceDirection) el.ceDirection.value = "";
            }
        }
    }
}

// Автоформатирование при вводе
function setupNameAutoFormat(inputEl){
    inputEl.addEventListener("input", function(){
        this.value = capitalizeName(this.value);
    });
}

// Добавляем автоформатирование для полей имени и фамилии
function setupInputHandlers(){
    setupNameAutoFormat(el.ceFirstName);
    setupNameAutoFormat(el.ceLastName);
}

// Заполнение выпадающего списка годов
function setupYearSelect(){
    if(!el.csYear) return;

    const currentYear = new Date().getFullYear();
    el.csYear.innerHTML = "";

    for(let year = currentYear; year <= 2040; year++){
        const opt = document.createElement("option");
        opt.value = year;
        opt.textContent = year;
        if(year === currentYear) opt.selected = true;
        el.csYear.appendChild(opt);
    }
}

function showModeSelection(){
    toggle(el.ceModeRow, true);
    toggle(el.ceListBlock, false);
    toggle(el.ceManualBlock, false);

    // Убираем подсветку
    el.ceModeList?.classList.remove("active");
    el.ceModeManual?.classList.remove("active");

    // Если отдел уже установлен (из графика), блокируем его и показываем/скрываем направление
    const deptId = state.selectedSchedule?.department_id;
    if(deptId && el.ceDepartment) {
        el.ceDepartment.value = deptId;
        el.ceDepartment.disabled = true;

        if(el.ceDirectionBlock) {
            if(deptId == 2) {
                toggle(el.ceDirectionBlock, true);
            } else {
                toggle(el.ceDirectionBlock, false);
                if(el.ceDirection) el.ceDirection.value = "";
            }
        }
    }
}

// Добавление сотрудника вручную
async function addEmployeeManual(){
    // Автоформатирование имен
    const firstName = capitalizeName(el.ceFirstName.value.trim());
    const lastName = capitalizeName(el.ceLastName.value.trim());
    const departmentId = el.ceDepartment.value;
    const positionId = el.cePosition.value;
    const direction = el.ceDirection.value;

    // Валидация
    if(!departmentId){
        showMessage("Выберите отдел","warning");
        return;
    }

    if(!firstName || !lastName){
        showMessage("Заполните имя и фамилию","warning");
        return;
    }

    if(!validateName(firstName) || !validateName(lastName)){
        showMessage("Имя и фамилия должны содержать только русские буквы","warning");
        return;
    }

    if(!positionId){
        showMessage("Выберите должность","warning");
        return;
    }

    // Для отдела ТП направление обязательно
    if(departmentId === "2" && !direction){
        showMessage("Выберите направление","warning");
        return;
    }

    // Получаем название должности
    const positionName = el.cePosition.options[el.cePosition.selectedIndex].text;

    const success = await api.addEmployee(state.selectedSchedule.id, {
        first_name: firstName,
        last_name: lastName,
        position: positionName,
        direction: direction || null
    });

    if(success){
        showMessage(`Сотрудник ${lastName} ${firstName} добавлен в график`, "success");
        closeCreateEmployeeModal();

        // Очищаем форму
        el.ceFirstName.value = "";
        el.ceLastName.value = "";
        el.cePosition.value = "";
        el.ceDirection.value = "";

        // Перезагружаем график
        const data = await api.getSchedule(state.selectedSchedule.id);
        state.selectedSchedule = data;
        renderSchedule(data);
    }
}

// Валидация имени (только русские буквы и пробелы)
function validateName(name){
    const russianNameRegex = /^[а-яёА-ЯЁ\s]+$/;
    return russianNameRegex.test(name);
}

// Форматирование имени (первая буква заглавная)
function capitalizeName(name){
    return name.replace(/(^|\s)[а-яё]/g, function(match){
        return match.toUpperCase();
    });
}

// Загрузка должностей для отдела
async function loadPositions(departmentId){
    const deptId = departmentId || state.departmentId;

    if(!deptId){
        el.cePosition.innerHTML = '<option value="">Сначала выберите отдел</option>';
        return;
    }

    const r = await fetch(`/positions/${deptId}`);
    const positions = await r.json();

    el.cePosition.innerHTML = '<option value="">Выберите должность</option>';

    positions.forEach(pos => {
        const opt = document.createElement("option");
        opt.value = pos.id;
        opt.textContent = pos.name;
        el.cePosition.appendChild(opt);
    });
}

// Обработка выбора отдела в форме
function setupDepartmentHandler(){
    el.ceDepartment?.addEventListener("change", function(){
        const deptId = this.value;
        loadPositions(deptId);

        // Показываем поле направления только для отдела ТП (id=2)
        if(el.ceDirectionBlock) {
            if(deptId === "2") {
                toggle(el.ceDirectionBlock, true);
            } else {
                toggle(el.ceDirectionBlock, false);
                if(el.ceDirection) el.ceDirection.value = "";
            }
        }
    });
}

// Поиск сотрудников в списке
function filterEmployees(){
    const searchTerm = el.ceSearch.value.toLowerCase();
    const items = el.ceUsersList.querySelectorAll(".ce-user-item");

    items.forEach(item => {
        const name = item.querySelector(".ce-user-name").textContent.toLowerCase();
        const position = item.querySelector(".ce-user-position").textContent.toLowerCase();

        if(name.includes(searchTerm) || position.includes(searchTerm)){
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });
}

// Модалка для ввода/редактирования отпуска
function showVacationModal(scheduleEmployeeId, month, employeeName, vacationData = null){
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    // Определяем режим (редактирование или добавление)
    const isEditMode = !!vacationData;
    const modeTitle = isEditMode ? "Редактирование отпуска" : "Планирование отпуска";

    // Создаём модалку динамически
    let modal = document.getElementById("vacationModal");
    if(!modal){
        modal = document.createElement("div");
        modal.id = "vacationModal";
        modal.className = "custom-modal";
        modal.innerHTML = `
            <div class="custom-modal-content">
                <h3 id="vacModalTitle">Планирование отпуска</h3>
                <p id="vacEmployeeName"></p>
                <p id="vacMonthName"></p>

                <label id="vacTypeLabel">Тип отпуска:</label>
                <div id="vacTypeSelector" class="vacation-type-selector">
                    <label class="vacation-type-label">
                        <input type="radio" name="vacationType" value="1" checked>
                        <span class="vacation-type-color type-main"></span>
                        Основной отпуск
                    </label>
                    <label class="vacation-type-label">
                        <input type="radio" name="vacationType" value="2">
                        <span class="vacation-type-color type-education"></span>
                        Учебный отпуск
                    </label>
                    <label class="vacation-type-label">
                        <input type="radio" name="vacationType" value="3">
                        <span class="vacation-type-color type-planned"></span>
                        Запланированный отпуск
                    </label>
                    <label class="vacation-type-label">
                        <input type="radio" name="vacationType" value="4">
                        <span class="vacation-type-color type-decreetal"></span>
                        Декретный отпуск
                    </label>
                </div>

                <label>Дата начала:</label>
                <input type="date" id="vacStartDate" class="input">

                <label>Дата окончания:</label>
                <input type="date" id="vacEndDate" class="input">

                <div class="modal-buttons">
                    <button id="vacSaveBtn" class="schedule-page btn-save">Сохранить</button>
                    <button id="vacCancelBtn" class="schedule-page btn-cancel">Отмена</button>
                </div>
                <div class="modal-buttons">
                    <button id="vacDeleteBtn" class="schedule-page btn-delete hidden">Удалить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Обработчики
        document.getElementById("vacCancelBtn").addEventListener("click", closeVacationModal);
        document.getElementById("vacSaveBtn").addEventListener("click", saveVacation);
        document.getElementById("vacDeleteBtn").addEventListener("click", deleteCurrentVacation);

        // Скрываем выбор типа отпуска в режиме suggestMode
        const typeSelector = modal.querySelector("#vacTypeSelector");
        if(typeSelector) {
            typeSelector.style.display = state.suggestMode ? "none" : "";
        }

        const typeLabel = modal.querySelector("#vacTypeLabel");
        if(typeLabel) {
            typeLabel.style.display = state.suggestMode ? "none" : "";
        }

        // В режиме suggestMode показываем кнопку удаления ТОЛЬКО для запланированных отпусков
        const deleteBtn = document.getElementById("vacDeleteBtn");
        if(deleteBtn) {
            deleteBtn.style.display = state.suggestMode ? "none" : "";
        }
    } else {
        // Модалка уже существует - обновляем видимость элементов
        const typeSelector = modal.querySelector("#vacTypeSelector");
        if(typeSelector) {
            typeSelector.style.display = state.suggestMode ? "none" : "";
        }

        const typeLabel = modal.querySelector("#vacTypeLabel");
        if(typeLabel) {
            typeLabel.style.display = state.suggestMode ? "none" : "";
        }
    }

    // Устанавливаем заголовок
    document.getElementById("vacModalTitle").textContent = modeTitle;

    // Устанавливаем данные
    document.getElementById("vacEmployeeName").textContent = employeeName;
    document.getElementById("vacMonthName").textContent = monthNames[month];

    // Получаем год из selectedSchedule или используем 2026
    const year = state.selectedSchedule?.year || 2026;
    const monthNum = parseInt(month);

    // Вычисляем начало выбранного месяца
    const monthStart = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    // Конец выбранного месяца
    const monthEnd = `${year}-${String(monthNum + 1).padStart(2, '0')}-${new Date(year, monthNum + 1, 0).getDate()}`;
    // Границы всего года
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Сохраняем месяц в dataset модалки (вне блока if(!modal), чтобы обновлялось при каждом открытии)
    modal.dataset.month = month;

    // Если режим редактирования и есть данные отпуска
    if(isEditMode && vacationData){
        // Проверяем, что отпуск в том же году, что и график
        const vacYear = new Date(vacationData.start_date).getFullYear();

        if(vacYear === year) {
            document.getElementById("vacStartDate").value = vacationData.start_date;
            document.getElementById("vacEndDate").value = vacationData.end_date;

            // Устанавливаем тип отпуска
            const typeRadio = modal.querySelector(`input[name="vacationType"][value="${vacationData.type_vacation_id}"]`);
            if(typeRadio) typeRadio.checked = true;

            // Показываем кнопку удаления в suggestMode ТОЛЬКО для запланированных отпусков (type=3)
            const deleteBtn = document.getElementById("vacDeleteBtn");
            if(state.suggestMode && vacationData.type_vacation_id === 3) {
                toggle(deleteBtn, true);
                // Убираем inline style, который переопределяет CSS
                if(deleteBtn) {
                    deleteBtn.style.display = "";
                }
            } else if(!state.suggestMode) {
                toggle(deleteBtn, true);
            } else {
                toggle(deleteBtn, false);
            }
            modal.dataset.vacationId = vacationData.id;

            // Для редактирования: min/max в рамках месяца для начала, до конца года для окончания
            document.getElementById("vacStartDate").min = monthStart;
            document.getElementById("vacEndDate").min = monthStart;
            document.getElementById("vacStartDate").max = monthEnd;
            document.getElementById("vacEndDate").min = document.getElementById("vacStartDate").value;
            document.getElementById("vacEndDate").max = `${year}-12-31`;
        } else {
            // Отпуск в другом году — показываем сообщение
            showMessage("Отпуск не в этом году", "warning");
            closeVacationModal();
            return;
        }
    } else {
        // Режим добавления - ставим начало выбранного месяца, конец - конец выбранного месяца
        document.getElementById("vacStartDate").value = monthStart;
        document.getElementById("vacEndDate").value = monthEnd;

        // Для suggestMode устанавливаем тип "Запланированный" (type=3)
        if(state.suggestMode) {
            const plannedType = modal.querySelector('input[name="vacationType"][value="3"]');
            if(plannedType) plannedType.checked = true;
        }

        // Для нового отпуска: start date ограничена выбранным месяцем
        document.getElementById("vacStartDate").min = monthStart;
        document.getElementById("vacStartDate").max = monthEnd;
        // end date от даты начала до конца года
        document.getElementById("vacEndDate").min = monthStart;
        document.getElementById("vacEndDate").max = yearEnd;

        toggle(document.getElementById("vacDeleteBtn"), false);
        delete modal.dataset.vacationId;
    }

    // Сохраняем schedule_employee_id
    modal.dataset.scheduleEmployeeId = scheduleEmployeeId;

    toggle(modal, true);
}

function closeVacationModal(){
    const modal = document.getElementById("vacationModal");
    if(modal) toggle(modal, false);
    document.body.classList.remove("suggest-mode");
}

async function saveVacation(){
    const modal = document.getElementById("vacationModal");
    if(!modal) return;

    const scheduleEmployeeId = modal.dataset.scheduleEmployeeId;
    const startDate = document.getElementById("vacStartDate").value;
    const endDate = document.getElementById("vacEndDate").value;

    // Получаем выбранный тип отпуска
    const selectedType = modal.querySelector('input[name="vacationType"]:checked');
    const typeVacationId = selectedType ? parseInt(selectedType.value) : 1;

    if(!startDate || !endDate){
        showMessage("Укажите даты отпуска", "warning");
        return;
    }

    if(new Date(endDate) <= new Date(startDate)){
        showMessage("Дата окончания должна быть позже даты начала", "warning");
        return;
    }

    // Для нового отпуска проверяем, что начало не раньше выбранного месяца
    if(!modal.dataset.vacationId && modal.dataset.month !== undefined) {
        const month = parseInt(modal.dataset.month);
        const year = state.selectedSchedule?.year || 2026;
        const monthStart = new Date(year, month, 1);
        const start = new Date(startDate);

        if(start < monthStart) {
            const monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь",
                               "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
            showMessage(`Отпуск не может начаться раньше ${monthNames[month]}`, "warning");
            return;
        }
    }

    // Проверяем, что отпуск в пределах года графика
    const year = state.selectedSchedule?.year || 2026;
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();

    if(startYear !== year || endYear !== year) {
        showMessage(`Отпуск должен быть в ${year} году`, "warning");
        return;
    }

    // Если режим редактирования
    if(modal.dataset.vacationId){
        const vacationId = parseInt(modal.dataset.vacationId);

        if(state.editMode && !state.suggestMode){
            // Находим оригинальные данные отпуска для сравнения
            let originalVacation = null;
            if(state.originalSchedule && state.originalSchedule.employees) {
                for(const emp of state.originalSchedule.employees) {
                    for(const vac of (emp.vacations || [])) {
                        if(vac.id === vacationId) {
                            originalVacation = vac;
                            break;
                        }
                    }
                    if(originalVacation) break;
                }
            }

            // Проверяем, изменилось ли что-то по сравнению с оригиналом
            const originalTypeId = originalVacation ? parseInt(originalVacation.type_vacation_id) : null;
            const originalStart = originalVacation ? originalVacation.start_date : null;
            const originalEnd = originalVacation ? originalVacation.end_date : null;

            const hasTypeChanged = originalTypeId !== null && originalTypeId !== typeVacationId;
            const hasStartChanged = originalStart !== null && originalStart !== startDate;
            const hasEndChanged = originalEnd !== null && originalEnd !== endDate;

            // Проверяем, есть ли вообще изменения
            const hasAnyChanges = state.pendingChanges.modifiedVacations.length > 0 ||
                                 state.pendingChanges.addedVacations.length > 0 ||
                                 state.pendingChanges.deletedVacations.length > 0 ||
                                 Object.keys(state.pendingChanges.updatedNames).length > 0 ||
                                 state.pendingChanges.employeeOrder;

            // Если это уже было добавлено в pendingChanges, просто обновляем
            const existingChange = state.pendingChanges.modifiedVacations.findIndex(v => v.id === vacationId);

            if(existingChange !== -1) {
                // Уже есть в pendingChanges, обновляем
                state.pendingChanges.modifiedVacations[existingChange].startDate = startDate;
                state.pendingChanges.modifiedVacations[existingChange].endDate = endDate;
                state.pendingChanges.modifiedVacations[existingChange].typeId = typeVacationId;
            } else if (hasTypeChanged || hasStartChanged || hasEndChanged) {
                // Добавляем новое изменение
                state.pendingChanges.modifiedVacations.push({
                    id: vacationId,
                    startDate: startDate,
                    endDate: endDate,
                    typeId: typeVacationId
                });
            } else {
                // Нет изменений
                showMessage("Изменений не найдено", "warning");
                closeVacationModal();
                return;
            }

            closeVacationModal();
            showMessage("Отпуск изменён (сохранится при нажатии \"Сохранить\")", "info");
        } else {
            const success = await api.updateVacation(vacationId, {
                start_date: startDate,
                end_date: endDate,
                type_vacation_id: typeVacationId
            });

            if(success){
                closeVacationModal();
                showMessage("Отпуск обновлён", "success");

                // Перезагружаем график
                if(state.selectedSchedule){
                    const data = await api.getSchedule(state.selectedSchedule.id);
                    state.selectedSchedule = data;
                    renderSchedule(data);
                    updateUi();
                }
            }
        }
    } else {
        if(state.editMode && !state.suggestMode){
            // Добавляем в pendingChanges
            state.pendingChanges.addedVacations.push({
                scheduleEmployeeId: scheduleEmployeeId,
                startDate: startDate,
                endDate: endDate,
                typeId: typeVacationId
            });

            closeVacationModal();
            showMessage("Отпуск добавлен (сохранится при нажатии \"Сохранить\")", "info");
        } else {
            // Режим suggestMode - выполняем проверки перед сохранением
            const schedule = state.selectedSchedule;
            const newStart = new Date(startDate);
            const newEnd = new Date(endDate);

            // Проверка 1: пересечение отпусков сотрудников одного направления
            const directionCheck = checkDirectionOverlap(newStart, newEnd, scheduleEmployeeId, schedule);
            if (directionCheck.overlap) {
                closeVacationModal();
                showMessage(`Нельзя запланировать отпуск на эти даты: сотрудник ${directionCheck.employeeName} (${directionCheck.direction}) уже находится в отпуске.`, "error");
                return;
            }

            // Проверка 2: максимум 14 дней летом
            const summerCheck = checkSummerVacationLimit(scheduleEmployeeId, newStart, newEnd, schedule);
            if (!summerCheck.limit) {
                closeVacationModal();
                showMessage(summerCheck.message, "error");
                return;
            }

            // Проверка 3: пересечение отпусков руководителя и заместителя
            const headCheck = checkHeadDeputyOverlap(scheduleEmployeeId, newStart, newEnd, schedule);
            if (headCheck.overlap) {
                closeVacationModal();
                if (headCheck.employee1 && headCheck.employee2) {
                    showMessage(`Отпуска руководителей пересекаются: ${headCheck.employee1} и ${headCheck.employee2} не могут быть в отпуске одновременно.`, "error");
                } else {
                    showMessage(`Нельзя запланировать отпуск: руководитель ${headCheck.employeeName} (${headCheck.position}) уже находится в отпуске.`, "error");
                }
                return;
            }

            // Проверка 4: максимум 28 дней в году
            const yearlyCheck = checkYearlyVacationLimit(scheduleEmployeeId, newStart, newEnd, typeVacationId, schedule);
            if (!yearlyCheck.limit) {
                closeVacationModal();
                showMessage(yearlyCheck.message, "error");
                return;
            }

            // Все проверки пройдены - сохраняем отпуск
            const success = await api.addVacation(scheduleEmployeeId, startDate, endDate, typeVacationId);

            if(success){
                closeVacationModal();
                showMessage("Отпуск успешно запланирован", "success");

                // Выходим из режима редактирования
                state.editMode = false;
                state.suggestMode = false;
                state.originalSchedule = null;
                document.body.classList.remove("suggest-mode");

                // Перезагружаем график и обновляем UI
                if(state.selectedSchedule){
                    const data = await api.getSchedule(state.selectedSchedule.id);
                    state.selectedSchedule = data;
                    renderSchedule(data);
                }
                updateUi();
            } else {
                showMessage("Ошибка при планировании отпуска", "error");
            }
        }
    }
}

async function deleteCurrentVacation(){
    const modal = document.getElementById("vacationModal");
    if(!modal) return;

    const vacationId = modal.dataset.vacationId;
    if(!vacationId) return;

    if(state.editMode && !state.suggestMode){
        // Показываем confirmation modal с z-index выше vacation modal
        showDeleteConfirmModalAboveModal(
            "Удаление отпуска",
            "Вы уверены, что хотите удалить этот отпуск?",
            () => {
                state.pendingChanges.deletedVacations.push(parseInt(vacationId));
                closeVacationModal();
                showMessage("Отпуск помечен на удаление (сохранится при нажатии \"Сохранить\")", "info");
            }
        );
    } else {
        // В режиме suggestMode - удаляем сразу
        showDeleteConfirmModalAboveModal(
            "Удаление отпуска",
            "Вы уверены, что хотите удалить этот отпуск?",
            async () => {
                const success = await api.deleteVacation(parseInt(vacationId));

                if(success){
                    closeVacationModal();
                    showMessage("Отпуск удалён", "success");

                    // Выходим из режима редактирования
                    state.editMode = false;
                    state.suggestMode = false;
                    state.originalSchedule = null;
                    document.body.classList.remove("suggest-mode");
                    toggle(el.btnDeleteSchedule, true);

                    // Перезагружаем график и обновляем UI
                    if(state.selectedSchedule){
                        const data = await api.getSchedule(state.selectedSchedule.id);
                        state.selectedSchedule = data;
                        renderSchedule(data);
                        updateUi();
                    }
                }
            }
        );
    }
}


// ===== Служебная записка =====

function openMemoModal(){
    toggle(el.memoModal, true);
}

function closeMemoModal(){
    toggle(el.memoModal, false);
    // Очищаем поля
    if(el.memoHeadName) el.memoHeadName.value = "";
    if(el.memoHeadPosition) el.memoHeadPosition.value = "";
    if(el.memoHeadDepartment) el.memoHeadDepartment.value = "";
    if(el.memoEmployeeName) el.memoEmployeeName.value = "";
    if(el.memoEmployeePosition) el.memoEmployeePosition.value = "";
    if(el.memoVacFrom) el.memoVacFrom.value = "";
    if(el.memoVacTo) el.memoVacTo.value = "";
    if(el.memoTransferFrom) el.memoTransferFrom.value = "";
    if(el.memoTransferTo) el.memoTransferTo.value = "";
    if(el.memoReason) el.memoReason.value = "";
}

async function generateMemo(){
    const headName = el.memoHeadName?.value.trim();
    const headPosition = el.memoHeadPosition?.value.trim();
    const headDepartment = el.memoHeadDepartment?.value.trim();
    const employeeName = el.memoEmployeeName?.value.trim();
    const employeePosition = el.memoEmployeePosition?.value.trim();
    const vacFrom = el.memoVacFrom?.value;
    const vacTo = el.memoVacTo?.value;
    const transferFrom = el.memoTransferFrom?.value;
    const transferTo = el.memoTransferTo?.value;
    const reason = el.memoReason?.value.trim();

    if(!headName || !headPosition || !headDepartment){
        showMessage("Заполните данные руководителя","warning");
        return;
    }
    if(!employeeName || !employeePosition){
        showMessage("Заполните данные сотрудника","warning");
        return;
    }
    if(!vacFrom || !vacTo){
        showMessage("Укажите период текущего отпуска","warning");
        return;
    }
    if(!transferFrom || !transferTo){
        showMessage("Укажите период переноса отпуска","warning");
        return;
    }
    if(!reason){
        showMessage("Укажите причину","warning");
        return;
    }

    try {
        const response = await fetch("/api/memo/generate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                head_name: headName,
                head_position: headPosition,
                head_department: headDepartment,
                employee_name: employeeName,
                employee_position: employeePosition,
                vac_from: vacFrom,
                vac_to: vacTo,
                transfer_from: transferFrom,
                transfer_to: transferTo,
                reason: reason
            })
        });

        if(!response.ok){
            const error = await response.json();
            showMessage(error.error || "Ошибка генерации","error");
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Служебная_записка.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showMessage("Служебная записка сформирована","success");
        closeMemoModal();

    } catch(err) {
        showMessage("Ошибка при генерации документа","error");
    }
}

// ===== Конец: Служебная записка =====

// Слушатели событий
function bindEvents(){

    el.departmentFilter?.addEventListener("change",onDepartmentChange);

    el.scheduleFilter?.addEventListener("change",onScheduleChange);

    el.isDefaultCheckbox?.addEventListener("change", onDefaultChange);

    el.btnAddEmployee?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        if(state.userRole !== 2 && state.userRole !== 3 && state.userRole !== 4) {
            showMessage("Недостаточно прав", "error");
            return;
        }
        openCreateEmployeeModal();
    });

    el.btnSuggest?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        enableSuggestMode();
    });

    el.btnEdit?.addEventListener("click", handleEditClick);

    el.btnCancel?.addEventListener("click", cancelEdit);

    el.btnSave?.addEventListener("click", saveAllChanges);

    el.btnDeleteSchedule?.addEventListener("click", () => {
        if(state.userRole !== 2 && state.userRole !== 3 && state.userRole !== 4) {
            showMessage("Недостаточно прав", "error");
            return;
        }
        deleteEmployeeFromSchedule();
    });

    el.btnCreateSchedule?.addEventListener("click", () => {
        if(state.userRole !== 2 && state.userRole !== 3 && state.userRole !== 4) {
            showMessage("Недостаточно прав", "error");
            return;
        }
        openCreateScheduleModal();
    });

    el.closeCreateScheduleModalBtn?.addEventListener("click",closeCreateScheduleModal);

    el.ceCancel?.addEventListener("click",closeCreateEmployeeModal);

    // Кнопки режимов добавления сотрудника
    el.ceModeList?.addEventListener("click", showEmployeeList);
    el.ceModeManual?.addEventListener("click", showManualEntry);

    // Кнопка добавления выбранных сотрудников
    el.ceAddSelected?.addEventListener("click", addSelectedEmployees);

    // Кнопки возврата к выбору режима
    el.ceBackToMenu?.addEventListener("click", showModeSelection);
    el.ceBackToMenuManual?.addEventListener("click", showModeSelection);

    // Кнопка сохранения ручного ввода
    el.ceSave?.addEventListener("click", addEmployeeManual);

    // Поиск сотрудников
    el.ceSearch?.addEventListener("input", filterEmployees);
    el.ceSearch?.addEventListener("click", function(e){
        e.stopPropagation();
    });

    // Фильтр по направлению (устанавливает значение для добавления)
    el.ceDirectionFilter?.addEventListener("change", function(){
        // Просто запоминаем выбранное значение, фильтрация не нужна
    });
    el.ceDirectionFilter?.addEventListener("click", function(e){
        e.stopPropagation();
    });

    // Обработчик выбора отдела
    setupDepartmentHandler();

    // Кнопка закрытия модалки
    setupCloseButton();

    // Закрытие по ESC
    document.addEventListener("keydown", handleEscKey);

    // Кнопки подтверждения удаления
    el.confirmDeleteBtn?.addEventListener("click", confirmDeleteAction);
    el.cancelDeleteBtn?.addEventListener("click", closeDeleteConfirmModal);

    // Кнопки подтверждения назначения по умолчанию
    el.confirmDeleteBtn?.addEventListener("click", confirmDefaultAction);
    el.cancelDeleteBtn?.addEventListener("click", closeDeleteConfirmModal);

    // Кнопки подтверждения сохранения
    el.confirmSaveBtn?.addEventListener("click", confirmSaveAction);
    el.cancelSaveBtn?.addEventListener("click", closeSaveConfirmModal);

    // Служебная записка
    el.memoBtn?.addEventListener("click", openMemoModal);
    el.memoCancelBtn?.addEventListener("click", closeMemoModal);
    el.memoGenerateBtn?.addEventListener("click", generateMemo);

    // Создание графика
    el.confirmCreateScheduleBtn?.addEventListener("click", async () => {
        const name = el.csName.value.trim();
        const departmentId = el.csDepartment.value;
        const year = el.csYear.value;
        const isDefault = el.csIsDefault?.checked || false;

        if(!name){
            showMessage("Введите название графика","warning");
            return;
        }

        const r = await fetch("/api/schedules/create", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                name: name,
                department_id: parseInt(departmentId),
                year: parseInt(year),
                is_default: isDefault
            })
        });

        const data = await r.json();

        if(r.ok){
            showMessage("График успешно создан", "success");
            closeCreateScheduleModal();

            // Очищаем форму
            el.csName.value = "";
            if(el.csIsDefault) el.csIsDefault.checked = false;

            // Перезагружаем список графиков
            if(state.departmentId){
                await onDepartmentChange();
            }
        } else {
            showMessage(data.error || "Ошибка создания графика", "error");
        }
    });

}

function initSchedule(){

    cacheDom();

    // Перемещаем messageBox в .page-anim.show
    if(el.messageBox) {
        const pageAnim = document.querySelector('.page-anim.show');
        if(pageAnim) {
            pageAnim.appendChild(el.messageBox);
        }
    }

    bindEvents();

    setupInputHandlers();

    setupYearSelect();

    state.editMode=false;
    state.suggestMode=false;
    state.selectedSchedule=null;

    // Загружаем данные текущего пользователя и автовыбираем отдел
    loadCurrentUser();

    renderSchedule(null);

    updateUi();

}

// Алиас для main.js
window.initSchedulePage = initSchedule;

// Загрузка данных текущего пользователя
async function loadCurrentUser(){
    const user = await api.getCurrentUser();

    if(user && user.department_id){
        state.userDepartmentId = user.department_id;
        state.currentUserId = user.id;
        state.currentEmail = user.email;
        state.currentFirstName = user.first_name || "";
        state.currentLastName = user.last_name || "";
        state.userRole = user.role_id;

        // Устанавливаем отдел пользователя
        el.departmentFilter.value = user.department_id;
        await onDepartmentChange();

        // Для обычных сотрудников сразу загружаем график по умолчанию
        if(state.userRole !== 2 && state.userRole !== 3 && state.userRole !== 4) {
            // Блокируем фильтры
            el.departmentFilter.disabled = true;
            el.scheduleFilter.disabled = true;
            el.departmentFilter.style.opacity = '0.5';
            el.scheduleFilter.style.opacity = '0.5';
            el.departmentFilter.style.cursor = 'not-allowed';
            el.scheduleFilter.style.cursor = 'not-allowed';

            // Блокируем чекбокс
            el.isDefaultCheckbox.disabled = true;
            const label = el.isDefaultCheckbox.closest('.schedule-default-label');
            if(label) {
                label.classList.add('disabled-label');
            }
        }
    }

    // Загружаем типы отпусков
    state.vacationTypes = await api.getVacationTypes();
}

function renderSchedule(data){

    const tbody = document.getElementById("scheduleTableBody");
    const grid = document.getElementById("vacationGrid");

    if(!tbody) return;

    tbody.innerHTML = "";

    // Всегда показываем контейнер
    toggle(grid, true);

    // Показываем легенды только если есть график
    toggle(el.directionLegend, !!data);
    toggle(el.vacationLegend, !!data);

    if(!data || !data.employees || data.employees.length === 0){

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td colspan="15" class="empty">
                В графике пока нет сотрудников
            </td>
        `;
        tbody.appendChild(tr);
        return;
    }

    data.employees.forEach(emp => {

        const tr = document.createElement("tr");
        tr.dataset.employeeId = emp.schedule_employee_id;

        // Ищем текущего пользователя в графике
        let currentEmpScheduleEmployeeId = null;
        if(state.currentUserId) {
            const currentUserEmp = data.employees.find(e => {
                // Сравниваем по user_id (приводим к числу)
                const userIdMatch = e.user_id !== null && Number(e.user_id) === Number(state.currentUserId);
                // Сравниваем по email
                const emailMatch = e.email === state.currentEmail;
                return userIdMatch || emailMatch;
            });
            if(currentUserEmp) {
                currentEmpScheduleEmployeeId = currentUserEmp.schedule_employee_id;
            }
        }

        const isCurrentUser = currentEmpScheduleEmployeeId &&
                              emp.schedule_employee_id == currentEmpScheduleEmployeeId;

        // Создаём ячейки для месяцев
        const year = data?.year || 2026;
        
        // Для каждого месяца определяем отпуск
        const monthVacations = new Array(12).fill(null);
        for(const vac of (emp.vacations || [])) {
            const vacStart = new Date(vac.start_date);
            const vacEnd = new Date(vac.end_date);
            const startMonth = vacStart.getMonth();
            const endMonth = vacEnd.getMonth();
            for(let m = startMonth; m <= endMonth; m++) {
                if(m >= 0 && m < 12) {
                    monthVacations[m] = vac;
                }
            }
        }
        
        // Рендерим 12 ячеек (по одной на каждый месяц)
        let months = "";
        const processedVacations = new Set();
        
        for(let m = 0; m < 12; m++) {
            const vacation = monthVacations[m];
            let cellClass = "month-cell";
            let cellContent = "";
            let tooltip = "";
            
            if(vacation) {
                // Ячейка с отпуском
                const typeClass = getVacationTypeClass(vacation.type_vacation_id);
                cellClass += ` vacation-cell ${typeClass}`;
                if(state.editMode) cellClass += " editable-vacation";
                
                // Определяем цвет
                let bgColor = '#1e3a8a';
                if(typeClass === 'type-education') bgColor = '#60a5fa';
                else if(typeClass === 'type-planned') bgColor = '#fbbf24';
                else if(typeClass === 'type-decreetal') bgColor = '#16a34a';
                
                const vacStart = new Date(vacation.start_date);
                const vacEnd = new Date(vacation.end_date);
                const startMonth = vacStart.getMonth();
                const endMonth = vacEnd.getMonth();
                const startDay = vacStart.getDate();
                const endDay = vacEnd.getDate();
                
                // Вычисляем позицию и ширину цветной полосы
                let leftPercent = 0;
                let widthPercent = 100;
                let borderRadius = '0';
                
                if(m === startMonth && m === endMonth) {
                    // Отпуск в пределах одного месяца
                    const daysInMonth = new Date(year, m + 1, 0).getDate();
                    leftPercent = ((startDay - 1) / daysInMonth) * 100;
                    widthPercent = ((endDay - startDay + 1) / daysInMonth) * 100;
                    borderRadius = '4px';
                } else if(m === startMonth) {
                    // Первый месяц отпуска
                    const daysInMonth = new Date(year, m + 1, 0).getDate();
                    leftPercent = ((startDay - 1) / daysInMonth) * 100;
                    widthPercent = 100 - leftPercent;
                    borderRadius = '4px 0 0 4px';
                } else if(m === endMonth) {
                    // Последний месяц отпуска
                    const daysInMonth = new Date(year, m + 1, 0).getDate();
                    widthPercent = (endDay / daysInMonth) * 100;
                    borderRadius = '0 4px 4px 0';
                }
                // Для промежуточных месяцев — полная ширина (100%)
                
                // Вычисляем количество дней отпуска
                const daysDiff = Math.round((vacEnd - vacStart) / (1000 * 60 * 60 * 24)) + 1;
                const daysWord = declineVacationDays(daysDiff);
                
                tooltip = `📅 ${formatDate(vacation.start_date)} - ${formatDate(vacation.end_date)} (${daysDiff} ${daysWord})`;
                
                cellContent = `<div style="position: absolute; top: 0; left: ${leftPercent}%; width: ${widthPercent}%; height: 100%; background: ${bgColor}; border-radius: ${borderRadius}; pointer-events: none;"></div>`;
                
                processedVacations.add(vacation.id);
            }
            
            if(state.editMode && !cellContent) {
                if(state.suggestMode && isCurrentUser) {
                    cellClass += " editable";
                } else if(!state.suggestMode) {
                    cellClass += " editable";
                }
            }
            
            months += `<td class="${cellClass}" data-month="${m}" data-tooltip="${tooltip}" data-vacation-id="${vacation?.id || ''}" data-vacation-type="${vacation?.type_vacation_id || ''}" style="position: relative;">${cellContent}</td>`;
        }

        // В режиме редактирования делаем ФИ кликабельными
        let nameCell1, nameCell2;
        const directionClass = getDirectionClass(emp.direction);
        
        if(state.editMode && !state.suggestMode){
            nameCell1 = `<td class="col-name editable-name ${directionClass}" data-field="first_name">${emp.first_name ?? ""}</td>`;
            nameCell2 = `<td class="col-name editable-name ${directionClass}" data-field="last_name">${emp.last_name ?? ""}</td>`;
        } else {
            nameCell1 = `<td class="col-name ${directionClass}">${emp.first_name ?? ""}</td>`;
            nameCell2 = `<td class="col-name ${directionClass}">${emp.last_name ?? ""}</td>`;
        }

        tr.innerHTML = `
            ${nameCell1}
            ${nameCell2}
            <td class="col-position">${emp.position ?? ""}</td>
            ${months}
        `;

        tbody.appendChild(tr);

    });

    // Добавляем обработчики для ячеек в режиме редактирования
    if(state.editMode){
        document.querySelectorAll(".month-cell.editable, .vacation-cell.editable-vacation").forEach(cell => {
            // Удаляем старый обработчик, если есть
            cell.removeEventListener("click", handleMonthCellClick);
            cell.addEventListener("click", handleMonthCellClick);
        });

        // Обработчики для редактирования ФИ
        document.querySelectorAll(".editable-name").forEach(cell => {
            // Удаляем старый обработчик, если есть
            cell.removeEventListener("click", handleNameEdit);
            cell.addEventListener("click", handleNameEdit);
        });

        // Делаем строки перетаскиваемыми
        setupDragAndDrop(tbody);
    }

    // Обработчик выбора строки (для удаления) - делегирование событий
    // Вешается всегда, чтобы можно было выбрать строку
    const tableBody = document.querySelector("#scheduleTableBody");
    if(tableBody){
        // Удаляем старый обработчик, если есть
        tableBody.removeEventListener("click", handleRowSelection);
        tableBody.addEventListener("click", handleRowSelection);
    }

}

// Обработка выбора строки (делегирование событий)
function handleRowSelection(e){
    const row = e.target.closest("#scheduleTableBody tr");
    
    // Игнорируем пустые строки и клики по editable-name
    if(!row || row.querySelector(".empty") || e.target.closest(".editable-name")){
        return;
    }
    
    // Убираем выделение со всех строк
    document.querySelectorAll("#scheduleTableBody tr").forEach(r => {
        r.classList.remove("row-selected");
    });
    
    // Выделяем текущую строку
    row.classList.add("row-selected");
}

// Настройка drag-and-drop для таблицы
let draggedRow = null;

function setupDragAndDrop(tbody) {
    const rows = tbody.querySelectorAll("tr:not(.empty)");
    
    rows.forEach(row => {
        row.draggable = true;
        
        row.addEventListener("dragstart", handleDragStart);
        row.addEventListener("dragend", handleDragEnd);
    });
    
    tbody.addEventListener("dragover", handleDragOver);
    tbody.addEventListener("dragleave", handleDragLeave);
    tbody.addEventListener("drop", handleDrop);
}

function handleDragStart(e) {
    draggedRow = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
}

function handleDragEnd(e) {
    this.classList.remove("dragging");
    draggedRow = null;
    
    // Убираем все классы-плейсхолдеры
    document.querySelectorAll(".drag-over").forEach(row => {
        row.classList.remove("drag-over");
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    const targetRow = e.target.closest("tr");
    if(!targetRow || targetRow === draggedRow || targetRow.querySelector(".empty")) {
        return;
    }
    
    // Убираем класс со всех строк
    document.querySelectorAll("#scheduleTableBody tr").forEach(row => {
        row.classList.remove("drag-over");
    });
    
    // Добавляем класс на целевую строку
    targetRow.classList.add("drag-over");
}

function handleDragLeave(e) {
    // Ничего не делаем, класс убирается в dragover
}

function handleDrop(e) {
    e.preventDefault();
    
    const targetRow = e.target.closest("tr");
    if(!targetRow || targetRow === draggedRow || targetRow.querySelector(".empty")) {
        return;
    }
    
    // Определяем, куда вставлять (до или после целевой строки)
    const tbody = targetRow.parentNode;
    const rows = Array.from(tbody.querySelectorAll("tr:not(.empty)"));
    const draggedIndex = rows.indexOf(draggedRow);
    const targetIndex = rows.indexOf(targetRow);
    
    if(draggedIndex < targetIndex) {
        tbody.insertBefore(draggedRow, targetRow.nextSibling);
    } else {
        tbody.insertBefore(draggedRow, targetRow);
    }
    
    // Добавляем порядок в pendingChanges (сохранится при нажатии "Сохранить")
    if(state.editMode && !state.suggestMode && state.selectedSchedule) {
        const employeeOrder = Array.from(tbody.querySelectorAll("tr:not(.empty)"))
            .map(row => row.dataset.employeeId);
        
        state.pendingChanges.employeeOrder = employeeOrder;
        showMessage("Порядок сотрудников изменён (сохранится при нажатии \"Сохранить\")", "info");
    }
    
    // Убираем классы
    document.querySelectorAll(".drag-over").forEach(row => {
        row.classList.remove("drag-over");
    });
}

// Получение отпуска для месяца
function getVacationForMonth(vacations, monthIndex){
    if(!vacations || vacations.length === 0) return null;

    // Используем год из выбранного графика
    const year = state.selectedSchedule?.year || 2026;
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);

    return vacations.find(v => {
        const startDate = new Date(v.start_date);
        const endDate = new Date(v.end_date);
        // Отпуск пересекается с месяцем, если он начинается до конца месяца
        // и заканчивается после начала месяца
        return startDate <= monthEnd && endDate >= monthStart;
    });
}

// Получение CSS класса по типу отпуска
function getVacationTypeClass(typeId){
    switch(parseInt(typeId)){
        case 2: return "type-education";
        case 3: return "type-planned";
        case 4: return "type-decreetal";
        default: return "type-main";
    }
}

// Форматирование даты
function formatDate(dateStr){
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU");
}

// Обработка клика по ячейке месяца
function handleMonthCellClick(e){
    const month = parseInt(e.target.dataset.month);
    const row = e.target.closest("tr");
    const scheduleEmployeeId = row.dataset.employeeId;
    
    if(!scheduleEmployeeId){
        showMessage("Сначала добавьте сотрудника в график", "warning");
        return;
    }

    // Получаем данные сотрудника и отпуск ДО проверки suggestMode
    const lastName = row.children[0]?.textContent || "";
    const firstName = row.children[1]?.textContent || "";
    const employeeName = `${lastName} ${firstName}`;

    const empData = state.selectedSchedule?.employees?.find(
        emp => emp.schedule_employee_id == scheduleEmployeeId
    );

    const vacation = getVacationForMonth(empData?.vacations || [], month);

    // В режиме suggestMode проверяем, что это текущий пользователь
    if(state.suggestMode) {
        // Сначала находим текущего пользователя в графике
        let currentEmpScheduleEmployeeId = null;
        for(const emp of state.selectedSchedule.employees) {
            if(emp.user_id === state.currentUserId || emp.email === state.currentEmail) {
                currentEmpScheduleEmployeeId = emp.schedule_employee_id;
                break;
            }
        }
        
        // Если текущего пользователя нет в графике
        if(!currentEmpScheduleEmployeeId) {
            showMessage("Вы отсутствуют в данном графике", "warning");
            return;
        }
        
        // Проверяем, кликнули ли на свою строку
        if(currentEmpScheduleEmployeeId != scheduleEmployeeId) {
            showMessage("Вы можете планировать отпуск только для себя", "warning");
            return;
        }
        
        // Если есть отпуск и это не запланированный тип (type=3), запрещаем редактирование
        if(vacation && vacation.type_vacation_id !== 3) {
            showMessage("Нельзя редактировать данный тип отпуска. Вы можете добавлять только запланированные отпуска.", "warning");
            return;
        }
    }

    if(vacation){
        // Редактирование существующего отпуска
        showVacationModal(scheduleEmployeeId, month, employeeName, vacation);
    } else {
        // Добавление нового отпуска
        showVacationModal(scheduleEmployeeId, month, employeeName, null);
    }
}

// Обработка клика по ФИ сотрудника (редактирование)
function handleNameEdit(e){
    const cell = e.target;
    const field = cell.dataset.field;
    const row = cell.closest("tr");
    const scheduleEmployeeId = row.dataset.employeeId;
    
    if(!scheduleEmployeeId){
        return;
    }

    const currentValue = cell.textContent.trim();
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentValue;
    input.className = "input name-edit-input";
    input.style.width = "100%";
    input.style.textAlign = "left";

    cell.textContent = "";
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newValue = input.value.trim();
        
        if(newValue && newValue !== currentValue){
            // Сохраняем изменение в pendingChanges
            if(!state.pendingChanges.updatedNames[scheduleEmployeeId]){
                state.pendingChanges.updatedNames[scheduleEmployeeId] = {};
            }
            state.pendingChanges.updatedNames[scheduleEmployeeId][field] = newValue;
            
            cell.textContent = newValue;
            showMessage(`Изменение ${field}: ${newValue} (сохранится при нажатии "Сохранить")`, "info");
        } else {
            cell.textContent = currentValue;
        }

        // Удаляем input
        if(input.parentNode === cell){
            cell.removeChild(input);
        }
    };

    input.addEventListener("blur", saveEdit);
    input.addEventListener("keydown", (e) => {
        if(e.key === "Enter"){
            input.blur();
        } else if(e.key === "Escape"){
            cell.textContent = currentValue;
            if(input.parentNode === cell){
                cell.removeChild(input);
            }
        }
    });
}

// ==================== СЛУЖЕБНАЯ ЗАПИСКА ====================

function openMemoModal(){
    if(!el.memoModal) return;
    // Очищаем форму
    el.memoHeadName.value = "";
    el.memoHeadPosition.value = "";
    el.memoHeadDepartment.value = "";
    el.memoEmployeeName.value = "";
    el.memoEmployeePosition.value = "";
    el.memoEmployeeDepartment.value = "";
    el.memoVacFrom.value = "";
    el.memoVacTo.value = "";
    el.memoTransferFrom.value = "";
    el.memoTransferTo.value = "";
    el.memoReason.value = "";
    el.memoModal.classList.remove("hidden");
}

function closeMemoModal(){
    if(el.memoModal) {
        el.memoModal.classList.add("hidden");
    }
}

async function generateMemo(){
    // Валидация всех полей
    const headName = el.memoHeadName.value.trim();
    const headPosition = el.memoHeadPosition.value.trim();
    const headDepartment = el.memoHeadDepartment.value.trim();
    const employeeName = el.memoEmployeeName.value.trim();
    const employeePosition = el.memoEmployeePosition.value.trim();
    const employeeDepartment = el.memoEmployeeDepartment.value.trim();
    const vacFrom = el.memoVacFrom.value;
    const vacTo = el.memoVacTo.value;
    const transferFrom = el.memoTransferFrom.value;
    const transferTo = el.memoTransferTo.value;
    const reason = el.memoReason.value.trim();

    if(!headName || !headPosition || !headDepartment){
        showMessage("Заполните данные руководителя","warning");
        return;
    }
    if(!employeeName || !employeePosition || !employeeDepartment){
        showMessage("Заполните данные сотрудника","warning");
        return;
    }
    if(!vacFrom || !vacTo){
        showMessage("Укажите период текущего отпуска","warning");
        return;
    }
    if(!transferFrom || !transferTo){
        showMessage("Укажите период переноса отпуска","warning");
        return;
    }
    if(!reason){
        showMessage("Укажите причину","warning");
        return;
    }

    // Отключаем кнопку
    el.memoGenerateBtn.disabled = true;
    el.memoGenerateBtn.textContent = "Генерация...";

    try {
        const response = await fetch("/api/memo/generate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                head_name: headName,
                head_position: headPosition,
                head_department: headDepartment,
                employee_name: employeeName,
                employee_position: employeePosition,
                employee_department: employeeDepartment,
                vac_from: vacFrom,
                vac_to: vacTo,
                transfer_from: transferFrom,
                transfer_to: transferTo,
                reason: reason
            })
        });

        if(!response.ok){
            const error = await response.json();
            showMessage(error.error || "Ошибка генерации PDF","error");
            return;
        }

        // Получаем Blob и открываем в новом окне
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Служебная_записка.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        closeMemoModal();
        showMessage("Служебная записка сформирована","success");

    } catch(err) {
        showMessage("Ошибка при генерации документа","error");
        console.error(err);
    } finally {
        el.memoGenerateBtn.disabled = false;
        el.memoGenerateBtn.textContent = "Сформировать";
    }
}

// ==================== УДАЛЕНИЕ СОТРУДНИКА ====================

// Обработчик удаления
async function deleteEmployeeFromSchedule(){
    // В режиме редактирования - удаляем сотрудника
    if(state.editMode && !state.suggestMode) {
        const selectedRow = document.querySelector(".row-selected");
        
        if(!selectedRow){
            showMessage("Выберите сотрудника для удаления", "warning");
            return;
        }

        const scheduleEmployeeId = selectedRow.dataset.employeeId;
        const employeeName = `${selectedRow.children[0]?.textContent} ${selectedRow.children[1]?.textContent}`;

        showDeleteConfirmModal(
            "Удаление сотрудника",
            `Вы уверены, что хотите удалить сотрудника ${employeeName} из графика?`,
            async () => {
                const success = await api.deleteScheduleEmployee(scheduleEmployeeId);

                if(success){
                    showMessage("Сотрудник удалён из графика", "success");
                    
                    // Сбрасываем режим редактирования
                    state.editMode = false;
                    state.suggestMode = false;
                    state.originalSchedule = null;
                    document.body.classList.remove("suggest-mode");
                    state.pendingChanges = {
                        updatedNames: {},
                        addedVacations: [],
                        deletedVacations: [],
                        modifiedVacations: [],
                        employeeOrder: null
                    };
                    
                    // Перезагружаем график
                    const data = await api.getSchedule(state.selectedSchedule.id);
                    state.selectedSchedule = data;
                    renderSchedule(data);
                    updateUi();
                }
            }
        );
    } else {
        // В обычном режиме - удаляем весь график
        showDeleteConfirmModal(
            "Удаление графика",
            "Вы уверены, что хотите удалить этот график?",
            async () => {
                // Здесь будет логика удаления графика
                showMessage("Удаление графика пока не реализовано", "info");
            }
        );
    }
}


window.initSchedulePage = function () {

    initSchedule();

};