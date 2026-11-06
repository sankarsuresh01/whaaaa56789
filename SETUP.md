# Setting up Hearth

Plan about 30–40 minutes the first time. Do it on a computer. Keep this guide open as you go.

**How it fits together**

- **Your Google Drive folder** holds every photo, video and "thinking of you." Nothing is stored anywhere else.
- **GitHub Pages** hosts the app's code (these files) so it has a link. It never sees your photos.
- **Google Cloud** gives the app permission to sign the two of you in and read your folder. Only the two Google accounts you list can ever sign in.

You can preview Hearth with sample photos any time by adding `?demo` to the end of its link.

---

## Step 0: Make her Hearth account

Hearth uses a separate Google account just for her, so nothing ever appears in her everyday Drive, Gmail or "Shared with me."

1. In a private/incognito window, go to **accounts.google.com/signup** and create a new Gmail account. Pick an address only you two would recognise (nothing with her real name if you'd rather keep it discreet).
2. Google may ask for a phone number to verify. Using yours is fine for now.
3. Write down the address and password somewhere safe. You'll give them to her on her birthday.
4. Sign out of that account when you're done.

From here on, **"her Hearth account"** means this new address.

---

## Step 1: Make the Drive folder

1. Go to **drive.google.com** and sign in with **your** account.
2. Click **New → New folder**. Call it anything boring (nobody will see the name in the app).
3. Open the folder and drag in your photos and videos.
   - Put them **directly in this folder**, not in folders inside it.
   - **To add a note to a memory:** right-click the file → **File information → Details**, and type in the **Description** box. That text shows under the photo in Hearth.
   - Keep videos short (under a minute is ideal) so they load fast on her phone.
4. Share the folder with **her Hearth account** (from step 0), not her everyday email: click **Share**, type **her Hearth account's address**, set her as **Editor** (so she can add memories), and **untick "Notify people"** so Google doesn't email her before her birthday. Click **Share**.
5. Look at your browser's address bar. It looks like
   `drive.google.com/drive/folders/1AbCdEfGh...`
   Copy everything after `folders/`. That's your **folder ID**. Save it somewhere for step 4.

---

## Step 2: Put the app on GitHub Pages

1. Create a free account at **github.com** if you don't have one.
2. Click **+** (top right) → **New repository**.
   - **Name:** pick something **nobody could guess**, a word plus random letters and numbers, like `ember-7k2q` or `quiet-r84m`. It becomes part of the link (`YOURNAME.github.io/ember-7k2q/`), so an obscure name keeps the link hard to stumble on. Avoid "hearth", her name, or anything obvious.
   - Set it to **Public** (free GitHub Pages needs this; it's only code, no photos).
   - In the steps below, wherever you see `/hearth/` in a link, use your own project name instead.
   - Click **Create repository**.
3. On the new page, click **uploading an existing file**.
4. Unzip Hearth on your computer. Open the folder and drag **everything inside it** (including the `icons` folder) into the browser. Click **Commit changes**.
5. Go to the repository's **Settings → Pages**. Under **Branch**, choose **main** and **/ (root)**, then **Save**.
6. Wait 1–2 minutes and refresh. You'll see **"Your site is live at …"**. The link looks like
   `https://YOURNAME.github.io/hearth/`
   Copy it exactly, **including the slash at the end**. Open it: you should see "Almost ready."

---

## Step 3: Let Google sign you in (Google Cloud)

1. Go to **console.cloud.google.com** and sign in with **your** Google account. Accept the terms if asked.
2. At the top, click the project picker → **New project**. Name it `Hearth` → **Create**. Make sure it's selected at the top.
3. **Turn on Drive:** in the search bar type **Google Drive API**, open it, click **Enable**.
4. **Set up sign-in:** search for **Google Auth Platform** (it may also be called **OAuth consent screen**) and click **Get started**.
   - **App name:** Hearth. **Support email:** yours. **Next.**
   - **Audience:** External. **Next.**
   - **Contact email:** yours. **Next**, agree, **Create**.
5. **Allow the two of you:** go to **Audience** → under **Test users**, click **Add users**, add **your Google email and her Hearth account** → **Save**. Nobody else will be able to sign in.
6. **Allow Drive access:** go to **Data access** → **Add or remove scopes**. In the box at the bottom ("Manually add scopes"), paste
   `https://www.googleapis.com/auth/drive`
   → **Add to table** → **Update** → **Save**.
7. **Create the key:** go to **Clients** → **Create client**.
   - **Application type:** Web application. **Name:** Hearth.
   - **Authorized JavaScript origins → Add URI:** `https://YOURNAME.github.io` (just the start, no `/hearth/`)
   - **Authorized redirect URIs → Add URI:** your full link from step 2, e.g. `https://YOURNAME.github.io/hearth/` (with the slash at the end)
   - Click **Create**. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

---

## Step 4: Connect the app

1. In your GitHub repository, click **config.js**, then the **pencil icon** (Edit).
2. Replace `PASTE_YOUR_CLIENT_ID_HERE` with your Client ID, and `PASTE_YOUR_FOLDER_ID_HERE` with your folder ID. Keep the quote marks.
3. Optional: fill in `YOUR_NICKNAME` and `HER_NICKNAME` (what the app calls each of you). This file is public, so use nicknames rather than full names if you prefer.
4. Click **Commit changes**. Wait a minute.

---

## Step 5: Try it yourself first

1. Open your link on your phone. Tap **Sign in with Google** and pick **your** account.
2. Google will say **"Google hasn't verified this app."** That's normal for a private app. Tap **Advanced → Go to Hearth (unsafe)**, then **Continue/Allow**.
3. You should see a random memory, the two clocks, and the **Thinking of you** button.
4. Add it to your home screen:
   - **iPhone:** open the link in **Safari** → **Share** → **Add to Home Screen**.
   - **Android:** Chrome menu **⋮** → **Install app** (or **Add to Home screen**).
5. Test a "Thinking of you" tap and an **Add a memory** upload.
6. **Test her side too:** in a private/incognito window, open the link and sign in with **her Hearth account**. Check that you see the memories, tap "Thinking of you," then go back to your own phone and check it says she thought of you. Sign out of her account afterwards (menu **⋯ → Sign out**).

---

## Step 6: On her birthday

Send her the link, her Hearth account's address and password, and tell her:

1. Open the link in **Chrome** and sign in with the Hearth account (not her usual Google account).
2. Google will warn that the app isn't verified. Tap **Advanced → Go to Hearth**. It's private, made just for her.
3. Install it: Chrome menu **⋮ → Install app**. Hearth then lives in her app drawer with its own icon.
4. Once she's in, she should **change the password** and add her own recovery phone or email (Google Account → Security), so the account is truly hers.

---

## Good to know

- **"Thinking of you"** taps don't send a notification. The other person sees "… thought of you 2 hours ago" next time they open Hearth.
- **Signing in again:** Google's pass lasts an hour. After that, opening Hearth quietly renews it; she may see a quick flash of Google's page.
- **If it starts asking her to approve the app again every week**, go to Google Auth Platform → **Audience** → **Publish app** (it stays private: only people with access to your folder see anything).
- **iPhone photos:** if one shows "can't be shown here," it's usually a HEIC file. In iPhone Settings → Camera → Formats, choose **Most Compatible** for future photos, or upload a JPG copy.
- **Removing something:** delete it from the Drive folder. It disappears from Hearth on the next open.
- **Storage:** everything counts against your Google storage (15 GB free). Her uploads count against hers.
- **If you see "Can't find the Hearth folder":** the signed-in account can't see the folder. Check the share in step 1.4, or use the menu (**⋯**) → **Use another Google account**.
- **Privacy:** anyone who finds the link only sees a sign-in button. Only the two test users can sign in, and only people the folder is shared with can see what's in it.
