// One-time helper: prints the GOOGLE_REFRESH_TOKEN the nightly backup needs.
// Usage:  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs
import http from "http";

const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) { console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first."); process.exit(1); }
const PORT = 53682, redirect = `http://127.0.0.1:${PORT}`;
const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
  scope: "https://www.googleapis.com/auth/drive.file",
});
console.log("\n1. Open this link in your browser and allow access:\n\n" + url + "\n");

http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get("code");
  if (!code) { res.end("Waiting…"); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  res.end(j.refresh_token ? "Done — you can close this tab and go back to the terminal." : "Something went wrong — see the terminal.");
  if (j.refresh_token) console.log("2. Your GOOGLE_REFRESH_TOKEN (keep it secret):\n\n" + j.refresh_token + "\n");
  else console.error("No refresh token returned:", j);
  process.exit(j.refresh_token ? 0 : 1);
}).listen(PORT, "127.0.0.1");
