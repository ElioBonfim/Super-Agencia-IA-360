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

        // Call Image AI — returns a buffer directly
        const imageBuffer = await generateImage(prompt);

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

// Returns a Buffer containing the image (PNG)
async function generateImage(prompt: string): Promise<Buffer> {
    const provider = process.env.IMAGE_AI_PROVIDER || 'openai';
    const apiKey = process.env.IMAGE_AI_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    const model = process.env.IMAGE_AI_MODEL || 'dall-e-3';

    // ── Gemini (native Google API) ──────────────────────────────────────────
    if (provider === 'gemini' || provider === 'nano-banana') {
        const baseUrl = process.env.IMAGE_AI_BASE_URL || 'https://generativelanguage.googleapis.com';
        const url = `${baseUrl}/v1beta/models/${model}:generateContent`;

        console.log(`[generateBackgrounds] Gemini image generation: model=${model}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey!,
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['image', 'text'],
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const errMsg = data?.error?.message || JSON.stringify(data);
            console.error(`[generateBackgrounds] Gemini Image API error (${response.status}):`, errMsg);
            throw new Error(`Gemini Image API error ${response.status}: ${errMsg}`);
        }

        // Gemini returns base64 inline data
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);

        if (!imagePart?.inlineData?.data) {
            console.error('[generateBackgrounds] No image in Gemini response:', JSON.stringify(data));
            throw new Error('Gemini returned no image data');
        }

        return Buffer.from(imagePart.inlineData.data, 'base64');
    }

    // ── OpenAI / DALL-E (URL-based) ─────────────────────────────────────────
    if (provider === 'openai') {
        const baseUrl = process.env.IMAGE_AI_BASE_URL || 'https://api.openai.com/v1';
        console.log(`[generateBackgrounds] OpenAI image generation: model=${model}`);

        const response = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                prompt,
                n: 1,
                size: '1024x1792',
                quality: 'standard',
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const errMsg = data?.error?.message || JSON.stringify(data);
            console.error(`[generateBackgrounds] OpenAI Image API error (${response.status}):`, errMsg);
            throw new Error(`OpenAI Image API error ${response.status}: ${errMsg}`);
        }

        const imageUrl = data.data?.[0]?.url;
        if (!imageUrl) {
            console.error('[generateBackgrounds] Empty image response:', JSON.stringify(data));
            throw new Error('Empty image generation response');
        }

        const imageResponse = await fetch(imageUrl);
        return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new Error(`Unsupported image provider: ${provider}`);
}
