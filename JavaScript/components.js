
document.addEventListener("DOMContentLoaded", function() {
    loadSidebar();
});

function loadSidebar() {
    const sidebarHTML = `
<div class="sidenav" id="sidenav_menu">
  <div class="sidenav_links">
    <a href="index.html" class="nav-link" data-page="index">
      <img id="logo" src="image/evren_icon_white.png" alt="evren_icon_white" height="35"></a>
    <a id="first" href="index.html" class="nav-link" data-page="index">About Me</a>
    <a href="things_i_do.html" class="nav-link" data-page="things_i_do">Things I Do</a>
    <a href="photography.html" class="nav-link" data-page="photography">Photography</a>
    <a href="projects.html" class="nav-link" data-page="projects">Projects</a>
  </div>
  <div class="sidenav_contacts">
      <a href="mailto:evrenucar1999@gmail.com" target="_blank" >
        <img src="icon/gmail_white.png" alt="gmail icon" height="50"></a>
      <a href="https://www.linkedin.com/in/evren-u%C3%A7ar-b335971b4/" target="_blank" >
        <img src="icon/linkedin_white.png" alt="linkedin icon" height="50"></a>
      <a href="https://www.youtube.com/channel/UClIvijrVKdvasECOonGPomw" target="_blank" >
        <img src="icon/youtube_white.png" alt="youtube icon" height="50"></a>
  </div>
</div>
    `;

    // Check if we have a placeholder
    const placeholder = document.getElementById("sidebar-placeholder");
    if (placeholder) {
        placeholder.outerHTML = sidebarHTML;
    } else {
        // If the script is loaded but no placeholder, we might want to inject it at start of body
        // But since we are refactoring, I will ensure placeholder exists.
        // Or I can look for .sidenav and replace it?
        // Let's use a specific placeholder ID in the HTML files.
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    highlightActiveLink();
}

function highlightActiveLink() {
    // Determine current page
    let path = window.location.pathname;
    let page = path.split("/").pop();
    if (page === "" || page === "evrenucar.github.io") page = "index.html"; // Handle root
    // remove .html
    page = page.split(".")[0];

    // Default to index if unknown
    if (!["index", "things_i_do", "photography", "projects", "project_view"].includes(page)) {
        // Maybe it's index?
    }

    // Map project_view to projects for highlighting
    if (page === "project_view") {
        page = "projects";
    }

    const links = document.querySelectorAll(".nav-link");
    links.forEach(link => {
        // Check if data-page matches
        if (link.dataset.page === page) {
            link.style.color = "#fafafa";
        } else {
            // Remove inline style if any (though newly created shouldn't have any)
            link.style.color = "";
        }
    });
}
