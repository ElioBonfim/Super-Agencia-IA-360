'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface Slide {
    id: string;
    position: number;
    headline: string;
    preview_url: string | null;
    hires_url: string | null;
}

interface Carousel {
    id: string;
    title: string;
    status: string;
    slides: Slide[];
}

export default function CarouselPreviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [carousel, setCarousel] = useState<Carousel | null>(null);
    const [selectedSlide, setSelectedSlide] = useState<Slide | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        fetchCarousel();
    }, [id]);

    async function fetchCarousel() {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/carousels/${id}`);
            setCarousel(await res.json());
        } finally {
            setLoading(false);
        }
    }

    async function requestHires() {
        setGenerating(true);
        try {
            await fetch(`/api/v1/carousels/${id}/hires`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            // Poll for completion
            const interval = setInterval(async () => {
                const res = await fetch(`/api/v1/carousels/${id}`);
                const data = await res.json();
                if (data.status === 'hires_ready') {
                    clearInterval(interval);
                    setCarousel(data);
                    setGenerating(false);
                }
            }, 3000);
        } catch (e) {
            console.error('Error:', e);
            setGenerating(false);
        }
    }

    async function regenerate() {
        try {
            await fetch(`/api/v1/carousels/${id}/generate`, { method: 'POST' });
            fetchCarousel();
        } catch (e) {
            console.error('Error:', e);
        }
    }

    if (loading) return <div className="empty-state"><p>Carregando...</p></div>;
    if (!carousel) return <div className="empty-state"><p>Carrossel não encontrado</p></div>;

    const hasHires = carousel.status === 'hires_ready';
    const hasGenerated = carousel.status === 'generated' || hasHires;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="breadcrumb">
                        <Link href="/dashboard">Clientes</Link>
                        <span>/</span>
                        <Link href={`/dashboard/carousels/${id}/edit`}>Editor</Link>
                        <span>/</span>
                        <span>Previews</span>
                    </div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href={`/dashboard/carousels/${id}/edit`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                            <ArrowLeft size={24} />
                        </Link>
                        {carousel.title} — Previews
                        <span className={`badge badge-${carousel.status}`}>{carousel.status}</span>
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={regenerate}>
                        <RefreshCw size={16} /> Refazer
                    </button>
                    {hasGenerated && !hasHires && (
                        <button className="btn btn-primary" onClick={requestHires} disabled={generating}>
                            <Download size={16} /> {generating ? 'Gerando Hi-Res...' : 'Gerar Hi-Res'}
                        </button>
                    )}
                    {hasHires && (
                        <Link href={`/api/v1/carousels/${id}/download?format=zip`} className="btn btn-primary">
                            <Download size={16} /> Download ZIP
                        </Link>
                    )}
                </div>
            </div>

            {/* Progress bar for generating state */}
            {carousel.status === 'generating' && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span>Gerando previews...</span>
                        <span className="badge badge-generating">Em andamento</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: '60%' }} />
                    </div>
                </div>
            )}

            {/* Preview grid */}
            <div className="preview-grid" style={{ marginBottom: 32 }}>
                {carousel.slides.map((slide) => (
                    <div
                        key={slide.id}
                        className="preview-item"
                        onClick={() => setSelectedSlide(slide)}
                        style={{ borderColor: selectedSlide?.id === slide.id ? 'var(--accent)' : undefined }}
                    >
                        {slide.preview_url ? (
                            <img src={slide.preview_url} alt={`Slide ${slide.position}`} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                {carousel.status === 'generating' ? '⏳' : slide.position}
                            </div>
                        )}
                        <div className="preview-label">Slide {slide.position}</div>
                        {slide.hires_url && (
                            <div style={{ position: 'absolute', top: 6, right: 6 }}>
                                <CheckCircle size={16} color="var(--success)" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Detail panel */}
            {selectedSlide && (
                <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                    <div style={{ width: 300, flexShrink: 0 }}>
                        {selectedSlide.preview_url ? (
                            <img
                                src={selectedSlide.hires_url || selectedSlide.preview_url}
                                alt={`Slide ${selectedSlide.position}`}
                                style={{ width: '100%', borderRadius: 8 }}
                            />
                        ) : (
                            <div style={{ width: '100%', aspectRatio: '4/5', background: 'var(--bg-tertiary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={24} color="var(--warning)" />
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Slide {selectedSlide.position}</h3>
                        <p style={{ fontWeight: 500, marginBottom: 8 }}>{selectedSlide.headline}</p>

                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                <div className="card" style={{ flex: 1, minWidth: 140, padding: 14 }}>
                                    <div className="form-label">Preview</div>
                                    <span className={`badge ${selectedSlide.preview_url ? 'badge-generated' : 'badge-draft'}`}>
                                        {selectedSlide.preview_url ? '✅ OK' : '❌ Pendente'}
                                    </span>
                                </div>
                                <div className="card" style={{ flex: 1, minWidth: 140, padding: 14 }}>
                                    <div className="form-label">Hi-Res</div>
                                    <span className={`badge ${selectedSlide.hires_url ? 'badge-hires_ready' : 'badge-draft'}`}>
                                        {selectedSlide.hires_url ? '✅ Pronto' : '⏳ Pendente'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {selectedSlide.hires_url && (
                            <a href={selectedSlide.hires_url} download className="btn btn-primary" style={{ marginTop: 16 }}>
                                <Download size={16} /> Download Hi-Res
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
