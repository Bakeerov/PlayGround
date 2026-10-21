import * as THREE from '../vendor/three.module.js'
import { AudioEngine, VoicePrompts } from './audio.js'
import {
  LEARNING_COLORS,
  LEARNING_SHAPES,
  bubbleMatchesChallenge,
  challengeFeedback,
  clamp,
  clampTarget,
  createChallenge,
  isMilestone,
  milestoneCount,
  nextSpawn,
  pickHit,
  scoreLabel
} from './game-logic.js'

const canvas = document.querySelector('#scene')
const intro = document.querySelector('#intro')
const playButton = document.querySelector('#play-button')
const scoreElement = document.querySelector('#score')
const scorePill = document.querySelector('#score-pill')
const hint = document.querySelector('#hint')
const hintRing = document.querySelector('#hint-ring')
const celebration = document.querySelector('#celebration')
const celebrationNumber = document.querySelector('#celebration-number')
const challengeBar = document.querySelector('#challenge')
const challengeIcon = document.querySelector('#challenge-icon')
const challengeText = document.querySelector('#challenge-text')
const challengeDots = [...document.querySelectorAll('#challenge-dots i')]
const feedback = document.querySelector('#feedback')
const feedbackText = document.querySelector('#feedback-text')
const infoDialog = document.querySelector('#info-dialog')
const soundButtons = [document.querySelector('#sound-button'), document.querySelector('#intro-sound')]
const infoButton = document.querySelector('#info-button')
const closeInfo = document.querySelector('#close-info')

const audio = new AudioEngine()
const voice = new VoicePrompts()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xdff1ff, 26, 62)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 130)
const cameraTarget = new THREE.Vector3(0, 1.95, 0)
const cameraBase = new THREE.Vector3(0, 3.6, 9.8)
const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 }

const clock = new THREE.Clock()
let elapsed = 0
let started = false
let score = 0
let hintUsed = false
let hintVisible = false
let hintDeadline = 0
let hintTimer = null
let feedbackTimer = null
let challenge = null
let challengeTimer = null
let lastChallengeType = null
let skyBlend = 1
let skyFromTop = new THREE.Color('#8fd8ff')
let skyToTop = new THREE.Color('#8fd8ff')
let skyFromBottom = new THREE.Color('#ffe9f2')
let skyToBottom = new THREE.Color('#ffe9f2')

const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const tmpVec = new THREE.Vector3()

const STORE_KEY = 'bubble-bunny-muted'
let muted = false
try {
  muted = window.localStorage.getItem(STORE_KEY) === '1'
} catch {
  muted = false
}
audio.muted = muted
voice.setMuted(muted)
document.body.classList.toggle('muted', muted)

const toonGradient = (() => {
  const data = new Uint8Array([86, 150, 208, 250])
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
})()

function toon(color, options = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...options })
}

function addShadow(mesh, cast = true, receive = false) {
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  return mesh
}

