// Cáusticas animadas: dos capas aditivas de reflejos de luz que se desplazan
// sobre el modelo 3D de la entidad (pensado para fondo.glb).
import * as ecs from '@8thwall/ecs'

const THREE = (window as any).THREE

// Textura de cáusticas procedural y repetible (Voronoi F2 - F1).
let sharedTexture: any = null
const causticTexture = () => {
  if (sharedTexture) return sharedTexture
  const size = 256
  const cells = 6
  const points: number[][] = []
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      points.push([(gx + Math.random()) / cells, (gy + Math.random()) / cells])
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let f1 = Infinity
      let f2 = Infinity
      for (const [px, py] of points) {
        // Distancia con envoltura para que la textura se repita sin costuras
        let dx = Math.abs(u - px)
        let dy = Math.abs(v - py)
        dx = Math.min(dx, 1 - dx)
        dy = Math.min(dy, 1 - dy)
        const d = dx * dx + dy * dy
        if (d < f1) {
          f2 = f1
          f1 = d
        } else if (d < f2) {
          f2 = d
        }
      }
      const edge = Math.sqrt(f2) - Math.sqrt(f1)
      const value = Math.pow(Math.max(0, 1 - edge * cells * 1.6), 6)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  sharedTexture = new THREE.CanvasTexture(canvas)
  sharedTexture.wrapS = sharedTexture.wrapT = THREE.RepeatWrapping
  sharedTexture.colorSpace = THREE.SRGBColorSpace
  return sharedTexture
}

// Capas creadas por entidad: {textures, done}
const layersByEid = new Map<bigint, {textures: any[], done: boolean}>()

ecs.registerComponent({
  name: 'Caustics',
  schema: {
    intensity: ecs.f32,
    repeat: ecs.f32,
    speed: ecs.f32,
    color: ecs.string,
  },
  schemaDefaults: {
    intensity: 0.35,
    repeat: 4,
    speed: 0.02,
    color: '#bff6ff',
  },
  add: (world, component) => {
    layersByEid.set(component.eid, {textures: [], done: false})
  },
  tick: (world, component) => {
    const state = layersByEid.get(component.eid)
    if (!state) return
    const {intensity, repeat, speed, color} = component.schema

    // El modelo glTF carga de forma asíncrona: se esperan sus mallas
    if (!state.done) {
      const root = world.three.entityToObject.get(component.eid)
      const meshes: any[] = []
      root?.traverse((o: any) => {
        if (o.isMesh && !o.userData.isCaustic) meshes.push(o)
      })
      if (!meshes.length) return

      const layers = [
        {scale: 1, dir: [1, 0.35]},
        {scale: 1.37, dir: [-0.45, 1]},
      ]
      for (const layer of layers) {
        const texture = causticTexture().clone()
        texture.repeat.set(repeat * layer.scale, repeat * layer.scale * 0.5)
        texture.userData.dir = layer.dir
        texture.needsUpdate = true
        state.textures.push(texture)

        for (const mesh of meshes) {
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(color),
            transparent: true,
            opacity: intensity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            // Multiplica por el degradado del fondo: más reflejos arriba, casi nada abajo
            vertexColors: !!mesh.geometry.attributes.color,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
          const overlay = new THREE.Mesh(mesh.geometry, material)
          overlay.userData.isCaustic = true
          mesh.add(overlay)
          world.three.notifyChanged(overlay)
        }
      }
      state.done = true
    }

    const t = world.time.elapsed / 1000
    for (const texture of state.textures) {
      const [dx, dy] = texture.userData.dir
      texture.offset.set(dx * speed * t, dy * speed * t)
    }
  },
  remove: (world, component) => {
    layersByEid.delete(component.eid)
  },
})
