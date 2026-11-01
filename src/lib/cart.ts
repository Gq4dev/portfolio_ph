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
/** Percent off the whole order, indexed by photo count; the last is the cap. */
const DISCOUNTS = [0, 0, 10, 15, 20, 25]

/**
 * Price of each photo in an order of this size. The discount covers the whole
 * order, so every photo costs the same and adding or removing one reprices
 * them all. It is never stored.
 */
export function unitPrice(count: number): number {
  const discount = DISCOUNTS[Math.min(count, DISCOUNTS.length - 1)]
  return (BASE_PRICE * (100 - discount)) / 100
}

/** What each photo would cost once one more is added to the cart. */
export function nextPrice(): number {
  return unitPrice(getItems().length + 1)
}

export function totalPrice(items: CartItem[]): number {
  return items.length * unitPrice(items.length)
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
