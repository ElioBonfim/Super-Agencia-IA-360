import IORedis from 'ioredis';

async function testRedis() {
    const redisUrl = process.env.REDIS_URL;
    const host = process.env.REDISHOST || process.env.REDIS_HOST;
    const port = parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDISPASSWORD || process.env.REDIS_PASSWORD;

    console.log('🧪 Starting Redis Connection Test...');
    console.log('Environment variables found:');
    console.log(`- REDIS_URL: ${redisUrl ? 'DEFINED (hidden)' : 'UNDEFINED'}`);
    console.log(`- REDISHOST: ${host || 'UNDEFINED'}`);
    console.log(`- REDISPORT: ${port}`);
    console.log(`- REDISPASSWORD: ${password ? 'DEFINED (hidden)' : 'UNDEFINED'}`);

    let redis: IORedis;

    if (redisUrl) {
        console.log(`🔗 Testing via REDIS_URL: ${redisUrl.split('@').pop()?.split('/')[0]}`);
        redis = new IORedis(redisUrl, { connectTimeout: 5000 });
    } else if (host) {
        console.log(`🔗 Testing via host/port: ${host}:${port}`);
        redis = new IORedis({ host, port, password, connectTimeout: 5000 });
    } else {
        console.log('🔗 Testing via localhost (fallback)');
        redis = new IORedis('redis://localhost:6379', { connectTimeout: 2000 });
    }

    try {
        const start = Date.now();
        await redis.ping();
        console.log(`✅ SUCCESS! Ping latency: ${Date.now() - start}ms`);
        process.exit(0);
    } catch (err: any) {
        console.error('❌ FAILED to connect to Redis!');
        console.error(`Error Code: ${err.code}`);
        console.error(`Error Message: ${err.message}`);

        if (err.code === 'ECONNREFUSED') {
            console.log('\n💡 Troubleshooting Tips:');
            console.log('1. Check if the Redis service is actually running in Railway.');
            console.log('2. If using Internal URL, ensure the App and Redis are in the same project.');
            console.log('3. Try using REDIS_PUBLIC_URL as a fallback to verify network. (Note: use it as REDIS_URL variable)');
        }

        process.exit(1);
    }
}

testRedis();
