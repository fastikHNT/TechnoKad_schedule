document.addEventListener('DOMContentLoaded', function () {

    // --- Переключение секций ---
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    const forgotSection = document.getElementById('forgot-password-section');

    function showSection(show, hide) {
        if (hide) hide.classList.remove('active');
        if (show) show.classList.add('active');
    }

    const showRegister = document.getElementById('show-register');
    const showLogin = document.getElementById('show-login');
    const showForgot = document.getElementById('show-forgot-password');
    const backLogin = document.getElementById('back-to-login');

    if (showRegister) {
        showRegister.addEventListener("click", function (e) {
            e.preventDefault();
            showSection(registerSection, loginSection);
        });
    }

    if (showLogin) {
        showLogin.addEventListener("click", function (e) {
            e.preventDefault();
            showSection(loginSection, registerSection);
        });
    }

    if (showForgot) {
        showForgot.addEventListener("click", function (e) {
            e.preventDefault();
            showSection(forgotSection, loginSection);
        });
    }

    if (backLogin) {
        backLogin.addEventListener("click", function (e) {
            e.preventDefault();
            showSection(loginSection, forgotSection);
        });
    }

    // --- Показ / скрытие пароля ---
    document.querySelectorAll(".password-toggle-icon").forEach(icon => {

        icon.addEventListener("click", function () {

            const input = this.parentElement.querySelector("input");

            if (!input) return;

            input.type = input.type === "password" ? "text" : "password";
            this.textContent = input.type === "password" ? "👁" : "🔒";

        });

    });

    // --- Подсветка ошибки ---
    function showError(input, messageElement) {
        input.classList.add("input-error");
        if (messageElement) messageElement.style.display = "block";
    }

    function hideError(input, messageElement) {
        input.classList.remove("input-error");
        if (messageElement) messageElement.style.display = "none";
    }

// РЕГИСТРАЦИЯ

    const registerForm = document.getElementById("register-form");
    const regPassword = document.getElementById("reg-password");
    const regPassword2 = document.getElementById("reg-password2");

    const passwordMatchError = document.getElementById("password-match-error");
    const passwordHint = document.getElementById("password-hint");

    function validateRegisterPasswords() {

        let valid = true;

        if (regPassword.value.length < 8) {
            showError(regPassword, passwordHint);
            valid = false;
        } else {
            hideError(regPassword, passwordHint);
        }

        if (regPassword.value !== regPassword2.value) {
            showError(regPassword2, passwordMatchError);
            valid = false;
        } else {
            hideError(regPassword2, passwordMatchError);
        }

        return valid;
    }

    if (regPassword) {
        regPassword.addEventListener("input", validateRegisterPasswords);
    }

    if (regPassword2) {
        regPassword2.addEventListener("input", validateRegisterPasswords);
    }

    if (registerForm) {
        registerForm.addEventListener("submit", function (e) {

            if (!validateRegisterPasswords()) {
                e.preventDefault();
            }

        });
    }

 // СБРОС ПАРОЛЯ

const resetForm = document.getElementById("reset-form");
const resetPassword = document.getElementById("reset-password");
const resetPassword2 = document.getElementById("reset-password2");
const passwordError = document.getElementById("password-error");

function validateResetPassword() {

    if (!resetPassword || !resetPassword2) return true;

    let valid = true;

    passwordError.style.display = "none";
    passwordError.textContent = "";

    resetPassword.classList.remove("input-error");
    resetPassword2.classList.remove("input-error");

    if (resetPassword.value.length < 8) {

        passwordError.textContent = "Пароль должен содержать минимум 8 символов";
        passwordError.style.display = "block";

        resetPassword.classList.add("input-error");

        valid = false;
    }

    else if (resetPassword.value !== resetPassword2.value) {

        passwordError.textContent = "Пароли не совпадают";
        passwordError.style.display = "block";

        resetPassword2.classList.add("input-error");

        valid = false;
    }

    return valid;
}

if (resetPassword) {
    resetPassword.addEventListener("input", validateResetPassword);
}

if (resetPassword2) {
    resetPassword2.addEventListener("input", validateResetPassword);
}

if (resetForm) {

    resetForm.addEventListener("submit", function (e) {

        if (!validateResetPassword()) {
            e.preventDefault();
        }

    });

}

 // ИМЯ И ФАМИЛИЯ

const firstName = document.getElementById("reg-username");
const lastName = document.getElementById("reg-lastname");

function formatRussianName(value) {

    value = value.replace(/\s/g, "");
    value = value.replace(/[^А-Яа-яЁё-]/g, "");

    if (value.length === 0) return value;

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function validateRussianName(input) {

    if (!input) return true;

    const errorId = input.id + "-error";
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
        errorElement = document.createElement("p");
        errorElement.id = errorId;
        errorElement.className = "error-message";
        errorElement.style.display = "none";
        input.parentNode.appendChild(errorElement);
    }

    input.value = formatRussianName(input.value);

    if (!/^[А-Яа-яЁё-]+$/.test(input.value)) {

        input.classList.add("input-error");

        errorElement.textContent =
            "Допустимы только русские буквы и тире";

        errorElement.style.display = "block";

        return false;
    }

    input.classList.remove("input-error");
    errorElement.style.display = "none";

    return true;
}

if (firstName) {

    firstName.addEventListener("input", function () {
        validateRussianName(firstName);
    });

}

if (lastName) {

    lastName.addEventListener("input", function () {
        validateRussianName(lastName);
    });

}

// Модальное окно

    const modal = document.getElementById("modal");
    const modalMessage = document.getElementById("modal-message");
    const modalOk = document.getElementById("modal-ok");

    window.showModal = function(message) {

        if (!modal || !modalMessage) return;

        modalMessage.textContent = message;
        modal.style.display = "flex";
    };

    if (modalOk) {
        modalOk.addEventListener("click", function() {
            modal.style.display = "none";
        });
    }

 // Почта


async function validateEmailField(input) {

    if (!input) return true;

    const errorId = input.id + "-error";
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
        errorElement = document.createElement("p");
        errorElement.id = errorId;
        errorElement.className = "error-message";
        errorElement.style.display = "none";
        input.parentNode.appendChild(errorElement);
    }

    let value = input.value.trim().toLowerCase();
    input.value = value;

    const emailRegex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

    if (!emailRegex.test(value)) {

        input.classList.add("input-error");

        errorElement.textContent =
            "Введите корректный email (example@mail.com)";

        errorElement.style.display = "block";

        return false;
    }

    // проверка домена
    const domain = value.split("@")[1];

    try {

        const response = await fetch("https://dns.google/resolve?name=" + domain);

        const data = await response.json();

        if (!data.Answer) {

            input.classList.add("input-error");

            errorElement.textContent =
                "Почтовый домен не существует";

            errorElement.style.display = "block";

            return false;
        }

    } catch (e) {
        // если DNS API недоступен — просто пропускаем
    }

    input.classList.remove("input-error");
    errorElement.style.display = "none";

    return true;
}

const emailInputs = document.querySelectorAll("input[type='email']");

emailInputs.forEach(input => {

    input.addEventListener("input", function () {

        input.value = input.value.replace(/\s/g, "").toLowerCase();

        validateEmailField(input);

    });

});

});
