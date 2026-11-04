# Sunday setup walkthrough (Nov 1, 2026)

Saved Oct 29 at Abraham's request. This is the script for switching the member features on, one site at a time.
`SETUP.md` has the same steps as a reference; this file breaks them into the order to do them in.

## How the walkthrough runs (Abraham's instructions)

1. The first time he opens the session on Sunday, show the **numbered list of sites** (below) and wait.
2. When he acknowledges it, give the **first site** and its **numbered to-do list**, and wait.
3. When he acknowledges that list, give the **step-by-step for to-do 1 only**.
4. When he says it's complete, give the step-by-step for the next to-do. Repeat until the site's to-dos are done.
5. Then give the next site and its to-do list, and continue the same way until every site is done.

One to-do per message. If something goes wrong, help fix it before moving on.

Values to keep in a password manager as he goes (secret ones go straight into Supabase, never into the chat):
Supabase database password · Project URL · publishable key · Resend API key (secret) · Google client ID and secret (secret) ·
Shopify client ID and secret (secret) · Buy Me a Coffee webhook secret (secret).
The Project URL and publishable key are public by design and can be pasted into the chat.

---

## The sites

1. **Supabase** (supabase.com): the database, sign-in and server functions. About 45 minutes.
2. **Resend** (resend.com) **+ the domain's DNS provider**: sends the sign-in emails. About 20 minutes, plus waiting for DNS.
3. **Google Cloud** (console.cloud.google.com): the "Continue with Google" button. About 20 minutes.
4. **Shopify** (dev.shopify.com): order history on the account page. About 15 minutes.
5. **Buy Me a Coffee** (buymeacoffee.com): paid gallery subscriptions. About 20 minutes.
6. **GitHub** (github.com): switch the site on, then test everything. About 30 minutes. **This is the step that makes the features live.**

Have ready: a computer (not a phone), and the logins for GitHub (AmishAbe37), the americanbasilicas@gmail.com Google account,
the Shopify store owner account, Buy Me a Coffee, and wherever americanbasilicas.org's DNS is managed (the company the domain
was bought from, or Cloudflare; it's where the GitHub Pages records were set up).

---

## Site 1 — Supabase

To-dos:
1. Create your account and the project
2. Load the database (two SQL files)
3. Set the site address and the email sign-in options
4. Replace the two sign-in email templates
5. Deploy the `account` function
6. Deploy the `bmc-webhook` function
7. Copy the two connection values for the site

### 1.1 Create your account and the project
1. Go to **supabase.com** and click **Start your project**. "Continue with GitHub" is quickest.
2. If it asks you to create an organization: name it **American Basilicas**, type **Personal**, plan **Free**.
3. Click **New project**:
   - **Name:** `american-basilicas`
   - **Database password:** click **Generate a password**, then copy it into your password manager. (You won't need it day to day, but you can't see it again.)
   - **Region:** **East US (Ohio)** is closest to St. Louis; North Virginia is fine too.
   - Leave the other options as they are.
4. Click **Create new project** and wait a minute or two until the project dashboard finishes setting up.

### 1.2 Load the database
1. In a second tab, open the schema file:
   https://github.com/AmishAbe37/american-basilicas/blob/member-accounts/supabase/schema.sql
   Click the **Copy raw file** button (two overlapping squares, top right of the file).
2. In Supabase, click **SQL Editor** in the left sidebar, then **New query** (the **+** button).
3. Paste, then click **Run** (or Ctrl+Enter / Cmd+Enter).
   - If a box warns about a "destructive operation", click **Run this query**. The file only drops its own rules so it can recreate them.
   - You should see **Success. No rows returned.**
4. Open a new query the same way. Copy and run the basilica list:
   https://github.com/AmishAbe37/american-basilicas/blob/member-accounts/supabase/seed_basilicas.sql
5. Check: **Table Editor → basilicas** shows **94** rows, and **Storage** shows a bucket called **member-photos**.
   If either run shows a red error, copy the message into the chat.

