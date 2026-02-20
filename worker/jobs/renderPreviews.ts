import { SupabaseClient } from '@supabase/supabase-js';
import { chromium, Browser } from 'playwright';
import { execSync } from 'child_process';

let browser: Browser | null = null;
let systemChromePath: string | undefined = process.env.CHROME_PATH;

if (!systemChromePath || systemChromePath === '/usr/bin/chromium') {
    try {
        systemChromePath = execSync('which chromium').toString().trim();
    } catch (e) {
        try {
            systemChromePath = execSync('which chromium-browser').toString().trim();
        } catch (e2) {
            systemChromePath = undefined;
        }
    }
}

async function getBrowser(): Promise<Browser> {
    if (!browser || !browser.isConnected()) {
        const options: Parameters<typeof chromium.launch>[0] = { headless: true };
        if (systemChromePath) {
            console.log(`[Playwright] Using system Chromium at ${systemChromePath}`);
            options.executablePath = systemChromePath;
        } else {
            console.log(`[Playwright] Using default downloaded Chromium`);
        }
        browser = await chromium.launch(options);
    }
    return browser;
}

/**
 * Stage 3: Render Preview Composites
 * Uses Playwright to render HTML templates (background + text) → PNG → compress to WebP
 */
export async function renderPreviews(carouselId: string, supabase: SupabaseClient) {
    const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*), project:projects(*, client:clients(*))')
        .eq('id', carouselId)
        .single();

    if (!carousel) throw new Error(`Carousel ${carouselId} not found`);

    const client = carousel.project?.client;
    const layoutJson = carousel.layout_json;
    const slides = carousel.slides?.sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    const b = await getBrowser();
    const context = await b.newContext({
        viewport: { width: 1080, height: 1350 },
        deviceScaleFactor: 1,
    });

    try {
        for (const slide of slides) {
            const slideLayout = layoutJson?.slides?.find(
                (s: { position: number }) => s.position === slide.position
            );

            const html = buildSlideHTML(slide, slideLayout, client);
            const page = await context.newPage();

            await page.setContent(html, { waitUntil: 'networkidle' });
            // Wait for fonts to load
            await page.waitForTimeout(1000);

            const screenshot = await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 0, width: 1080, height: 1350 },
            });

            await page.close();

            // Upload preview
            const storagePath = `${carouselId}/preview_${slide.position}.png`;
            await supabase.storage.from('carousel-gen').upload(storagePath, screenshot, {
                contentType: 'image/png',
                upsert: true,
            });

            const { data: urlData } = supabase.storage.from('carousel-gen').getPublicUrl(storagePath);

            await supabase
                .from('slides')
                .update({ preview_url: urlData.publicUrl })
                .eq('id', slide.id);
        }
    } finally {
        await context.close();
    }

    // Log job
    await supabase.from('jobs').insert({
        carousel_id: carouselId,
        type: 'render_preview',
        status: 'completed',
        result: { previews_rendered: slides.length },
    });
}

