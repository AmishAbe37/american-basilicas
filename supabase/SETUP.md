# Member accounts: setup

The member features on americanbasilicas.org run on a Supabase project:

- sign-in
- the personal map
- visits, photos and reviews
- the members' gallery, with likes
- gallery subscriptions
- order history

Until `members/config.js` is filled in, the site behaves exactly as before and none of these features appear.

Set things up in this order:

- **Steps 1–5** switch accounts on. Every new member gets the gallery free for three months.
- **Step 6** lets people pay for the gallery after their free months.
- **Step 7** adds order history.

Steps 6 and 7 can come later. Until step 6 is done, you can still give people gallery access by hand from the **Review queue → Memberships** page.

## 1. Create the Supabase project

1. Sign up at supabase.com and create a project. Pick a US region and save the database password somewhere safe.
2. Open **SQL Editor → New query**. Paste in all of `supabase/schema.sql` and click **Run**.
3. Open another new query, paste in `supabase/seed_basilicas.sql`, and **Run**. This loads all 94 basilicas.

Both files are safe to run again later, for example after an update to `schema.sql`.

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

4. Open the **Confirm signup** template. New members get this email the first time they sign in, so it also tells them about the free gallery months.

   Subject: `Welcome to American Basilicas`

   ```html
   <h2>Welcome to American Basilicas</h2>
   <p><a href="{{ .ConfirmationURL }}">Confirm your email and sign in</a></p>
   <p>Or enter this code on the sign-in page: <strong style="font-size:20px;letter-spacing:3px">{{ .Token }}</strong></p>
   <p>Your account includes your own edition of the basilica map, where you can check off the basilicas you've visited and keep your photos with each visit. That part is always free.</p>
   <p><strong>The members' gallery is included free for your first three months.</strong> It holds every member's photos and reviews, basilica by basilica. After three months, the gallery is for subscribers.</p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```

5. Go to **Authentication → URL Configuration**:
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

Members who sign in with Google see the same welcome message on the site. Google doesn't send them the Confirm signup email.

## 4. Switch the site on

1. In Supabase, open **Project Settings → API Keys**. Copy the **Project URL** and the **anon / publishable** key. This key is designed to be public.
2. Paste both into `members/config.js` and publish the site.
3. If your Buy Me a Coffee membership page has a different address, change `subscribeUrl` too. Every **Subscribe** button on the site goes to that address.

```js
window.AB_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJ...  or  sb_publishable_...",
  subscribeUrl: "https://buymeacoffee.com/americanbasilicas/membership"
};
```

## 5. Make yourself the reviewer

1. Sign in on the site once, at americanbasilicas.org/account.html.
2. In Supabase, open the **SQL Editor** and run the line below, using the email address you signed in with:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'americanbasilicas@gmail.com';
```

A **Review queue** link now appears in the member pages' menu. It has three tabs:

- **Photos** and **Reviews.** New photos and reviews wait here until you choose one of three actions:
  - **Approve** puts the item in the members' gallery.
  - **Not shared** keeps it with the member only.
  - **Delete** removes it.

  When a member edits a caption or a review, the item comes back to the queue.
- **Memberships.** Give someone gallery access by email: a gift, a parish photographer, or a fix if a payment didn't match. This tab also lists everyone with access, whether they subscribed or you added them.

Administrators always have gallery access.

## 6. Gallery subscriptions with Buy Me a Coffee (can come later)

The members' gallery is free for three months from each member's sign-up. After that, access depends on whether they subscribe:

- **Not subscribed:** members still see the gallery map and how many photos and reviews each basilica has. Photos, reviews and likes stay locked, and the page shows a **Become a subscriber** button.
- **Subscribed:** a Buy Me a Coffee membership opens the gallery again.

Memberships are matched to accounts by email address, so subscribers should use the same email they sign in with. The site tells them this next to every Subscribe button.

1. **Create the membership level.** In Buy Me a Coffee, open **Memberships**, switch them on, and create a level (for example "Gallery member") with a monthly price, a yearly price, or both. In the description, say that it includes the members' gallery on americanbasilicas.org and that subscribers should use the email they sign in with. Then open your public membership page and check its address. If it isn't `https://buymeacoffee.com/americanbasilicas/membership`, change `subscribeUrl` in `members/config.js`.
2. **Deploy the webhook function.** In Supabase, go to **Edge Functions → Deploy a new function → Via editor**, name it `bmc-webhook`, paste in all of `supabase/functions/bmc-webhook/index.ts`, and deploy. Then open the function's details and switch JWT verification off (labelled **Enforce JWT verification** or **Verify JWT**). Buy Me a Coffee can't sign in to Supabase, so the function checks the webhook's signature instead.
   - If you use the Supabase CLI instead, `supabase/config.toml` already sets this. Deploy with `supabase functions deploy bmc-webhook`.
3. **Add the webhook.** In Buy Me a Coffee, go to **Integrations → Webhooks → New webhook**:
   - Set the URL to `https://<your-project>.supabase.co/functions/v1/bmc-webhook`.
   - Tick the membership events: started, updated, cancelled and paused.
   - Save, then copy the webhook's **signing secret**.
