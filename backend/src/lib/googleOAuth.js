const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

// Identity scopes + the same Gmail scopes, requested together in one consent
// screen -- this is what lets a first-time "Sign in with Google" both create
// the account AND connect Gmail from the single resulting token pair.
const SIGN_IN_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  ...SCOPES,
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/gmail/oauth/callback'
  );
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

function getSignInAuthUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SIGN_IN_SCOPES,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function getAccessToken(refreshToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2Client.getAccessToken();
  return token;
}

async function getUserEmailAddress(accessToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress;
}

async function getGoogleIdentity(accessToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2Api.userinfo.get();
  return { googleId: data.id, email: data.email, emailVerified: Boolean(data.verified_email), name: data.name };
}

module.exports = {
  getAuthUrl,
  getSignInAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  getUserEmailAddress,
  getGoogleIdentity,
  createOAuthClient,
  SCOPES,
  SIGN_IN_SCOPES,
};
