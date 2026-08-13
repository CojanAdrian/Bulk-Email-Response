const { google } = require('googleapis');

// gmail.modify (not gmail.readonly) -- readonly can list/get messages but
// cannot change labels, so marking a message read (removing UNREAD via
// messages.modify, see markMessageRead in gmailClient.js) silently fails
// with a 403 under readonly. modify is a superset of readonly for our
// purposes: it still allows all the same reading, plus label changes,
// while stopping short of permanent delete.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
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

// Two separate callback routes, two separate redirect URIs -- an OAuth2
// client's redirect_uri is fixed at construction and must exactly match
// whichever endpoint the authorization request was sent to, or the later
// token exchange fails a redirect_uri_mismatch check. Reusing one redirect
// URI for both flows would send the sign-in flow's consent screen back to
// the Gmail-connect callback route instead of the sign-in one.
const GMAIL_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/gmail/oauth/callback';
const SIGN_IN_REDIRECT_URI = process.env.GOOGLE_SIGN_IN_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';

function createOAuthClient(redirectUri = GMAIL_REDIRECT_URI) {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
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
  const oauth2Client = createOAuthClient(SIGN_IN_REDIRECT_URI);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SIGN_IN_SCOPES,
  });
}

async function exchangeCodeForTokens(code, redirectUri = GMAIL_REDIRECT_URI) {
  const oauth2Client = createOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function exchangeSignInCodeForTokens(code) {
  return exchangeCodeForTokens(code, SIGN_IN_REDIRECT_URI);
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
  exchangeSignInCodeForTokens,
  getAccessToken,
  getUserEmailAddress,
  getGoogleIdentity,
  createOAuthClient,
  SCOPES,
  SIGN_IN_SCOPES,
};
