import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bubbleMatchesChallenge,
  challengeFeedback,
  clampTarget,
  createChallenge,
  distance3,
  isMilestone,
  milestoneCount,
  nextChallengeType,
  nextPaletteIndex,
  nextSpawn,
  pickHit,
  scoreLabel,
  starCount
} from '../src/game-logic.js'

function seeded(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

test('milestones land on every tenth star only', () => {
  assert.equal(isMilestone(0), false)
  assert.equal(isMilestone(9), false)
  assert.equal(isMilestone(10), true)
  assert.equal(isMilestone(20), true)
  assert.equal(isMilestone(-10), false)
  assert.equal(isMilestone(15, 5), true)
  assert.equal(milestoneCount(37), 3)
})

test('score labels stay friendly for little players', () => {
  assert.equal(scoreLabel(0), '0')
  assert.equal(scoreLabel(8.9), '8')
  assert.equal(starCount(-3), 0)
})

test('bunny target stays inside the garden', () => {
  const inside = clampTarget(0.6, 1.2)
  assert.deepEqual(inside, { x: 0.6, z: 1.2 })

  const far = clampTarget(10, 0)
  assert.ok(Math.hypot(far.x, far.z) <= 2.6 + 1e-9)

  const behind = clampTarget(0, -8)
  assert.equal(behind.z, -0.9)
  assert.ok(behind.x === 0)

  const front = clampTarget(0, 20)
  assert.ok(front.z <= 3.2)
  assert.ok(Math.hypot(front.x, front.z) <= 2.6 + 1e-9)
})

test('spawns respect bounds and keep their distance', () => {
  const bounds = { minX: -2, maxX: 2, minY: 1.2, maxY: 4.4, minZ: -1, maxZ: 1.6 }
  const rng = seeded(7)
  const existing = []
  for (let index = 0; index < 7; index += 1) {
    const point = nextSpawn(existing, bounds, rng, 1.2)
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX)
    assert.ok(point.y >= bounds.minY && point.y <= bounds.maxY)
    assert.ok(point.z >= bounds.minZ && point.z <= bounds.maxZ)
    if (existing.length) {
      const nearest = Math.min(...existing.map((other) => distance3(point, other)))
      assert.ok(nearest >= 1.2)
    }
    existing.push(point)
  }
})

test('touch picking prefers the bubble closest to the finger', () => {
  const candidates = [
    { id: 'left', x: 100, y: 100, radius: 30 },
    { id: 'right', x: 160, y: 100, radius: 30 },
    { id: 'far', x: 300, y: 300, radius: 30 }
  ]
  assert.equal(pickHit(candidates, { x: 104, y: 104 })?.id, 'left')
  assert.equal(pickHit(candidates, { x: 150, y: 104 })?.id, 'right')
  assert.equal(pickHit(candidates, { x: 500, y: 500 }), null)
  assert.equal(pickHit(candidates, { x: 240, y: 100 }, 100)?.id, 'right')
})

test('palette progression wraps around', () => {
  assert.equal(nextPaletteIndex(0, 4), 1)
  assert.equal(nextPaletteIndex(3, 4), 0)
  assert.equal(nextPaletteIndex(0, 0), 0)
})

test('learning challenges rotate colours, shapes, and numbers', () => {
  assert.equal(nextChallengeType(null), 'color')
  assert.equal(nextChallengeType('color'), 'shape')
  assert.equal(nextChallengeType('shape'), 'number')
  assert.equal(nextChallengeType('number'), 'color')
  assert.equal(nextChallengeType('color', ['color']), 'color')
  assert.equal(nextChallengeType('shape', []), null)
})

test('challenges ask for something that is on screen, with a different answer too', () => {
  const bubbles = [
    { color: 'red', shape: 'circle', number: 1 },
    { color: 'blue', shape: 'circle', number: 3 },
    { color: 'yellow', shape: 'triangle', number: 2 },
    { color: 'red', shape: 'star', number: 5 }
  ]
  const rng = seeded(11)
  let previous = 'number'
  for (let index = 0; index < 12; index += 1) {
    const challenge = createChallenge(bubbles, previous, rng)
    assert.ok(['color', 'shape', 'number'].includes(challenge.type))
    assert.notEqual(challenge.type, previous)
    const matching = bubbles.filter((bubble) => bubbleMatchesChallenge(bubble, challenge))
    assert.ok(matching.length >= 1)
    assert.ok(matching.length < bubbles.length, 'there must be a distractor')
    assert.ok(challenge.prompt.length > 0)
    assert.ok(challenge.spoken.length > 0)
    previous = challenge.type
  }
})

test('challenge matching uses the right attribute', () => {
  const challenge = { type: 'shape', value: 'heart', label: 'Heart' }
  assert.equal(bubbleMatchesChallenge({ color: 'red', shape: 'heart', number: 2 }, challenge), true)
  assert.equal(bubbleMatchesChallenge({ color: 'red', shape: 'star', number: 2 }, challenge), false)
  assert.equal(bubbleMatchesChallenge(null, challenge), false)
})

test('number challenges keep their word and count', () => {
  const bubbles = [
    { color: 'red', shape: 'circle', number: 3 },
    { color: 'blue', shape: 'square', number: 3 },
    { color: 'green', shape: 'star', number: 4 }
  ]
  const challenge = createChallenge(bubbles, 'shape', () => 0)
  assert.equal(challenge.type, 'number')
  assert.equal(challenge.value, 3)
  assert.equal(challenge.label, '3')
  assert.equal(challenge.spoken, 'Three')
  assert.equal(challenge.count, 2)
  assert.match(challengeFeedback(challenge, true).text, /Great job/)
  assert.match(challengeFeedback(challenge, false).text, /Try again/)
})

test('challenge generation falls back when the next lesson has no choices', () => {
  const bubbles = [
    { color: 'red', shape: 'circle', number: 1 },
    { color: 'red', shape: 'triangle', number: 1 }
  ]
  const challenge = createChallenge(bubbles, 'number', seeded(3))
  assert.equal(challenge.type, 'shape')
  assert.ok(['circle', 'triangle'].includes(challenge.value))
  assert.equal(createChallenge([], 'color'), null)
})

test('spoken prompts are short and child friendly', () => {
  const bubbles = [
    { color: 'red', shape: 'circle', number: 3 },
    { color: 'blue', shape: 'star', number: 4 }
  ]
  const color = createChallenge(bubbles, 'number', () => 0)
  assert.equal(color.type, 'color')
  assert.match(color.spokenPrompt, /^Tap the .+ bubble$/)
  const shape = createChallenge(bubbles, 'color', () => 0)
  assert.match(shape.spokenPrompt, /^Find the /)
  const number = createChallenge(bubbles, 'shape', () => 0)
  assert.match(number.spokenPrompt, /^Tap number (one|two|three|four|five)$/)
  assert.match(challengeFeedback(number, true).spoken, /Great job/)
})
