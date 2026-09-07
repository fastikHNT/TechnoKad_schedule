function toggleProfileMenu() {
    const menu = document.getElementById("profileMenu");
    if (menu) {
        menu.classList.toggle("open");
    }
}

document.addEventListener("click", function (e) {
    const profile = document.querySelector(".profile");
    const menu = document.getElementById("profileMenu");

    if (!profile || !menu) return;

    const active = document.activeElement;

    const editing = active && (
        active.id === "phone" ||
        active.id === "oldPassword" ||
        active.id === "newPassword"
    );

    if (!profile.contains(e.target) && !editing && !phoneEditMode) {
        menu.classList.remove("open");
    }
});

/* ================= УВЕДОМЛЕНИЯ ================= */

function showProfileMessage(id, text, type = "success") {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = text;

    el.classList.remove("success", "error");

    if (type === "error") {
        el.classList.add("error");
    } else {
        el.classList.add("success");
    }

    el.classList.add("show");

    setTimeout(() => {
        el.classList.remove("show");
    }, 3000);
}

/* ================= АВАТАР ================= */

let pendingAvatarFile = null;

function handleAvatarSelect() {
    const fileInput = document.getElementById("avatarInput");
    const fileName = document.getElementById("fileName");
    const avatarPreview = document.getElementById("avatarPreview");
    const avatarPreviewImg = document.getElementById("avatarPreviewImg");

    if (!fileInput || !fileInput.files.length) {
        return;
    }

    const file = fileInput.files[0];
    pendingAvatarFile = file;

    // Показываем имя файла
    if (fileName) {
        fileName.textContent = file.name;
    }

    // Создаем URL для превью
    const reader = new FileReader();
    reader.onload = function(e) {
        if (avatarPreviewImg) {
            avatarPreviewImg.src = e.target.result;
        }
        if (avatarPreview) {
            avatarPreview.classList.remove("hidden");
        }
    };
    reader.readAsDataURL(file);
}

function confirmUploadAvatar() {
    if (!pendingAvatarFile) {
        return;
    }

    const fileInput = document.getElementById("avatarInput");
    const formData = new FormData();
    formData.append("avatar", pendingAvatarFile);

    fetch("/upload-avatar", {
        method: "POST",
        body: formData
    })
        .then(r => r.json())
        .then(data => {
            if (data.avatar_url) {
                const avatar = document.querySelector(".avatar");

                if (avatar) {
                    avatar.src = data.avatar_url;
                }

                showProfileMessage("avatarMessage", "Аватар успешно обновлен", "success");
                
                // Скрываем превью и сбрасываем
                cancelAvatarUpload();
            } else {
                showProfileMessage("avatarMessage", "Ошибка загрузки аватара", "error");
            }
        })
        .catch(() => {
            showProfileMessage("avatarMessage", "Server Error", "error");
        });
}

function cancelAvatarUpload() {
    const fileInput = document.getElementById("avatarInput");
    const fileName = document.getElementById("fileName");
    const avatarPreview = document.getElementById("avatarPreview");

    // Сбрасываем
    if (fileInput) {
        fileInput.value = "";
    }
    if (fileName) {
        fileName.textContent = "Выбрать изображение";
    }
    if (avatarPreview) {
        avatarPreview.classList.add("hidden");
    }
    
    pendingAvatarFile = null;
}

/* ================= ТЕЛЕФОН ================= */

let phoneEditMode = false;
let originalPhone = "";
let phoneSaving = false;

document.addEventListener("DOMContentLoaded", function () {
    const phone = document.getElementById("phone");

    if (phone) {
        let value = phone.value.trim();

        if (value === "+7") {
            value = "";
        }

        originalPhone = value;
    }
});

function togglePhoneEdit() {
    const input = document.getElementById("phone");
    const btn = document.getElementById("editPhoneBtn");

    if (!phoneEditMode) {
        input.disabled = false;

        if (input.value === "") {
            input.value = "+7";
        }

        input.focus();
        btn.textContent = "Сохранить";
        phoneEditMode = true;

    } else {
        savePhone();
        input.disabled = true;
        btn.textContent = "Изменить";
        phoneEditMode = false;
    }
}

