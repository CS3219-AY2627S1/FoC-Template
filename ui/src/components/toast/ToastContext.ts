import { createContext } from 'react'
import type { ToastContextValue } from './models'

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)
