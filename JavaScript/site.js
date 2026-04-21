const navToggle = document.querySelector("[data-nav-toggle]");
const sideNav = document.getElementById("sidenav_menu");
const navBackdrop = document.querySelector("[data-nav-backdrop]");
const desktopNavToggle = document.querySelector("[data-desktop-nav-toggle]");
const desktopNavToggleLabel = document.querySelector("[data-desktop-nav-toggle-label]");
const copyEmailButtons = document.querySelectorAll("[data-copy-email]");
const copyToast = document.querySelector("[data-copy-toast]");
const desktopNavStorageKey = "evren-site:desktop-nav-collapsed";
const mobileNavStorageKey = "evren-site:mobile-nav-open";
const defaultCopyToastMessage = "Email copied to clipboard.";
const copyToastMessages = Object.freeze([
  ...Array(60).fill(defaultCopyToastMessage),
  "Don't forget to ask how I'm doing :)",
  "Please also attach a picture of your cat.",
  "New contact unlocked!",
  "Inbox coordinates acquired.",
  "The email has left the workshop.",
  "Message route plotted.",
  "Tiny communication bridge deployed.",
  "Your next great email starts now.",
  "Signal acquired. Time to say hello.",
  "Clipboard stocked and ready."
]);
let copyToastTimer = 0;
let lockedNavigationScrollY = 0;
let isNavigationScrollLocked = false;

function getScrollbarCompensation() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function syncLayoutMetrics() {
  document.documentElement.style.setProperty("--scrollbar-compensation", `${getScrollbarCompensation()}px`);
}

function lockNavigationScroll() {
  if (isNavigationScrollLocked) {
    return;
  }

  lockedNavigationScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedNavigationScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
  isNavigationScrollLocked = true;
}

function unlockNavigationScroll() {
  if (!isNavigationScrollLocked) {
    return;
  }

  const nextScrollY = lockedNavigationScrollY;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = document.body.classList.contains("lightbox-open") ? "hidden" : "";
  isNavigationScrollLocked = false;
  window.scrollTo(0, nextScrollY);
}

function setNavigationOpen(isOpen, options = {}) {
  if (!navToggle || !sideNav) {
    return;
  }

  document.documentElement.classList.toggle("nav-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  sideNav.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);

  if (options.persist !== false) {
    writeStoredMobileNavigationState(isOpen);
  }

  if (navBackdrop) {
    navBackdrop.hidden = !isOpen;
    navBackdrop.classList.toggle("is-visible", isOpen);
  }

  if (isOpen && !isDesktopViewport()) {
    lockNavigationScroll();
  } else {
    unlockNavigationScroll();
  }
}

function isDesktopViewport() {
  return window.innerWidth > 1200;
}

function readStoredDesktopNavigationState() {
  try {
    return window.localStorage.getItem(desktopNavStorageKey) === "true";
  } catch (error) {
    return false;
  }
}

function readStoredMobileNavigationState() {
  try {
    return window.localStorage.getItem(mobileNavStorageKey) === "true";
  } catch (error) {
    return false;
  }
}

function writeStoredDesktopNavigationState(isCollapsed) {
  try {
    window.localStorage.setItem(desktopNavStorageKey, String(isCollapsed));
  } catch (error) {
    // Ignore storage failures and keep the toggle working for the current page.
  }
}

function writeStoredMobileNavigationState(isOpen) {
  try {
    window.localStorage.setItem(mobileNavStorageKey, String(isOpen));
  } catch (error) {
    // Ignore storage failures and keep the toggle working for the current page.
  }
}

function updateDesktopNavigationToggle(isCollapsed) {
  if (!desktopNavToggle) {
    return;
  }

  const label = isCollapsed ? "Open navigation" : "Close navigation";
  desktopNavToggle.setAttribute("aria-expanded", String(!isCollapsed));
  desktopNavToggle.setAttribute("aria-label", label);

  if (desktopNavToggleLabel) {
    desktopNavToggleLabel.textContent = label;
  }
}

function setDesktopNavigationCollapsed(isCollapsed, options = {}) {
  if (!desktopNavToggle || !sideNav) {
    return;
  }

  document.documentElement.classList.toggle("nav-desktop-collapsed", isCollapsed);
  document.body.classList.toggle("nav-desktop-collapsed", isCollapsed);
  updateDesktopNavigationToggle(isCollapsed);

  if (options.persist !== false) {
    writeStoredDesktopNavigationState(isCollapsed);
  }
}

function syncDesktopNavigation() {
  if (!desktopNavToggle || !sideNav) {
    return;
  }

  if (!isDesktopViewport()) {
    document.documentElement.classList.remove("nav-desktop-collapsed");
    document.body.classList.remove("nav-desktop-collapsed");
    updateDesktopNavigationToggle(false);
    return;
  }

  setDesktopNavigationCollapsed(readStoredDesktopNavigationState(), { persist: false });
}

function syncMobileNavigation() {
  if (!navToggle || !sideNav) {
    return;
  }

  if (isDesktopViewport()) {
    setNavigationOpen(false, { persist: false });
    document.documentElement.classList.remove("nav-open");
    document.body.style.paddingRight = "";
    return;
  }

  setNavigationOpen(readStoredMobileNavigationState(), { persist: false });
}

if (navToggle && sideNav) {
  let startX = 0;
  let isDraggingMenu = false;
  let hasSwiped = false;

  navToggle.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    isDraggingMenu = true;
    hasSwiped = false;
    navToggle.setPointerCapture(e.pointerId);
  });

  navToggle.addEventListener("pointermove", (e) => {
    if (!isDraggingMenu) return;
    const deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 30) {
      hasSwiped = true;
      const newPos = deltaX < 0 ? "left" : "right";
      document.documentElement.classList.toggle("nav-pos-left", newPos === "left");
      try {
        window.localStorage.setItem("evren-site:mobile-nav-pos", newPos);
      } catch (err) {}
      startX = e.clientX; // update anchor
    }
  });

  const endDrag = (e) => {
    if (!isDraggingMenu) return;
    isDraggingMenu = false;
    navToggle.releasePointerCapture(e.pointerId);
  };

  navToggle.addEventListener("pointerup", endDrag);
  navToggle.addEventListener("pointercancel", endDrag);

  navToggle.addEventListener("click", (e) => {
    if (hasSwiped) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const nextState = navToggle.getAttribute("aria-expanded") !== "true";
    setNavigationOpen(nextState);
  });

  navBackdrop?.addEventListener("click", () => {
    setNavigationOpen(false);
  });

  sideNav.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      setNavigationOpen(false);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1200) {
      setNavigationOpen(false, { persist: false });
    }

    syncLayoutMetrics();
    syncMobileNavigation();
    syncDesktopNavigation();
  });
}

