# hpa-code.github.io

Personal website of Hari Acharya, served by GitHub Pages at https://hpa-code.github.io.

It is an imaginary Himalayan mountain you climb yourself. You control the climber directly: walk the trail from base camp, or climb straight up any rock face while your stamina lasts. Camps on the way up hold teaching, experience, projects and research, and contact is at the summit. There is a plain version for anyone who would rather just read, and it is what loads when WebGL or JavaScript is unavailable.

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Walk and climb | WASD or arrow keys | Drag anywhere | Left stick |
| Jump, or lunge up a wall | Space | Jump button | A |
| Read a notice board, ride the zip line | Enter or E | Tap the prompt | X |
| Look around, zoom | Drag, scroll wheel | Second finger | Right stick |
| Back to the trail if stuck | R | In the log | |
| Sound on or off | M | Sound button | |

## How it is put together

A static site with no build step. Open `index.html` through any web server.

- `index.html`: all the written content, the interface and the styles. Edit your résumé here; the 3D notice boards read their titles from it.
- `js/terrain.js`: the shape of the mountain, the trail, camps, climbing routes and bridges. Pure maths, no rendering.
- `js/player.js`: how the climber moves: walking, climbing, stamina, jumping, falling.
- `js/scene.js`: everything you see that is not the climber.
- `js/climber.js`: the climber's model and animation.
- `js/props.js`: loose objects with real physics.
- `js/audio.js`: sound, synthesised in the browser. There are no audio files.
- `js/ui.js`: panels, the climber's log, keyboard, touch and gamepad input.
- `js/main.js`: wires it together and runs the loop.
- `vendor/`: [three.js](https://threejs.org) (MIT) and the [Rapier](https://rapier.rs) physics engine (Apache 2.0), bundled so the site has no runtime dependencies beyond a web font.

Climbing route names and grades are set in `ROUTES` in `js/terrain.js`.
