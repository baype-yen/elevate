export type OcrCandidate = {
  source: "original" | "enhanced"
  text: string
  confidence: number
}

export type OcrChoice = OcrCandidate & {
  score: number
}

type CanvasBundle = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 1) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible de convertir l'image pretraitee."))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function createCanvas(width: number, height: number): CanvasBundle {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    throw new Error("Le navigateur ne prend pas en charge le rendu canvas.")
  }

  return { canvas, ctx }
}

export async function preprocessExamPhoto(file: File) {
  const bitmap = await createImageBitmap(file)

  try {
    const maxSide = 2400
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))

    const { canvas, ctx } = createCanvas(width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    let luminanceSum = 0
    let luminanceSquaredSum = 0
    const totalPixels = data.length / 4

    for (let index = 0; index < data.length; index += 4) {
      const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
      luminanceSum += luminance
      luminanceSquaredSum += luminance * luminance
    }

    const mean = luminanceSum / totalPixels
    const variance = Math.max(0, luminanceSquaredSum / totalPixels - mean * mean)
    const deviation = Math.sqrt(variance)
    const contrast = deviation < 42 ? 1.48 : 1.28
    const threshold = clamp(mean - 8, 92, 182)

    for (let index = 0; index < data.length; index += 4) {
      const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
      const boosted = clamp((luminance - 128) * contrast + 128, 0, 255)
      const value = boosted > threshold ? 252 : clamp(boosted - 28, 0, 120)
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
    return await toBlob(canvas)
  } finally {
    bitmap.close()
  }
}

export function normalizeOcrText(rawText: string) {
  return (rawText || "")
    .replace(/\r/g, "")
    .replace(/([A-Za-z])-[ \t]*\n([A-Za-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .replace(/\n /g, "\n")
    .replace(/\|/g, "I")
    .trim()
}

function scoreCandidate(candidate: OcrCandidate) {
  const text = normalizeOcrText(candidate.text)
  const words = text.split(/\s+/).filter(Boolean).length
  const visible = text.replace(/\s/g, "")
  const totalChars = Math.max(visible.length, 1)
  const alphaChars = (text.match(/[A-Za-z]/g) || []).length
  const alphaRatio = alphaChars / totalChars
  const noiseChars = (text.match(/[^A-Za-z0-9\s.,!?;:'"()/-]/g) || []).length
  const confidence = Number.isFinite(candidate.confidence) ? candidate.confidence : 0

  return confidence * 0.68 + Math.min(words, 220) * 0.23 + alphaRatio * 18 - noiseChars * 0.35
}

export function chooseBestOcrCandidate(candidates: OcrCandidate[]) {
  const valid = candidates.filter((candidate) => normalizeOcrText(candidate.text).length > 0)

  if (!valid.length) {
    return {
      source: "original" as const,
      text: "",
      confidence: 0,
      score: 0,
    }
  }

  return valid
    .map((candidate): OcrChoice => ({
      ...candidate,
      score: scoreCandidate(candidate),
      text: normalizeOcrText(candidate.text),
    }))
    .sort((a, b) => b.score - a.score)[0]
}
