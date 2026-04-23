/**
 * Import 5 LGBTQ+ family travel POIs from newsisout.com (Feb 2023)
 * Source: https://newsisout.com/2023/02/best-travel-spots-for-lgbtq-families/11158/
 *
 * Run: node scripts/import-newsisout-2023.mjs
 */

import pg from "pg";

const SOURCE      = "newsisout-2023";
const SOURCE_DATE = "2023-02-01";

const pois = [
  {
    title:       "Winkel",
    description: "Queer-owned restaurant in Philadelphia's Gayborhood serving Dutch-American brunch and lunch.",
    long_description: "Winkel is a queer-owned café and restaurant located in the heart of Philadelphia's historic Gayborhood. The name is Dutch for 'shop' and reflects the Dutch-American heritage of the menu, with a focus on brunch and lunch. A neighborhood staple for the LGBTQ+ community.",
    lat:           39.9475906,
    lng:          -75.1602238,
    category_id:   8,   // restaurant
    is_verified:   true,
    tags:          ["queer-owned", "restaurant", "brunch", "philadelphia", "gayborhood"],
    street_address: "1119 Locust St, Philadelphia, PA 19107",
    website_url:   "https://www.winkelphilly.com",
    source:        SOURCE,
    source_date:   SOURCE_DATE,
    source_id:     "winkel-philadelphia",
    prominence:    "local",
    effect_scope:  "point",
  },
  {
    title:       "Mission Taqueria",
    description: "Queer-owned upscale taqueria in Center City Philadelphia, known for creative margaritas and tacos.",
    long_description: "Mission Taqueria is a queer-owned restaurant in Philadelphia's Center City offering California-inspired tacos and a celebrated margarita program. Located on the second floor at 1516 Sansom St, it is a welcoming and festive spot for LGBTQ+ families and allies.",
    lat:           39.9502282,
    lng:          -75.1665574,
    category_id:   8,   // restaurant
    is_verified:   true,
    tags:          ["queer-owned", "restaurant", "tacos", "philadelphia", "margaritas"],
    street_address: "1516 Sansom St 2nd Floor, Philadelphia, PA 19102",
    website_url:   "https://www.missiontaqueria.com",
    source:        SOURCE,
    source_date:   SOURCE_DATE,
    source_id:     "mission-taqueria-philadelphia",
    prominence:    "local",
    effect_scope:  "point",
  },
  {
    title:       "Darnel's Cakes (N 3rd St)",
    description: "LGBTQ+-founded bakery in Philadelphia's Northern Liberties neighborhood, original location.",
    long_description: "Darnel's Cakes was founded by Darnel Jermaine Settings, an LGBTQ+ entrepreneur, and has become a beloved Philadelphia institution known for spectacular custom cakes, cookies, and pastries. The original Northern Liberties location at 444 N 3rd St is a community gathering spot.",
    lat:           39.9578620,
    lng:          -75.1441246,
    category_id:   8,   // restaurant
    is_verified:   true,
    tags:          ["lgbtq-founded", "bakery", "cakes", "philadelphia", "northern-liberties"],
    street_address: "444 N 3rd St, Philadelphia, PA 19123",
    website_url:   "https://www.darnelscakes.com",
    source:        SOURCE,
    source_date:   SOURCE_DATE,
    source_id:     "darnels-cakes-n3rd-philadelphia",
    prominence:    "local",
    effect_scope:  "point",
  },
  {
    title:       "Darnel's Cakes (Spring Garden)",
    description: "Second location of the LGBTQ+-founded Philadelphia bakery, opened in the Spring Garden neighborhood.",
    long_description: "The Spring Garden location of Darnel's Cakes opened in 2025, expanding the beloved LGBTQ+-founded Philadelphia bakery to a second neighborhood. Offers the same custom cakes, cookies, and pastries the brand is known for.",
    lat:           39.9613958,
    lng:          -75.1540189,
    category_id:   8,   // restaurant
    is_verified:   true,
    tags:          ["lgbtq-founded", "bakery", "cakes", "philadelphia", "spring-garden"],
    street_address: "990 Spring Garden St, Philadelphia, PA 19123",
    website_url:   "https://www.darnelscakes.com",
    source:        SOURCE,
    source_date:   SOURCE_DATE,
    source_id:     "darnels-cakes-springgarden-philadelphia",
    prominence:    "local",
    effect_scope:  "point",
    review_after:  "2026-07-01",
    review_note:   "Second location opened Aug 2025 — confirm still operating",
  },
  {
    title:       "CampOut Family Camp",
    description: "Annual LGBTQ+ family summer camp held in August at Lake of the Woods / Greenwoods Camp in Decatur, MI.",
    long_description: "CampOut Family Camp is an annual overnight summer camp specifically for LGBTQ+ families and their children. Held each August at the Lake of the Woods and Greenwoods Camp facility in Decatur, Michigan, it offers a safe, affirming environment with traditional camp activities, community building, and programming for all ages.",
    lat:           42.1108,
    lng:          -85.9955,
    category_id:   21,  // trans-camping (LGBTQ+ camping)
    is_verified:   true,
    tags:          ["lgbtq-family", "summer-camp", "annual", "michigan", "campout"],
    street_address: "84600 47 1/2 St, Decatur, MI 49045",
    website_url:   "https://www.campoutfamilycamp.org",
    source:        SOURCE,
    source_date:   SOURCE_DATE,
    source_id:     "campout-family-camp-decatur-mi",
    prominence:    "regional",
    effect_scope:  "point",
    review_after:  "2026-09-01",
    review_note:   "Annual August camp — verify 2026 session is happening",
  },
];

