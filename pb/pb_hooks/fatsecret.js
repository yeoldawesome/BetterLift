// FatSecret Platform API (free "basic" scope) for the Nutrition tab's food search. require()d by main.pb.js.
// Credentials come from FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET (/etc/betterlift/fatsecret.env in production);
// without them search() returns null and the caller falls back to Open Food Facts. FatSecret only answers calls from
// IP addresses allow-listed in its developer portal, so a changed home IP shows up here as an error → fallback.

const API = "https://platform.fatsecret.com/rest/server.api"
const DETAILS = 5 // top results that get their full serving list (one extra API call each)

function token() {
  const id = $os.getenv("FATSECRET_CLIENT_ID"), secret = $os.getenv("FATSECRET_CLIENT_SECRET")
  if (!id || !secret) return ""
  const cached = $app.store().get("fatsecret_token")
  if (cached && cached.exp > Date.now()) return cached.t
  const res = $http.send({
    url: "https://oauth.fatsecret.com/connect/token", method: "POST", timeout: 10,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=basic&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret),
  })
  const d = res.json || {}
  if (res.statusCode !== 200 || !d.access_token) throw new Error("fatsecret token " + res.statusCode)
  // Tokens last a day; refresh a few minutes early.
  $app.store().set("fatsecret_token", { t: d.access_token, exp: Date.now() + (Number(d.expires_in || 3600) - 300) * 1000 })
  return d.access_token
}

function call(t, params) {
  const qs = Object.keys(params).map((k) => k + "=" + encodeURIComponent(params[k])).join("&")
  const res = $http.send({ url: API + "?" + qs + "&format=json", method: "GET", timeout: 10, headers: { Authorization: "Bearer " + t } })
  const d = res.json || {}
  if (res.statusCode !== 200 || d.error) throw new Error("fatsecret " + (d.error ? d.error.code + " " + d.error.message : res.statusCode))
  return d
}

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
const r1 = (v) => Math.round(num(v) * 10) / 10
const list = (v) => (Array.isArray(v) ? v : v ? [v] : [])

// "Per 101g - Calories: 197kcal | Fat: 7.79g | Carbs: 0.00g | Protein: 29.80g" → one serving.
function fromDescription(desc) {
  const m = /^Per (.+?) - Calories: ([\d.]+)kcal \| Fat: ([\d.]+)g \| Carbs: ([\d.]+)g \| Protein: ([\d.]+)g/.exec(desc || "")
  if (!m) return null
  const amt = m[1].trim()
  let g
  const gm = /^([\d.]+)\s*g$/i.exec(amt), oz = /^([\d.]+)\s*oz$/i.exec(amt)
  if (gm) g = num(gm[1]); else if (oz) g = Math.round(num(oz[1]) * 28.35)
  return { label: gm ? g + " g" : amt, g: g, kcal: Math.round(num(m[2])), p: r1(m[5]), c: r1(m[4]), f: r1(m[3]) }
}

// food.get.v2 servings → app servings: household portions first (the default), then gram-based ones; max 6.
function fromServings(food) {
  const out = list(food.servings && food.servings.serving).map((s) => ({
    label: String(s.serving_description || "").trim(),
    g: s.metric_serving_unit === "g" && num(s.metric_serving_amount) > 0 ? Math.round(num(s.metric_serving_amount)) : undefined,
    kcal: Math.round(num(s.calories)), p: r1(s.protein), c: r1(s.carbohydrate), f: r1(s.fat),
    grams: s.measurement_description === "g",
  })).filter((s) => s.label)
  out.sort((a, b) => Number(a.grams) - Number(b.grams))
  return out.slice(0, 6).map((s) => ({ label: s.label, g: s.g, kcal: s.kcal, p: s.p, c: s.c, f: s.f }))
}

/** Search foods → [{ key, name, detail, servings, source: "fatsecret" }], or null when FatSecret isn't configured. */
function search(q) {
  const t = token()
  if (!t) return null
  const d = call(t, { method: "foods.search", search_expression: q, max_results: 20 })
  const foods = list(d.foods && d.foods.food)
  return foods.map((f, i) => {
    let servings = []
    if (i < DETAILS) {
      try { servings = fromServings(call(t, { method: "food.get.v2", food_id: f.food_id }).food || {}) } catch (_) { /* use the summary line */ }
    }
    if (!servings.length) { const s = fromDescription(f.food_description); if (s) servings = [s] }
    if (!servings.length) return null
    return { key: "fs:" + f.food_id, name: String(f.food_name || "").trim(), detail: f.brand_name ? String(f.brand_name).trim() : undefined, servings: servings, source: "fatsecret" }
  }).filter((f) => f && f.name)
}

module.exports = { search }
