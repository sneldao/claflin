// ============================================
// Agent Skills Framework
// ============================================
// Defines skill types and execution framework for agentic applications
// Following Arbitrum's guidance on "everyday utility" for agentic apps

import { Hash, Address, parseUnits } from 'viem';
import { erc8004Service, DelegationScope } from './erc8004';
import { composioService } from './composio';
import type { SkillType } from './types';
export type { SkillType };

// ============================================
// Skill Types
// ============================================

export type SkillStatus = 'idle' | 'pending' | 'executing' | 'completed' | 'failed';

// Base skill result
export interface SkillResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: Date;
}

// Skill execution context
export interface SkillContext {
  skillType: SkillType;
  userId: string;
  userAddress?: Address;
  delegationId?: Hash;
  parameters: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Booking Skill
// ============================================

export interface BookingParams {
  serviceType: 'appointment' | 'consultation' | 'reservation';
  providerId: string;
  providerName: string;
  dateTime: string; // ISO 8601
  duration: number; // minutes
  notes?: string;
  location?: {
    type: 'virtual' | 'in-person';
    address?: string;
    meetingUrl?: string;
  };
}

export interface BookingConfirmation {
  bookingId: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  serviceType: string;
  provider: string;
  dateTime: string;
  duration: number;
  location: {
    type: string;
    address?: string;
    meetingUrl?: string;
  };
  price: {
    amount: string;
    currency: string;
  };
}

export class BookingSkill {
  private provider: string;
  private wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> };

