const navToggle = document.querySelector("[data-nav-toggle]");
const sideNav = document.getElementById("sidenav_menu");

if (navToggle && sideNav) {
  navToggle.addEventListener("click", () => {
    const nextState = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(nextState));
    sideNav.classList.toggle("is-open", nextState);
  });
}

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
const lightboxButtons = document.querySelectorAll("[data-lightbox-button]");

function closeLightbox() {
  if (!lightbox || !lightboxImage || !lightboxCaption) {
    return;
  }

  lightbox.hidden = true;
  lightboxImage.src = "";
  lightboxImage.alt = "";
  lightboxCaption.textContent = "";
}

if (lightbox && lightboxImage && lightboxCaption && lightboxButtons.length > 0) {
  lightboxButtons.forEach((button) => {
    button.addEventListener("click", () => {
      lightboxImage.src = button.dataset.lightboxSrc || "";
      lightboxImage.alt = button.dataset.lightboxAlt || "";
      lightboxCaption.textContent = button.dataset.lightboxCaption || "";
      lightbox.hidden = false;
    });
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  lightboxClose?.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
    }
  });
}