function makeSoftCircleTexture() {
  const size = 128
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d')
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const softCircle = makeSoftCircleTexture()

function makeGlowTexture() {
  const size = 256
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d')
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,250,214,0.95)')
  gradient.addColorStop(0.28, 'rgba(255,240,178,0.55)')
  gradient.addColorStop(0.65, 'rgba(255,224,170,0.14)')
  gradient.addColorStop(1, 'rgba(255,224,170,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeGroundTexture() {
  const size = 1024
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d')

  context.fillStyle = '#a6e09e'
  context.fillRect(0, 0, size, size)

  const patches = [
    ['rgba(140, 208, 133, 0.55)', 0.18, 0.24, 0.28],
    ['rgba(186, 236, 164, 0.65)', 0.72, 0.18, 0.3],
    ['rgba(147, 216, 151, 0.45)', 0.42, 0.68, 0.34],
    ['rgba(197, 240, 179, 0.5)', 0.86, 0.76, 0.22],
    ['rgba(133, 203, 141, 0.4)', 0.12, 0.86, 0.2]
  ]
  for (const [color, x, y, radius] of patches) {
    const gradient = context.createRadialGradient(
      x * size,
      y * size,
      size * 0.02,
      x * size,
      y * size,
      size * radius
    )
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'rgba(166,224,158,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  let seed = 1337
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  for (let index = 0; index < 2200; index += 1) {
    const x = random() * size
    const y = random() * size
    const shade = random()
    context.strokeStyle =
      shade > 0.52 ? 'rgba(108, 184, 110, 0.5)' : 'rgba(200, 243, 181, 0.55)'
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (random() - 0.5) * 5, y - 4 - random() * 7)
    context.stroke()
  }

  const dots = ['rgba(255, 248, 243, 0.9)', 'rgba(255, 222, 139, 0.95)', 'rgba(255, 179, 207, 0.9)']
  for (let index = 0; index < 160; index += 1) {
    context.fillStyle = dots[index % dots.length]
    context.beginPath()
    context.arc(random() * size, random() * size, 1.4 + random() * 2.6, 0, Math.PI * 2)
    context.fill()
  }

  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return texture
}

function makeShadowTexture() {
  const size = 128
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d')
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(70, 92, 66, 0.4)')
  gradient.addColorStop(0.6, 'rgba(70, 92, 66, 0.16)')
  gradient.addColorStop(1, 'rgba(70, 92, 66, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(surface)
}

const shadowTexture = makeShadowTexture()

function addGroundShadow(x, z, scale = 1, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.015, z)
  mesh.scale.setScalar(scale)
  mesh.renderOrder = 1
  scene.add(mesh)
  return mesh
}

function buildLights() {
  const hemisphere = new THREE.HemisphereLight(0xfff3fa, 0x7dbb7a, 1.15)
  scene.add(hemisphere)

  const sun = new THREE.DirectionalLight(0xfff7e6, 2.5)
  sun.position.set(-6, 10, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 8
  sun.shadow.camera.bottom = -6
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 30
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  scene.add(sun.target)
  sun.target.position.set(0, 0, 0)

  const fill = new THREE.DirectionalLight(0xcfeaff, 0.65)
  fill.position.set(6, 5, -4)
  scene.add(fill)
}

function buildSky() {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color('#8fd8ff') },
      bottomColor: { value: new THREE.Color('#ffe9f2') }
    },
    vertexShader: `
      varying float vHeight;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vHeight = normalize(worldPosition.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying float vHeight;
      void main() {
        float t = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(bottomColor, topColor, pow(t, 0.75));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(72, 32, 18), skyMaterial)
  sky.renderOrder = -10
  scene.add(sky)
  skyMaterial.userData = { top: skyMaterial.uniforms.topColor.value, bottom: skyMaterial.uniforms.bottomColor.value }
  return skyMaterial
}

const skyMaterial = buildSky()

function buildGround() {
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    roughness: 1,
    metalness: 0
  })
  const ground = new THREE.Mesh(new THREE.CircleGeometry(38, 64), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const stones = [
    [0.0, 4.8, 0.58],
    [0.42, 4.25, 0.54],
    [-0.06, 3.7, 0.52],
    [0.38, 3.2, 0.47],
    [-0.06, 2.68, 0.43]
  ]
  const stoneMaterial = toon(0xf6ddb5)
  for (const [x, z, radius] of stones) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, 0.07, 18), stoneMaterial)
    stone.position.set(x, 0.04, z)
    stone.receiveShadow = true
    stone.castShadow = true
    scene.add(stone)
  }
}

function buildHills() {
  const hillMaterials = [toon(0x9ad9a1), toon(0xaee3a8), toon(0x8ccf9c)]
  const hills = [
    [-16, -24, 16, 6.4, 10, 0],
    [3, -27, 20, 7.5, 12, 1],
    [18, -22, 14, 5.6, 9, 2],
    [-5, -20, 11, 4.2, 7, 2]
  ]
  for (const [x, z, sx, sy, sz, materialIndex] of hills) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), hillMaterials[materialIndex])
    hill.position.set(x, -sy * 0.55, z)
    hill.scale.set(sx, sy, sz)
    hill.receiveShadow = true
    scene.add(hill)
  }
}

function buildRainbow() {
  const colors = [0xff9db5, 0xffc98d, 0xffe999, 0x9fe3b7, 0x9ed8ff, 0xc3b5ff]
  colors.forEach((color, index) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    })
    const arc = new THREE.Mesh(new THREE.TorusGeometry(17.5 - index * 0.5, 0.32, 6, 60, Math.PI), material)
    arc.position.set(-4, -0.4, -31)
    arc.renderOrder = -5
    scene.add(arc)
  })
}

function buildTrees() {
  const bark = toon(0xba8a6d)
  const leafColors = [0x69c78c, 0x7fd49a, 0x58b97f, 0xffb5cb, 0xff9fbd]
  const positions = [
    [-7.2, -5.8, 1.15, 0],
    [7.6, -6.4, 1.0, 1],
    [-9.8, -11, 1.25, 2],
    [9.6, -11.5, 1.15, 0],
    [-5.2, -12.5, 0.9, 3],
    [5.6, -13.4, 0.95, 1],
    [11.2, -3.4, 0.85, 4],
    [-11.4, -2.6, 0.8, 0]
  ]

  for (const [x, z, scale, colorIndex] of positions) {
    const tree = new THREE.Group()
    tree.position.set(x, 0, z)
    tree.scale.setScalar(scale)

    const trunk = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.7, 8), bark))
    trunk.position.y = 0.85
    tree.add(trunk)

    const leafMaterial = toon(leafColors[colorIndex])
    const crown = new THREE.Group()
    const blobs = [
      [0, 2.1, 0, 0.85],
      [-0.55, 1.8, 0.12, 0.62],
      [0.55, 1.86, -0.05, 0.66],
      [0.08, 2.55, -0.12, 0.56]
    ]
    for (const [bx, by, bz, radius] of blobs) {
      const blob = addShadow(
        new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), leafMaterial)
      )
      blob.position.set(bx, by, bz)
      crown.add(blob)
    }
    tree.add(crown)
    tree.rotation.y = Math.random() * Math.PI * 2
    scene.add(tree)
    addGroundShadow(x, z, 2.8 * scale, 0.55)
  }
}

function buildMushrooms() {
  const stemMaterial = toon(0xfff3df)
  const capMaterial = toon(0xff8d92)
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xfff7ea })
  const spots = [
    [-4.6, -1.6, 0.9],
    [4.9, -2.2, 0.7],
    [-3.2, 2.6, 0.6],
    [3.6, 1.9, 0.5]
  ]
  for (const [x, z, scale] of spots) {
    const mushroom = new THREE.Group()
    const stem = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.32, 8), stemMaterial))
    stem.position.y = 0.16
    mushroom.add(stem)
    const cap = addShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMaterial)
    )
    cap.position.y = 0.31
    cap.scale.y = 0.8
    mushroom.add(cap)
    for (let dot = 0; dot < 3; dot += 1) {
      const point = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dotMaterial)
      const angle = (dot / 3) * Math.PI * 2 + 0.4
      point.position.set(Math.cos(angle) * 0.12, 0.38, Math.sin(angle) * 0.12)
      mushroom.add(point)
    }
    mushroom.position.set(x, 0, z)
    mushroom.scale.setScalar(scale)
    scene.add(mushroom)
  }
}

function buildBushes() {
  const leafMaterials = [toon(0x6cc68c), toon(0x7fd49a), toon(0x5ebc84)]
  const bloomMaterials = [toon(0xfff2f6), toon(0xffb9d2), toon(0xffe28a)]
  const spots = [
    [-5.6, -5.4, 1.15, 0],
    [5.1, -5.8, 1.0, 1],
    [-3.4, -7.2, 0.9, 2],
    [4.0, -7.4, 0.82, 0],
    [7.4, -8.6, 0.75, 1],
    [-7.9, -8.2, 0.8, 2]
  ]
  for (const [x, z, scale, materialIndex] of spots) {
    const bush = new THREE.Group()
    bush.position.set(x, 0, z)
    const blobs = [
      [0, 0.34, 0, 0.46],
      [-0.38, 0.28, 0.08, 0.34],
      [0.4, 0.3, -0.04, 0.36],
      [0.06, 0.58, -0.05, 0.3]
    ]
    for (const [bx, by, bz, radius] of blobs) {
      const blob = addShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), leafMaterials[materialIndex]))
      blob.position.set(bx, by, bz)
      blob.scale.set(1.1, 0.88, 1)
      bush.add(blob)
    }
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 + 0.6
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bloomMaterials[index % bloomMaterials.length])
      bloom.position.set(Math.cos(angle) * 0.36, 0.62 + Math.sin(angle * 2) * 0.06, Math.sin(angle) * 0.24 + 0.1)
      bush.add(bloom)
    }
    bush.scale.setScalar(scale)
    scene.add(bush)
    addGroundShadow(x, z, 1.7 * scale, 0.35)
  }
}

function buildTulips() {
  const count = 22
  const random = (() => {
    let seed = 2024
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
  })()
  const palette = [0xff8fbd, 0xffd25e, 0xff9f9a, 0xc5a8ff, 0xfff3f6, 0xffb86e]
  const stemGeometry = new THREE.CylinderGeometry(0.018, 0.026, 1, 5)
  const stemMaterial = toon(0x62b96e)
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count)
  const bloomProfile = [
    [0, 0],
    [0.075, 0.02],
    [0.11, 0.1],
    [0.1, 0.2],
    [0.035, 0.25]
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const bloomGeometry = new THREE.LatheGeometry(bloomProfile, 10)
  const bloomMaterial = toon(0xffffff)
  const blooms = new THREE.InstancedMesh(bloomGeometry, bloomMaterial, count)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  for (let index = 0; index < count; index += 1) {
    const radius = 3.2 + random() * 6.5
    const angle = random() * Math.PI * 2
    let x = Math.cos(angle) * radius
    let z = Math.sin(angle) * radius + 0.4
    if (z > 4.6) z = 4.6 - random() * 1.1
    const height = 0.38 + random() * 0.34
    position.set(x, height / 2 + 0.02, z)
    quaternion.identity()
    scale.set(1, height, 1)
    matrix.compose(position, quaternion, scale)
    stems.setMatrixAt(index, matrix)

    position.set(x, height + 0.04, z)
    quaternion.setFromAxisAngle(up, random() * Math.PI * 2)
    scale.set(1, 1, 1)
    matrix.compose(position, quaternion, scale)
    blooms.setMatrixAt(index, matrix)
    blooms.setColorAt(index, new THREE.Color(palette[index % palette.length]))
  }
  stems.castShadow = true
  blooms.castShadow = true
  blooms.instanceColor.needsUpdate = true
  scene.add(stems, blooms)
}

function buildPetals() {
  const count = 80
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 4)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 18
    positions[index * 3 + 1] = 1 + Math.random() * 6.5
    positions[index * 3 + 2] = -6 + Math.random() * 10
    seeds[index * 4] = Math.random() * Math.PI * 2
    seeds[index * 4 + 1] = 0.12 + Math.random() * 0.22
    seeds[index * 4 + 2] = Math.random() * Math.PI * 2
    seeds[index * 4 + 3] = Math.random() * Math.PI * 2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    map: softCircle,
    color: 0xffc4dc,
    size: 0.15,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true
  })
  const points = new THREE.Points(geometry, material)
  scene.add(points)
  return { points, positions, seeds, count }
}

function buildBirds() {
  const birds = []
  const material = new THREE.MeshBasicMaterial({
    color: 0x8e7b9c,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    fog: false
  })
  const wingGeometry = new THREE.PlaneGeometry(0.44, 0.11)
  const spots = [
    [2.5, 9.5, -24, 0.4],
    [9.5, 8.9, -22, 0.3],
    [-2, 10.2, -27, 0.35]
  ]
  for (const [x, y, z, speed] of spots) {
    const group = new THREE.Group()
    const left = new THREE.Mesh(wingGeometry, material)
    left.position.x = -0.16
    left.rotation.z = 0.22
    const right = new THREE.Mesh(wingGeometry, material)
    right.position.x = 0.16
    right.rotation.z = -0.22
    group.add(left, right)
    group.position.set(x, y, z)
    scene.add(group)
    birds.push({ group, left, right, baseX: x, baseY: y, speed, phase: Math.random() * 6.28 })
  }
  return birds
}

function buildSunRays() {
  const group = new THREE.Group()
  group.position.set(-12, 11.5, -32.05)
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff0b5,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  })
  const geometry = new THREE.PlaneGeometry(0.46, 4.4)
  for (let index = 0; index < 12; index += 1) {
    const ray = new THREE.Mesh(geometry, material)
    ray.rotation.z = (index / 12) * Math.PI * 2
    ray.position.set(Math.cos(ray.rotation.z) * 2.4, Math.sin(ray.rotation.z) * 2.4, 0)
    ray.rotation.z += Math.PI / 2
    group.add(ray)
  }
  group.renderOrder = -6
  scene.add(group)
  return group
}

function buildFence() {
  const fence = new THREE.Group()
  const white = toon(0xfff9ee)
  for (let index = 0; index < 22; index += 1) {
    const x = -10.5 + index * 1
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.07), white)
    picket.position.set(x, 0.36, -9.4)
    fence.add(picket)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), white)
    tip.position.set(x, 0.8, -9.4)
    tip.rotation.y = Math.PI / 4
    fence.add(tip)
  }
  for (const y of [0.28, 0.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.08, 0.06), white)
    rail.position.set(0, y, -9.44)
    fence.add(rail)
  }
  fence.position.y = 0.01
  scene.add(fence)
}

function buildFlowers() {
  const flowerCount = 110
  const random = (() => {
    let seed = 4242
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
  })()

  const palette = [0xff9ec4, 0xffd166, 0xc3a7ff, 0xfff3f4, 0xff8fa3, 0x9ad9ff]
  const centers = []
  const petalInstances = []
  const randomRotation = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  for (let index = 0; index < flowerCount; index += 1) {
    let x = 0
    let z = 0
    let tries = 0
    do {
      const radius = 2.2 + random() * 12
      const angle = random() * Math.PI * 2
      x = Math.cos(angle) * radius
      z = Math.sin(angle) * radius + 0.6
      tries += 1
    } while (tries < 20 && Math.abs(x) < 1.1 && z > -1.1 && z < 3)

    const height = 0.28 + random() * 0.36
    const color = palette[Math.floor(random() * palette.length)]
    centers.push({ x, z, height, color, tilt: (random() - 0.5) * 0.4, phase: random() * 6.28, petals: 5 })
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = (petal / 5) * Math.PI * 2
      petalInstances.push({ index, angle, color })
    }
  }

  const stemGeometry = new THREE.CylinderGeometry(0.018, 0.026, 1, 5)
  const stemMaterial = toon(0x62b96e)
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, flowerCount)
  stems.castShadow = true
  stems.receiveShadow = true

  const centerGeometry = new THREE.SphereGeometry(0.065, 8, 6)
  const centerMaterial = toon(0xffe28a)
  const centerMesh = new THREE.InstancedMesh(centerGeometry, centerMaterial, flowerCount)
  centerMesh.castShadow = true

  const petalGeometry = new THREE.SphereGeometry(0.085, 8, 6)
  const petalMaterial = toon(0xffffff)
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, petalInstances.length)
  petals.castShadow = true

  for (let index = 0; index < flowerCount; index += 1) {
    const flower = centers[index]
    position.set(flower.x, flower.height / 2 + 0.02, flower.z)
    quaternion.identity()
    scale.set(1, flower.height, 1)
    matrix.compose(position, quaternion, scale)
    stems.setMatrixAt(index, matrix)

    position.set(flower.x, flower.height + 0.04, flower.z)
    quaternion.setFromAxisAngle(up, flower.phase)
    scale.setScalar(1)
    matrix.compose(position, quaternion, scale)
    centerMesh.setMatrixAt(index, matrix)
  }

  petalInstances.forEach((petal, index) => {
    const flower = centers[petal.index]
    const radius = 0.13
    position.set(
      flower.x + Math.cos(petal.angle + flower.phase) * radius,
      flower.height + 0.04 + Math.sin(petal.angle * 2) * 0.01,
      flower.z + Math.sin(petal.angle + flower.phase) * radius
    )
    randomRotation.setFromAxisAngle(up, -petal.angle - flower.phase)
    quaternion.copy(randomRotation)
    scale.set(1.15, 0.55, 1.45)
    matrix.compose(position, quaternion, scale)
    petals.setMatrixAt(index, matrix)
    petals.setColorAt(index, new THREE.Color(petal.color))
  })

  petals.instanceColor.needsUpdate = true
  scene.add(stems, petals, centerMesh)

  const grassCount = 150
  const grassGeometry = new THREE.ConeGeometry(0.055, 1, 4)
  const grassMaterial = toon(0xffffff)
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount)
  for (let index = 0; index < grassCount; index += 1) {
    const radius = 1.8 + random() * 13
    const angle = random() * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius + 0.8
    const height = 0.22 + random() * 0.32
    position.set(x, height / 2, z)
    quaternion.setFromAxisAngle(up, random() * Math.PI * 2)
    scale.set(1, height, 1)
    matrix.compose(position, quaternion, scale)
    grass.setMatrixAt(index, matrix)
    grass.setColorAt(index, new THREE.Color().setHSL(0.31, 0.45, 0.55 + random() * 0.15))
  }
  grass.instanceColor.needsUpdate = true
  grass.receiveShadow = true
  scene.add(grass)
}

function buildClouds() {
  const material = toon(0xfffdfa)
  const cloudRoot = new THREE.Group()
  const clouds = []
  const shapes = [
    [-15, 8.5, -24, 1.25],
    [8, 9.6, -27, 1.4],
    [18, 7.4, -20, 1.0],
    [-21, 6.8, -18, 0.9],
    [-1, 11.4, -31, 1.55],
    [24, 9.8, -28, 1.15]
  ]
  for (const [x, y, z, scale] of shapes) {
    const cloud = new THREE.Group()
    const blobs = [
      [0, 0, 0, 1.1],
      [-1.1, -0.15, 0.1, 0.75],
      [1.15, -0.2, 0, 0.8],
      [0.4, 0.45, -0.08, 0.72]
    ]
    for (const [bx, by, bz, radius] of blobs) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material)
      blob.position.set(bx, by, bz)
      blob.scale.y = 0.72
      cloud.add(blob)
    }
    cloud.position.set(x, y, z)
    cloud.scale.setScalar(scale)
    cloudRoot.add(cloud)
    clouds.push({ cloud, baseX: x, speed: 0.18 + Math.random() * 0.16 })
  }
  scene.add(cloudRoot)
  return clouds
}

function buildSun() {
  const spriteMaterial = new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  })
  const sun = new THREE.Sprite(spriteMaterial)
  sun.position.set(-12, 11.5, -32)
  sun.scale.set(10, 10, 1)
  scene.add(sun)

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3ba, fog: false })
  )
  disc.position.set(-12, 11.5, -32.1)
  scene.add(disc)
}

function buildButterfly(color, accent, radius, height, phase, speed) {
  const group = new THREE.Group()
  const bodyMaterial = toon(0x7a5b74)
  const wingMaterial = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient,
    side: THREE.DoubleSide
  })
  const spotMaterial = new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.17, 4, 8), bodyMaterial)
  body.rotation.x = Math.PI / 2
  group.add(body)

  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, 0)
  wingShape.bezierCurveTo(-0.12, 0.22, -0.44, 0.3, -0.46, 0.1)
  wingShape.bezierCurveTo(-0.48, -0.06, -0.22, -0.12, 0, -0.02)
  wingShape.closePath()
  const wingGeometry = new THREE.ShapeGeometry(wingShape, 12)

  const lowerShape = new THREE.Shape()
  lowerShape.moveTo(0, -0.02)
  lowerShape.bezierCurveTo(-0.3, -0.14, -0.34, -0.36, -0.14, -0.34)
  lowerShape.bezierCurveTo(-0.02, -0.33, 0, -0.16, 0, -0.08)
  lowerShape.closePath()
  const lowerGeometry = new THREE.ShapeGeometry(lowerShape, 12)

  const wingPivots = []
  const rotation = new THREE.Euler(0, 0, 0)

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.scale.x = side
    const upper = new THREE.Mesh(wingGeometry, wingMaterial)
    upper.rotation.x = -Math.PI / 2
    upper.position.z = 0.02
    pivot.add(upper)
    const lower = new THREE.Mesh(lowerGeometry, wingMaterial)
    lower.rotation.x = -Math.PI / 2
    lower.position.z = 0.01
    pivot.add(lower)
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 10), spotMaterial)
    spot.rotation.x = -Math.PI / 2
    spot.position.set(-0.22, 0, 0.045)
    pivot.add(spot)
    group.add(pivot)
    wingPivots.push(pivot)
  }

  group.rotation.order = 'YXZ'
  scene.add(group)
  return {
    group,
    wingPivots,
    radius,
    height,
    phase,
    speed,
    rotation,
    centerX: 0,
    centerZ: 0.8
  }
}

function buildButterflies() {
  const butterflies = [
    buildButterfly(0xffa9c9, 0xfff0f6, 3.4, 2.0, 0, 0.36),
    buildButterfly(0xb9a7ff, 0xfff1d0, 4.2, 2.5, 2.1, 0.27),
    buildButterfly(0x9fe0c1, 0xfff7dd, 2.9, 1.7, 4.2, 0.42)
  ]
  return butterflies
}

function buildPollen() {
  const count = 120
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 19
    positions[index * 3 + 1] = 0.3 + Math.random() * 5.5
    positions[index * 3 + 2] = -7 + Math.random() * 11
    seeds[index * 3] = Math.random() * Math.PI * 2
    seeds[index * 3 + 1] = 0.2 + Math.random() * 0.5
    seeds[index * 3 + 2] = Math.random() * Math.PI * 2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    map: softCircle,
    color: 0xfff4c4,
    size: 0.09,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  })
  const points = new THREE.Points(geometry, material)
  scene.add(points)
  return { points, positions, seeds, count }
}

function buildBunny() {
  const root = new THREE.Group()
  const fur = toon(0xfff8f1)
  const cream = toon(0xfff1df)
  const pink = toon(0xffb8cc)
  const pinkSoft = new THREE.MeshBasicMaterial({ color: 0xffb3c6, transparent: true, opacity: 0.5 })
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x40303f,
    roughness: 0.22,
    metalness: 0.05
  })
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })

  const body = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 18), fur))
  body.position.set(0, 0.7, 0)
  body.scale.set(1.02, 0.92, 0.92)
  root.add(body)

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), cream)
  belly.position.set(0, 0.68, 0.18)
  belly.scale.set(1.02, 1.05, 0.62)
  root.add(belly)

  const head = new THREE.Group()
  head.position.set(0, 1.42, 0.02)
  root.add(head)

  const skull = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.43, 26, 20), fur))
  skull.scale.set(1, 0.98, 0.96)
  head.add(skull)

  const cheekLeft = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), pinkSoft)
  cheekLeft.position.set(-0.25, -0.1, 0.37)
  cheekLeft.rotation.y = -0.34
  head.add(cheekLeft)

  const cheekRight = cheekLeft.clone()
  cheekRight.position.x = 0.25
  cheekRight.rotation.y = 0.34
  head.add(cheekRight)

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), cream)
  muzzle.position.set(0, -0.12, 0.34)
  muzzle.scale.set(1.15, 0.8, 0.6)
  head.add(muzzle)

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), pink)
  nose.position.set(0, -0.055, 0.43)
  nose.scale.set(1.05, 0.8, 0.75)
  head.add(nose)

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.052, 0.011, 6, 14, Math.PI * 0.9),
    new THREE.MeshBasicMaterial({ color: 0xd97c98 })
  )
  mouth.position.set(0, -0.15, 0.415)
  mouth.rotation.z = Math.PI
  head.add(mouth)

  const eyes = []
  for (const side of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(0.155 * side, 0.02, 0.365)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), eyeMaterial)
    pupil.scale.set(1, 1.12, 0.55)
    eye.add(pupil)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glintMaterial)
    glint.position.set(0.018 * side, 0.022, 0.052)
    eye.add(glint)
    head.add(eye)
    eyes.push(eye)
  }

  const ears = []
  const earSpecs = [
    [-1, 0.3],
    [1, -0.3]
  ]
  for (const [side, baseAngle] of earSpecs) {
    const pivot = new THREE.Group()
    pivot.position.set(0.2 * side, 0.33, -0.02)
    pivot.rotation.z = baseAngle
    pivot.rotation.x = -0.12

    const outer = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.46, 6, 12), fur))
    outer.position.y = 0.28
    pivot.add(outer)

    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 6, 10), pink)
    inner.position.set(0, 0.25, 0.06)
    inner.scale.z = 0.5
    pivot.add(inner)

    head.add(pivot)
    ears.push({ pivot, baseAngle, side })
  }

  const arms = []
  for (const side of [-1, 1]) {
    const arm = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.21, 4, 10), fur))
    arm.position.set(0.42 * side, 0.84, 0.26)
    arm.rotation.z = side * 0.72
    arm.rotation.x = -0.18
    root.add(arm)
    arms.push({ arm, side })
  }

  const feet = []
  for (const side of [-1, 1]) {
    const foot = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur))
    foot.position.set(0.21 * side, 0.12, 0.28)
    foot.scale.set(1, 0.55, 1.4)
    root.add(foot)
    feet.push(foot)
  }

  const tail = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), cream))
  tail.position.set(0, 0.55, -0.46)
  root.add(tail)

  const flower = new THREE.Group()
  flower.position.set(0.34, 0.52, 0.06)
  flower.rotation.z = -0.5
  const petalMaterial = toon(0xfffdf8)
  for (let index = 0; index < 5; index += 1) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), petalMaterial)
    const angle = (index / 5) * Math.PI * 2
    petal.position.set(Math.cos(angle) * 0.07, Math.sin(angle) * 0.07, 0)
    petal.scale.set(1, 1, 0.55)
    flower.add(petal)
  }
  const flowerCenter = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), toon(0xffd25e))
  flowerCenter.position.z = 0.02
  flower.add(flowerCenter)
  head.add(flower)

  const crown = new THREE.Group()
  const crownPetals = [toon(0xffb3c9), toon(0xfff6f1), toon(0xffd25e), toon(0xcbb5ff)]
  const crownSpots = [
    [-0.25, 0.31, 0.13, -0.5],
    [-0.08, 0.38, 0.2, -0.2],
    [0.1, 0.38, 0.19, 0.2],
    [0.26, 0.3, 0.12, 0.5]
  ]
  crownSpots.forEach(([x, y, z, tilt], flowerIndex) => {
    const mini = new THREE.Group()
    mini.position.set(x, y, z)
    mini.rotation.z = tilt
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), crownPetals[flowerIndex])
      petal.position.set(Math.cos(angle) * 0.042, Math.sin(angle) * 0.042, 0)
      petal.scale.set(1, 1, 0.5)
      mini.add(petal)
    }
    const miniCenter = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), toon(0xfff0a8))
    miniCenter.position.z = 0.018
    mini.add(miniCenter)
    crown.add(mini)
  })
  head.add(crown)

  const scarfMaterial = toon(0x8fe0c1)
  const scarf = new THREE.Group()
  const band = addShadow(new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.055, 8, 24), scarfMaterial))
  band.rotation.x = Math.PI / 2
  band.position.set(0, 1.12, 0.01)
  band.scale.z = 0.85
  scarf.add(band)
  const bowMaterial = toon(0xff9fc4)
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), bowMaterial)
    loop.position.set(0.1 * side, 1.12, 0.29)
    loop.scale.set(1.25, 0.78, 0.42)
    loop.rotation.z = side * 0.35
    scarf.add(loop)
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), toon(0xffd25e))
  knot.position.set(0, 1.12, 0.31)
  scarf.add(knot)
  root.add(scarf)

  root.position.set(-3.3, 0, 1.15)
  root.rotation.y = 0.5
  root.scale.setScalar(0.98)
  scene.add(root)

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    })
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.set(0, 0.02, 1.15)
  blob.renderOrder = 1
  scene.add(blob)

  return {
    root,
    body,
    head,
    eyes,
    ears,
    arms,
    feet,
    tail,
    crown,
    scarf,
    blob,
    target: new THREE.Vector3(-3.3, 0, 1.15),
    hopPhase: 0,
    cheerTime: 0,
    blinkTimer: 2 + Math.random() * 2,
    blinkTime: 0,
    lookBubble: null,
    moving: false
  }
}

class Sparkles {
  constructor(capacity = 460) {
    this.capacity = capacity
    this.cursor = 0
    this.positions = new Float32Array(capacity * 3)
    this.colors = new Float32Array(capacity * 3)
    this.sizes = new Float32Array(capacity)
    this.alphas = new Float32Array(capacity)
    this.velocities = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.gravity = new Float32Array(capacity)
    this.drag = new Float32Array(capacity)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (240.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float distanceToCenter = length(uv);
          float alpha = smoothstep(0.5, 0.06, distanceToCenter);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(vColor, alpha * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true
    })
    this.material = material
    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 6
    scene.add(this.points)
    this.geometry = geometry
  }

  spawn(position, color, count, options = {}) {
    const {
      speed = 2.6,
      size = 0.32,
      life = 1,
      gravity = -2.4,
      drag = 0.96,
      spread = 1
    } = options
    const colorObject = new THREE.Color(color)
    for (let index = 0; index < count; index += 1) {
      const slot = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const offset = slot * 3
      this.positions[offset] = position.x + (Math.random() - 0.5) * 0.18 * spread
      this.positions[offset + 1] = position.y + (Math.random() - 0.5) * 0.18 * spread
      this.positions[offset + 2] = position.z + (Math.random() - 0.5) * 0.18 * spread

      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const velocity = speed * (0.35 + Math.random() * 0.85)
      this.velocities[offset] = Math.sin(phi) * Math.cos(theta) * velocity
      this.velocities[offset + 1] = Math.cos(phi) * velocity * 0.85 + 0.8
      this.velocities[offset + 2] = Math.sin(phi) * Math.sin(theta) * velocity

      const warm = 0.75 + Math.random() * 0.3
      this.colors[offset] = colorObject.r * warm
      this.colors[offset + 1] = colorObject.g * warm
      this.colors[offset + 2] = colorObject.b * warm
      this.sizes[slot] = size * (0.55 + Math.random() * 0.8)
      this.alphas[slot] = 1
      this.life[slot] = life * (0.7 + Math.random() * 0.6)
      this.maxLife[slot] = this.life[slot]
      this.gravity[slot] = gravity
      this.drag[slot] = drag
    }
    this.geometry.attributes.color.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
  }

  confetti(position, count = 90) {
    const palette = [0xff8fb4, 0xffd25e, 0x8ee0bd, 0x97d8ff, 0xc5a8ff, 0xfff6d9]
    const colorObject = new THREE.Color()
    for (let index = 0; index < count; index += 1) {
      const slot = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const offset = slot * 3
      this.positions[offset] = position.x + (Math.random() - 0.5) * 4.4
      this.positions[offset + 1] = position.y + Math.random() * 1.4
      this.positions[offset + 2] = position.z + (Math.random() - 0.5) * 1.4
      this.velocities[offset] = (Math.random() - 0.5) * 2.6
      this.velocities[offset + 1] = 1 + Math.random() * 2.8
      this.velocities[offset + 2] = (Math.random() - 0.5) * 1.2
      colorObject.set(palette[index % palette.length])
      this.colors[offset] = colorObject.r
      this.colors[offset + 1] = colorObject.g
      this.colors[offset + 2] = colorObject.b
      this.sizes[slot] = 0.24 + Math.random() * 0.26
      this.alphas[slot] = 1
      this.life[slot] = 1.5 + Math.random() * 1.2
      this.maxLife[slot] = this.life[slot]
      this.gravity[slot] = -3.4
      this.drag[slot] = 0.985
    }
    this.geometry.attributes.color.needsUpdate = true
    this.geometry.attributes.aSize.needsUpdate = true
  }

  update(dt) {
    const positions = this.positions
    const velocities = this.velocities
    let changed = false
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.life[index] <= 0) {
        if (this.alphas[index] !== 0) {
          this.alphas[index] = 0
          changed = true
        }
        continue
      }
      changed = true
      const offset = index * 3
      const damping = Math.pow(this.drag[index], dt * 60)
      this.life[index] -= dt
      if (this.life[index] <= 0) {
        this.alphas[index] = 0
        continue
      }
      velocities[offset] *= damping
      velocities[offset + 1] = velocities[offset + 1] * damping + this.gravity[index] * dt
      velocities[offset + 2] *= damping
      positions[offset] += velocities[offset] * dt
      positions[offset + 1] += velocities[offset + 1] * dt
      positions[offset + 2] += velocities[offset + 2] * dt
      this.alphas[index] = clamp(this.life[index] / this.maxLife[index], 0, 1)
    }
    if (changed) {
      this.geometry.attributes.position.needsUpdate = true
      this.geometry.attributes.aAlpha.needsUpdate = true
    }
  }
}

const sparkles = new Sparkles()

const bubbleRoot = new THREE.Group()
scene.add(bubbleRoot)

const bubbleGeometry = new THREE.SphereGeometry(0.44, 28, 20)
const bubbleHighlightGeometry = new THREE.SphereGeometry(0.075, 10, 8)
const bubbleHighlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.65,
  depthWrite: false,
  blending: THREE.AdditiveBlending
})

const bubbleShader = {
  uniforms: {
    uOpacity: { value: 1 },
    uTint: { value: new THREE.Color(0xffffff) }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 modelView = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-modelView.xyz);
      gl_Position = projectionMatrix * modelView;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    uniform vec3 uTint;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 2.1);
      float band = 0.5 + 0.5 * sin(vNormal.x * 6.4 + vNormal.y * 4.7);
      vec3 cool = vec3(0.52, 0.87, 1.0);
      vec3 warm = vec3(1.0, 0.62, 0.87);
      vec3 iridescent = mix(cool, warm, band);
      vec3 color = mix(iridescent, uTint, 0.42);
      color += vec3(0.35) * pow(fresnel, 2.0);
      float alpha = (0.07 + fresnel * 0.64) * uOpacity;
      gl_FragColor = vec4(color, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
}

const colorInfo = new Map(LEARNING_COLORS.map((color) => [color.id, color]))
const colorMaterialCache = new Map()

function materialForColor(colorId) {
  if (!colorMaterialCache.has(colorId)) {
    const hex = colorInfo.get(colorId)?.hex ?? 0xffd45e
    colorMaterialCache.set(colorId, toon(hex))
  }
  return colorMaterialCache.get(colorId)
}

function makeStarGeometry() {
  const shape = new THREE.Shape()
  const points = 5
  for (let index = 0; index < points * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / points
    const radius = index % 2 === 0 ? 0.52 : 0.23
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.03,
    bevelSegments: 2,
    curveSegments: 4
  })
  geometry.center()
  return geometry
}

function makeHeartGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.34)
  shape.bezierCurveTo(0.0, 0.58, -0.4, 0.78, -0.54, 0.42)
  shape.bezierCurveTo(-0.72, -0.02, -0.18, -0.36, 0, -0.58)
  shape.bezierCurveTo(0.18, -0.36, 0.72, -0.02, 0.54, 0.42)
  shape.bezierCurveTo(0.4, 0.78, 0.0, 0.58, 0, 0.34)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.03,
    bevelSegments: 2,
    curveSegments: 8
  })
  geometry.center()
  return geometry
}

function makeTriangleGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.3)
  shape.lineTo(0.3, -0.22)
  shape.lineTo(-0.3, -0.22)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.02,
    bevelSegments: 2,
    curveSegments: 3
  })
  geometry.center()
  return geometry
}

function makeSquareGeometry() {
  const shape = new THREE.Shape()
  const half = 0.255
  const radius = 0.07
  shape.moveTo(-half + radius, -half)
  shape.lineTo(half - radius, -half)
  shape.quadraticCurveTo(half, -half, half, -half + radius)
  shape.lineTo(half, half - radius)
  shape.quadraticCurveTo(half, half, half - radius, half)
  shape.lineTo(-half + radius, half)
  shape.quadraticCurveTo(-half, half, -half, half - radius)
  shape.lineTo(-half, -half + radius)
  shape.quadraticCurveTo(-half, -half, -half + radius, -half)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.02,
    bevelSegments: 2,
    curveSegments: 4
  })
  geometry.center()
  return geometry
}

const shapeGeometries = {
  circle: new THREE.CylinderGeometry(0.26, 0.26, 0.1, 26),
  triangle: makeTriangleGeometry(),
  square: makeSquareGeometry(),
  star: makeStarGeometry(),
  heart: makeHeartGeometry()
}
const numberMaterials = new Map()

function numberMaterial(number) {
  if (numberMaterials.has(number)) return numberMaterials.get(number)
  const size = 160
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d')
  context.clearRect(0, 0, size, size)
  context.font = '900 112px ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineWidth = 16
  context.strokeStyle = 'rgba(86, 54, 92, 0.55)'
  context.strokeText(String(number), size / 2, size / 2 + 4)
  context.fillStyle = '#fffdf7'
  context.fillText(String(number), size / 2, size / 2 + 4)
  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true
  })
  numberMaterials.set(number, material)
  return material
}

const bubbleGlowMaterials = new Map()

function glowMaterialForColor(colorId) {
  if (bubbleGlowMaterials.has(colorId)) return bubbleGlowMaterials.get(colorId)
  const hex = colorInfo.get(colorId)?.hex ?? 0xfff2c7
  const material = new THREE.SpriteMaterial({
    map: softCircle,
    color: hex,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  bubbleGlowMaterials.set(colorId, material)
  return material
}

function createItem(shape, colorId) {
  const group = new THREE.Group()
  const geometry = shapeGeometries[shape] || shapeGeometries.circle
  const mesh = new THREE.Mesh(geometry, materialForColor(colorId))
  if (shape === 'circle') mesh.rotation.x = Math.PI / 2
  if (shape === 'star') mesh.scale.setScalar(0.58)
  if (shape === 'heart') mesh.scale.setScalar(0.58)
  mesh.castShadow = false
  group.add(mesh)
  return group
}

const bubbles = []
const popping = []

function currentBubbleBounds() {
  const distance = Math.abs(camera.position.z)
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance
  const halfWidth = halfHeight * camera.aspect
  return {
    minX: -Math.min(halfWidth * 0.66, 4.5),
    maxX: Math.min(halfWidth * 0.66, 4.5),
    minY: 1.25,
    maxY: camera.aspect < 0.8 ? 5.05 : Math.min(4.4, 1.25 + halfHeight * 1.1),
    minZ: -1.5,
    maxZ: 1.8
  }
}

let bubbleSerial = 0

function createBubble(position, overrides = {}) {
  const color = overrides.color ?? LEARNING_COLORS[Math.floor(Math.random() * LEARNING_COLORS.length)].id
  const shape = overrides.shape ?? LEARNING_SHAPES[Math.floor(Math.random() * LEARNING_SHAPES.length)].id
  const number = overrides.number ?? 1 + Math.floor(Math.random() * 5)
  const hex = colorInfo.get(color)?.hex ?? 0xffd45e
  const material = new THREE.ShaderMaterial({
    ...bubbleShader,
    uniforms: {
      uOpacity: { value: 1 },
      uTint: { value: new THREE.Color(hex) }
    }
  })
  const group = new THREE.Group()
  group.position.copy(position)

  const glow = new THREE.Sprite(glowMaterialForColor(color))
  glow.scale.set(1.45, 1.45, 1)
  glow.renderOrder = 3
  group.add(glow)

  const sphere = new THREE.Mesh(bubbleGeometry, material)
  sphere.renderOrder = 4
  group.add(sphere)

  const highlight = new THREE.Mesh(bubbleHighlightGeometry, bubbleHighlightMaterial)
  highlight.position.set(-0.16, 0.18, 0.26)
  highlight.scale.set(1.2, 0.7, 0.4)
  highlight.renderOrder = 5
  group.add(highlight)

  const item = createItem(shape, color)
  item.rotation.set(0.08, (Math.random() - 0.5) * 0.7, Math.random() * 0.1)
  item.scale.setScalar(0.92)
  group.add(item)

  const numberSprite = new THREE.Sprite(numberMaterial(number))
  numberSprite.position.set(0, 0.01, 0.33)
  numberSprite.scale.set(0.5, 0.5, 1)
  numberSprite.renderOrder = 5
  group.add(numberSprite)

  bubbleRoot.add(group)
  const bubble = {
    id: ++bubbleSerial,
    group,
    item,
    numberSprite,
    material,
    glow,
    color,
    shape,
    number,
    colorHex: hex,
    base: position.clone(),
    phase: Math.random() * Math.PI * 2,
    speed: 0.7 + Math.random() * 0.4,
    alive: true
  }
  bubbles.push(bubble)
  return bubble
}

function projectedPoint(x, y, z) {
  const projected = tmpVec.set(x, y, z).project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projected.y * 0.5 + 0.5) * window.innerHeight
  }
}

function bubbleScreenRadius(x, y, z) {
  const point = tmpVec.set(x, y, z)
  const distance = camera.position.distanceTo(point)
  const halfHeightFactor = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  return (0.44 / (halfHeightFactor * distance)) * (window.innerHeight / 2)
}

function placementFitsScreen(point, padding = 14) {
  const screen = projectedPoint(point.x, point.y, point.z)
  const radius = bubbleScreenRadius(point.x, point.y, point.z)
  const topSafe = camera.aspect < 0.8 ? 152 : window.innerHeight < 640 ? 118 : 84
  return (
    screen.x - radius > padding &&
    screen.x + radius < window.innerWidth - padding &&
    screen.y - radius > topSafe &&
    screen.y + radius < window.innerHeight - padding
  )
}

function chooseBubblePosition(existing, minWorldDistance) {
  const bounds = currentBubbleBounds()
  const bunnyPoint = projectedPoint(0, 1.3, 1.15)
  let best = null
  let bestClearance = -Infinity
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = nextSpawn(existing, bounds, Math.random, minWorldDistance)
    if (!placementFitsScreen(candidate)) continue
    const point = projectedPoint(candidate.x, candidate.y, candidate.z)
    if (Math.hypot(point.x - bunnyPoint.x, point.y - bunnyPoint.y) < 160) continue
    const radius = bubbleScreenRadius(candidate.x, candidate.y, candidate.z)
    let clearance = Infinity
    for (const other of existing) {
      const otherPoint = projectedPoint(other.x, other.y, other.z)
      const otherRadius = bubbleScreenRadius(other.x, other.y, other.z)
      clearance = Math.min(
        clearance,
        Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) - radius - otherRadius
      )
    }
    if (clearance > bestClearance) {
      best = candidate
      bestClearance = clearance
    }
    if (clearance >= 18) return candidate
  }
  return best
}

function findBubblePosition(minWorldDistance) {
  return chooseBubblePosition(
    bubbles.map((bubble) => bubble.base),
    minWorldDistance
  )
}

function spawnBubble() {
  if (!started) return
  const position = findBubblePosition(camera.aspect < 0.8 ? 1.1 : 1.5)
  createBubble(tmpVec.set(position.x, position.y, position.z))
}

function removeBubble(bubble) {
  const index = bubbles.indexOf(bubble)
  if (index >= 0) bubbles.splice(index, 1)
}

function bubbleScreenCandidates() {
  const width = window.innerWidth
  const height = window.innerHeight
  const halfHeightFactor = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  return bubbles
    .filter((bubble) => bubble.alive)
    .map((bubble) => {
      const world = bubble.group.position
      const projected = world.clone().project(camera)
      if (projected.z > 1) return null
      const distance = camera.position.distanceTo(world)
      const radius = (0.44 / (halfHeightFactor * distance)) * (height / 2)
      return {
        bubble,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        radius: Math.max(radius, 22)
      }
    })
    .filter(Boolean)
}

function updateScore() {
  scoreElement.textContent = scoreLabel(score)
}

const challengeShapePaths = {
  circle: '<circle cx="24" cy="24" r="17"/>',
  triangle: '<path d="M24 5 43 39H5Z"/>',
  square: '<rect x="8" y="8" width="32" height="32" rx="8"/>',
  star: '<path d="M24 4.5 30.5 18l14.6 2-10.6 10.3 2.6 14.5L24 38.1 10.9 44.8l2.6-14.5L2.9 20l14.6-2Z"/>',
  heart: '<path d="M24 42S6 31 6 18.8C6 12 11 8 16.5 8c3.6 0 6.4 2 7.5 4.2C25.1 10 27.9 8 31.5 8 37 8 42 12 42 18.8 42 31 24 42 24 42Z"/>'
}

function renderChallenge() {
  if (!challenge) {
    challengeBar.classList.remove('visible')
    return
  }
  challengeBar.classList.add('visible')
  challengeBar.dataset.type = challenge.type
  challengeText.textContent = challenge.prompt
  const typeIndex = ['color', 'shape', 'number'].indexOf(challenge.type)
  challengeDots.forEach((dot, index) => dot.classList.toggle('active', index === typeIndex))

  if (challenge.type === 'color') {
    const hex = `#${(challenge.hex ?? 0xffffff).toString(16).padStart(6, '0')}`
    challengeIcon.innerHTML = `<span class="challenge-swatch" style="--swatch:${hex}"></span>`
  } else if (challenge.type === 'shape') {
    challengeIcon.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">${challengeShapePaths[challenge.shape] || challengeShapePaths.circle}</svg>`
  } else {
    challengeIcon.innerHTML = `<span class="challenge-numeral">${challenge.label}</span>`
  }
}

