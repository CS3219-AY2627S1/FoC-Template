// Supply browser storage explicitly: Node 26 also defines a storage global.
const values = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value))
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    key: (index: number) => [...values.keys()][index] ?? null,
  },
})
