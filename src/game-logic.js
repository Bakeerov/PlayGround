export const MILESTONE_STEP = 10

export function isMilestone(score, step = MILESTONE_STEP) {
  return Number.isFinite(score) && score > 0 && score % step === 0
}

export function milestoneCount(score, step = MILESTONE_STEP) {
  if (!Number.isFinite(score) || score <= 0) return 0
  return Math.floor(score / step)
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function clampTarget(x, z, radius = 2.6, back = -0.9, front = 3.2) {
  const length = Math.hypot(x, z)
  const scale = length > radius ? radius / length : 1
  return {
    x: x * scale,
    z: clamp(z * scale, back, front)
  }
}

export function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function nextSpawn(existing, bounds, rng = Math.random, minDistance = 1.45) {
  let fallback = null
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = {
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      y: bounds.minY + rng() * (bounds.maxY - bounds.minY),
      z: bounds.minZ + rng() * (bounds.maxZ - bounds.minZ)
    }
    fallback = candidate
    if (existing.every((other) => distance3(candidate, other) >= minDistance)) return candidate
  }
  return fallback
}

export function pickHit(candidates, pointer, padding = 16) {
  let best = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const reach = candidate.radius + padding
    const distance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y)
    if (distance <= reach && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

export function starCount(score) {
  return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0
}

export function nextPaletteIndex(index, length) {
  if (!length) return 0
  return (index + 1) % length
}

export function scoreLabel(score) {
  return String(starCount(score))
}

export const LEARNING_COLORS = [
  { id: 'red', label: 'Red', prompt: 'Tap the red bubble', hex: 0xff6b6b },
  { id: 'orange', label: 'Orange', prompt: 'Tap the orange bubble', hex: 0xffa45c },
  { id: 'yellow', label: 'Yellow', prompt: 'Tap the yellow bubble', hex: 0xffd447 },
  { id: 'green', label: 'Green', prompt: 'Tap the green bubble', hex: 0x6ed49b },
  { id: 'blue', label: 'Blue', prompt: 'Tap the blue bubble', hex: 0x63b8ff },
  { id: 'purple', label: 'Purple', prompt: 'Tap the purple bubble', hex: 0xb394ff },
  { id: 'pink', label: 'Pink', prompt: 'Tap the pink bubble', hex: 0xff8fbd }
]

export const LEARNING_SHAPES = [
  { id: 'circle', label: 'Circle', prompt: 'Find the circle' },
  { id: 'triangle', label: 'Triangle', prompt: 'Find the triangle' },
  { id: 'square', label: 'Square', prompt: 'Find the square' },
  { id: 'star', label: 'Star', prompt: 'Find the star' },
  { id: 'heart', label: 'Heart', prompt: 'Find the heart' }
]

export const LEARNING_NUMBERS = [
  { id: 1, label: '1', word: 'One', prompt: 'Tap number 1' },
  { id: 2, label: '2', word: 'Two', prompt: 'Tap number 2' },
  { id: 3, label: '3', word: 'Three', prompt: 'Tap number 3' },
  { id: 4, label: '4', word: 'Four', prompt: 'Tap number 4' },
  { id: 5, label: '5', word: 'Five', prompt: 'Tap number 5' }
]

export const CHALLENGE_TYPES = ['color', 'shape', 'number']

export function nextChallengeType(previous, types = CHALLENGE_TYPES) {
  if (!types.length) return null
  const index = types.indexOf(previous)
  return types[(index + 1) % types.length]
}

export function challengeValueFor(bubble, type) {
  if (!bubble) return null
  if (type === 'color') return bubble.color
  if (type === 'shape') return bubble.shape
  if (type === 'number') return bubble.number
  return null
}

export function bubbleMatchesChallenge(bubble, challenge) {
  if (!bubble || !challenge) return false
  return challengeValueFor(bubble, challenge.type) === challenge.value
}

function distinctValues(bubbles, type) {
  const values = []
  for (const bubble of bubbles) {
    const value = challengeValueFor(bubble, type)
    if (value === null || value === undefined) continue
    if (!values.includes(value)) values.push(value)
  }
  return values
}

function describeValue(type, value, bubbles) {
  if (type === 'color') {
    const entry = LEARNING_COLORS.find((color) => color.id === value)
    return {
      label: entry?.label || String(value),
      prompt: entry?.prompt || `Tap the ${value} bubble`,
      spoken: entry?.label || String(value),
      spokenPrompt: `Tap the ${entry?.label || value} bubble`,
      hex: entry?.hex ?? null
    }
  }
  if (type === 'shape') {
    const entry = LEARNING_SHAPES.find((shape) => shape.id === value)
    return {
      label: entry?.label || String(value),
      prompt: entry?.prompt || `Find the ${value}`,
      spoken: entry?.label || String(value),
      spokenPrompt: `Find the ${entry?.label || value}`,
      shape: value
    }
  }
  const entry = LEARNING_NUMBERS.find((number) => number.id === value)
  const total = bubbles.filter((bubble) => bubble.number === value).length
  return {
    label: entry?.label || String(value),
    prompt: entry?.prompt || `Tap number ${value}`,
    spoken: entry?.word || String(value),
    spokenPrompt: `Tap number ${entry?.word?.toLowerCase() || value}`,
    count: total
  }
}

export function createChallenge(bubbles, previousType = null, random = Math.random, types = CHALLENGE_TYPES) {
  if (!bubbles.length) return null
  let type = nextChallengeType(previousType, types)
  if (!type) return null

  const hasChoice = (candidate) => distinctValues(bubbles, candidate).length >= 2
  if (!hasChoice(type)) {
    const alternative = types.find((candidate) => hasChoice(candidate))
    if (alternative) type = alternative
  }

  const counts = new Map()
  for (const bubble of bubbles) {
    const value = challengeValueFor(bubble, type)
    if (value === null || value === undefined) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  let values = [...counts.keys()]
  if (!values.length) return null
  if (values.length > 1) {
    const withDistractor = values.filter((value) => counts.get(value) < bubbles.length)
    if (withDistractor.length) values = withDistractor
  }

  const value = values[Math.floor(random() * values.length)]
  return {
    type,
    value,
    ...describeValue(type, value, bubbles)
  }
}

export function challengeFeedback(challenge, correct) {
  if (!challenge) return { text: '', spoken: '' }
  if (correct) {
    return {
      text: `${challenge.label}! Great job!`,
      spoken: `${challenge.spoken}! Great job!`
    }
  }
  return {
    text: 'Almost! Try again.',
    spoken: 'Almost! Try again.'
  }
}
