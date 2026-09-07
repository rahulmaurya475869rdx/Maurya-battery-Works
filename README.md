# Maurya Battery Works — Website Setup Guide

Here are all the files for your website, with step-by-step instructions
below on how to make it live. Follow each step in order — don't skip any.

## What's in this folder

```
index.html            Main page customers see
admin.html             Your admin panel (opens by typing "MBW LOGIN" in the search bar)
css/style.css          All styling for the whole site (red shine, italic text, everything)
js/firebase-config.js  Where you put your Firebase + Cloudinary details
js/app.js              Logic for the customer-facing page
js/admin.js            Logic for the admin panel (login, security alert, product management)
firestore.rules        Firebase database security rules (you paste this in)
README.md              This guide
```

No zip file — every file is direct, as you asked for.

---

## STEP 1 — Create a GitHub repository

1. Go to https://github.com and sign in (or create an account).
2. Click **"New repository"**, name it something like `maurya-battery-works`, and create it.
3. Upload all these files into the repository:
   - On the repository page, click **"Add file" → "Upload files"**.
   - Drag in every file and the `css` / `js` folders, keeping the same folder structure shown above.
   - Click **"Commit changes"**.

---

## STEP 2 — Create your Firebase project (database + login)

1. Go to https://console.firebase.google.com and sign in with Google.
2. Click **"Add project"**, name it (e.g. `maurya-battery-works`), and finish creating it.
   (You can say "No" to Google Analytics — it isn't needed.)
3. Inside the project, go to **Build → Firestore Database**.
   - Click "Create database".
   - Choose **"Start in production mode"**, pick the region nearest you (e.g. `asia-south1`), and enable it.
4. Go to **Build → Authentication**.
   - Click "Get started".
   - Enable the **"Email/Password"** sign-in method.
5. In the **"Users"** tab of Authentication, click **"Add user"** twice to create two accounts:

   **a) Your main admin account** — this is what you type into the login screen every day.
   - Email: anything, doesn't need to be real (e.g. `owner@mauryabatteryworks.com`)
   - Password: a strong password — this is your real Admin ID + Secret Password. Keep it private.

   **b) Your emergency backup account** — this is your safety net.
   - Email: exactly `emergency-access@mauryabatteryworks.internal` (or change it, just make sure it matches the `EMERGENCY_ACCESS_EMAIL` value in `js/firebase-config.js`)
   - Password: your own 10-digit number, e.g. `9876501234`. This is your **emergency code**.

### Copy your config

1. Click the gear icon (⚙️) → **Project settings**.
2. Under "Your apps", click the **`</>` (Web)** icon and register an app (any nickname).
3. You'll get a code block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "xxxx.firebaseapp.com",
  projectId: "xxxx",
  storageBucket: "xxxx.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

4. Copy these values into `js/firebase-config.js`, replacing the placeholder text.

---

## STEP 3 — Add the Firestore security rules

1. In Firebase Console, go to **Firestore Database → Rules**.
2. Delete whatever is there.
3. Copy the entire contents of `firestore.rules` and paste it in.
4. Click **"Publish"**.

(These rules let customers view products while only you can edit or delete
them, and make sure a blocked login ID can never unblock itself.)

---

## STEP 4 — Create a Cloudinary account (for images & video)

Since you didn't want Firebase Storage, we're using Cloudinary instead —
its free plan is generous enough for a shop catalog.

1. Create a free account at https://cloudinary.com.
2. On your dashboard, copy your **"Cloud name"** (shown near the top).
3. Go to **Settings (gear icon) → Upload**.
4. Under "Upload presets", click **"Add upload preset"**.
   - Set **Signing Mode to "Unsigned"** — this is important.
   - Save it, then copy the preset name it generates.
5. In `js/firebase-config.js`:
   - Replace `YOUR_CLOUD_NAME` with your Cloud name.
   - Replace `YOUR_UNSIGNED_UPLOAD_PRESET` with your preset name.

Update this file on GitHub too (Step 1 style upload, or edit it directly
on GitHub using the pencil icon).

---

## STEP 5 — Deploy on Netlify

1. Create an account at https://netlify.com (you can sign in with GitHub).
2. Click **"Add new site" → "Import an existing project"**.
3. Connect GitHub and select your `maurya-battery-works` repository.
4. Leave the build settings empty — **no build command**, and **publish
   directory set to `.` (root)** — this is a plain HTML site, no build step needed.
5. Click **"Deploy"**. Your site goes live in a minute or two, with a link
   like `mbw-xyz.netlify.app`.
