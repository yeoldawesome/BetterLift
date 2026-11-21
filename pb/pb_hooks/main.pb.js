/// <reference path="../pb_data/types.d.ts" />

// ---- Exercise review (moderators only) ----
// POST /api/betterlift/exercises/{id}/review  { action: "approve"|"reject", note?, name?, muscle?, equipment?, kind? }
routerAdd("POST", "/api/betterlift/exercises/{id}/review", (e) => {
  if (!e.hasSuperuserAuth() && (!e.auth || !e.auth.getBool("is_moderator"))) throw new ForbiddenError("Moderators only.")
  const body = e.requestInfo().body || {}
  const ex = e.app.findRecordById("exercises", e.request.pathValue("id"))
  if (ex.getString("review_status") !== "pending") throw new BadRequestError("This exercise isn't waiting for review.")
  ex.set("review_note", String(body.note || "").slice(0, 300))
  if (body.action === "approve") {
    for (const k of ["name", "muscle", "equipment", "kind", "instructions", "log_tip"]) if (body[k]) ex.set(k, String(body[k]))
    if (Array.isArray(body.secondary)) ex.set("secondary", body.secondary.map(String))
    if (Array.isArray(body.primaries) && body.primaries.length) { ex.set("primaries", body.primaries.map(String)); ex.set("muscle", String(body.primaries[0])) }
    ex.set("submitted_by", ex.getString("owner"))
    ex.set("owner", "")
    ex.set("review_status", "approved")
  } else if (body.action === "reject") {
    ex.set("review_status", "rejected")
  } else {
    throw new BadRequestError("action must be approve or reject")
  }
  try {
    e.app.save(ex)
  } catch (err) {
    throw new BadRequestError("Couldn't save — an official exercise with this name probably exists. Rename it and approve again.")
  }
  return e.json(200, { id: ex.id, review_status: ex.getString("review_status") })
}, $apis.requireAuth())

// ---- Cross-record ownership checks (API rules can't express these cleanly) ----

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const w = e.app.findRecordById("workouts", e.record.getString("workout"))
    if (w.getString("user") !== (e.auth ? e.auth.id : "")) throw new ForbiddenError("Not your workout.")
  }
  e.next()
}, "workout_sets")

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const r = e.app.findRecordById("routines", e.record.getString("routine"))
    if (r.getString("user") !== (e.auth ? e.auth.id : "")) throw new ForbiddenError("Not your routine.")
  }
  e.next()
}, "routine_exercises")

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const lib = require(`${__hooks}/lib.js`)
    const w = e.app.findRecordById("workouts", e.record.getString("workout"))
    const owner = w.getString("user")
    const uid = (e.auth ? e.auth.id : "")
    if (owner !== uid && (w.getString("visibility") === "private" || !lib.areFriends(e.app, uid, owner))) throw new ForbiddenError("Only friends can do that.")
  }
  e.next()
}, "comments", "reactions")

// Custom reactions: only your own or a friend's can be used.
onRecordCreateRequest((e) => {
  const cid = e.record.getString("custom")
  if (cid && !e.hasSuperuserAuth()) {
    const lib = require(`${__hooks}/lib.js`)
    const uid = e.auth ? e.auth.id : ""
    let owner = ""
    try { owner = e.app.findRecordById("custom_reactions", cid).getString("owner") } catch (_) { throw new BadRequestError("That reaction no longer exists.") }
    if (owner !== uid && !lib.areFriends(e.app, uid, owner)) throw new ForbiddenError("You can only use your own or your friends' custom reactions.")
  }
  e.next()
}, "reactions")

// Submitting a custom exercise for review requires how-to instructions and logging notes.
onRecordCreateRequest((e) => {
  if (e.record.getString("review_status") === "pending") {
    if (e.record.getString("instructions").trim().length < 20) throw new BadRequestError("Add instructions (at least 20 characters) describing how to perform the exercise before submitting.")
    if (e.record.getString("log_tip").trim().length < 10) throw new BadRequestError("Add a note on how to log this exercise (at least 10 characters) before submitting.")
  }
  e.next()
}, "exercises")
onRecordUpdateRequest((e) => {
  if (e.record.getString("review_status") === "pending") {
    if (e.record.getString("instructions").trim().length < 20) throw new BadRequestError("Add instructions (at least 20 characters) describing how to perform the exercise before submitting.")
    if (e.record.getString("log_tip").trim().length < 10) throw new BadRequestError("Add a note on how to log this exercise (at least 10 characters) before submitting.")
  }
  e.next()
}, "exercises")

