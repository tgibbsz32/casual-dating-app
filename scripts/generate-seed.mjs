/**
 * Generates migrations/seed.sql — fictional demo profiles so Discover is never
 * empty for a brand-new visitor.
 *
 *   node scripts/generate-seed.mjs
 *
 * Three profiles are emitted per city (woman / man / nonbinary), each open to
 * every gender, so a new member of any gender and any preference finds someone
 * within the default 100 km radius of the city they pick.
 *
 * All rows are invented. Photos are generated artwork served by the API from
 * `seed/…` keys — no real person's image is used anywhere.
 *
 * The city list comes from src/cities.json, the same file the app uses, so the
 * two can never drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cities = JSON.parse(readFileSync(join(root, 'src/cities.json'), 'utf8'))

const NAMES = [
  'Maya', 'Diego', 'Sam', 'Priya', 'Noah', 'Amara', 'Leo', 'Yuki', 'Alex', 'Ines',
  'Marcus', 'Zara', 'Tariq', 'Nina', 'Kofi', 'Elena', 'Ravi', 'Chloe', 'Omar', 'Freya',
  'Jae', 'Lucia', 'Ben', 'Sofia', 'Hugo', 'Tessa', 'Andre', 'Mina', 'Felix', 'Rosa',
  'Ivan', 'Leila', 'Cole', 'Anya', 'Milo', 'Nadia', 'Sean', 'Iris', 'Theo', 'Camila',
  'Jonas', 'Ruby', 'Emre', 'Sasha', 'Dario', 'Wren', 'Kenji', 'Alba', 'Nils', 'Faye',
  'Rafael', 'Juniper', 'Owen', 'Suri', 'Matteo', 'Dahlia', 'Kai', 'Talia', 'Bruno', 'Maren',
  'Ezra', 'Nia', 'Sven', 'Lila', 'Tomas', 'Ada', 'Ren', 'Cleo', 'Ari', 'Paloma',
  'Idris', 'Vera', 'Nico', 'Zoe', 'Yara', 'Emil', 'Maeve', 'Arjun', 'Sena', 'Lars',
  'Anouk', 'Rami', 'Isla', 'Kofi', 'Petra', 'Azael', 'Noor', 'Elias', 'Rin', 'Bram',
  'Simone', 'Tomas', 'Hana', 'Jude', 'Amaya', 'Rune', 'Ilaria', 'Cyrus', 'Moa', 'Ferran',
  'Selene', 'Dmitri', 'Ayo', 'Bianca', 'Kenji', 'Zuri', 'Anton', 'Mira', 'Rune', 'Thea',
  'Aurelio', 'Neve', 'Rami', 'Suri', 'Lior', 'Esme', 'Otto', 'Sana', 'Enzo', 'Ingrid',
  'Caspian', 'Yara', 'Milo', 'Tess', 'Rune', 'Amina', 'Stellan', 'Juno', 'Ander', 'Mira',
]

const HOBBIES = [
  'night markets', 'bouldering', 'record shops', 'late-night ramen', 'thrift stores',
  'open-mic nights', 'farmers markets', 'film festivals', 'long bike rides', 'natural wine',
  'board-game nights', 'sea swims', 'pottery classes', 'rooftop sunsets', 'live gig hopping',
  'Sunday roasts', 'road trips', 'street photography', 'hot yoga', 'vinyl digging',
  'home-cooked dinners', 'salsa classes',
]

const PLANS = [
  'Nothing complicated, thanks.',
  'Say what you want, when you want it.',
  'I would rather be honest on day one than clever for a month.',
  'Chemistry first, labels later.',
  'Low effort, high fun — that is the whole brief.',
  'Let us not pretend we are looking for marriage if we are not.',
  'If it turns into something more, great. If not, still great.',
  'Direct messages only. The three-day reply game is not for me.',
]

const INTENTS = ['casual', 'casual', 'casual', 'friends', 'longterm', 'casual']

const INTERESTS = [
  'Coffee', 'Hiking', 'Rooftop bars', 'Live music', 'Gym', 'Travel', 'Cooking', 'Dogs',
  'Cats', 'Art', 'Film nights', 'Brunch', 'Dancing', 'Books', 'Tattoos', 'Sushi',
  'Board games', 'Beach', 'Photography', 'Wine', 'Running', 'Gaming',
]

const GENDERS = ['woman', 'man', 'nonbinary']
const ALL = `'["woman","man","nonbinary"]'`

const sql = s => `'${String(s).replace(/'/g, "''")}'`
const pad = (n, w = 3) => String(n).padStart(w, '0')

const rows = []
let i = 0
cities.forEach((city, ci) => {
  GENDERS.forEach((gender, gi) => {
    i += 1
    const id = `demo-${pad(i)}`
    const name = NAMES[(i - 1) % NAMES.length]
    const hobby = HOBBIES[(i * 5 + ci) % HOBBIES.length]
    const plan = PLANS[(i * 3) % PLANS.length]
    const intent = INTENTS[(i + gi) % INTENTS.length]
    const age = 24 + ((i * 7) % 11) // 24–34
    const bio = `${age}-year-old in ${city.name}. Big on ${hobby}, bigger on ${hobby === 'street photography' ? 'bad coffee' : 'good company'}. ${plan}`
    const picked = []
    for (let k = 0; k < 4; k++) {
      const item = INTERESTS[(i * 4 + k * 7 + ci) % INTERESTS.length]
      if (!picked.includes(item)) picked.push(item)
    }
    const photos =
      i % 2 === 0
        ? sql(`["seed/${id}/0","seed/${id}/1"]`)
        : sql(`["seed/${id}/0"]`)

    rows.push(
      `  ('${id}', ${sql(name)}, ${age}, ${sql(gender)}, ${sql(city.name)}, ${city.lat}, ${city.lng}, ` +
        `${sql(bio)}, '${intent}', ${ALL}, ${sql(JSON.stringify(picked))}, ` +
        `${photos}, 1, 1, 18, 60, 100, 1)`,
    )
    void gi
  })
})

const header = `-- Spark — demo profiles.
--
-- GENERATED FILE — do not edit by hand. Run:  node scripts/generate-seed.mjs
--
-- ${rows.length} fictional accounts across ${cities.length} cities so Discover is never
-- empty for a brand-new visitor. Every profile is open to every gender, so a
-- visitor of any gender and any preference finds candidates in their own city
-- within the default 100 km radius.
--
-- Each row carries demo_auto_like = 1: it likes you back when you like it, so a
-- fresh account can see a real match, a chat thread and the unmatch flow without
-- needing a second live user. Photos use generated placeholder artwork served by
-- the API from seed/… keys — no real person's image is used.
--
-- Delete these rows in production once real members exist.

DELETE FROM messages WHERE match_id IN (
  SELECT id FROM matches WHERE member_low LIKE 'demo-%' OR member_high LIKE 'demo-%'
);
DELETE FROM matches  WHERE member_low LIKE 'demo-%' OR member_high LIKE 'demo-%';
DELETE FROM swipes   WHERE swiper_id LIKE 'demo-%' OR target_id LIKE 'demo-%';
DELETE FROM reports  WHERE reporter_id LIKE 'demo-%' OR target_id LIKE 'demo-%';
DELETE FROM profiles WHERE user_id LIKE 'demo-%';

INSERT INTO profiles
  (user_id, name, age, gender, city, lat, lng, bio, intent, seeking, interests,
   photos, visible, onboarded, age_min, age_max, max_distance_km, demo_auto_like)
VALUES
${rows.join(',\n')};
`

writeFileSync(join(root, 'migrations/seed.sql'), header)
console.log(`wrote migrations/seed.sql — ${rows.length} profiles across ${cities.length} cities`)
