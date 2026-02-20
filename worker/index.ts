import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createServiceClient } from '../src/lib/supabase/server';

// Import job handlers
import { generateLayout } from './jobs/generateLayout';
import { generateBackgrounds } from './jobs/generateBackgrounds';
import { renderPreviews } from './jobs/renderPreviews';
import { validateSlides } from './jobs/validate';
import { renderHires } from './jobs/renderHires';

const redisUrl = process.env.REDIS_URL;
const host = process.env.REDISHOST || process.env.REDIS_HOST;
const port = parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379', 10);
const password = process.env.REDISPASSWORD || process.env.REDIS_PASSWORD;

function getWorkerConnection(): any {
    if (redisUrl) {
        console.log(`🔌 Worker connecting to Redis via URL: ${redisUrl.split('@').pop()?.split('/')[0] || 'hidden-url'}`);
        return new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            connectTimeout: 10000,
            family: 0,
        });
    } else if (host) {
        console.log(`🔌 Worker connecting to Redis via host: ${host}:${port}`);
        return new IORedis({
            host,
            port,
            password,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            connectTimeout: 10000,
            family: 0,
        });
    } else {
        console.warn('⚠️ Worker: No Redis configuration found. Falling back to localhost:6379');
        return new IORedis('redis://localhost:6379', {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            connectTimeout: 5000,
        });
    }
}

const connection = getWorkerConnection();

connection.on('error', (err: any) => {
    console.error('❌ Worker Redis connection error:', err.message);
});

connection.on('connect', () => {
    console.log('✅ Worker Redis connected successfully');
});

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);

async function orchestrate(job: Job) {
    const { carouselId, step } = job.data;
    const supabase = createServiceClient();

    console.log(`[Orchestrator] Starting for carousel ${carouselId}, step: ${step || 'full-pipeline'}`);

    try {
        // Update carousel to generating
        await supabase.from('carousels').update({ status: 'generating' }).eq('id', carouselId);

        // Step 1: Generate Layout
        await job.updateProgress(10);
        console.log(`[Step 1/5] Generating layout for ${carouselId}`);
        await generateLayout(carouselId, supabase);

        // Step 2: Generate Backgrounds
        await job.updateProgress(30);
        console.log(`[Step 2/5] Generating backgrounds for ${carouselId}`);
        await generateBackgrounds(carouselId, supabase);

        // Step 3: Render Previews
        await job.updateProgress(60);
        console.log(`[Step 3/5] Rendering previews for ${carouselId}`);
        await renderPreviews(carouselId, supabase);

        // Step 4: Validate
        await job.updateProgress(80);
        console.log(`[Step 4/5] Validating slides for ${carouselId}`);
        const validationResult = await validateSlides(carouselId, supabase);

        if (!validationResult.passed) {
            console.log(`[Step 4/5] Validation FAILED for ${carouselId}:`, validationResult.errors);
            await supabase.from('carousels').update({ status: 'draft' }).eq('id', carouselId);
            await supabase.from('jobs').insert({
                carousel_id: carouselId,
                type: 'validate',
                status: 'failed',
                result: { errors: validationResult.errors },
            });
            return { success: false, errors: validationResult.errors };
        }

        // Step 5: Mark as generated
        await job.updateProgress(100);
        await supabase.from('carousels').update({ status: 'generated' }).eq('id', carouselId);

        console.log(`[Orchestrator] Pipeline completed for ${carouselId}`);
        return { success: true };
    } catch (error) {
        console.error(`[Orchestrator] Error for ${carouselId}:`, error);
        await supabase.from('carousels').update({ status: 'draft' }).eq('id', carouselId);
        throw error;
    }
}

async function handleHires(job: Job) {
    const { carouselId, slideIds } = job.data;
    const supabase = createServiceClient();

    console.log(`[Hi-Res] Starting for carousel ${carouselId}`);
    await renderHires(carouselId, supabase, slideIds);
    await supabase.from('carousels').update({ status: 'hires_ready' }).eq('id', carouselId);
    console.log(`[Hi-Res] Completed for ${carouselId}`);
}

// Create worker
const worker = new Worker(
    'carousel-pipeline',
    async (job: Job) => {
        switch (job.name) {
            case 'orchestrate':
                return orchestrate(job);
            case 'render-hires':
                return handleHires(job);
            default:
                throw new Error(`Unknown job name: ${job.name}`);
        }
    },
    {
        connection,
        concurrency: CONCURRENCY,
    }
);

worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} (${job.name}) completed`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} (${job?.name}) failed:`, err.message);
});

worker.on('ready', () => {
    console.log('🚀 Worker ready and listening for jobs');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down worker...');
    await worker.close();
    process.exit(0);
});

console.log('🏗️ Carousel Pipeline Worker starting...');
