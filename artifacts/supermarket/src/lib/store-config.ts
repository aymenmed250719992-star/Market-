export const STORE_WHATSAPP = "+213555000000";

export function buildWhatsAppUrl(message: string, phone: string = STORE_WHATSAPP): string {
  const normalized = phone.replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