desktopNavToggle?.addEventListener("click", () => {
  if (!isDesktopViewport()) {
    return;
  }

  const nextState = !document.body.classList.contains("nav-desktop-collapsed");
  setDesktopNavigationCollapsed(nextState);
});

syncLayoutMetrics();
syncMobileNavigation();
syncDesktopNavigation();

function decodeEmailPart(value, isReversed) {
  if (!value) {
    return "";
  }

  return isReversed ? value.split("").reverse().join("") : value;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall back to a temporary text area when the Clipboard API is blocked.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch (error) {
    copied = false;
  }

  helper.remove();
  return copied;
}

function showCopyToast(message) {
  if (!copyToast) {
    return;
  }

  window.clearTimeout(copyToastTimer);
  copyToast.textContent = message;
  copyToast.hidden = false;

  requestAnimationFrame(() => {
    copyToast.classList.add("is-visible");
  });

  copyToastTimer = window.setTimeout(() => {
    copyToast.classList.remove("is-visible");
    window.setTimeout(() => {
      copyToast.hidden = true;
    }, 200);
  }, 2000);
}

function getRandomCopyToastMessage() {
  const index = Math.floor(Math.random() * copyToastMessages.length);
  return copyToastMessages[index] || defaultCopyToastMessage;
}

if (copyEmailButtons.length > 0) {
  copyEmailButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const isReversed = button.dataset.emailReversed === "true";
      const user = decodeEmailPart(button.dataset.emailUser || "", isReversed);
      const domain = decodeEmailPart(button.dataset.emailDomain || "", isReversed);
      const email = `${user}@${domain}`;
      const copied = await copyText(email);

      showCopyToast(copied ? getRandomCopyToastMessage() : "Clipboard copy failed.");
    });
  });
}

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = lightbox?.querySelector("[data-lightbox-image]");
const lightboxCaption = lightbox?.querySelector("[data-lightbox-caption]");
const lightboxClose = lightbox?.querySelector("[data-lightbox-close]");
const lightboxButtons = document.querySelectorAll("[data-lightbox-button]");
const historyBackLinks = document.querySelectorAll("[data-history-back]");
const lightboxInteractiveImages = document.querySelectorAll(
  ".detail-hero img, .article-figure img, .photo-button[data-lightbox-button] img"
);
const lightboxState = {
  scale: 1,
  minScale: 1,
  maxScale: 4,
  translateX: 0,
  translateY: 0,
  pointers: new Map(),
  dragPointerId: null,
  lastTapAt: 0
};

