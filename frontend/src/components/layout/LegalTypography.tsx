import type { ReactNode } from 'react'

interface TypographyProps {
  readonly children: ReactNode
}

export function SectionHeading({ children }: TypographyProps) {
  return <h2 className="text-xl font-semibold mt-10 mb-4">{children}</h2>
}

export function SubHeading({ children }: TypographyProps) {
  return <h3 className="text-base font-medium mt-6 mb-2">{children}</h3>
}
