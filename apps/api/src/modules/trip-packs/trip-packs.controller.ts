import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { TripPack, TripPackProduct } from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  BuyTripPackDto,
  TripPackProductDto,
  TripPackProductsQueryDto,
  UpdateTripPackProductDto,
} from './trip-packs.dto.js';
import { TripPacksService } from './trip-packs.service.js';

/** Trip packs on sale, and the passenger's own packs (ADR-028). */
@ApiTags('trip-packs')
@Controller({ version: '1' })
export class TripPacksController {
  constructor(private readonly packs: TripPacksService) {}

  /** Public: products of the active zones. */
  @Public()
  @Get('trip-pack-products')
  onSale(@Query() query: TripPackProductsQueryDto): Promise<TripPackProduct[]> {
    return this.packs.onSale(query.zoneId);
  }

  @ApiBearerAuth()
  @Post('me/trip-packs')
  buy(
    @Body() body: BuyTripPackDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TripPack> {
    return this.packs.buy(auth, body.productId, meta);
  }

  @ApiBearerAuth()
  @Get('me/trip-packs')
  mine(@CurrentAuth() auth: Authenticated): Promise<TripPack[]> {
    return this.packs.listMine(auth.user.id);
  }

  @ApiBearerAuth()
  @Get('me/trip-packs/:packId')
  one(
    @Param('packId', ParseUUIDPipe) packId: string,
    @CurrentAuth() auth: Authenticated,
  ): Promise<TripPack> {
    return this.packs.getMine(auth.user.id, packId);
  }
}

/** The catalog: platform admins only. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin/trip-pack-products', version: '1' })
export class AdminTripPacksController {
  constructor(private readonly packs: TripPacksService) {}

  @Get()
  catalog(): Promise<TripPackProduct[]> {
    return this.packs.catalog();
  }

  @Post()
  create(
    @Body() body: TripPackProductDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TripPackProduct> {
    return this.packs.createProduct(body, auth, meta);
  }

  @Patch(':productId')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpdateTripPackProductDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TripPackProduct> {
    return this.packs.updateProduct(productId, body, auth, meta);
  }
}