function hideFeedback() {
  feedback.classList.remove('visible', 'correct', 'almost')
}

function showFeedback(correct, text) {
  window.clearTimeout(feedbackTimer)
  feedbackText.textContent = text
  feedback.classList.remove('visible', 'correct', 'almost')
  void feedback.offsetWidth
  feedback.classList.add('visible', correct ? 'correct' : 'almost')
  feedbackTimer = window.setTimeout(hideFeedback, correct ? 1500 : 1300)
}

function makeChallenge(delay = 0) {
  window.clearTimeout(challengeTimer)
  window.clearTimeout(hintTimer)
  hintUsed = false
  hideHint()
  challenge = null
  renderChallenge()
  challengeTimer = window.setTimeout(() => {
    if (!started || !bubbles.length) return
    const next = createChallenge(bubbles, lastChallengeType, Math.random)
    if (!next) return
    lastChallengeType = next.type
    challenge = next
    renderChallenge()
    voice.speak(next.spokenPrompt)
    hintTimer = window.setTimeout(showHint, 8000)
  }, delay)
}

function scheduleHint(delay = 8000) {
  window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(showHint, delay)
}

const starSvg =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5.5 40.4 23l19.1 2.7-13.9 13.4 3.4 19L32 49.5 15 58.1l3.4-19L4.5 25.7 23.6 23Z" fill="#ffd25e" stroke="#fff7dc" stroke-width="4" stroke-linejoin="round"/></svg>'

