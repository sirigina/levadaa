// ========================================================================
// Human-subject gate — runs fully on-device.
//
// The Institute assesses human subjects only. Before scoring, we check the
// submitted photograph for at least one human face. The tiny_face_detector
// model weights are bundled under /public/models and served same-origin, so
// — consistent with the app's core constraint — no photograph, and no
// request derived from it, ever leaves the device.
//
// face-api (which bundles TensorFlow.js) is ~1.3MB, so it is imported
// DYNAMICALLY: it becomes its own chunk that downloads only the first time a
// subject is submitted, keeping the intro and upload screens light.
// ========================================================================

const MODEL_URI = `${import.meta.env.BASE_URL}models`

let faceapiPromise = null
let modelPromise = null

async function getFaceApi() {
  if (!faceapiPromise) faceapiPromise = import('@vladmandic/face-api')
  const faceapi = await faceapiPromise
  if (!modelPromise) {
    modelPromise = faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI)
  }
  await modelPromise
  return faceapi
}

// Decode a data URL into an <img> element we can run detection against.
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}

// Returns true if at least one human face is detected in the image.
//
// This is a GATE, not part of scoring — the score remains a deterministic
// function of the file hash. Detection only decides whether we proceed.
//
// Throws if the model cannot be loaded; the caller decides how to handle an
// unavailable detector (the app fails open rather than block every subject).
export async function containsHuman(img) {
  const faceapi = await getFaceApi()
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  })
  const detections = await faceapi.detectAllFaces(img, options)
  return detections.length > 0
}