6. You can add your own custom domain later from Netlify's site settings.

**Always test using this live Netlify link**, not by double-clicking the
file — login and the database only work over the internet.

---

## STEP 6 — Log in and add your content

1. Open your live site, type **`MBW LOGIN`** into the search bar at the
   top, and press Enter. The admin panel opens.
2. Sign in with your main admin email + password from Step 2a.
3. If you've set an entry video (see below), it plays first — then the
   dashboard opens with these tabs:
   - **Categories** — create your categories first: Battery, Inverter,
     Cooler, Fan, Washing Machine, Winter Heater, etc.
   - **Products** — name, category, price, description, multiple images,
     and one video per product.
   - **Banner Slider** — images for the smooth homepage slideshow.
   - **Entry Video** — see below.
   - **Shop Settings** — shop name, tagline, address, call/WhatsApp number.
   - **Blocked Logins** — every blocked login attempt, with an Unblock button.
   - **Security Sound** — change the siren sound the security alert plays.

That's it — the site is ready for customers, who never need to log in and
can reach you directly by call or WhatsApp.

---

## Emergency Backup Login (so you're never locked out)

You asked for two things: your own ID should never get blacklisted, and
an emergency 10-digit code that opens the admin panel on its own. Here's
how it actually works, and why it's built this way:

- Your normal Admin ID still follows the same 2-strike rule as everyone
  else — this keeps the lockout system consistent and doesn't create a
  "special" ID that someone could discover and target with unlimited
  password guesses.
- Instead, you get a **completely separate emergency code** — the 10-digit
  number you set up in Step 2b. Type it into the **Secret Password** field
  on the login screen (the Admin ID field can say anything) and it logs
  you straight in, even if your normal ID is currently blocked.
- Once you're in via the emergency code, if your normal ID did get
  blocked, just open the **Blocked Logins** tab and click **Unblock** next
  to it.

So in practice, you're never actually stuck out — and the visible
lockout system stays exactly as strong for everyone else. If you'd still
prefer your real ID to be permanently exempt from blocking instead, that
can be added, but it does mean anyone who ever learns that exact ID gets
unlimited password guesses against it — happy to change it if you'd
rather have that trade-off.

If the emergency account itself ever has trouble, you can always fix
things directly in Firebase Console → Firestore Database → Data →
`security_blocks` collection → delete the relevant document.

---

## How the Security Alert system works

- Someone enters the wrong Admin ID/Password → first wrong try just shows
  a normal error.
- **Second wrong try** → that ID is **permanently blocked**.
- From then on, any login attempt with that ID — right password or not —
  instantly shows a **full red screen with a 💀 skull, a glowing "SECURITY
  ALERT" message, and a siren sound**.
- Every blocked ID is listed in the **Blocked Logins** tab so you always
  know who's been trying.
- You can upload your own siren sound from the **Security Sound** tab —
  otherwise a default siren plays automatically.

**Worth knowing honestly:** this will stop and startle a casual scammer
or curious visitor very effectively, and the Firestore rules make sure no
one can unblock themselves. But since this whole system runs in the
browser (no paid backend server, exactly as you wanted to keep it free), a
genuinely expert developer could study the code and work around it. For
the vast majority of people who might try, it'll do exactly what you want.

---

## Admin Entry Video

- Upload a short video (you mentioned keeping it around 2MB) from the
  **Entry Video** tab.
- It plays automatically right after a successful login, before the
  dashboard appears — with a Skip button in case you want to jump ahead.
- It's only ever loaded on the admin panel, after you've logged in — the
  customer-facing site never fetches it, so it has no effect on how light
  or fast the main site loads.
- Remove it anytime from the same tab to skip straight to the dashboard again.

---

## Customizing the design

Near the top of `css/style.css` you'll find:

```css
--red-deep, --red-mid, --red-bright   the shining red shades
--gold                                 price & heading color
--black, --charcoal                    dark background shades
```

Change these to shift the whole color theme. If you ever want to remove
the italic text, find `body{ font-style:italic; }` in `css/style.css` and
delete that line.

---

## Common problems

- **Products/categories not showing:** double-check the Firestore rules
  from Step 3 were published.
- **Image upload failing:** check your Cloudinary cloud name/preset, and
  that the preset is set to "Unsigned".
- **Can't log in:** check Email/Password sign-in is enabled, and that the
  email/password in Authentication → Users match what you're typing.
- **Blocked Logins list not showing:** this only loads once you're logged
  in (the rules only allow the full list to logged-in admins).

If you get stuck on a step, re-read that section carefully — everything
is in the order you need it.
