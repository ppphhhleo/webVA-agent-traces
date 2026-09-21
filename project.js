const traceMatch = window.location.hash.match(/^#trace=(.+)$/);
if (traceMatch) {
  window.location.replace(`traces/${window.location.hash}`);
}

const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#primary-nav");

navToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

const lightbox = document.querySelector("#figure-lightbox");
const lightboxImage = lightbox?.querySelector("img");
const lightboxCaption = lightbox?.querySelector("p");

document.querySelectorAll("[data-lightbox]").forEach((figure) => {
  figure.tabIndex = 0;
  figure.setAttribute("role", "button");
  figure.setAttribute("aria-label", "Open figure at full size");

  const openFigure = () => {
    const image = figure.querySelector("img");
    const caption = figure.querySelector("figcaption");
    if (!lightbox || !lightboxImage || !image) return;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightboxCaption.textContent = caption?.textContent?.trim() || "";
    lightbox.showModal();
  };

  figure.addEventListener("click", openFigure);
  figure.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFigure();
    }
  });
});

lightbox?.querySelector("button")?.addEventListener("click", () => lightbox.close());
lightbox?.addEventListener("click", (event) => {
  const rect = lightbox.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside) lightbox.close();
});
