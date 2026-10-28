# Member accounts: setup

The member features on americanbasilicas.org (sign-in, personal map, visits and photos, members' gallery, order history) run on a Supabase project. Until `members/config.js` is filled in, the site behaves exactly as before and none of these features appear.

Set things up in this order. Steps 1–5 are enough to switch accounts on. Order history (step 6) can come later.

## 1. Create the Supabase project

1. Sign up at supabase.com and create a project. Pick a US region and save the database password somewhere safe.
2. Open **SQL Editor → New query**. Paste in all of `supabase/schema.sql` and click **Run**.
3. Open another new query, paste in `supabase/seed_basilicas.sql`, and **Run**. This loads all 94 basilicas.

## 2. Set up email sign-in

Supabase's built-in email service only delivers to your own team's addresses, and only about 2 emails an hour. Members can't sign in by email until you connect a mail service.

1. Create a free account with a mail service. Resend is the simplest: its free plan covers 3,000 emails a month. Add `americanbasilicas.org` as a sending domain, then add the DNS records Resend shows you wherever the domain's DNS is managed.
2. In Supabase, go to **Authentication → Emails → SMTP Settings**, turn on custom SMTP, and enter the host, port, username and password from Resend. Use `no-reply@americanbasilicas.org` as the sender and "American Basilicas" as the sender name.
3. Go to **Authentication → Emails → Templates → Magic Link** and replace the template with the one below. It includes the 6-digit code, so members who open the email on a different device can type the code instead of clicking the link.

   Subject: `Your American Basilicas sign-in link`

   ```html
   <h2>Sign in to American Basilicas</h2>
   <p><a href="{{ .ConfirmationURL }}">Sign in to your account</a></p>
   <p>Or enter this code on the sign-in page: <strong style="font-size:20px;letter-spacing:3px">{{ .Token }}</strong></p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```

   Make the same change to the **Confirm signup** template. New members get that email the first time they sign in.
4. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to `https://americanbasilicas.org`.
   - Under **Redirect URLs**, add `https://americanbasilicas.org/**`.

## 3. Set up Google sign-in

1. In Google Cloud Console (console.cloud.google.com), create a project called "American Basilicas".
2. Go to **APIs & Services → OAuth consent screen**:
   - Set the app name and the support email (americanbasilicas@gmail.com).
   - Add `americanbasilicas.org` as an authorised domain.
   - Choose the scopes `email`, `profile` and `openid`.
   - Publish the app.
3. Go to **Credentials → Create credentials → OAuth client ID** and choose **Web application**:
   - Under **Authorised JavaScript origins**, add `https://americanbasilicas.org`.
   - Under **Authorised redirect URIs**, add `https://<your-project>.supabase.co/auth/v1/callback`. You can copy the exact address from Supabase under **Authentication → Providers → Google**.
4. Paste the Client ID and Client secret into **Authentication → Providers → Google** in Supabase and switch the provider on.

## 4. Switch the site on

1. In Supabase, open **Project Settings → API Keys**. Copy the **Project URL** and the **anon / publishable** key. This key is designed to be public.
2. Paste both into `members/config.js` and publish the site.

```js
window.AB_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJ...  or  sb_publishable_..."
};
```

## 5. Make yourself the photo reviewer

1. Sign in on the site once, at americanbasilicas.org/account.html.
2. In Supabase, open the **SQL Editor** and run the line below, using the email address you signed in with:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'americanbasilicas@gmail.com';
```

A **Review photos** link now appears in the member pages' menu. New photos wait there until you choose one of three actions:
- **Approve** puts the photo in the members' gallery.
- **Not shared** keeps it in the member's own visit only.
- **Delete** removes it.

## 6. Order history (optional; can come later)

Orders are matched to members by email address. A member sees only orders placed with the same email they sign in with, and only after that email has been verified.

1. Open the Shopify **Dev Dashboard** at dev.shopify.com and sign in with your store account.
2. Create an app called "American Basilicas members".
3. In the app's version settings, give it the `read_orders` scope. Add `read_all_orders` too if members should see orders older than 60 days. Shopify may ask why you need that scope.
4. Release the version and install the app on the store.
5. Copy the **Client ID** and **Client secret** from App settings.
6. In Supabase, go to **Edge Functions → Deploy a new function → Via editor**. Name the function `account`, paste in all of `supabase/functions/account/index.ts`, and deploy.
7. Go to **Edge Functions → Secrets** and add these:

   | Name | Value |
   |---|---|
   | `SHOPIFY_STORE` | `americanbasilicas.myshopify.com` |
   | `SHOPIFY_CLIENT_ID` | from step 5 |
   | `SHOPIFY_CLIENT_SECRET` | from step 5 |

The same function also handles **Delete my account**, so deploy it even if you skip the Shopify secrets for now. Until those secrets are set, the Orders panel says order history isn't available.

## Costs and limits

- **Supabase Free:** 500 MB database, 1 GB of photo storage (about 2,300 member photos at the sizes the site uploads), 5 GB of downloads a month, and 50,000 monthly active members.
- **Pausing:** free projects pause after a week with no activity. Once members rely on the site, switch to **Pro** ($25 a month: 100 GB of storage, no pausing).
- **Resend Free:** 3,000 sign-in emails a month, 100 a day.

## How the pieces fit

| File | What it does |
|---|---|
| `members/config.js` | The two connection settings. Blank means member features are off. |
| `members/loader.js` | On the map page, loads the member scripts only once accounts are switched on. |
| `members/core.js` | Talks to Supabase: sign-in, visits, photo upload (resized, location data stripped), gallery, orders. |
| `members/map.js`, `map.css` | The personal map: visited basilicas in full colour, "Your visit" in each basilica's popup, and links like `index.html#b=<basilica>`. |
| `members/visit.js` | The visit editor (check-off, date, private note, photos), used in the popup and on the account page. |
| `account.html` | My pilgrimage: progress, checklist of all 94, visit editor, basilicas near you, orders, account settings. |
| `gallery.html` | The members-only gallery of approved photos. |
| `review.html` | Your approval queue. |
| `supabase/schema.sql` | Tables and security rules. Members can only touch their own data, and only approved photos are visible to other signed-in members. |
| `supabase/functions/account/` | The server function for order history and account deletion. |
| `supabase/tests/` | Security-rule tests (`rls_test.py`, run against a local Postgres with `stub.sql`). |
