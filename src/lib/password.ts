/** Password rules for new passwords (server also enforces 10–71 characters). */
export const MIN_PASSWORD = 10

// The most common leaked passwords (and gym-flavored ones): rejected outright.
const COMMON = new Set(`
password password1 password12 password123 passw0rd 123456 1234567 12345678 123456789 1234567890 qwerty qwerty123 qwertyuiop
abc123 111111 000000 123123 654321 iloveyou admin welcome letmein monkey dragon football baseball basketball sunshine princess
superman batman trustno1 starwars whatever freedom shadow master michael jessica charlie hello123 login 1q2w3e4r 1qaz2wsx
zaq12wsx asdfghjkl asdfasdf qazwsxedc changeme secret password! iloveyou1 fitness workout gymrat bodybuilding powerlifting
benchpress deadlift squat123 betterlift betterlift1 liftheavy getstrong
`.split(/\s+/).filter(Boolean))

export type Strength = { ok: boolean; score: 0 | 1 | 2 | 3 | 4; label: string; problem: string }

/** Checks a new password. `ok` = allowed; score/label drive the meter. */
export function checkPassword(pw: string, ctx: { username?: string; email?: string } = {}): Strength {
  const lower = pw.toLowerCase()
  const name = (ctx.username ?? '').toLowerCase()
  const local = (ctx.email ?? '').toLowerCase().split('@')[0]
  let problem = ''
  if (pw.length < MIN_PASSWORD) problem = `Use at least ${MIN_PASSWORD} characters.`
  else if (pw.length > 71) problem = 'Use 71 characters or fewer.'
  else if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z0-9]/g, ''))) problem = 'That password is too common. Pick something less guessable.'
  else if ((name.length >= 3 && lower.includes(name)) || (local.length >= 3 && lower.includes(local))) problem = "Don't use your username or email in your password."
  else if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|abcdefghij)/.test(lower)) problem = 'Avoid repeated or sequential characters.'

  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  let score = (pw.length >= MIN_PASSWORD ? 1 : 0) + (pw.length >= 14 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (pw.length >= 18 || (kinds === 4 && pw.length >= 12) ? 1 : 0)
  if (problem) score = Math.min(score, 1)
  const s = Math.max(0, Math.min(4, score)) as Strength['score']
  return { ok: !problem, score: s, label: ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'][s], problem }
}
