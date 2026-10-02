# Nightly backup to Google Drive — one-time setup (about 30 minutes)

Every night at 11:30 PM India time, a free GitHub job copies:

* **All data** as one Excel file → `Dada Dosa Backups / Daily data / data-YYYY-MM-DD.xlsx` (last 30 days kept)
* **All uploaded files** that aren't in Drive yet → `Dada Dosa Backups / Files /`
  * `Expense receipts / <branch> / <YYYY-MM> / <date>_<party>_<amount>.jpg`
  * `Branch documents / <folder path> / <date>_<file name>`
  * `Employee documents / <employee name> / Joining form | Identity proof | Other / <date>_<file name>`

Files are only ever **added** to Drive — never deleted or overwritten. The first run copies everything (hundreds of
files can take a while); after that only new files are copied. Admin → Backup & Restore shows whether it is working.

The backup can only see files **it created** in your Drive (it uses the narrow "drive.file" permission), so it can't
read or touch anything else in your Google account. Keep the `Dada Dosa Backups` folder private — it contains salaries and ID proofs.

## 1. Run migration 014
Supabase → SQL Editor → run `supabase/migration_014_backup_status.sql`.

## 2. Create the Google connection (free, normal Gmail is fine)
1. Go to <https://console.cloud.google.com> → create a project, e.g. "Dada Dosa Backup".
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill the app name and your email → Save.
   Add your own Gmail under *Test users*.
4. **Important:** on the OAuth consent screen click **Publish app** (status "In production").
   If you leave it on "Testing", Google expires the connection after **7 days** and the backup silently stops.
   You'll see an "unverified app" warning when you sign in — that's expected for your own private app; choose *Advanced → Continue*.
5. **Credentials → Create credentials → OAuth client ID** → type **Desktop app** → create.
   Note the **Client ID** and **Client secret**.

## 3. Get the refresh token (once)
On any computer with Node.js 18+, in this project folder:

```
GOOGLE_CLIENT_ID=your-client-id GOOGLE_CLIENT_SECRET=your-secret node scripts/google-auth.mjs
```
(On Windows PowerShell: set `$env:GOOGLE_CLIENT_ID="..."` and `$env:GOOGLE_CLIENT_SECRET="..."` first, then `node scripts/google-auth.mjs`.)

Open the link it prints, sign in with the Gmail whose Drive should hold the backups, allow access. The terminal prints a **refresh token**.

## 4. Put the project on GitHub and add the secrets
1. Create a **private** GitHub repository and upload this project (without `node_modules`).
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key (**secret — never put it in the app or share it**) |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `GOOGLE_CLIENT_SECRET` | from step 2 |
| `GOOGLE_REFRESH_TOKEN` | from step 3 |

## 5. Test it
Repo → **Actions → Nightly Google Drive backup → Run workflow**. When it finishes (green tick), check your Drive for
`Dada Dosa Backups`, and Admin → Backup & Restore in the app for "Working". A red cross means it failed — GitHub also emails you.

## Good to know
* **Restoring data:** download that day's `data-….xlsx` from Drive and use Admin → Backup & Restore → Restore. Files can be copied back from Drive by hand.
* GitHub pauses scheduled jobs on a repo with **no activity for 60 days**. Open the repo and press *Run workflow* now and then (or push any small change) to keep it alive. If it ever stops, the app's backup status turns red after 36 hours.
* If you change your Google password or revoke access, repeat step 3 and update the `GOOGLE_REFRESH_TOKEN` secret.
* The service-role key can read everything in your database — treat it like a master password.
