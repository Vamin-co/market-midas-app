export function calculateConfidenceRotation(score: number): number {
    return 45 + (180 * (score / 100));
}
