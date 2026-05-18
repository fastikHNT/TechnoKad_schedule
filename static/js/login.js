document.addEventListener('DOMContentLoaded', function() {

    // --- Получение ссылок на основные элементы DOM ---
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Элементы для валидации паролей
    const regPasswordInput = document.getElementById('reg-password');
    const regPassword2Input = document.getElementById('reg-password2');
    const passwordMatchError = document.querySelector('.password-match-error');
    const passwordHint = document.querySelector('.password-hint');

    // Иконки для переключения видимости пароля
    const passwordToggleIcons = document.querySelectorAll('.password-toggle-icon');

    // --- Функционал показа/скрытия пароля ---
        // --- Функционал показа/скрытия пароля ---
    if (passwordToggleIcons.length > 0) {
        passwordToggleIcons.forEach(icon => {
            icon.addEventListener('click', function() {
                // Находим родительскую обертку (div.password-input-wrapper)
                const passwordWrapper = this.parentElement;
                // Ищем поле ввода внутри этой обертки
                const passwordInput = passwordWrapper.querySelector('input'); // Ищем любой input внутри обертки

                if (passwordInput) {
                    // Определяем новый тип поля: если сейчас 'password', то делаем 'text', иначе обратно 'password'
                    const newType = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordInput.setAttribute('type', newType);

                    // Меняем иконку в зависимости от нового типа поля
                    // Если поле стало 'password', показываем глаз (👁), если 'text' - показываем замок (🔒)
                    this.textContent = newType === 'password' ? '👁' : '🔒';
                }
            });
        });
    } else {
        console.warn("Не найдены элементы '.password-toggle-icon'.");
    }

    // --- Функция для показа/скрытия секций форм ---
    function showSection(sectionToShow, sectionToHide) {
        // Скрываем предыдущую секцию, если она существует
        if (sectionToHide) {
            sectionToHide.classList.remove('active');
        }
        // Показываем новую секцию, если она существует
        if (sectionToShow) {
            sectionToShow.classList.add('active');
        }
    }

    // --- Обработчики событий для переключения между формами ---
    if (showRegisterLink && loginSection && registerSection) {
        showRegisterLink.addEventListener('click', function(e) {
            e.preventDefault(); // Отменяем стандартное действие ссылки (переход по href)
            showSection(registerSection, loginSection); // Показываем регистрацию, скрываем вход
        });
    } else {
        console.warn("Не найдены элементы для переключения на регистрацию (show-register, login-section, register-section).");
    }

    if (showLoginLink && loginSection && registerSection) {
        showLoginLink.addEventListener('click', function(e) {
            e.preventDefault(); // Отменяем стандартное действие ссылки
            showSection(loginSection, registerSection); // Показываем вход, скрываем регистрацию
        });
    } else {
        console.warn("Не найдены элементы для переключения на вход (show-login, login-section, register-section).");
    }

    // --- Функция валидации паролей ---
    function validatePasswords() {
        // Проверяем, что все нужные элементы существуют
        if (!regPasswordInput || !regPassword2Input || !passwordMatchError || !passwordHint) {
            console.error("Не найдены элементы для валидации паролей.");
            return false; // Если чего-то нет, считаем валидацию не пройденной
        }

        const passwordValue = regPasswordInput.value;
        const password2Value = regPassword2Input.value;
        const minLength = 6;

        // Проверяем минимальную длину пароля
        const isLengthValid = passwordValue.length >= minLength && password2Value.length >= minLength;

        if (!isLengthValid) {
            passwordMatchError.style.display = 'none'; // Скрываем ошибку совпадения
            passwordHint.style.display = 'block';     // Показываем подсказку о длине
            return false; // Пароль слишком короткий
        } else {
            passwordHint.style.display = 'none';     // Скрываем подсказку,если длина нормальная
        }

        // Проверяем совпадение паролей
        const passwordsMatch = passwordValue === password2Value;

        if (!passwordsMatch) {
            passwordMatchError.style.display = 'block'; // Показываем ошибку совпадения
            return false; // Пароли не совпадают
        } else {
            passwordMatchError.style.display = 'none'; // Скрываем ошибку, если пароли совпадают
            return true; // Все проверки пройдены успешно
        }
    }

    // Добавляем слушатели событий 'input' для полей паролей, чтобы валидация происходила в реальном времени
    if (regPasswordInput) {
        regPasswordInput.addEventListener('input', validatePasswords);
    } else {
        console.warn("Не найден элемент 'reg-password'.");
    }
    if (regPassword2Input) {
        regPassword2Input.addEventListener('input', validatePasswords);
    } else {
        console.warn("Не найден элемент 'reg-password2'.");
    }

    // --- Обработка отправки формы регистрации ---
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            // Первая проверка: общая валидность формы (required, pattern и т.д.)
            if (!registerForm.checkValidity()) {
                e.preventDefault(); // Предотвращаем отправку
                alert('Пожалуйста, заполните все обязательные поля корректно.');
                return; // Прерываем дальнейшее выполнение
            }

            // Вторая проверка: совпадение паролей
            const passwordsMatch = validatePasswords();
            if (!passwordsMatch) {
                e.preventDefault(); // Предотвращаем отправку, если пароли не совпадают
                // Ошибка уже отображается на странице (.password-match-error)
                return; // Прерываем дальнейшее выполнение
            }

            // Если все проверки пройдены, форма будет отправлена автоматически
            // alert('Валидация прошла успешно!'); // Можно добавить для отладки
        });
    } else {
        console.warn("Не найден элемент 'register-form'.");
    }

    // --- Обработка отправки формы входа ---
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            // Проверяем общую валидность формы
            if (!loginForm.checkValidity()) {
                e.preventDefault(); // Предотвращаем отправку
                alert('Пожалуйста, заполните все обязательные поля.');
            }
            // Если все проверки пройдены, форма будет отправлена автоматически
        });
    } else {
        console.warn("Не найден элемент 'login-form'.");
    }

    // --- Инициализация при загрузке страницы ---
    // Убеждаемся, что при первой загрузке отображается только форма входа
    if (loginSection) {
        loginSection.classList.add('active'); // Делаем секцию входа активной
    } else {
        console.warn("Не найден элемент 'login-section'.");
    }
    if (registerSection) {
        registerSection.classList.remove('active'); // Убеждаемся, что секция регистрации НЕ активна
    } else {
        console.warn("Не найден элемент 'register-section'.");
    }

    if (typeof window.flashMessages !== "undefined") {

        const overlay = document.getElementById("modalOverlay");
        const title = document.getElementById("modalTitle");
        const text = document.getElementById("modalText");
        const button = document.getElementById("modalButton");

        const category = window.flashMessages[0][0];
        const message = window.flashMessages[0][1];

        if (category === "error") {
            title.innerText = "Ошибка";
        } else {
            title.innerText = "Уведомление";
        }

        text.innerText = message;

        button.addEventListener("click", function () {
            overlay.style.display = "none";
        });
    }

});

