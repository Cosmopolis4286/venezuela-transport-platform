import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { FILE_STORAGE, LocalFileStorage } from './file-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new LocalFileStorage(config.get('FILE_STORAGE_LOCAL_DIR')),
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
