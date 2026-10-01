import sharp from "sharp"

export type ManualImage = { bytes: Buffer; contentType: "image/png" | "image/jpeg"; width: number; height: number; dataUri: string }

/** Converts already-authorized storage bytes once, before either renderer sees them. */
export async function normalizeManualImage(input: Uint8Array, contentType: string): Promise<ManualImage> {
  if (input.byteLength > 8 * 1024 * 1024) throw new Error("Envie uma imagem do Design do Manual de até 8 MB.")
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType.toLowerCase().split(";")[0].trim())) throw new Error("O Design do Manual aceita imagens PNG, JPG ou WebP.")
  const source = sharp(Buffer.from(input), { limitInputPixels: 32_000_000, failOn: "error", animated: false })
  const metadata = await source.metadata()
  if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("A imagem do Design do Manual é inválida.")
  const jpeg = metadata.format === "jpeg"
  const converted = await (jpeg ? source.rotate().jpeg({ quality: 95 }) : source.rotate().png({ compressionLevel: 9 })).toBuffer({ resolveWithObject: true })
  const mime = jpeg ? "image/jpeg" : "image/png"
  return { bytes: converted.data, contentType: mime, width: converted.info.width, height: converted.info.height, dataUri: `data:${mime};base64,${converted.data.toString("base64")}` }
}
