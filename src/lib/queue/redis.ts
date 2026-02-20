import IORedis from 'ioredis';

let redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
    if (!redis) {
        const redisUrl = process.env.REDIS_URL;
        const host = process.env.REDISHOST || process.env.REDIS_HOST;
        const port = parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379', 10);
        const password = process.env.REDISPASSWORD || process.env.REDIS_PASSWORD;

        if (redisUrl) {
            console.log(`🔌 Connecting to Redis via URL: ${redisUrl.split('@').pop()?.split('/')[0] || 'hidden-url'}`);
            redis = new IORedis(redisUrl, {
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                connectTimeout: 10000,
                family: 0, // Support both IPv4 and IPv6
            });
        } else if (host) {
            console.log(`🔌 Connecting to Redis via host: ${host}:${port}`);
            redis = new IORedis({
                host,
                port,
                password,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                connectTimeout: 10000,
                family: 0,
            });
        } else {
            console.warn('⚠️ No Redis configuration found (REDIS_URL or REDISHOST). Falling back to localhost:6379');
            redis = new IORedis('redis://localhost:6379', {
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                connectTimeout: 5000,
            });
        }

        redis.on('error', (err) => {
            console.error('❌ Redis connection error:', err.message);
        });

        redis.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });
    }
    return redis;
}
