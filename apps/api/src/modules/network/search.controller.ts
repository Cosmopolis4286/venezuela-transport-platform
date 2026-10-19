import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Departure } from '@vtp/shared-types';
import { Public } from '../identity/auth.decorators.js';
import { DepartureSearchQueryDto } from './network.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('network')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Public: departures between two stops on a local date, sorted by departure time. */
  @Public()
  @Get('departures')
  departures(@Query() query: DepartureSearchQueryDto): Promise<Departure[]> {
    return this.search.departures(query.from, query.to, query.date);
  }
}
