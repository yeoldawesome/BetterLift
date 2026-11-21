import type { FoodLog, Macros, Serving } from './nutrition'
import { pb } from './pb'

/**
 * Food lookup: a built-in list of common foods (instant, offline, used by the meal estimator) plus Open Food Facts
 * (free, open database of packaged foods: text search and barcodes). No API key needed.
 */

export type Food = {
  key: string
  name: string
  /** Brand or note. */
  detail?: string
  /** First serving is the default. */
  servings: Serving[]
  source: 'local' | 'off' | 'fatsecret' | 'recent'
  barcode?: string
  /** Local foods: other names it goes by (used for matching). */
  aliases?: string[]
  /** Local foods: portion used when added "with" another food, as a fraction of a serving (e.g. cheese on a taco). */
  topping?: number
}

// name | aliases (;-separated) | serving label | grams | kcal | protein | carbs | fat | topping fraction
// Values per serving, from USDA FoodData Central / typical restaurant nutrition. Rounded.
const RAW = `
Chicken breast, cooked|chicken;grilled chicken;chicken breast;baked chicken|4 oz|113|187|35|0|4|0.5
Chicken thigh, cooked|chicken thigh;thigh|4 oz|113|236|29|0|12|
Rotisserie chicken|rotisserie chicken|4 oz|113|250|28|0|15|
Chicken wing|wing;chicken wing;hot wing;buffalo wing|1 wing|35|90|8|0|6|
Chicken tender, breaded|chicken tender;tender;chicken strip;chicken finger|1 tender|45|120|9|7|6|
Chicken nugget|nugget;chicken nugget;mcnugget|1 nugget|16|48|2.5|3|3|
Ground beef 85/15, cooked|ground beef;beef;hamburger meat;taco meat|4 oz|113|283|29|0|18|0.5
Lean ground beef 93/7, cooked|lean ground beef;93 7 beef;lean beef|4 oz|113|206|29|0|9|
Sirloin steak, cooked|steak;sirloin;beef steak;flank steak|6 oz|170|350|52|0|14|
Ribeye steak, cooked|ribeye;rib eye|6 oz|170|490|46|0|33|
Ground turkey 93/7, cooked|ground turkey;turkey burger|4 oz|113|220|27|0|12|
Deli turkey|turkey;turkey breast;sliced turkey;deli turkey|2 oz|56|60|11|2|1|
Deli ham|ham;sliced ham|2 oz|56|60|9|2|2|
Bacon|bacon;bacon strip|1 slice|8|43|3|0|3.3|1
Pork sausage link|sausage;sausage link;breakfast sausage|1 link|25|85|4.5|0.5|7.5|
Sausage patty|sausage patty|1 patty|38|140|7|0.5|12|
Pork chop, cooked|pork chop;pork;pork loin;pork tenderloin|4 oz|113|230|31|0|11|
Pulled pork|pulled pork;carnitas|4 oz|113|240|26|0|15|0.5
Salmon, cooked|salmon|4 oz|113|233|25|0|14|
Tuna, canned in water|tuna;canned tuna;tuna can|1 can|116|120|27|0|1|
White fish, cooked|tilapia;cod;white fish;fish;halibut;mahi|4 oz|113|145|30|0|3|
Shrimp, cooked|shrimp;prawn|4 oz|113|112|27|0|0.3|0.5
Egg|egg;eggs;fried egg;boiled egg;hard boiled egg;scrambled egg;large egg|1 large egg|50|72|6.3|0.4|4.8|1
Egg whites|egg white|1 egg white|33|17|3.6|0.2|0.1|
Omelette, 3-egg with cheese|omelette;omelet;cheese omelette|1 omelette|200|360|26|2|28|
Tofu, firm|tofu|3 oz|85|122|15|2.4|7.4|
Whey protein powder|protein powder;whey;protein scoop;scoop of protein;whey protein|1 scoop|30|120|24|3|1.5|
Protein shake, ready-to-drink|protein shake;protein drink;premier protein;fairlife shake;core power|1 bottle (11 oz)|325|160|30|5|3|
Protein bar|protein bar;quest bar;rxbar|1 bar|60|210|20|23|7|
Greek yogurt, nonfat plain|greek yogurt;plain greek yogurt;nonfat greek yogurt;chobani;fage|1 container (170 g)|170|90|16|6|0|
Yogurt, flavored|yogurt;flavored yogurt;fruit yogurt|1 container (150 g)|150|140|5|25|2|
Cottage cheese, 2%|cottage cheese|1/2 cup|113|90|12|5|2.5|
Milk, 2%|milk;2 percent milk;reduced fat milk|1 cup|244|122|8|12|5|0.25
Whole milk|whole milk|1 cup|244|149|8|12|8|0.25
Skim milk|skim milk;nonfat milk;fat free milk|1 cup|245|83|8|12|0.2|0.25
Almond milk, unsweetened|almond milk|1 cup|240|30|1|1|2.5|0.25
Oat milk|oat milk|1 cup|240|120|3|16|5|0.25
Chocolate milk|chocolate milk|1 cup|250|190|8|30|5|
Cheddar cheese|cheese;cheddar;shredded cheese;cheddar cheese;cheese slice|1 slice (1 oz)|28|113|7|0.4|9.3|0.5
American cheese|american cheese;kraft single|1 slice|21|65|3.5|1.5|5|1
Mozzarella|mozzarella;mozz;string cheese|1 oz|28|85|6.3|0.7|6.3|0.5
Parmesan|parmesan;parm|1 tbsp|5|21|1.9|0.2|1.4|1
Feta|feta|1 oz|28|75|4|1.2|6|0.5
Cream cheese|cream cheese|1 tbsp|14|50|0.9|0.8|5|1
Butter|butter|1 tbsp|14|102|0.1|0|11.5|0.5
Olive oil|olive oil;oil;cooking oil;vegetable oil;canola oil;avocado oil;sesame oil;sesame seed oil;coconut oil;peanut oil;sunflower oil|1 tbsp|13.5|119|0|0|13.5|0.5
Peanut butter|peanut butter;pb;almond butter;nut butter|2 tbsp|32|190|7|7|16|0.5
Almonds|almonds;almond|1 oz|28|164|6|6|14|
Mixed nuts|nuts;mixed nuts;cashews;walnuts;pecans;peanuts|1 oz|28|170|5|6|15|
Avocado|avocado;avo|1/2 avocado|75|120|1.5|6.5|11|0.5
Guacamole|guacamole;guac|2 tbsp|30|50|0.6|2.6|4.4|1
Hummus|hummus|2 tbsp|30|70|2|4|5|
White rice, cooked|rice;white rice;jasmine rice;basmati rice;steamed rice|1 cup|158|205|4.3|45|0.4|
Brown rice, cooked|brown rice|1 cup|195|218|4.5|46|1.6|
Pasta, cooked|pasta;spaghetti;noodles;penne;macaroni|1 cup|140|221|8|43|1.3|
Spaghetti with meat sauce|spaghetti and meatballs;spaghetti with meat sauce;spaghetti bolognese;bolognese|1 plate (2 cups)|500|600|28|75|20|
Bread|bread;toast;slice of bread;white bread;wheat bread;sourdough|1 slice|30|80|3|14|1|
Bagel|bagel|1 bagel|105|280|11|55|1.5|
English muffin|english muffin|1 muffin|57|134|4.4|26|1|
Hamburger bun|bun;burger bun;hot dog bun|1 bun|50|140|4.5|26|2|
Dinner roll|dinner roll;roll;biscuit|1 roll|40|120|3.5|19|3.5|
Flour tortilla (8 in)|tortilla;flour tortilla;wrap|1 tortilla|49|146|4|25|3.6|
Corn tortilla|corn tortilla|1 tortilla|26|57|1.5|12|0.7|
Oatmeal, cooked|oatmeal;porridge|1 cup|234|166|6|28|3.6|
Rolled oats, dry|oats;rolled oats;dry oats;overnight oats|1/2 cup|40|150|5|27|2.5|
Cereal|cereal;cheerios;corn flakes;frosted flakes|1 cup|30|110|2.5|24|1|
Granola|granola|1/2 cup|60|280|7|35|12|
Pancake|pancake;pancakes;flapjack|1 pancake (5 in)|50|110|3|15|4|
Waffle|waffle;waffles|1 waffle|75|220|6|25|11|
French toast|french toast|1 slice|65|150|5|17|7|
Maple syrup|syrup;maple syrup;pancake syrup|2 tbsp|40|104|0|27|0|1
Baked potato|potato;baked potato;potatoes|1 medium|173|161|4.3|37|0.2|
Sweet potato|sweet potato;yam|1 medium|114|103|2.3|24|0.2|
French fries|fries;french fries;chips fries|1 medium order|117|365|4|48|17|
Hash browns|hash brown;hashbrown|1 patty|53|150|1.5|15|9|
Mashed potatoes|mashed potato;mashed potatoes|1 cup|210|237|4|35|9|
Quinoa, cooked|quinoa|1 cup|185|222|8|39|3.6|
Crackers|crackers;cracker;ritz;saltines|5 crackers|16|80|1|10|4.5|
Potato chips|chips;potato chips;lays;crisps|1 oz|28|152|2|15|10|
Tortilla chips|tortilla chips;nacho chips|1 oz|28|140|2|18|7|
Popcorn|popcorn|3 cups|24|100|3|19|1.2|
Pretzels|pretzels;pretzel|1 oz|28|108|2.9|22.5|0.8|
Rice cake|rice cake;rice cakes|1 cake|9|35|0.7|7.3|0.3|
Banana|banana|1 medium|118|105|1.3|27|0.4|0.5
Apple|apple|1 medium|182|95|0.5|25|0.3|
Orange|orange;clementine;mandarin|1 medium|131|62|1.2|15.4|0.2|
Strawberries|strawberries;strawberry|1 cup|152|49|1|11.7|0.5|0.5
Blueberries|blueberries;blueberry|1 cup|148|84|1.1|21|0.5|0.5
Mixed berries|berries;mixed berries;raspberries;blackberries|1 cup|145|70|1|17|0.5|0.5
Grapes|grapes;grape|1 cup|151|104|1.1|27|0.2|
Watermelon|watermelon|1 cup|152|46|0.9|11.5|0.2|
Pineapple|pineapple|1 cup|165|82|0.9|21.6|0.2|
Mango|mango|1 cup|165|99|1.4|25|0.6|
Peach|peach;nectarine|1 medium|150|59|1.4|14|0.4|
Pear|pear|1 medium|178|101|0.6|27|0.2|
Raisins|raisins|1 small box|43|129|1.3|34|0.2|
Orange juice|orange juice;oj|1 cup|248|112|1.7|26|0.5|
Apple juice|apple juice;juice|1 cup|248|114|0.2|28|0.3|
Broccoli|broccoli|1 cup|156|55|3.7|11|0.6|
Salad greens|lettuce;greens;mixed greens;spring mix;romaine|2 cups|85|15|1|3|0.2|0.25
Spinach|spinach|1 cup|30|7|0.9|1.1|0.1|
Green beans|green beans|1 cup|125|44|2.4|10|0.4|
Carrot|carrot;carrots;baby carrots|1 medium|61|25|0.6|6|0.1|
Corn|corn;sweet corn|1 cup|145|140|5|31|2|0.25
Corn on the cob|corn on the cob;ear of corn|1 ear|103|99|3.5|22|1.5|
Mixed vegetables|vegetables;veggies;mixed vegetables;stir fry vegetables|1 cup|160|80|4|16|0.5|0.5
Tomato|tomato;tomatoes|1 medium|123|22|1.1|4.8|0.2|0.25
Bell pepper|pepper;peppers;bell pepper|1 cup|149|30|1.5|7|0.3|0.25
Onion|onion;onions|1/2 cup|80|32|0.9|7.5|0.1|0.25
Cucumber|cucumber|1 cup|104|16|0.7|3.8|0.1|
Asparagus|asparagus|1 cup|180|40|4.3|7.4|0.4|
Black beans|black beans;beans;pinto beans;kidney beans|1/2 cup|86|114|7.6|20|0.5|0.5
Refried beans|refried beans|1/2 cup|121|120|6|18|1.5|0.5
Chickpeas|chickpeas;garbanzo beans|1/2 cup|82|134|7.3|22.5|2.1|
Lentils, cooked|lentils|1/2 cup|99|115|9|20|0.4|
Salsa|salsa;pico de gallo;pico|2 tbsp|32|10|0.5|2|0|1
Ketchup|ketchup|1 tbsp|17|20|0.2|5|0|1
Mustard|mustard|1 tsp|5|3|0.2|0.3|0.2|1
Mayonnaise|mayo;mayonnaise|1 tbsp|14|94|0.1|0.1|10.3|1
Ranch dressing|ranch;ranch dressing|2 tbsp|30|129|0.4|1.8|13.4|1
Salad dressing|dressing;salad dressing;vinaigrette;italian dressing;caesar dressing|2 tbsp|30|100|0|4|9|1
BBQ sauce|bbq sauce;barbecue sauce|2 tbsp|36|60|0|15|0|1
Sour cream|sour cream|2 tbsp|24|50|0.6|1.1|4.8|1
Honey|honey|1 tbsp|21|64|0.1|17|0|1
Sugar|sugar|1 tsp|4|16|0|4|0|1
Jam|jam;jelly;preserves|1 tbsp|20|56|0.1|14|0|1
Soy sauce|soy sauce|1 tbsp|16|9|1.3|0.8|0|1
Hot sauce|hot sauce;sriracha;buffalo sauce|1 tsp|5|1|0|0.1|0|1
Marinara sauce|marinara;tomato sauce;pasta sauce|1/2 cup|125|70|2|10|2|
Alfredo sauce|alfredo;alfredo sauce|1/4 cup|60|110|2|3|10|
Gravy|gravy|1/4 cup|60|30|1|4|1|1
Chicken taco|chicken taco|1 taco|100|180|12|15|7|
Beef taco|taco;tacos;beef taco;hard shell taco|1 taco|78|170|8|13|10|
Fish taco|fish taco|1 taco|120|220|12|20|10|
Steak taco|steak taco;carne asada taco|1 taco|100|190|13|14|9|
Burrito|burrito;chicken burrito;steak burrito;bean burrito|1 burrito|400|750|40|85|25|
Burrito bowl|burrito bowl;chipotle bowl;rice bowl|1 bowl|450|650|40|70|20|
Quesadilla|quesadilla;chicken quesadilla;cheese quesadilla|1 quesadilla|230|520|30|38|27|
Nachos|nachos|1 plate|300|800|25|80|45|
Enchilada|enchilada;enchiladas|1 enchilada|150|250|14|22|12|
Cheeseburger|burger;cheeseburger;quarter pounder|1 burger|200|520|30|42|26|
Hamburger|hamburger;small burger|1 burger|100|250|12|31|9|
Double cheeseburger|double cheeseburger;double burger|1 burger|270|740|48|43|42|
Hot dog|hot dog;hotdog|1 hot dog in bun|100|300|11|24|17|
Cheese pizza|pizza;cheese pizza;slice of pizza;pizza slice|1 slice|107|285|12|36|10|
Pepperoni pizza|pepperoni pizza|1 slice|110|313|13|36|13|
Grilled chicken sandwich|grilled chicken sandwich|1 sandwich|220|390|30|44|11|
Fried chicken sandwich|chicken sandwich;fried chicken sandwich;chick fil a sandwich|1 sandwich|180|420|29|41|18|
Turkey sandwich|turkey sandwich;deli sandwich;sandwich|1 sandwich|220|400|25|40|15|
Sub sandwich (6 in)|sub;subway;6 inch sub;hoagie|1 six-inch sub|220|350|20|46|9|
PB&J sandwich|pb&j;pbj;peanut butter and jelly;peanut butter jelly sandwich|1 sandwich|110|400|13|50|17|
Grilled cheese|grilled cheese|1 sandwich|130|440|17|30|28|
BLT|blt|1 sandwich|150|350|13|30|20|
Chicken wrap|chicken wrap;wrap sandwich|1 wrap|250|500|30|45|20|
Breakfast sandwich|breakfast sandwich;egg mcmuffin;sausage mcmuffin;bacon egg and cheese|1 sandwich|150|400|18|30|22|
Breakfast burrito|breakfast burrito|1 burrito|250|450|20|35|25|
Chicken caesar salad|caesar salad;chicken caesar;chicken caesar salad|1 entrée salad|350|450|35|15|28|
Garden salad|salad;side salad;garden salad|1 side salad|150|40|2|7|0.5|
Sushi roll|sushi;sushi roll;california roll;spicy tuna roll|1 roll (8 pieces)|220|280|10|40|8|
Fried rice|fried rice|1 cup|180|330|12|42|12|
Orange chicken|orange chicken;general tso;general tsos chicken;sesame chicken|1 entrée|160|490|25|51|23|
Lo mein|lo mein;chow mein|1 cup|200|300|11|42|10|
Pad thai|pad thai|1 cup|200|375|15|45|15|
Instant ramen|ramen;instant ramen;cup noodles|1 package|85|380|8|52|14|
Pho|pho|1 bowl|700|450|30|55|10|
Mac and cheese|mac and cheese;mac n cheese;macaroni and cheese|1 cup|200|380|15|48|14|
Lasagna|lasagna|1 piece|250|380|22|34|17|
Chili|chili;chili con carne|1 cup|253|260|18|24|10|
Chicken noodle soup|soup;chicken noodle soup|1 cup|245|90|6|10|2.5|
Chicken curry|curry;chicken curry;tikka masala;butter chicken|1 cup|240|300|25|10|18|
Gyro|gyro|1 gyro|250|600|28|50|30|
Poke bowl|poke;poke bowl|1 bowl|450|650|35|80|18|
Fried chicken|fried chicken;fried chicken piece;drumstick|1 piece|110|290|20|10|19|
Meatballs|meatball;meatballs|3 meatballs|85|220|14|6|15|
Chocolate bar|chocolate;chocolate bar;candy bar;hershey bar;snickers|1 bar (1.5 oz)|43|215|3|27|12|
Dark chocolate|dark chocolate|1 oz|28|170|2.2|13|12|
Cookie|cookie;cookies;chocolate chip cookie|1 cookie|25|120|1.5|16|6|
Brownie|brownie|1 brownie|56|230|3|30|12|
Donut|donut;doughnut;glazed donut|1 donut|52|190|3|22|11|
Muffin|muffin;blueberry muffin|1 bakery muffin|113|400|6|55|17|
Croissant|croissant|1 medium|57|231|4.7|26|12|
Ice cream|ice cream|1/2 cup|66|137|2.3|16|7.3|
Cake|cake;birthday cake;slice of cake|1 slice|100|350|3|50|15|
Pie|pie;apple pie|1 slice|125|296|2.4|42|14|
Granola bar|granola bar;nature valley;chewy bar|1 bar|24|100|1.5|17|3|
Trail mix|trail mix|1 oz|28|140|4|13|9|
Beef jerky|jerky;beef jerky|1 oz|28|80|13|5|1|
Gummy candy|gummies;gummy bears;gummy candy;candy|1 serving|40|130|2|31|0|
Smoothie|smoothie;fruit smoothie|16 fl oz|475|290|4|66|1.5|
Acai bowl|acai bowl;acai|1 bowl|400|500|7|90|14|
Milkshake|milkshake;shake|16 fl oz|475|580|13|90|18|
Diet soda|diet soda;diet coke;coke zero;pepsi zero;diet pepsi;sprite zero;zero sugar soda;zero soda|1 can (12 oz)|355|0|0|0|0|
Sparkling water|sparkling water;seltzer;la croix;soda water;club soda|1 can (12 oz)|355|0|0|0|0|
Water|water|1 cup|240|0|0|0|0|
Black coffee|coffee;black coffee;americano;espresso;cold brew|1 cup|240|2|0.3|0|0|
Tea, unsweetened|tea;green tea;black tea;unsweetened tea|1 cup|240|2|0|0.5|0|
Sweet tea|sweet tea|16 fl oz|475|180|0|45|0|
Soda|soda;coke;pepsi;sprite;cola;pop;dr pepper;mountain dew|1 can (12 oz)|355|140|0|39|0|
Sports drink|gatorade;powerade;sports drink|20 fl oz|590|140|0|36|0|
Energy drink|energy drink;red bull|1 can (8.4 oz)|250|110|0.5|28|0|
Monster energy|monster|1 can (16 oz)|475|210|0|54|0|
Sugar-free energy drink|celsius;sugar free red bull;sugar free energy drink;bang;ghost energy;monster zero;zero sugar monster|1 can|355|10|0|2|0|
Latte (2% milk)|latte;cappuccino;flat white|16 fl oz|475|190|13|19|7|
Frappuccino|frappuccino;frappe;blended coffee|16 fl oz|475|380|5|54|15|
Coffee creamer|creamer;coffee creamer|1 tbsp|15|35|0|5|1.5|1
Half and half|half and half;cream|1 tbsp|15|20|0.4|0.6|1.7|1
Beer|beer;ipa;lager|12 fl oz|355|153|1.6|13|0|
Light beer|light beer;bud light;coors light;miller lite;michelob ultra|12 fl oz|355|103|0.9|5.8|0|
Wine|wine;red wine;white wine;glass of wine|5 fl oz|148|125|0.1|4|0|
Liquor shot|shot;vodka;whiskey;tequila;rum;gin;bourbon|1.5 fl oz|44|97|0|0|0|
Margarita|margarita|1 drink|240|280|0|35|0|
Kombucha|kombucha|16 fl oz|475|60|0|14|0|
`

