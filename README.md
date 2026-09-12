# Maurya Battery Works — Website Setup Guide

Here are all the files for your website, with step-by-step instructions
below on how to make it live. Follow each step in order — don't skip any.

## What's in this folder

```
index.html            Main page customers see
admin.html             Your admin panel (opens by typing "MBW LOGIN" in the search bar)
rateus.html            Public "Rate Us" review page (linked from the homepage)
style.css              All styling for the whole site (red shine, italic text, everything)
firebase-config.js     Where you put your Firebase + Cloudinary details
app.js                 Logic for the customer-facing page
admin.js               Logic for the admin panel (login, security alert, product management, reviews)
rateus.js              Logic for the Rate Us page (star picker, review list, abuse/spam checks)
fingerprint.js         Shared device-fingerprint helper (used by admin.js and rateus.js)
firestore.rules        Firebase database security rules (you paste this in)
README.md              This guide
```

All of these files sit directly in the main folder on GitHub — not inside any
`css/` or `js/` subfolder, so upload/replace them at the top level.

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

### The "Save password?" popup is gone

The login screen no longer uses a real HTML `<form>` — it's just two
boxes and a button wired up with JavaScript. That's what actually stops
Chrome's save-password prompt, on a blocked attempt or a real one:
Chrome deliberately ignores `autocomplete="off"` on password fields (it
did before too, even though it was already set), and the only thing
that reliably stops the prompt is not having a form-submit event at all.

One side effect worth knowing: Chrome also won't offer to save *your*
real admin password on a successful login anymore, since it's the same
screen either way. If you want Chrome to remember it for you, add it
once by hand: `chrome://password-manager` → **Add password**.

### Louder Security Sound

Both the siren you upload and the default generated one now play at
double the volume in code, with a limiter added so the boost stays a
clean loud siren instead of turning into crackly distortion. Two things
this can't do, on purpose: make a muted phone audible, or exceed what
the phone's speaker can physically produce. No website is allowed to
reach into another device's volume or mute settings — that's an
operating-system protection, not something code can work around.

---

## Get alerts on your own phone

When an ID gets blocked (or a blocked ID tries again), you can now hear
about it two ways:

### 1. Email to your Gmail

This reaches you even when you're not looking at the admin panel. A
plain website can't send email by itself, so this uses a free service
called **EmailJS** as the go-between:

1. Go to **https://www.emailjs.com** and sign up — free.
2. **Email Services → Add New Service → Gmail** → connect
   `rahulmaurya151015@gmail.com` (or whichever Gmail you want the alerts
   to land in).
3. **Email Templates → Create New Template.** Set the "To email" field
   to `{{to_email}}`, and use `{{blocked_id}}`, `{{attempts}}`, and
   `{{time}}` in the subject/body, e.g.:
   - Subject: `🚨 MBW Admin — Blocked login attempt`
   - Body: `ID entered: {{blocked_id}}` / `Attempts: {{attempts}}` /
     `Time: {{time}}`
4. **Account → General** → copy your **Public Key**.
5. Open `js/admin.js`, find the block right near the top that says
   `PASTE_YOUR_EMAILJS_...`, and fill in:
   - `EMAILJS_PUBLIC_KEY` → your Public Key (step 4)
   - `EMAILJS_SERVICE_ID` → your Service ID (step 2)
   - `EMAILJS_TEMPLATE_ID` → your Template ID (step 3)
6. Save, re-upload `admin.js` to GitHub, let Netlify redeploy. Done.

The free EmailJS plan allows 200 emails a month, which is plenty — and
the code already limits itself to one email every 30 seconds so a bot
retrying the login form over and over can't burn through your quota or
flood your inbox.

### 2. Live alert on a device you keep open

Open the **Blocked Logins** tab and tap **"Enable Live Alerts on This
Device."** From then on, whichever device has that tab open (an old
phone, a laptop, doesn't matter) will flash red, play your actual siren
sound, and show a notification the instant a new ID gets blocked.

