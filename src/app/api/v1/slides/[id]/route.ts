import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { success, notFound, serverError } from '@/lib/api-helpers';

interface Params {
    params: Promise<{ id: string }>;
}

// PATCH /api/v1/slides/:id
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();
        const body = await request.json();

        const allowedFields = ['headline', 'subheadline', 'bullets', 'cta_text', 'cta_url', 'layout_overrides'];
        const updateData: Record<string, unknown> = {};
        for (const key of allowedFields) {
            if (body[key] !== undefined) updateData[key] = body[key];
        }

        const { data, error } = await supabase
            .from('slides')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) return serverError(error.message);
        if (!data) return notFound('Slide');

        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}