function flyStar(x, y) {
  const star = document.createElement('div')
  star.className = 'star-fly'
  star.innerHTML = starSvg
  star.style.left = `${x}px`
  star.style.top = `${y}px`
  document.body.appendChild(star)
  const target = scorePill.getBoundingClientRect()
  const dx = target.left + target.width / 2 - x
  const dy = target.top + target.height / 2 - y
  const animation = star.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.35) rotate(0deg)', opacity: 0.2 },
      {
        transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.12 - 40}px)) scale(1.1) rotate(150deg)`,
        opacity: 1,
        offset: 0.5
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.25) rotate(360deg)`,
        opacity: 0
      }
    ],
    { duration: 620, easing: 'cubic-bezier(.22,.9,.32,1)' }
  )
  animation.onfinish = () => {
    star.remove()
    scorePill.classList.remove('bump')
    void scorePill.offsetWidth
    scorePill.classList.add('bump')
    window.setTimeout(() => scorePill.classList.remove('bump'), 360)
  }
}

const skyPalettes = [
  { top: '#8fd8ff', bottom: '#ffe9f2' },
  { top: '#ffb7d4', bottom: '#fff0d6' },
  { top: '#a5e6d1', bottom: '#eafaff' },
  { top: '#c7b7ff', bottom: '#ffe7f6' },
  { top: '#ffd29a', bottom: '#fff6e0' }
]

