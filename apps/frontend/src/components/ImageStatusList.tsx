import { useState } from "react"
import type { ImageFile } from "../lib/captioningApi"
import { getImageUrl } from "../lib/captioningApi"

interface ImageStatusListProps {
  dirPath: string
  images: ImageFile[]
  activeFile?: string
  liveCaption?: string
  /** Controlled selection — set of checked filenames */
  checkedFiles: Set<string>
  onCheckedChange: (files: Set<string>) => void
}

export function ImageStatusList({
  dirPath,
  images,
  activeFile,
  liveCaption,
  checkedFiles,
  onCheckedChange,
}: ImageStatusListProps) {
  const [preview, setPreview] = useState<string | null>(null)

  if (images.length === 0) return null

  const previewImage = preview ? images.find((i) => i.file === preview) : null
  const previewCaption =
    preview === activeFile && liveCaption
      ? liveCaption
      : (previewImage?.caption ?? null)

  const allChecked = images.length > 0 && checkedFiles.size === images.length
  const someChecked = checkedFiles.size > 0 && !allChecked

  const toggleAll = () => {
    if (allChecked) {
      onCheckedChange(new Set())
    } else {
      onCheckedChange(new Set(images.map((i) => i.file)))
    }
  }

  const toggleOne = (file: string) => {
    const next = new Set(checkedFiles)
    if (next.has(file)) {
      next.delete(file)
    } else {
      next.add(file)
    }
    onCheckedChange(next)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Select-all checkbox */}
          <input
            type="checkbox"
            id="select-all"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked
            }}
            onChange={toggleAll}
            className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
          />
          <label
            htmlFor="select-all"
            className="text-sm font-semibold text-white cursor-pointer select-none"
          >
            {images.length} image(s)
          </label>
          {checkedFiles.size > 0 && (
            <span className="text-xs text-violet-400">
              {checkedFiles.size} selected
            </span>
          )}
        </div>

        <div className="flex gap-4 text-xs text-gray-400">
          <span>
            <span className="text-green-400">
              {images.filter((i) => i.hasCaption).length}
            </span>{" "}
            captioned
          </span>
          <span>
            <span className="text-gray-500">
              {images.filter((i) => !i.hasCaption).length}
            </span>{" "}
            pending
          </span>
        </div>
      </div>

      <div className="flex" style={{ minHeight: "24rem" }}>
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {images.map((image) => {
              const isActive = image.file === activeFile
              const isChecked = checkedFiles.has(image.file)
              const isPreviewed = image.file === preview
              const src = getImageUrl(dirPath, image.file)

              return (
                <div key={image.file} className="relative group">
                  {/* Checkbox — top-left */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOne(image.file)}
                    className="absolute top-1.5 left-1.5 z-10 w-4 h-4 rounded accent-violet-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ opacity: isChecked ? 1 : undefined }}
                    aria-label={`Select ${image.file}`}
                  />

                  {/* Card */}
                  <button
                    type="button"
                    onClick={() => setPreview(isPreviewed ? null : image.file)}
                    className={`w-full relative rounded-lg overflow-hidden border-2 transition-all focus:outline-none ${
                      isPreviewed
                        ? "border-violet-500 shadow-lg shadow-violet-900/40"
                        : isActive
                          ? "border-violet-400/60"
                          : isChecked
                            ? "border-violet-700"
                            : "border-gray-700 hover:border-gray-500"
                    }`}
                  >
                    {/* Active pulse ring */}
                    {isActive && (
                      <span className="absolute inset-0 z-10 rounded-lg ring-2 ring-violet-400 animate-pulse pointer-events-none" />
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

                    {/* Filename on hover */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-gray-200 truncate">
                        {image.file}
                      </p>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        {preview && (
          <div className="w-80 border-l border-gray-800 flex flex-col overflow-hidden shrink-0">
            {/* Full-size image */}
            <div
              className="bg-gray-950 flex items-center justify-center"
              style={{ minHeight: "14rem", maxHeight: "22rem" }}
            >
              <img
                src={getImageUrl(dirPath, preview)}
                alt={preview}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Info + caption */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-mono text-gray-300 break-all">
                  {preview}
                </p>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-gray-500">{previewImage?.sizeMB} MB</p>

              {previewCaption ? (
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words pt-1">
                  {previewCaption}
                  {preview === activeFile && (
                    <span className="animate-pulse">▌</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-gray-600 italic">No caption yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
