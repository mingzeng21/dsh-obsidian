declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes } from 'react'

  export const Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' }>
  export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>
  export const Switch: ComponentType<{
    checked: boolean
    label: string
    disabled?: boolean
    onChange(checked: boolean): void
  }>
}