function setSky(index) {
  const palette = skyPalettes[index % skyPalettes.length]
  skyFromTop.copy(skyMaterial.uniforms.topColor.value)
  skyFromBottom.copy(skyMaterial.uniforms.bottomColor.value)
  skyToTop.set(palette.top)
  skyToBottom.set(palette.bottom)
  skyBlend = 0
}

function celebrate() {
  const level = milestoneCount(score)
  celebrationNumber.textContent = `${score}!`
  celebration.classList.remove('play')
  void celebration.offsetWidth
  celebration.classList.add('play')
  window.setTimeout(() => celebration.classList.remove('play'), 2100)

  sparkles.confetti(new THREE.Vector3(0, 4.4, 0.4), reducedMotion ? 36 : 140)
  audio.celebrate()
  audio.cheer(level)
  bunny.cheerTime = 1.05
  setSky(level)
  if (level > 0 && level <= butterflies.length) {
    butterflies[level - 1].celebrate = 2.5
  }
}

function popBubble(candidate, screenX, screenY) {
  const bubble = candidate.bubble
  if (!bubble.alive) return
  bubble.alive = false
  const position = new THREE.Vector3()
  bubble.group.getWorldPosition(position)
  const correct = challenge ? bubbleMatchesChallenge(bubble, challenge) : false
  const solvedChallenge = challenge

  sparkles.spawn(position, bubble.colorHex, reducedMotion ? 10 : (correct ? 26 : 16), {
    speed: 2.8,
    size: 0.34,
    life: 1,
    gravity: -2.2
  })
  sparkles.spawn(position, 0xffffff, reducedMotion ? 4 : 8, {
    speed: 1.4,
    size: 0.24,
    life: 0.8,
    gravity: -0.8
  })

  popping.push({ group: bubble.group, material: bubble.material, time: 0 })
  removeBubble(bubble)
  hideHint()

  if (correct) {
    const praise = challengeFeedback(solvedChallenge, true)
    audio.pop(score)
    score += 1
    updateScore()
    flyStar(screenX, screenY)
    bunny.cheerTime = Math.max(bunny.cheerTime, 0.62)
    bunny.lookBubble = position
    bunny.lookTimer = 1.3
    const milestone = isMilestone(score)
    if (milestone) hideFeedback()
    else showFeedback(true, praise.text)
    voice.speak(praise.spoken)
    hintUsed = true
    window.clearTimeout(hintTimer)
    if (milestone) celebrate()
    makeChallenge(milestone ? 2300 : 1650)
  } else if (solvedChallenge) {
    const feedbackData = challengeFeedback(solvedChallenge, false)
    audio.almost()
    audio.tap()
    bunny.lookBubble = position
    bunny.lookTimer = 0.9
    showFeedback(false, feedbackData.text)
    voice.speak(feedbackData.spoken)
    hintUsed = false
    scheduleHint(1800)
    challengeBar.classList.remove('nudge')
    void challengeBar.offsetWidth
    challengeBar.classList.add('nudge')
    window.setTimeout(() => challengeBar.classList.remove('nudge'), 500)
  } else {
    audio.pop(score)
    bunny.cheerTime = Math.max(bunny.cheerTime, 0.2)
    bunny.lookBubble = position
    bunny.lookTimer = 0.8
  }

  window.setTimeout(spawnBubble, correct ? 520 + Math.random() * 420 : 430 + Math.random() * 300)
}

