// Burbujas que salen de la cabeza de cada pez. Busca en el modelo glTF los
// huesos "head_End" (uno por pez) y suelta burbujas que suben y se desvanecen.
import * as ecs from '@8thwall/ecs'

const THREE = (window as any).THREE

// Textura de burbuja: borde brillante, centro casi transparente y un reflejo.
let sharedTexture: any = null
const bubbleTexture = () => {
  if (sharedTexture) return sharedTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2
  const body = ctx.createRadialGradient(c, c, 0, c, c, c - 1)
  body.addColorStop(0, 'rgba(255,255,255,0.05)')
  body.addColorStop(0.7, 'rgba(220,250,255,0.18)')
  body.addColorStop(0.92, 'rgba(255,255,255,0.85)')
  body.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)
  const shine = ctx.createRadialGradient(c * 0.68, c * 0.62, 0, c * 0.68, c * 0.62, c * 0.3)
  shine.addColorStop(0, 'rgba(255,255,255,0.95)')
  shine.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shine
  ctx.fillRect(0, 0, size, size)
  sharedTexture = new THREE.CanvasTexture(canvas)
  sharedTexture.colorSpace = THREE.SRGBColorSpace
  return sharedTexture
}

type Bubble = {sprite: any, age: number, life: number, size: number, phase: number, active: boolean}
type State = {
  heads: any[]
  nextSpawn: number[]
  container: any
  pool: Bubble[]
  done: boolean
}
const stateByEid = new Map<bigint, State>()
let tmp: any = null

ecs.registerComponent({
  name: 'Fish Bubbles',
  schema: {
    rate: ecs.f32,  // ráfagas por segundo por pez
    size: ecs.f32,
    riseSpeed: ecs.f32,
    lifetime: ecs.f32,  // segundos
    wobble: ecs.f32,
    maxBubbles: ecs.i32,
    opacity: ecs.f32,
  },
  schemaDefaults: {
    rate: 0.5,
    size: 0.014,
    riseSpeed: 0.09,
    lifetime: 4,
    wobble: 0.012,
    maxBubbles: 60,
    opacity: 0.9,
  },
  add: (world, component) => {
    stateByEid.set(component.eid, {heads: [], nextSpawn: [], container: null, pool: [], done: false})
  },
  tick: (world, component) => {
    const state = stateByEid.get(component.eid)
    if (!state) return
    const {rate, size, riseSpeed, lifetime, wobble, maxBubbles, opacity} = component.schema

    // El modelo carga de forma asíncrona: se esperan los huesos de las cabezas
    if (!state.done) {
      const root = world.three.entityToObject.get(component.eid)
      if (!root?.parent) return
      root.traverse((o: any) => {
        if (/head_?End/i.test(o.name)) state.heads.push(o)
      })
      if (!state.heads.length) return
      state.nextSpawn = state.heads.map(() => Math.random() * 2)

      // Las burbujas viven en el padre (el Image Target): suben en su eje Y
      // sin heredar la rotación ni la escala del modelo de los peces.
      state.container = new THREE.Group()
      root.parent.add(state.container)
      world.three.notifyChanged(state.container)
      for (let i = 0; i < maxBubbles; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: bubbleTexture(),
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }))
        sprite.visible = false
        state.container.add(sprite)
        state.pool.push({sprite, age: 0, life: 0, size: 0, phase: 0, active: false})
      }
      state.done = true
    }

    const dt = Math.min(world.time.delta / 1000, 0.1)
    const time = world.time.elapsed / 1000

    // Soltar ráfagas de 1 a 3 burbujas desde cada cabeza
    state.heads.forEach((head, i) => {
      state.nextSpawn[i] -= dt
      if (state.nextSpawn[i] > 0) return
      state.nextSpawn[i] = (0.5 + Math.random()) / Math.max(rate, 0.01)
      tmp = tmp || new THREE.Vector3()
      head.getWorldPosition(tmp)
      state.container.worldToLocal(tmp)
      const burst = 1 + Math.floor(Math.random() * 3)
      for (let b = 0; b < burst; b++) {
        const bubble = state.pool.find(p => !p.active)
        if (!bubble) return
        bubble.active = true
        bubble.age = -b * 0.15  // pequeño desfase dentro de la ráfaga
        bubble.life = lifetime * (0.7 + Math.random() * 0.6)
        bubble.size = size * (0.5 + Math.random())
        bubble.phase = Math.random() * Math.PI * 2
        bubble.sprite.position.copy(tmp)
        bubble.sprite.visible = false
      }
    })

    // Mover las burbujas activas: suben, oscilan, crecen un poco y se desvanecen
    for (const bubble of state.pool) {
      if (!bubble.active) continue
      bubble.age += dt
      if (bubble.age < 0) continue
      if (bubble.age >= bubble.life) {
        bubble.active = false
        bubble.sprite.visible = false
        world.three.notifyChanged(bubble.sprite)
        continue
      }
      const k = bubble.age / bubble.life
      const sprite = bubble.sprite
      sprite.visible = true
      sprite.position.y += riseSpeed * (0.8 + bubble.size / size * 0.4) * dt
      sprite.position.x += Math.cos(time * 3 + bubble.phase) * wobble * dt * 3
      sprite.position.z += Math.sin(time * 2.3 + bubble.phase) * wobble * dt * 2
      sprite.scale.setScalar(bubble.size * (1 + k * 0.4))
      const fadeIn = Math.min(1, bubble.age / 0.2)
      const fadeOut = 1 - Math.max(0, (k - 0.75) / 0.25)
      sprite.material.opacity = opacity * fadeIn * fadeOut
      world.three.notifyChanged(sprite)
    }
  },
  remove: (world, component) => {
    const state = stateByEid.get(component.eid)
    if (state?.container) {
      state.pool.forEach(({sprite}) => sprite.material.dispose())
      state.container.removeFromParent()
    }
    stateByEid.delete(component.eid)
  },
})
