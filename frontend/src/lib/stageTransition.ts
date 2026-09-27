import { flushSync } from 'react-dom'

// Only the alternate Stage page opts into native shared-artwork transitions.
export function stageTransition(
  update: () => void,
  disabled: boolean,
  source?: HTMLImageElement | null,
  target?: HTMLImageElement | null,
) {
  if (
    disabled ||
    !document.startViewTransition ||
    document.visibilityState === 'hidden'
  ) {
    update()
    return
  }
  document
    .querySelectorAll<HTMLElement>('[data-stage-transition-art]')
    .forEach((element) => {
      element.style.viewTransitionName = ''
      element.removeAttribute('data-stage-transition-art')
    })
  const mark = (image?: HTMLImageElement | null) => {
    if (!image?.isConnected) return
    image.style.viewTransitionName = 'stage-artwork'
    image.setAttribute('data-stage-transition-art', '')
  }
  mark(source)
  document.documentElement.setAttribute('data-stage-transition', '')
  const transition = document.startViewTransition(() => {
    if (source) source.style.viewTransitionName = ''
    flushSync(update)
    mark(target)
  })
  void transition.finished
    .catch(() => {})
    .finally(() => {
      for (const image of [source, target])
        if (image) {
          image.style.viewTransitionName = ''
          image.removeAttribute('data-stage-transition-art')
        }
      document.documentElement.removeAttribute('data-stage-transition')
    })
}
