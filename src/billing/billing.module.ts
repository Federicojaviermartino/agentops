import Stripe from "stripe";
import { Response } from "express";
import { BadRequestException, Body, Controller, Get, Headers, Injectable, Logger, Module, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';

const PLANS: Record<string, { name: string; priceMonthly: number; systemLimit: number; features: string[] }> = {
  FREE: { name: 'Free', priceMonthly: 0, systemLimit: 1, features: ['1 AI System', 'Risk Classification', 'Compliance Checklist', 'Compliance Score', 'Penalty Tracker', 'Community Support'] },
  STARTER: { name: 'Starter', priceMonthly: 19900, systemLimit: 3, features: ['3 AI Systems', 'Classification Agent', 'Basic Findings', 'Documentation Generator', 'Wizard', 'Email Support'] },
  PROFESSIONAL: { name: 'Professional', priceMonthly: 49900, systemLimit: 15, features: ['15 AI Systems', 'All 5 Agents', 'Technical Audit', 'Bias Detection', 'Full Documentation', 'GPAI Detection', 'Sandbox Application', 'Priority Support', 'API Access'] },
  ENTERPRISE: { name: 'Enterprise', priceMonthly: -1, systemLimit: 999, features: ['Unlimited Systems', 'Everything in Professional', 'Custom Agents', 'SSO/SAML', 'Dedicated Support', 'SLA', 'White-label'] },
};


@ApiTags('Billing')

class CheckoutDto { @IsString() plan: string; @IsString() interval: 'month' | 'year'; }

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly stripeConfigured: boolean;

  constructor(private prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripeConfigured = !!key && key !== 'sk_test_placeholder';
    this.stripe = this.stripeConfigured ? new Stripe(key!, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion }) : null;
    if (!this.stripeConfigured) this.logger.warn('Stripe not configured. Set STRIPE_SECRET_KEY for billing features.');
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw new BadRequestException({ message: 'Billing not configured. Set STRIPE_SECRET_KEY in environment.', code: 'STRIPE_NOT_CONFIGURED' });
    return this.stripe;
  }

  async createCheckout(orgId: string, userId: string, plan: string, interval: 'month' | 'year') {
    const stripe = this.requireStripe();
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Organization not found');
    const planConfig = PLANS[plan];
    if (!planConfig || plan === 'ENTERPRISE' || plan === 'FREE') throw new BadRequestException('Invalid plan. Use STARTER or PROFESSIONAL.');
    if (planConfig.priceMonthly <= 0) throw new BadRequestException('Contact sales for Enterprise plan.');

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { organizationId: orgId }, name: org.name });
      customerId = customer.id;
      await this.prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId, mode: 'subscription', payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'eur', product_data: { name: `AgentOps ${planConfig.name}` }, unit_amount: planConfig.priceMonthly, recurring: { interval } }, quantity: 1 }],
      subscription_data: { metadata: { organizationId: orgId, plan } },
      success_url: `${process.env.FRONTEND_URL || 'https://app.agentops.eu'}/settings/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://app.agentops.eu'}/settings/billing?canceled=true`,
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortal(orgId: string) {
    const stripe = this.requireStripe();
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org?.stripeCustomerId) throw new BadRequestException('No active subscription. Subscribe first via /billing/checkout.');
    const session = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${process.env.FRONTEND_URL || 'https://app.agentops.eu'}/settings/billing` });
    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const stripe = this.requireStripe();
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new BadRequestException('STRIPE_WEBHOOK_SECRET not configured');
    const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
    this.logger.log(`Webhook: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const orgId = sub.metadata?.organizationId;
        if (orgId) {
          await this.prisma.organization.update({ where: { id: orgId }, data: { plan: (sub.metadata?.plan || 'STARTER') as any, stripeSubscriptionId: sub.id, stripeSubscriptionStatus: sub.status } });
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const org = await this.prisma.organization.findFirst({ where: { stripeSubscriptionId: sub.id } });
      if (org) { await this.prisma.organization.update({ where: { id: org.id }, data: { plan: 'FREE', stripeSubscriptionStatus: 'canceled', stripeSubscriptionId: null } }); }
    }
  }

  async getStatus(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Not found');
    const plan = PLANS[org.plan] || PLANS.FREE;
    const systemCount = await this.prisma.aiSystem.count({ where: { organizationId: orgId, deletedAt: null } });
    return {
      plan: org.plan, planName: plan.name, status: org.stripeSubscriptionStatus || 'inactive',
      systemLimit: plan.systemLimit, systemsUsed: systemCount, features: plan.features,
      hasActiveSubscription: ['active', 'trialing'].includes(org.stripeSubscriptionStatus || ''),
    };
  }
}

@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @Post('checkout') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles('OWNER', 'ADMIN') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Create Stripe checkout' })
  checkout(@CurrentUser('organizationId') orgId: string, @CurrentUser('id') uid: string, @Body() dto: CheckoutDto) {
    return this.billing.createCheckout(orgId, uid, dto.plan, dto.interval);
  }

  @Post('portal') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles('OWNER', 'ADMIN') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Customer portal' })
  portal(@CurrentUser('organizationId') orgId: string) { return this.billing.createPortal(orgId); }

  @Get('status') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Subscription status' })
  status(@CurrentUser('organizationId') orgId: string) { return this.billing.getStatus(orgId); }

  @Post('webhook') @ApiOperation({ summary: 'Stripe webhook' })
  async webhook(@Req() req: any, @Headers('stripe-signature') sig: string, @Res() res: Response) {
    try { await this.billing.handleWebhook(req.rawBody || Buffer.from(''), sig); res.json({ received: true }); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); }
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
