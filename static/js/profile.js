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

function showMessage(id, text, type = "success") {
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

function uploadAvatar() {
    const fileInput = document.getElementById("avatarInput");

    if (!fileInput || !fileInput.files.length) {
        return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("avatar", file);

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

                showMessage("avatarMessage", "Аватар успешно обновлен", "success");
            } else {
                showMessage("avatarMessage", "Ошибка загрузки аватара", "error");
            }
        })
        .catch(() => {
            showMessage("avatarMessage", "Server Error", "error");
        });
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
                showMessage("phoneMessage", "Телефон обновлен", "success");
            } else {
                showMessage("phoneMessage", data.error || "Ошибка сохранения", "error");
            }
        })
        .catch(() => {
            phoneSaving = false;
            showMessage("phoneMessage", "Server Error", "error");
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

/* ================= ПАРОЛЬ ================= */

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
}

if (newPasswordInput) {
    newPasswordInput.addEventListener("input", validateProfilePassword);
}

/* ================= СМЕНА ПАРОЛЯ ================= */

function changePassword() {
    if (!validateProfilePassword()) {
        return;
    }

    const oldPassword = document.getElementById("oldPassword");
    const newPassword = document.getElementById("newPassword");

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
                showMessage("passwordMessage", "Пароль успешно изменен", "success");

                oldPassword.value = "";
                newPassword.value = "";
            } else {
                showMessage("passwordMessage", data.error || "Ошибка смены пароля", "error");
            }
        })
        .catch(() => {
            showMessage("passwordMessage", "Server Error", "error");
        });
}
