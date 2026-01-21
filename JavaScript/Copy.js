document.addEventListener('DOMContentLoaded', function() {
    // Get the mail icon element
    var mail = document.querySelector("#mailMe");

    // Add a click event listener to the mail icon
    mail.addEventListener('click', CopyToClipboard);

    function CopyToClipboard() {
      // Get the text from the hidden paragraph
      const emailAddress = document.getElementById('MailAdress').innerText;

      // Create a temporary textarea element to hold the text
      const tempTextArea = document.createElement('textarea');
      tempTextArea.value = emailAddress;

      // Make the textarea non-editable and move it off-screen
      tempTextArea.setAttribute('readonly', '');
      tempTextArea.style.position = 'absolute';
      tempTextArea.style.left = '-9999px';

      // Add the textarea to the DOM
      document.body.appendChild(tempTextArea);

      // Select the text in the textarea and copy it
      tempTextArea.select();
      document.execCommand('copy');

      // Remove the temporary textarea from the DOM
      document.body.removeChild(tempTextArea);

      // Alert the user that the email address has been copied
      alert("Mail Address is copied: " + emailAddress);
    }
});
