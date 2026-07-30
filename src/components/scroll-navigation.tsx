import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

const EDGE_OFFSET = 80
const MIN_SCROLL_DISTANCE = 240

export function ScrollNavigation() {
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  useEffect(() => {
    const updateScrollState = () => {
      const scrollTop = window.scrollY
      const viewportHeight = window.innerHeight
      const pageHeight = document.documentElement.scrollHeight
      const remainingScroll = pageHeight - viewportHeight - scrollTop
      const isLongPage = pageHeight - viewportHeight > MIN_SCROLL_DISTANCE

      setCanScrollUp(isLongPage && scrollTop > EDGE_OFFSET)
      setCanScrollDown(isLongPage && remainingScroll > EDGE_OFFSET)
    }

    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(document.documentElement)

    return () => {
      window.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      resizeObserver.disconnect()
    }
  }, [])

  if (!canScrollUp && !canScrollDown) {
    return null
  }

  const scrollTo = (top: number) => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    window.scrollTo({
      top,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <nav
      aria-label="Page scroll controls"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-30 flex flex-col gap-2 sm:left-4"
    >
      {canScrollUp && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => scrollTo(0)}
          className="bg-white/95 shadow-md backdrop-blur"
          aria-label="Back to top"
          title="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
          <span className="hidden sm:inline">Back to top</span>
        </Button>
      )}

      {canScrollDown && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => scrollTo(document.documentElement.scrollHeight)}
          className="bg-white/95 shadow-md backdrop-blur"
          aria-label="Go to bottom"
          title="Go to bottom"
        >
          <ArrowDown className="h-4 w-4" />
          <span className="hidden sm:inline">Go to bottom</span>
        </Button>
      )}
    </nav>
  )
}
