# FDE Field Prep

A co-op quest game for two people preparing for Forward Deployed Engineer interviews. It has daily quests, a training timer, a 22-mission world map with stars, a Road to FDE 2027 plan, a job tracker, a final certification exam, YouTube and reading loot, battle cards, party chat, quiz duels, a hero-based quiz battle arena, a party screen and trophies.

It is plain HTML with no build step. Supabase handles login and data, and Vercel hosts it.

## What's in here

| File | What it does |
| --- | --- |
| `index.html` | The whole app |
| `config.js` | Your Supabase URL and key go here |
| `supabase/schema.sql` | Creates the tables and privacy rules |
| `api/quiz.js` | Optional: generates AI quizzes with Claude |
| `api/signup-code.js` | Checks the private signup code, adds verified emails to the study list, and unlocks the auto-lock screen |
| `sw.js` | Makes it installable, opens offline, shows notifications |
| `api/notify.js`, `api/notify-test.js`, `api/remind.js`, `api/_push.js` | Push notifications: chats, invites, battle turns, daily reminder |
| `package.json`, `vercel.json` | Notification library and the daily 8pm reminder schedule |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Lets you add it to your phone's home screen |

## Setup (about 15 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project. Pick the Singapore region; it's closest to Manila.
2. Open **SQL Editor → New query**.
3. Paste all of `supabase/schema.sql`.
4. At the bottom of the pasted SQL, change `you@example.com` and `bert@example.com` to your two real emails.
5. Click **Run**. You should see "Success".

### 2. Copy your keys into `config.js`

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** into `supabaseUrl`.
3. Copy the **anon public** key into `supabaseAnonKey`.

The anon key is safe to put in a public repo. The database rules decide who can read and write, and only the two emails on your list get in.

### 3. Put it on GitHub

1. Create a new repository, for example `fde-field-prep`.
2. Upload every file in this folder, keeping the `supabase/` folder.
3. Either drag the files onto the GitHub web page, or push from your computer:
   ```bash
   git init
   git add .
   git commit -m "FDE Field Prep"
   git branch -M main
   git remote add origin https://github.com/<you>/fde-field-prep.git
   git push -u origin main
   ```

### 4. Deploy on Vercel

1. In Vercel, go to **Add New → Project** and import the GitHub repo.
2. Set **Framework Preset** to **Other**.
3. Leave the build command empty and keep the output directory as the root.
4. Click **Deploy**. You'll get a link like `https://fde-field-prep.vercel.app`.

Every push to `main` redeploys automatically.

### 5. Point Supabase login at your Vercel link

In Supabase, open **Authentication → URL Configuration**:

- **Site URL:** your Vercel link, e.g. `https://fde-field-prep.vercel.app`
- **Redirect URLs:** add the same link

Without this, the email confirmation and password-reset links point to the wrong place.

### 6. Sign up

1. In Vercel **Project → Settings → Environment Variables**, add `SIGNUP_CODE` with your private signup code. Also set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the service-role key is in **Supabase → Project Settings → API** and must stay in Vercel only.
2. Redeploy the Vercel project so the environment variables are available to the signup endpoint.
3. Open your Vercel link, tap **Create an account**, and enter the signup code. A valid code authorizes signup; the email is added to the study list only after Supabase confirms it.
4. Confirm your email, then sign in. If you already have an account, sign in and enter the access code on the study-list screen. Send Bert the link and code so he can do the same.

**Add to home screen:** on iPhone, Safari → Share → Add to Home Screen. On Android, Chrome → ⋮ → Add to Home screen. It then opens full-screen like an app.

## Auto-lock

After 30 seconds without a tap, keypress, scroll or mouse move, the app locks behind a full-screen **Quest locked** screen. Enter the access code (the same `SIGNUP_CODE` used for signup) to get back in, or tap **Sign out**. Reloading the page or reopening the app doesn't get around the lock. Timers and live sync keep running while it's locked.

