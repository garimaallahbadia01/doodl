import { Point2D } from '../types';

export function calculateWeightedAverage(buffer: Point2D[]): Point2D {
    let totalWeight = 0, smoothX = 0, smoothY = 0;
    buffer.forEach((pos, i) => {
        const weight = i + 1;
        smoothX += pos.x * weight;
        smoothY += pos.y * weight;
        totalWeight += weight;
    });
    return { x: smoothX / totalWeight, y: smoothY / totalWeight };
}
