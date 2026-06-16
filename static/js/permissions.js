/**
 * Основная инициализация прав доступа на навигационные ссылки.
 * Выполняется после полной загрузки DOM.
 * Проверяет роль пользователя и скрывает/блокирует пункты меню, к которым у него нет доступа.
 */
document.addEventListener("DOMContentLoaded", () => {

    /**
     * Константы ролей пользователей.
     * Используются для проверки прав на доступ к страницам.
     */
    const ROLE = {
        USER: 1,          // Обычный пользователь
        ADMIN: 2,         // Администратор
        SUPER_ADMIN: 3,   // Супер‑администратор
        DEVELOPER: 4      // Разработчик
    };

    /**
     * Текущая роль пользователя (извлекается с бэкенда).
     */
    const role = Number(window.userRoleId);

    /**
     * Список защищённых ссылок в меню.
     * minRole — минимальная разрешённая роль для просмотра пункта.
     */
    const protectedLinks = [
        { selector: '[data-page="admin"]', minRole: ROLE.ADMIN },
        { selector: '[data-page="reports"]', minRole: ROLE.ADMIN },
        { selector: '[data-page="admin-guide"]', minRole: ROLE.ADMIN }
    ];

    /**
     * Цикл по защищённым ссылкам.
     * Если у пользователя недостаточно прав — ссылка отключается:
     * - добавляется класс menu-disabled
     * - блокируется клик и предотвращается переход
     */
    protectedLinks.forEach(link => {

        const el = document.querySelector(link.selector);
        if (!el) return;

        // Если роль меньше минимально требуемой — отключаем ссылку
        if (role < link.minRole) {

            el.classList.add("menu-disabled");

            el.addEventListener("click", e => {
                e.preventDefault();              // блокируем переход
                e.stopImmediatePropagation();    // блокируем другие обработчики
            }, true);

        }

    });

});