function savePhone() {
    const phoneInput = document.getElementById("phone");
    let phone = phoneInput.value.trim();

    if (phoneSaving) return;
    phoneSaving = true;

    if (phone === "+7" || phone.length <= 2) {
        phone = "";
    }

    if (phone === originalPhone) {
        phoneSaving = false;
        return;
    }

    fetch("/save-phone", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            phone: phone || null
        })
    })
        .then(res => res.json())
        .then(data => {
            phoneSaving = false;

            if (data.success) {
                originalPhone = phone;
                showProfileMessage("phoneMessage", "Телефон обновлен", "success");
            } else {
                showProfileMessage("phoneMessage", data.error || "Ошибка сохранения", "error");
            }
        })
        .catch(() => {
            phoneSaving = false;
            showProfileMessage("phoneMessage", "Server Error", "error");
        });
}

/* ================= МАСКА ТЕЛЕФОНА ================= */

const phoneInput = document.getElementById("phone");

if (phoneInput !== null) {
    phoneInput.addEventListener("focus", function () {
        if (this.value === "") {
            this.value = "+7";
        }
    });

    phoneInput.addEventListener("input", function () {
        let digits = this.value.replace(/\D/g, "");

        if (!digits.startsWith("7")) {
            digits = "7" + digits;
        }

        digits = digits.substring(0, 11);

        this.value = "+" + digits;
    });

    phoneInput.addEventListener("blur", function () {
        if (this.value === "" || this.value === "+" || this.value === "+7") {
            this.value = "+7";
        }
    });
}

/* ================= ИНИЦИАЛИЗАЦИЯ ================= */

document.addEventListener("DOMContentLoaded", function () {
    const avatarInput = document.getElementById("avatarInput");
    if (avatarInput) {
        avatarInput.addEventListener("change", handleAvatarSelect);
    }
});

/* ================= ПАРОЛЬ ================= */

// Очищаем поля пароля при загрузке (браузер может автозаполнить)
document.addEventListener("DOMContentLoaded", function () {
    const oldPassword = document.getElementById("oldPassword");
    const newPassword = document.getElementById("newPassword");
    
    if (oldPassword) oldPassword.value = "";
    if (newPassword) newPassword.value = "";
});

function validateProfilePassword() {
    const oldPassword = document.getElementById("oldPassword");
    const newPassword = document.getElementById("newPassword");

    const oldError = document.getElementById("oldPasswordError");
    const newError = document.getElementById("newPasswordError");

    let valid = true;

    oldError.textContent = "";
    newError.textContent = "";

    oldPassword.classList.remove("input-error");
    newPassword.classList.remove("input-error");

    if (oldPassword.value.length === 0) {
        oldError.textContent = "Введите текущий пароль";
        oldPassword.classList.add("input-error");
        valid = false;
    }

    if (newPassword.value.length < 8) {
        newError.textContent = "Пароль должен быть не менее 8 символов";
        newPassword.classList.add("input-error");
        valid = false;
    }

    return valid;
}

const oldPasswordInput = document.getElementById("oldPassword");
const newPasswordInput = document.getElementById("newPassword");

if (oldPasswordInput) {
    oldPasswordInput.addEventListener("input", validateProfilePassword);
    oldPasswordInput.addEventListener("change", validateProfilePassword);
    oldPasswordInput.addEventListener("paste", function() {
        setTimeout(validateProfilePassword, 0);
    });
}

if (newPasswordInput) {
    newPasswordInput.addEventListener("input", validateProfilePassword);
    newPasswordInput.addEventListener("change", validateProfilePassword);
    newPasswordInput.addEventListener("paste", function() {
        setTimeout(validateProfilePassword, 0);
    });
}

/* ================= СМЕНА ПАРОЛЯ ================= */

function changePassword() {
    if (!validateProfilePassword()) {
        return;
    }

    const oldPassword = document.getElementById("oldPassword");
    const newPassword = document.getElementById("newPassword");

    // Проверка, что новый пароль отличается от текущего
    if (oldPassword.value === newPassword.value) {
        showProfileMessage("passwordMessage", "Новый пароль должен отличаться от текущего", "error");
        return;
    }

    fetch("/change-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            old_password: oldPassword.value,
            new_password: newPassword.value
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showProfileMessage("passwordMessage", "Пароль успешно изменен", "success");

                oldPassword.value = "";
                newPassword.value = "";
            } else {
                showProfileMessage("passwordMessage", data.error || "Ошибка смены пароля", "error");
            }
        })
        .catch(() => {
            showProfileMessage("passwordMessage", "Server Error", "error");
        });
}