export const LOCAL_FOODS: Food[] = RAW.trim().split('\n').map((line, i) => {
  const [name, aliases, label, g, kcal, p, c, f, top] = line.split('|')
  return {
    key: `local:${i}`, name, source: 'local' as const, aliases: aliases.split(';').filter(Boolean), topping: top ? Number(top) : undefined,
    servings: [{ label, g: Number(g), kcal: Number(kcal), p: Number(p), c: Number(c), f: Number(f) }],
  }
})

// ---------- Text matching ----------

/** lowercase, strip punctuation, singularize each word ("tacos" → "taco", "berries" → "berry"). */
export function norm(s: string): string[] {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular)
}
function singular(w: string) {
  if (w.length <= 3 || /ss$|us$|is$/.test(w)) return w
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y'
  if (/(ch|sh|x|o)es$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w)) return w.slice(0, -1)
  return w
}

const keysOf = (f: Food) => [f.name.replace(/,.*$/, ''), f.name, ...(f.aliases ?? [])].map(norm)

/** Index of `needle` as a contiguous run inside `hay`, or -1. */
export function findRun(hay: string[], needle: string[]) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/** Best food whose name/alias appears word-for-word in the phrase. Longer matches win. */
export function bestMatch(phrase: string[], foods: Food[]): { food: Food; at: number; len: number } | null {
  let best: { food: Food; at: number; len: number; score: number } | null = null
  for (const food of foods) {
    for (const k of keysOf(food)) {
      if (!k.length) continue
      const at = findRun(phrase, k)
      if (at < 0) continue
      // Prefer more words matched, then built-in foods over recents (recent names are long and brand-specific).
      const score = k.length * 10 + (food.source === 'local' ? 1 : 0)
      if (!best || score > best.score) best = { food, at, len: k.length, score }
    }
  }
  return best && { food: best.food, at: best.at, len: best.len }
}

