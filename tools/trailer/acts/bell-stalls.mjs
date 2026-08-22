/**
 * **Shot 9 — three stalls set into the stream, and the queue that forms.**
 *
 * The game films acceptably with no input at all: several hundred market-goers walk continuous
 * paths and the frame-to-frame change is 1.7%, which is real motion. What it does *not* show
 * without input is the thing it is about — `CUSTOMERS 0` and `Set a stall in the stream — people
 * peel off when they smell the bread` is a game waiting to be played.
 *
 * Three taps on the cobbles, spaced through the shot. Each drops a stall, walkers begin to peel
 * out of the stream toward it, and `CUSTOMERS` starts counting. `actions: { touch: ['tap'] }` at
 * `main.ts:139` is the binding these go through, so this is the player's own gesture.
 *
 * The tap points are on the ring roads either side of the fountain, where the stream is thickest —
 * a stall on empty cobbles is a stall nobody walks past, and the shot then shows a table.
 */
export default function bellStalls({ frames, width, height }) {
  const points = [
    [0.34, 0.63],
    [0.55, 0.44],
    [0.44, 0.78],
  ];
  const cues = [];
  points.forEach(([fx, fy], i) => {
    const at = Math.round(frames * (0.06 + i * 0.22));
    const x = Math.round(width * fx);
    const y = Math.round(height * fy);
    cues.push({ at, events: [{ mouse: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }] });
    cues.push({ at: at + 2, events: [{ mouse: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }] });
  });
  return cues;
}
