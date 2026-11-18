// Backend smoke test: node scripts/smoke.mjs [apiUrl]. Creates throwaway users on the target server.
import './env.mjs'
import PocketBase from 'pocketbase'

const url = process.argv[2] || 'http://127.0.0.1:8090'
const tag = Math.random().toString(36).slice(2, 8)
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++ }
const denied = async (p, msg) => { try { await p; ok(false, msg) } catch { ok(true, msg) } }
const id = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')

async function user(name, extra = {}) {
  const pb = new PocketBase(url); pb.autoCancellation(false)
  const email = `${name}_${tag}@test.local`
  await pb.collection('users').create({ email, password: 'password123', passwordConfirm: 'password123', username: `${name}_${tag}`, ...extra })
  await pb.collection('users').authWithPassword(email, 'password123')
  return pb
}

const a = await user('alice', { bodyweight_kg: 80, sex: 'male', unit: 'kg' })
const b = await user('bob', { bodyweight_kg: 70, sex: 'female', unit: 'lb' })
const c = await user('carl')
const A = a.authStore.record.id, B = b.authStore.record.id, C = c.authStore.record.id

const ex = await a.collection('exercises').getFullList()
ok(ex.length >= 80, `seeded exercises visible (${ex.length})`)
const squat = ex.find((e) => e.main_lift === 'squat')
const curl = ex.find((e) => e.name === 'Dumbbell Curl')
await denied(a.collection('exercises').create({ name: 'Fake', muscle: 'chest', equipment: 'other', kind: 'weight', owner: A, main_lift: 'bench' }), 'cannot create custom main lift')
const custom = await a.collection('exercises').create({ name: `Zercher ${tag}`, muscle: 'quads', equipment: 'barbell', kind: 'weight', owner: A })
await denied(b.collection('exercises').getOne(custom.id), 'custom exercise hidden from others')

// Workout via batch (pre-generated id so sets can reference it)
const wid = id()
const batch = a.createBatch()
batch.collection('workouts').create({ id: wid, user: A, name: 'Leg day', started_at: new Date().toISOString(), duration_s: 3600, volume_kg: 1000 })
batch.collection('workout_sets').create({ workout: wid, user: A, exercise: squat.id, performed_at: new Date().toISOString(), set_index: 0, weight_kg: 140, reps: 5, completed: true, e1rm_kg: 9999 })
batch.collection('workout_sets').create({ workout: wid, user: A, exercise: curl.id, performed_at: new Date().toISOString(), set_index: 0, weight_kg: 15, reps: 10, completed: true })
await batch.send()
const sets = await a.collection('workout_sets').getFullList({ filter: `workout="${wid}"` })
ok(sets.length === 2, 'batch created workout + sets')
const sq = sets.find((s) => s.exercise === squat.id)
ok(Math.abs(sq.e1rm_kg - 140 * (1 + 5 / 30)) < 0.01, `server overrides e1RM (${sq.e1rm_kg.toFixed(1)})`)


await denied(b.collection('workouts').getOne(wid), 'stranger cannot view workout')
await denied(b.collection('workout_sets').create({ workout: wid, user: B, exercise: curl.id, performed_at: new Date().toISOString(), completed: true }), "cannot add sets to someone else's workout")
await denied(b.collection('comments').create({ workout: wid, user: B, body: 'hi' }), 'stranger cannot comment')

