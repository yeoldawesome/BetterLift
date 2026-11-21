import type { Food } from './foods'

/**
 * Restaurant menus for the meal describer: "a burrito from Chipotle with chicken…" uses these instead of generic foods.
 * Values per standard portion, from each chain's published nutrition info. Rounded.
 */

export type Restaurant = {
  id: string
  name: string
  /** Ways people say it ("panda", "chipotles"). Lowercase. */
  aliases: string[]
  foods: Food[]
  /** Order formats: what each one adds by itself (a burrito = a tortilla; a bowl = nothing). `of` is a menu item name. */
  formats: { aliases: string[]; label: string; adds: { of: string; servings: number }[] }[]
}

// name | aliases (;-separated) | serving label | grams | kcal | protein | carbs | fat
const menu = (id: string, brand: string, raw: string): Food[] => raw.trim().split('\n').map((line, i) => {
  const [name, aliases, label, g, kcal, p, c, f] = line.split('|')
  return {
    key: `rest:${id}:${i}`, name: `${brand} ${name}`, detail: brand, source: 'local' as const,
    aliases: [name.toLowerCase(), ...aliases.split(';').filter(Boolean)],
    servings: [{ label, g: Number(g) || undefined, kcal: Number(kcal), p: Number(p), c: Number(c), f: Number(f) }],
  }
})

const CHIPOTLE = menu('chipotle', 'Chipotle', `
Burrito tortilla|flour tortilla;tortilla;burrito tortilla|1 tortilla|113|320|8|50|9
Taco tortilla, flour|soft taco;flour taco;soft taco tortilla;taco tortilla|1 tortilla|28|80|2|13|2.5
Taco shell, crispy corn|crispy taco;hard taco;crispy corn tortilla;hard shell;crispy shell|1 shell|19|70|1|10|3
Chicken|grilled chicken;chicken|4 oz|113|180|32|0|7
Chicken al pastor|al pastor;pastor;chicken al pastor|4 oz|113|200|23|4|11
Steak|steak;carne asada|4 oz|113|150|21|1|6
Barbacoa|barbacoa;shredded beef|4 oz|113|170|24|2|7
Carnitas|carnitas;pork|4 oz|113|210|23|0|12
Sofritas|sofritas;tofu|4 oz|113|150|8|9|10
White rice|rice;white rice;cilantro lime rice;cilantro lime white rice|4 oz|113|210|4|40|4
Brown rice|brown rice;cilantro lime brown rice|4 oz|113|210|4|36|6
Black beans|black beans;black bean|4 oz|113|130|8|22|1.5
Pinto beans|pinto beans;pinto;brown beans;beans|4 oz|113|130|8|21|1.5
Fajita veggies|fajita veggies;fajitas;fajita vegetables;veggies;peppers and onions|2 oz|57|20|0|5|0
Fresh tomato salsa|mild salsa;pico;pico de gallo;tomato salsa;fresh tomato salsa;salsa|4 oz|113|25|0|4|0
Roasted chili-corn salsa|corn salsa;corn;medium salsa;roasted chili corn salsa|4 oz|113|80|3|16|1.5
Tomatillo-green chili salsa|green salsa;tomatillo green salsa;verde;salsa verde|2 oz|57|15|0|4|0
Tomatillo-red chili salsa|red salsa;hot salsa;tomatillo red salsa|2 oz|57|30|0|4|0
Sour cream|sour cream|2 oz|57|110|2|2|9
Cheese|cheese;shredded cheese;monterey jack|1 oz|28|110|6|1|8
Guacamole|guac;guacamole|4 oz|113|230|2|8|22
Queso blanco|queso;queso blanco|2 oz|57|120|5|4|9
Romaine lettuce|lettuce;romaine|1 oz|28|5|0|1|0
Supergreens lettuce blend|supergreens;salad greens;greens;super greens|3 oz|85|15|1|3|0
Chipotle-honey vinaigrette|vinaigrette;dressing;honey vinaigrette|2 oz|57|220|1|16|16
Chips|chips;tortilla chips|1 bag|113|540|7|73|25
Chips & guacamole|chips and guac;chips and guacamole;chips & guac|1 order|226|770|9|81|47
Chips & queso blanco|chips and queso;chips & queso|1 order|226|780|16|81|43
`)

