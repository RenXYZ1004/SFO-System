The race category poster shown on the front page, under
"Race categories & fees". It is the picture that carries each distance and
its registration fee.

  race-categories.png

PNG is what the page reaches for first. If the artwork arrives as something
else it still works — jpg, jpeg and webp are tried after it, and an
underscore works as well as a hyphen, so race_categories.jpg is found just
as race-categories.png is. The file can go in exactly as it came off the
designer.

The poster is shown whole, never cropped, with a "Full size" link so the
fees can actually be read on a phone. Anything from around 1200px on its
long side works; portrait and landscape both fit. PNG artwork with flat
colour and text stays small, but keep it under about 400 KB — export at
8-bit colour rather than 24-bit if it comes out heavier than that.

With no file here the slot shows a "Race category poster coming soon"
placeholder, so the page still lists the distances (1K, 3K, 10K) and the
rest of the card reads normally.

If the distances on the poster ever change, update the chips in
public/index.html and the race_category options in lib/form-schema.js to
match.
