// Seed demo lifters for local testing: node scripts/seed-demo.mjs [your@email] [apiUrl]
// Re-running replaces the demo accounts (emails @demo.betterlift.local) and leaves everyone else alone.
import './env.mjs'
import PocketBase from 'pocketbase'

const target = process.argv[2] || 'dnlonglett@gmail.com'
const url = process.argv[3] || 'http://127.0.0.1:8090'
const pb = new PocketBase(url)
pb.autoCancellation(false)
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD)

const PASSWORD = 'demo12345'
const DOMAIN = 'demo.betterlift.local'
// name, username, sex, bodyweight kg, height cm, strength factor, days between sessions, days since last session, theme accent
const PEOPLE = [
  ['Alex Rivera', 'alex_lifts', 'male', 84, 180, 1.15, 2, 0, '#38bdf8'],
  ['Maya Chen', 'maya_strong', 'female', 63, 166, 0.72, 2, 1, '#f472b6'],
  ['Jordan Brooks', 'jordan_gains', 'male', 92, 185, 1.3, 3, 3, '#fb923c'],   // last day to keep streak
  ['Sam Ortiz', 'sam_squats', 'male', 77, 175, 0.95, 2, 6, '#a78bfa'],        // lost streak → remind them
  ['Priya Patel', 'priya_pr', 'female', 58, 160, 0.65, 1, 0, '#34d399'],
]
// Day templates: [exercise name, base kg (×strength), reps, sets]
const PLAN = {
  Push: [['Barbell Bench Press', 80, 5, 4], ['Incline Dumbbell Bench Press', 26, 10, 3], ['Barbell Overhead Press', 50, 6, 3], ['Dumbbell Lateral Raise', 10, 15, 3], ['Tricep Pushdown', 30, 12, 3]],
  Pull: [['Barbell Deadlift', 140, 5, 3], ['Barbell Row', 70, 8, 3], ['Lat Pulldown', 60, 10, 3], ['Dumbbell Curl', 14, 12, 3], ['Face Pull', 25, 15, 3]],
  Legs: [['Barbell Squat', 110, 5, 4], ['Leg Press', 180, 10, 3], ['Romanian Deadlift', 90, 8, 3], ['Standing Calf Raise', 70, 12, 3], ['Plank', 0, 0, 2]],
}
const DAYS = ['Push', 'Pull', 'Legs']
const COMMENTS = ['Strong session 💪', 'That bench is moving!', 'Leg day warrior', 'Light weight baby', 'Let’s go!!', 'Form looked clean', 'New PR?? 👀']
const EMOJI = ['fire', 'muscle', 'clap', 'rocket', 'trophy']

const rnd = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647 })() // deterministic
const pick = (a) => a[Math.floor(rnd() * a.length)]
const id = () => Array.from({ length: 15 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rnd() * 36)]).join('')
const epley = (w, r) => (w <= 0 || r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30))
const round = (kg, step = 2.5) => Math.round(kg / step) * step

// 1) Clear previous demo accounts (cascades to their workouts, sets, comments, friendships…)
for (const u of await pb.collection('users').getFullList({ filter: `email ~ "@${DOMAIN}"` })) await pb.collection('users').delete(u.id)

const me = await pb.collection('users').getFirstListItem(pb.filter('email = {:e}', { e: target })).catch(() => null)
if (!me) console.log(`! No account with ${target} — demo users will only be friends with each other.`)

const exercises = new Map((await pb.collection('exercises').getFullList({ filter: 'owner = ""' })).map((e) => [e.name, e]))

// 2) Users
const users = []
for (const [name, username, sex, bw, h, , , , accent] of PEOPLE) {
  users.push(await pb.collection('users').create({
    email: `${username}@${DOMAIN}`, emailVisibility: false, password: PASSWORD, passwordConfirm: PASSWORD, verified: true,
    name, username, sex, bodyweight_kg: bw, height_cm: h, unit: 'lb', theme: { base: 'midnight', accent },
  }))
}

// 3) Friendships: everyone with everyone, and everyone with you
const everyone = me ? [...users, me] : users
const fb = pb.createBatch()
for (let i = 0; i < everyone.length; i++) for (let j = i + 1; j < everyone.length; j++) {
  fb.collection('friendships').create({ requester: everyone[i].id, addressee: everyone[j].id, status: 'accepted' })
}
await fb.send()

