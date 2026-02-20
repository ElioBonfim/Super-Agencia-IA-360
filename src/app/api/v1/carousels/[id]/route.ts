import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { success, notFound, noContent, serverError } from '@/lib/api-helpers';

interface Params {
    params: Promise<{ id: string }>;
}

// GET /api/v1/carousels/:id
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        const { data, error } = await supabase
            .from('carousels')
            .select('*, slides(*)')
            .eq('id', id)
            .single();

        if (error || !data) return notFound('Carousel');

        // Sort slides by position
        if (data.slides) {
            data.slides.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
        }

        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}

// PATCH /api/v1/carousels/:id
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();
        const body = await request.json();

        // Only allow updating certain fields
        const allowedFields = ['title', 'style_preset', 'layout_json'];
        const updateData: Record<string, unknown> = {};
        for (const key of allowedFields) {
            if (body[key] !== undefined) updateData[key] = body[key];
        }

        const { data, error } = await supabase
            .from('carousels')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) return serverError(error.message);
        if (!data) return notFound('Carousel');

        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}

// DELETE /api/v1/carousels/:id
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        const { error } = await supabase.from('carousels').delete().eq('id', id);
        if (error) return serverError(error.message);

        return noContent();
    } catch (err) {
        return serverError(String(err));
    }
}
