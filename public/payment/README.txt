Payment-method images for the "How to pay" card on the registration screen.

Name them after the method:

  gcash.<ext>          the GCash QR / account screenshot
  bank-transfer.<ext>  the PNB account card

<ext> can be jpg, png, jpeg or webp, and an underscore works as well as a
hyphen — bank_transfer.png is found just as bank-transfer.jpg is. The page
tries each spelling in turn, so you can drop the file in exactly as it came
off the phone or the scanner.

The images are shown whole, never cropped, in a square tile with a "Full size"
link, so a QR code stays scannable. Square artwork fits best; around 1000x1000
is plenty. Keep each file under about 300 KB so the section stays fast on
mobile data.

The tile whose method the runner picked is brought forward and the other
dims. A method with no image yet shows an "Image coming soon" placeholder, so
the page works whether you add one, both, or neither. The PNB account details
underneath are text in public/index.html, not part of the pictures, so they
stay readable and copyable even before the images land.
