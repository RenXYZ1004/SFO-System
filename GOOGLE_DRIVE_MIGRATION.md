# Google Drive receipt storage

This version replaces Vercel Blob receipt storage with Google Drive.

## Destination folder

`GOOGLE_DRIVE_FOLDER_ID=1ePnOM7bKACgqj4KZZVaRKiYUVz_a8f1A`

The folder should remain private. Staff view receipts through `/api/receipt?p=<Drive file ID>` after staff authentication.

## Required environment variables

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_ID=1ePnOM7bKACgqj4KZZVaRKiYUVz_a8f1A
```

The OAuth account used by `GOOGLE_REFRESH_TOKEN` must have permission to add files to the SFO-Payment folder.

## Google Cloud setup

Enable the **Google Drive API** in the same Google Cloud project used for Gmail/Sheets.
Then run:

```bash
npm run token
```

The token helper now requests Gmail + Sheets + Drive (`drive.file`) access. Re-authorise once after this migration so the refresh token contains the Drive scope.

## Image format

The existing browser upload flow continues to convert/downscale images to WebP before upload. PDFs remain PDFs.

## Database

The existing `proof_url` column can remain for compatibility: the application stores its own authenticated receipt URL there. The actual Google Drive file ID is encoded in that URL. A later schema cleanup can rename the column to `proof_file_id`.

## Important

The old `.env.local` in the original project archive contains credentials. Do not deploy that file or commit it. Rotate any exposed Vercel Blob token and keep secrets only in Vercel environment variables/local ignored env files.
