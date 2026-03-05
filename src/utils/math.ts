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
