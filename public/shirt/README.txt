Shirt artwork for the registration screen.

  jersey/          the race jerseys, shown in 3D and in the size guide
  shirt-size.png   the old size chart — NO LONGER USED, see below


THE SIZE GUIDE IS NO LONGER A PICTURE

The "Shirt size" question used to show shirt-size.png: one flat chart with
the garment and the measurements baked into its pixels. It is now drawn by
the page instead, because the picture had gone wrong in a way a picture
cannot warn you about — it showed a purple sleeveless RACE SINGLET branded
"35 YEARS", where the 2026 race shirt is a sleeved raglan tee in four
colourways. Runners were choosing a size against a garment nobody receives.

What replaced it:

  * The shirt in the guide is the same file the 3D viewer loads, from
    jersey/, in the colourway for the distance the runner picked. The
    picture cannot disagree with the garment because it IS the garment.

  * The measurements are text, in a table, so they can be read on a phone
    without opening anything. Picking a size lights up its row and puts its
    figures on the two brackets beside the shirt.

  * The numbers live in lib/form-schema.js, on the shirt_size field, right
    beside the list of sizes they describe — so the two cannot drift apart.
    Change a measurement there and the page follows.

To add a third measurement (a sleeve length, say): add the key to every
size under sizeChart.measurements in lib/form-schema.js, and add a matching
entry to SIZE_COLUMNS in public/app.js. The table builds itself from that
list. Only width and length get a bracket on the drawing — they are the two
dimensions there is a picture to point at.


ABOUT shirt-size.png

It is kept here, unreferenced, in case the artwork is wanted for a poster or
a claim stub. Nothing on the site loads it. Delete it whenever you like.

!! The measurements now in lib/form-schema.js were taken off this chart, and
they were drawn for the singlet. They are a perfectly even 16-24 / 24-32
ladder, which reads like a supplier's template rather than measured samples.
Check them against an actual 2026 race shirt before the form goes live.