// Friendship flow
const fr = await b.collection('friendships').create({ requester: B, addressee: A, status: 'pending' })
await denied(a.collection('friendships').create({ requester: A, addressee: B, status: 'pending' }), 'reverse duplicate request blocked')
await denied(b.collection('friendships').update(fr.id, { status: 'accepted' }), 'requester cannot self-accept')
await denied(b.collection('friendships').create({ requester: B, addressee: C, status: 'accepted' }), 'cannot create pre-accepted request')
await a.collection('friendships').update(fr.id, { status: 'accepted' })
ok((await b.collection('workouts').getOne(wid)).id === wid, 'friend can view workout')
ok((await b.collection('users').getOne(A)).friends === undefined && (await a.collection('users').getOne(A)).friends === undefined, 'friends list is never sent to clients')
await denied(c.collection('users').getList(1, 5, { filter: `friends ~ "${A}"` }), 'cannot filter users by friends list')
ok((await b.collection('workout_sets').getFullList({ filter: `workout="${wid}"` })).length === 2, 'friend can view sets')
const cm = await b.collection('comments').create({ workout: wid, user: B, body: 'Strong!' })
ok(!!cm.id, 'friend can comment')
await b.collection('reactions').create({ workout: wid, user: B, emoji: 'fire' })
await denied(b.collection('reactions').create({ workout: wid, user: B, emoji: 'fire' }), 'duplicate reaction blocked')
await denied(c.collection('comments').getFullList({ filter: `workout="${wid}"` }).then((l) => { if (!l.length) throw 0 }), 'non-friend sees no comments')
ok((await a.collection('workouts').getList(1, 10, { filter: `user="${A}"` })).totalItems === 1, 'owner lists own workout')
await denied(b.collection('workouts').update(wid, { name: 'hacked' }), 'friend cannot edit workout')
await a.collection('comments').delete(cm.id)
ok(true, 'workout owner can delete comment on their workout')

// Private posts: hidden from friends, no comments/reactions
const pid = id()
const pb2 = a.createBatch()
pb2.collection('workouts').create({ id: pid, user: A, name: 'Secret', started_at: new Date().toISOString(), visibility: 'private' })
pb2.collection('workout_sets').create({ workout: pid, user: A, exercise: curl.id, performed_at: new Date().toISOString(), weight_kg: 10, reps: 5, completed: true })
await pb2.send()
await denied(b.collection('workouts').getOne(pid), 'friend cannot see private workout')
ok((await b.collection('workout_sets').getFullList({ filter: `workout="${pid}"` })).length === 0, 'friend cannot see private sets')
await denied(b.collection('comments').create({ workout: pid, user: B, body: 'hi' }), 'friend cannot comment on private workout')
ok((await a.collection('workouts').getOne(pid)).visibility === 'private', 'owner sees own private workout')
await a.collection('workouts').update(pid, { visibility: 'public' })
ok((await b.collection('workouts').getOne(pid)).id === pid, 'switching to public shows it to friends')
await a.collection('workouts').delete(pid)

// Remembered settings
await a.collection('users').update(A, { default_rest_s: 150, post_visibility: 'private', update_routine: true })
const au = await a.collection('users').getOne(A)
ok(au.default_rest_s === 150 && au.post_visibility === 'private' && au.update_routine === true, 'settings saved on user')


await a.collection('workouts').delete(wid)
await denied(a.collection('workouts').getOne(wid), 'deleted workout is gone')
ok((await a.collection('workout_sets').getFullList({ filter: `workout="${wid}"` })).length === 0, 'deleting workout removes its sets')

// Exercise review: submit -> moderator approve/reject
await denied(c.collection('users').update(C, { is_moderator: true }), 'cannot make yourself a moderator')
await denied(c.collection('exercises').create({ name: `Sneaky ${tag}`, muscle: 'chest', equipment: 'other', kind: 'weight', owner: C, review_status: 'approved' }), 'cannot create pre-approved exercise')
const HOW = { instructions: 'Wedge the bar in a corner and press it up and forward.', log_tip: 'Log the plates added and reps.' }
const sub = await a.collection('exercises').create({ name: `Landmine Press ${tag}`, muscle: 'shoulders', equipment: 'barbell', kind: 'weight', owner: A, review_status: 'pending', ...HOW })
const rej = await a.collection('exercises').create({ name: `Silly Lift ${tag}`, muscle: 'core', equipment: 'other', kind: 'weight', owner: A, ...HOW })
await a.collection('exercises').update(rej.id, { review_status: 'pending' })
ok(true, 'owner can submit existing custom for review')
await denied(a.collection('exercises').update(sub.id, { review_status: 'approved' }), 'owner cannot self-approve')
await denied(a.send(`/api/betterlift/exercises/${sub.id}/review`, { method: 'POST', body: { action: 'approve' } }), 'non-moderator cannot approve')
await denied(c.collection('exercises').getOne(sub.id), 'pending exercise hidden from regular users')