export function buildSlideHTML(
    slide: Record<string, unknown>,
    layout: Record<string, unknown> | undefined,
    client: Record<string, unknown> | undefined
): string {
    const brandColors = (client?.brand_colors || {}) as Record<string, string>;
    const brandFonts = (client?.brand_fonts || {}) as Record<string, string>;
    const headingFont = brandFonts.heading || 'Inter';
    const bodyFont = brandFonts.body || 'Inter';
    const primary = brandColors.primary || '#1a1a2e';
    const accent = brandColors.accent || '#e94560';

    const safeZone = (layout?.safe_zone || { x: 60, y: 200, width: 960, height: 850 }) as Record<string, number>;
    const textElements = (layout?.text_elements || []) as Array<Record<string, unknown>>;

    const bgUrl = slide.bg_url as string || '';
    const headline = slide.headline as string || '';
    const subheadline = slide.subheadline as string || '';
    const bullets = (slide.bullets || []) as string[];
    const ctaText = slide.cta_text as string || '';
    const logoUrl = (client?.logo_url as string) || '';

    let textHTML = '';

    // Use layout positions if available, otherwise use defaults
    if (textElements.length > 0) {
        for (const el of textElements) {
            const style = `
        position: absolute;
        left: ${el.x}px; top: ${el.y}px; width: ${el.width}px;
        font-family: '${el.font_family || headingFont}', sans-serif;
        font-size: ${el.font_size || 36}px;
        font-weight: ${el.font_weight || 'bold'};
        color: ${el.color || '#ffffff'};
        text-align: ${el.text_align || 'left'};
        line-height: ${el.line_height || 1.3};
      `;

            if (el.type === 'headline') {
                textHTML += `<div style="${style}">${el.content || headline}</div>`;
            } else if (el.type === 'subheadline' && (el.content || subheadline)) {
                textHTML += `<div style="${style}">${el.content || subheadline}</div>`;
            } else if (el.type === 'bullet' && ((el.items as string[])?.length || bullets.length)) {
                const items = (el.items as string[]) || bullets;
                const listHTML = items.map((b: string) => `<li style="margin-bottom: 8px;">• ${b}</li>`).join('');
                textHTML += `<ul style="${style}; list-style: none; padding: 0; margin: 0;">${listHTML}</ul>`;
            } else if (el.type === 'cta' && (el.content || ctaText)) {
                const ctaStyle = `
          ${style};
          background: ${el.bg_color || accent};
          padding: ${el.padding || '14px 32px'};
          border-radius: ${el.border_radius || 8}px;
          display: inline-block;
          text-decoration: none;
        `;
                textHTML += `<div style="${ctaStyle}">${el.content || ctaText}</div>`;
            }
        }
    } else {
        // Default layout
        textHTML = `
      <div style="position: absolute; left: ${safeZone.x + 24}px; top: ${safeZone.y + 24}px; width: ${safeZone.width - 48}px;">
        <h1 style="font-family: '${headingFont}', sans-serif; font-size: 48px; font-weight: bold; color: #fff; margin: 0 0 16px 0; line-height: 1.2;">${headline}</h1>
        ${subheadline ? `<p style="font-family: '${bodyFont}', sans-serif; font-size: 28px; color: rgba(255,255,255,0.9); margin: 0 0 24px 0; line-height: 1.4;">${subheadline}</p>` : ''}
        ${bullets.length ? `<ul style="font-family: '${bodyFont}', sans-serif; font-size: 22px; color: rgba(255,255,255,0.85); list-style: none; padding: 0; margin: 0 0 24px 0;">${bullets.map(b => `<li style="margin-bottom: 10px;">• ${b}</li>`).join('')}</ul>` : ''}
        ${ctaText ? `<div style="display: inline-block; background: ${accent}; color: #fff; font-family: '${headingFont}', sans-serif; font-size: 20px; font-weight: 600; padding: 14px 36px; border-radius: 8px; margin-top: 8px;">${ctaText}</div>` : ''}
      </div>
    `;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1080px; height: 1350px; overflow: hidden; }
  </style>
</head>
<body>
  <div style="position: relative; width: 1080px; height: 1350px; background: ${primary};">
    <!-- Background image -->
    ${bgUrl ? `<img src="${bgUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous" />` : ''}

    <!-- Safe zone overlay for contrast -->
    <div style="position: absolute; left: ${safeZone.x}px; top: ${safeZone.y}px; width: ${safeZone.width}px; height: ${safeZone.height}px; background: rgba(0,0,0,0.45); border-radius: 12px;"></div>

    <!-- Text elements -->
    ${textHTML}

    <!-- Logo -->
    ${logoUrl ? `<img src="${logoUrl}" style="position: absolute; top: 40px; left: 40px; width: 100px; height: auto; max-height: 100px; object-fit: contain;" crossorigin="anonymous" />` : ''}
  </div>
</body>
</html>`;
}
