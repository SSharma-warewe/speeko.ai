import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const DIRECTIONS = ['outbound', 'inbound', 'both'] as const;

/**
 * Marketing get-demo form payload. Proxied to the integration enqueue endpoint.
 */
export class RequestDemoDto {
  @ApiProperty({ example: 'Alex' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Morgan' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'Acme Health' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;

  @ApiProperty({ example: 'alex@acme.health' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: '+15550102000',
    description: 'Phone number the agent should dial (E.164 preferred)',
  })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ example: 'United States' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country!: string;

  @ApiProperty({ example: '11–50' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  teamSize!: string;

  @ApiProperty({ example: '50–200' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  callsPerDay!: string;

  @ApiProperty({ enum: DIRECTIONS, example: 'outbound' })
  @IsIn(DIRECTIONS)
  direction!: (typeof DIRECTIONS)[number];

  @ApiProperty({
    type: [String],
    example: ['HubSpot', 'Google Calendar'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  integrations!: string[];
}
