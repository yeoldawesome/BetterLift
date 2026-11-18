// Shared helpers for main.pb.js. Hook handlers run in isolated VMs, so each one require()s this file.

function epley(w, r) {
  if (w <= 0 || r <= 0) return 0
  return r === 1 ? w : w * (1 + r / 30)
}

function areFriends(app, a, b) {
  try {
    app.findFirstRecordByFilter(
      "friendships",
      "status = 'accepted' && ((requester = {:a} && addressee = {:b}) || (requester = {:b} && addressee = {:a}))",
      { a, b },
    )
    return true
  } catch (_) {
    return false
  }
}

/** Rebuild a user's hidden `friends` list from accepted friendships (used by visibility rules). */
function syncFriends(app, userId) {
  let user
  try { user = app.findRecordById("users", userId) } catch (_) { return }
  const ids = []
  for (const f of app.findRecordsByFilter("friendships", "status = 'accepted' && (requester = {:u} || addressee = {:u})", "", 0, 0, { u: userId })) {
    ids.push(f.getString("requester") === userId ? f.getString("addressee") : f.getString("requester"))
  }
  user.set("friends", ids)
  app.saveNoValidate(user)
}

/** Create an in-app notification (never for yourself). Failures are logged, never block the action that caused them. */
function notify(app, n) {
  if (!n.user || n.user === n.actor) return
  try {
    const r = new Record(app.findCollectionByNameOrId("notifications"))
    r.set("user", n.user)
    r.set("actor", n.actor || "")
    r.set("type", n.type)
    r.set("text", String(n.text || "").slice(0, 300))
    r.set("target", n.target || "")
    app.save(r)
  } catch (err) { app.logger().error("notify failed", "error", String(err)) }
}

const uname = (app, id) => { try { return "@" + app.findRecordById("users", id).getString("username") } catch (_) { return "Someone" } }

module.exports = { epley, areFriends, syncFriends, notify, uname }
