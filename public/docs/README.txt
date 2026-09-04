The two documents linked from "Before you register" on the front page:

  waiver-of-liability.pdf
  health-declaration.pdf

Both filenames are referenced from public/index.html, so replace these files
in place rather than renaming them.

Because the name never changes, the only thing that tells a browser it is
looking at a new document is the cache header. vercel.json serves /docs/
with "max-age=0, must-revalidate", so a replacement is picked up on the next
visit. Do not put a long max-age or stale-while-revalidate back on this
path: readers who opened the old file would keep getting it, and these are
the documents they are agreeing to.

If you have already opened the old version yourself, your own browser may
still hold it — reload the PDF tab with Ctrl+Shift+R (Cmd+Shift+R on a Mac).
