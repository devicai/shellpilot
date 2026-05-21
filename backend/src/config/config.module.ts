import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './config.loader';
import { EXTENSIONS_TOKEN } from '../providers/extensions.provider';

const config = loadConfig();

@Global()
@Module({
  providers: [
    { provide: CONFIG, useValue: config },
    { provide: EXTENSIONS_TOKEN, useValue: config.extensions.properties },
  ],
  exports: [CONFIG, EXTENSIONS_TOKEN],
})
export class ConfigModule {}
