# hpa-code.github.io

Personal website of Hari Acharya, served by GitHub Pages at https://hpa-code.github.io.

It is an imaginary Himalayan mountain you explore yourself. Walk the trail from base camp, climb any rock face while your stamina lasts, ride a mountain bike up, open a paraglider and circle up on the thermals, or take a snowmobile down the glacier. Camps on the way hold teaching, experience, projects and research, each in its own design, and contact is at the summit. There is a plain version for anyone who would rather just read, and it is what loads when WebGL or JavaScript is unavailable.

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Move | WASD or arrow keys | Left thumb | Left stick |
| Run | Shift | Push the stick all the way | B or right trigger |
| Jump | Space | Jump button | A |
| Paraglider | Space again in the air, or 4 | Jump again in the air, or the wing button | A again in the air |
| Bike, snowmobile | 2, 3 (or walk up to one and press E) | The bar on the right | |
| Read a board, sit by a fire, ride the zip line | E or Enter | Tap the prompt | X or Y |
| Look around, zoom | Drag, scroll wheel | Right thumb | Right stick |
| Time of day, photo | T, P | Buttons at the top | |
| Back to the trail if stuck | R | In the log | |
| Sound on or off | M | Sound button | |

On a bike or snowmobile W is throttle, S is brake and A/D steer. Under the wing A/D steer, W dives and S brakes. Rising air is drawn as pale spirals; steep rock faces also give lift if you stay close to them.

## How it is put together

A static site with no build step. Open `index.html` through any web server (`python3 -m http.server`).

- `index.html`: all the written content and the interface. Edit your résumé here; the 3D boards read their titles from it.
- `css/style.css`: the page, the in-game interface, and one design per camp (chalkboard, expedition log, terminal, viewfinder, postcard).
- `js/terrain.js`: the shape of the mountain, the trail, camps, climbing routes, the glacier run and the lake. Pure maths, no rendering.
- `js/player.js`: how you move on foot, on rock, under the wing, on the bike and on the snowmobile. Pure logic, testable on its own.
- `js/camera.js`: the follow camera.
- `js/character.js`: the climber, posed every frame by two-bone IK.
- `js/vehicles.js`: the bike, the snowmobile and the paraglider.
- `js/env.js`: sky, sun, fog and time of day.
- `js/ground.js`: the terrain mesh and its shading, the far range, water and grass.
- `js/scene.js`: camps, forest, creatures, and the things to find.
- `js/fx.js`: post-processing and particles.
- `js/props.js`: loose objects with real physics (loaded after the first frame).
- `js/audio.js`: sound and music, synthesised in the browser. There are no audio files.
- `js/ui.js`: panels, the climber's log, keyboard, touch and gamepad input.
- `js/main.js`: wires it together and runs the loop.
- `js/kit.js`: shared shapes, colours and materials.
- `fonts/`: self-hosted typefaces (SIL Open Font License; Special Elite is Apache 2.0).
- `vendor/`: [three.js](https://threejs.org) (MIT) and the [Rapier](https://rapier.rs) physics engine (Apache 2.0), bundled so the site has no runtime dependencies.

Climbing route names and grades are set in `ROUTES` in `js/terrain.js`. Add `?plain` to the address to open the plain version directly, or `?q=low` to force the lighter graphics tier.
