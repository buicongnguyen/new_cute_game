# Working on Cloudback (for Codex and other agents)

Cloudback is a cosy sky-whale game: Vite + TypeScript + three.js 0.180. Read these before starting:

- `docs/DESIGN.md`: the game's rules and budgets.
- `docs/STORY.md`: the five chapters.
- `docs/COPY-PLAN.md`: why each system is coming and what it must feel like.
- `docs/CODEX-TASKS.md`: the task list. Do the tasks **in order**, one task per branch.

## Commands

| Command | Use |
|---|---|
| `npm test` | Rules tests, the story sim, i18n. Must pass. |
| `npm run typecheck` | Must pass. |
| `npm run build` | Build, then pack the models. On Windows, run it from PowerShell with `$env:VITE_BASE_PATH='/new_cute_game/'`. |
| `npm run dev` | Dev server at http://127.0.0.1:5361 |
| `npm run preview` | Preview server at http://127.0.0.1:5362 |
| `node scripts/playtest.mjs` | Browser suite: chapters 1–3, raid, cottage. Needs the dev server running. |
| `node scripts/fleet-playtest.mjs` | Browser suite: Frostfall to the ending. |
| `node scripts/panels-shot.mjs` | Screenshots of every panel, for checking the UI. |

Open `?test` to get the `window.__cloud` test hooks; `src/main.ts` holds the test states.

## Rules

1. **Code layout:**
   - Rules go in `src/rules/` as plain data and pure functions, with Node tests in `tests/`. Rules never import three.js or the DOM.
   - Views go in `src/world/`, the UI in `src/ui/`, and `src/game.ts` wires them together.
2. **Strings:** every player-facing string goes through `t()` with a Vietnamese line in `src/vi.ts`. The i18n test fails on a missing one.
3. **Saves:** a new save field means bumping `SAVE_VERSION` and adding a migration in `src/rules/state.ts`, plus a test that loads the old save.
4. **The story sim must still finish:** `tests/sim.ts` has no stuck runs, and the attentive path takes 45–60 minutes. Teach the sim any new required step.
5. **Phones:**
   - text ≥ 11 px, taps ≥ 44 px (action buttons ≥ 64 px), safe areas respected;
   - at most **three** action buttons on screen at once;
   - check at 360 × 740.
6. **Budgets** (DESIGN §16): Bao's deck ≤ 140 draw calls and ≤ 120k triangles; a land or ship ≤ 200 draw calls; ≤ 3 MB download before play. Many copies of one thing use `InstancedMesh`.
7. **Ports from Zoo Garden:** Zoo Garden is at `../cute_game` and is the owner's own code.
   - Port its logic, then rewrite it for Cloudback's state and names.
   - Put a header comment naming the source file, e.g. `// Ported from cute_game/src/pet-surge.ts`.
   - Don't import from `../cute_game` at runtime.
8. **Borrowed art** (temporary, see below).
9. **Ports and processes:**
   - Use only ports 5361 and 5362; other games use other ports on this machine.
   - Stop only the process you started, by its PID. Never kill by name.
10. **Git:**
    - One branch per task: `codex/<task-id>`.
    - Small commits. Don't push to `main`; the owner merges and deploys (a push to `main` deploys GitHub Pages).
    - Don't edit `.blend` files or Blender scripts in `art/`.

## Borrowed art (temporary)

Later, the owner will have new art made to replace anything that looks too much like Zoo Garden. To make that swap easy:

- Copy any Zoo Garden model into `public/assets/models/borrowed/`, keeping its file name.
- Load it only through `src/world/assets.ts`, by a **Cloudback role name** (e.g. `pet_cloudpup`), never by the Zoo Garden node name in game code. The role-to-file mapping lives in one table, `BORROWED` in `src/world/borrowed.ts`.
- Record every borrowed file in `docs/BORROWED-ASSETS.md`: the role, the source file and node, where it is used, and its size.
- Tint borrowed models toward the Cloudback palette (DESIGN §15) so they don't clash, but don't spend time re-modelling them.
- Borrowed models count toward the 3 MB budget; load the large ones on demand.
- Where no Zoo Garden model fits, use a simple placeholder made of primitives, also listed in `docs/BORROWED-ASSETS.md` with "placeholder".
