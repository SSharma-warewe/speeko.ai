import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Agent } from './agent.entity';

@Injectable()
export class AgentsRepository {
  constructor(
    @InjectRepository(Agent)
    private readonly repo: Repository<Agent>,
  ) {}

  findById(id: string): Promise<Agent | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByKey(key: string): Promise<Agent | null> {
    return this.repo.findOne({ where: { key } });
  }

  findAllOrderedByKey(): Promise<Agent[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  create(data: DeepPartial<Agent>): Agent {
    return this.repo.create(data);
  }

  save(agent: Agent): Promise<Agent> {
    return this.repo.save(agent);
  }
}
