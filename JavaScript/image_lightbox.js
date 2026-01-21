const lightbox = document.createElement('div');
lightbox.id = 'lightbox';
document.body.appendChild(lightbox);

const lightboxImage = document.createElement('img');
lightbox.appendChild(lightboxImage);

const gridImages = document.querySelectorAll('.grid img');
gridImages.forEach(image => {
  image.addEventListener('click', () => {
    lightbox.classList.add('active');
    lightboxImage.src = image.src;
  });
});

lightbox.addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    lightbox.classList.remove('active');
  }
});
