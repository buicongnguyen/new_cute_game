# Cloudback

*A cozy sky adventure on the back of a growing whale.*

You live on the back of **Bao**, a sky-whale calf, with your grandmother Nana Sumi. You grow fruit trees in the moss on Bao's back and feed Bao so it grows. Then you fly from isle to isle and free each one from **the Gloom**, a grey crystal hush that crusts everything that keeps still. Ring your bell mallet to break the crystal shells and free the animals inside, rescue the islanders, and trade at their markets. The crew grows, and each Hive you break returns a stolen Note of the pod's song. Collect all three, and Bao can dive below the clouds to wake its mother.

**Play:** https://buicongnguyen.github.io/new_cute_game/ (phones and desktop, English and Tiếng Việt)

## How to play

| | Phone | Desktop |
|---|---|---|
| Walk | Drag on the left half of the screen, or tap the ground | WASD or the arrow keys, or click |
| Use the thing in front of you | Tap it, or the big round button | F or Enter |
| Ring the mallet | It rings by itself near the Gloom; 🔔 rings on purpose | Space |
| Chime Spin, Hop, Quick Eat | 🌀 💨 🍐 | Q, E (or Shift), R |

The goal card at the top left always shows your next step.

## The loop

1. Plant seeds in the glowing moss patches.
2. Feed the fruit to Bao.
3. Make a rope at the Workbench.
4. Sail from the map table.
5. Slide down to the isle.
6. Break the Spires, rescue the caged islanders, and break the Hive.
7. Bao sings, and the isle's colour comes back.
8. When Bao has eaten enough and holds the right Note, it grows: a bigger back, more moss patches, and farther isles.

## Develop

```sh
npm install
npm run dev        # http://127.0.0.1:5361
npm test           # rules, economy, whole-story simulation, i18n
npm run build      # type check + production build (dist/)
node scripts/playtest.mjs   # end-to-end browser playtest against the dev server (needs Playwright)
```

Pushing to `main` runs the tests and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Inside

- **Writing:**
  - `docs/STORY.md`: the story, characters and chapters.
  - `docs/DESIGN.md`: every rule and number.
  - `docs/REVIEW-LOG.md`: the three drafts of the story and the three logic checks.
- **Rules:** `src/rules/` holds the rules as pure TypeScript and data. `tests/progression.test.ts` plays the whole story with a scripted player.
- **Game:**
  - `src/world/` draws the game: three.js with toon shading, baked vertex colours, instanced scenery and clouds, and the Gloom tint shader.
  - `src/ui/` is the HUD and the menus.
  - `src/game.ts` ties everything together.
- **Art:** `art/blender/kit/` holds the Blender generators for every model (`docs/ART-CONTRACT.md`). Run them with Blender 4.5 headless: `blender -b --factory-startup --python art/blender/kit/build_<name>.py -- --render`.
- **Engine:** the camera, quality governor and phone-gesture helper come from our earlier game Zoo Garden. All story, art, sound and content are new.
