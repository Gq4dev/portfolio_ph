/**
 * Client-side photo cart, one for the whole site.
 *
 * A client often appears in more than one event, so the selection follows
 * them across event pages and goes out as a single order, grouped by event.
 * A photo is identified by event slug + code, so two events reusing a code
 * never collide.
 *
 * State lives in localStorage so a reload or a wander through the site does
 * not throw the selection away. Storage can be missing or throw (private
 * windows, blocked site data), so every access falls back to an in-memory copy
 * and the cart still works for the current visit.
 *
 * Every mutation fires `cart:change` on document, which is how the viewer
 * button, the grid picks and the cart panel stay in sync without knowing
 * about each other.
 */

export interface CartItem {
  /** Event slug, part of the photo's identity. */
  event: string
  /** Event title, used to group the order. */
  eventTitle: string
  code: string
  thumb: string
  alt: string
}

const STORAGE_KEY = 'photo-cart'
let memory: CartItem[] = []

export function getItems(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as CartItem[]
    }
  } catch {
    // fall through to memory
  }
  return memory
}

function save(items: CartItem[]) {
  memory = items
  try {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // memory copy is enough for this visit
  }
  document.dispatchEvent(new CustomEvent('cart:change'))
}

const same = (item: CartItem, event: string, code: string) =>
  item.event === event && item.code === code

export function hasItem(event: string, code: string): boolean {
  return getItems().some((i) => same(i, event, code))
}

export function removeItem(event: string, code: string) {
  save(getItems().filter((i) => !same(i, event, code)))
}

/** Adds the photo, or removes it if it is already in. Returns the new state. */
export function toggleItem(item: CartItem): boolean {
  if (hasItem(item.event, item.code)) {
    removeItem(item.event, item.code)
    return false
  }
  save([...getItems(), item])
  return true
}

/** Price of the first photo, in ARS. */
const BASE_PRICE = 10000
/** Each extra photo costs this much less than the one before it. */
const STEP_DISCOUNT = 0.05
/** Prices round to this many pesos so they read as real prices. */
const PRICE_ROUNDING = 100

/**
 * Price of the photo at this position in the cart (0 is the first). It depends
 * on the position alone and is never stored, so removing a photo reprices the
 * ones after it.
 */
export function priceAt(position: number): number {
  const price = BASE_PRICE * (1 - STEP_DISCOUNT) ** position
  return Math.round(price / PRICE_ROUNDING) * PRICE_ROUNDING
}

/** What the next photo added to the cart would cost. */
export function nextPrice(): number {
  return priceAt(getItems().length)
}

export function totalPrice(items: CartItem[]): number {
  return items.reduce((sum, _, position) => sum + priceAt(position), 0)
}

export function formatPrice(price: number): string {
  return `$${price.toLocaleString('es-AR')}`
}

/** Items grouped by event, in the order each event was first added. */
export function groupByEvent(items: CartItem[]) {
  const groups = new Map<string, { title: string; items: CartItem[] }>()
  for (const item of items) {
    const group = groups.get(item.event)
    if (group) group.items.push(item)
    else groups.set(item.event, { title: item.eventTitle, items: [item] })
  }
  return [...groups.values()]
}
