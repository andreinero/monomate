import * as ImagePicker from 'expo-image-picker';

/**
 * Desktop: the photo is picked from a file, cropped square and shrunk to 256 px, and kept as a
 * small data URI in the profile itself (there's no app documents folder in a browser).
 */
export const photoUri = (name: string) => name;

function squareThumb(src: string, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

export async function pickPhoto(_source: 'library' | 'camera'): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  return squareThumb(res.assets[0].uri);
}

export function deletePhoto(_name?: string) {
  // Nothing on disk to delete.
}