// The friends list exists only for API rules: never send it to clients, and don't let them filter on it.
// Other people only see the public parts of a profile: friends also get body stats (for shared Stats/Insights),
// everything else (settings, theme, units…) is only sent to the account owner.
onRecordEnrich((e) => {
  e.record.hide("friends")
  const info = e.requestInfo
  const viewer = info && info.auth ? info.auth.id : ""
  const superuser = info && info.auth && info.auth.isSuperuser()
  if (!superuser && viewer !== e.record.id) {
    e.record.hide("unit", "theme", "tab_bar", "post_visibility", "update_routine", "save_as_routine",
      "default_rest_s", "default_rest_after_s", "routine_update", "nutrition_on", "nutrition_seen", "push_off", "push_asked", "plan")
    let friend = false
    if (viewer) for (const id of e.record.getStringSlice("friends")) if (id === viewer) { friend = true; break }
    if (!friend) e.record.hide("bodyweight_kg", "height_cm")
  }
  e.next()
}, "users")

// Find people to add as friends without exposing the whole user list: 3+ characters, 10 results max,
// public fields only, verified accounts only (rate limited in migration 1731800032).
routerAdd("GET", "/api/betterlift/user-search", (e) => {
  const me = e.auth.id
  const q = String(e.requestInfo().query.q || "").trim().toLowerCase().replace(/[%\\]/g, "").slice(0, 40)
  if (q.length < 3) return e.json(200, { items: [] })
  const recs = e.app.findRecordsByFilter("users",
    "id != {:me} && verified = true && (username ~ {:prefix} || name ~ {:q})", "username", 10, 0,
    { me, prefix: q + "%", q })
  return e.json(200, {
    items: recs.map((r) => ({
      id: r.id, collectionId: r.collection().id, collectionName: "users",
      username: r.getString("username"), name: r.getString("name"), avatar: r.getString("avatar"),
    })),
  })
}, $apis.requireAuth("users"))
onRecordsListRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const q = e.requestInfo().query || {}
    if (String(q.filter || "").indexOf("friends") >= 0 || String(q.sort || "").indexOf("friends") >= 0) throw new BadRequestError("Invalid filter.")
  }
  e.next()
}, "users")

// Keep each user's hidden friends list in sync with friendships (accept / remove / account deletion).
onRecordAfterCreateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  lib.syncFriends(e.app, e.record.getString("requester")); lib.syncFriends(e.app, e.record.getString("addressee"))
}, "friendships")
onRecordAfterUpdateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  lib.syncFriends(e.app, e.record.getString("requester")); lib.syncFriends(e.app, e.record.getString("addressee"))
}, "friendships")
onRecordAfterDeleteSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  lib.syncFriends(e.app, e.record.getString("requester")); lib.syncFriends(e.app, e.record.getString("addressee"))
}, "friendships")

// Reminders: only to friends, at most one per sender→recipient per day.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const lib = require(`${__hooks}/lib.js`)
    const from = e.auth ? e.auth.id : ""
    const to = e.record.getString("to")
    if (!lib.areFriends(e.app, from, to)) throw new ForbiddenError("You can only remind friends.")
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString().replace("T", " ")
    let recent = false
    try { e.app.findFirstRecordByFilter("nudges", "from = {:f} && to = {:t} && created >= {:s}", { f: from, t: to, s: since }); recent = true } catch (_) {}
    if (recent) throw new BadRequestError("You already sent them a reminder today.")
  }
  e.next()
}, "nudges")

// A reply must point at a comment on the same workout.
onRecordCreateRequest((e) => {
  const parentId = e.record.getString("parent")
  if (parentId) {
    let parent = null
    try { parent = e.app.findRecordById("comments", parentId) } catch (_) {}
    if (!parent || parent.getString("workout") !== e.record.getString("workout")) throw new BadRequestError("You can only reply to a comment on the same workout.")
  }
  e.next()
}, "comments")

onRecordCreateRequest((e) => {
  const a = e.record.getString("requester")
  const b = e.record.getString("addressee")
  let exists = false
  try {
    e.app.findFirstRecordByFilter("friendships", "(requester = {:a} && addressee = {:b}) || (requester = {:b} && addressee = {:a})", { a, b })
    exists = true
  } catch (_) {}
  if (exists) throw new BadRequestError("A friend request already exists between you two.")
  e.next()
}, "friendships")

// ---- Server-authoritative e1RM (Epley) ----

