// Botón de captura: tocar = foto, mantener presionado = video.
// Usa los módulos CanvasScreenshot y MediaRecorder del motor de 8th Wall.

const HOLD_MS = 350
const MAX_VIDEO_MS = 30000

const css = `
#capture-btn {
  position: fixed; left: 50%; bottom: calc(28px + env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 1000;
  width: 72px; height: 72px; border-radius: 50%;
  border: 5px solid #fff; background: rgba(255,255,255,0.25);
  box-shadow: 0 2px 10px rgba(0,0,0,0.4);
  touch-action: none; -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent; transition: background 0.15s, transform 0.15s;
}
#capture-btn:active { transform: translateX(-50%) scale(0.92); }
#capture-btn.recording { background: #e53935; border-color: #fff; }
#capture-progress {
  position: fixed; left: 50%; bottom: calc(112px + env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 1000; display: none;
  color: #fff; font: 600 14px/1 sans-serif; background: rgba(0,0,0,0.5);
  padding: 6px 10px; border-radius: 12px;
}
#capture-hint {
  position: fixed; left: 50%; bottom: calc(112px + env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 1000; pointer-events: none;
  color: #fff; font: 13px/1.2 sans-serif; text-shadow: 0 1px 3px #000;
  transition: opacity 0.5s; white-space: nowrap;
}
#capture-preview {
  position: fixed; inset: 0; z-index: 1001; display: none;
  flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: rgba(0,0,0,0.85); padding: 16px;
}
#capture-preview img, #capture-preview video {
  max-width: 100%; max-height: 72vh; border-radius: 12px;
}
#capture-preview .actions { display: flex; gap: 12px; }
#capture-preview button {
  font: 600 16px sans-serif; padding: 12px 20px; border-radius: 24px; border: none;
}
#capture-preview .primary { background: #fff; color: #000; }
#capture-preview .secondary { background: rgba(255,255,255,0.2); color: #fff; }
`

let current = null  // {blob, filename, url}

const el = (tag, attrs = {}) => Object.assign(document.createElement(tag), attrs)

const buildUi = () => {
  document.head.appendChild(el('style', {textContent: css}))

  const button = el('button', {id: 'capture-btn', ariaLabel: 'Tomar foto o grabar video'})
  const progress = el('div', {id: 'capture-progress'})
  const hint = el('div', {id: 'capture-hint', textContent: 'Toca para foto · Mantén para video'})
  const preview = el('div', {id: 'capture-preview'})
  const media = el('div')
  const actions = el('div', {className: 'actions'})
  const save = el('button', {className: 'primary', textContent: 'Guardar / Compartir'})
  const close = el('button', {className: 'secondary', textContent: 'Cerrar'})
  actions.append(save, close)
  preview.append(media, actions)
  document.body.append(button, progress, hint, preview)
  setTimeout(() => { hint.style.opacity = '0' }, 4000)

  return {button, progress, preview, media, save, close}
}

const showPreview = (ui, blob, kind) => {
  const url = URL.createObjectURL(blob)
  const ext = kind === 'photo' ? 'jpg' : (blob.type.includes('mp4') ? 'mp4' : 'webm')
  current = {blob, url, filename: `ra-${Date.now()}.${ext}`}

  ui.media.replaceChildren(kind === 'photo'
    ? el('img', {src: url})
    : el('video', {src: url, controls: true, autoplay: true, loop: true, playsInline: true}))
  ui.preview.style.display = 'flex'
}

const closePreview = (ui) => {
  ui.preview.style.display = 'none'
  ui.media.replaceChildren()
  if (current) URL.revokeObjectURL(current.url)
  current = null
}

const saveOrShare = async () => {
  if (!current) return
  const file = new File([current.blob], current.filename, {type: current.blob.type})
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try {
      await navigator.share({files: [file]})
      return
    } catch (e) {
      if (e.name === 'AbortError') return
    }
  }
  const a = el('a', {href: current.url, download: current.filename})
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const takePhoto = (ui) => {
  XR8.CanvasScreenshot.takeScreenshot()
    .then((base64) => fetch(`data:image/jpeg;base64,${base64}`))
    .then(res => res.blob())
    .then(blob => showPreview(ui, blob, 'photo'))
    .catch(err => console.error('[capture] Error al tomar la foto', err))
}

const startVideo = async (ui, isHeld) => {
  // Si el usuario niega el micrófono, el video se graba sin audio.
  await XR8.MediaRecorder.requestMicrophone().catch(() => {})
  XR8.MediaRecorder.recordVideo({
    onStart: () => {
      ui.button.classList.add('recording')
      // Si soltó el botón mientras se pedía el micrófono, cortar enseguida.
      if (!isHeld()) XR8.MediaRecorder.stopRecording()
    },
    onStop: () => {
      ui.button.classList.remove('recording')
      ui.progress.textContent = 'Procesando…'
      ui.progress.style.display = 'block'
    },
    onFinalizeProgress: ({progress, total}) => {
      ui.progress.textContent = `Procesando ${Math.round((progress / total) * 100)}%`
    },
    onVideoReady: ({videoBlob}) => {
      ui.progress.style.display = 'none'
      showPreview(ui, videoBlob, 'video')
    },
    onError: (err) => {
      ui.button.classList.remove('recording')
      ui.progress.style.display = 'none'
      console.error('[capture] Error al grabar video', err)
    },
  })
}

const setup = () => {
  XR8.CanvasScreenshot.configure({maxDimension: 1920, jpgCompression: 90})
  XR8.MediaRecorder.configure({
    maxDurationMs: MAX_VIDEO_MS,
    enableEndCard: false,
    requestMic: XR8.MediaRecorder.RequestMicOptions.MANUAL,
  })
  XR8.addCameraPipelineModule(XR8.CanvasScreenshot.pipelineModule())
  XR8.addCameraPipelineModule(XR8.MediaRecorder.pipelineModule())

  const ui = buildUi()
  let holdTimer = null
  let recording = false

  ui.button.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    holdTimer = setTimeout(() => {
      holdTimer = null
      recording = true
      startVideo(ui, () => recording)
    }, HOLD_MS)
  })

  const release = () => {
    if (holdTimer) {
      clearTimeout(holdTimer)
      holdTimer = null
      takePhoto(ui)
    } else if (recording) {
      recording = false
      XR8.MediaRecorder.stopRecording()
    }
  }
  ui.button.addEventListener('pointerup', release)
  ui.button.addEventListener('pointercancel', release)
  ui.button.addEventListener('contextmenu', e => e.preventDefault())

  ui.save.addEventListener('click', saveOrShare)
  ui.close.addEventListener('click', () => closePreview(ui))
}

window.XR8 ? setup() : window.addEventListener('xrloaded', setup)