- The code is checked by `api/signup-code.js`, so unlocking needs a connection and only works on the deployed Vercel site, not a plain local file server.
- After five wrong codes in a row, unlocking pauses for 30 seconds.
- To change the timeout, edit `LOCK_MS` in `index.html`. Changing `SIGNUP_CODE` in Vercel changes the unlock code too.
- This is a privacy screen for a phone left on the table. It doesn't protect against someone with the browser's developer tools open on an already signed-in device.

## Settings

Tap the gear at the top right (or **Settings, notifications and members** in the Party tab). Every player can change their display name, daily goal and sound, turn notifications on or off, see each member's level, combo and when they last trained, and sign out. Admins (emails in `ADMIN_EMAILS` on Vercel) also see **User management** there to grant or remove access.

## Chat

The **Chat** tab works like a messaging app:

- **React:** double-tap a message to ❤️ it, or long-press (right-click or hover **⋯** on a computer) to pick ❤️ 😂 😮 😢 😡 👍.
- **Reply, copy, unsend:** in the same long-press menu. Unsend removes your message for both of you.
- **Topics:** tap **📌 Topic** to post a discussion topic to the chat, or pick **Start a topic from this** in a message's long-press menu. The topic shows up as a card with its reply count and latest reply. Tap **Open discussion** to go into its thread, where messages stay out of the main chat, and tap **←** to go back. The Topic sheet also lists recent topics so you can reopen them.
- **Seen and typing:** your partner's avatar appears under your last message once they've read it, and you'll see typing dots and "Active now" while they're in the app.
- **Composer:** the emoji button opens a picker. With an empty box, the send button sends a 👍. Enter sends on a computer; Shift+Enter adds a new line.
- Tap a message to see its time. Links open in a new tab.

## Quiz duels

In the **Chat** tab, tap **Quiz duel** and pick:

- the missions to cover
- 5 or 10 questions
- the question source

The quiz is sent to your partner as an invite card. You both answer the same questions, 10 seconds each (running out counts as wrong), and the card shows both scores as you finish.

**Question bank** works out of the box: about 50 hand-written questions across the eight missions.

**AI-generated quizzes (optional)** write fresh questions with Claude from the mission material:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com). Usage is billed to that account; a quiz costs a fraction of a cent on the default model.
2. In Vercel, open **Project → Settings → Environment Variables** and add:
   - `ANTHROPIC_API_KEY`: your key
   - `SUPABASE_URL`: same value as in `config.js`
   - `SUPABASE_ANON_KEY`: same value as in `config.js`
3. Optionally add `ANTHROPIC_MODEL` to pick another model. It defaults to `claude-haiku-5-5`.
4. In `config.js`, set `aiQuiz: true`, push, and redeploy.

The function only answers people who are signed in and on the study list. Your key stays on Vercel and never reaches the browser.

## Heroes and the battle arena

- **Choosing a hero:** the first time someone signs in, they choose a hero. Four are open from the start, and the rest unlock at player levels 2–5. Switch anytime in **Arena → Change hero**.
- **Hero skills:** each hero has six skills that unlock with that hero's XP, at 0, 100, 300, 500, 800 and 1,200. They cover block, dodge, half damage, heal, regen, double damage, pierce, lifesteal, counter, drain, burn, freeze, silence, 50/50, extra time and reveal.
- **Look and feel:** each hero has an animated 8-bit element emblem, and every attack and skill plays its own pixel animation. Animations turn off when the phone's "reduce motion" setting is on.
- **Starting a battle:** tap **Battle** in the Arena or Chat tab, then pick missions, 10/15/20 questions and the source. The challenge appears in chat.
- **Each turn:** both players answer the same question with a 10-second timer. A correct answer hits for 6–14, and faster hits harder. A wrong answer or timeout costs 5 HP. Each skill can be armed once per battle before answering.
- **Winning:** every battle lasts at least 10 questions, because nobody drops below 1 HP before then. A knockout from question 10, or the most HP at the end, wins.
- **Fairness:** both phones compute the same result from the two answer lists. Answer times are measured on each player's own phone.
- **Edit heroes:** the `HEROES` and `SKILLS` lists live in `index.html`.

## Coins, shop and sound

