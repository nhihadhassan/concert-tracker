// Deployment identity for Concert Tracker.
//
// Copy to `config.js` (git-ignored) and fill in for your own deployment.
// None of this is a security boundary: Supabase Row Level Security decides who
// can actually read or write data. These values only drive the client-side
// convenience gate on the login form and the "who added this" labels.
//
// Omit the file entirely and the app still works -- the login form simply
// accepts any address and lets RLS reject unauthorised accounts.
window.APP_CONFIG = {
  ownerEmail:   'owner@example.com',
  partnerEmail: 'partner@example.com',
  ownerName:    'Owner',
  partnerName:  'Partner',
  // Gate on the local-backup screen. Leave empty to disable the prompt.
  backupPin:    '',
};
