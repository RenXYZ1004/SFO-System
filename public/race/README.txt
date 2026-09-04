The race category poster shown on the front page, under
"Race categories & fees". It is the picture that carries each distance and
its registration fee.

  race-categories.<ext>

<ext> can be jpg, png, jpeg or webp, and an underscore works as well as a
hyphen — race_categories.png is found just as race-categories.jpg is. The
page tries each spelling in turn, so the file can go in exactly as it came
off the designer.

The poster is shown whole, never cropped, with a "Full size" link so the
fees can actually be read on a phone. Anything from around 1200px on its
long side works; portrait and landscape both fit. Keep it under about
400 KB.

With no file here the slot shows a "Race category poster coming soon"
placeholder, so the page still lists the distances (1K, 3K, 10K) and the
rest of the card reads normally.

If the distances on the poster ever change, update the chips in
public/index.html and the race_category options in lib/form-schema.js to
match.