const PANDA = menu('panda', 'Panda Express', `
Orange Chicken|orange chicken|1 entrée (5.7 oz)|162|490|25|51|23
Beijing Beef|beijing beef|1 entrée (5.6 oz)|159|470|13|46|26
Broccoli Beef|broccoli beef;beef broccoli|1 entrée (5.4 oz)|153|150|9|13|7
Kung Pao Chicken|kung pao chicken;kung pao|1 entrée (6.2 oz)|176|290|16|14|19
Grilled Teriyaki Chicken|teriyaki chicken;grilled teriyaki chicken;teriyaki|1 entrée (6 oz)|170|300|36|8|13
String Bean Chicken Breast|string bean chicken;string bean chicken breast;green bean chicken|1 entrée (5.6 oz)|159|210|12|13|12
Black Pepper Angus Steak|black pepper angus steak;angus steak;pepper steak;steak|1 entrée (5.4 oz)|153|180|19|10|7
Honey Walnut Shrimp|honey walnut shrimp;walnut shrimp;shrimp|1 entrée (3.9 oz)|111|360|13|35|23
Mushroom Chicken|mushroom chicken|1 entrée (5.7 oz)|162|220|13|10|14
SweetFire Chicken Breast|sweetfire chicken;sweet fire chicken;sweetfire chicken breast|1 entrée (5.4 oz)|153|380|15|47|15
Black Pepper Chicken|black pepper chicken|1 entrée (5.6 oz)|159|280|13|15|19
Honey Sesame Chicken Breast|honey sesame chicken;sesame chicken|1 entrée (5.6 oz)|159|340|16|35|15
Chow Mein|chow mein;noodles;lo mein|1 side (9.4 oz)|266|510|13|80|20
Fried Rice|fried rice|1 side (9.3 oz)|264|520|11|85|16
White Steamed Rice|white rice;steamed rice;rice;white steamed rice|1 side (8.1 oz)|230|380|7|87|0
Super Greens|super greens;greens;veggies;mixed veggies;vegetables|1 side (9.1 oz)|258|90|6|10|3
Chicken Egg Roll|egg roll;chicken egg roll|1 roll|85|200|6|20|10
Veggie Spring Roll|spring roll;veggie spring roll|1 roll|45|120|2|17|5
Cream Cheese Rangoon|rangoon;crab rangoon;cream cheese rangoon|3 pieces|72|190|5|24|8
`)

