// Paste your Supabase project values here (Supabase -> Project Settings -> API).
// The anon key is meant to be public: the database rules in supabase/schema.sql
// decide who can read and write, so it is safe to commit this file.
window.FDE_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
  partnerName: "Bert",
  // Set to true after adding ANTHROPIC_API_KEY to Vercel (see README, "AI-generated quizzes").
  aiQuiz: false,
  // Public key for push notifications (safe to commit). Its private half goes in Vercel only.
  vapidPublicKey: "BNSS253wgUs2DFPmWR39smvkq7GA9JCVfYRTRmdh5HJ3JLt-417JwDH9C59t1RaINI6Q1iqwE1QTSSFUtdGGsbo"
};
