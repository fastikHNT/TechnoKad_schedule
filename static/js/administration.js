// Глобальный массив, содержащий всех пользователей, полученных с сервера
// Используется для фильтрации, поиска, рендеринга таблицы
let allUsers = [];

function initAdminPage() {

    // Находим элемент фильтра отделов.
    const adminFilter = document.getElementById("adminFilter");

    // Если на странице нет фильтра (значит мы не на странице администрирования) — прекращаем выполнение.
    if (!adminFilter) return;

    // ================= Элементы =================
    // Получаем все основные элементы интерфейса.
    const roleSelect = document.getElementById("role");
    const tableTitle = document.getElementById("tableTitle");
    const tbody = document.getElementById("usersTableBody");

    // Если нет таблицы — скрипт не нужен
    if (!tbody) return;

    const searchInput = document.getElementById("searchInput");

    // Кнопки управления режимами редактирования
    const editBtn = document.getElementById("editBtn");
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const deleteBtn = document.getElementById("deleteBtn");
    const restoreBtn = document.getElementById("restoreBtn");

    // Модалки удаления и восстановления
    const deleteModal = document.getElementById("deleteModal");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const closeDeleteModalBtn = document.getElementById("closeDeleteModalBtn");

    const restoreModal = document.getElementById("restoreModal");
    const confirmRestoreBtn = document.getElementById("confirmRestoreBtn");
    const closeRestoreModalBtn = document.getElementById("closeRestoreModalBtn");

    // Индикатор режима редактирования и контейнер уведомлений
    const editIndicator = document.getElementById("editIndicator");
    const messageBox = document.getElementById("adminMessage");

    // === Ролевые ограничения ===
    // Локальные константы ролей
    const ROLE = {
        USER: 1,
        ADMIN: 2,
        SUPER_ADMIN: 3,
        DEVELOPER: 4
    };

    // Роль и отдел текущего авторизованного пользователя (берем из main.html)
    const role = window.userRoleId;
    const userDept = window.userDeptId;


    // ===== Ограничения для USER =====
    // Обычные сотрудники не могут менять отделы — полностью блокируем фильтр
    if (role === ROLE.USER) {
        adminFilter.disabled = true;
    }

    // ===== Ограничения для админа ===== Администратор отдела видит только: свой отдел (ОРК или ОТП) или нераспределённых сотрудников
    if (role === ROLE.ADMIN) {

        // Преобразуем options в массив для удобства
        const options = Array.from(adminFilter.options);

        options.forEach(option => {

            const val = option.value;

            // Разрешённые варианты для админа
            const allowed =
                val === "unassigned" ||
                (val === "ork" && userDept == 1) ||
                (val === "otp" && userDept == 2);

            // Если вариант запрещён — визуально подсвечиваем
            if (!allowed) {
                option.classList.add("disabled-option");
            }
        });
    }

    // Устанавливаем корректное стартовое значение фильтра для админа, чтобы при загрузке сразу показывался его отдел.
    if (role === ROLE.ADMIN) {

        if (userDept == 1) {
            adminFilter.value = "ork";
        } else if (userDept == 2) {
            adminFilter.value = "otp";
        } else {
            adminFilter.value = "unassigned";
        }
    }

    // Сохраняем "разрешённое" значение, чтобы можно было откатить, если админ выберет запрещённый отдел.
    adminFilter.dataset.lastValid = adminFilter.value;

    // Обработчик выбора отдела
    adminFilter.addEventListener("change", function () {

    const selectedValue = this.value;

    // Проверяем, разрешён ли выбранный отдел администратору
    const allowed =
        selectedValue === "unassigned" ||
        (selectedValue === "ork" && userDept == 1) ||
        (selectedValue === "otp" && userDept == 2);

    // Если отдел недоступен — возвращаем прежнее значение и показываем ошибку
    if (!allowed && role === ROLE.ADMIN) {

        showMessage("У вас нет доступа к этому отделу", "error");

    // Откат к последнему доступному значению
        this.value = this.dataset.lastValid || "unassigned";
        return;
    }

    // Если значение разрешено — запоминаем его
        this.dataset.lastValid = selectedValue;
    });

    // ================= Ограничения редактирования ролей =================
    function applyRoleRestrictions(row) {

        // Находим выпадающий список ролей в текущей строке
        const roleSelect = row.querySelector(".role select");
        if (!roleSelect) return;

        const currentRoleId = window.userRoleId;
        const rowRoleId = Number(roleSelect.value);

        // Для разработчика - можно менять Админ и Супер-админ, но не Разработчик и не себе
        if (currentRoleId === 4) {
            Array.from(roleSelect.options).forEach(option => {
                const val = Number(option.value);
                // Блокируем Разработчик
                if (val === 4) {
                    option.disabled = true;
                    option.classList.add("disabled-option");
                }
            });
            
            // Если у сотрудника уже стоит роль разработчика (это мы) - блокируем изменение
            if (rowRoleId === 4) {
                roleSelect.disabled = true;
            }
            return;
        }

        // Для супер-админа - нельзя назначать разработчиков и других супер-админов
        if (currentRoleId === 3) {
            Array.from(roleSelect.options).forEach(option => {
                const val = Number(option.value);
                // Блокируем Разработчик и Супер-админ
                if (val === 4 || val === 3) {
                    option.disabled = true;
                    option.classList.add("disabled-option");
                }
            });
            
            // Если у сотрудника уже стоит роль супер-админа - блокируем изменение
            if (rowRoleId === 3) {
                roleSelect.disabled = true;
            }
            return;
        }

        // Для админа - можно назначать только пользователя
        if (currentRoleId === 2) {
            const forbiddenRoles = [2, 3, 4]; // Админ, Супер-админ, разработчик
            
            Array.from(roleSelect.options).forEach(option => {
                const val = Number(option.value);
                if (forbiddenRoles.includes(val)) {
                    option.disabled = true;
                    option.classList.add("disabled-option");
                }
            });

            // Если у сотрудника уже стоит запрещённая роль - блокируем селектор
            if (forbiddenRoles.includes(rowRoleId)) {
                roleSelect.disabled = true;
            }
        }
    }

    // ================= Переменные =================

    // Списки справочников, загружаемых с сервера. Заполняются через loadData().
    let departments = [];   // все отделы
    let positions = [];     // все должности
    let roles = [];         // все роли

    // Флаги состояния страницы
    let editMode = false;            // включён ли режим редактирования
    let editingRow = null;           // ссылка на TR, который сейчас редактируется
    let pendingDeleteUser = null;    // пользователь, выбранный для удаления (модалка)
    let pendingRestoreUser = null;   // пользователь, выбранный для восстановления (модалка)
    let unsavedChanges = false;      // есть ли несохранённые изменения в активной строке

    // ID пользователя, который сейчас редактируется. Нужен, чтобы правильно отправить изменения.
    let editingUserId = null;

    // ================= API =================

    // Вспомогательная универсальная функция для запросов. Автоматически ставит заголовки, обрабатывает JSON и ошибки.
    async function api(url, options = {}) {

    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}) // даёт возможность переопределять заголовки
        },
        ...options
    });

    let data = null;

    try {
        // Пытаемся получить JSON от сервера
        data = await res.json();
    } catch (e) {
        // Если JSON не получен — скорее всего сервер упал или вернул пустой ответ
        throw new Error("Ошибка сервера");
    }

    // Если сервер вернул ошибку HTTP — генерируем её дальше
    if (!res.ok) {
        throw new Error(data?.error || "Ошибка запроса");
    }

    return data;
}

    // Получение пользователя по ID из allUsers
    function getUserById(id) {
        return allUsers.find(u => Number(u.id) === Number(id));
    }

    // Активный пользователь (is_active = 1)
    function isActive(u) {
        return Number(u.is_active) === 1;
    }

    // Удалённый пользователь (is_active = 0)
    function isDeleted(u) {
        return Number(u.is_active) === 0;
    }

    // Показ уведомлений в верхнем блоке. Важно: messageBox создаётся в initAdminPage.
    let adminMessageTimeout = null;

    function showMessage(text, type = "info") {
        if (!messageBox) return;

        // Очищаем предыдущий таймер, если есть
        if(adminMessageTimeout) {
            clearTimeout(adminMessageTimeout);
        }

        messageBox.textContent = text;
        messageBox.className = "admin-message admin-" + type;
        messageBox.classList.add("show");

        adminMessageTimeout = setTimeout(()=>{
            messageBox.classList.remove("show");
        },5000);
    }

    // Обновление заголовка таблицы — показывает текущий выбранный отдел
    function updateTableTitle() {
        tableTitle.textContent =
            adminFilter.options[adminFilter.selectedIndex].textContent;
    }

    // ================= Загрузка =================

    // Загружаем справочники + всех сотрудников. После загрузки обновляем заголовок и отрисовываем таблицу.
    async function loadData() {

        // Получаем списки отделов, должностей и ролей
        const opt = await api("/api/admin/options");
        departments = opt.departments || [];
        positions = opt.positions || [];
        roles = opt.roles || [];

        console.log('Loaded departments:', departments.length);
        console.log('Loaded positions:', positions.length);
        console.log('Loaded roles:', roles.length);

        // Загружаем всех пользователей (активных и удалённых)
        const data = await api("/api/users");
        allUsers = data.users || [];

        updateTableTitle(); // устанавливаем правильный заголовок
        renderUsers();      // рисуем таблицу
        
        // Показываем уведомление о successfulной загрузке
        const filterText = adminFilter.options[adminFilter.selectedIndex].text;
        showMessage(`Загружен список сотрудников`, "success");
    }

    // ================= Фильтр по типам пользователей  =================

    // Возвращает массив пользователей, которые подходят под выбранный фильтр adminFilter.
    function getFilteredUsers() {

        const filter = adminFilter.value;

        return allUsers.filter(u => {

            // Удалённые сотрудники
            if (filter === "deleted")
                return isDeleted(u);

            // Нераспределённые (любой из ключевых параметров отсутствует): нет отдела, должности, или роли.
            if (filter === "unassigned") {
                const noDept = !u.department_id;
                const noPos = !u.position_id;
                const noRole = !u.role_id;
                return isActive(u) && (noDept || noPos || noRole);
            }

            // ОРК (1)
            if (filter === "ork")
                return Number(u.department_id) === 1 && isActive(u);

            // ОТП (2)
            if (filter === "otp")
                return Number(u.department_id) === 2 && isActive(u);

            // По умолчанию — возвращаем только активных сотрудников
            return isActive(u);
        });
    }

    // ================= Рендер пользователей из БД =================
    // Отрисовывает таблицу сотрудников на основе текущего фильтра и поиска.
    function renderUsers() {

        // Получаем пользователей с учётом выбранного фильтра (ork / otp / deleted / unassigned и т.д.)
        const users = getFilteredUsers();

        // Берём строку поиска (если поле существует)
        const searchTerm = searchInput?.value.trim().toLowerCase() || "";

        // По умолчанию отображаем всех отфильтрованных
        let filteredUsers = users;

        // Если введён текст поиска — дополнительно фильтруем
        if (searchTerm) {
            filteredUsers = users.filter(u =>
                (u.first_name || "").toLowerCase().includes(searchTerm) ||
                (u.last_name || "").toLowerCase().includes(searchTerm) ||
                (u.email || "").toLowerCase().includes(searchTerm)
            );
        }

        // Очищаем таблицу перед новой отрисовкой
        tbody.innerHTML = "";

        // Если нет данных — выводим строку "Нет данных"
        if (!filteredUsers.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data-cell">Нет данных</td>
                </tr>`;
            return;
        }

        // Перебираем пользователей и создаём строки таблицы
        filteredUsers.forEach(u => {

            const tr = document.createElement("tr");

            // Сохраняем ID пользователя в dataset (для дальнейшего редактирования)
            tr.dataset.id = u.id;

            // Формируем ячейки строки
            tr.innerHTML = `
                <td>${u.first_name || ""}</td>
                <td>${u.last_name || ""}</td>
                <td>${u.email || ""}</td>
                <td>${u.phone || ""}</td>
                <td class="department">${renderDepartmentName(u.department_id)}</td>
                <td class="position">${renderPositionName(u.position_id)}</td>
                <td class="role">${renderRoleName(u.role_id)}</td>
            `;

            // Добавляем строку в таблицу
            tbody.appendChild(tr);
        });
    }

    // Возвращает название отдела по его ID
    function renderDepartmentName(id) {
        const d = departments.find(x => Number(x.id) === Number(id));
        return d ? d.name : "";
    }

    // Возвращает название должности по её ID
    function renderPositionName(id) {
        const p = positions.find(x => Number(x.id) === Number(id));
        return p ? p.name : "";
    }

    // Возвращает отображаемое название роли по её ID
    function renderRoleName(id) {
        const r = roles.find(x => Number(x.id) === Number(id));
        return r ? r.display_name : "";
    }

    // ================= Активация режима редактирования =================

    // Кнопка "Редактировать"
    editBtn?.addEventListener("click", () => {

        // Включаем режим редактирования
        editMode = true;
        unsavedChanges = false;

        // Переключаем видимость кнопок
        editBtn.classList.add("hidden");
        saveBtn.classList.remove("hidden");
        cancelBtn.classList.remove("hidden");
        editIndicator.classList.remove("hidden");

        showMessage("Выберите сотрудника");
    });

    // Кнопка "Отмена"
    cancelBtn?.addEventListener("click", exitEditMode);

    // Выход из режима редактирования
    function exitEditMode() {

        editMode = false;
        editingRow = null;
        editingUserId = null;
        unsavedChanges = false;

        // Скрываем кнопки редактирования
        saveBtn.classList.add("hidden");
        cancelBtn.classList.add("hidden");
        deleteBtn.classList.add("hidden");
        restoreBtn.classList.add("hidden");
        editIndicator.classList.add("hidden");
        editBtn.classList.remove("hidden");

        // Убираем выделение строк
        tbody.querySelectorAll("tr")
            .forEach(r => r.classList.remove("selected-row"));

        // Перерисовываем таблицу (чтобы убрать select'ы и вернуть обычный текст)
        renderUsers();
    }

    // ================= Строка выбора =================
    // Обработчик клика по таблице (повторное объявление блока выбора строки)
    tbody.addEventListener("click", e => {

        // Если режим редактирования не активирован — игнорируем клики
        if (!editMode) return;

        // Если клик был по выпадающему списку — ничего не делаем, чтобы не сбивать редактирование
        if (e.target.closest("select")) return;

        const row = e.target.closest("tr");

        // Если клик не по строке или это строка "Нет данных" — выходим
        if (!row || row.querySelector(".no-data-cell")) return;

        const clickedId = row.dataset.id;

        // Если ранее уже был выбран другой пользователь — возвращаем предыдущую строку в обычный (не редактируемый) режим
        if (editingUserId && editingUserId !== clickedId) {

            const oldRow = tbody.querySelector(`[data-id="${editingUserId}"]`);
            const oldUser = getUserById(editingUserId);

            if (oldRow && oldUser) {

                // Восстанавливаем текстовые значения вместо select
                oldRow.querySelector(".department").innerText =
                    renderDepartmentName(oldUser.department_id);

                oldRow.querySelector(".position").innerText =
                    renderPositionName(oldUser.position_id);

                oldRow.querySelector(".role").innerText =
                    renderRoleName(oldUser.role_id);

                // Убираем выделение строки
                oldRow.classList.remove("selected-row");
            }
        }

        // Сохраняем ID выбранного пользователя
        editingUserId = clickedId;

        // При выборе новой строки считаем, что изменений ещё нет
        unsavedChanges = false;

        // Убираем выделение со всех строк
        tbody.querySelectorAll("tr")
            .forEach(r => r.classList.remove("selected-row"));

        // Подсвечиваем текущую строку
        row.classList.add("selected-row");
        editingRow = row;

        // Получаем объект пользователя из глобального массива
        const user = getUserById(row.dataset.id);
        if (!user) return;

        // Если сейчас открыт фильтр "Удалённые" — показываем кнопку восстановления вместо удаления
        if (adminFilter.value === "deleted") {
            restoreBtn.classList.remove("hidden");
            deleteBtn.classList.add("hidden");
            return;
        }

        // Переводим строку в режим редактирования (select вместо текста)
        makeEditable(row, user);

        // Показываем кнопку удаления
        deleteBtn.classList.remove("hidden");
        restoreBtn.classList.add("hidden");
    });


    // ================= Режим редактирования =================
    // Делает выбранную строку редактируемой (подменяет текст на select)
    function makeEditable(row, user) {

        // Подменяем ячейку отдела на select
        row.querySelector(".department").innerHTML =
            buildDepartmentSelect(user.department_id);

        // Подменяем ячейку должности на select (список должностей зависит от отдела)
        row.querySelector(".position").innerHTML =
            buildPositionSelect(user.department_id, user.position_id);

        // Подменяем ячейку роли на select
        row.querySelector(".role").innerHTML =
            buildRoleSelect(user.role_id);

        // Применяем ограничения ролей (если текущий пользователь - админ)
        applyRoleRestrictions(row);

        // Если любое поле изменилось — фиксируем факт несохранённых изменений
        row.querySelectorAll("select").forEach(select => {
            select.addEventListener("change", () => {
                unsavedChanges = true;
            });
        });

        // Если меняется отдел — пересобираем список должностей под новый отдел
        const deptSelect = row.querySelector(".dept-select");
        if (deptSelect) {
            // Удаляем старый обработчик, если есть
            const newDeptSelect = deptSelect.cloneNode(true);
            deptSelect.parentNode.replaceChild(newDeptSelect, deptSelect);
            
            newDeptSelect.addEventListener("change", function() {
                const newDeptId = this.value;
                console.log('Department changed to:', newDeptId);
                console.log('Available positions:', positions.length);
                
                if (newDeptId) {
                    // Перестраиваем список должностей для выбранного отдела
                    row.querySelector(".position").innerHTML =
                        buildPositionSelect(newDeptId, null);
                } else {
                    // Если отдел не выбран, показываем placeholder
                    row.querySelector(".position").innerHTML =
                        buildPositionSelect(null, null);
                }
                
                unsavedChanges = true;
            });
            
            // Если у сотрудника уже есть отдел, сразу подгружаем должности
            if (user.department_id) {
                const currentDeptId = newDeptSelect.value;
                if (currentDeptId) {
                    console.log('Initial department:', currentDeptId);
                    row.querySelector(".position").innerHTML =
                        buildPositionSelect(currentDeptId, user.position_id);
                }
            }
        }
    }

    // ================= Сохранение изменений =================
    saveBtn?.addEventListener("click", async () => {

        // Если строка не выбрана — ничего не делаем
        if (!editingRow) return;

        // Получаем пользователя
        const user = getUserById(editingRow.dataset.id);

        // Берём новые значения из select'ов
        const newDeptId = editingRow.querySelector(".dept-select")?.value || null;
        const newPosId = editingRow.querySelector(".pos-select")?.value || null;
        const newRoleId = editingRow.querySelector(".role select")?.value || null;

        // Формируем объект с данными. role_id отправляем только если он изменился
        const updateData = {
            user_id: user.id,
            department_id: newDeptId,
            position_id: newPosId
        };
        
        // Если роль изменилась, добавляем её в запрос
        if (newRoleId && Number(newRoleId) !== Number(user.role_id)) {
            updateData.role_id = newRoleId;
        }

        try {

            // Отправляем изменения на сервер
            const response = await api("/api/admin/update-user", {
                method: "POST",
                body: JSON.stringify(updateData)
            });

            // Если сервер успешно сохранил —  обновляем данные в локальном массиве
            user.department_id = newDeptId ? Number(newDeptId) : null;
            user.position_id = newPosId ? Number(newPosId) : null;
            // Обновляем роль только если она изменилась
            if (newRoleId && Number(newRoleId) !== Number(user.role_id)) {
                user.role_id = Number(newRoleId);
            }

            showMessage("Изменения сохранены", "success");

            // Выходим из режима редактирования
            exitEditMode();

        } catch (error) {

            // Если сервер вернул ошибку
            showMessage(error.message || "Ошибка сохранения", "error");
        }

    });

    // ================= Удаление =================

    // Кнопка "Удалить"
    deleteBtn?.addEventListener("click", () => {

        // Если строка не выбрана — ничего не делаем
        if (!editingRow) return;

        // Запоминаем пользователя, которого собираемся удалить
        pendingDeleteUser = getUserById(editingRow.dataset.id);

        // Показываем модальное окно подтверждения
        deleteModal.classList.remove("hidden");
    });

    // Подтверждение удаления
    confirmDeleteBtn?.addEventListener("click", async () => {

        // Если пользователь не выбран — выходим
        if (!pendingDeleteUser) return;

        try {

            // Отправляем запрос на сервер для удаления"
            await api("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: pendingDeleteUser.id })
            });

            // Локально помечаем пользователя как удалённого
            pendingDeleteUser.is_active = 0;

            // Закрываем модалку
            deleteModal.classList.add("hidden");

            showMessage("Сотрудник удалён", "success");

            // Выходим из режима редактирования
            exitEditMode();

        } catch (err) {

            // В случае ошибки также закрываем модалку
            deleteModal.classList.add("hidden");

            showMessage(err.message || "Ошибка сервера", "error");
            }

    });

    // Закрытие модалки удаления без подтверждения
    closeDeleteModalBtn?.addEventListener("click", () => {
        deleteModal.classList.add("hidden");
        pendingDeleteUser = null; // очищаем выбранного пользователя
    });

    // ================= Восстановление =================

    // Кнопка "Восстановить"
    restoreBtn?.addEventListener("click", () => {

        // Если строка не выбрана — ничего не делаем
        if (!editingRow) return;

        // Запоминаем пользователя для восстановления
        pendingRestoreUser = getUserById(editingRow.dataset.id);

        // Показываем модальное окно восстановления
        restoreModal.classList.remove("hidden");
    });

    // Подтверждение восстановления
    confirmRestoreBtn?.addEventListener("click", async () => {

        if (!pendingRestoreUser) return;

        try {

            // Отправляем запрос на сервер для восстановления
            await api(`/admin/restore/${pendingRestoreUser.id}`, {
                method: "POST"
            });

            // Локально отмечаем пользователя как активного
            pendingRestoreUser.is_active = 1;

            // Закрываем модалку
            restoreModal.classList.add("hidden");

            showMessage("Сотрудник восстановлен", "success");

            // Выходим из режима редактирования
            exitEditMode();

            } catch (err) {

                // При ошибке также закрываем модалку
                restoreModal.classList.add("hidden");

                showMessage(err.message || "Ошибка сервера", "error");
            }
    });

    // Закрытие модалки восстановления без подтверждения
    closeRestoreModalBtn?.addEventListener("click", () => {
        restoreModal.classList.add("hidden");
        pendingRestoreUser = null; // очищаем ссылку на пользователя
    });

    // ================= Выбор для редактирования =================

    // Формирует select со списком отделов
    function buildDepartmentSelect(selectedId) {
        let options = '';
        
        // Если у сотрудника нет отдела, добавляем placeholder
        if (!selectedId) {
            options += '<option value="">Выберите отдел</option>';
        }
        
        options += departments.map(d =>
            `<option value="${d.id}" ${Number(d.id) === Number(selectedId) ? "selected" : ""}>
                ${d.name}
            </option>`
        ).join("");
        
        return `
            <select class="dept-select">
                ${options}
            </select>
        `;
    }

    // Формирует select со списком должностей, отфильтрованных по выбранному отделу
    function buildPositionSelect(deptId, selectedPosId) {
        console.log('buildPositionSelect called with deptId:', deptId);
        console.log('Available positions:', positions.length);
        
        const deptPositions = positions.filter(p => Number(p.department_id) === Number(deptId));
        console.log('Positions for dept', deptId, ':', deptPositions.length);
        
        if (!deptId) {
            return `
                <select class="pos-select">
                    <option value="">Сначала выберите отдел</option>
                </select>
            `;
        }
        
        return `
            <select class="pos-select">
                ${deptPositions.map(p =>
                    `<option value="${p.id}" ${Number(p.id) === Number(selectedPosId) ? "selected" : ""}>
                        ${p.name}
                    </option>`
                ).join("")}
            </select>
        `;
    }

    // Формирует select со списком ролей
    function buildRoleSelect(selectedId) {
        return `
            <select>
                ${roles.map(r =>
                    `<option value="${r.id}" ${Number(r.id) === Number(selectedId) ? "selected" : ""}>
                        ${r.display_name}
                    </option>`
                ).join("")}
            </select>
        `;
    }

    // ================= Поиск =================

    // При вводе в строку поиска — перерисовываем таблицу
    searchInput?.addEventListener("input", renderUsers);

    // При смене фильтра отделов обновляем заголовок и выходим из режима редактирования
    adminFilter?.addEventListener("change", () => {
        updateTableTitle();
        exitEditMode();
        
        // Показываем уведомление о смене фильтра
        const filterValue = adminFilter.value;
        const filterText = adminFilter.options[adminFilter.selectedIndex].text;
        const filteredUsers = getFilteredUsers();
        
        let message = ``;
        let type = "info";
        
        switch(filterValue) {
            case "ork":
                message = `Загружен список сотрудников отдела по работе с клиентами`;
                break;
            case "otp":
                message = `Загружен список сотрудников отдела технической поддержки`;
                break;
            case "unassigned":
                message = `Загружен список нераспределённых сотрудников`;
                break;
            case "deleted":
                message = `Загружен список удалённых сотрудников`;
                break;
            default:
                message = `Загружен список сотрудников`;
        }
        
        showMessage(message, type);
    });

    // Устанавливаем начальный заголовок
    updateTableTitle();

    // Загружаем данные при инициализации страницы
    loadData();
    }

    // Делаем функцию глобально доступной, чтобы её можно было вызвать из HTML (например, onload)
    window.initAdminPage = initAdminPage;