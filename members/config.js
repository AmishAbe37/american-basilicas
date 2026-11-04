/* Member accounts — connection settings.
   Fill these in from Supabase: Project Settings → API ("Project URL" and the "anon public" key).
   The anon key is meant to be public; the database's security rules decide what it can do.
   While these are blank, the site works exactly as before and every member feature stays hidden.
   subscribeUrl is where "Subscribe" buttons for the members' gallery go (your Buy Me a Coffee membership page). */
window.AB_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  subscribeUrl: "https://buymeacoffee.com/americanbasilicas/membership"
};
