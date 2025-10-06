import { useState, useEffect } from 'react'

interface BreakpointState {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  screenWidth: number
  screenHeight: number
  orientation: 'portrait' | 'landscape'
}

const breakpoints = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280
}

export function useResponsive(): BreakpointState {
  const [state, setState] = useState<BreakpointState>({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    screenWidth: 0,
    screenHeight: 0,
    orientation: 'portrait'
  })

  useEffect(() => {
    const updateState = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      setState({
        isMobile: width < breakpoints.mobile,
        isTablet: width >= breakpoints.mobile && width < breakpoints.desktop,
        isDesktop: width >= breakpoints.desktop,
        screenWidth: width,
        screenHeight: height,
        orientation: height > width ? 'portrait' : 'landscape'
      })
    }

    // Initial state
    updateState()

    // Listen for resize events
    window.addEventListener('resize', updateState)
    window.addEventListener('orientationchange', updateState)

    return () => {
      window.removeEventListener('resize', updateState)
      window.removeEventListener('orientationchange', updateState)
    }
  }, [])

  return state
}

export function useIsMobile(): boolean {
  const { isMobile } = useResponsive()
  return isMobile
}

export function useIsTablet(): boolean {
  const { isTablet } = useResponsive()
  return isTablet
}

export function useIsDesktop(): boolean {
  const { isDesktop } = useResponsive()
  return isDesktop
}

// Hook for detecting touch device
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    const detectTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }

    detectTouch()

    // Also listen for the first touch event
    const handleTouch = () => {
      setIsTouch(true)
      document.removeEventListener('touchstart', handleTouch)
    }

    document.addEventListener('touchstart', handleTouch, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouch)
    }
  }, [])

  return isTouch
}

// Hook for safe area insets (for devices with notches)
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  })

  useEffect(() => {
    const updateInsets = () => {
      const computedStyle = getComputedStyle(document.documentElement)

      setInsets({
        top: parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0'),
        right: parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0'),
        bottom: parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0'),
        left: parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0')
      })
    }

    updateInsets()
    window.addEventListener('resize', updateInsets)
    window.addEventListener('orientationchange', updateInsets)

    return () => {
      window.removeEventListener('resize', updateInsets)
      window.removeEventListener('orientationchange', updateInsets)
    }
  }, [])

  return insets
}