function isMobileViewport() {
  return window.matchMedia("(max-width: 1200px)").matches;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getLightboxImageBounds(scale = lightboxState.scale) {
  if (!lightbox || !lightboxImage) {
    return { maxX: 0, maxY: 0 };
  }

  const frame = lightbox.getBoundingClientRect();
  const imageWidth = lightboxImage.clientWidth * scale;
  const imageHeight = lightboxImage.clientHeight * scale;

  return {
    maxX: Math.max(0, (imageWidth - frame.width) / 2),
    maxY: Math.max(0, (imageHeight - frame.height) / 2)
  };
}

function clampLightboxTranslation(nextX = lightboxState.translateX, nextY = lightboxState.translateY, scale = lightboxState.scale) {
  const { maxX, maxY } = getLightboxImageBounds(scale);

  return {
    x: clamp(nextX, -maxX, maxX),
    y: clamp(nextY, -maxY, maxY)
  };
}

function renderLightboxTransform() {
  if (!lightbox || !lightboxImage) {
    return;
  }

  const clamped = clampLightboxTranslation();
  lightboxState.translateX = clamped.x;
  lightboxState.translateY = clamped.y;

  lightboxImage.style.transform = `translate3d(${lightboxState.translateX}px, ${lightboxState.translateY}px, 0) scale(${lightboxState.scale})`;
  lightbox.classList.toggle("is-zoomed", lightboxState.scale > 1.01);
}

function resetLightboxZoom() {
  lightboxState.scale = 1;
  lightboxState.translateX = 0;
  lightboxState.translateY = 0;
  lightboxState.pointers.clear();
  lightboxState.dragPointerId = null;

  if (lightboxImage) {
    lightboxImage.style.transform = "";
  }

  lightbox?.classList.remove("is-zoomed");
}

function getPointerSnapshot(pointerId) {
  const pointer = lightboxState.pointers.get(pointerId);

  if (!pointer) {
    return null;
  }

  return {
    clientX: pointer.clientX,
    clientY: pointer.clientY
  };
}

function getLightboxFrameCenter() {
  if (!lightbox) {
    return { x: 0, y: 0 };
  }

  const frame = lightbox.getBoundingClientRect();

  return {
    x: frame.left + frame.width / 2,
    y: frame.top + frame.height / 2
  };
}

function getPinchMetrics(pointerSource = lightboxState.pointers) {
  const pointerEntries = Array.from(pointerSource.values());

  if (pointerEntries.length < 2) {
    return null;
  }

  const [first, second] = pointerEntries;
  const dx = second.clientX - first.clientX;
  const dy = second.clientY - first.clientY;

  return {
    distance: Math.hypot(dx, dy),
    midpoint: {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2
    }
  };
}

function applyLightboxTransform(nextScale, nextTranslateX, nextTranslateY) {
  const clampedScale = clamp(nextScale, lightboxState.minScale, lightboxState.maxScale);
  const clamped = clampLightboxTranslation(nextTranslateX, nextTranslateY, clampedScale);

  lightboxState.scale = clampedScale;
  lightboxState.translateX = clamped.x;
  lightboxState.translateY = clamped.y;

  if (lightboxState.scale <= 1.01) {
    lightboxState.scale = 1;
    lightboxState.translateX = 0;
    lightboxState.translateY = 0;
  }

  renderLightboxTransform();
}

function zoomLightboxAtPoint(targetScale, clientX, clientY) {
  if (!lightbox || !lightboxImage) {
    return;
  }

  const nextScale = clamp(targetScale, lightboxState.minScale, lightboxState.maxScale);
  const previousScale = lightboxState.scale;

  if (Math.abs(nextScale - previousScale) < 0.001) {
    return;
  }

  const frame = lightbox.getBoundingClientRect();
  const focusX = clientX - frame.left - frame.width / 2;
  const focusY = clientY - frame.top - frame.height / 2;
  const ratio = nextScale / previousScale;

  const nextX = focusX - (focusX - lightboxState.translateX) * ratio;
  const nextY = focusY - (focusY - lightboxState.translateY) * ratio;
  applyLightboxTransform(nextScale, nextX, nextY);
}

function openLightboxImage({ src, alt, caption }) {
  if (!lightbox || !lightboxImage || !lightboxCaption) {
    return;
  }

  lightboxImage.src = src || "";
  lightboxImage.alt = alt || "";
  lightboxCaption.textContent = caption || "";
  lightboxCaption.hidden = !caption;
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  resetLightboxZoom();
}

function closeLightbox() {
  if (!lightbox || !lightboxImage || !lightboxCaption) {
    return;
  }

  resetLightboxZoom();
  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  lightboxImage.src = "";
  lightboxImage.alt = "";
  lightboxCaption.textContent = "";
  lightboxCaption.hidden = true;
}

if (lightbox && lightboxImage && lightboxCaption) {
  lightboxButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openLightboxImage({
        src: button.dataset.lightboxSrc || "",
        alt: button.dataset.lightboxAlt || "",
        caption: button.dataset.lightboxCaption || ""
      });
    });
  });

  lightboxInteractiveImages.forEach((image) => {
    if (image.closest("[data-lightbox-button]")) {
      return;
    }

    image.addEventListener("click", () => {
      const figure = image.closest("figure");
      const captionText = figure?.querySelector("figcaption")?.textContent?.trim() || "";

      openLightboxImage({
        src: image.currentSrc || image.src || "",
        alt: image.getAttribute("alt") || "",
        caption: captionText
      });
    });
  });

  lightbox.addEventListener("click", (event) => {
    if (!event.target.closest("[data-lightbox-image]")) {
      closeLightbox();
    }
  });

  lightboxClose?.addEventListener("click", closeLightbox);

  lightboxImage.addEventListener("wheel", (event) => {
    if (isMobileViewport()) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    zoomLightboxAtPoint(lightboxState.scale + delta, event.clientX, event.clientY);
  }, { passive: false });

  lightboxImage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && !isMobileViewport()) {
      return;
    }

    lightboxImage.setPointerCapture(event.pointerId);
    lightboxState.pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    if (lightboxState.pointers.size === 1) {
      lightboxState.dragPointerId = event.pointerId;
      const now = Date.now();

      if (isMobileViewport() && now - lightboxState.lastTapAt < 280) {
        const nextScale = lightboxState.scale > 1.4 ? 1 : 2;
        zoomLightboxAtPoint(nextScale, event.clientX, event.clientY);
        lightboxState.lastTapAt = 0;
      } else {
        lightboxState.lastTapAt = now;
      }
    }
    if (lightboxState.pointers.size >= 2) {
      lightboxState.dragPointerId = null;
    }
  });

  lightboxImage.addEventListener("pointermove", (event) => {
    const previousPointer = getPointerSnapshot(event.pointerId);

    if (!previousPointer) {
      return;
    }

    const previousPointers = new Map(lightboxState.pointers);
    const previousPinchMetrics = getPinchMetrics(previousPointers);

    lightboxState.pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    if (lightboxState.pointers.size >= 2) {
      const pinchMetrics = getPinchMetrics();

      if (!previousPinchMetrics || !pinchMetrics || previousPinchMetrics.distance <= 0) {
        return;
      }

      event.preventDefault();
      const frameCenter = getLightboxFrameCenter();
      const previousScale = lightboxState.scale;
      const previousMidpointX = previousPinchMetrics.midpoint.x - frameCenter.x;
      const previousMidpointY = previousPinchMetrics.midpoint.y - frameCenter.y;
      const anchorX = (previousMidpointX - lightboxState.translateX) / previousScale;
      const anchorY = (previousMidpointY - lightboxState.translateY) / previousScale;
      const pinchScaleRatio = pinchMetrics.distance / previousPinchMetrics.distance;
      const nextScale = previousScale * pinchScaleRatio;
      const nextMidpointX = pinchMetrics.midpoint.x - frameCenter.x;
      const nextMidpointY = pinchMetrics.midpoint.y - frameCenter.y;
      const nextTranslateX = nextMidpointX - anchorX * nextScale;
      const nextTranslateY = nextMidpointY - anchorY * nextScale;

      applyLightboxTransform(nextScale, nextTranslateX, nextTranslateY);
      return;
    }

    if (lightboxState.dragPointerId !== event.pointerId || lightboxState.scale <= 1.01) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - previousPointer.clientX;
    const deltaY = event.clientY - previousPointer.clientY;
    applyLightboxTransform(lightboxState.scale, lightboxState.translateX + deltaX, lightboxState.translateY + deltaY);
  });

  function releaseLightboxPointer(event) {
    lightboxState.pointers.delete(event.pointerId);

    if (lightboxImage.hasPointerCapture(event.pointerId)) {
      lightboxImage.releasePointerCapture(event.pointerId);
    }

    if (lightboxState.dragPointerId === event.pointerId) {
      lightboxState.dragPointerId = null;
    }

    if (lightboxState.pointers.size === 1) {
      const [remainingPointerId] = lightboxState.pointers.keys();
      lightboxState.dragPointerId = remainingPointerId;
    }
  }

  lightboxImage.addEventListener("pointerup", releaseLightboxPointer);
  lightboxImage.addEventListener("pointercancel", releaseLightboxPointer);

  window.addEventListener("resize", () => {
    if (lightbox.hidden) {
      return;
    }

    renderLightboxTransform();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (navToggle?.getAttribute("aria-expanded") === "true") {
        setNavigationOpen(false);
      }

      closeLightbox();
    }
  });
}

if (historyBackLinks.length > 0) {
  historyBackLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const fallbackHref = link.getAttribute("data-fallback-href") || link.getAttribute("href") || "index.html";

      if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
        return;
      }

      if (fallbackHref) {
        event.preventDefault();
        window.location.href = fallbackHref;
      }
    });
  });
}
