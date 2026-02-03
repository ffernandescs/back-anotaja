import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface LocationUpdate {
  type: 'location_update';
  entregadorId: string;
  rotaId: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;
  private redisPub: Redis;
  private redisSub: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'rediss://default:AUEeAAIncDI4NjU4MWYyYWJiNjg0Y2I1YTc0MDZkODY0NGQ0M2YxNHAyMTY2NzA@normal-griffon-16670.upstash.io:6379';

    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redisPub = new Redis(redisUrl);
    this.redisSub = new Redis(redisUrl);

    this.redisClient.on('connect', () => {
      this.logger.log('✅ Redis client connected');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('❌ Redis client error:', err);
    });

    this.redisPub.on('connect', () => {
      this.logger.log('✅ Redis Pub connected');
    });

    this.redisSub.on('connect', () => {
      this.logger.log('✅ Redis Sub connected');
    });
  }

  async publishLocationUpdate(rotaId: string, location: LocationUpdate): Promise<void> {
    const channel = `rota:${rotaId}:location`;
    await this.redisPub.publish(channel, JSON.stringify(location));
    this.logger.debug(`📍 Published location to channel: ${channel}`);
  }

  async subscribeToRoute(rotaId: string, callback: (location: LocationUpdate) => void): Promise<void> {
    const channel = `rota:${rotaId}:location`;
    
    await this.redisSub.subscribe(channel, (err) => {
      if (err) {
        this.logger.error(`Failed to subscribe to ${channel}:`, err);
      } else {
        this.logger.log(`✅ Subscribed to channel: ${channel}`);
      }
    });

    this.redisSub.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const location = JSON.parse(message) as LocationUpdate;
          callback(location);
        } catch (error) {
          this.logger.error('Error parsing location message:', error);
        }
      }
    });
  }

  async unsubscribeFromRoute(rotaId: string): Promise<void> {
    const channel = `rota:${rotaId}:location`;
    await this.redisSub.unsubscribe(channel);
    this.logger.log(`🔕 Unsubscribed from channel: ${channel}`);
  }

  async cacheLastLocation(entregadorId: string, location: LocationUpdate): Promise<void> {
    const key = `entregador:${entregadorId}:last_location`;
    const ttl = 300;
    await this.redisClient.setex(key, ttl, JSON.stringify(location));
    this.logger.debug(`💾 Cached location for entregador: ${entregadorId}`);
  }

  async getLastLocation(entregadorId: string): Promise<LocationUpdate | null> {
    const key = `entregador:${entregadorId}:last_location`;
    const data = await this.redisClient.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as LocationUpdate;
    } catch (error) {
      this.logger.error('Error parsing cached location:', error);
      return null;
    }
  }

  async setEntregadorOnlineStatus(entregadorId: string, isOnline: boolean): Promise<void> {
    const key = `entregador:${entregadorId}:online`;
    if (isOnline) {
      await this.redisClient.setex(key, 60, 'true');
    } else {
      await this.redisClient.del(key);
    }
  }

  async isEntregadorOnline(entregadorId: string): Promise<boolean> {
    const key = `entregador:${entregadorId}:online`;
    const result = await this.redisClient.get(key);
    return result === 'true';
  }

  async cacheRouteTrail(rotaId: string, coordinates: { lat: number; lng: number }[]): Promise<void> {
    const key = `rota:${rotaId}:trail`;
    const ttl = 3600;
    await this.redisClient.setex(key, ttl, JSON.stringify(coordinates));
  }

  async getRouteTrail(rotaId: string): Promise<{ lat: number; lng: number }[]> {
    const key = `rota:${rotaId}:trail`;
    const data = await this.redisClient.get(key);
    
    if (!data) {
      return [];
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      this.logger.error('Error parsing route trail:', error);
      return [];
    }
  }

  async appendToRouteTrail(rotaId: string, coordinate: { lat: number; lng: number }): Promise<void> {
    const trail = await this.getRouteTrail(rotaId);
    trail.push(coordinate);
    
    const maxTrailPoints = 1000;
    if (trail.length > maxTrailPoints) {
      trail.shift();
    }
    
    await this.cacheRouteTrail(rotaId, trail);
  }

  getClient(): Redis {
    return this.redisClient;
  }

  getPubClient(): Redis {
    return this.redisPub;
  }

  getSubClient(): Redis {
    return this.redisSub;
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
    await this.redisPub.quit();
    await this.redisSub.quit();
    this.logger.log('Redis connections closed');
  }
}