const OLIVE = menu('olive', 'Olive Garden', `
Breadstick|breadstick;breadsticks;bread stick;garlic breadstick;bread|1 breadstick|50|140|4|25|2.5
Famous House Salad (no dressing)|house salad;salad;garden salad;famous house salad|1 serving|130|70|3|11|2
Signature Italian Dressing|italian dressing;dressing;house dressing|1 serving (1.5 oz)|43|80|0|3|8
Zuppa Toscana|zuppa toscana;zuppa;sausage potato soup|1 bowl|255|220|7|15|15
Chicken & Gnocchi Soup|chicken gnocchi;chicken and gnocchi;chicken gnocchi soup;gnocchi soup|1 bowl|255|230|11|25|10
Minestrone|minestrone;minestrone soup;vegetable soup|1 bowl|255|110|4|18|1.5
Pasta e Fagioli|pasta e fagioli;pasta fagioli;fagioli|1 bowl|255|150|8|18|5
Fettuccine Alfredo|fettuccine alfredo;fettuccini alfredo;alfredo;fettuccine|1 dinner|482|1310|36|116|75
Chicken Alfredo|chicken alfredo;chicken fettuccine alfredo;chicken fettuccine;grilled chicken alfredo|1 dinner|595|1570|86|98|89
Shrimp Alfredo|shrimp alfredo;shrimp fettuccine alfredo;shrimp fettuccine|1 dinner|560|1430|66|98|81
Chicken & Shrimp Carbonara|carbonara;chicken and shrimp carbonara;chicken carbonara|1 dinner|560|1390|68|92|82
Chicken Parmigiana|chicken parmigiana;chicken parm;chicken parmesan|1 dinner|595|1060|81|82|46
Eggplant Parmigiana|eggplant parmigiana;eggplant parm;eggplant parmesan|1 dinner|595|1060|34|108|54
Lasagna Classico|lasagna;lasagna classico;lasagne;meat lasagna|1 dinner|510|940|56|52|54
Tour of Italy|tour of italy|1 dinner|680|1520|82|99|88
Five Cheese Ziti al Forno|ziti;five cheese ziti;5 cheese ziti;ziti al forno;baked ziti|1 dinner|595|1080|44|113|49
Spaghetti with Meat Sauce|spaghetti with meat sauce;spaghetti meat sauce;spaghetti bolognese;meat sauce|1 dinner|482|700|37|96|18
Spaghetti with Marinara|spaghetti with marinara;spaghetti marinara;spaghetti;marinara pasta|1 dinner|425|480|17|87|7
Spaghetti with Meatballs|spaghetti and meatballs;spaghetti with meatballs;spaghetti meatballs|1 dinner|595|1110|55|104|51
Cheese Ravioli|cheese ravioli;ravioli|1 dinner|425|610|28|66|26
Chicken Marsala|chicken marsala;marsala|1 dinner|510|840|63|48|45
Chicken Scampi|chicken scampi|1 dinner|595|1050|59|89|51
Shrimp Scampi|shrimp scampi;scampi|1 dinner|425|510|34|54|18
Herb-Grilled Salmon|salmon;grilled salmon;herb grilled salmon|1 dinner|340|460|45|8|27
6 oz Sirloin|sirloin;steak;6 oz sirloin;grilled sirloin|1 dinner|310|310|46|9|10
Fried Mozzarella|fried mozzarella;mozzarella sticks;mozz sticks;cheese sticks|1 appetizer|255|900|38|64|56
Calamari|calamari;fried calamari|1 appetizer|255|690|30|60|37
Toasted Ravioli|toasted ravioli;fried ravioli|1 appetizer|255|600|25|56|30
Grilled chicken (add-on)|add chicken;grilled chicken;chicken|1 portion|113|150|28|0|4
Shrimp (add-on)|add shrimp;shrimp|1 portion|85|70|13|1|1.5
Meatballs (add-on)|meatballs;meatball;add meatballs|2 meatballs|142|420|23|11|31
Italian sausage (add-on)|sausage;italian sausage|1 portion|113|390|21|4|32
Tiramisu|tiramisu|1 slice|142|470|7|47|28
Black Tie Mousse Cake|black tie mousse cake;mousse cake;chocolate mousse cake|1 slice|170|750|9|75|47
Chocolate Brownie Lasagna|chocolate brownie lasagna;brownie lasagna|1 slice|227|910|10|108|49
Sicilian Cheesecake|cheesecake;sicilian cheesecake|1 slice|170|730|11|51|54
`)

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'chipotle', name: 'Chipotle', aliases: ['chipotle', 'chipotles', 'chipotle mexican grill'], foods: CHIPOTLE,
    formats: [
      { aliases: ['burrito'], label: 'burrito', adds: [{ of: 'Chipotle Burrito tortilla', servings: 1 }] },
      { aliases: ['burrito bowl', 'bowl'], label: 'bowl', adds: [] },
      { aliases: ['salad'], label: 'salad', adds: [{ of: 'Chipotle Supergreens lettuce blend', servings: 1 }] },
      { aliases: ['crispy tacos', 'crispy taco', 'hard tacos', 'hard taco', 'hard shell tacos'], label: 'tacos', adds: [{ of: 'Chipotle Taco shell, crispy corn', servings: 3 }] },
      { aliases: ['tacos', 'taco', 'soft tacos'], label: 'tacos', adds: [{ of: 'Chipotle Taco tortilla, flour', servings: 3 }] },
    ],
  },
  {
    id: 'panda', name: 'Panda Express', aliases: ['panda express', 'panda', 'pandas'], foods: PANDA,
    formats: [
      { aliases: ['bigger plate'], label: 'bigger plate', adds: [] },
      { aliases: ['plate'], label: 'plate', adds: [] },
      { aliases: ['bowl'], label: 'bowl', adds: [] },
    ],
  },
  {
    id: 'olive', name: 'Olive Garden', aliases: ['olive garden', 'olive gardens', 'olivegarden'], foods: OLIVE,
    formats: [],
  },
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The restaurant named in the text, the text with its name removed, and the order format ("burrito", "bowl") if any. */
export function findRestaurant(text: string): { restaurant: Restaurant; text: string } | null {
  const t = text.toLowerCase().replace(/[’']/g, '')
  for (const r of RESTAURANTS) {
    for (const a of [...r.aliases].sort((x, y) => y.length - x.length)) {
      const re = new RegExp(`\\b(?:(?:from|at|of|in)\\s+(?:the\\s+)?)?${esc(a)}s?\\b`)
      if (!re.test(t)) continue
      // "panda" alone is common enough; "chipotle mayo/sauce/pepper" is a flavor, not the restaurant.
      if (r.id === 'chipotle' && /\bchipotle\s+(mayo|sauce|pepper|aioli|ranch|chicken sandwich|seasoning)\b/.test(t)) continue
      return { restaurant: r, text: t.replace(re, ' ') }
    }
  }
  return null
}
