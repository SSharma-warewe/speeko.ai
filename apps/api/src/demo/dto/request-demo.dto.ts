import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DEMO_CALLS_PER_DAY,
  DEMO_COUNTRIES,
  DEMO_DIRECTIONS,
  DEMO_INTEGRATION_OPTIONS,
  DEMO_TEAM_SIZES,
  stripDemoPhone,
} from '../demo-form.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Marketing get-demo form payload. Proxied to the integration enqueue endpoint.
 */
export class RequestDemoDto {
  @ApiProperty({ example: 'Alex' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Morgan' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'Acme Health' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;

  @ApiProperty({ example: 'alex@acme.health' })
  @Transform(trimString)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: '+15550102000',
    description: 'Phone number the agent should dial (E.164 preferred)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? stripDemoPhone(value) : value,
  )
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @ApiProperty({ example: 'United States', enum: DEMO_COUNTRIES })
  @Transform(trimString)
  @IsIn(DEMO_COUNTRIES)
  country!: (typeof DEMO_COUNTRIES)[number];

  @ApiProperty({ example: '11–50', enum: DEMO_TEAM_SIZES })
  @Transform(trimString)
  @IsIn(DEMO_TEAM_SIZES)
  teamSize!: (typeof DEMO_TEAM_SIZES)[number];

  @ApiProperty({ example: '50–200', enum: DEMO_CALLS_PER_DAY })
  @Transform(trimString)
  @IsIn(DEMO_CALLS_PER_DAY)
  callsPerDay!: (typeof DEMO_CALLS_PER_DAY)[number];

  @ApiProperty({ enum: DEMO_DIRECTIONS, example: 'outbound' })
  @IsIn(DEMO_DIRECTIONS)
  direction!: (typeof DEMO_DIRECTIONS)[number];

  @ApiProperty({
    type: [String],
    example: ['HubSpot', 'Google Calendar'],
    enum: DEMO_INTEGRATION_OPTIONS,
    isArray: true,
  })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return value;
    }
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter((item) => typeof item === 'string' && item.length > 0);
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DEMO_INTEGRATION_OPTIONS.length)
  @IsIn(DEMO_INTEGRATION_OPTIONS, { each: true })
  integrations!: (typeof DEMO_INTEGRATION_OPTIONS)[number][];
}
