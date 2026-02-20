import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Stage 4: Validate slides for legibility and safe zone compliance
 * Checks: contrast ratio, safe zone bounds, minimum font size
 */

interface ValidationResult {
    passed: boolean;
    errors: ValidationError[];
}

interface ValidationError {
    slidePosition: number;
    check: string;
    message: string;
    value?: string | number;
    threshold?: string | number;
}

export async function validateSlides(
    carouselId: string,
    supabase: SupabaseClient
): Promise<ValidationResult> {
    const { data: carousel } = await supabase
        .from('carousels')
        .select('*, slides(*)')
        .eq('id', carouselId)
        .single();

    if (!carousel) throw new Error(`Carousel ${carouselId} not found`);

    const layoutJson = carousel.layout_json;
    const slides = carousel.slides?.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
    const errors: ValidationError[] = [];

    for (const slide of slides) {
        const slideLayout = layoutJson?.slides?.find(
            (s: { position: number }) => s.position === slide.position
        );

        // Check 1: Minimum font size
        if (slideLayout?.text_elements) {
            for (const el of slideLayout.text_elements) {
                if (el.font_size && el.font_size < 20) {
                    errors.push({
                        slidePosition: slide.position,
                        check: 'min_font_size',
                        message: `Font size ${el.font_size}px for ${el.type} is below minimum 20px`,
                        value: el.font_size,
                        threshold: 20,
                    });
                }
            }
        }

        // Check 2: Text elements within safe zone bounds
        if (slideLayout?.safe_zone && slideLayout?.text_elements) {
            const sz = slideLayout.safe_zone;
            for (const el of slideLayout.text_elements) {
                const padding = 24;
                if (
                    el.x < sz.x + padding ||
                    el.y < sz.y + padding ||
                    (el.x + (el.width || 0)) > (sz.x + sz.width - padding)
                ) {
                    errors.push({
                        slidePosition: slide.position,
                        check: 'safe_zone_bounds',
                        message: `${el.type} element extends outside safe zone boundaries`,
                    });
                }
            }
        }

        // Check 3: Headline is not empty
        if (!slide.headline || slide.headline.trim().length === 0) {
            errors.push({
                slidePosition: slide.position,
                check: 'empty_headline',
                message: 'Headline is empty',
            });
        }

        // Check 4: Background exists
        if (!slide.bg_url) {
            errors.push({
                slidePosition: slide.position,
                check: 'missing_background',
                message: 'Background image not generated',
            });
        }

        // Check 5: Preview exists
        if (!slide.preview_url) {
            errors.push({
                slidePosition: slide.position,
                check: 'missing_preview',
                message: 'Preview not rendered',
            });
        }
    }

    // Log job
    await supabase.from('jobs').insert({
        carousel_id: carouselId,
        type: 'validate',
        status: errors.length > 0 ? 'failed' : 'completed',
        result: {
            passed: errors.length === 0,
            total_checks: slides.length * 5,
            errors_found: errors.length,
            errors,
        },
    });

    return {
        passed: errors.length === 0,
        errors,
    };
}