const admin = new PocketBase(url); admin.autoCancellation(false)
await admin.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD)
await admin.collection('users').update(C, { is_moderator: true })
await c.collection('users').authRefresh()
ok((await c.collection('exercises').getFullList({ filter: 'review_status="pending"' })).some((e) => e.id === sub.id), 'moderator sees review queue')
await c.send(`/api/betterlift/exercises/${sub.id}/review`, { method: 'POST', body: { action: 'approve', name: `Landmine Press ${tag}`, note: 'Nice one' } })
const approved = await b.collection('exercises').getOne(sub.id)
ok(approved.owner === '' && approved.submitted_by === A && approved.review_status === 'approved', 'approved exercise is official and credits submitter')
await denied(a.collection('exercises').delete(sub.id), 'submitter cannot delete official exercise')
await c.send(`/api/betterlift/exercises/${rej.id}/review`, { method: 'POST', body: { action: 'reject', note: 'Duplicate of Crunch' } })
const rejected = await a.collection('exercises').getOne(rej.id)
ok(rejected.review_status === 'rejected' && rejected.review_note === 'Duplicate of Crunch' && rejected.owner === A, 'rejected stays custom with note')
await denied(c.send(`/api/betterlift/exercises/${rej.id}/review`, { method: 'POST', body: { action: 'approve' } }), 'cannot approve a non-pending exercise')
await admin.collection('exercises').delete(sub.id)

// Exercise info required when submitting for review
const INFO = { instructions: 'Step one of the lift.\nStep two of the lift.', log_tip: 'Log weight and reps.' }
await denied(a.collection('exercises').create({ name: `NoInfo ${tag}`, muscle: 'chest', equipment: 'other', kind: 'weight', owner: A, review_status: 'pending' }), 'submission without instructions rejected')
const draft = await a.collection('exercises').create({ name: `Draft ${tag}`, muscle: 'back', equipment: 'cable', kind: 'weight', owner: A })
ok(!!draft.id, 'custom exercise without info is fine when not submitted')
await denied(a.collection('exercises').update(draft.id, { review_status: 'pending' }), 'cannot submit existing exercise until info is filled in')
await a.collection('exercises').update(draft.id, { ...INFO, secondary: ['biceps'], review_status: 'pending' })
await c.send(`/api/betterlift/exercises/${draft.id}/review`, { method: 'POST', body: { action: 'approve', secondary: ['biceps', 'shoulders'], instructions: 'Edited by mod: pull the handle to your chest.\nReturn slowly.' } })
const appr2 = await b.collection('exercises').getOne(draft.id)
ok(appr2.secondary.length === 2 && appr2.instructions.startsWith('Edited by mod') && appr2.log_tip === INFO.log_tip, 'moderator edits to info are saved on approval')
const seeded = await a.collection('exercises').getFirstListItem('name="Barbell Bench Press" && owner=""')
ok(seeded.secondary.includes('triceps') && seeded.instructions.split('\n').length === 3 && seeded.log_tip.length > 10, 'built-in exercises have secondary muscles, how-to and log tip')
await admin.collection('exercises').delete(draft.id)

