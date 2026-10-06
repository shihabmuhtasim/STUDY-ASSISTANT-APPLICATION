export function visualImages(input: { pageImage?: string; attachmentImages?: string[] }): string[] {
  if (input.attachmentImages !== undefined && (!Array.isArray(input.attachmentImages) || input.attachmentImages.length > 6)) throw new Error('Attach up to six images or PDF pages per message.');
  const images = [...(input.pageImage ? [input.pageImage] : []), ...(input.attachmentImages || [])];
  if (images.some(image => typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 4_000_000) || images.reduce((sum, image) => sum + image.length, 0) > 12_000_000) throw new Error('Images are invalid or too large. Choose smaller images.');
  return images;
}
