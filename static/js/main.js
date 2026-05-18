const pages = {

admin:`<h2>Администрирование</h2><p>Управление системой</p>`,

vacation:`<h2>График отпусков</h2><p>Здесь будет таблица графика</p>`,

reports:`<h2>Формирование отчетов</h2>`,

export:`<h2>Выгрузка данных</h2>`,

"user-guide":`<h2>Руководство пользователя</h2>`,

"admin-guide":`<h2>Руководство администратора</h2>`,

about:`<h2>О сервисе</h2><p>Система управления графиком отпусков.</p>`
}

const links=document.querySelectorAll(".menu a")

links.forEach(link=>{

link.addEventListener("click",()=>{

links.forEach(l=>l.classList.remove("active"))

link.classList.add("active")

const page=link.dataset.page

const content=document.getElementById("page-content")

content.innerHTML=pages[page]

content.classList.remove("page")

void content.offsetWidth

content.classList.add("page")

})

})

/* ТЕМЫ */

const themes=["theme1","theme2","theme3"]

let currentTheme=0

const savedTheme=localStorage.getItem("themeIndex")

if(savedTheme!==null){
currentTheme=parseInt(savedTheme)
}

function applyTheme(){

document.body.classList.remove("theme1","theme2","theme3")

document.body.classList.add(themes[currentTheme])

localStorage.setItem("themeIndex",currentTheme)

}

applyTheme()

const btn=document.getElementById("themeToggle")

btn.onclick=()=>{

currentTheme++

if(currentTheme>=themes.length){
currentTheme=0
}

applyTheme()

}

function openSection(section){

const content = document.getElementById("page-content");

content.classList.remove("section");
content.classList.add("section-hide");

setTimeout(()=>{

content.innerHTML = "<h2>"+section+"</h2>";
content.classList.remove("section-hide");
content.classList.add("section");

},200);

}