// Stats privacy: friends see lifts by default; hide_stats hides sets but not the post
const pvw = id()
const pvb = a.createBatch()
pvb.collection('workouts').create({ id: pvw, user: A, name: 'Privacy', started_at: new Date().toISOString() })
pvb.collection('workout_sets').create({ workout: pvw, user: A, exercise: curl.id, performed_at: new Date().toISOString(), weight_kg: 12, reps: 8, completed: true })
await pvb.send()
ok((await b.collection('workout_sets').getFullList({ filter: `user="${A}"` })).length > 0, "friend can see a user's lifts by default")
await a.collection('users').update(A, { hide_stats: true })
ok((await b.collection('workout_sets').getFullList({ filter: `user="${A}"` })).length === 0, 'hidden stats: friend sees no lifts')
ok((await b.collection('workouts').getOne(pvw)).id === pvw, 'hidden stats: post itself still visible')
ok((await a.collection('workout_sets').getFullList({ filter: `workout="${pvw}"` })).length === 1, 'hidden stats: owner still sees own lifts')
await a.collection('users').update(A, { hide_stats: false })
await a.collection('workouts').delete(pvw)

// Personal exercise edits
const ov = await a.collection('exercise_overrides').create({ user: A, exercise: seeded.id, name: 'My Bench', instructions: 'My own cues' })
ok(!!ov.id, 'user can save a personal edit of an official exercise')
await denied(a.collection('exercise_overrides').create({ user: A, exercise: seeded.id, name: 'dupe' }), 'one personal edit per exercise')
ok((await b.collection('exercise_overrides').getFullList()).every((x) => x.user === B), "personal edits are invisible to others")
ok((await b.collection('exercises').getOne(seeded.id)).name === 'Barbell Bench Press', 'official exercise unchanged for everyone else')
await a.collection('exercise_overrides').delete(ov.id)

// Feedback
const fbk = await a.collection('feedback').create({ user: A, type: 'exercise_request', message: 'Please add Landmine Row' })
ok(!!fbk.id, 'user can send feedback / requests')
await denied(a.collection('feedback').create({ user: A, type: 'general', message: 'x', status: 'done' }), 'users cannot set feedback status')
await denied(a.collection('feedback').update(fbk.id, { status: 'done' }), 'users cannot mark feedback done')
await denied(b.collection('feedback').getOne(fbk.id), "others can't read your feedback")
await admin.collection('feedback').update(fbk.id, { status: 'done', admin_note: 'Added!' })
ok((await a.collection('feedback').getOne(fbk.id)).admin_note === 'Added!', 'admin reply visible to the sender')

// Admin (superuser) can review submissions
const adminSub = await a.collection('exercises').create({ name: `Admin Review ${tag}`, muscle: 'chest', equipment: 'other', kind: 'weight', owner: A, review_status: 'pending', ...INFO })
await admin.send(`/api/betterlift/exercises/${adminSub.id}/review`, { method: 'POST', body: { action: 'approve' } })
ok((await admin.collection('exercises').getOne(adminSub.id)).owner === '', 'admin login can approve submissions')
await admin.collection('exercises').delete(adminSub.id)

// Theme
await a.collection('users').update(A, { theme: { base: 'navy', accent: '#38bdf8' } })
ok((await a.collection('users').getOne(A)).theme.base === 'navy', 'theme saved to account')

// Reminders (nudges)
const nd = await b.collection('nudges').create({ from: B, to: A, message: 'Get back in the gym!' })
ok(!!nd.id, 'friend can send a reminder')
await denied(b.collection('nudges').create({ from: B, to: A }), 'only one reminder per friend per day')
await denied(c.collection('nudges').create({ from: C, to: A }), 'non-friends cannot send reminders')
await denied(b.collection('nudges').create({ from: A, to: B }), 'cannot send a reminder as someone else')
ok((await a.collection('nudges').getFullList({ filter: 'seen = false' })).some((x) => x.id === nd.id), 'recipient sees the reminder')
await denied(b.collection('nudges').update(nd.id, { seen: true }), 'sender cannot mark it seen')
await a.collection('nudges').update(nd.id, { seen: true })
ok((await a.collection('nudges').getOne(nd.id)).seen === true, 'recipient can dismiss it')
await denied(c.collection('nudges').getOne(nd.id), "others can't read reminders")

