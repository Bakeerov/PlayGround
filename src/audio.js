const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]
const AMBIENT_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
const CHORD = [261.63, 329.63, 392.0]

export class AudioEngine {
  constructor() {
    this.context = null
    this.master = null
    this.muted = false
    this.started = false
    this.noteCount = 0
    this.timer = null
  }

  get ready() {
    return Boolean(this.context)
  }

  async unlock() {
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return false
      this.context = new Ctx()
      this.master = this.context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.62

      const compressor = this.context.createDynamicsCompressor()
      compressor.threshold.value = -18
      compressor.knee.value = 24
      compressor.ratio.value = 4
      compressor.attack.value = 0.004
      compressor.release.value = 0.25

      this.master.connect(compressor)
      compressor.connect(this.context.destination)
    }

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume()
      } catch {
        return false
      }
    }
    return true
  }

  start() {
    this.started = true
    if (!this.timer) this.scheduleAmbient()
  }

  setMuted(muted) {
    this.muted = muted
    if (!this.master || !this.context) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(muted ? 0 : 0.62, now, 0.08)
  }

  tone(frequency, duration = 0.3, options = {}) {
    if (!this.context || !this.master) return
    const {
      type = 'sine',
      gain = 0.16,
      attack = 0.008,
      release = duration,
      slideTo = null,
      delay = 0,
      detune = 0
    } = options

    const ctx = this.context
    const now = ctx.currentTime + delay
    const oscillator = ctx.createOscillator()
    const envelope = ctx.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.detune.value = detune
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration)
    }

    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(duration, release + 0.02))

    oscillator.connect(envelope)
    envelope.connect(this.master)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.08)
  }

  pop(step = 0) {
    if (!this.context) return
    const note = PENTATONIC[step % PENTATONIC.length]
    this.tone(note, 0.16, { type: 'sine', gain: 0.2, slideTo: note * 1.5, release: 0.12 })
    this.tone(note * 0.5, 0.12, { type: 'triangle', gain: 0.07, slideTo: note * 0.62 })
    this.tone(note * 3, 0.07, { type: 'sine', gain: 0.025, delay: 0.005 })
  }

  hop() {
    this.tone(392, 0.1, { type: 'sine', gain: 0.06, slideTo: 523.25 })
  }

  tap() {
    this.tone(440, 0.09, { type: 'triangle', gain: 0.05, slideTo: 392 })
  }

  almost() {
    this.tone(392, 0.18, { type: 'sine', gain: 0.08, slideTo: 349.23 })
    this.tone(329.63, 0.22, { type: 'triangle', gain: 0.05, slideTo: 293.66, delay: 0.12 })
  }

  cheer(level = 1) {
    const base = Math.min(level, 6)
    const notes = PENTATONIC.slice(base % 3, (base % 3) + 3)
    notes.forEach((note, index) => {
      this.tone(note, 0.3, {
        type: 'triangle',
        gain: 0.08,
        delay: index * 0.09,
        release: 0.24
      })
    })
  }

  celebrate() {
    const run = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
    run.forEach((note, index) => {
      this.tone(note, 0.35, {
        type: 'sine',
        gain: 0.12,
        delay: index * 0.08,
        release: 0.3
      })
      this.tone(note * 2, 0.25, {
        type: 'triangle',
        gain: 0.02,
        delay: index * 0.08 + 0.02
      })
    })
    this.tone(261.63, 0.9, { type: 'sine', gain: 0.05, release: 0.8 })
    this.tone(392.0, 0.9, { type: 'sine', gain: 0.04, release: 0.8, delay: 0.06 })
  }

  startMusic() {
    if (!this.context) return
    const chordGain = 0.018
    CHORD.forEach((note, index) => {
      this.tone(note, 3.4, {
        type: 'sine',
        gain: chordGain,
        attack: 0.4,
        release: 3,
        delay: index * 0.08
      })
    })
  }

  scheduleAmbient() {
    if (!this.started) return
    const delay = 2200 + Math.random() * 1400
    this.timer = window.setTimeout(() => {
      if (this.context) {
        const note = AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)]
        this.tone(note, 2.6, {
          type: 'triangle',
          gain: 0.045,
          attack: 0.06,
          release: 2.2
        })
        this.noteCount += 1
        if (this.noteCount % 8 === 0) this.startMusic()
      }
      this.scheduleAmbient()
    }, delay)
  }
}


export class VoicePrompts {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window
    this.muted = false
    this.voice = null
    if (this.supported) {
      this.pickVoice()
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice())
    }
  }

  pickVoice() {
    if (!this.supported) return
    try {
      const voices = window.speechSynthesis.getVoices()
      this.voice =
        voices.find((voice) => /samantha|aria|jenny|google us english/i.test(voice.name)) ||
        voices.find((voice) => voice.lang === 'en-US') ||
        voices.find((voice) => voice.lang.startsWith('en')) ||
        null
    } catch {
      this.voice = null
    }
  }

  setMuted(muted) {
    this.muted = muted
    if (muted) this.cancel()
  }

  cancel() {
    if (!this.supported) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* speech is an enhancement */
    }
  }

  speak(text) {
    if (!this.supported || this.muted || !text) return
    try {
      this.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      if (this.voice) utterance.voice = this.voice
      utterance.lang = this.voice?.lang || 'en-US'
      utterance.rate = 0.88
      utterance.pitch = 1.14
      utterance.volume = 0.9
      window.speechSynthesis.speak(utterance)
    } catch {
      /* speech is an enhancement */
    }
  }
}