4. **Add the secrets.** In Supabase, go to **Edge Functions → Secrets** and add these:

   | Name | Value |
   |---|---|
   | `BMC_WEBHOOK_SECRET` | the signing secret from step 3 |
   | `BMC_ACCEPT_TEST` | `true`. Add this for testing only, and delete it afterwards. |
   | `BMC_GALLERY_LEVELS` | Optional. Your level names, separated by commas, if only some levels include the gallery. Leave it out if every level does. |

5. **Test it.** Use **Send test** on the webhook in Buy Me a Coffee, then check two places:
   - In Supabase, **Table Editor → subscriptions** should show a row for the test email.
   - On the site, the **Review queue → Memberships** tab should list it.

   The full event is saved in the row's `last_event` column. If the row is missing or its dates look wrong, send me that column's contents. I couldn't read Buy Me a Coffee's official payload description from my workspace, so the field names in the function are matched to their public integrations. The first real event confirms them.
6. **Finish.** Delete the `BMC_ACCEPT_TEST` secret and the test row (`delete from public.subscriptions where email = '<test email>';`).

How access is counted:

- A subscription opens the gallery until the end of the period the member has paid for, plus 3 days' grace for renewals.
- Cancelling never cuts short time that's already paid.
- Time you give from the Memberships tab is added on top of whatever they already have.

## 7. Order history (can come later)

Orders are matched to members by email address. A member sees only orders placed with the same email they sign in with, and only after that email has been verified.

1. Open the Shopify **Dev Dashboard** at dev.shopify.com and sign in with your store account.
2. Create an app called "American Basilicas members".
3. In the app's version settings, give it the `read_orders` scope. Add `read_all_orders` too if members should see orders older than 60 days. Shopify may ask why you need that scope.
4. Release the version and install the app on the store.
5. Copy the **Client ID** and **Client secret** from App settings.
6. In Supabase, go to **Edge Functions → Deploy a new function → Via editor**. Name the function `account`, paste in all of `supabase/functions/account/index.ts`, and deploy. Leave JWT verification **on** for this one.
7. Go to **Edge Functions → Secrets** and add these:

   | Name | Value |
   |---|---|
   | `SHOPIFY_STORE` | `americanbasilicas.myshopify.com` |
   | `SHOPIFY_CLIENT_ID` | from step 5 |
   | `SHOPIFY_CLIENT_SECRET` | from step 5 |

The same function also handles **Delete my account**, so deploy it even if you skip the Shopify secrets for now. Until those secrets are set, the Orders panel says order history isn't available.

## Costs and limits

- **Supabase Free:**
  - 500 MB database.
  - 1 GB of photo storage, about 2,300 member photos at the sizes the site uploads.
  - 5 GB of downloads a month. Browsing the gallery counts toward this.
  - 50,000 monthly active members.
- **Supabase pausing:** free projects pause after a week with no activity. Once members rely on the site, and certainly once people are paying for the gallery, switch to **Pro** ($25 a month: 100 GB of storage, no pausing).
- **Resend Free:** 3,000 sign-in emails a month, 100 a day.
- **Buy Me a Coffee:** takes a platform fee plus payment processing on each membership payment. Check their pricing page when you set the price.

## How the pieces fit

| File | What it does |
|---|---|
| `members/config.js` | The connection settings and the Subscribe address. A blank URL and key means member features are off. |
| `members/loader.js` | On the map page, loads the member scripts only once accounts are switched on. |
| `members/core.js` | Talks to Supabase. It handles sign-in, gallery membership, visits, photo upload (resized, location data stripped), photos and reviews by basilica (most liked or latest), likes, moderation and orders. |
| `members/shell.js` | The page header and menu, the sign-in card (with the free-gallery note), the first-sign-in welcome message, membership wording, like buttons and the lightbox. |
| `members/map.js`, `map.css` | The personal map: visited basilicas in full colour, "Your visit" in each basilica's popup, and links like `index.html#b=<basilica>`. |
| `members/visit.js` | The visit editor (check-off, date, private note, photos), plus the member's review. The review prompt appears only once a visit has photos. |
| `members/gallery-map.js` | The gallery map's outlines and marker positions. It's generated from `index.html` by `node tools/build_gallery_map.mjs`; rerun that if the map data changes. |
| `account.html` | My pilgrimage: a menu, progress, the members' gallery panel, a checklist of all 94, the visit editor, basilicas near you, orders and account settings. |
| `gallery.html` | The members' gallery, run from the map. Tap a state, then a basilica, to see its photos and reviews, like them, and sort by most liked or latest. |
| `review.html` | Your review queue: photos, reviews and memberships. |
| `supabase/schema.sql` | Tables and security rules. Members can only touch their own data. Other members' approved photos and reviews, and likes, are only open to members with gallery access (first 3 months, subscribers, admins). |
| `supabase/functions/account/` | The server function for order history and account deletion. |
| `supabase/functions/bmc-webhook/` | Records Buy Me a Coffee memberships. |
| `supabase/tests/` | Security-rule tests (`rls_test.py`, run against a local Postgres with `stub.sql`). Each function folder also has its own `test.ts`. |
