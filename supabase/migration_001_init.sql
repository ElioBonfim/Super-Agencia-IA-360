-- ============================================
-- Supabase Migration: Carousel Generator MVP
-- ============================================

-- 1. clients
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  brand_colors JSONB DEFAULT '{}',
  brand_fonts JSONB DEFAULT '{}',
  instagram_handle TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. projects
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. prompt_templates
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. carousels
CREATE TABLE IF NOT EXISTS public.carousels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'generating', 'generated', 'hires_ready')),
  style_preset TEXT DEFAULT 'modern_clean',
  prompt_template_id UUID REFERENCES public.prompt_templates(id),
  layout_json JSONB,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. slides
CREATE TABLE IF NOT EXISTS public.slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id UUID NOT NULL REFERENCES public.carousels(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position >= 1 AND position <= 10),
  headline TEXT NOT NULL,
  subheadline TEXT,
  bullets JSONB DEFAULT '[]',
  cta_text TEXT,
  cta_url TEXT,
  bg_prompt TEXT,
  bg_url TEXT,
  preview_url TEXT,
  hires_url TEXT,
  layout_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (carousel_id, position)
);

-- 6. assets
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('logo', 'icon', 'pattern', 'photo')),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id UUID NOT NULL REFERENCES public.carousels(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('generate_layout', 'generate_bg', 'render_preview', 'validate', 'render_hires')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  payload JSONB,
  result JSONB,
  attempts SMALLINT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_carousels_project_id ON public.carousels(project_id);
CREATE INDEX IF NOT EXISTS idx_slides_carousel_id ON public.slides(carousel_id);
CREATE INDEX IF NOT EXISTS idx_assets_client_id ON public.assets(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_carousel_id ON public.jobs(carousel_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_carousels_updated_at BEFORE UPDATE ON public.carousels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_slides_updated_at BEFORE UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage buckets (run in Supabase dashboard or via SQL)
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('carousel-gen', 'carousel-gen', true) ON CONFLICT DO NOTHING;

-- Seed prompt templates
INSERT INTO public.prompt_templates (prompt_id, name, objective, template, variables, version) VALUES
(
  'CAROUSEL_BG_V1',
  'Carousel Background Generator',
  'Generate Instagram carousel backgrounds with a clearly empty safe zone for text overlay',
  'You are a professional graphic designer creating Instagram carousel backgrounds.

TASK: Generate a single background image for an Instagram carousel slide.

SPECIFICATIONS:
- Dimensions: 1080 x 1350 pixels (4:5 aspect ratio)
- Style: {{ style }}
- Color palette: primary {{ brand_primary }}, secondary {{ brand_secondary }}, accent {{ brand_accent }}
- Mood: {{ mood }}

CRITICAL REQUIREMENT — SAFE ZONE:
- The {{ safe_zone_position }} {{ safe_zone_pct }}% of the image MUST be visually clean and simple.
- This safe zone will receive text overlays programmatically AFTER generation.
- In the safe zone: use only solid colors, very subtle gradients, or soft blurs. NO text, NO complex patterns, NO busy elements.
- Outside the safe zone: you may use decorative shapes, abstract patterns, gradients, or subtle photographic elements.

DO NOT:
- Include ANY text, letters, numbers, or typography in the image.
- Place busy visual elements in the safe zone.
- Use low-contrast or noisy backgrounds behind where text will go.

OUTPUT: A single 1080x1350 image respecting the above constraints.',
  '["style", "brand_primary", "brand_secondary", "brand_accent", "mood", "safe_zone_position", "safe_zone_pct"]',
  1
),
(
  'LAYOUT_JSON_V1',
  'Carousel Layout JSON Generator',
  'Generate a JSON layout spec defining text positions, sizes, and safe zones for 5 carousel slides',
  'You are a layout engine for Instagram carousels. Generate a JSON layout specification.

INPUT:
- Carousel title: "{{ carousel_title }}"
- Slides: {{ slides_data }}
- Brand fonts: heading = "{{ brand_fonts_heading }}", body = "{{ brand_fonts_body }}"
- Brand colors: primary = "{{ brand_colors_primary }}", secondary = "{{ brand_colors_secondary }}", accent = "{{ brand_colors_accent }}"
- Style preset: "{{ style_preset }}"

OUTPUT: Return ONLY valid JSON with this schema:
{
  "canvas": { "width": 1080, "height": 1350 },
  "slides": [
    {
      "position": 1,
      "safe_zone": { "x": 60, "y": 200, "width": 960, "height": 850 },
      "text_elements": [...],
      "logo": { "x": 40, "y": 40, "width": 120, "height": 120, "position": "top-left" },
      "bg_safe_zone_position": "center",
      "bg_safe_zone_pct": 60
    }
  ]
}

RULES:
- All text_elements MUST be inside the safe_zone boundaries.
- Headline font_size: 36-64px. Subheadline: 24-36px. Bullets: 20-28px. CTA: 18-24px.
- Ensure at least 24px padding from safe_zone edges.
- Alternate layout styles between slides for visual variety.',
  '["carousel_title", "slides_data", "brand_fonts_heading", "brand_fonts_body", "brand_colors_primary", "brand_colors_secondary", "brand_colors_accent", "style_preset"]',
  1
),
(
  'COPY_V1',
  'Carousel Copy Variation Generator',
  'Generate 3 copy variations per slide for A/B testing',
  'You are an expert social media copywriter for Instagram carousels.

CONTEXT:
- Carousel about: "{{ carousel_title }}"
- Context/brief: "{{ carousel_context }}"
- Target audience: {{ target_audience }}
- Brand tone: {{ brand_tone }}
- Current slide: {{ slide_position }} of 5

CURRENT COPY:
- Headline: "{{ current_headline }}"
- Subheadline: "{{ current_subheadline }}"
- Bullets: {{ current_bullets }}

GENERATE 3 VARIATIONS as JSON:
{
  "variations": [
    { "id": "A", "headline": "...", "subheadline": "...", "bullets": ["..."] },
    { "id": "B", "headline": "...", "subheadline": "...", "bullets": ["..."] },
    { "id": "C", "headline": "...", "subheadline": "...", "bullets": ["..."] }
  ]
}

RULES:
- Headline max 60 chars. Subheadline max 100 chars. Bullets max 40 chars each.
- Slide 1: hook. Slides 2-4: value. Slide 5: CTA.',
  '["carousel_title", "carousel_context", "target_audience", "brand_tone", "slide_position", "current_headline", "current_subheadline", "current_bullets"]',
  1
)
ON CONFLICT (prompt_id) DO NOTHING;
