// Pure-logic tests for nutrition: parsers, food matching, energy and targets. Run: npm run test:nutrition
import { parseLabel } from '../src/lib/labelOcr'
import { estimateMeal, mealIn, parseMacros, parseWeight } from '../src/lib/foodParse'
import { fromOff, LOCAL_FOODS, searchLocal } from '../src/lib/foods'
import { bmr, estimateCardio, estimateLifting, isCardio, liftingSession, type Person } from '../src/lib/energy'
import { applyPace, computeTargets, DEFAULT_SETTINGS, mealNow, paceCheck, type Settings } from '../src/lib/nutrition'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++ }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// ---- Exact macro statements
const m1 = parseMacros('I ate 36g of protein, 26g carbs, and 48g fat at 680 calories')!
ok(!!m1 && m1.macros.p === 36 && m1.macros.c === 26 && m1.macros.f === 48 && m1.macros.kcal === 680 && m1.kcalGiven, `macro sentence → 36/26/48 @ 680 (${JSON.stringify(m1?.macros)})`)
ok(m1.name === 'Quick add', `filler-only sentence names "Quick add" (${m1.name})`)
const m2 = parseMacros('protein shake 30g protein 5g carbs 2g fat')!
ok(m2.macros.kcal === 30 * 4 + 5 * 4 + 2 * 9 && !m2.kcalGiven, `calories auto-calculated when missing (${m2.macros.kcal})`)
ok(m2.name.toLowerCase() === 'protein shake', `leftover words become the name (${m2.name})`)
const m3 = parseMacros('protein: 40, carbs: 55, fat: 12, calories: 500')!
ok(m3.macros.p === 40 && m3.macros.c === 55 && m3.macros.f === 12 && m3.macros.kcal === 500, 'keyword-first form')
const m4 = parseMacros('40p 30c 10f')!
ok(m4.macros.p === 40 && m4.macros.c === 30 && m4.macros.f === 10, 'compact 40p 30c 10f')
ok(parseMacros('two chicken tacos with cheese') === null, 'a meal description is not a macro statement')
ok(parseMacros('2 protein bars') === null, '"2 protein bars" is not "2 g protein"')
const m5 = parseMacros('lunch was 650 kcal')!
ok(m5.macros.kcal === 650 && m5.macros.p === 0, 'calories only')
ok(mealIn('chicken for lunch') === 'lunch' && mealIn('eggs') === undefined, 'meal detection')

// ---- Meal estimates
const names = (t: string) => estimateMeal(t).items.map((i) => `${i.servings}×${i.food.name}`)
const e1 = estimateMeal('two chicken tacos with cheese and salsa and a diet soda')
const n1 = e1.items.map((i) => i.food.name)
ok(n1.join('|') === 'Chicken taco|Cheddar cheese|Salsa|Diet soda', `taco meal items (${n1.join(', ')})`)
ok(e1.items[0].servings === 2 && e1.items[1].servings === 1 && e1.items[2].servings === 2 && e1.items[3].servings === 1, `taco meal amounts (${names('two chicken tacos with cheese and salsa and a diet soda').join(', ')})`)
const kcal1 = e1.items.reduce((t, i) => t + i.food.servings[0].kcal * i.servings, 0)
ok(kcal1 > 400 && kcal1 < 650, `taco meal total is plausible (${Math.round(kcal1)} kcal)`)
const e2 = estimateMeal('200g chicken breast, 1.5 cups of rice and broccoli')
ok(e2.items.length === 3 && near(e2.items[0].servings, 200 / 113, 0.02) && e2.items[1].servings === 1.5, `grams and cups (${names('200g chicken breast, 1.5 cups of rice and broccoli').join(', ')})`)
const e3 = estimateMeal('mac and cheese and a coke')
ok(e3.items.map((i) => i.food.name).join('|') === 'Mac and cheese|Soda', `"mac and cheese" kept whole (${e3.items.map((i) => i.food.name).join(', ')})`)
const e4 = estimateMeal('3 eggs, 2 slices of toast with butter, black coffee')
ok(e4.items.map((i) => `${i.servings} ${i.food.name}`).join('|') === '3 Egg|2 Bread|1 Butter|1 Black coffee', `breakfast (${e4.items.map((i) => `${i.servings} ${i.food.name}`).join(', ')})`)
const e5 = estimateMeal('2 tbsp peanut butter')
ok(e5.items[0].food.name === 'Peanut butter' && e5.items[0].servings === 1, '2 tbsp = 1 serving of a "2 tbsp" food')
const e6 = estimateMeal('half a cup of oats and a large banana')
ok(e6.items[0].servings === 1 && near(e6.items[1].servings, 1.33, 0.01), `half cup oats / large banana (${names('half a cup of oats and a large banana').join(', ')})`)
const e7 = estimateMeal('a slice of pizza and some flibbertigibbet')
ok(e7.items.length === 1 && e7.unknown.length === 1, `unknown words reported (${e7.unknown.join(', ')})`)
const e8 = estimateMeal('I had a burrito bowl for lunch')
ok(e8.items.length === 1 && e8.items[0].food.name === 'Burrito bowl', 'filler + meal words stripped')
const e9 = estimateMeal('12 oz coke')
ok(e9.items[0].food.name === 'Soda' && near(e9.items[0].servings, 1, 0.05), `12 oz of a drink ≈ one can (${e9.items[0]?.servings})`)
const e10 = estimateMeal('cup noodles')
ok(e10.items[0]?.food.name === 'Instant ramen', `"cup noodles" isn't read as a cup of noodles (${e10.items[0]?.food.name})`)

