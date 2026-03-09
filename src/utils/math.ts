import { Point2D } from '../types';

export function calculateWeightedAverage(buffer: Point2D[]): Point2D {
    let totalWeight = 0, smoothX = 0, smoothY = 0;
    buffer.forEach((pos, i) => {
        // Cubic weight: i^3 gives extreme priority to the newest coordinates.
        // This is the "secret sauce" for curvy lines: it eliminates camera jitter
        // while keeping the ink strictly attached to the finger movement.
        const weight = Math.pow(i + 1, 3);
        smoothX += pos.x * weight;
        smoothY += pos.y * weight;
        totalWeight += weight;
    });
    return { x: smoothX / totalWeight, y: smoothY / totalWeight };
}

function sqr(x: number) { return x * x; }
function dist2(v: Point2D, w: Point2D) { return sqr(v.x - w.x) + sqr(v.y - w.y); }

export function distToSegmentSquared(p: Point2D, v: Point2D, w: Point2D) {
    const l2 = dist2(v, w);
    if (l2 === 0) return dist2(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}
