const APP_DEBUG = false

export function appLog(...args: unknown[]) {
  if (APP_DEBUG) {
    console.log(...args)
  }
}

export function appWarn(...args: unknown[]) {
  if (APP_DEBUG) {
    console.warn(...args)
  }
}

export function appError(...args: unknown[]) {
  console.error(...args)
}