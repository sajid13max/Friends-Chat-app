# FriendChat

A simple private-group chat app where every registered account automatically joins the same global group.

## Features

- Email/password accounts
- Every account is automatically in the same group
- Realtime messages and realtime profile updates (name/avatar changes show up live)
- Member list with avatars
- Photo & video sending
- Voice note recording & sending
- Profile pictures
- 1:1 voice and video calling (WebRTC)
- Responsive desktop/mobile UI
- Supabase backend (Postgres + Storage) with Row Level Security enabled

## Setup

### 1. Create a Supabase project

Create a free project at Supabase.

### 2. Create the database and storage buckets

Open **SQL Editor** in Supabase and run the complete contents of `database.sql`.
This creates the tables, the `chat-media` and `avatars` storage buckets, and all
the required Row Level Security policies. It's safe to re-run if you already
ran an older version of this file — every statement is idempotent.

### 3. Get your API details

In Supabase, open your project settings/API page and copy:

- Project URL
- anon/public key

Open `app.js` and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Do NOT put a `service_role` key in this website.

### 4. Run the app

Because the app uses ES modules, serve the folder with a local web server.

For example, with Python:

```bash
python -m http.server 5500
```

Then open:

http://localhost:5500

You can also deploy the folder to Netlify, Vercel, GitHub Pages (with suitable configuration), or another static host.

**Note:** voice note recording needs microphone access, which browsers only
grant on `https://` or `http://localhost` — it will not work if you open
`index.html` directly as a `file://` URL.

## How the media features work

- **Photos/videos**: the 📎 button opens a file picker; images and videos up
  to 50 MB are uploaded to the `chat-media` bucket under
  `<user_id>/media/...` and sent as a message with `media_url` + `media_type`.
- **Voice notes**: the 🎙️ button starts recording with `MediaRecorder`; press
  **Send** in the recording bar to upload the clip to `chat-media` under
  `<user_id>/voice/...`, or **Cancel** to discard it.
- **Profile pictures**: click your avatar in the top-right to upload a new
  picture. It's stored in the `avatars` bucket at `<user_id>/avatar.<ext>` and
  the URL is saved on your `profiles` row, so it updates everywhere in
  real time via the existing `profiles` realtime subscription.
- Storage policies restrict uploads/updates/deletes to a user's own
  `<user_id>/...` folder in each bucket; both buckets are public for reading
  so message/avatar URLs work directly in `<img>`/`<video>`/`<audio>` tags.

## Voice & video calling

Click the 📞 or 🎥 icon next to a member's name to start a 1:1 call. This is
plain WebRTC:

- The two browsers connect **directly** to each other for audio/video — the
  media never touches Supabase.
- Supabase Realtime's broadcast feature is used only to pass along the
  connection setup messages (who's calling whom, and the technical details
  needed to establish the peer-to-peer link).
- Only free public **STUN** servers are configured, and no **TURN** server is
  included. This means calls should work fine between most home/wifi/mobile
  connections, but can fail to connect if one side is behind a strict
  corporate firewall or a carrier-grade NAT. If that happens for your group,
  you'd need to add a TURN server (e.g. a small [coturn](https://github.com/coturn/coturn)
  instance, or a paid provider like Twilio/Metered) to the `ICE_SERVERS` list
  near the top of `app.js`.
- Calls are one-to-one only; there's no group calling.
- Calling requires microphone/camera permission, which browsers only grant on
  `https://` or `http://localhost` (same restriction as voice notes).

## Installing it as an app (Android/iOS/desktop)

FriendChat is now a installable PWA (Progressive Web App): it has a manifest,
icons, and a service worker for offline shell caching. Once it's deployed on
`https://` (not `file://`):

- **Android (Chrome):** open the site → menu (⋮) → **"Install app"** / **"Add
  to Home screen"**. You get a real home-screen icon and a full-screen window
  with no browser bar — like a native app, launched from the site with zero
  extra build step.
- **iOS (Safari):** Share button → **"Add to Home Screen"**.
- **Desktop (Chrome/Edge):** an install icon appears in the address bar.

### Getting an actual `.apk` file

A true installable `.apk` needs the Android build toolchain (Gradle/Android
SDK), which isn't something a website can produce by itself. The standard,
no-code way to turn this PWA into a real signed `.apk`/`.aab`:

1. Deploy this folder somewhere with HTTPS (Netlify, Vercel, GitHub Pages,
   etc. all work and are free).
2. Go to **[pwabuilder.com](https://www.pwabuilder.com)**, paste your live
   URL, and click **"Package for Stores" → Android**.
3. It reads `manifest.json` automatically and generates a signed `.apk`/
   `.aab` you can install directly on a phone or upload to the Play Store.

(Alternative for more control: wrap it with
[Capacitor](https://capacitorjs.com/) in Android Studio — more setup, but
gives native APIs if you ever need them beyond what the browser offers.)

**Note:** microphone/camera access (voice notes, calling) and the service
worker both require `https://` (or `localhost`) — none of this works from a
`file://` URL or plain `http://`.

## Important: "me and my friend only"

This version is a **single shared group**: every account that successfully registers can see and send messages in that group.

If you literally want only you and a specific friend to be able to register, add an invite code or an allowlist before deploying publicly. The current database is designed for the "everyone joins one group" behavior requested.