onRecordCreate((e) => {
  const lib = require(`${__hooks}/lib.js`)
  e.record.set("e1rm_kg", lib.epley(e.record.getFloat("weight_kg"), e.record.getInt("reps")))
  e.next()
}, "workout_sets")

onRecordUpdate((e) => {
  const lib = require(`${__hooks}/lib.js`)
  e.record.set("e1rm_kg", lib.epley(e.record.getFloat("weight_kg"), e.record.getInt("reps")))
  e.next()
}, "workout_sets")

// ---- Notifications (server-created so they can't be spoofed) ----

onRecordAfterCreateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  const by = e.record.getString("user"), wid = e.record.getString("workout")
  let owner = "", wname = "your workout"
  try { const w = e.app.findRecordById("workouts", wid); owner = w.getString("user"); wname = `“${w.getString("name")}”` } catch (_) {}
  const body = e.record.getString("body")
  const short = body.length > 80 ? body.slice(0, 77) + "…" : body
  const parentId = e.record.getString("parent")
  let parentAuthor = ""
  if (parentId) { try { parentAuthor = e.app.findRecordById("comments", parentId).getString("user") } catch (_) {} }
  if (parentAuthor && parentAuthor !== by) lib.notify(e.app, { user: parentAuthor, actor: by, type: "reply", target: wid, text: `${lib.uname(e.app, by)} replied: ${short}` })
  if (owner && owner !== parentAuthor) lib.notify(e.app, { user: owner, actor: by, type: "comment", target: wid, text: `${lib.uname(e.app, by)} commented on ${wname}: ${short}` })
}, "comments")

onRecordAfterCreateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  const NAMES = { fire: "fire", muscle: "a flex", clap: "a high five", rocket: "a rocket", trophy: "a trophy" }
  const by = e.record.getString("user"), wid = e.record.getString("workout")
  // Built-ins are named in words (no emoji); custom reactions show their name in quotes.
  let label = NAMES[e.record.getString("emoji")] || ""
  if (e.record.getString("emoji") === "custom") {
    try { label = `“${e.app.findRecordById("custom_reactions", e.record.getString("custom")).getString("name")}”` } catch (_) {}
  }
  try {
    const w = e.app.findRecordById("workouts", wid)
    lib.notify(e.app, { user: w.getString("user"), actor: by, type: "reaction", target: wid,
      text: `${lib.uname(e.app, by)} reacted ${label ? `with ${label} ` : ""}to “${w.getString("name")}”` })
  } catch (_) {}
}, "reactions")

onRecordAfterCreateSuccess((e) => {
  e.next()
  if (e.record.getString("status") !== "pending") return
  const lib = require(`${__hooks}/lib.js`)
  const from = e.record.getString("requester")
  lib.notify(e.app, { user: e.record.getString("addressee"), actor: from, type: "friend_request", target: from, text: `${lib.uname(e.app, from)} sent you a friend request` })
}, "friendships")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  if (e.record.original().getString("status") === "accepted" || e.record.getString("status") !== "accepted") return
  const lib = require(`${__hooks}/lib.js`)
  const by = e.record.getString("addressee")
  lib.notify(e.app, { user: e.record.getString("requester"), actor: by, type: "friend_accept", target: by, text: `${lib.uname(e.app, by)} accepted your friend request` })
}, "friendships")

onRecordAfterCreateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  const from = e.record.getString("from")
  lib.notify(e.app, { user: e.record.getString("to"), actor: from, type: "nudge", target: e.record.id, text: `${lib.uname(e.app, from)} wants you back in the gym` })
}, "nudges")

// Exercise review outcome → tell the submitter.
onRecordAfterUpdateSuccess((e) => {
  e.next()
  const before = e.record.original().getString("review_status"), now = e.record.getString("review_status")
  if (before !== "pending" || (now !== "approved" && now !== "rejected")) return
  const lib = require(`${__hooks}/lib.js`)
  const who = e.record.getString("submitted_by") || e.record.getString("owner")
  const note = e.record.getString("review_note")
  lib.notify(e.app, {
    user: who, type: now === "approved" ? "exercise_approved" : "exercise_rejected", target: e.record.id,
    text: now === "approved" ? `“${e.record.getString("name")}” was approved and is now an official exercise` : `“${e.record.getString("name")}” wasn't approved${note ? `: ${note}` : ""}`,
  })
}, "exercises")

