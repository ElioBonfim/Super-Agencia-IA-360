import { SupabaseClient } from '@supabase/supabase-js';
import { chromium, Browser } from 'playwright';
import { buildSlideHTML } from './renderPreviews';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}

/**
 * Stage 5: Render Hi-Res finals (on demand)
 * Same HTML template but at 2x resolution (2160×2700) → final PNG
 */
export async function renderHires(
    carouselId: string,
    supabase: SupabaseClient,
    slideIds?: string[]
) {
    const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*), project:projects(*, client:clients(*))')
        .eq('id', carouselId)
        .single();

    if (!carousel) throw new Error(`Carousel ${carouselId} not found`);

    const client = carousel.project?.client;
    const layoutJson = carousel.layout_json;
    let slides = carousel.slides?.sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    // Filter to specific slides if requested
    if (slideIds?.length) {
        slides = slides.filter((s: { id: string }) => slideIds.includes(s.id));
    }

    const b = await getBrowser();
    const context = await b.newContext({
        viewport: { width: 1080, height: 1350 },
        deviceScaleFactor: 2, // 2x for hi-res = 2160×2700
    });

    try {
        for (const slide of slides) {
            const slideLayout = layoutJson?.slides?.find(
                (s: { position: number }) => s.position === slide.position
            );

            const html = buildSlideHTML(slide, slideLayout, client);
            const page = await context.newPage();

            await page.setContent(html, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);

            const screenshot = await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 0, width: 1080, height: 1350 },
            });

            await page.close();

            // Upload hi-res
            const storagePath = `${carouselId}/hires_${slide.position}.png`;
            await supabase.storage.from('carousel-gen').upload(storagePath, screenshot, {
                contentType: 'image/png',
                upsert: true,
            });

            const { data: urlData } = supabase.storage.from('carousel-gen').getPublicUrl(storagePath);

            await supabase
                .from('slides')
                .update({ hires_url: urlData.publicUrl })
                .eq('id', slide.id);
        }
    } finally {
        await context.close();
    }

    // Log job
    await supabase.from('jobs').insert({
        carousel_id: carouselId,
        type: 'render_hires',
        status: 'completed',
        result: { hires_rendered: slides.length },
    });
}
