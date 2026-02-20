import IORedis from 'ioredis';

let redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
    if (!redis) {
        const redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
            console.warn('⚠️ REDIS_URL is not defined. Falling back to redis://localhost:6379');
        } else {
            console.log(`🔌 Connecting to Redis at ${redisUrl.split('@').pop()?.split('/')[0] || 'hidden-url'}`);
        }

        redis = new IORedis(redisUrl || 'redis://localhost:6379', {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            // Add a timeout to avoid hanging for a long time during connection attempts
            connectTimeout: 10000,
        });

        redis.on('error', (err) => {
            console.error('❌ Redis connection error:', err.message);
        });
    }
    return redis;
}