/** Type-ahead search over built-in (and optionally recent) foods. Every query word must prefix a word in the food's names. */
export function searchLocal(q: string, foods: Food[] = LOCAL_FOODS, limit = 12): Food[] {
  const qs = norm(q)
  if (!qs.length) return []
  const scored: [number, Food][] = []
  for (const f of foods) {
    let best = 0
    for (const k of keysOf(f)) {
      const hits = qs.filter((w) => k.some((t) => t.startsWith(w))).length
      const exact = qs.filter((w) => k.includes(w)).length
      // Every word matches → strong; otherwise a whole-word match of most of the key ("sesame seed oil" → "sesame oil", "oil") ranks lower.
      const s = hits === qs.length ? 100 + exact * 3 - k.length * 2 + (k[0]?.startsWith(qs[0]) ? 5 : 0)
        : exact > 0 && exact >= k.length * 0.6 && k.every((t) => t.length >= 3) ? 50 + exact * 5 - k.length : 0
      best = Math.max(best, s)
    }
    if (best) scored.push([best, f])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, f]) => f)
}

/** Turn a past log entry back into a food you can log again. */
export function foodFromLog(l: FoodLog): Food {
  const base: Serving = l.base ?? { label: '1 serving', kcal: Math.round(l.kcal / (l.servings || 1)), p: l.protein_g / (l.servings || 1), c: l.carbs_g / (l.servings || 1), f: l.fat_g / (l.servings || 1) }
  return { key: `recent:${l.id}`, name: l.name, detail: l.detail && l.base ? undefined : l.detail || undefined, servings: [base], source: 'recent', barcode: l.barcode || undefined }
}

