import type { AerisApi } from './index'

declare global {
  interface Window {
    /** Typed bridge to the 4-layer backend, exposed by the preload script. */
    aeris: AerisApi
  }
}

export {}
