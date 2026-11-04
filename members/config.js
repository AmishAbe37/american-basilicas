/* Member accounts — connection settings.
   From Supabase: the Project URL and the publishable key (Project Settings → API Keys).
   The publishable key is meant to be public; the database's security rules decide what it can do.
   While these are blank, the site works exactly as before and every member feature stays hidden.
   subscribeUrl is where "Subscribe" buttons for the members' gallery go (your Buy Me a Coffee membership page).
   appleSignIn shows the "Continue with Apple" button; leave it false until Apple is set up. */
window.AB_CONFIG = {
  supabaseUrl: "https://doivutqhoggdacwbynsj.supabase.co",
  supabaseAnonKey: "sb_publishable_pMFfNsomIgvA5dG3Y7g9pg_8Imr1gEn",
  subscribeUrl: "https://buymeacoffee.com/americanbasilicas/membership",
  appleSignIn: false   // set to true once Sign in with Apple is switched on in Supabase (walkthrough Site 3b)
};
