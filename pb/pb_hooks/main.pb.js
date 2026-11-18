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
onRecordEnrich((e) => {
  e.record.hide("friends")
  e.next()
}, "users")
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
  const EMOJI = { fire: "🔥", muscle: "💪", clap: "👏", rocket: "🚀", trophy: "🏆" }
  const by = e.record.getString("user"), wid = e.record.getString("workout")
  // Built-ins show their emoji; custom reactions show their name in quotes.
  let label = EMOJI[e.record.getString("emoji")] || ""
  if (e.record.getString("emoji") === "custom") {
    try { label = `“${e.app.findRecordById("custom_reactions", e.record.getString("custom")).getString("name")}”` } catch (_) {}
  }
  try {
    const w = e.app.findRecordById("workouts", wid)
    lib.notify(e.app, { user: w.getString("user"), actor: by, type: "reaction", target: wid,
      text: `${lib.uname(e.app, by)} reacted ${label} to “${w.getString("name")}”` })
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
  lib.notify(e.app, { user: e.record.getString("to"), actor: from, type: "nudge", target: e.record.id, text: `${lib.uname(e.app, from)} wants you back in the gym 💪` })
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
    text: now === "approved" ? `“${e.record.getString("name")}” was approved and is now an official exercise 🎉` : `“${e.record.getString("name")}” wasn't approved${note ? `: ${note}` : ""}`,
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