function hideHint() {
  hintVisible = false
  hint.classList.remove('visible')
  hintRing.classList.remove('visible')
}

function showHint() {
  if (started && !hintUsed) {
    hintVisible = true
    hint.classList.add('visible')
    hintRing.classList.add('visible')
    hintDeadline = elapsed + 10
  }
}

function updateHintPosition() {
  if (!hintVisible) return
  const width = window.innerWidth
  const height = window.innerHeight
  const centerX = width / 2
  const centerY = height * 0.45
  const bunnyPoint = projectedPoint(0, 1.3, 1.15)
  const allCandidates = bubbleScreenCandidates()
  const answerCandidates = challenge
    ? allCandidates.filter((candidate) => bubbleMatchesChallenge(candidate.bubble, challenge))
    : allCandidates
  const candidates = answerCandidates.filter(
    (candidate) =>
      candidate.x > 84 &&
      candidate.x < width - 84 &&
      candidate.y > 130 &&
      candidate.y < height - 130 &&
      Math.hypot(candidate.x - bunnyPoint.x, candidate.y - bunnyPoint.y) >
        candidate.radius + 82
  )
  const target =
    candidates.reduce((best, candidate) => {
      if (!best) return candidate
      const distance = Math.hypot(candidate.x - centerX, candidate.y - centerY)
      const bestDistance = Math.hypot(best.x - centerX, best.y - centerY)
      return distance < bestDistance ? candidate : best
    }, null) || answerCandidates[0] || allCandidates[0]
  if (!target) return
  const size = Math.max(92, target.radius * 2.7)
  hintRing.style.width = `${size}px`
  hintRing.style.height = `${size}px`
  hintRing.style.left = `${target.x}px`
  hintRing.style.top = `${target.y}px`
  hint.style.left = `${target.x - size * 0.55}px`
  hint.style.top = `${target.y + size * 0.24}px`
  if (elapsed > hintDeadline) hideHint()
}

const ripples = []
const rippleGeometry = new THREE.RingGeometry(0.24, 0.32, 36)

function spawnRipple(target) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff8ea,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const mesh = new THREE.Mesh(rippleGeometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(target.x, 0.03, target.z)
  scene.add(mesh)
  ripples.push({ mesh, material, time: 0 })
}

