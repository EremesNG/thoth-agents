import assert from 'node:assert/strict';
import { greeting } from '../src/greeting.js';

assert.equal(greeting, 'Hello');
