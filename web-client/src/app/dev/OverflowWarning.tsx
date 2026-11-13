import { useEffect } from 'react'

const MARK = ['outline-2', 'outline-danger']

// Development aid for N5.1. When the page becomes wider than the screen, the outermost
// elements that stick out are outlined in red and logged, so the cause is found at once.
export function OverflowWarning() {
  useEffect(() => {
    let marked: Element[] = []
    let lastReport = ''

    function check() {
      const viewport = document.documentElement.clientWidth
      const tooWide = document.documentElement.scrollWidth > viewport
      const sticking = tooWide
        ? [...document.body.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > viewport + 1)
        : []
      // Children of a sticking element usually stick out only because their parent does.
      const outermost = sticking.filter((element) => !sticking.includes(element.parentElement as Element))

      for (const element of marked) element.classList.remove(...MARK)
      for (const element of outermost) element.classList.add(...MARK)
      marked = outermost

      const report = outermost.map((element) => element.tagName).join(',')
      if (report && report !== lastReport) {
        console.warn(
          `Horizontal overflow at ${viewport}px (N5.1). The outlined elements stick out to the right. ` +
            'Usual causes: text that cannot wrap, a flex child without min-w-0, a grid without grid-cols-1, a fixed width.',
          outermost,
        )
      }
      lastReport = report
    }

    const timer = window.setInterval(check, 1000)
    window.addEventListener('resize', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', check)
      for (const element of marked) element.classList.remove(...MARK)
    }
  }, [])

  return null
}