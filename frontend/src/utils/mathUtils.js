"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidenceRotation = calculateConfidenceRotation;
function calculateConfidenceRotation(score) {
    return 45 + (180 * (score / 100));
}
