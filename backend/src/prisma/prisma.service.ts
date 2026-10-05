import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { dataScopeExtension } from '../data-scope/data-scope.extension.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient().$extends(
      dataScopeExtension,
    ) as unknown as PrismaClient;
    // 通过 Proxy 将模型委托（user / order / $transaction 等）转发到扩展后的客户端，
    // 使既有代码 `this.prisma.xxx` 无需改动即可自动带上店铺隔离。
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (Reflect.has(target, prop)) {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        const value = Reflect.get(target.client, prop, target.client);
        return typeof value === 'function' ? value.bind(target.client) : value;
      },
    }) as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

// 让 PrismaService 类型上拥有扩展客户端的所有模型委托（user / order / $transaction 等）
export interface PrismaService extends PrismaClient {}
