import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Stage 2: Generate Background Images using Image AI
 * Creates 5 backgrounds with clean safe zones for text overlay
 */
export async function generateBackgrounds(carouselId: string, supabase: SupabaseClient) {
    // Get carousel with layout and client data
    const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*), project:projects(*, client:clients(*))')
        .eq('id', carouselId)
        .single();

    if (!carousel) throw new Error(`Carousel ${carouselId} not found`);

    const client = carousel.project?.client;
    const layoutJson = carousel.layout_json;
    const slides = carousel.slides?.sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    // Get BG prompt template
    const { data: template } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('prompt_id', 'CAROUSEL_BG_V1')
        .eq('is_active', true)
        .single();

    if (!template) throw new Error('CAROUSEL_BG_V1 prompt template not found');

    // Generate background for each slide
    for (const slide of slides) {
        const slideLayout = layoutJson?.slides?.find(
            (s: { position: number }) => s.position === slide.position
        );

        let prompt = template.template;
        prompt = prompt.replace('{{ style }}', carousel.style_preset || 'modern clean');
        prompt = prompt.replace('{{ brand_primary }}', client?.brand_colors?.primary || '#1a1a2e');
        prompt = prompt.replace('{{ brand_secondary }}', client?.brand_colors?.secondary || '#16213e');
        prompt = prompt.replace('{{ brand_accent }}', client?.brand_colors?.accent || '#e94560');
        prompt = prompt.replace('{{ mood }}', 'professional and modern');
        prompt = prompt.replace('{{ safe_zone_position }}', slideLayout?.bg_safe_zone_position || 'center');
        prompt = prompt.replace('{{ safe_zone_pct }}', String(slideLayout?.bg_safe_zone_pct || 60));

        // Call Image AI
        const imageUrl = await generateImage(prompt);

        // Download and upload to Supabase Storage
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const storagePath = `${carouselId}/bg_${slide.position}.png`;

        await supabase.storage.from('carousel-gen').upload(storagePath, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
        });

        const { data: urlData } = supabase.storage.from('carousel-gen').getPublicUrl(storagePath);

        // Update slide with bg_url
        await supabase
            .from('slides')
            .update({
                bg_url: urlData.publicUrl,
                bg_prompt: prompt, // Store full prompt for debugging
            })
            .eq('id', slide.id);
    }

    // Log job
    await supabase.from('jobs').insert({
        carousel_id: carouselId,
        type: 'generate_bg',
        status: 'completed',
        result: {
            backgrounds_generated: slides.length,
            model: process.env.IMAGE_AI_MODEL || 'dall-e-3',
            provider: process.env.IMAGE_AI_PROVIDER || 'openai',
        },
    });
}

async function generateImage(prompt: string): Promise<string> {
    const provider = process.env.IMAGE_AI_PROVIDER || 'openai';

    if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.IMAGE_AI_MODEL || 'dall-e-3',
                prompt,
                n: 1,
                size: '1024x1792', // closest to 1080x1350 (4:5)
                quality: 'standard',
            }),
        });

        const data = await response.json();
        const url = data.data?.[0]?.url;
        if (!url) throw new Error('Empty image generation response');
        return url;
    }

    throw new Error(`Unsupported image provider: ${provider}`);
}
