import { DOCUMENT_CONTENT_TYPES } from '@vtp/shared-types';
import * as DocumentPicker from 'expo-document-picker';

/** Lets the user choose a photo or PDF. Returns null if they cancel. */
export async function pickDocument(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...DOCUMENT_CONTENT_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  return result.canceled ? null : (result.assets[0] ?? null);
}

/**
 * Multipart body for `PUT /me/application/documents/:kind`. The API checks the real type
 * from the file's content, so the declared MIME type is only a hint.
 */
export function documentForm(
  asset: DocumentPicker.DocumentPickerAsset,
  expiresOn: string | undefined,
): FormData {
  const form = new FormData();
  if (asset.file) {
    // Browser preview: the picker returns a real File.
    form.append('file', asset.file, asset.name);
  } else {
    // React Native's FormData uploads a local file from { uri, name, type }.
    const file = {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? 'application/octet-stream',
    };
    form.append('file', file as unknown as Blob);
  }
  if (expiresOn) form.append('expiresOn', expiresOn);
  return form;
}