/** Macros for `servings` of a serving, or for a gram amount when grams > 0. */
export function macrosFor(s: Serving, servings: number): Macros {
  return { kcal: Math.round(s.kcal * servings), p: Math.round(s.p * servings * 10) / 10, c: Math.round(s.c * servings * 10) / 10, f: Math.round(s.f * servings * 10) / 10 }
}

// ---------- Open Food Facts ----------

const OFF = 'https://world.openfoodfacts.org'
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments,quantity'

type OffProduct = {
  code?: string; product_name?: string; product_name_en?: string; generic_name?: string; brands?: string | string[]
  serving_size?: string; serving_quantity?: number | string; nutriments?: Record<string, number | string | undefined>
}

const numOf = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN }

/** Normalizes an Open Food Facts product. Null when it has no usable calorie data. */
export function fromOff(p: OffProduct): Food | null {
  const name = (p.product_name_en || p.product_name || p.generic_name || '').trim()
  const n = p.nutriments ?? {}
  if (!name) return null
  const per = (suffix: '_100g' | '_serving') => {
    let kcal = numOf(n[`energy-kcal${suffix}`])
    if (!Number.isFinite(kcal)) { const kj = numOf(n[`energy${suffix}`]); if (Number.isFinite(kj)) kcal = kj / 4.184 }
    if (!Number.isFinite(kcal)) return null
    const g = (k: string) => { const v = numOf(n[`${k}${suffix}`]); return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0 }
    return { kcal: Math.round(kcal), p: g('proteins'), c: g('carbohydrates'), f: g('fat') }
  }
  const per100 = per('_100g'), perServing = per('_serving')
  const sq = numOf(p.serving_quantity)
  const servings: Serving[] = []
  if (sq > 0 && per100) {
    const k = sq / 100
    servings.push({ label: p.serving_size?.trim() || `${sq} g`, g: sq, kcal: Math.round(per100.kcal * k), p: Math.round(per100.p * k * 10) / 10, c: Math.round(per100.c * k * 10) / 10, f: Math.round(per100.f * k * 10) / 10 })
  } else if (perServing && p.serving_size) {
    servings.push({ label: p.serving_size.trim(), ...perServing, g: sq > 0 ? sq : undefined })
  }
  if (per100) servings.push({ label: '100 g', g: 100, ...per100 })
  if (!servings.length) return null
  const brand = (Array.isArray(p.brands) ? p.brands.join(',') : p.brands ?? '').split(',')[0]?.trim()
  return { key: `off:${p.code ?? name}`, name, detail: brand || undefined, servings, source: 'off', barcode: p.code }
}