// Admin replied to / closed feedback → tell the sender.
onRecordAfterUpdateSuccess((e) => {
  e.next()
  const o = e.record.original()
  const status = e.record.getString("status"), note = e.record.getString("admin_note")
  if (o.getString("status") === status && o.getString("admin_note") === note) return
  const lib = require(`${__hooks}/lib.js`)
  const label = status === "done" ? "was completed" : status === "declined" ? "was declined" : "got a reply"
  lib.notify(e.app, { user: e.record.getString("user"), type: "feedback_reply", target: e.record.id,
    text: `Your ${e.record.getString("type") === "general" ? "feedback" : "request"} ${label}${note ? `: ${note}` : ""}` })
}, "feedback")

// ---- Food search proxy (Nutrition tab) ----
// GET /api/betterlift/food-search?q=…  → { foods: [...] } from FatSecret (app food shape, see pb_hooks/fatsecret.js),
// or, when FatSecret isn't configured / fails / finds nothing, { products: [...] } in Open Food Facts product shape.
// Browsers can't call OFF's newer search service directly (it sends no CORS header) and the older endpoint is often
// overloaded (503), so the server asks both: newer first, older as a fallback. Only the search text is sent out.
routerAdd("GET", "/api/betterlift/food-search", (e) => {
  const q = String(e.request.url.query().get("q") || "").trim().slice(0, 100)
  if (q.length < 2) return e.json(200, { products: [] })
  try {
    const foods = require(`${__hooks}/fatsecret.js`).search(q)
    if (foods && foods.length) return e.json(200, { foods })
  } catch (err) { console.log("fatsecret search failed, using Open Food Facts:", err) }
  const fields = "code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments,quantity"
  const enc = encodeURIComponent(q)
  const urls = [
    "https://search.openfoodfacts.org/search?q=" + enc + "&page_size=24&fields=" + fields,
    "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + enc + "&search_simple=1&action=process&json=1&page_size=24&fields=" + fields,
  ]
  for (const url of urls) {
    try {
      const res = $http.send({ url, method: "GET", headers: { "User-Agent": "BetterLift/1.0 (self-hosted fitness tracker)" }, timeout: 12 })
      if (res.statusCode !== 200) continue
      const d = res.json || JSON.parse(toString(res.body))
      const products = (d && (d.hits || d.products)) || []
      // The newer service returns brands as a list; keep the older comma-separated shape.
      for (const p of products) if (Array.isArray(p.brands)) p.brands = p.brands.join(", ")
      return e.json(200, { products })
    } catch (_) { /* try the next source */ }
  }
  return e.json(502, { message: "Food search is unavailable right now. Try again in a minute." })
}, $apis.requireAuth())

// ---- Forgot password (email or username) ----
// POST /api/betterlift/request-password-reset  { identity }  → 204 whether or not the account exists, so this can't
// be used to find out who has an account. Rate-limited in settings (see migration 1731800028).
routerAdd("POST", "/api/betterlift/request-password-reset", (e) => {
  const body = e.requestInfo().body || {}
  const identity = String(body.identity || "").trim().toLowerCase().slice(0, 200)
  if (!identity) throw new BadRequestError("Enter your email or username.")
  if (!e.app.settings().smtp.enabled) {
    throw new ApiError(503, "Password reset emails aren't set up on this server yet. Ask the admin to turn on email (SMTP).")
  }
  let user = null
  try {
    user = identity.indexOf("@") >= 0
      ? e.app.findAuthRecordByEmail("users", identity)
      : e.app.findFirstRecordByFilter("users", "username = {:u}", { u: identity })
  } catch (_) { /* no such account: answer the same way */ }
  if (user) {
    try { $mails.sendRecordPasswordReset(e.app, user) } catch (err) { console.log("password reset email failed:", err) }
  }
  return e.noContent(204)
})

