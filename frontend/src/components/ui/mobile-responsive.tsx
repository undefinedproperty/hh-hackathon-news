import * as React from "react"
import { cn } from "@/lib/utils"

interface MobileResponsiveProps {
  children: React.ReactNode
  className?: string
}

// Container with responsive padding and safe areas
export function MobileContainer({ children, className }: MobileResponsiveProps) {
  return (
    <div className={cn(
      "container mx-auto px-3 sm:px-4 lg:px-6",
      "pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right",
      className
    )}>
      {children}
    </div>
  )
}

// Mobile-first responsive grid
interface ResponsiveGridProps extends MobileResponsiveProps {
  cols?: {
    default?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  gap?: number
}

export function ResponsiveGrid({
  children,
  className,
  cols = { default: 1, sm: 2, lg: 3 },
  gap = 4
}: ResponsiveGridProps) {
  const gridCols = [
    cols.default && `grid-cols-${cols.default}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
  ].filter(Boolean).join(' ')

  return (
    <div className={cn(
      `grid gap-${gap}`,
      gridCols,
      className
    )}>
      {children}
    </div>
  )
}

// Touch-friendly button wrapper
interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export function TouchButton({
  children,
  className,
  variant = 'default',
  size = 'md',
  ...props
}: TouchButtonProps) {
  const sizeClasses = {
    sm: 'px-2 py-1.5 text-xs sm:text-sm h-auto min-h-[36px]',
    md: 'px-3 py-2 text-sm h-auto min-h-[40px] sm:min-h-[44px]',
    lg: 'px-4 py-3 text-base h-auto min-h-[44px] sm:min-h-[48px]'
  }

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'touch-manipulation focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// Mobile-optimized input with proper touch targets
interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const MobileInput = React.forwardRef<HTMLInputElement, MobileInputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-background text-sm",
          "h-10 sm:h-11 px-3 py-2 touch-manipulation",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed",
          "disabled:opacity-50",
          error && "border-destructive focus-visible:ring-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
MobileInput.displayName = "MobileInput"

// Mobile-optimized card with proper spacing
export function MobileCard({ children, className }: MobileResponsiveProps) {
  return (
    <div className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      "touch-manipulation hover:shadow-md transition-shadow",
      className
    )}>
      {children}
    </div>
  )
}

export function MobileCardHeader({ children, className }: MobileResponsiveProps) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-4 sm:p-6", className)}>
      {children}
    </div>
  )
}

export function MobileCardContent({ children, className }: MobileResponsiveProps) {
  return (
    <div className={cn("p-4 sm:p-6 pt-0", className)}>
      {children}
    </div>
  )
}

// Safe area utilities for notched devices
export function SafeAreaTop({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe-top">
      {children}
    </div>
  )
}

export function SafeAreaBottom({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-safe-bottom">
      {children}
    </div>
  )
}

// Mobile-specific scroll behavior
export function MobileScrollArea({ children, className }: MobileResponsiveProps) {
  return (
    <div className={cn(
      "overflow-auto scrollbar-hide touch-pan-y",
      "overscroll-behavior-y-contain",
      className
    )}>
      {children}
    </div>
  )
}

// Mobile navigation helpers
export function MobileNavButton({
  active,
  children,
  ...props
}: TouchButtonProps & { active?: boolean }) {
  return (
    <TouchButton
      variant={active ? "default" : "ghost"}
      className={cn(
        "w-full justify-start gap-2 touch-manipulation",
        active && "bg-accent text-accent-foreground"
      )}
      {...props}
    >
      {children}
    </TouchButton>
  )
}

// Responsive spacing utilities
export const spacing = {
  xs: "p-2 sm:p-3",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
  xl: "p-8 sm:p-12"
} as const

export const margins = {
  xs: "m-2 sm:m-3",
  sm: "m-3 sm:m-4",
  md: "m-4 sm:m-6",
  lg: "m-6 sm:m-8",
  xl: "m-8 sm:m-12"
} as const