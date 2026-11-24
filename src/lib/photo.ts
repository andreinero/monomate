import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

/**
 * Profile photo: picked from the library or taken with the camera, cropped square, and copied into
 * the app's own documents folder. Only the file *name* is stored, because the folder's absolute
 * path changes between app updates on iOS.
 */
export const photoUri = (name: string) => new File(Paths.document, name).uri;

export async function pickPhoto(source: 'library' | 'camera'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. You can allow it for MonoMate in Settings.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const name = `profile-photo-${Date.now()}.jpg`;
  await new File(res.assets[0].uri).copy(new File(Paths.document, name));
  return name;
}

export function deletePhoto(name?: string) {
  if (!name) return;
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}
