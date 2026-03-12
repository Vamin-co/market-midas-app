"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var node_test_1 = require("node:test");
var assert = __importStar(require("node:assert"));
var mathUtils_1 = require("./mathUtils");
(0, node_test_1.test)('calculateConfidenceRotation calculates correct angles', function () {
    assert.strictEqual((0, mathUtils_1.calculateConfidenceRotation)(0), 45, '0 score should be 45 degrees');
    assert.strictEqual((0, mathUtils_1.calculateConfidenceRotation)(50), 135, '50 score should be 135 degrees');
    assert.strictEqual((0, mathUtils_1.calculateConfidenceRotation)(100), 225, '100 score should be 225 degrees');
    assert.strictEqual((0, mathUtils_1.calculateConfidenceRotation)(25), 90, '25 score should be 90 degrees');
});