// ---- Restaurant menus
const rs = (t: string) => estimateMeal(t).items.map((i) => `${i.servings}×${i.food.name}`).join(', ')
const c1 = estimateMeal('I got a burrito from Chipotle with white rice, brown and black beans, with double chicken and sour cream and cheese')
ok(c1.restaurant?.id === 'chipotle' && c1.title === 'Chipotle burrito', `Chipotle detected (${c1.title})`)
ok(rs('I got a burrito from Chipotle with white rice, brown and black beans, with double chicken and sour cream and cheese')
  === '1×Chipotle Burrito tortilla, 1×Chipotle White rice, 1×Chipotle Pinto beans, 1×Chipotle Black beans, 2×Chipotle Chicken, 1×Chipotle Sour cream, 1×Chipotle Cheese' && !c1.unknown.length,
  `Chipotle burrito items (${rs('I got a burrito from Chipotle with white rice, brown and black beans, with double chicken and sour cream and cheese')} | unknown: ${c1.unknown})`)
const p1 = estimateMeal('I got a bowl from Panda Express with orange chicken and white rice')
ok(p1.title === 'Panda Express bowl' && rs('I got a bowl from Panda Express with orange chicken and white rice') === '1×Panda Express Orange Chicken, 1×Panda Express White Steamed Rice', `Panda bowl (${rs('I got a bowl from Panda Express with orange chicken and white rice')})`)
ok(rs('panda plate with half chow mein half fried rice, beijing beef and broccoli beef') === '0.5×Panda Express Chow Mein, 0.5×Panda Express Fried Rice, 1×Panda Express Beijing Beef, 1×Panda Express Broccoli Beef',
  `Panda half-and-half plate (${rs('panda plate with half chow mein half fried rice, beijing beef and broccoli beef')})`)
ok(rs('chipotle bowl with steak, extra guac and a coke') === '1×Chipotle Steak, 1.5×Chipotle Guacamole, 1×Soda', `extra + off-menu item (${rs('chipotle bowl with steak, extra guac and a coke')})`)
ok(rs('2 chipotle tacos with chicken') === '6×Chipotle Taco tortilla, flour, 2×Chipotle Chicken', `tacos come in threes (${rs('2 chipotle tacos with chicken')})`)
const og = 'I had chicken alfredo at olive garden with 2 breadsticks and a house salad with dressing'
ok(rs(og) === '1×Olive Garden Chicken Alfredo, 2×Olive Garden Breadstick, 1×Olive Garden Famous House Salad (no dressing), 1×Olive Garden Signature Italian Dressing'
  && estimateMeal(og).title === 'Olive Garden Chicken Alfredo', `Olive Garden order (${rs(og)} | ${estimateMeal(og).title})`)
ok(rs('olive garden zuppa toscana, tiramisu') === '1×Olive Garden Zuppa Toscana, 1×Olive Garden Tiramisu', `Olive Garden soup + dessert (${rs('olive garden zuppa toscana, tiramisu')})`)
ok(rs('olive garden chicken parm and fettuccine alfredo') === '1×Olive Garden Chicken Parmigiana, 1×Olive Garden Fettuccine Alfredo', `Olive Garden parm (${rs('olive garden chicken parm and fettuccine alfredo')})`)
ok(!estimateMeal('chicken with chipotle mayo').restaurant, '"chipotle mayo" is a sauce, not the restaurant')
ok(rs('white and brown rice') === '1×White rice, cooked, 1×Brown rice, cooked', `shared noun borrowed (${rs('white and brown rice')})`)

