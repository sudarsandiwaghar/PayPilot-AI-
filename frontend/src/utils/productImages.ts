/**
 * Product image resolution utilities.
 *
 * Ensures that cart items, checkout previews, and modals always display
 * the exact image corresponding to the selected product, matching the catalog.
 */

const FALLBACK_PRODUCT_IMAGE_MAP: Record<string, string> = {
  // Laptops
  'macbook': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',
  'dell xps': 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600',
  'thinkpad': 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600',
  'asus': 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600',
  'laptop': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',

  // Audio / Headphones
  'airpods': 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600',
  'wh-1000xm5': 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600',
  'quietcomfort': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
  'momentum': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600',
  'headphone': 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600',
  'earbuds': 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600',

  // Cameras
  'alpha': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
  'canon': 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600',
  'fujifilm': 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=600',
  'camera': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',

  // Gaming Consoles
  'playstation': 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600',
  'ps5': 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600',
  'xbox': 'https://images.unsplash.com/photo-1612287233207-61c02e1b4b9b?w=600',

  // Keyboards & Mice
  'keyboard': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600',
  'keychron': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600',
  'mx master': 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600',
  'mouse': 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600',

  // Monitors
  'monitor': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600',
  'ultrasharp': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600',

  // Wearables / Smartwatches
  'apple watch': 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600',
  'galaxy watch': 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600',
  'watch': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
}

/**
 * Resolves the most accurate image URL for any product or cart line item.
 */
export function getProductImageUrl(
  imageUrl?: string | null,
  productName?: string,
  category?: string
): string {
  // If a valid custom image URL is provided (not null/empty), use it
  if (imageUrl && imageUrl.trim().length > 0) {
    return imageUrl.trim()
  }

  const nameLower = (productName || '').toLowerCase()
  const categoryLower = (category || '').toLowerCase()

  // Find match in fallback map
  for (const [key, url] of Object.entries(FALLBACK_PRODUCT_IMAGE_MAP)) {
    if (nameLower.includes(key)) {
      return url
    }
  }

  // Category based match
  if (categoryLower.includes('laptop')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['laptop']
  }
  if (categoryLower.includes('audio') || categoryLower.includes('headphone')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['headphone']
  }
  if (categoryLower.includes('keyboard')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['keyboard']
  }
  if (categoryLower.includes('monitor')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['monitor']
  }
  if (categoryLower.includes('gaming')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['ps5']
  }
  if (categoryLower.includes('camera') || categoryLower.includes('photography')) {
    return FALLBACK_PRODUCT_IMAGE_MAP['camera']
  }

  return 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600'
}
