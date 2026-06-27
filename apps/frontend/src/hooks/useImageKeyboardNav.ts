import { useCallback, useEffect, useRef, useState } from "react"
import type { ImageFile } from "../lib/captioningApi"

interface Options {
  images: ImageFile[]
  onCheckedChange: (files: Set<string>) => void
  onDetailChange: (file: string) => void
  /** Ref to the grid container — used to compute column count and scroll items into view. */
  gridRef: React.RefObject<HTMLDivElement | null>
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = (el as HTMLElement).tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  )
}

export function useImageKeyboardNav({
  images,
  onCheckedChange,
  onDetailChange,
  gridRef,
}: Options) {
  const [focusedIdx, setFocusedIdx] = useState(0)
  const shiftAnchorRef = useRef<number>(0)

  // Keep refs for stable access inside the document listener
  const focusedIdxRef = useRef(focusedIdx)
  const imagesRef = useRef(images)
  useEffect(() => {
    focusedIdxRef.current = focusedIdx
  }, [focusedIdx])
  useEffect(() => {
    imagesRef.current = images
  }, [images])

  // Keep focusedIdx in bounds when the image list changes
  useEffect(() => {
    setFocusedIdx((prev) => Math.min(prev, Math.max(0, images.length - 1)))
  }, [images.length])

  // Scroll the focused thumbnail into view after each navigation
  useEffect(() => {
    if (!gridRef.current) return
    const el = gridRef.current.children[focusedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [focusedIdx, gridRef])

  const getColCount = useCallback(() => {
    if (!gridRef.current) return 5
    return getComputedStyle(gridRef.current).gridTemplateColumns.split(" ")
      .length
  }, [gridRef])

  const moveTo = useCallback(
    (nextIdx: number, isShift: boolean) => {
      const imgs = imagesRef.current
      const idx = Math.max(0, Math.min(imgs.length - 1, nextIdx))
      const file = imgs[idx]?.file
      if (!file) return

      setFocusedIdx(idx)
      focusedIdxRef.current = idx
      onDetailChange(file)

      if (isShift) {
        const anchor = shiftAnchorRef.current
        const [lo, hi] = anchor <= idx ? [anchor, idx] : [idx, anchor]
        const next = new Set<string>()
        for (let i = lo; i <= hi; i++) next.add(imgs[i].file)
        onCheckedChange(next)
      } else {
        shiftAnchorRef.current = idx
        onCheckedChange(new Set([file]))
      }
    },
    [onCheckedChange, onDetailChange],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(document.activeElement)) return
      if (imagesRef.current.length === 0) return

      const cols = getColCount()
      const cur = focusedIdxRef.current
      let next = cur

      switch (e.key) {
        case "ArrowLeft":
        case "h":
          next = cur - 1
          break
        case "ArrowRight":
        case "l":
          next = cur + 1
          break
        case "ArrowUp":
        case "k":
          next = cur - cols
          break
        case "ArrowDown":
        case "j":
          next = cur + cols
          break
        default:
          return
      }

      e.preventDefault()
      moveTo(next, e.shiftKey)
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [getColCount, moveTo])

  /** Call this from click handlers so keyboard state stays in sync. */
  const syncFocus = useCallback((file: string) => {
    const idx = imagesRef.current.findIndex((i) => i.file === file)
    if (idx !== -1) {
      setFocusedIdx(idx)
      focusedIdxRef.current = idx
      shiftAnchorRef.current = idx
    }
  }, [])

  return { focusedIdx, syncFocus }
}
