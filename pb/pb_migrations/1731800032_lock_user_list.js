/// <reference path="../pb_data/types.d.ts" />

// Stop anyone with an account from downloading the whole user list.
//  - Listing users only returns yourself and your friends. Finding new people goes through the
//    /api/betterlift/user-search endpoint (pb_hooks), which needs 3+ characters, returns at most 10 matches
//    with public fields only, and is rate limited.
//  - Viewing one user by id still works for any signed-in user (ids are random and only show up next to
//    people you interact with: friend requests, comments), and pb_hooks strips private fields for non-friends.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "@request.auth.id != '' && (id = @request.auth.id || friends.id ?= @request.auth.id)"
  app.save(users)

  const s = app.settings()
  s.rateLimits.enabled = true
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "GET /api/betterlift/user-search" && r.label !== "GET /api/collections/users/records")
  s.rateLimits.rules.push({ label: "GET /api/betterlift/user-search", audience: "", duration: 60, maxRequests: 30 })
  s.rateLimits.rules.push({ label: "GET /api/collections/users/records", audience: "", duration: 60, maxRequests: 60 })
  app.save(s)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "@request.auth.id != ''"
  app.save(users)
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "GET /api/betterlift/user-search" && r.label !== "GET /api/collections/users/records")
  app.save(s)
})
