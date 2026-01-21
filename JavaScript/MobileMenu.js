function MobileMenu(checkbox) {
    var menu = document.getElementById("sidenav_menu");
    if (checkbox.checked) {
        menu.classList.add("open");
    } else {
        menu.classList.remove("open");
    }
}
