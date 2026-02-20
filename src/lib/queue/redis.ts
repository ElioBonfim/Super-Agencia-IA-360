import IORedis from 'ioredis';

let redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
    if (!redis) {
        redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    }
    return redis;
}
