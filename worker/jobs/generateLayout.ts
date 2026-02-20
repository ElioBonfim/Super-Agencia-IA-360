import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Stage 1: Generate Layout JSON using LLM
 * Reads carousel data + client brand kit, calls the LLM to produce a layout spec
 */
export async function generateLayout(carouselId: string, supabase: SupabaseClient) {
    // Get carousel with slides and client info
    const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*), project:projects(*, client:clients(*))')
        .eq('id', carouselId)
        .single();

    if (!carousel) throw new Error(`Carousel ${carouselId} not found`);

    const client = carousel.project?.client;
    const slides = carousel.slides?.sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    // Get prompt template
    const { data: template } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('prompt_id', 'LAYOUT_JSON_V1')
        .eq('is_active', true)
        .single();

    if (!template) throw new Error('LAYOUT_JSON_V1 prompt template not found');

    // Build prompt
    const slidesData = JSON.stringify(
        slides.map((s: Record<string, unknown>) => ({
            position: s.position,
            headline: s.headline,
            subheadline: s.subheadline,
            bullets: s.bullets,
            cta_text: s.cta_text,
        }))
    );

    let prompt = template.template;
    prompt = prompt.replace('{{ carousel_title }}', carousel.title);
    prompt = prompt.replace('{{ slides_data }}', slidesData);
    prompt = prompt.replace('{{ brand_fonts_heading }}', client?.brand_fonts?.heading || 'Inter');
    prompt = prompt.replace('{{ brand_fonts_body }}', client?.brand_fonts?.body || 'Inter');
    prompt = prompt.replace('{{ brand_colors_primary }}', client?.brand_colors?.primary || '#1a1a2e');
    prompt = prompt.replace('{{ brand_colors_secondary }}', client?.brand_colors?.secondary || '#16213e');
    prompt = prompt.replace('{{ brand_colors_accent }}', client?.brand_colors?.accent || '#e94560');
    prompt = prompt.replace('{{ style_preset }}', carousel.style_preset || 'modern_clean');

    // Call LLM
    const layoutJson = await callLLM(prompt);

    // Save layout to carousel
    await supabase.from('carousels').update({ layout_json: layoutJson }).eq('id', carouselId);

    // Log job
    await supabase.from('jobs').insert({
        carousel_id: carouselId,
        type: 'generate_layout',
        status: 'completed',
        result: { layout_generated: true },
    });

    return layoutJson;
}

async function callLLM(prompt: string): Promise<Record<string, unknown>> {
    const provider = process.env.LLM_PROVIDER || 'openai';

    if (provider === 'openai' || provider === 'nano-banana' || provider === 'gemini') {
        const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
        const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
        const model = process.env.LLM_MODEL || 'gpt-4o';

        console.log(`[generateLayout] Calling LLM: ${baseUrl} model=${model}`);

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: 'You are a layout engine. Return ONLY valid JSON, no markdown.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const errMsg = data?.error?.message || JSON.stringify(data);
            console.error(`[generateLayout] API error (${response.status}):`, errMsg);
            throw new Error(`LLM API error ${response.status}: ${errMsg}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error('[generateLayout] Empty LLM response. Full API response:', JSON.stringify(data));
            throw new Error('Empty LLM response');
        }

        return JSON.parse(content);
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
}
