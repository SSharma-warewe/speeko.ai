import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { User } from '../users/user.entity';

/**
 * Tenant hub: owns users, organization agents, SIP trunks, and later phone numbers.
 */
@Entity({ name: 'organizations' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => User, (user) => user.organization)
  users!: User[];

  @OneToMany(() => OrganizationAgent, (oa) => oa.organization)
  organizationAgents!: OrganizationAgent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
