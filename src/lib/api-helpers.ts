import { NextResponse } from 'next/server';

export function success(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

export function created(data: unknown) {
    return NextResponse.json(data, { status: 201 });
}

export function noContent() {
    return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(entity = 'Resource') {
    return NextResponse.json({ error: `${entity} not found` }, { status: 404 });
}

export function serverError(message = 'Internal server error') {
    return NextResponse.json({ error: message }, { status: 500 });
}

export function parseSearchParams(url: string) {
    const { searchParams } = new URL(url);
    return Object.fromEntries(searchParams.entries());
}
