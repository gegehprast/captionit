import type { ImageFile } from "../lib/captioningApi"

interface ImageThumbnailProps {
  image: ImageFile
  src: string
  isActive: boolean
  isSelected: boolean
  isDetail: boolean
  onClick: (e: React.MouseEvent) => void
}

export function ImageThumbnail({
  image,
  src,
  isActive,
  isSelected,
  isDetail,
  onClick,
}: ImageThumbnailProps) {
  return (
    <div className="relative group flex flex-col">
      <button
        type="button"
        onClick={onClick}
        className={`w-full relative rounded-t-lg overflow-hidden border-2 border-b-0 transition-all focus:outline-none select-none ${
          isDetail || isActive || isSelected
            ? "border-violet-500"
            : "border-gray-700 hover:border-gray-500"
        }`}
      >
        {/* Active pulse ring */}
        {isActive && (
          <span className="absolute inset-0 z-10 rounded-t-lg ring-2 ring-violet-500 animate-pulse pointer-events-none" />
        )}

        {/* Thumbnail */}
        <div className="aspect-square bg-gray-800">
          <img
            src={src}
            alt={image.file}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        {/* Selection overlay tint */}
        {isSelected && (
          <div className="absolute inset-0 bg-violet-500/25 pointer-events-none" />
        )}

        {/* Caption status badge */}
        <div className="absolute top-1.5 right-1.5 z-10">
          {isActive ? (
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-400" />
            </span>
          ) : image.hasCaption ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/90 text-white text-[9px] font-bold">
              ✓
            </span>
          ) : null}
        </div>
      </button>

      {/* Filename + caption preview below thumbnail */}
      <div
        className={`rounded-b-lg border-2 border-t-0 px-1.5 py-1 bg-gray-800 min-h-10 ${
          isDetail || isActive || isSelected
            ? "border-violet-500"
            : "border-gray-700 group-hover:border-gray-500"
        }`}
      >
        <p className="text-[10px] text-gray-400 truncate font-mono leading-tight">
          {image.file} ({image.sizeMB} MB)
        </p>
        {image.caption ? (
          <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
            {image.caption}
          </p>
        ) : (
          <p className="text-[10px] text-gray-700 mt-0.5 italic leading-tight">
            no caption
          </p>
        )}
      </div>
    </div>
  )
}