### 1.3 Set the site address and the email sign-in options
1. **Authentication → URL Configuration** (under Configuration):
   - **Site URL:** `https://americanbasilicas.org` → **Save**.
   - **Redirect URLs → Add URL:** `https://americanbasilicas.org/**`, then add `https://www.americanbasilicas.org/**` → **Save**.
2. **Authentication → Sign In / Providers**:
   - Under **User Signups**, make sure **Allow new users to sign up** and **Confirm email** are on.
   - Open **Email** in the provider list: make sure it's enabled and **Email OTP Length** is **6**. Save if you changed anything.

### 1.4 Replace the two sign-in email templates
1. **Authentication → Email** (under Notifications) → **Templates** tab → **Magic Link**.
2. Replace the subject and the message body (switch the body to **Source** if there's a toggle) with the Magic Link template below → **Save changes**.
3. Choose **Confirm signup** and do the same with the welcome template below → **Save changes**.

Magic Link · Subject: `Your American Basilicas sign-in link`
```html
<h2>Sign in to American Basilicas</h2>
<p><a href="{{ .ConfirmationURL }}">Sign in to your account</a></p>
<p>Or enter this code on the sign-in page: <strong style="font-size:20px;letter-spacing:3px">{{ .Token }}</strong></p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

Confirm signup · Subject: `Welcome to American Basilicas`
```html
<h2>Welcome to American Basilicas</h2>
<p><a href="{{ .ConfirmationURL }}">Confirm your email and sign in</a></p>
<p>Or enter this code on the sign-in page: <strong style="font-size:20px;letter-spacing:3px">{{ .Token }}</strong></p>
<p>Your account includes your own edition of the basilica map, where you can check off the basilicas you've visited and keep your photos with each visit. That part is always free.</p>
<p><strong>The members' gallery is included free for your first three months.</strong> It holds every member's photos and reviews, basilica by basilica. After three months, the gallery is for subscribers.</p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

### 1.5 Deploy the `account` function
1. **Edge Functions → Functions → Deploy a new function → Via Editor**.
2. Delete the sample code in the editor. Copy and paste all of:
   https://github.com/AmishAbe37/american-basilicas/blob/member-accounts/supabase/functions/account/index.ts
3. Set the function name to exactly `account` → **Deploy function**. Wait for the success message.
4. Leave its JWT setting (**Verify JWT with legacy secret**, on the function's **Details** tab) **on**.
   The Shopify secrets for this function come in Site 4.

### 1.6 Deploy the `bmc-webhook` function
1. **Edge Functions → Deploy a new function → Via Editor** again.
2. Replace the sample code with all of:
   https://github.com/AmishAbe37/american-basilicas/blob/member-accounts/supabase/functions/bmc-webhook/index.ts
3. Name it exactly `bmc-webhook` → **Deploy function**.
4. Open the function → **Details** tab → turn **off** **Verify JWT with legacy secret** (older screens call it **Enforce JWT Verification**) → save.
   Buy Me a Coffee can't sign in to Supabase; the function checks the webhook's signature instead.
   Supabase quirk: editing or redeploying this function in the dashboard turns the switch back on. Turn it off again after any redeploy.
5. Copy the function's URL from the Details tab (`https://<project-ref>.supabase.co/functions/v1/bmc-webhook`) for Site 5.

### 1.7 Copy the two connection values for the site
1. Click **Connect** at the top of the project dashboard (or **Project Settings → Data API**) and copy the **Project URL** (`https://<project-ref>.supabase.co`).
2. **Project Settings → API Keys** → copy the **Publishable key** (`sb_publishable_…`). If only legacy keys are shown, copy the **anon public** key.
3. Paste both into the chat. They're public by design; they go into `members/config.js` in Site 6.
4. Don't copy the **secret** or **service_role** key anywhere; nothing needs it. Don't switch off the legacy API keys either; the functions use them.

---

## Site 2 — Resend + the domain's DNS

To-dos:
1. Create the Resend account
2. Add americanbasilicas.org as a sending domain
3. Add Resend's DNS records and verify them
4. Create the API key (used as the SMTP password)
5. Connect Resend to Supabase

### 2.1 Create the Resend account
1. Go to **resend.com** → **Get started**. Sign up with americanbasilicas@gmail.com (or GitHub).
2. Confirm your email if asked.

### 2.2 Add americanbasilicas.org as a sending domain
1. **Domains → Add domain**.
2. **Name:** `americanbasilicas.org` · **Region:** North Virginia (us-east-1) → **Add**.
3. Resend shows a list of DNS records, usually an **MX** and a **TXT** for `send`, a **TXT** for `resend._domainkey`, and an optional **TXT** for `_dmarc`. Keep this page open.
   If Resend offers to connect to your DNS provider automatically, you can use that and skip most of 2.3.

### 2.3 Add Resend's DNS records and verify them
1. In another tab, sign in wherever americanbasilicas.org's DNS is managed and open its DNS records.
2. For each record Resend lists, click **Add record** and copy across:
   - **Type** (MX or TXT)
   - **Name / Host**: most providers want only the part before the domain, such as `send` or `resend._domainkey`
   - **Value**: use Resend's copy button
   - **Priority** for the MX record: `10`
   - **TTL**: leave the default
3. **Don't change or delete existing records.** The A/CNAME records keep the site on GitHub Pages. Resend's records sit on the `send` subdomain, so they don't clash with anything.
4. If there's no `_dmarc` record yet, add TXT `_dmarc` with value `v=DMARC1; p=none;`.
5. Back in Resend, click **Verify DNS records**. This can take minutes or a few hours. While it waits, do 2.4 and 2.5, then move on to Site 3 and check back later.

### 2.4 Create the API key
1. **API Keys → Create API key**.
2. **Name:** `Supabase SMTP` · **Permission:** Sending access · **Domain:** americanbasilicas.org → **Add**.
3. Copy the key (starts with `re_`). It's shown only once. Keep it in the password manager; don't paste it into the chat.

### 2.5 Connect Resend to Supabase
1. Supabase → **Authentication → Email → SMTP Settings** → turn on **Enable custom SMTP**.
2. Fill in:
   - **Sender email:** `no-reply@americanbasilicas.org`
   - **Sender name:** `American Basilicas`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** the API key from 2.4
   - Leave the minimum interval at its default.
3. **Save**. The real test is the first sign-in in Site 6.

---

## Site 3 — Google Cloud

To-dos:
1. Create the Google Cloud project
2. Set up the sign-in screen Google shows members
3. Create the sign-in client
4. Turn on Google in Supabase

### 3.1 Create the Google Cloud project
1. Go to **console.cloud.google.com** signed in as americanbasilicas@gmail.com. Accept the terms if it's your first visit.
2. Click the project picker in the top bar → **New project** → **Name:** `American Basilicas` (no organization) → **Create**.
3. Make sure the new project is selected in the top bar.

### 3.2 Set up the sign-in screen
1. Menu (☰) → **APIs & Services → OAuth consent screen**. This opens **Google Auth Platform**; click **Get started**.
2. Fill in:
   - **App name:** `American Basilicas`
   - **User support email:** americanbasilicas@gmail.com
   - **Audience:** External
   - **Contact email:** americanbasilicas@gmail.com
   - Agree to the policy → **Create**.
3. **Branding** (left menu):
   - **Application home page:** `https://americanbasilicas.org`
   - **Authorized domains:** add `americanbasilicas.org` and `<project-ref>.supabase.co` (your Supabase project's address)
   - Don't add a logo for now; a logo makes Google review the branding first, which takes days.
   - **Save**.
4. **Data Access → Add or remove scopes**: tick `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` → **Update** → **Save**.
5. **Audience → Publish app → Confirm**. The status changes to **In production**. These basic scopes need no Google review.

### 3.3 Create the sign-in client
1. First get the callback address: Supabase → **Authentication → Sign In / Providers → Google**, and copy **Callback URL (for OAuth)**. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Google → **Clients → Create client**:
   - **Application type:** Web application
   - **Name:** `American Basilicas website`
   - **Authorized JavaScript origins:** `https://americanbasilicas.org` and `https://www.americanbasilicas.org`
   - **Authorized redirect URIs:** the callback address from step 1
3. **Create**. Copy the **Client ID** and **Client secret** right away; Google may not show the secret again. Download the JSON as a backup.

### 3.4 Turn on Google in Supabase
1. Supabase → **Authentication → Sign In / Providers → Google** → switch on **Enable Sign in with Google**.
2. Paste the **Client ID** (into Client IDs) and the **Client Secret**. Leave the other options off.
3. **Save**.

---

## Site 4 — Shopify

To-dos:
1. Create the app in the Dev Dashboard
2. Give it order access and release a version
3. Install it on the store
4. Copy its Client ID and secret into Supabase

### 4.1 Create the app
1. Go to **dev.shopify.com** and sign in with the store owner account. (From the store admin you can also go to **Settings → Apps → Develop apps**, which points to the Dev Dashboard.)
2. **Apps → Create app** → **Start from Dev Dashboard** → **Name:** `American Basilicas members` → **Create**.

### 4.2 Give it order access and release a version
1. Open the app's **Versions** (or **Configuration**) and create a new version.
2. Fill in:
   - **App URL**, if it asks for one: `https://americanbasilicas.org`
   - **Embed app in Shopify admin**: untick, if it's shown
   - **Scopes:** `read_orders`
3. Leave `read_all_orders` off for now. Without it, members see their last 60 days of orders; it can be requested later.
4. **Release** the version.
   No separate "protected customer data" request is needed: an app installed only on your own store has it by default.

### 4.3 Install it on the store
1. On the app's overview page, click **Install app** → choose the American Basilicas store → **Install**.
2. If you ever change the scopes, release a new version and install again so the change takes effect.

### 4.4 Copy its Client ID and secret into Supabase
1. App → **Settings** → copy the **Client ID** and **Client secret**.
2. Supabase → **Edge Functions → Secrets** and add three secrets:
   - `SHOPIFY_STORE` = `americanbasilicas.myshopify.com`
   - `SHOPIFY_CLIENT_ID` = the Client ID
   - `SHOPIFY_CLIENT_SECRET` = the Client secret
3. **Save**.

---

## Site 5 — Buy Me a Coffee

To-dos:
1. Create the gallery membership level
2. Confirm the membership page address
3. Add the webhook and copy its secret
4. Add the secrets in Supabase
5. Send a test and check it arrived
6. Remove the test settings

### 5.1 Create the gallery membership level
1. Sign in at **buymeacoffee.com** → **Memberships** (left menu). Switch memberships on if asked.
2. **Add level:**
   - **Name:** e.g. `Gallery member`
   - **Price:** your choice of monthly price, plus a yearly price if you want one
   - **Description:** "Includes the members' gallery on americanbasilicas.org: every member's photos and reviews of the U.S. minor basilicas. Subscribe with the same email you use to sign in at americanbasilicas.org."
   - **Welcome message:** "Thank you! Your gallery access shows up at americanbasilicas.org within a minute. Sign in there with this same email."
3. **Save / Publish**.

### 5.2 Confirm the membership page address
1. Open your public membership page (Memberships → **View page**) and copy its address from the browser.
2. If it's not `https://buymeacoffee.com/americanbasilicas/membership`, paste it into the chat; it goes into `members/config.js` in Site 6.

### 5.3 Add the webhook and copy its secret
1. **Integrations → Webhooks → New webhook** (some screens show this under Settings → Webhooks).
2. Fill in:
   - **URL:** `https://<project-ref>.supabase.co/functions/v1/bmc-webhook` (from 1.6)
   - **Events:** tick every membership event (started, updated or level changed, cancelled, paused). Leave the others unticked.
3. **Save**, then copy the webhook's **signing secret**.

### 5.4 Add the secrets in Supabase
1. Supabase → **Edge Functions → Secrets** and add:
   - `BMC_WEBHOOK_SECRET` = the signing secret
   - `BMC_ACCEPT_TEST` = `true` (temporary, for the test)
2. Only if you created several levels and just some include the gallery, also add `BMC_GALLERY_LEVELS` = those level names, separated by commas.
3. **Save**.

### 5.5 Send a test and check it arrived
1. In Buy Me a Coffee, open the webhook → **Send test** (choose a membership event if asked).
2. Supabase → **Table Editor → subscriptions** (refresh): a row should appear with the test email.
3. Open the row, copy the **last_event** cell, and paste it into the chat. It's test data, and it lets Claude confirm Buy Me a Coffee's field names.
4. If no row appears, check **Edge Functions → bmc-webhook → Logs**:
   - **401** means the secret doesn't match, or JWT verification is still on (see 1.6).
   - Anything else: paste the log line into the chat.

### 5.6 Remove the test settings
1. **Edge Functions → Secrets** → delete `BMC_ACCEPT_TEST`.
2. **SQL Editor** → run this, putting the test email in:
   ```sql
   delete from public.subscriptions where email = '<test email>';
   ```

---

## Site 6 — GitHub: switch the site on and test

To-dos:
1. Put the connection values in `members/config.js`
2. Merge the pull request (this makes the features live)
3. Sign in on the live site
4. Make yourself the reviewer
5. Run the test checklist
6. Decide when to move Supabase to Pro

### 6.1 Put the connection values in `members/config.js`
Either:
- **Have Claude do it:** paste the Project URL and publishable key (and the membership page address, if it differs) and say go. Claude commits them to the `member-accounts` branch.
- **Or do it yourself:**
  1. Open https://github.com/AmishAbe37/american-basilicas/blob/member-accounts/members/config.js → **Edit** (pencil).
  2. Put the URL between the first pair of quotes and the key between the second.
  3. **Commit changes** → commit directly to the `member-accounts` branch.

### 6.2 Merge the pull request
1. Open https://github.com/AmishAbe37/american-basilicas/pull/1 → **Ready for review**.
2. **Merge pull request → Confirm merge**.
3. **Actions** tab: wait for **pages build and deployment** to show a green check (1–3 minutes).
   From here, the sign-in link and member features are live for every visitor.

### 6.3 Sign in on the live site
1. Open **americanbasilicas.org/account.html** and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).
2. Enter americanbasilicas@gmail.com → **Email me a sign-in link**.
3. The "Welcome to American Basilicas" email should arrive from no-reply@americanbasilicas.org. Click the link, or type the code.
4. The welcome message should appear, showing your free-until date.
5. If there's no email after 2 minutes, check spam, then **Resend → Emails** and **Supabase → Authentication → Logs**, and paste anything red into the chat.

### 6.4 Make yourself the reviewer
1. Supabase → **SQL Editor** → run:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'americanbasilicas@gmail.com';
   ```
2. Reload the site. **Review queue** now appears in the member menu.

### 6.5 Run the test checklist
1. **Google sign-in:** in a private/incognito window, open account.html → **Continue with Google** with a different Google account. You should come back signed in, with the welcome message.
2. **Visit, photo and review:** as yourself, tick a basilica you've visited → add a photo → the review prompt appears → post a short review.
3. **Approval:** Review queue → **Photos** → Approve; **Reviews** → Approve.
4. **Gallery:** in the private window (second account) → **Members' gallery** → tap Missouri → the basilica. You should see your photo and review; like each one, and try **Most liked / Latest**.
5. **Orders:** sign in with an email that has a past Shopify order; the **Orders** panel should list it.
   - If it says order history isn't available: Supabase → Edge Functions → **account** → Details → turn off **Verify JWT with legacy secret** (the function checks the sign-in itself) and try again.
   - If it still fails, paste the account function's **Logs** into the chat.
6. **Phone:** open the map on your phone, sign in, and look at the gallery.

### 6.6 Decide when to move Supabase to Pro
1. Free projects pause after a week without activity. Before announcing paid subscriptions, switch to Pro ($25 a month):
   Supabase → **Organization settings → Billing → Change plan → Pro**. Keep the spend cap on.
2. Done. Ask Claude for anything that didn't behave as described.
