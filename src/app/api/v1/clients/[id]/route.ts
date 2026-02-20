import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { success, notFound, noContent, serverError } from '@/lib/api-helpers';

interface Params {
    params: Promise<{ id: string }>;
}

// GET /api/v1/clients/:id
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return notFound('Client');
        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}

// PATCH /api/v1/clients/:id
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from('clients')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) return serverError(error.message);
        if (!data) return notFound('Client');

        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}

// DELETE /api/v1/clients/:id
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) return serverError(error.message);

        return noContent();
    } catch (err) {
        return serverError(String(err));
    }
}