function moveBunnyTo(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  pointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  raycaster.setFromCamera(pointerNdc, camera)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return false
  const target = clampTarget(hit.x, hit.z)
  bunny.target.set(target.x, 0, target.z)
  spawnRipple(target)
  sparkles.spawn(new THREE.Vector3(target.x, 0.15, target.z), 0xfff0b8, 7, {
    speed: 1.2,
    size: 0.22,
    life: 0.7,
    gravity: -0.4
  })
  audio.hop()
  return true
}

function handlePointerDown(event) {
  if (!started) return
  const { clientX, clientY } = event
  const candidates = bubbleScreenCandidates()
  const padding = Math.min(30, Math.max(16, window.innerWidth * 0.035))
  const hit = pickHit(candidates, { x: clientX, y: clientY }, padding)
  if (hit) {
    popBubble(hit, clientX, clientY)
    return
  }
  moveBunnyTo(clientX, clientY)
}

function handlePointerMove(event) {
  if (event.pointerType === 'touch') return
  const rect = canvas.getBoundingClientRect()
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
  const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1
  parallax.targetX = clamp(nx, -1, 1)
  parallax.targetY = clamp(ny, -1, 1)

  if (!started) return
  const hit = pickHit(
    bubbleScreenCandidates(),
    { x: event.clientX, y: event.clientY },
    Math.min(28, Math.max(14, window.innerWidth * 0.03))
  )
  canvas.classList.toggle('can-pop', Boolean(hit))
}

function setSound(mutedValue) {
  muted = mutedValue
  audio.setMuted(muted)
  voice.setMuted(muted)
  document.body.classList.toggle('muted', muted)
  for (const button of soundButtons) {
    button.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off')
  }
  const label = document.querySelector('.sound-label')
  if (label) label.textContent = muted ? 'Sound off' : 'Sound on'
  try {
    window.localStorage.setItem(STORE_KEY, muted ? '1' : '0')
  } catch {
    /* storage is optional */
  }
}

async function toggleSound() {
  await audio.unlock()
  setSound(!muted)
  if (!muted) {
    audio.tone(659.25, 0.2, { type: 'sine', gain: 0.12, slideTo: 783.99 })
    audio.start()
    if (challenge) voice.speak(challenge.spokenPrompt)
  }
}

async function startGame() {
  if (started) return
  started = true
  await audio.unlock()
  audio.start()
  setSound(muted)
  if (!muted) {
    audio.cheer(1)
    audio.startMusic()
  }
  document.body.classList.add('playing')
  document.querySelector('#hud').removeAttribute('aria-hidden')
  challengeBar.removeAttribute('aria-hidden')
  intro.classList.add('hidden')
  intro.setAttribute('aria-hidden', 'true')
  bunny.root.position.set(0, 0, 1.15)
  bunny.root.rotation.y = 0
  bunny.target.set(0, 0, 1.15)
  bunny.cheerTime = 0.9
  sparkles.spawn(new THREE.Vector3(0, 1.25, 1.55), 0xfff1b8, reducedMotion ? 8 : 16, {
    speed: 1.6,
    size: 0.3,
    life: 0.9,
    gravity: -0.6
  })
  makeChallenge(650)
}

function reflowBubbles() {
  if (!bubbles.length) return
  const placed = []
  for (const bubble of bubbles) {
    const target = chooseBubblePosition(placed, camera.aspect < 0.8 ? 1.1 : 1.5)
    if (!target) continue
    bubble.base.set(target.x, target.y, target.z)
    bubble.group.position.copy(bubble.base)
    placed.push(target)
  }
  hideHint()
  if (challenge) scheduleHint(4000)
}

let lastLayoutAspect = 0

function layout() {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height, false)
  const previousAspect = camera.aspect
  camera.aspect = width / height

  const portrait = camera.aspect < 0.82
  const shortLandscape = !portrait && height < 540
  camera.fov = portrait ? 52 : shortLandscape ? 44 : 42
  cameraBase.set(
    0,
    portrait ? 4.25 : shortLandscape ? 3.1 : 3.55,
    portrait ? 11.6 : shortLandscape ? 8.35 : 9.7
  )
  camera.position.copy(cameraBase)
  camera.lookAt(cameraTarget)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()

  if (lastLayoutAspect && Math.abs(camera.aspect - previousAspect) > 0.12) {
    reflowBubbles()
    syncBubbleCount()
    if (started) makeChallenge(500)
  } else {
    const bounds = currentBubbleBounds()
    for (const bubble of bubbles) {
      bubble.base.x = clamp(bubble.base.x, bounds.minX, bounds.maxX)
      bubble.base.y = clamp(bubble.base.y, bounds.minY, bounds.maxY)
      bubble.base.z = clamp(bubble.base.z, bounds.minZ, bounds.maxZ)
    }
  }
  lastLayoutAspect = camera.aspect
}

buildLights()
buildGround()
buildHills()
buildRainbow()
buildTrees()
buildBushes()
buildMushrooms()
buildTulips()
buildFlowers()
buildFence()
const clouds = buildClouds()
buildSun()
const sunRays = buildSunRays()
const butterflies = buildButterflies()
const birds = buildBirds()
const pollen = buildPollen()
const petals = buildPetals()
const bunny = buildBunny()
layout()

function desiredBubbleCount() {
  if (window.innerHeight < 540 && window.innerWidth > window.innerHeight) return 5
  return camera.aspect < 0.8 ? 6 : 7
}

function syncBubbleCount() {
  const desired = desiredBubbleCount()
  while (bubbles.length > desired) {
    const bubble = bubbles[bubbles.length - 1]
    bubbleRoot.remove(bubble.group)
    removeBubble(bubble)
  }
  let added = false
  while (bubbles.length < desired) {
    const position = findBubblePosition(camera.aspect < 0.8 ? 1.1 : 1.5)
    if (!position) break
    createBubble(new THREE.Vector3(position.x, position.y, position.z))
    added = true
  }
  if (added) hideHint()
  return added
}

for (let index = 0; index < desiredBubbleCount(); index += 1) {
  const position = findBubblePosition(camera.aspect < 0.8 ? 1.1 : 1.5)
  createBubble(new THREE.Vector3(position.x, position.y, position.z))
}

playButton.addEventListener('click', startGame)
for (const button of soundButtons) button.addEventListener('click', toggleSound)
infoButton.addEventListener('click', () => infoDialog.showModal())
closeInfo.addEventListener('click', () => infoDialog.close())
infoDialog.addEventListener('click', (event) => {
  if (event.target === infoDialog) infoDialog.close()
})

canvas.addEventListener('pointerdown', handlePointerDown)
canvas.addEventListener('pointermove', handlePointerMove)
canvas.addEventListener('pointerleave', () => {
  parallax.targetX = 0
  parallax.targetY = 0
  canvas.classList.remove('can-pop')
})
canvas.addEventListener('contextmenu', (event) => event.preventDefault())

window.addEventListener('keydown', (event) => {
  if (!started || infoDialog.open) return
  if (event.code !== 'Space' && event.code !== 'Enter') return
  event.preventDefault()
  const candidates = bubbleScreenCandidates()
  if (!candidates.length) return
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const target = candidates.reduce((best, candidate) => {
    if (!best) return candidate
    const distance = Math.hypot(candidate.x - centerX, candidate.y - centerY)
    const bestDistance = Math.hypot(best.x - centerX, best.y - centerY)
    return distance < bestDistance ? candidate : best
  }, null)
  popBubble(target, target.x, target.y)
})

window.addEventListener('resize', layout)

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta()
})

function updateBunny(dt) {
  const root = bunny.root
  const dx = bunny.target.x - root.position.x
  const dz = bunny.target.z - root.position.z
  const distance = Math.hypot(dx, dz)

  bunny.moving = distance > 0.05
  if (bunny.moving) {
    const step = Math.min(distance, dt * 1.55)
    root.position.x += (dx / distance) * step
    root.position.z += (dz / distance) * step
    const desired = Math.atan2(dx, dz)
    let difference = desired - root.rotation.y
    while (difference > Math.PI) difference -= Math.PI * 2
    while (difference < -Math.PI) difference += Math.PI * 2
    root.rotation.y += difference * Math.min(1, dt * 8)
    bunny.hopPhase += dt * 8.5
  } else {
    bunny.hopPhase += dt * 2
    let difference = 0 - root.rotation.y
    while (difference > Math.PI) difference -= Math.PI * 2
    while (difference < -Math.PI) difference += Math.PI * 2
    root.rotation.y += difference * Math.min(1, dt * 2.4)
  }

  const hop = bunny.moving ? Math.abs(Math.sin(bunny.hopPhase)) * 0.2 : 0
  const idle = Math.sin(elapsed * 1.7) * 0.018
  let cheer = 0
  if (bunny.cheerTime > 0) {
    bunny.cheerTime = Math.max(0, bunny.cheerTime - dt)
    const progress = 1 - bunny.cheerTime / 1.05
    cheer = Math.sin(clamp(progress, 0, 1) * Math.PI) * 0.55
  }
  root.position.y = hop + cheer + idle

  const squash = bunny.moving ? 1 + Math.sin(bunny.hopPhase * 2) * 0.035 : 1 + Math.sin(elapsed * 1.7) * 0.012
  bunny.body.scale.set(1.02 / squash, 0.92 * squash, 0.92 / squash)
  bunny.head.position.y = 1.42 + Math.sin(elapsed * 1.7) * 0.012
  bunny.head.rotation.z = Math.sin(elapsed * 1.2) * 0.012
  bunny.crown.rotation.z = Math.sin(elapsed * 1.4) * 0.025
  bunny.scarf.rotation.z = Math.sin(elapsed * 1.8) * 0.018

  for (const ear of bunny.ears) {
    ear.pivot.rotation.z = ear.baseAngle + Math.sin(elapsed * 1.5 + ear.side) * 0.05
  }

  bunny.blinkTimer -= dt
  if (bunny.blinkTimer <= 0 && bunny.blinkTime <= 0) {
    bunny.blinkTime = 0.15
    bunny.blinkTimer = 2.2 + Math.random() * 2.8
  }
  if (bunny.blinkTime > 0) {
    bunny.blinkTime = Math.max(0, bunny.blinkTime - dt)
    const amount = Math.sin((1 - bunny.blinkTime / 0.15) * Math.PI)
    for (const eye of bunny.eyes) eye.scale.y = 1 - amount * 0.9
  } else {
    for (const eye of bunny.eyes) eye.scale.y += (1 - eye.scale.y) * Math.min(1, dt * 12)
  }

  let lookAt = null
  if (bunny.lookTimer > 0) {
    bunny.lookTimer -= dt
    lookAt = bunny.lookBubble
  } else if (!bunny.moving) {
    let nearest = null
    let nearestDistance = Infinity
    for (const bubble of bubbles) {
      if (!bubble.alive) continue
      const bubbleDistance = bubble.group.position.distanceToSquared(root.position)
      if (bubbleDistance < nearestDistance) {
        nearestDistance = bubbleDistance
        nearest = bubble.group.position
      }
    }
    lookAt = nearest
  }

  if (lookAt) {
    const localX = lookAt.x - root.position.x
    const localZ = lookAt.z - root.position.z
    const localAngle = Math.atan2(localX, localZ) - root.rotation.y
    let wrapped = localAngle
    while (wrapped > Math.PI) wrapped -= Math.PI * 2
    while (wrapped < -Math.PI) wrapped += Math.PI * 2
    bunny.head.rotation.y += (clamp(wrapped, -0.45, 0.45) - bunny.head.rotation.y) * Math.min(1, dt * 4)
  } else {
    bunny.head.rotation.y += (0 - bunny.head.rotation.y) * Math.min(1, dt * 3)
  }

  for (const { arm, side } of bunny.arms) {
    arm.rotation.z = side * 0.72 + Math.sin(elapsed * 2 + side) * 0.04
  }
  bunny.tail.position.x = Math.sin(elapsed * 5.2) * 0.02

  bunny.blob.position.x = root.position.x
  bunny.blob.position.z = root.position.z
  const blobScale = 1 - clamp(root.position.y, 0, 0.8) * 0.25
  bunny.blob.scale.set(blobScale, blobScale, blobScale)
}

