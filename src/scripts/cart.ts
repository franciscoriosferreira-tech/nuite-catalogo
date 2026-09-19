export type CartItem = {
  id: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  stock: number;
  quantity: number;
};

const CART_KEY = "nuite-cart-v1";

export function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("nuite:cart-updated", { detail: items }));
}

export function addToCart(item: Omit<CartItem, "quantity">) {
  const cart = readCart();
  const existing = cart.find((entry) => entry.id === item.id);
  if (existing) existing.quantity = Math.min(existing.stock, existing.quantity + 1);
  else cart.push({ ...item, quantity: 1 });
  writeCart(cart);
  window.dispatchEvent(new CustomEvent("nuite:cart-open"));
}

export function updateQuantity(id: string, quantity: number) {
  const cart = readCart();
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.quantity = Math.max(0, Math.min(item.stock, quantity));
  writeCart(cart.filter((entry) => entry.quantity > 0));
}

export function clearCart() {
  writeCart([]);
}

export const cartTotal = (items: CartItem[]) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

