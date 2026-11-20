import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(workspaceId: string) {
    return this.prisma.agent.findMany({
      where: { workspaceId },
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
    });
  }

  async findOne(id: string, workspaceId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, workspaceId },
    });
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    return agent;
  }

  async create(dto: CreateAgentDto, workspaceId: string) {
    try {
      return await this.prisma.agent.create({
        data: {
          displayName: dto.displayName,
          email: dto.email,
          workspaceId,
        },
      });
    } catch (error) {
      this.throwForDuplicateEmail(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateAgentDto, workspaceId: string) {
    await this.findOne(id, workspaceId);
    try {
      const updated = await this.prisma.agent.updateMany({
        where: { id, workspaceId },
        data: dto,
      });
      if (updated.count !== 1) {
        throw new NotFoundException(`Agent with ID ${id} not found`);
      }
      return this.findOne(id, workspaceId);
    } catch (error) {
      this.throwForDuplicateEmail(error);
      throw error;
    }
  }

  private throwForDuplicateEmail(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('An agent with this email already exists');
    }
  }
}