- **Earning coins:**
  - 50 when you choose your hero, plus 10 per check-in and 15 for clearing the daily quests
  - 1 per 10 minutes of training
  - Study commitments: 10 for keeping one, plus 1 per 5 minutes of overtime (up to 20 more). See below.
  - 2 per battle card or loot claim, and 5 per skill sign-off
  - Quiz duels: 2 per correct answer, 5 for finishing, 10 for beating your partner
  - Battles: 2 per correct answer, 10 for finishing, 25 for a win
- **Shop** (Base screen or Arena):
  - Battle items: Health Potion, Hourglass, Scroll of Insight, Wildfire Flask
  - Skill scrolls that unlock your hero's next power early
  - Locked heroes
  - Titles shown under your name
- **Sound:** original 8-bit sound effects, made live in the browser. Mute with the speaker button at the top.
- **Losing coins:** stopping a study commitment early costs 2 coins per 5 minutes short. If that takes you below zero, the balance shows 0 and the next coins you earn pay off the difference first.
- **Editing prices:** prices live in the `ITEMS`, `TITLES`, `SKILL_PRICES` and `HERO_PRICE` lists in `index.html`.

## Study commitments

On **Base**, pick a mission, choose **Commit to** 15, 30, 45, 60 or 90 minutes, and tap **Start**. The timer counts down to your commitment, then counts up as overtime.

- **Finish on or after the time:** +10 coins and +10 XP, plus 1 coin and 1 XP per 5 minutes of overtime (up to 20 each).
- **Finish early:** −2 coins for every 5 minutes short (rounded up). The app shows the cost and asks you to confirm first.
- **Discarding:** a session can be thrown away for free only in its first 2 minutes. After that, the only way out is **Finish**.
- **Pause** doesn't count toward the time.
- **Today's log** lists each session as kept or missed, with a **Share** button that posts it to the feed. Your profile shows how many commitments you've kept.
- **+15m / +30m buttons:** these log time you spent away from the app. They don't count as commitments.

To change the rewards, edit `sessDelta` in `index.html`.

## Base feed, profiles and photo posts

**Base** works like a Facebook home page. Your daily quests and the training timer are in one column, and the party feed is in the other. On a phone, the feed comes after the quests and timer.

- **Your party:** a row of everyone's avatars at the top of the feed. Tap one to open that profile.
- **Posting:** anything you post on Base also shows on your profile. Posts can have an optional photo, taken with the camera or picked from the gallery. Others can like and comment.
- **Question of the day:** a get-to-know-you question sits above the post box. Tap **Answer** to post your answer under it, or **Another** for a different question. When someone else answers one, an **Answer this too** button on their post lets you answer the same question. The questions live in the `PROMPTS` list in `index.html`.
- **Profile photo:** change it in **Settings → Profile photo**, or tap your avatar on your profile page. It's cropped to a square and stored in the same private `post-photos` bucket under your user id. It shows everywhere your initials used to.
- **Profiles:** open one from **Party → View profile**, or by tapping a name in the feed, the people row or the members list. The **Party feed** on the Party screen shows the same posts.

To turn it on, open the Supabase **SQL Editor** and run section 5 of `supabase/schema.sql`, from `-- 5. Player profiles` to the end. It creates the `posts`, `post_likes` and `post_comments` tables and a private `post-photos` storage bucket. Only people on the study list can see posts and photos. Photos are shrunk to 1600px before upload and can be up to 5 MB.

On phones, **Camera** opens the phone's camera app. On a laptop it opens a live camera preview in the app, which asks for camera permission the first time.

For push notifications about new posts, comments and likes, add three more webhooks the same way as the `progress` one in step A.3 below: tables `posts`, `post_comments` and `post_likes`, with the Insert event only.

## Android app and notifications

### A. Turn on notifications (about 10 minutes)

These steps cover chats, quiz and battle invites, "your move" in battles, and an 8pm reminder if you haven't checked in.

