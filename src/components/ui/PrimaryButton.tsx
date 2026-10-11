import type { ButtonHTMLAttributes } from 'react'

type PrimaryButtonProps = {
  children: ButtonHTMLAttributes<HTMLButtonElement>['children']
  disabled?: boolean
  describedBy?: string
}

export function PrimaryButton({ children, disabled = false, describedBy }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby={describedBy}
      className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:bg-[#34c978] disabled:cursor-not-allowed disabled:bg-[#143024] disabled:text-accent disabled:hover:bg-[#143024] sm:w-auto sm:min-w-40"
    >
      {children}
    </button>
  )
}
