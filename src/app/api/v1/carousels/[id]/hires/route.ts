import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { success, notFound, badRequest, serverError } from '@/lib/api-helpers';
import { enqueueCarouselJob } from '@/lib/queue';

interface Params {
    params: Promise<{ id: string }>;
}

// POST /api/v1/carousels/:id/hires
export async function POST(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        const { data: carousel, error: fetchError } = await supabase
            .from('carousels')
            .select('id, status')
            .eq('id', id)
            .single();

        if (fetchError || !carousel) return notFound('Carousel');
        if (carousel.status !== 'generated') {
            return badRequest(`Cannot generate hi-res for carousel with status "${carousel.status}". Must be "generated".`);
        }

        const body = await request.json().catch(() => ({}));
        const slideIds = body.slideIds || [];

        const job = await enqueueCarouselJob('render-hires', {
            carouselId: id,
            slideIds: slideIds.length ? slideIds : undefined,
        });

        return success({ jobId: job.id, carouselId: id });
    } catch (err) {
        return serverError(String(err));
    }
}