1. **Update the database.** Run `supabase/schema.sql` again in the Supabase SQL Editor. It's safe to re-run, and it adds the `push_subs` table.
2. **Add the secrets to Vercel.** Go to **Project → Settings → Environment Variables** and add every line from `fde-quest-SECRETS.txt`:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - `WEBHOOK_SECRET`, `CRON_SECRET`
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY`: the same values as in `config.js`
   - `SUPABASE_SERVICE_ROLE_KEY`: in **Supabase → Project Settings → API**. It's secret, so it goes only in Vercel, never in `config.js`.
3. **Connect Supabase to the app.** In Supabase, go to **Database → Webhooks → Create a new hook**:
   - Table: `progress`; Events: Insert and Update
   - Type: HTTP Request, `POST`, URL `https://YOUR-APP.vercel.app/api/notify`
   - HTTP header: `x-webhook-secret` = the `WEBHOOK_SECRET` value
4. **Redeploy** on Vercel so the new variables load.
5. **Test it.** On your phone, open the app, then go to **Party → Notifications → Turn on notifications**, then tap **Send a test**.

The daily reminder runs at 12:00 UTC, which is 8pm Manila. It's set in `vercel.json`, and Vercel's free plan allows one daily job.

### B. Install on Android without an APK (2 minutes)

Open your Vercel link in Chrome, tap **⋮ → Install app** (or **Add to Home screen**), then open FDE Quest from your home screen. It runs full-screen and gets notifications. This is the quickest way for Bert too.

### C. Make a real APK with PWABuilder (free, about 10 minutes)

Do this after A, while the app is live on Vercel.

