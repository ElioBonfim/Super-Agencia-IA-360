import { Queue } from 'bullmq';
import { getRedisConnection } from './redis';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connection = getRedisConnection() as any;

export const carouselPipelineQueue = new Queue('carousel-pipeline', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    },
});

export type CarouselJobName =
    | 'generate-layout'
    | 'generate-backgrounds'
    | 'render-previews'
    | 'validate'
    | 'render-hires'
    | 'orchestrate';

export interface CarouselJobData {
    carouselId: string;
    slideIds?: string[];
    step?: CarouselJobName;
}

export async function enqueueCarouselJob(
    name: CarouselJobName,
    data: CarouselJobData,
    opts?: { priority?: number; delay?: number }
) {
    return carouselPipelineQueue.add(name, data, {
        priority: opts?.priority ?? 0,
        delay: opts?.delay ?? 0,
    });
}
