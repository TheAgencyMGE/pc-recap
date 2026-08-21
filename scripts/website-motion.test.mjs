import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollProgress, storyFrame } from '../website/motion.js';

test('scrollProgress maps the sticky story from entering to leaving the viewport', () => {
  assert.equal(scrollProgress({ top: 900, height: 4000, viewportHeight: 900 }), 0);
  assert.equal(scrollProgress({ top: 0, height: 4000, viewportHeight: 900 }), 0);
  assert.equal(scrollProgress({ top: -1550, height: 4000, viewportHeight: 900 }), 0.5);
  assert.equal(scrollProgress({ top: -3100, height: 4000, viewportHeight: 900 }), 1);
  assert.equal(scrollProgress({ top: -6000, height: 4000, viewportHeight: 900 }), 1);
});

test('storyFrame moves smoothly between chapters while keeping one chapter active', () => {
  const opening = storyFrame(0, 4);
  assert.equal(opening.chapter, 0);
  assert.deepEqual(opening.cards[0], {
    distance: 0,
    opacity: 1,
    rotate: 0,
    scale: 1,
    x: 0,
    y: 0,
    z: 4,
  });

  const midpoint = storyFrame(0.5, 4);
  assert.equal(midpoint.chapter, 2);
  assert.equal(midpoint.cards[1].distance, -0.5);
  assert.equal(midpoint.cards[2].distance, 0.5);
  assert.equal(midpoint.cards[1].opacity, midpoint.cards[2].opacity);

  const ending = storyFrame(1, 4);
  assert.equal(ending.chapter, 3);
  assert.equal(ending.cards[3].opacity, 1);
  assert.equal(ending.cards[3].y, 0);
});

test('storyFrame clamps bad progress and supports a single-card story', () => {
  assert.equal(storyFrame(-5, 1).chapter, 0);
  assert.equal(storyFrame(12, 1).cards[0].opacity, 1);
  assert.deepEqual(storyFrame(Number.NaN, 0), { chapter: 0, cards: [] });
});
