import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCliDto } from './create-cli.dto';

export class UpdateCliDto extends PartialType(OmitType(CreateCliDto, ['slug'] as const)) {}