// ---- Search & Open Food Facts
ok(searchLocal('chick')[0]?.name.startsWith('Chicken'), `type-ahead "chick" (${searchLocal('chick')[0]?.name})`)
ok(searchLocal('sesame seed oil')[0]?.name === 'Olive oil' && searchLocal('canola')[0]?.name === 'Olive oil', 'oils match the oil entry')
ok(searchLocal('chicken taco')[0]?.name === 'Chicken taco', 'full matches rank above partial ones')
ok(searchLocal('greek yog')[0]?.name.startsWith('Greek yogurt'), 'type-ahead multi-word')
// Alcohol (7 kcal/g) isn't protein, carbs or fat, so drinks with it are exempt.
const ALCOHOL = /beer|wine|liquor|margarita/i
const mismatched = LOCAL_FOODS.filter((f) => { const s = f.servings[0]; return !ALCOHOL.test(f.name) && Math.abs(s.kcal - (s.p * 4 + s.c * 4 + s.f * 9)) > Math.max(25, s.kcal * 0.2) })
mismatched.forEach((f) => { const s = f.servings[0]; console.log(`   off: ${f.name} ${s.kcal} vs ${s.p * 4 + s.c * 4 + s.f * 9}`) })
ok(!mismatched.length, `built-in foods: calories agree with macros ±20% (${LOCAL_FOODS.length} foods)`)
const off = fromOff({ code: '1', product_name: 'Yogurt', brands: 'Acme, Other', serving_size: '170 g', serving_quantity: 170, nutriments: { 'energy-kcal_100g': 59, proteins_100g: 10, carbohydrates_100g: 3.6, fat_100g: 0.4 } })!
ok(off.servings.length === 2 && off.servings[0].kcal === 100 && off.servings[0].p === 17 && off.servings[1].label === '100 g' && off.detail === 'Acme', 'OFF product normalized (per serving + per 100 g)')
ok(fromOff({ product_name: 'Mystery' }) === null, 'OFF product without nutrition is skipped')

// ---- Energy
const man: Person = { kg: 80, cm: 180, age: 30, sex: 'male' }
ok(bmr(man) === 10 * 80 + 6.25 * 180 - 150 + 5, `Mifflin BMR (${bmr(man)})`)
const run = estimateCardio({ name: 'Running', kind: 'cardio', seconds: 30 * 60, distanceKm: 5 }, man)
ok(run.method === 'pace' && run.kcal > 300 && run.kcal < 420, `5 km in 30 min run ≈ 350 net kcal (${run.kcal}, ${run.label})`)
const walk = estimateCardio({ name: 'Walking', kind: 'cardio', seconds: 45 * 60, distanceKm: 4 }, man)
ok(walk.method === 'pace' && walk.kcal > 100 && walk.kcal < 220, `45 min walk ≈ 150 net kcal (${walk.kcal})`)
ok(walk.kcal < run.kcal, 'walking burns less than running')
const stairsEasy = estimateCardio({ name: 'Stair Climber', kind: 'cardio', seconds: 20 * 60, distanceKm: 0, rpe: 3 }, man)
const stairsHard = estimateCardio({ name: 'Stair Climber', kind: 'cardio', seconds: 20 * 60, distanceKm: 0, rpe: 9 }, man)
ok(stairsHard.kcal > stairsEasy.kcal * 1.3 && stairsHard.method === 'effort', `RPE changes the estimate (${stairsEasy.kcal} → ${stairsHard.kcal})`)
const bball = estimateCardio({ name: 'Basketball', kind: 'duration', seconds: 60 * 60, distanceKm: 0 }, man)
ok(bball.method === 'typical' && bball.kcal > 350 && bball.kcal < 600, `1 h basketball (${bball.kcal})`)
const hr = estimateCardio({ name: 'Cycling', kind: 'cardio', seconds: 40 * 60, distanceKm: 15, avgHr: 150 }, man)
ok(hr.method === 'hr' && hr.kcal > 350 && hr.kcal < 650, `HR beats pace (${hr.kcal}, ${hr.label})`)
const watch = estimateCardio({ name: 'Running', kind: 'cardio', seconds: 1800, distanceKm: 5, avgHr: 160, kcal: 333 }, man)
ok(watch.method === 'watch' && watch.kcal === 333, 'watch calories win')
const row = estimateCardio({ name: 'Rowing Machine', kind: 'cardio', seconds: 20 * 60, distanceKm: 4 }, man)
ok(row.method === 'pace' && row.kcal > 120 && row.kcal < 250, `4 km row in 20 min, from watts (${row.kcal})`)
ok(estimateLifting(60 * 60, man) === 200 && estimateLifting(3 * 60, man) === 0, 'lifting: 2.5 net MET, ignores <5 min')
const typical = liftingSession(60 * 60, 20, man), light = liftingSession(60 * 60, 8, man), dense = liftingSession(45 * 60, 30, man)
ok(typical.kcal > 200 && typical.kcal < 300 && typical.how === '20 sets, steady pace', `60 min / 20 sets ≈ 240 kcal (${typical.kcal}, MET ${typical.met})`)
ok(light.kcal < typical.kcal && dense.kcal > typical.kcal, `more sets in the time burns more (${light.kcal} < ${typical.kcal} < ${dense.kcal})`)
const forgot = liftingSession(4 * 3600, 12, man)
ok(forgot.trimmed && forgot.minutes === 75 && forgot.how.includes('time trimmed'), `a timer left running is trimmed to the sets (${forgot.minutes} min)`)
ok(liftingSession(0, 15, man).minutes === 45, 'no time recorded → ~3 min per set')
ok(isCardio({ kind: 'duration', muscle: 'cardio' }) && isCardio({ kind: 'cardio', muscle: 'cardio' }) && !isCardio({ kind: 'duration', muscle: 'core' }), 'isCardio')