**Worth knowing honestly:** neither of these can take over a locked
phone screen the way an incoming call or an alarm clock does. That kind
of takeover is an operating-system feature reserved for apps with
special permissions — dialers, alarm clocks, emergency-alert apps — and
no website, email, or free service can copy it, including this one. The
email shows up as a normal Gmail notification (visible even on a locked
screen, if your phone's notification settings allow it, but with
Gmail's own sound); the live alert is louder and uses your real siren,
but only while that tab is open somewhere. Using both covers you either
way, and is the strongest version of this that's honestly achievable
without turning this into a paid, native phone app.

### Why the attempted password is never sent to you

Only the ID/email someone typed is captured and emailed — never the
password, not even the wrong one. People (and sometimes their browser's
own autofill) sometimes type a real password meant for some other
account into random login boxes without meaning to. Holding onto that
— even with good intentions — means holding a stranger's actual
password, which is a real liability for you and unfair to them. Knowing
*who* tried is enough to see the pattern and act on it; the password
itself was never needed for that.

---

## Device fingerprint blocking (admin login)

On top of the existing ID-based block, the login page now also
fingerprints the device itself (a mix of canvas rendering and a few
browser/screen signals — see `fingerprint.js`). On a 2nd wrong attempt,
that **device** gets blocked too — so switching to a different (still
wrong) ID from the same phone/browser doesn't get around it.

**You will never lock yourself out this way.** The moment you log in
successfully — real password or emergency PIN — that device is marked
"trusted" in Firestore and becomes permanently exempt from this block,
even if you fat-finger your own password twice on some other day.

If you ever do see your own device in the **Blocked Devices** list
(Blocked Logins tab), tap **Unblock** — or unblock it from any other
device that's already trusted.

**Worth knowing honestly:** this isn't a fingerprint the way a real one
is — a private/incognito window, clearing site data, or a different
browser produces a new one. It's a solid extra speed bump, not an
unbeatable lock.

---

## Rate Us page (customer reviews)

A new public page, `rateus.html`, linked from a "⭐ Rate Us" button on
your homepage. Customers pick 1–5 stars — their honest choice, no forced
minimum — write an optional description, and give their name + address
(address is mandatory but never shown publicly; see below).

### What happens on submit

1. **Already permanently blocked** (same device, any name) → a plain
   message: *"Your feedback submission has been permanently blocked."*
   No siren.
2. **Already submitted 3 times today** (same device, any name — matched
   by fingerprint, not by name) → *"You have already submitted your
   feedback today."* No siren, nothing scary.
3. **Contains a word from your Bad Words list** → full red screen,
   siren, and vibration — using a sound **separate from the admin-login
   siren** (upload it under Feedback Settings) — and that device is
   **permanently blocked from ever submitting again**, under any name.
   Nothing is saved.
4. **Otherwise** → saved instantly, shown at the top of the public list.
   4–5 star reviews get the full animated "Thank You" screen (falling
   stars/flowers, your custom text, your custom sound, for however many
   seconds you set) — 1–3 star reviews get a simple, non-animated
   thank-you instead, since the celebration is specifically for the
   enthusiastic ones.

### ⚠️ You must add words to the Bad Words list yourself

The list starts **empty**. Until you add words in the Customer Reviews
tab, the abuse filter does nothing — add them before this page goes
live. Matching is whole-word and case-insensitive ("dumb" won't match
inside "dumbbell"). Words show **masked** in your own admin panel by
default — it's your shop's panel, no reason you should have to read a
list of slurs — with a "Show Real Words" toggle for whenever you need to
check spelling or add a variant.

### How the address stays private — properly, not just hidden in the UI

The address is saved in a **separate Firestore collection**
(`reviews_private`) that only you, logged into the admin panel, can
read — not merely hidden by the page's design. This matters: if the
address lived in the same document as the public review, a
technically-minded visitor could still see it by inspecting the page's
network traffic directly, even though the review card itself never
displays it. A separate, admin-only-readable collection closes that gap
for real, not just visually.

### Why "bad product" isn't filtered, and what's there instead

Filtering out product/service complaints would also silence genuinely
unhappy customers — full reasoning is earlier in this conversation.
Instead, every review can be **deleted** from the Customer Reviews tab,
and you can **reply publicly** to any review (the "Reply" button) —
between the two, you have full control without an automatic filter
making that call for you.

### Firestore rules — add these

**Firebase Console → Firestore Database → Rules.** Add the blocks below
*inside* your existing `match /databases/{database}/documents { ... }`,
alongside what's already there — don't delete your existing rules:

```
match /trusted_devices/{deviceId} {
  allow get: if true;
  allow write: if request.auth != null;
}

match /blocked_devices/{deviceId} {
  allow get: if true;
  allow create: if true;
  allow list, update, delete: if request.auth != null;
}

match /feedback_blocks/{deviceId} {
  allow get: if true;
  allow create, update: if true;
  allow list, delete: if request.auth != null;
}

match /review_daily_limits/{limitId} {
  allow get, create, update: if true;
  allow list, delete: if request.auth != null;
}

match /reviews/{reviewId} {
  allow read: if true;
  allow create: if true;
  allow update, delete: if request.auth != null;
}

match /reviews_private/{reviewId} {
  allow get, list: if request.auth != null;
  allow create: if true;
  allow update, delete: if request.auth != null;
}
```

Your existing `settings/{docId}`-style rule should already cover the two
new settings documents this feature uses (`bad_words` and `feedback`),
as long as it isn't written to only allow specific document names. If
saving bad words or feedback settings gives a permission error, that's
the first thing to check.

**Why `get` and `list` are split** — the one genuinely tricky part here:
`get` fetches one specific document by its exact ID (how a visitor's own
browser checks "is *my* fingerprint blocked?"); `list` runs a query
across many documents (how your admin panel builds the "Blocked
Devices" / "Blocked Reviewers" lists). Splitting them means a visitor
can check their own status without being able to browse everyone
else's.

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
