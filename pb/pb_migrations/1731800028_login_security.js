/// <reference path="../pb_data/types.d.ts" />

// Login hardening:
//  - sign in with email OR username
//  - stronger new passwords (10+ chars; existing passwords keep working)
//  - password-reset emails link to the app's own "set a new password" page ({APP_URL} = the app's address,
//    set under Settings → Application, see docs/SELF_HOSTING.md)
//  - rate limits on login / signup / password reset, keyed on the real client IP behind Cloudflare or a proxy
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.passwordAuth.identityFields = ["email", "username"]
  const pw = users.fields.getByName("password")
  pw.min = 10
  pw.max = 71 // bcrypt only uses the first 72 bytes; PocketBase allows at most 71
  users.passwordResetToken.duration = 1800 // 30 minutes
  users.resetPasswordTemplate.subject = "Reset your {APP_NAME} password"
  users.resetPasswordTemplate.body =
    "<p>Hi,</p>\n<p>Someone (hopefully you) asked to reset your {APP_NAME} password. Tap the button below to choose a new one. The link works for 30 minutes.</p>\n" +
    "<p><a class=\"btn\" href=\"{APP_URL}/#/reset-password/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Choose a new password</a></p>\n" +
    "<p><i>If you didn't ask for this, ignore this email. Your password won't change.</i></p>\n<p>The {APP_NAME} team</p>"
  app.save(users)

  const s = app.settings()
  if (!s.meta.appName || s.meta.appName === "Acme") s.meta.appName = "Better Lift"
  // Cloudflare Tunnel / reverse proxy: use the visitor's IP (not the tunnel's) so limits apply per person.
  s.trustedProxy.headers = ["CF-Connecting-IP", "X-Forwarded-For"]
  s.trustedProxy.useLeftmostIP = false
  s.rateLimits.enabled = true
  s.rateLimits.rules = [
    { label: "POST /api/collections/users/auth-with-password", audience: "", duration: 60, maxRequests: 10 },
    { label: "POST /api/collections/_superusers/auth-with-password", audience: "", duration: 60, maxRequests: 5 },
    { label: "POST /api/betterlift/request-password-reset", audience: "", duration: 600, maxRequests: 5 },
    { label: "POST /api/collections/users/request-password-reset", audience: "", duration: 600, maxRequests: 5 },
    { label: "POST /api/collections/users/confirm-password-reset", audience: "", duration: 600, maxRequests: 10 },
    { label: "POST /api/collections/users/records", audience: "@guest", duration: 3600, maxRequests: 20 },
  ]
  app.save(s)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.passwordAuth.identityFields = ["email"]
  const pw = users.fields.getByName("password")
  pw.min = 8
  pw.max = 0
  app.save(users)
  const s = app.settings()
  s.rateLimits.enabled = false
  s.trustedProxy.headers = []
  app.save(s)
})
