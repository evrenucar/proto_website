const lightbox = document.createElement('div')
lightbox.id = 'lightbox' //adds lightbox id to the div element
document.body.appendChild(lightbox) //adds lightbox div element to the document body

const images = document.querySelectorAll('.grid img') //selects all img inside .grid
images.forEach(image=> { //does the foolowing for every img  (not sure if "image" is just a name)
  image.addEventListener('click', e => { //adds event listener for clicking
    lightbox.classList.add('active') //adds "active" class to lightbox ()
    const img = document.createElement('img') // creates a new "img" element in document 
    img.src = image.src //transfers image source (clicked on) to the source of the new "img" element
    while (lightbox.firstChild){  //while lightbox has a first child
      lightbox.removeChild(lightbox.firstChild) //remove the first child
    }
    lightbox.appendChild(img) //adds img back as the last child under lightbox
  })
})

lightbox.addEventListener('click', e=>{  //if clicked on the lightbox element
  if(e.target !== e.currentTarget) return //if the event target is the image it exits the fuction
  lightbox.classList.remove('active') //removes active class.
})
