'use client';

import { supabase } from '@/lib/supabase';

const BUCKET = 'damage-photos';

export function useStorage() {
  const uploadPhoto = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, { contentType: file.type });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  };

  const uploadMultiple = async (files: File[], folder: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadPhoto(file, folder);
      if (url) urls.push(url);
    }
    return urls;
  };

  return { uploadPhoto, uploadMultiple };
}