// ---- Targets
ok(DEFAULT_SETTINGS.eatBack === 0, 'exercise calories are not added back by default')
const s: Settings = { ...DEFAULT_SETTINGS, goal: 'cut', rate: 0.5, activity: 1.375, proteinPerKg: 2.2, eatBack: 1 }
const t = computeTargets(s, man, 300)
ok(t.goalDelta === Math.round((-0.005 * 80 * 7700) / 7), `cut 0.5%/wk → ${t.goalDelta} kcal/day`)
ok(t.base === t.baseline + t.goalDelta && t.kcal === t.base + 300, 'target = expenditure + goal + exercise')
ok(t.p === 176 && Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal) < 15, `macros add up to calories (${t.p}p ${t.c}c ${t.f}f = ${t.p * 4 + t.c * 4 + t.f * 9} vs ${t.kcal})`)
const half = computeTargets({ ...s, eatBack: 0.5 }, man, 300)
ok(half.exercise === 150, 'eat-back share')
const floor = computeTargets({ ...s, rate: 1, activity: 1.2 }, { kg: 50, cm: 155, age: 40, sex: 'female' }, 0)
ok(floor.floorHit && floor.base >= 1200, `never below the floor (${floor.base})`)
ok(computeTargets({ ...s, kcalOverride: 2000 }, man, 0).base === 2000, 'manual calories override')

// ---- Weigh-ins in Describe
const w1 = parseWeight('I weigh 182.4 today'), w2 = parseWeight('weighed in at 81.5 kg'), w3 = parseWeight('weight: 180 lbs')
ok(w1?.value === 182.4 && w1.unit === null && w2?.value === 81.5 && w2.unit === 'kg' && w3?.value === 180 && w3.unit === 'lb', 'weigh-in sentences')
ok(parseWeight('two chicken tacos') === null && parseWeight('36g protein') === null && parseWeight('I weigh 3') === null, 'non-weights ignored')
ok(parseMacros('I weigh 182') === null || parseWeight('I weigh 182') !== null, 'weight wins over macros')

