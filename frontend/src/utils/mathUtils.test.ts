import { test } from 'node:test';
import * as assert from 'node:assert';
import { calculateConfidenceRotation } from './mathUtils';

test('calculateConfidenceRotation calculates correct angles', () => {
    assert.strictEqual(calculateConfidenceRotation(0), 45, '0 score should be 45 degrees');
    assert.strictEqual(calculateConfidenceRotation(50), 135, '50 score should be 135 degrees');
    assert.strictEqual(calculateConfidenceRotation(100), 225, '100 score should be 225 degrees');
    assert.strictEqual(calculateConfidenceRotation(25), 90, '25 score should be 90 degrees');
});
