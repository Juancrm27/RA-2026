// Rayos de luz que bajan desde la superficie del mar: planos alargados,
// aditivos y con degradado, que ondulan y cambian de intensidad.
// La entidad marca el punto alto (la "superficie") desde donde caen los rayos.
import * as ecs from '@8thwall/ecs'

const THREE = (window as any).THREE

// Textura del rayo: suave a los lados, intensa arriba y desvanecida abajo.
let sharedTexture: any = null
const rayTexture = () => {
  if (sharedTexture) return sharedTexture
  const w = 64
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)  // 0 arriba, 1 abajo
    const vertical = Math.pow(1 - v, 1.6) * Math.min(1, v * 12)
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1
      const horizontal = Math.exp(-u * u * 4.5)
      const i = (y * w + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = vertical * horizontal * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  sharedTexture = new THREE.CanvasTexture(canvas)
  sharedTexture.colorSpace = THREE.SRGBColorSpace
  return sharedTexture
}

type Ray = {mesh: any, tilt: number, phase: number, speed: number, base: number}
const raysByEid = new Map<bigint, {rays: Ray[], done: boolean}>()

ecs.registerComponent({
  name: 'Light Rays',
  schema: {
    count: ecs.i32,
    length: ecs.f32,
    width: ecs.f32,
    spreadX: ecs.f32,
    spreadZ: ecs.f32,
    tilt: ecs.f32,  // grados
    opacity: ecs.f32,
    color: ecs.string,
  },
  schemaDefaults: {
    count: 7,
    length: 1.2,
    width: 0.12,
    spreadX: 0.45,
    spreadZ: 0.25,
    tilt: 18,
    opacity: 0.22,
    color: '#c8fbff',
  },
  add: (world, component) => {
    raysByEid.set(component.eid, {rays: [], done: false})
  },
  tick: (world, component) => {
    const state = raysByEid.get(component.eid)
    if (!state) return

    if (!state.done) {
      const root = world.three.entityToObject.get(component.eid)
      if (!root) return
      const {count, length, width, spreadX, spreadZ, tilt, opacity, color} = component.schema
      const tiltRad = THREE.MathUtils.degToRad(tilt)

      for (let i = 0; i < count; i++) {
        const w = width * (0.6 + Math.random() * 0.9)
        const geometry = new THREE.PlaneGeometry(w, length)
        geometry.translate(0, -length / 2, 0)  // el pivote queda arriba, en la superficie
        const material = new THREE.MeshBasicMaterial({
          map: rayTexture(),
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(geometry, material)
        const t = count > 1 ? i / (count - 1) : 0.5
        mesh.position.set(
          (t * 2 - 1) * spreadX + (Math.random() - 0.5) * 0.08,
          0,
          (Math.random() * 2 - 1) * spreadZ
        )
        const rayTilt = tiltRad + THREE.MathUtils.degToRad((Math.random() - 0.5) * 8)
        mesh.rotation.set(0, (Math.random() - 0.5) * 0.6, rayTilt)
        root.add(mesh)
        world.three.notifyChanged(mesh)
        state.rays.push({
          mesh,
          tilt: rayTilt,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.5,
          base: opacity * (0.5 + Math.random() * 0.6),
        })
      }
      state.done = true
    }

    const time = world.time.elapsed / 1000
    for (const ray of state.rays) {
      const wave = Math.sin(time * ray.speed + ray.phase)
      ray.mesh.material.opacity = ray.base * (0.55 + 0.45 * wave)
      ray.mesh.rotation.z = ray.tilt + Math.sin(time * ray.speed * 0.7 + ray.phase) * 0.035
      world.three.notifyChanged(ray.mesh)
    }
  },
  remove: (world, component) => {
    const state = raysByEid.get(component.eid)
    state?.rays.forEach(({mesh}) => {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
    })
    raysByEid.delete(component.eid)
  },
})