const dedupe = (products: OffProduct[]) => {
  const seen = new Set<string>()
  return products.map(fromOff).filter((f): f is Food => {
    if (!f) return false
    const k = `${f.name.toLowerCase()}|${f.detail?.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

/**
 * Search foods & brands online. Goes through our own server (/api/betterlift/food-search), which asks FatSecret
 * (results already in app shape) and falls back to Open Food Facts; if the server doesn't have that route yet,
 * calls OFF's older endpoint directly.
 */
export async function searchOff(q: string, signal?: AbortSignal): Promise<Food[]> {
  try {
    const d = await pb.send<{ foods?: Food[]; products?: OffProduct[] }>('/api/betterlift/food-search', { query: { q }, signal, requestKey: null })
    if (d.foods?.length) return d.foods.filter((f) => f.servings?.length)
    return dedupe(d.products ?? [])
  } catch (e) {
    const err = e as { status?: number; isAbort?: boolean; name?: string }
    if (err.isAbort || err.name === 'AbortError') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    if (err.status !== 404) throw new Error('Food search is unavailable right now. Common foods above still work.')
  }
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`
  let res: Response
  try { res = await fetch(url, { signal }) } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('Food search is unavailable right now. Common foods above still work.')
  }
  if (!res.ok) throw new Error(res.status === 429 ? 'Food search is busy. Try again in a minute.' : 'Food search is unavailable right now. Common foods above still work.')
  return dedupe(((await res.json()) as { products?: OffProduct[] }).products ?? [])
}

const lookups = new Map<string, Promise<Food | null>>()
/**
 * Best FatSecret match for a phrase from Describe ("quinoa salad"), or null. Only FatSecret results count (the Open Food
 * Facts fallback is packaged products, too hit-and-miss to pick one automatically). Cached per phrase for the session
 * so typing doesn't repeat lookups; failures aren't cached.
 */
export function lookupFood(phrase: string): Promise<Food | null> {
  const k = phrase.trim().toLowerCase()
  if (k.length < 3) return Promise.resolve(null)
  let p = lookups.get(k)
  if (!p) {
    p = searchOff(k).then((list) => list.find((f) => f.source === 'fatsecret') ?? null)
    p.catch(() => lookups.delete(k))
    lookups.set(k, p)
  }
  return p
}

/** Look up a product by barcode. Null when Open Food Facts doesn't know it. */
export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Barcode lookup is unavailable right now.')
  const data = (await res.json()) as { status?: number; product?: OffProduct }
  if (!data.product || data.status === 0) return null
  return fromOff({ code, ...data.product })
}