// ---- Weekly pace check (80 kg)
const day = 864e5, now = Date.parse('2026-11-19T12:00:00Z')
const series = (kgPerWeek: number, days = 8) => Array.from({ length: days }, (_, i) => ({ t: now - (days - 1 - i) * day, kg: 80 + (kgPerWeek / 7) * i }))
const bulk: Settings = { ...DEFAULT_SETTINGS, setUp: true, goal: 'bulk', rate: 0.25 } // goal +0.2 kg/wk
const flat = paceCheck(bulk, series(0), 80, now)
ok(flat.status === 'adjust' && flat.delta > 0 && flat.why === 'slow-gain', `bulk + no gain for a week → add calories (${JSON.stringify(flat)})`)
const fast = paceCheck(bulk, series(0.8), 80, now)
ok(fast.status === 'adjust' && fast.delta < 0 && fast.why === 'fast-gain', `bulk + gaining too fast → remove calories (${fast.status === 'adjust' ? fast.delta : ''})`)
ok(paceCheck(bulk, series(0.22), 80, now).status === 'on-track', 'bulk on pace → no suggestion')
const cut: Settings = { ...bulk, goal: 'cut', rate: 0.5 } // goal −0.4 kg/wk
const stall = paceCheck(cut, series(0), 80, now), crash = paceCheck(cut, series(-1.2), 80, now)
ok(stall.status === 'adjust' && stall.delta < 0 && stall.why === 'slow-loss', 'cut + no loss → remove calories')
ok(crash.status === 'adjust' && crash.delta > 0 && crash.why === 'fast-loss', 'cut + losing too fast → add calories')
ok(flat.status === 'adjust' && Math.abs(flat.delta) >= 100 && Math.abs(flat.delta) <= 300 && flat.delta % 25 === 0, 'suggestions are gradual (100–300, steps of 25)')
ok(paceCheck(bulk, series(0, 4), 80, now).status === 'waiting', 'needs about a week of weigh-ins')
ok(paceCheck({ ...bulk, lastCheckAt: now - 3 * day }, series(0), 80, now).status === 'waiting', 'waits a week after a change')
ok(paceCheck({ ...bulk, goal: 'track' }, series(0), 80, now).status === 'off', 'no pace check when just tracking')
const applied = applyPace(bulk, 150, now)
ok(applied.tdeeAdjust === 150 && applied.lastCheckAt === now, 'apply shifts expenditure correction')
ok(applyPace({ ...bulk, kcalOverride: 2500 }, -150, now).kcalOverride === 2350, 'apply shifts fixed calories when set')
ok(computeTargets({ ...bulk, goal: 'track' }, man, 0).goalDelta === 0, 'track mode has no surplus/deficit')
ok(['breakfast', 'lunch', 'dinner', 'snack'].includes(mealNow()), 'mealNow')

// ---- Nutrition label OCR parsing
{
  const a = parseLabel(`Nutrition Facts\n8 servings per container\nServing size 2/3 cup (55g)\nAmount per serving\nCalories 230\n% Daily Value*\nTotal Fat 8g 10%\nSaturated Fat 1g 5%\nTrans Fat 0g\nCholesterol 0mg 0%\nSodium 160mg 7%\nTotal Carbohydrate 37g 13%\nDietary Fiber 4g 14%\nTotal Sugars 12g\nProtein 3g\n* The % Daily Value tells you... 2,000 calories a day`)
  ok(a.kcal === 230 && a.f === 8 && a.c === 37 && a.p === 3 && a.serving === '2/3 cup (55g)', `label parse (${JSON.stringify({ ...a, text: undefined })})`)
  const b = parseLabel(`Calories\n190\nTotal Fat 3.5g\nTotal Carbohydrate 129\nProtein 219`)
  ok(b.kcal === 190 && b.c === 12 && b.p === 21 && b.f === 3.5, `"g" misread as 9 is fixed by the calorie check (${JSON.stringify({ ...b, text: undefined })})`)
  // Real Tesseract output from a photographed label: "37g" → "379", "(55g)" → "(559)".
  const real = parseLabel(`Nutrition Facts\n8 servings per container\nServing size 213 cup (559)\nI\nAmount per serving\n\nCalories 230\nTotal Fat 8g 10%\nSodium 160mg\n\nTotal Carbohydrate 379 13%\nTotal Sugars 129\n\nProtein 3g`)
  ok(real.kcal === 230 && real.f === 8 && real.c === 37 && real.p === 3, `real OCR text (${JSON.stringify({ ...real, text: undefined })})`)
  const c = parseLabel(`Calories 11O\nTotal Fat Og\nTotal Carb. 2g\nProtein 25g`)
  ok(c.kcal === 110 && c.f === 0 && c.c === 2 && c.p === 25, `O read as 0 (${JSON.stringify({ ...c, text: undefined })})`)
}

console.log(fails ? `\n${fails} FAILED` : '\nAll nutrition tests passed')
process.exit(fails ? 1 : 0)
