"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snowflake = exports.epoch = void 0;
const snowflake_1 = require("@sapphire/snowflake");
// Beginning of 2024.
exports.epoch = new Date('2024-01-01T00:00:00Z');
exports.snowflake = new snowflake_1.Snowflake(exports.epoch);