1. Go to [pwabuilder.com](https://www.pwabuilder.com), paste your Vercel link and press **Start**. It checks the manifest and service worker, which are already set up.
2. Choose **Android**, open **Options**, and:
   - set a package ID, for example `com.yourname.fdequest`
   - **turn on Notifications** (notification delegation), so pushes show as the app's own
   - choose **New** signing key
3. Download the zip. Keep the signing key and its passwords somewhere safe; you need them for future updates of the APK.
4. **Remove the browser bar.** The zip includes an `assetlinks.json` file. Put it in this repo at `.well-known/assetlinks.json`, then push. After Vercel redeploys, the app opens without a browser address bar.
5. **Install it.** Send the `.apk` to your phone and Bert's. Allow **Install unknown apps** for whichever app you open it from (Files, Chrome or Messenger), then install.

The APK loads your live site, so new features arrive the moment you push to GitHub. You only rebuild the APK if you change the app name, icon or package ID. To publish on the Play Store later, use the `.aab` from the same zip.

## Road to FDE 2027 and certification

- **Roadmap:** the Map screen opens with a six-phase plan from November 2026 to an offer in Q3 2027. The current phase is marked NOW; tap any mission chip to jump in.
- **Job tracker:** lives in the "Resume, LinkedIn and applications" mission. Add companies and move each one through Applied → Screen → Interview → Final → Offer. Your partner sees your totals on the Party screen. Rewards:
  - each application: +5 XP
  - reaching an interview: +15 XP
  - an offer: +150 XP and 100 coins
- **Certification exam:**
  - **Unlocks** once every mission has 2+ stars.
  - **Format:** 30 questions covering all 22 missions, 10 seconds each, no skills or items. It takes 80% to pass, and you can retake 30 minutes after a fail.
  - **Reward:** a certificate with your name, score, date, hero and a certificate ID, which you can save as an image. It's labelled as a self-study completion certificate, not an accredited credential.
- **Real certifications to pair with it:** listed in the job-hunt mission. AWS Cloud Practitioner, AWS AI Practitioner, Google Cloud Generative AI Leader, and free Anthropic Academy course certificates.

## Everyday admin

**Manage users in the app:** Add `ADMIN_EMAILS` to Vercel Environment Variables as a comma-separated list of administrator emails. Each admin must also be in `public.members` to sign in. After redeploying, admins can open **Party → User management** to grant or remove study-list access, or permanently delete a Supabase Auth account. Before a delete goes through, the admin must type that account's email to confirm, and the server checks it too. Deleting an account also removes its linked profile, progress, and push subscriptions. The admin endpoint uses `SUPABASE_SERVICE_ROLE_KEY` only on the server.

**Add someone to the study list** in SQL Editor:

```sql
insert into public.members (email) values ('someone@example.com');
```

**Remove someone:**

```sql
delete from public.members where email = 'someone@example.com';
```

**Change the partner name** shown in the app: edit `partnerName` in `config.js` and push.

**Edit videos, readings or battle cards:** they live in the `MODULES` list near the top of the script in `index.html`. Each video is `{id, t: title, u: link}`. Give any new item a new short id made of lowercase letters and numbers.

**Edit quiz questions:** they're in the `BANK` list in `index.html`, grouped by mission. Put the correct option first; the app shuffles options for each quiz.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| "Almost ready" screen | `config.js` still has the placeholder values |
| "You're not on the study list yet" | That email isn't in the `members` table, or it's spelled differently |
| Confirmation email link opens localhost | Set the Site URL and Redirect URLs in step 5 |
| Confirmation emails are slow or missing | Supabase's built-in email is rate-limited. Check spam, or connect your own email under Authentication → Emails |
| "AI-generated" is greyed out | `aiQuiz` is still `false` in `config.js` |
| AI quiz says it couldn't generate | Check the three environment variables in Vercel, then redeploy |
| Notifications panel says "Not available here" | Install the app (B or C) and open it from the home screen; plain browser tabs on some phones can't receive pushes |
| "Send a test" says the server isn't set up | One of the Vercel environment variables is missing; add it and redeploy |
| Tests work but chat pings don't | Check the Supabase webhook URL and the `x-webhook-secret` header |
| The other person's progress doesn't update live | Re-run the schema; the last block turns on live updates. Reopening the app also refreshes it |

## How data is protected

- Only signed-in people whose email is in `members` can read the board.
- Each person can write only their own progress row.
- Passwords are handled by Supabase Auth and never stored in your tables.

## Android app

The Android app is a Capacitor build of the same `index.html`. The page is packaged inside the APK, so there's no browser bar and it opens instantly. It still talks to the same Supabase and Vercel API, so the website and the app share one account and one board. The web version doesn't change.

| Path | What it does |
| --- | --- |
| `capacitor.config.json` | App id `app.magayonquest.fdequest`, name, splash colors |
| `android/` | The native Android project (commit it) |
| `scripts/build-web.mjs` | Copies the site into `www/`, which goes into the APK |
| `scripts/make-icons.mjs`, `assets/` | Launcher icons and splash screen made from `icon.svg` |
| `fde-quest-release.jks`, `android/keystore.properties` | Release signing key. **Not in git.** The password is in `fde-quest-SECRETS.txt` |

**Back up the `.jks` file and its password.** Phones only accept updates signed with the same key.

### Build the APK

You need Node 18+, JDK 21 and the Android SDK (or Android Studio). On David's Mac they live in `~/.fdeq-tools`:

```bash
export PATH=~/.fdeq-tools/node/bin:$PATH JAVA_HOME=~/.fdeq-tools/jdk/Contents/Home ANDROID_HOME=~/.fdeq-tools/android-sdk
npm install
npm run android:apk      # → android/app/build/outputs/apk/release/app-release.apk
```

After any change to `index.html` or `config.js`, run `npm run android:apk` again and bump `versionCode` in `android/app/build.gradle` so phones accept it as an update. To install, send the APK to the phone and open it. Android asks once to allow installs from that app.

If you installed the old web-wrapper APK, uninstall it first. This one has a different app id.

### Push notifications in the app

The app can't use web push, so it uses Firebase Cloud Messaging:

1. In the [Firebase console](https://console.firebase.google.com), create a project and add an **Android app** with package name `app.magayonquest.fdequest`.
2. Download `google-services.json` into `android/app/`.
3. In **Project settings → Service accounts**, click **Generate new private key**. In Vercel, add an environment variable `FCM_SERVICE_ACCOUNT` and paste the whole JSON file as its value. Redeploy.
4. Set `androidPush: true` in `config.js`, rebuild the APK, then turn on notifications in the app's Settings.

### Email links

Sign-up confirmation and password-reset emails open the website (`appUrl` in `config.js`). After confirming, go back to the app and sign in.
