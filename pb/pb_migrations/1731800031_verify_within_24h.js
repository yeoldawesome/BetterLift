/// <reference path="../pb_data/types.d.ts" />

// New accounts must verify their email within 24 hours: the link expires then, and pb_hooks deletes accounts
// that are still unverified after that (see "delete-unverified-users").
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationToken.duration = 86400 // 24 hours
  users.verificationTemplate.body = users.verificationTemplate.body.replace("The link works for 3 days.", "The link works for 24 hours. If you don't verify by then, the account is deleted and you can sign up again.")
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationToken.duration = 259200
  users.verificationTemplate.body = users.verificationTemplate.body.replace("The link works for 24 hours. If you don't verify by then, the account is deleted and you can sign up again.", "The link works for 3 days.")
  app.save(users)
})
