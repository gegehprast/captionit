import { useRef, useState } from "react"
import type { ImageFile } from "../lib/captioningApi"
import { getImageUrl } from "../lib/captioningApi"
import { CaptionDetail } from "./CaptionDetail"
import { ImageThumbnail } from "./ImageThumbnail"

interface ImageStatusListProps {
  dirPath: string
  images: ImageFile[]
  activeFile?: string
  liveCaption?: string
  checkedFiles: Set<string>
  onCheckedChange: (files: Set<string>) => void
  onCaptionSaved?: (file: string, caption: string) => void
}

export function ImageStatusList({
  dirPath,
  images,
  activeFile,
  liveCaption,
  checkedFiles,
  onCheckedChange,
  onCaptionSaved,
}: ImageStatusListProps) {
  const [detailFile, setDetailFile] = useState<string>(images[0]?.file)
  const lastClickedRef = useRef<string | null>(null)

  if (images.length === 0) return null

  const detailImage = images.find((i) => i.file === detailFile) ?? null

  const handleClick = (file: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedRef.current) {
      const anchorIdx = images.findIndex(
        (i) => i.file === lastClickedRef.current,
      )
      const targetIdx = images.findIndex((i) => i.file === file)
      const [start, end] =
        anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
      const next = new Set(checkedFiles)
      for (let i = start; i <= end; i++) {
        next.add(images[i].file)
      }
      onCheckedChange(next)
      setDetailFile(file)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(checkedFiles)
      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }
      onCheckedChange(next)
      lastClickedRef.current = file
      setDetailFile(file)
    } else {
      if (checkedFiles.has(file) && checkedFiles.size > 1) {
        // Click on a selected image in a multi-selection → remove just that one
        const next = new Set(checkedFiles)
        next.delete(file)
        onCheckedChange(next)
      } else if (checkedFiles.size === 1 && checkedFiles.has(file)) {
        // Click on the only selected image → deselect all
        onCheckedChange(new Set())
      } else {
        // Click on unselected image → select only that one
        onCheckedChange(new Set([file]))
      }
      lastClickedRef.current = file
      setDetailFile(file)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">
            {images.length} image(s)
          </span>
          {checkedFiles.size > 0 && (
            <span className="text-xs text-pink-400">
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

      <div className="flex items-start">
        {/* Grid */}
        <div className="flex-1 p-4 h-[calc(100vh-14rem)] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {images.map((image) => (
              <ImageThumbnail
                key={image.file}
                image={image}
                src={getImageUrl(dirPath, image.file)}
                isActive={image.file === activeFile}
                isSelected={checkedFiles.has(image.file)}
                isDetail={image.file === detailFile}
                onClick={(e) => handleClick(image.file, e)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {detailFile && detailImage && (
          <CaptionDetail
            key={detailFile}
            dirPath={dirPath}
            image={detailImage}
            isStreaming={detailFile === activeFile}
            liveCaption={detailFile === activeFile ? liveCaption : undefined}
            onCaptionSaved={onCaptionSaved}
          />
        )}
      </div>
    </div>
  )
}
