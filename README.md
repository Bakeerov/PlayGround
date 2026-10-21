# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/Bakeerov/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/Bakeerov/PlayGround)

- 🎮 [Open the project](https://omgithub.com/Bakeerov/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=Bakeerov%2FPlayGround).
- 💻 [Explore the source](https://github.com/Bakeerov/PlayGround).
- 🛠️ [Check build runs](https://github.com/Bakeerov/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/Bakeerov/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/Bakeerov).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## Bubble Bunny

A gentle, original 3D learning garden for little hands (ages 3–5), designed for
phones and tablets. It takes the calm, colourful, character-led feel of preschool
YouTube channels and turns it into something interactive: no videos, no ads,
no purchases, no timer, and no way to lose.

### Play and learn

- Each bubble holds a bright shape with a number inside.
- Follow a spoken and visual prompt: find a colour, a shape, or a number.
  Prompts rotate through all three lessons.
- A correct pop earns a star, a cheer, and a new prompt. A wrong tap never loses
  a star — the bunny says “Almost! Try again.” and the right bubble is hinted.
- Tap the grass to send the bunny hopping.
- Every tenth star brings a confetti celebration and a new sky colour.
- Use the sound button to mute music, chimes, and voice prompts together.

Voice prompts use the browser's built-in speech engine, so there are no audio
files to download. If a device has no speech voice, the large visual prompt and
colour/shape/number icon still carry the lesson.

### Built with

- Three.js (MIT, vendored locally in `vendor/`) with procedural geometry,
  canvas textures, shaders, and Web Audio. No external assets are fetched at runtime.
- An original bunny character, flower crown, scarf, and garden artwork, created
  in code.
- Educational challenge logic is pure and unit-tested in `src/game-logic.js`.
- One static HTML entry point with no external asset services to depend on.

### Run and verify

```sh
PORT=3002 ./start.sh
node --test tests/game-logic.test.mjs
CAPTURE_URL=http://localhost:3002 CAPTURE_DIR=screenshots/capture ./capture.sh
```

The game exposes a tiny `window.__bubbleBunny` inspection helper for browser
automation. It is not part of the child-facing interface.
