/// <reference path="../pb_data/types.d.ts" />

// Email verification:
//  - new accounts get a verification email (sent from pb_hooks once SMTP is set up) linking to the app's own
//    /verify page ({APP_URL} = Settings → Application → URL)
//  - accounts that existed before this migration count as verified, so nobody gets nagged retroactively
//  - unverified accounts can still use the app; the app shows a "verify your email" banner with a resend button
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationToken.duration = 259200 // 3 days
  users.verificationTemplate.subject = "Verify your {APP_NAME} email"
  users.verificationTemplate.body =
    "<p>Hi,</p>\n<p>Thanks for joining {APP_NAME}! Tap the button below to confirm this is your email address. The link works for 3 days.</p>\n" +
    "<p><a class=\"btn\" href=\"{APP_URL}/#/verify/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Verify my email</a></p>\n" +
    "<p><i>If you didn't make a {APP_NAME} account, ignore this email.</i></p>\n<p>The {APP_NAME} team</p>"
  app.save(users)

  app.db().newQuery("UPDATE users SET verified = TRUE WHERE verified = FALSE").execute()

  const s = app.settings()
  const rule = { label: "POST /api/collections/users/request-verification", audience: "", duration: 600, maxRequests: 5 }
  if (!s.rateLimits.rules.some((r) => r.label === rule.label)) s.rateLimits.rules = [...s.rateLimits.rules, rule]
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "POST /api/collections/users/request-verification")
  app.save(s)
})
