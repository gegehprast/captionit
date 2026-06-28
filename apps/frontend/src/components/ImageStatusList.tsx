import { useCallback, useEffect, useRef, useState } from "react"
import { useImageKeyboardNav } from "../hooks/useImageKeyboardNav"
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
  lockedFiles: Set<string>
  onToggleLocked: (file: string) => void
  onLockSelected: (files: Set<string>) => void
  onUnlockSelected: (files: Set<string>) => void
  blurThumbnails: boolean
  hoverToPeek: boolean
  onCaptionSaved?: (file: string, caption: string) => void
}

export function ImageStatusList({
  dirPath,
  images,
  activeFile,
  liveCaption,
  checkedFiles,
  onCheckedChange,
  lockedFiles,
  onToggleLocked,
  onLockSelected,
  onUnlockSelected,
  blurThumbnails,
  hoverToPeek,
  onCaptionSaved,
}: ImageStatusListProps) {
  const [detailFile, setDetailFile] = useState<string>(images[0]?.file)
  const [following, setFollowing] = useState(true)
  const gridRef = useRef<HTMLDivElement>(null)

  if (images.length === 0) return null

  const detailImage = images.find((i) => i.file === detailFile) ?? null

  const handleDetailChange = useCallback((file: string) => {
    setDetailFile(file)
    setFollowing(false)
  }, [])

  const { focusedIdx, syncFocus } = useImageKeyboardNav({
    images,
    onCheckedChange,
    onDetailChange: handleDetailChange,
    gridRef,
  })

  useEffect(() => {
    if (!activeFile || !following) return
    const activeImage = images.find((i) => i.file === activeFile)
    if (!activeImage) return
    setDetailFile(activeImage.file)
  }, [activeFile, following, images])

  // Re-enable following when captioning finishes
  useEffect(() => {
    if (!activeFile) setFollowing(true)
  }, [activeFile])

  const handleClick = (file: string, e: React.MouseEvent) => {
    syncFocus(file)
    if (e.shiftKey) {
      const anchorIdx = images.findIndex(
        (i) => i.file === images[focusedIdx]?.file,
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
      setDetailFile(file)
    } else {
      if (checkedFiles.has(file) && checkedFiles.size > 1) {
        const next = new Set(checkedFiles)
        next.delete(file)
        onCheckedChange(next)
      } else if (checkedFiles.size === 1 && checkedFiles.has(file)) {
        onCheckedChange(new Set())
      } else {
        onCheckedChange(new Set([file]))
      }
      setDetailFile(file)
      setFollowing(false)
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
            <>
              <span className="text-xs text-pink-400">
                {checkedFiles.size} selected
              </span>
              <button
                type="button"
                onClick={() => onCheckedChange(new Set())}
                className="text-xs px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => onLockSelected(checkedFiles)}
                className="text-xs px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-gray-400 hover:text-yellow-400 hover:border-yellow-600 transition-colors"
              >
                Lock
              </button>
              <button
                type="button"
                onClick={() => onUnlockSelected(checkedFiles)}
                className="text-xs px-2 py-0.5 bg-gray-800/80 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
              >
                Unlock
              </button>
            </>
          )}
          {activeFile && (
            <button
              type="button"
              onClick={() => setFollowing((f) => !f)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                following
                  ? "border-pink-500/50 text-pink-400 hover:border-pink-400"
                  : "border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500"
              }`}
            >
              {following ? "Following" : "Not following"}
            </button>
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
          <div
            ref={gridRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3"
          >
            {images.map((image) => (
              <ImageThumbnail
                key={image.file}
                image={image}
                src={getImageUrl(dirPath, image.file)}
                isActive={image.file === activeFile}
                isSelected={checkedFiles.has(image.file)}
                isDetail={image.file === detailFile}
                isLocked={lockedFiles.has(image.file)}
                onToggleLocked={() => onToggleLocked(image.file)}
                isBlurred={blurThumbnails}
                hoverToPeek={hoverToPeek}
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
            isBlurred={blurThumbnails}
            hoverToPeek={hoverToPeek}
            onCaptionSaved={onCaptionSaved}
          />
        )}
      </div>
    </div>
  )
}