// Threaded comments
const tw = id(), tw2 = id()
const tb = a.createBatch()
tb.collection('workouts').create({ id: tw, user: A, name: 'Thread', started_at: new Date().toISOString() })
tb.collection('workouts').create({ id: tw2, user: A, name: 'Other', started_at: new Date().toISOString() })
await tb.send()
const top = await b.collection('comments').create({ workout: tw, user: B, body: 'Top' })
const r1 = await a.collection('comments').create({ workout: tw, user: A, body: 'Reply', parent: top.id })
const r2 = await b.collection('comments').create({ workout: tw, user: B, body: 'Reply to reply', parent: r1.id })
ok(r1.parent === top.id && r2.parent === r1.id, 'reply and reply-to-reply saved')
await denied(b.collection('comments').create({ workout: tw2, user: B, body: 'x', parent: top.id }), 'reply must be on the same workout')
await denied(b.collection('comments').update(r2.id, { parent: top.id }), 'cannot move a reply')
await b.collection('comments').delete(top.id)
ok((await a.collection('comments').getFullList({ filter: `workout="${tw}"` })).length === 0, 'deleting a comment removes its replies')

// Notifications (server-created)
const nw = id()
const nb = a.createBatch()
nb.collection('workouts').create({ id: nw, user: A, name: 'Notify me', started_at: new Date().toISOString() })
await nb.send()
const before = (await a.collection('notifications').getFullList()).length
const nc = await b.collection('comments').create({ workout: nw, user: B, body: 'Nice lift!' })
await a.collection('comments').create({ workout: nw, user: A, body: 'Thanks!', parent: nc.id })
await b.collection('reactions').create({ workout: nw, user: B, emoji: 'muscle' })
const aN = await a.collection('notifications').getFullList({ sort: '-created' })
ok(aN.some((n) => n.type === 'comment' && n.target === nw && n.actor === B), 'owner notified of a comment')
ok(aN.some((n) => n.type === 'reaction' && n.target === nw), 'owner notified of a reaction')
ok(!aN.some((n) => n.actor === A), 'no notifications for your own actions')
ok((await b.collection('notifications').getFullList()).some((n) => n.type === 'reply' && n.target === nw), 'commenter notified of a reply')
ok(aN.some((n) => n.type === 'exercise_approved') && aN.some((n) => n.type === 'exercise_rejected'), 'submitter notified of approval and rejection')
ok(aN.length - before >= 2, 'notifications arrive')
await denied(a.collection('notifications').create({ user: A, type: 'comment', text: 'fake' }), 'users cannot create notifications')
await denied(b.collection('notifications').getOne(aN[0].id), "others can't read your notifications")
await denied(a.collection('notifications').update(aN[0].id, { text: 'edited' }), 'cannot edit notification text')
await a.collection('notifications').update(aN[0].id, { read: true })
ok((await a.collection('notifications').getOne(aN[0].id)).read === true, 'can mark a notification read')

// Clear all history (what Settings -> Delete all history does)
const mine = await a.collection('workouts').getFullList({ filter: `user="${A}"`, fields: 'id' })
const del = a.createBatch()
mine.forEach((w) => del.collection('workouts').delete(w.id))
await del.send()
ok((await a.collection('workouts').getFullList({ filter: `user="${A}"` })).length === 0, 'all workouts deleted')
ok((await a.collection('workout_sets').getFullList({ filter: `user="${A}"` })).length === 0, 'all sets deleted with them')
const bw = await b.collection('workouts').create({ user: B, name: 'b', started_at: new Date().toISOString() })
await denied(a.collection('workouts').delete(bw.id), "cannot delete someone else's workout")
ok((await b.collection('workouts').getOne(bw.id)).id === bw.id, "friend's workout untouched")
await b.collection('workouts').delete(bw.id)

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
