# v20.39 architecture

## Principle

LMS determines ticket outcome. PixiJS and Matter.js only render it.

### LMS layer

`lms-adapter.js`

Responsible for:
- session;
- balance;
- ticket request;
- scenario;
- win;
- final balance;
- demo ticket in demo mode;
- iframe postMessage events.

### Rendering layer

`src/game.js` + PixiJS

Containers:
- `fieldLayer`;
- `pieceLayer`;
- `fxLayer`.

### Physics layer

Matter.js bodies:
- 12 `chuko-*` bodies;
- 1 `khan` body;
- 1 `saka` body.

No gravity. Fixed 60 Hz physics step.

### Scenario enforcement

| scenario | result |
|---|---|
| 1 | 0 regular chükö |
| 2 | 1 regular chükö |
| 3 | 2 regular chükö |
| 4 | 5 regular chükö |
| 5 | 5 regular chükö + KHAN |

Matter.js handles collisions and motion, but designated scenario targets are selected before the throw. Non-target pieces are kept inside the field, so physics can never turn a losing/other scenario into a different lottery result.

### Reproducibility

Target selection, initial piece variations and impulse directions are seeded from:

```text
ticketId + scenario
```

This allows the same ticket to be visually replayed consistently.

## UI separation

HTML/CSS UI does not depend on `background.webp`.

This means future redesigns can independently replace:
- page background;
- field asset;
- bone assets;
- typography/UI theme;
without changing LMS logic or physics.

Field art now uses `assets/field-clean.webp` with alpha; Pixi also applies an oval mask. The page background stays independent.


### Scenario layer — v20.39

`src/scenario-config.js` является единым источником visual scenario mapping.
`lms-adapter.js` использует его для проверки scenario id и DEMO/mock цикла.
`game.js` использует его только для `{regular, khan}` visual plan.
Монетарный `win` остаётся LMS-authoritative.

### Audio/UI layer — v20.39

Audio is isolated from Matter.js and LMS logic.
`renderState()` observes state transitions for SFX only; no physics function
depends on audio. Ticket number is rendered from `ticket.ticketId`.

### Local recent ticket history — v20.39

A bounded localStorage cache stores only `{ticketId, win}` after `ROUND_COMPLETE`.
REAL and DEMO use separate keys. This is UI convenience only and is not an
authoritative transaction history; authoritative/full history remains in LMS.
