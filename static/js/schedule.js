console.log("schedule.js loaded");

const state = {
    editMode:false,
    suggestMode: false,
    schedules:[],
    selectedSchedule:null,
    originalSchedule:null,
    departmentId:null,
    userDepartmentId: null,
    currentFirstName: null,
    currentLastName: null,
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

// Маппинг ключевых слов должности → категория цвета
const POSITION_CATEGORIES = [
    { keywords: ["руководитель проекта"], category: "project_lead" },
    { keywords: ["заместитель руководителя", "руководитель отдела"], category: "pink" },
    { keywords: ["ведущий специалист", "специалист"], category: "turquoise" },
    { keywords: ["оператор"], category: "operator" },
    { keywords: ["ведущий инженер", "инженер"], category: "orange" },
    { keywords: ["ассистент"], category: "dark_blue" }
];

// Получить категорию должности по названию
function getPositionCategory(positionName) {
    if (!positionName) return "default";
    const lower = positionName.toLowerCase();
    
    for (const cat of POSITION_CATEGORIES) {
        for (const keyword of cat.keywords) {
            if (lower.includes(keyword)) {
                return cat.category;
            }
        }
    }
    return "default";
}

// Получить CSS класс для категории
function getCategoryClass(category) {
    const classMap = {
        "project_lead": "pos-category-project-lead",
        "pink": "pos-category-pink",
        "turquoise": "pos-category-turquoise",
        "operator": "pos-category-operator",
        "orange": "pos-category-orange",
        "dark_blue": "pos-category-dark-blue",
        "default": ""
    };
    return classMap[category] || "";
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
    btnTransfer:"#transferVacationBtn",
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
    ceCloseModal:"#ceCloseModal",

    deleteConfirmModal:"#deleteConfirmModal",
    deleteModalTitle:"#deleteModalTitle",
    deleteModalText:"#deleteModalText",
    confirmDeleteBtn:"#confirmDeleteBtn",
    cancelDeleteBtn:"#cancelDeleteBtn",

    saveConfirmModal:"#saveConfirmModal",
    saveModalText:"#saveModalText",
    confirmSaveBtn:"#confirmSaveBtn",
    cancelSaveBtn:"#cancelSaveBtn"
};

let el = {};

function cacheDom(){
    Object.entries(DOM).forEach(([k,s])=>{
        el[k] = document.querySelector(s);
    });
}

function bindEvents(){
    if(el.btnEdit){
        el.btnEdit.addEventListener("click", handleEditClick);
    }
}

function toggle(element,show,disable=false){
    if(!element) return;
    element.classList.toggle("hidden",!show);
    element.disabled = disable;
}

function toggleGroup(names,show){
    names.forEach(n=>toggle(el[n],show));
}

function showMessage(text,type="info"){
    if(!el.messageBox) return;

    el.messageBox.textContent = text;
    el.messageBox.className = "admin-message admin-" + type;
    el.messageBox.classList.add("show");

    setTimeout(()=>{
        el.messageBox.classList.remove("show");
    },3000);
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
            showMessage("Ошибка установки обязательного графика","error");
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

    // Блокируем чекбокс если график не выбран
    if(el.isDefaultCheckbox){
        el.isDefaultCheckbox.disabled = !hasSchedule;
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
        toggle(el.btnAddEmployee, true, false);
        toggle(el.btnTransfer, true, false);
        toggle(el.btnSuggest, true, false);
        toggle(el.btnCreateSchedule, true, false);

        toggleGroup([
            "btnTransfer",
            "btnSuggest"
        ], true);

        toggle(el.editIndicator, false);
        toggle(el.editButtonsRow, false);

        // Показываем кнопку "Редактировать"
        toggle(el.btnEdit, true);

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

    showMessage("Выберите график", "info");

    const schedules = await api.getSchedules(depId);

    if(!schedules || schedules.length === 0){
        showMessage("Для этого отдела графики не найдены", "warning");
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

    el.scheduleFilter.disabled = false;

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

    state.selectedSchedule = data || [];

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

    showMessage("Режим редактирования включён. Вносите изменения.", "info");

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

    // Перерендериваем таблицу с редактируемыми ячейками
    renderSchedule(state.selectedSchedule);
    updateUi();

    showMessage("Режим: предложите отпуск только для себя", "info");

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
                    showMessage("График установлен как обязательный", "success");
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
            showMessage("График больше не является обязательным", "info");
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
    toggle(el.createScheduleModal,true);
}

function closeCreateScheduleModal(){
    toggle(el.createScheduleModal,false);
}

function openCreateEmployeeModal(){

    if(!state.selectedSchedule){
        showMessage("Сначала выберите график","warning");
        return;
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
    
    // Закрытие по клику на фон модалки
    if(el.createEmployeeModal){
        el.createEmployeeModal.addEventListener("click", function(e){
            if(e.target === el.createEmployeeModal){
                closeCreateEmployeeModal();
            }
        });
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
        div.innerHTML = `
            <div class="ce-user-checkbox">
                <input type="checkbox" id="user-${user.id}" value="${user.id}">
                <label for="user-${user.id}">
                    <span class="ce-user-name">${user.last_name} ${user.first_name}</span>
                    <span class="ce-user-position">${user.position_name || ""}</span>
                </label>
            </div>
        `;
        container.appendChild(div);
    });
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

    let success = true;
    const employees = [];

    checkedItems.forEach(checkbox => {
        const item = checkbox.closest(".ce-user-item");
        const userId = item.dataset.userId;
        const userName = item.querySelector(".ce-user-name").textContent;
        employees.push({ id: userId, name: userName });
    });

    for(const emp of employees){
        const result = await api.addEmployee(state.selectedSchedule.id, {
            employee_id: parseInt(emp.id)
        });
        
        if(!result){
            success = false;
            break;
        }
    }

    if(success){
        const names = employees.map(e => e.name).join(", ");
        showMessage(`${employees.length} сотрудников добавлено в график`, "success");
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
    
    // Очищаем поля
    el.ceFirstName.value = "";
    el.ceLastName.value = "";
    el.cePosition.value = "";
    el.ceDepartment.value = "";
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
}

// Добавление сотрудника вручную
async function addEmployeeManual(){
    // Автоформатирование имен
    const firstName = capitalizeName(el.ceFirstName.value.trim());
    const lastName = capitalizeName(el.ceLastName.value.trim());
    const departmentId = el.ceDepartment.value;
    const positionId = el.cePosition.value;

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

    // Получаем название должности
    const positionName = el.cePosition.options[el.cePosition.selectedIndex].text;

    const success = await api.addEmployee(state.selectedSchedule.id, {
        first_name: firstName,
        last_name: lastName,
        position: positionName
    });

    if(success){
        showMessage(`Сотрудник ${lastName} ${firstName} добавлен в график`, "success");
        closeCreateEmployeeModal();
        
        // Очищаем форму
        el.ceFirstName.value = "";
        el.ceLastName.value = "";
        el.cePosition.value = "";
        
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
    return name.replace(/\b\w/g, l => l.toUpperCase());
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

                <label>Тип отпуска:</label>
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
                    <button id="vacDeleteBtn" class="schedule-page btn-delete hidden">Удалить</button>
                    <button id="vacCancelBtn" class="schedule-page btn-cancel">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Обработчики
        document.getElementById("vacCancelBtn").addEventListener("click", closeVacationModal);
        document.getElementById("vacSaveBtn").addEventListener("click", saveVacation);
        document.getElementById("vacDeleteBtn").addEventListener("click", deleteCurrentVacation);
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

    document.getElementById("vacStartDate").min = yearStart;
    document.getElementById("vacStartDate").max = yearEnd;
    document.getElementById("vacEndDate").min = yearStart;
    document.getElementById("vacEndDate").max = yearEnd;

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

            // Показываем кнопку удаления
            toggle(document.getElementById("vacDeleteBtn"), true);
            modal.dataset.vacationId = vacationData.id;
            
            // Для редактирования: min = начало отпуска, max = конец отпуска
            document.getElementById("vacStartDate").min = vacationData.start_date;
            document.getElementById("vacEndDate").min = vacationData.start_date;
            document.getElementById("vacStartDate").max = vacationData.end_date;
            document.getElementById("vacEndDate").max = vacationData.end_date;
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
        
        // Для нового отпуска: только даты текущего года графика
        document.getElementById("vacStartDate").min = yearStart;
        document.getElementById("vacEndDate").min = yearStart;
        document.getElementById("vacStartDate").max = yearEnd;
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
            const success = await api.addVacation(scheduleEmployeeId, startDate, endDate, typeVacationId);

            if(success){
                closeVacationModal();
                showMessage("Отпуск успешно запланирован", "success");
                
                // Перезагружаем график
                if(state.selectedSchedule){
                    const data = await api.getSchedule(state.selectedSchedule.id);
                    state.selectedSchedule = data;
                    renderSchedule(data);
                    updateUi();
                }
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
        showDeleteConfirmModalAboveModal(
            "Удаление отпуска",
            "Вы уверены, что хотите удалить этот отпуск?",
            async () => {
                const success = await api.deleteVacation(parseInt(vacationId));

                if(success){
                    closeVacationModal();
                    showMessage("Отпуск удалён", "success");
                    
                    // Перезагружаем график
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


// Слушатели событий
function bindEvents(){

    el.departmentFilter?.addEventListener("change",onDepartmentChange);

    el.scheduleFilter?.addEventListener("change",onScheduleChange);

    el.isDefaultCheckbox?.addEventListener("change", onDefaultChange);

    el.btnEdit?.addEventListener("click", handleEditClick);

    el.btnCancel?.addEventListener("click", cancelEdit);

    el.btnSave?.addEventListener("click", saveAllChanges);

    el.btnDeleteSchedule?.addEventListener("click", deleteEmployeeFromSchedule);

    el.btnSuggest?.addEventListener("click", enableSuggestMode);

    el.btnCreateSchedule?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        openCreateScheduleModal();
    });

    el.btnAddEmployee?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        openCreateEmployeeModal();
    });

    el.btnTransfer?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        showMessage("Функция переноса отпуска","info");
    });

    el.btnSuggest?.addEventListener("click", () => {
        if(state.editMode || state.suggestMode){
            showMessage("Выйдите из режима редактирования","warning");
            return;
        }
        enableSuggestMode();
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

// Загрузка данных текущего пользователя
async function loadCurrentUser(){
    const user = await api.getCurrentUser();
    
    if(user && user.department_id){
        state.userDepartmentId = user.department_id;
        state.currentFirstName = user.first_name || "";
        state.currentLastName = user.last_name || "";
        
        // Устанавливаем отдел пользователя
        el.departmentFilter.value = user.department_id;
        await onDepartmentChange();
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

        // В режиме предложения отпуска проверяем, что это текущий пользователь
        const isCurrentUser = state.suggestMode && 
                              emp.first_name === state.currentFirstName && 
                              emp.last_name === state.currentLastName;

        // Создаём ячейки для месяцев
        const year = data?.year || 2026;
        
        // Создаём массив: для каждого месяца хранит отпуск, который его покрывает
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
        
        // Рендерим ячейки, объединяя непрерывные месяцы одного отпуска
        let months = "";
        let i = 0;
        const processedVacations = new Set();
        
        while(i < 12) {
            const vacation = monthVacations[i];
            
            if(vacation && !processedVacations.has(vacation.id)) {
                const vacStart = new Date(vacation.start_date);
                const vacEnd = new Date(vacation.end_date);
                
                const startMonth = vacStart.getMonth();
                const endMonth = vacEnd.getMonth();
                const colspan = endMonth - startMonth + 1;
                const startDay = vacStart.getDate();
                const typeClass = getVacationTypeClass(vacation.type_vacation_id);
                
                processedVacations.add(vacation.id);
                
                // Вычисляем процент заполнения первого месяца
                const daysInStartMonth = new Date(year, startMonth + 1, 0).getDate();
                const daysInFirstMonth = daysInStartMonth - startDay + 1;
                const fillPercent = (daysInFirstMonth / daysInStartMonth * 100).toFixed(1);
                
                const tooltip = `📅 ${formatDate(vacation.start_date)} - ${formatDate(vacation.end_date)}`;
                
                let cellClass = `vacation-cell ${typeClass}`;
                if(colspan > 1) {
                    cellClass += " vacation-cross";
                }
                if(state.editMode && !state.suggestMode) {
                    cellClass += " editable-vacation";
                }
                
                // Определяем цвет по типу отпуска
                let bgColor = '#1e3a8a';
                if(typeClass === 'type-education') bgColor = '#60a5fa';
                else if(typeClass === 'type-planned') bgColor = '#fbbf24';
                else if(typeClass === 'type-decreetal') bgColor = '#16a34a';
                
                // Используем background-position для сдвига градиента
                months += `<td class="${cellClass}" data-tooltip="${tooltip}" data-vacation-id="${vacation.id}" data-vacation-type="${vacation.type_vacation_id}" data-month="${startMonth}" colspan="${colspan}" style="background: linear-gradient(90deg, ${bgColor} 0%, ${bgColor} 100%) !important; background-size: ${colspan * 100}% 100% !important; background-repeat: no-repeat !important; background-position: ${100 - fillPercent}% 0 !important;"></td>`;
                
                // Пропускаем обработанные месяцы
                i = endMonth + 1;
            } else {
                let cellClass = "";
                if(state.editMode){
                    if(state.suggestMode){
                        // В режиме предложения отпуска редактируем только своего
                        if(isCurrentUser){
                            cellClass = "editable";
                        }
                    } else {
                        cellClass = "editable";
                    }
                }
                months += `<td class="month-cell ${cellClass}" data-month="${i}"></td>`;
                i++;
            }
        }

        // В режиме редактирования делаем ФИ кликабельными
        let nameCell1, nameCell2;
        const positionCategory = getPositionCategory(emp.position);
        const categoryClass = getCategoryClass(positionCategory);
        
        if(state.editMode && !state.suggestMode){
            nameCell1 = `<td class="col-name editable-name ${categoryClass}" data-field="first_name">${emp.first_name ?? ""}</td>`;
            nameCell2 = `<td class="col-name editable-name ${categoryClass}" data-field="last_name">${emp.last_name ?? ""}</td>`;
        } else {
            nameCell1 = `<td class="col-name ${categoryClass}">${emp.first_name ?? ""}</td>`;
            nameCell2 = `<td class="col-name ${categoryClass}">${emp.last_name ?? ""}</td>`;
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

    // Получаем имя сотрудника
    const lastName = row.children[0]?.textContent || "";
    const firstName = row.children[1]?.textContent || "";
    const employeeName = `${lastName} ${firstName}`;

    // Ищем отпуск для этого месяца
    const empData = state.selectedSchedule?.employees?.find(
        emp => emp.schedule_employee_id == scheduleEmployeeId
    );

    const vacation = getVacationForMonth(empData?.vacations || [], month);

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

// Удаление сотрудника
async function deleteEmployeeFromSchedule(){
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
                
                // Перезагружаем график
                const data = await api.getSchedule(state.selectedSchedule.id);
                state.selectedSchedule = data;
                renderSchedule(data);
            }
        }
    );
}


window.initSchedulePage = function () {

    initSchedule();

};