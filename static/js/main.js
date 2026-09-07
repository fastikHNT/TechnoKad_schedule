document.addEventListener("DOMContentLoaded", () => {

const pages = {

    admin:`<h2>Администрирование</h2><p>Управление системой</p>`,
    vacation:`<h2>График отпусков</h2><p>Здесь будет таблица графика</p>`,
    reports:``,
    export:`<h2>Выгрузка данных</h2>`,
    "user-guide":`<h2>Руководство пользователя</h2>`,
    "admin-guide":`<h2>Руководство администратора</h2>`,
    about:`<h2>О сервисе</h2><p>Система управления графиком отпусков.</p>`
    }

    const links = document.querySelectorAll(".menu a")
    const content = document.getElementById("page-content")

    /* отключаем кнопку администрирования для user */

    if(window.userRole === "user"){

        const adminLink = document.querySelector('[data-page="admin"]')

    if(adminLink){
        adminLink.classList.add("menu-disabled")
        adminLink.removeAttribute("href")
        }

    }

    links.forEach(link => {

        const page = link.dataset.page

        /* если user и это admin — не вешаем обработчик */
        if (page === "admin" && window.userRole === "user") {
            return
        }

        link.addEventListener("click", (e) => {

            e.preventDefault()

            if (!page) return

            links.forEach(l => l.classList.remove("active"))
            link.classList.add("active")

            if (page === "admin") {

                switchPage((wrapper) => {

                    fetch("/admin/")
                        .then(r => {

                            if (r.status === 403) {
                                showMessage("Доступ запрещен", "error");
                                return null;
                            }

                            return r.text();
                        })
                        .then(html => {

                            if (!html) return;

                            wrapper.innerHTML = html

                            if (typeof initAdminPage === "function") {
                                initAdminPage()
                            }

                        })
                        .catch(err => {
                            console.error("Ошибка :", err)
                            showMessage("Ошибка загрузки страницы", "error")
                        })

                })

            } else if (page === "vacation") {

                switchPage(async (wrapper) => {

                const html = await fetch("/schedule").then(r => r.text())

                wrapper.innerHTML = html

                if (typeof initSchedulePage === "function") {
                    initSchedulePage()
                }
            })

            } else if (page === "reports") {

                switchPage((wrapper) => {
                    fetch("/reports").then(r => r.text()).then(html => {
                        wrapper.innerHTML = html
                        if (typeof initReportsPage === "function") {
                            initReportsPage()
                        }
                    })
                })

            } else if (pages[page]) {

                switchPage((wrapper) => {
                wrapper.innerHTML = pages[page]
                })
            }
        })

    })

    /* ТЕМЫ */

    const themes = ["theme1","theme2","theme3"]

    let currentTheme = 0

    const savedTheme = localStorage.getItem("themeIndex")

    if(savedTheme !== null){
        currentTheme = parseInt(savedTheme)
    }

    function applyTheme(){

        document.body.classList.remove(...themes)
        document.body.classList.add(themes[currentTheme])

        localStorage.setItem("themeIndex", currentTheme)
    }

        applyTheme()

        const btn = document.getElementById("themeToggle")

        if(btn){

            btn.onclick = ()=>{
            currentTheme++

            if(currentTheme >= themes.length){
                currentTheme = 0
            }

            applyTheme()
            }
        }

    /* ===== АНИМАЦИЯ ПЕРЕКЛЮЧЕНИЯ ===== */
    function switchPage(renderCallback){

        const wrapper = document.createElement("div")
        wrapper.classList.add("page-anim")

        renderCallback(wrapper)

        content.innerHTML = ""

        content.appendChild(wrapper)

        requestAnimationFrame(() => {
            wrapper.classList.add("show")
        })
    }

    /* открытие секций */

    function openSection(section){

        const content = document.getElementById("page-content")

        if(!content) return

        content.classList.remove("section")
        content.classList.add("section-hide")

        setTimeout(()=>{

        content.innerHTML = "<h2>"+section+"</h2>"

        content.classList.remove("section-hide")
        content.classList.add("section")

        },200)
    }

    /* УВЕДОМЛЕНИЯ */

    function saveNotifications(){

        localStorage.setItem("notifications", JSON.stringify(notifications))
        localStorage.setItem("unread", unread)

    }

})