// ---- Push notifications (see pb/push) ----
// Every new in-app notification is also pushed to the user's devices.
onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/lib.js`).push(e.app, e.record)
}, "notifications")

// ---- Private messages (rules in migration 1731800033) ----

// Tidy the text; new messages always start unread.
onRecordCreateRequest((e) => {
  const body = e.record.getString("body").replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim()
  if (!body) throw new BadRequestError("Write a message first.")
  e.record.set("body", body)
  e.record.set("read", false)
  e.next()
}, "messages")

// Push each message to the recipient. One notification per conversation (same tag), so a burst of messages
// replaces itself instead of stacking up.
onRecordAfterCreateSuccess((e) => {
  e.next()
  const lib = require(`${__hooks}/lib.js`)
  const from = e.record.getString("from"), text = e.record.getString("body")
  lib.sendPush(e.app, e.record.getString("to"), {
    title: lib.uname(e.app, from),
    body: text.length > 140 ? text.slice(0, 137) + "…" : text,
    path: "/messages/" + from,
    tag: "msg-" + from,
    kind: "messages",
  })
}, "messages")

// Settings → "Send a test": a push to your own devices, so you can check notifications work.
routerAdd("POST", "/api/betterlift/push-test", (e) => {
  const lib = require(`${__hooks}/lib.js`)
  if (!e.app.findRecordsByFilter("push_subscriptions", "user = {:u}", "", 1, 0, { u: e.auth.id }).length)
    throw new BadRequestError("This account has no devices with notifications on yet.")
  lib.sendPush(e.app, e.auth.id, { body: "Notifications are working 💪", path: "/settings", tag: "test" })
  return e.noContent(204)
}, $apis.requireAuth())

// Rest timer: push "rest is over" at the end of the rest, even with the app closed or the phone locked.
// Body { seconds, name } schedules (replacing any earlier one); { cancel: true } cancels. Off via Settings → Rest timer.
routerAdd("POST", "/api/betterlift/rest-timer", (e) => {
  const lib = require(`${__hooks}/lib.js`)
  const body = e.requestInfo().body || {}
  const key = "rest:" + e.auth.id
  if (body.cancel) { lib.cancelPush(key); return e.noContent(204) }
  const s = Math.round(Number(body.seconds) || 0)
  if (s <= 0 || s > 3600) { lib.cancelPush(key); return e.noContent(204) }
  const name = String(body.name || "").slice(0, 80)
  lib.sendPush(e.app, e.auth.id, {
    title: "Rest is over", body: name ? `Time for your next set of ${name} 💪` : "Time for your next set 💪",
    path: "/workout", tag: "rest", kind: "rest", at: Date.now() + s * 1000, key: key,
  })
  return e.noContent(204)
}, $apis.requireAuth())

// The app needs the server's public VAPID key to subscribe. Empty until push is configured.
routerAdd("GET", "/api/betterlift/push-key", (e) => e.json(200, { key: $os.getenv("VAPID_PUBLIC_KEY") || "" }))

// Re-subscribing the same device is a no-op; a device that switched accounts moves to the new account.
onRecordCreateRequest((e) => {
  const endpoint = e.record.getString("endpoint")
  let existing = null
  try { existing = e.app.findFirstRecordByFilter("push_subscriptions", "endpoint = {:e}", { e: endpoint }) } catch (_) {}
  if (existing) {
    if (existing.getString("user") === e.record.getString("user")) return e.json(200, existing)
    e.app.delete(existing)
  }
  e.next()
}, "push_subscriptions")

// The sidecar reports subscriptions the push service says are gone (app deleted, permission revoked).
routerAdd("POST", "/api/betterlift/push-gone", (e) => {
  const secret = $os.getenv("PUSH_SECRET")
  if (!secret || e.request.header.get("x-push-secret") !== secret) throw new ForbiddenError()
  const body = e.requestInfo().body || {}
  for (const endpoint of (body.endpoints || []).slice(0, 100)) {
    try { e.app.delete(e.app.findFirstRecordByFilter("push_subscriptions", "endpoint = {:e}", { e: String(endpoint) })) } catch (_) {}
  }
  return e.noContent(204)
})

// ---- Email verification (see migration 1731800030) ----
// Send the verification email right after signup. Without SMTP set up this quietly does nothing.
onRecordAfterCreateSuccess((e) => {
  e.next()
  if (e.record.getBool("verified") || !e.app.settings().smtp.enabled) return
  try { $mails.sendRecordVerification(e.app, e.record) } catch (err) { e.app.logger().error("verification email failed", "error", String(err)) }
}, "users")

// Accounts that never verify their email are deleted 24 hours after signup (the link also expires then), so
// abandoned or mistyped signups don't stick around. Skipped while SMTP is off: nobody could verify, so nothing is removed.
cronAdd("delete-unverified-users", "15 * * * *", () => {
  if (!$app.settings().smtp.enabled) return
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace("T", " ")
  const stale = $app.findRecordsByFilter("users", "verified = false && created < {:c}", "created", 500, 0, { c: cutoff })
  for (const u of stale) {
    try { $app.delete(u) } catch (err) { $app.logger().error("couldn't delete unverified user", "id", u.id, "error", String(err)) }
  }
  if (stale.length) $app.logger().info("deleted unverified users", "count", stale.length)
})
