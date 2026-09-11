// api/auth.js
const { google } = require('googleapis');

export default function handler(req, res) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://sfo-system.vercel.app/api/oauth-callback' // Must match Google Console exactly
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    prompt: 'consent',      // Forces the consent screen
    scope: ['https://mail.google.com/'] 
  });

  res.redirect(url);
}