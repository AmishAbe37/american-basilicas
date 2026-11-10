/* Member accounts — connection settings.
   From Supabase: the Project URL and the publishable key (Project Settings → API Keys).
   The publishable key is meant to be public; the database's security rules decide what it can do.
   While these are blank, the site works exactly as before and every member feature stays hidden.
   subscribeUrl is where "Subscribe" buttons for the members' gallery go (your Buy Me a Coffee membership page).
   googleClientId turns on Google's own sign-in button, so Google's sign-in screen names americanbasilicas.org
   instead of the Supabase project address. It's the web client's Client ID from Google Cloud: Google Auth Platform
   → Clients → "American Basilicas website" (it ends in .apps.googleusercontent.com, and it's meant to be public).
   Leave it blank to keep the plain "Continue with Google" button that signs in through Supabase. */
window.AB_CONFIG = {
  supabaseUrl: "https://doivutqhoggdacwbynsj.supabase.co",
  supabaseAnonKey: "sb_publishable_pMFfNsomIgvA5dG3Y7g9pg_8Imr1gEn",
  subscribeUrl: "https://buymeacoffee.com/americanbasilicas/membership",
  googleClientId: ""
};
