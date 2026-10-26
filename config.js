// Paste your Supabase project values here (Supabase -> Project Settings -> API).
// The anon key is meant to be public: the database rules in supabase/schema.sql
// decide who can read and write, so it is safe to commit this file.
window.FDE_CONFIG = {
  supabaseUrl: "https://rhobcuuepctklqqejgsl.supabase.co",
  supabaseAnonKey: "sb_publishable_i_Ksbfwo0NItvQs9MDFDbQ_t_4NA8Jw",
  partnerName: "Bert",
  // Set to true after adding ANTHROPIC_API_KEY to Vercel (see README, "AI-generated quizzes").
  aiQuiz: false,
  // The website's address. The Android app calls its /api routes and sends email links there.
  appUrl: "https://magayonquest.vercel.app",
  // Set to true after adding android/app/google-services.json (see README, "Android app").
  androidPush: true,
  // Public key for push notifications (safe to commit). Its private half goes in Vercel only.
  vapidPublicKey: "BKvLc-2w06r3dMt28FqkhpC6FtJw7rX5lcT4SrM5s0IsBSap-jTb9XozeAs6iECrGFsPg0nG6VBI8j97G-3Agu0"
};
