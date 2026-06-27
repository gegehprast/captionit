import type { ImageFile } from "../lib/captioningApi"

interface ImageThumbnailProps {
  image: ImageFile
  src: string
  isActive: boolean
  isSelected: boolean
  isDetail: boolean
  isFocused?: boolean
  onClick: (e: React.MouseEvent) => void
}

// main div styles
const isActiveStyle =
  "border-pink-400 shadow-[0_0_0_1px_rgba(236,72,153,0.55),0_0_24px_rgba(236,72,153,0.22)] animate-pulse"
const isDetailStyle =
  "border-pink-400 shadow-[0_0_0_1px_rgba(236,72,153,0.55),0_0_24px_rgba(236,72,153,0.22)]"
const isSelectedStyle =
  "border-pink-400 shadow-[0_0_0_1px_rgba(236,72,153,0.55),0_0_24px_rgba(236,72,153,0.22)]"
const isFocusedStyle = "border-gray-400"
const defaultStyle = "border-gray-700 hover:border-gray-500"

export function ImageThumbnail({
  image,
  src,
  isActive,
  isSelected,
  isDetail,
  isFocused = false,
  onClick,
}: ImageThumbnailProps) {
  return (
    <div
      className={`relative group flex flex-col rounded-lg overflow-hidden border-2 transition-all ${
        isActive
          ? isActiveStyle
          : isDetail
            ? isDetailStyle
            : isSelected
              ? isSelectedStyle
              : isFocused
                ? isFocusedStyle
                : defaultStyle
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full relative transition-all focus:outline-none select-none"
      >
        {/* Thumbnail */}
        <div className="aspect-square bg-gray-800">
          <img
            src={src}
            alt={image.file}
            className="w-full h-full object-cover object-[30%_30%] group-hover:object-[20%_20%] transition-all"
            loading="lazy"
          />
        </div>

        {/* Selection overlay tint */}
        {isSelected && (
          <div className="absolute inset-0 bg-pink-500/20 pointer-events-none" />
        )}

        {/* Caption status badge */}
        <div className="absolute top-1.5 right-1.5 z-10">
          {isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-500 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white shadow-lg shadow-pink-950/40">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              processing
            </span>
          ) : null}
        </div>
      </button>

      {/* Filename + caption preview below thumbnail */}
      <div className="px-1.5 py-1 bg-gray-800 min-h-10 border-t border-gray-700">
        <p className="text-[10px] text-gray-400 truncate font-mono leading-tight">
          {image.file} ({image.sizeMB} MB)
        </p>
        {image.caption ? (
          <div className="h-24 overflow-y-auto">
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
              {image.caption}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-700 mt-0.5 italic leading-tight">
            no caption
          </p>
        )}
      </div>
    </div>
  )
}
