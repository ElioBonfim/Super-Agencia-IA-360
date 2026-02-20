import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { success, created, badRequest, serverError, parseSearchParams } from '@/lib/api-helpers';

// GET /api/v1/clients
export async function GET(request: NextRequest) {
    try {
        const supabase = createServiceClient();
        const params = parseSearchParams(request.url);

        let query = supabase.from('clients').select('*').order('created_at', { ascending: false });

        if (params.search) {
            query = query.ilike('name', `%${params.search}%`);
        }

        const { data, error } = await query;
        if (error) return serverError(error.message);

        return success(data);
    } catch (err) {
        return serverError(String(err));
    }
}

// POST /api/v1/clients
export async function POST(request: NextRequest) {
    try {
        const supabase = createServiceClient();
        const body = await request.json();

        if (!body.name) return badRequest('name is required');

        const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const { data, error } = await supabase
            .from('clients')
            .insert({
                name: body.name,
                slug,
                logo_url: body.logo_url || null,
                brand_colors: body.brand_colors || {},
                brand_fonts: body.brand_fonts || {},
                instagram_handle: body.instagram_handle || null,
            })
            .select()
            .single();

        if (error) return serverError(error.message);

        return created(data);
    } catch (err) {
        return serverError(String(err));
    }
}