  constructor(provider: string, wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> }) {
    this.provider = provider;
    this.wallet = wallet;
  }

  /**
   * Check delegation permissions for booking
   */
  async checkPermission(delegationId: Hash): Promise<{ allowed: boolean; error?: string }> {
    const result = await erc8004Service.verifyDelegation(delegationId, 'book');
    return { allowed: result.valid, error: result.error };
  }

  /**
   * Create a booking using Composio (OpenTable integration)
   */
  async execute(params: BookingParams): Promise<SkillResult> {
    try {
      // Validate parameters
      if (!params.providerId || !params.dateTime) {
        return {
          success: false,
          error: 'Missing required parameters: providerId or dateTime',
          timestamp: new Date(),
        };
      }

      // Use Composio to make reservation via OpenTable
      const result = await composioService.executeTool({
        tool_slug: 'OPENTABLE_MAKE_RESERVATION',
        arguments: {
          restaurant_id: params.providerId,
          date: params.dateTime,
          time: params.dateTime,
          party_size: 2, // Default party size
          name: 'Claflin caller', // Could be obtained from user profile
          phone: '+1234567890', // Could be obtained from user profile
          special_requests: params.notes || '',
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to make reservation',
          timestamp: new Date(),
        };
      }

      const confirmation: BookingConfirmation = {
        bookingId: result.data?.reservation_id || `opentable_${Date.now()}`,
        status: 'confirmed',
        serviceType: params.serviceType,
        provider: params.providerName,
        dateTime: params.dateTime,
        duration: params.duration,
        location: params.location || { type: 'in-person' },
        price: {
          amount: result.data?.price || '0.00',
          currency: 'USD',
        },
      };

      return {
        success: true,
        data: { 
          booking: confirmation,
          opentable_data: result.data,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Booking failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Cancel a booking
   */
  async cancel(bookingId: string): Promise<SkillResult> {
    return {
      success: false,
      error: 'Booking cancellation is not available — no booking provider is connected.',
      timestamp: new Date(),
    };
  }

  /**
   * List bookings for a user
   */
  async list(_userId: string): Promise<SkillResult> {
    return {
      success: false,
      error: 'Booking history is not available — no booking provider is connected.',
      timestamp: new Date(),
    };
  }
}

// ============================================
// Ordering Skill
// ============================================

export interface OrderParams {
  vendorId: string;
  vendorName: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: string;
  }>;
  deliveryAddress?: {
    street: string;
    city: string;
    zipCode: string;
    country: string;
  };
  specialInstructions?: string;
  paymentMethod?: 'crypto' | 'card';
}

export interface OrderConfirmation {
  orderId: string;
  status: 'confirmed' | 'processing' | 'shipped' | 'delivered';
  vendor: string;
  items: Array<{
    name: string;
    quantity: number;
    price: string;
  }>;
  subtotal: string;
  tax: string;
  total: string;
  deliveryAddress?: {
    street: string;
    city: string;
    zipCode: string;
    country: string;
  };
  estimatedDelivery?: string;
}

export class OrderingSkill {
  private wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> };

  constructor(wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> }) {
    this.wallet = wallet;
  }

  /**
   * Check delegation permissions for ordering
   */
  async checkPermission(delegationId: Hash): Promise<{ allowed: boolean; error?: string }> {
    const result = await erc8004Service.verifyDelegation(delegationId, 'order');
    return { allowed: result.valid, error: result.error };
  }

  /**
   * Create an order using Composio (Uber/DoorDash integration)
   */
  async execute(params: OrderParams): Promise<SkillResult> {
    try {
      if (!params.vendorId || !params.items || params.items.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: vendorId or items',
          timestamp: new Date(),
        };
      }

      // Determine order type based on items
      const isRide = params.items.some(item => 
        item.name.toLowerCase().includes('ride') || 
        item.name.toLowerCase().includes('uber')
      );

      if (isRide) {
        // Request Uber ride
        const result = await composioService.executeTool({
          tool_slug: 'UBER_REQUEST_RIDE',
          arguments: {
            pickup_address: params.deliveryAddress || 'Current Location',
            dropoff_address: params.vendorName, // Vendor name is actually destination
            ride_type: 'uberx', // Default ride type
          },
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to request ride',
            timestamp: new Date(),
          };
        }

        return {
          success: true,
          data: { 
            ride: result.data,
            confirmation_code: result.data?.confirmation_code,
          },
          timestamp: new Date(),
        };
      } else {
        // Place food delivery order via DoorDash
        const result = await composioService.executeTool({
          tool_slug: 'DOORDASH_PLACE_ORDER',
          arguments: {
            restaurant_id: params.vendorId,
            items: params.items.map(item => ({
              item_id: item.name,
              quantity: item.quantity,
              special_instructions: '',
            })),
            delivery_address: params.deliveryAddress,
            delivery_time: 'asap',
          },
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to place order',
            timestamp: new Date(),
          };
        }

        const orderId = result.data?.order_id || `doordash_${Date.now()}`;
        
        // Calculate totals (if not provided by DoorDash)
        const subtotal = params.items.reduce(
          (sum, item) => sum + Number(item.price) * item.quantity,
          0
        );
        const tax = subtotal * 0.08; // 8% tax
        const total = subtotal + tax;

        const confirmation: OrderConfirmation = {
          orderId,
          status: 'confirmed',
          vendor: params.vendorName,
          items: params.items.map(({ name, quantity, price }) => ({ name, quantity, price })),
          subtotal: result.data?.subtotal || subtotal.toFixed(2),
          tax: result.data?.tax || tax.toFixed(2),
          total: result.data?.total || total.toFixed(2),
          deliveryAddress: params.deliveryAddress,
          estimatedDelivery: result.data?.estimated_delivery || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        };

        return {
          success: true,
          data: { 
            order: confirmation,
            doordash_data: result.data,
          },
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Order failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Track an order
   */
  async track(orderId: string): Promise<SkillResult> {
    return {
      success: false,
      error: 'Order tracking is not available — no ordering provider is connected.',
      timestamp: new Date(),
    };
  }
}

// ============================================
// Scheduling Skill
// ============================================

export interface ScheduleParams {
  eventType: 'reminder' | 'meeting' | 'call' | 'task';
  title: string;
  description?: string;
  dateTime: string;
  duration?: number; // minutes
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  reminderBefore?: number; // minutes
  attendees?: string[];
  location?: string;
}

export interface ScheduleConfirmation {
  scheduleId: string;
  eventType: string;
  title: string;
  dateTime: string;
  duration: number;
  repeat: string;
  attendees: string[];
  reminders: number[];
}

export class SchedulingSkill {
  private wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> };

  constructor(wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> }) {
    this.wallet = wallet;
  }

  /**
   * Check delegation permissions for scheduling
   */
  async checkPermission(delegationId: Hash): Promise<{ allowed: boolean; error?: string }> {
    const result = await erc8004Service.verifyDelegation(delegationId, 'schedule');
    return { allowed: result.valid, error: result.error };
  }

  /**
   * Create a scheduled item using Google Calendar via Composio
   */
  async execute(params: ScheduleParams): Promise<SkillResult> {
    try {
      if (!params.title || !params.dateTime) {
        return {
          success: false,
          error: 'Missing required parameters: title or dateTime',
          timestamp: new Date(),
        };
      }

      // Create event in Google Calendar
      const result = await composioService.executeTool({
        tool_slug: 'GOOGLE_CALENDAR_CREATE_EVENT',
        arguments: {
          summary: params.title,
          description: params.description || '',
          start: {
            dateTime: params.dateTime,
            timeZone: 'UTC',
          },
          end: {
            dateTime: new Date(new Date(params.dateTime).getTime() + (params.duration || 30) * 60000).toISOString(),
            timeZone: 'UTC',
          },
          attendees: params.attendees?.map(email => ({ email })) || [],
          reminders: {
            useDefault: false,
            overrides: params.reminderBefore ? [
              { method: 'email', minutes: params.reminderBefore },
              { method: 'popup', minutes: params.reminderBefore },
            ] : [],
          },
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to create calendar event',
          timestamp: new Date(),
        };
      }

      const scheduleId = result.data?.id || `gcal_${Date.now()}`;
      
      const reminders: number[] = [];
      if (params.reminderBefore) {
        reminders.push(params.reminderBefore);
        // Add additional reminders
        if (params.reminderBefore >= 60) reminders.push(params.reminderBefore / 2);
        if (params.reminderBefore >= 1440) reminders.push(1440); // 1 day before
      }

      const confirmation: ScheduleConfirmation = {
        scheduleId,
        eventType: params.eventType,
        title: params.title,
        dateTime: params.dateTime,
        duration: params.duration || 30,
        repeat: params.repeat || 'none',
        attendees: params.attendees || [],
        reminders,
      };

      return {
        success: true,
        data: { 
          schedule: confirmation,
          google_calendar_event: result.data,
          event_link: result.data?.htmlLink,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scheduling failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * List schedules for a user from Google Calendar
   */
  async list(userId: string, startDate?: string, endDate?: string): Promise<SkillResult> {
    try {
      const result = await composioService.executeTool({
        tool_slug: 'GOOGLE_CALENDAR_LIST_EVENTS',
        arguments: {
          timeMin: startDate || new Date().toISOString(),
          timeMax: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime',
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to list calendar events',
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        data: {
          schedules: result.data?.items || [],
          period: { start: startDate, end: endDate },
          total_count: result.data?.items?.length || 0,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list schedules',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Cancel/delete a scheduled item from Google Calendar
   */
  async cancel(scheduleId: string): Promise<SkillResult> {
    try {
      const result = await composioService.executeTool({
        tool_slug: 'GOOGLE_CALENDAR_DELETE_EVENT',
        arguments: {
          eventId: scheduleId,
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to delete calendar event',
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        data: { 
          cancelled: true, 
          scheduleId,
          message: 'Event deleted successfully',
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancellation failed',
        timestamp: new Date(),
      };
    }
  }
}

// ============================================
// Research Skill
// ============================================

export interface ResearchParams {
  query: string;
  sources?: string[];
  maxResults?: number;
  includeSummary?: boolean;
  filters?: {
    dateRange?: { start: string; end: string };
    topics?: string[];
  };
}

export interface ResearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    source: string;
    snippet?: string;
    publishedDate?: string;
  }>;
  summary?: string;
  totalResults: number;
}

export class ResearchSkill {
  private apiKey: string;

  constructor(_wallet: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> }) {
    this.apiKey =
      process.env.FIRECRAWL_API_KEY ||
      process.env.TAVILY_API_KEY ||
      process.env.SANDBASE_API_KEY ||
      '';
  }

  /**
   * Check delegation permissions for research
   */
  async checkPermission(delegationId: Hash): Promise<{ allowed: boolean; error?: string }> {
    const result = await erc8004Service.verifyDelegation(delegationId, 'research');
    return { allowed: result.valid, error: result.error };
  }

  /**
   * Execute research query via Firecrawl Search API (falls back to Tavily)
   */
  async execute(params: ResearchParams): Promise<SkillResult> {
    try {
      if (!params.query) {
        return {
          success: false,
          error: 'Missing required parameter: query',
          timestamp: new Date(),
        };
      }

      if (!this.apiKey) {
        return {
          success: false,
          error: 'No search API key configured. Set FIRECRAWL_API_KEY, TAVILY_API_KEY, or SANDBASE_API_KEY in environment.',
          timestamp: new Date(),
        };
      }

      // Use the Firecrawl path when its native key or a SandBase key exists —
      // SandBase proxies firecrawl/search, so a SandBase-only deployment
      // still takes the Firecrawl shape. Otherwise fall back to Tavily.
      if (process.env.FIRECRAWL_API_KEY || process.env.SANDBASE_API_KEY) {
        return this.executeFirecrawl(params);
      }
      return this.executeTavily(params);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Research failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Research via Firecrawl Search API
   */
  private async executeFirecrawl(params: ResearchParams): Promise<SkillResult> {
    const { firecrawlSearch } = await import('./firecrawl');

    const response = await firecrawlSearch(params.query, {
      limit: params.maxResults || 5,
      scrapeContent: params.includeSummary ?? false,
    });

    const results: ResearchResult['results'] = response.results.map(r => ({
      title: r.title,
      url: r.url,
      source: r.source,
      snippet: r.snippet,
    }));

    const summary = params.includeSummary
      ? `Found ${results.length} results for "${params.query}". ${results.slice(0, 2).map(r => r.snippet).join(' ')}`
      : undefined;

    return {
      success: true,
      data: {
        query: params.query,
        results,
        totalResults: results.length,
        summary,
        provider: response.provider ?? 'native',
      } as unknown as Record<string, unknown>,
      timestamp: new Date(),
    };
  }

  /**
   * Research via Tavily Search API (legacy fallback)
   */
  private async executeTavily(params: ResearchParams): Promise<SkillResult> {
    const maxResults = params.maxResults || 5;
    const sandbaseKey = process.env.SANDBASE_API_KEY || '';
    const sandbaseBase = (
      process.env.SANDBASE_BASE_URL || 'https://api.sandbase.ai'
    ).replace(/\/+$/, '');

    const routes: Array<'native' | 'sandbase'> = [];
    const preferSandbase =
      (process.env.SEARCH_ROUTE_ORDER || '').trim().toLowerCase() === 'sandbase,native';
    for (const route of preferSandbase ? ['sandbase', 'native'] : ['native', 'sandbase']) {
      if (route === 'native' && this.apiKey) routes.push('native');
      if (route === 'sandbase' && sandbaseKey) routes.push('sandbase');
    }

    type TavilyPayload = {
      results: Array<{ title: string; url: string; content: string; score: number }>;
      answer?: string;
    };
    const baseBody = {
      query: params.query,
      max_results: Math.min(20, Math.max(1, maxResults)),
      search_depth: params.includeSummary ? 'advanced' : 'basic',
      include_answer: params.includeSummary ?? false,
    };

    let data: TavilyPayload | undefined;
    let provider: 'native' | 'sandbase' = 'native';
    let lastErr: unknown = new Error('no search route configured');
    for (const route of routes) {
      try {
        const res = await fetch(
          route === 'sandbase'
            ? `${sandbaseBase}/v1/api/tavily/search`
            : 'https://api.tavily.com/search',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(route === 'sandbase'
                ? { Authorization: `Bearer ${sandbaseKey}` }
                : {}),
            },
            body: JSON.stringify(
              route === 'sandbase'
                ? baseBody
                : { ...baseBody, api_key: this.apiKey }
            ),
          }
        );
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${route} search ${res.status}: ${errorText}`);
        }
        const json = (await res.json()) as Record<string, unknown>;
        if (route === 'sandbase') {
          const env2 = json as { status?: string; output?: TavilyPayload };
          if (env2.status !== 'completed' || !env2.output || typeof env2.output !== 'object') {
            throw new Error('SandBase response not completed');
          }
          data = env2.output;
          provider = 'sandbase';
        } else {
          data = json as unknown as TavilyPayload;
          provider = 'native';
        }
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!data) throw lastErr;

    const results: ResearchResult['results'] = data.results.map(r => ({
      title: r.title,
      url: r.url,
      source: new URL(r.url).hostname,
      snippet: r.content,
    }));

    const researchResult = {
      query: params.query,
      results,
      totalResults: results.length,
      summary: data.answer ?? (params.includeSummary
        ? `Found ${results.length} results for "${params.query}".`
        : undefined),
      provider,
    };

    return {
      success: true,
      data: researchResult as unknown as Record<string, unknown>,
      timestamp: new Date(),
    };
  }
}

// ============================================
// Skill Execution Framework
// ============================================

type SkillWallet = {
  account: { address: Address };
  writeContract: (args: unknown) => Promise<Hash>;
};

/** Wallet stub that never pretends to send txs — writeContract always fails honestly. */
function refuseWallet(address?: Address): SkillWallet {
  return {
    account: {
      address: (address || '0x0000000000000000000000000000000000000000') as Address,
    },
    writeContract: async () => {
      throw new Error('On-chain skill writes are not available without a real execution wallet');
    },
  };
}

export class AgentSkillsFramework {
  private wallet: SkillWallet;
  private bookingSkill: BookingSkill;
  private orderingSkill: OrderingSkill;
  private schedulingSkill: SchedulingSkill;
  private researchSkill: ResearchSkill;

  constructor(wallet?: SkillWallet | null) {
    this.wallet = wallet || refuseWallet();
    this.bookingSkill = new BookingSkill('default', this.wallet);
    this.orderingSkill = new OrderingSkill(this.wallet);
    this.schedulingSkill = new SchedulingSkill(this.wallet);
    this.researchSkill = new ResearchSkill(this.wallet);
  }

  /**
   * Execute a skill based on type
   */
  async executeSkill(
    skillType: SkillType,
    params: Record<string, unknown>,
    delegationId?: Hash
  ): Promise<SkillResult> {
    // Check delegation if provided
    if (delegationId) {
      const result = await erc8004Service.verifyDelegation(delegationId, skillType);
      if (!result.valid) {
        return {
          success: false,
          error: result.error || 'Delegation verification failed',
          timestamp: new Date(),
        };
      }
    }

    switch (skillType) {
      case 'book':
        return this.bookingSkill.execute(params as unknown as BookingParams);
      case 'order':
        return this.orderingSkill.execute(params as unknown as OrderParams);
      case 'schedule':
        return this.schedulingSkill.execute(params as unknown as ScheduleParams);
      case 'research':
        return this.researchSkill.execute(params as unknown as ResearchParams);
      default:
        return {
          success: false,
          error: `Unknown skill type: ${skillType}`,
          timestamp: new Date(),
        };
    }
  }

  /**
   * Create a delegation for specific skills
   */
  async createDelegation(
    delegate: Address,
    scope: {
      canBook?: boolean;
      canOrder?: boolean;
      canSchedule?: boolean;
      canResearch?: boolean;
      maxSpend?: bigint;
      expiresInDays?: number;
    }
  ): Promise<{ success: boolean; delegationId?: Hash; error?: string }> {
    const delegationScope: DelegationScope = {
      canBook: scope.canBook || false,
      canOrder: scope.canOrder || false,
      canSchedule: scope.canSchedule || false,
      canResearch: scope.canResearch || false,
      maxSpend: scope.maxSpend || parseUnits('100', 6), // Default 100 USDC max
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + (scope.expiresInDays || 30) * 24 * 60 * 60),
    };

    return erc8004Service.createDelegation(this.wallet, delegate, delegationScope);
  }

  /**
   * Get all skills
   */
  getSkills() {
    return {
      booking: this.bookingSkill,
      ordering: this.orderingSkill,
      scheduling: this.schedulingSkill,
      research: this.researchSkill,
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new skills framework instance.
 * Pass null/undefined for research-only paths with no execution wallet.
 */
export function createSkillsFramework(
  wallet?: { account: { address: Address }; writeContract: (args: any) => Promise<Hash> } | null
) {
  return new AgentSkillsFramework(wallet || null);
}

/**
 * Skill type helpers
 */
export const SKILL_CONFIG = {
  book: {
    name: 'Booking',
    description: 'Book appointments, consultations, and reservations',
    icon: 'calendar',
    color: 'blue',
  },
  order: {
    name: 'Ordering',
    description: 'Order food, products, and services',
    icon: 'shopping-cart',
    color: 'green',
  },
  schedule: {
    name: 'Scheduling',
    description: 'Schedule reminders, meetings, and tasks',
    icon: 'clock',
    color: 'purple',
  },
  research: {
    name: 'Research',
    description: 'Research topics and gather information',
    icon: 'search',
    color: 'orange',
  },
};
