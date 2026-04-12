import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const emergenciaId = formData.get('emergenciaId') as string;
    const files = formData.getAll('fotos') as File[];

    if (!emergenciaId || files.length === 0) {
      return NextResponse.json({ error: 'emergenciaId e fotos obrigatórios' }, { status: 400 });
    }

    const urls: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = `emergencia/${emergenciaId}/${Date.now()}-${file.name}`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('damage-photos')
        .upload(fileName, buffer, { contentType: file.type });

      if (uploadError) {
        console.error('[upload-emergencia]', uploadError.message);
        continue;
      }

      if (uploadData?.path) {
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('damage-photos')
          .getPublicUrl(uploadData.path);

        await supabaseAdmin.from('emergencia_fotos').insert({
          emergencia_id: emergenciaId,
          foto_url: publicUrl,
        });

        urls.push(publicUrl);
      }
    }

    return NextResponse.json({ success: true, urls });
  } catch (err) {
    console.error('[upload-emergencia]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
