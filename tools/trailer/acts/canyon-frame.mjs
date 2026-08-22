/**
 * **Shot 3 — three notches out, so the gorge reads as a gorge.**
 *
 * The exhibit opens hard against the canyon wall. It is a beautiful plate of strata and it is
 * unreadable at speed: what fills the frame is two banded slopes and a thread of blue between
 * them, and a viewer with 1.6 seconds cannot tell it is a river cutting a canyon. Three wheel
 * notches out puts the whole gorge in frame with the plain on either side of it, and the side
 * canyons branching off — which is the thing the shot is for.
 *
 * The zoom is a wheel gesture rather than a `?zoom=` parameter for the reason `clay-drag.mjs`
 * documents: the exhibit fits its own camera after boot and the parameter is silently discarded.
 */
export default function canyonFrame({ width, height }) {
  const cues = [];
  for (let i = 0; i < 3; i++) {
    cues.push({
      at: -(100 - i * 6),
      events: [{ mouse: 'mouseWheel', x: Math.round(width * 0.5), y: Math.round(height * 0.5), deltaX: 0, deltaY: 120, button: 'none', buttons: 0 }],
    });
  }
  return cues;
}
