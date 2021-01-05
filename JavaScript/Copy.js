
var mail = document.querySelector("#mailMe");
mail.addEventListener('click',  CopyToClipboard);

function CopyToClipboard() 
{
    /* Get the text field */
    var copyText = document.getElementById("MailAdress"); 
    const str = document.getElementById('MailAdress').innerText;
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
   alert("Mail Address is copied: " + str);
  } 