function updateWorld(dt) {
  const time = elapsed

  for (const bubble of bubbles) {
    const wave = time * bubble.speed + bubble.phase
    bubble.group.position.x = bubble.base.x + Math.sin(wave * 0.8) * 0.1
    bubble.group.position.y = bubble.base.y + Math.sin(wave) * 0.14
    bubble.group.position.z = bubble.base.z + Math.cos(wave * 0.6) * 0.06
    bubble.group.rotation.z = Math.sin(wave * 0.7) * 0.06
    bubble.item.rotation.y = Math.sin(wave * 0.55) * 0.32
    bubble.item.rotation.x = Math.cos(wave * 0.45) * 0.12
    bubble.item.rotation.z = Math.sin(wave * 0.9) * 0.12
    bubble.item.position.y = Math.sin(wave * 1.3) * 0.025
    bubble.numberSprite.position.y = 0.01 + Math.sin(wave * 1.3) * 0.02
    const glowScale = 1.42 + Math.sin(wave * 0.8) * 0.08
    bubble.glow.scale.set(glowScale, glowScale, 1)
  }

  for (let index = popping.length - 1; index >= 0; index -= 1) {
    const entry = popping[index]
    entry.time += dt
    const progress = clamp(entry.time / 0.26, 0, 1)
    entry.group.scale.setScalar(1 + progress * 0.55)
    entry.material.uniforms.uOpacity.value = 1 - progress
    if (progress >= 1) {
      bubbleRoot.remove(entry.group)
      entry.material.dispose()
      popping.splice(index, 1)
    }
  }

  for (let index = ripples.length - 1; index >= 0; index -= 1) {
    const ripple = ripples[index]
    ripple.time += dt
    const progress = clamp(ripple.time / 0.75, 0, 1)
    ripple.mesh.scale.setScalar(1 + progress * 3.2)
    ripple.material.opacity = 0.75 * (1 - progress)
    if (progress >= 1) {
      scene.remove(ripple.mesh)
      ripple.material.dispose()
      ripples.splice(index, 1)
    }
  }

  for (const butterfly of butterflies) {
    const angle = time * butterfly.speed + butterfly.phase
    butterfly.group.position.x = butterfly.centerX + Math.cos(angle) * butterfly.radius
    butterfly.group.position.z = butterfly.centerZ + Math.sin(angle) * butterfly.radius * 0.7
    butterfly.group.position.y =
      butterfly.height + Math.sin(time * 2.2 + butterfly.phase) * 0.22
    butterfly.group.rotation.y = -angle + Math.PI / 2
    butterfly.group.rotation.z = Math.sin(time * 2.2 + butterfly.phase) * 0.14
    const flap = Math.sin(time * 13 + butterfly.phase) * 0.85 + 0.18
    butterfly.wingPivots[0].rotation.y = -flap
    butterfly.wingPivots[1].rotation.y = flap
    if (butterfly.celebrate > 0) {
      butterfly.celebrate = Math.max(0, butterfly.celebrate - dt)
      butterfly.group.position.y += Math.sin(time * 20) * 0.05
    }
  }

  const positions = pollen.positions
  for (let index = 0; index < pollen.count; index += 1) {
    const offset = index * 3
    positions[offset] += Math.sin(time * 0.35 + pollen.seeds[offset]) * dt * 0.12
    positions[offset + 1] += Math.cos(time * 0.28 + pollen.seeds[offset + 1]) * dt * 0.05 + dt * 0.02
    positions[offset + 2] += Math.cos(time * 0.3 + pollen.seeds[offset + 2]) * dt * 0.08
    if (positions[offset + 1] > 6) positions[offset + 1] = 0.3
  }
  pollen.points.geometry.attributes.position.needsUpdate = true

  for (const entry of clouds) {
    entry.cloud.position.x = entry.baseX + Math.sin(time * 0.05 * entry.speed) * 4
  }

  sunRays.rotation.z += dt * 0.025
  for (const bird of birds) {
    bird.group.position.x = bird.baseX + Math.sin(time * bird.speed * 0.18 + bird.phase) * 5
    bird.group.position.y = bird.baseY + Math.sin(time * 0.6 + bird.phase) * 0.18
    bird.left.rotation.z = 0.22 + Math.sin(time * 3.2 + bird.phase) * 0.18
    bird.right.rotation.z = -0.22 - Math.sin(time * 3.2 + bird.phase) * 0.18
  }

  for (let index = 0; index < petals.count; index += 1) {
    const offset = index * 3
    const seed = index * 4
    positions[offset] += Math.sin(time * 0.45 + petals.seeds[seed]) * dt * 0.24
    positions[offset + 1] -= dt * petals.seeds[seed + 1]
    positions[offset + 2] += Math.cos(time * 0.35 + petals.seeds[seed + 2]) * dt * 0.12
    if (positions[offset + 1] < 0.08) {
      positions[offset + 1] = 5.4 + (index % 7) * 0.22
      positions[offset] = ((index * 2.39 + time * 0.15) % 14) - 7
    }
  }
  petals.points.geometry.attributes.position.needsUpdate = true

  if (skyBlend < 1) {
    skyBlend = Math.min(1, skyBlend + dt * 0.75)
    skyMaterial.uniforms.topColor.value.copy(skyFromTop).lerp(skyToTop, skyBlend)
    skyMaterial.uniforms.bottomColor.value.copy(skyFromBottom).lerp(skyToBottom, skyBlend)
  }
}

function updateCamera(dt) {
  parallax.x += (parallax.targetX - parallax.x) * Math.min(1, dt * 3)
  parallax.y += (parallax.targetY - parallax.y) * Math.min(1, dt * 3)
  const drift = reducedMotion ? 0 : Math.sin(elapsed * 0.16) * 0.06
  camera.position.x = cameraBase.x + parallax.x * 0.38 + drift
  camera.position.y = cameraBase.y + parallax.y * 0.14
  camera.position.z = cameraBase.z
  camera.lookAt(cameraTarget)
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05)
  elapsed += dt

  updateBunny(dt)
  updateWorld(dt)
  updateCamera(dt)
  sparkles.update(dt)
  updateHintPosition()

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(tick)
updateScore()

window.__bubbleBunny = {
  getState() {
    return {
      started,
      score,
      bubbles: bubbles.length,
      muted,
      hintVisible,
      challenge: challenge
        ? {
            type: challenge.type,
            value: challenge.value,
            label: challenge.label,
            prompt: challenge.prompt
          }
        : null,
      bunny: {
        x: bunny.root.position.x,
        y: bunny.root.position.y,
        z: bunny.root.position.z
      }
    }
  },
  bubbleTargets() {
    return bubbleScreenCandidates().map((candidate) => ({
      x: candidate.x,
      y: candidate.y,
      radius: candidate.radius,
      color: candidate.bubble.color,
      shape: candidate.bubble.shape,
      number: candidate.bubble.number
    }))
  },
  bubbles() {
    return bubbleScreenCandidates().map((candidate) => ({
      x: candidate.x,
      y: candidate.y,
      radius: candidate.radius,
      base: {
        x: candidate.bubble.base.x,
        y: candidate.bubble.base.y,
        z: candidate.bubble.base.z
      },
      color: candidate.bubble.color,
      shape: candidate.bubble.shape,
      number: candidate.bubble.number
    }))
  },
  challengeTargets() {
    if (!challenge) return []
    return bubbleScreenCandidates()
      .filter((candidate) => bubbleMatchesChallenge(candidate.bubble, challenge))
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        radius: candidate.radius,
        color: candidate.bubble.color,
        shape: candidate.bubble.shape,
        number: candidate.bubble.number
      }))
  }
}
