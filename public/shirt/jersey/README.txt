The race jersey artwork, shown in 3D inside the "Race category" question
and in the pop-up behind "View in 3D".

Eight files, and only these eight names:

  1k-front.png    1k-back.png
  3k-front.png    3k-back.png
  5k-front.png    5k-back.png
  10k-front.png   10k-back.png

The name comes from the race_category answers in lib/form-schema.js, in
lower case with the "K" kept: 1K -> 1k, 10K -> 10k. Add a distance there
and it also needs a colourway entry in the JERSEYS map in public/app.js,
or its shirt quietly stops being shown.

WHAT THE FILES SHOULD LOOK LIKE

  * Transparent background. The shirt is stood on the page's own surface,
    not pasted into a white box, and a white background will show as one
    against the dark theme.
  * The garment filling the frame, no caption or distance label in the
    image — the page writes those itself.
  * Front and back framed the same way, at the same size. They are hung
    back to back, so a shirt that shifts or resizes when it turns will
    look like a mistake.
  * Roughly 3:4, portrait. Anything else is letterboxed, not cropped.
  * Around 900px on the long side is plenty; keep each file under about
    250 KB. There are eight of them and they all load at once.

The files here now were sliced out of reference_shirt.png by

  node tools/slice-jersey-reference.js

which is worth re-running if a new reference sheet arrives in the same
four-panel layout. They are only as good as that sheet — about 180px
tall — so they are placeholders. Drop the printer's artwork in over them
under the same names and nothing else has to change.

With a file missing the viewer steps aside and says "Jersey artwork
coming soon", so the question still works — the distance is still
answerable, it just has no picture.