// 4) ~6 weeks of push/pull/legs per person, progressing slowly
const today = new Date()
const posts = []
for (const [i, u] of users.entries()) {
  const [, , , , , strength, every, lastAgo] = PEOPLE[i]
  const best = new Map()
  const b = pb.createBatch()
  let n = 0
  for (let ago = 42; ago >= lastAgo; ago -= every) {
    const day = DAYS[n % 3]
    const progress = 1 + (42 - ago) / 42 * 0.08
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago, 17 + Math.floor(rnd() * 3), Math.floor(rnd() * 60))
    const wid = id()
    const sets = []
    PLAN[day].forEach(([exName, base, reps, nSets], pos) => {
      const ex = exercises.get(exName)
      if (!ex) return
      for (let s = 0; s < nSets; s++) {
        if (ex.kind === 'duration') { sets.push({ ex, pos, s, kg: 0, reps: 0, sec: 45 + Math.round(rnd() * 30) }); continue }
        const kg = round(base * strength * progress * (ex.equipment === 'dumbbell' ? 1 : 1), ex.equipment === 'dumbbell' ? 1 : 2.5)
        sets.push({ ex, pos, s, kg, reps: Math.max(3, reps + Math.round(rnd() * 2 - 1) - (s === nSets - 1 ? 1 : 0)), sec: 0 })
      }
    })
    // PR flags: best set per exercise that beats the running best
    const pr = new Set()
    for (const exId of new Set(sets.map((x) => x.ex.id))) {
      let bi = -1
      sets.forEach((x, k) => { if (x.ex.id === exId && epley(x.kg, x.reps) > (bi < 0 ? 0 : epley(sets[bi].kg, sets[bi].reps))) bi = k })
      if (bi >= 0 && epley(sets[bi].kg, sets[bi].reps) > (best.get(exId) ?? 0) + 0.01) { pr.add(bi); best.set(exId, epley(sets[bi].kg, sets[bi].reps)) }
    }
    const dur = 50 * 60 + Math.round(rnd() * 25 * 60)
    b.collection('workouts').create({
      id: wid, user: u.id, name: `${day} Day`, started_at: start.toISOString(), ended_at: new Date(start.getTime() + dur * 1000).toISOString(),
      duration_s: dur, volume_kg: sets.reduce((t, x) => t + x.kg * x.reps, 0), pr_count: n === 0 ? 0 : pr.size, bodyweight_kg: PEOPLE[i][3],
      visibility: n % 11 === 7 ? 'private' : 'public',
    })
    sets.forEach((x, k) => b.collection('workout_sets').create({
      workout: wid, user: u.id, exercise: x.ex.id, performed_at: start.toISOString(), position: x.pos, set_index: x.s,
      weight_kg: x.kg, reps: x.reps, seconds: x.sec, completed: true, is_pr: n > 0 && pr.has(k),
    }))
    if (ago <= 10) posts.push({ wid, owner: u })
    n++
  }
  await b.send()
}

// 5) Social: reactions + comments (with a reply) on recent posts
const sb = pb.createBatch()
for (const { wid, owner } of posts) {
  const friends = users.filter((x) => x.id !== owner.id)
  const used = new Set()
  for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
    const who = pick(friends), emoji = pick(EMOJI)
    if (used.has(who.id + emoji)) continue
    used.add(who.id + emoji)
    sb.collection('reactions').create({ workout: wid, user: who.id, emoji })
  }
  if (rnd() < 0.5) sb.collection('comments').create({ workout: wid, user: pick(friends).id, body: pick(COMMENTS) })
}
await sb.send()

const sw = await pb.collection('workouts').getFullList({ filter: `user.email ~ "@${DOMAIN}"`, fields: 'id' })
console.log(`Seeded ${users.length} demo lifters with ${sw.length} workouts${me ? `, all friends with @${me.username}` : ''}.`)
console.log(`Demo logins: ${PEOPLE.map((p) => `${p[1]}@${DOMAIN}`).join(', ')} — password: ${PASSWORD}`)