async function main() {
  const client = new pg.Client({
    host:     "192.168.50.233",
    port:     54322,
    user:     "postgres",
    password: "postgres",
    database: "postgres",
  });

  await client.connect();
  console.log("Connected to database");

  let inserted = 0;
  let updated  = 0;

  for (const poi of pois) {
    const existing = await client.query(
      "SELECT id FROM points_of_interest WHERE source = $1 AND source_id = $2",
      [poi.source, poi.source_id]
    );

    const tagsArray = `{${poi.tags.map((t) => `"${t}"`).join(",")}}`;

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE points_of_interest SET
          title            = $1,
          description      = $2,
          long_description = $3,
          geom             = ST_SetSRID(ST_MakePoint($4, $5), 4326),
          category_id      = $6,
          is_verified      = $7,
          tags             = $8,
          street_address   = $9,
          website_url      = $10,
          source_date      = $11,
          prominence       = $12,
          effect_scope     = $13,
          review_after     = $14,
          review_note      = $15
        WHERE source = $16 AND source_id = $17`,
        [
          poi.title, poi.description, poi.long_description,
          poi.lng, poi.lat,
          poi.category_id, poi.is_verified, tagsArray,
          poi.street_address, poi.website_url, poi.source_date,
          poi.prominence, poi.effect_scope,
          poi.review_after ?? null, poi.review_note ?? null,
          poi.source, poi.source_id,
        ]
      );
      console.log(`  Updated: ${poi.title}`);
      updated++;
    } else {
      await client.query(
        `INSERT INTO points_of_interest
          (title, description, long_description, geom, category_id, is_verified,
           tags, street_address, website_url, source, source_date, source_id,
           prominence, effect_scope, review_after, review_note)
         VALUES
          ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7,
           $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17)`,
        [
          poi.title, poi.description, poi.long_description,
          poi.lng, poi.lat,
          poi.category_id, poi.is_verified, tagsArray,
          poi.street_address, poi.website_url,
          poi.source, poi.source_date, poi.source_id,
          poi.prominence, poi.effect_scope,
          poi.review_after ?? null, poi.review_note ?? null,
        ]
      );
      console.log(`  Inserted: ${poi.title}`);
      inserted++;
    }
  }

  await client.end();
  console.log(`\nDone — ${inserted} inserted, ${updated} updated`);
}

main().catch((err) => { console.error(err); process.exit(1); });
