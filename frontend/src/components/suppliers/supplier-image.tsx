import Image from "next/image"

// Seed images are multi-megabyte photos; images from this host go through Next's optimiser
// (see next.config.ts) to stay within the page-weight budget (NFR5.3.1). Other admin-supplied
// URLs are shown as-is so the frontend never proxies arbitrary hosts.
const OPTIMISED_HOSTS = new Set(["raw.githubusercontent.com"])

export function SupplierImage({ src, alt }: { src: string; alt: string }) {
  let optimise = false
  try {
    optimise = OPTIMISED_HOSTS.has(new URL(src).hostname)
  } catch {
    return null
  }
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 768px) 40vw, 100vw"
        className="object-cover"
        unoptimized={!optimise}
      />
    </div>
  )
}
