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

/** Where tapping a notification takes you (same as notifLink in src/lib/notifications.tsx). */
function notifPath(type, target) {
  switch (type) {
    case "comment": case "reply": case "reaction": return "/w/" + target
    case "friend_request": return "/friends"
    case "friend_accept": return "/u/" + target
    case "nudge": return "/workout"
    case "exercise_approved": case "exercise_rejected": return "/exercises?open=" + target
    case "feedback_reply": return "/feedback"
  }
  return "/notifications"
}

/**
 * Send a push to all of a user's devices, with their unread count (notifications + messages) for the app-icon badge.
 * The pb/push sidecar does the Web Push encryption and answers right away, so this never slows the request down.
 * Does nothing until push is configured (PUSH_URL / PUSH_SECRET in /etc/betterlift/push.env).
 */
function sendPush(app, user, msg) {
  const url = $os.getenv("PUSH_URL"), secret = $os.getenv("PUSH_SECRET")
  if (!url || !secret) return
  try {
    // Settings → Notifications: skip kinds this user turned off.
    if (msg.kind) {
      let off = []
      try { off = JSON.parse(app.findRecordById("users", user).getString("push_off") || "[]") } catch (_) {}
      if (Array.isArray(off) && off.indexOf(msg.kind) >= 0) return
    }
    const subs = app.findRecordsByFilter("push_subscriptions", "user = {:u}", "", 20, 0, { u: user })
    if (!subs.length) return
    const unread = app.countRecords("notifications", $dbx.hashExp({ user: user, read: false }))
      + app.countRecords("messages", $dbx.hashExp({ to: user, read: false }))
    $http.send({
      url: url + "/send", method: "POST", timeout: 3,
      headers: { "content-type": "application/json", "x-push-secret": secret },
      body: JSON.stringify({
        subscriptions: subs.map((s) => ({ endpoint: s.getString("endpoint"), keys: { p256dh: s.getString("p256dh"), auth: s.getString("auth") } })),
        payload: { title: msg.title || "Better Lift", body: msg.body, path: msg.path, badge: unread, tag: msg.tag },
      }),
    })
  } catch (err) { app.logger().error("push failed", "error", String(err)) }
}

/** Which Settings switch controls a notification type (same as PUSH_KINDS in src/lib/push.ts). */
function pushKind(type) {
  switch (type) {
    case "comment": case "reply": return "comments"
    case "reaction": return "reactions"
    case "friend_request": case "friend_accept": return "friends"
    case "nudge": return "nudges"
    case "exercise_approved": case "exercise_rejected": case "feedback_reply": return "updates"
  }
  return ""
}

/** Push a new in-app notification to the user's devices. */
function push(app, n) {
  const type = n.getString("type")
  sendPush(app, n.getString("user"), { body: n.getString("text"), path: notifPath(type, n.getString("target")), tag: n.id, kind: pushKind(type) })
}

const uname = (app, id) => { try { return "@" + app.findRecordById("users", id).getString("username") } catch (_) { return "Someone" } }

module.exports = { epley, areFriends, syncFriends, notify, uname, push, sendPush }
