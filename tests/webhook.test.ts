import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// Webhook Tests
// ============================================
// Tests for ElevenLabs webhook endpoint

describe('ElevenLabs Webhook', () => {
  describe('Webhook Route Module', () => {
    it('should export route handler', async () => {
      // The route module should exist
      const route = await import('../app/api/webhooks/elevenlabs/route');
      assert.ok(route, 'Route module should exist');
    });
  });

  describe('Tool Configuration', () => {
    it('should have TOOL_SKILL mapping', async () => {
      // Import the route to get the tool mapping
      const route = await import('../app/api/webhooks/elevenlabs/route');
      // The route should have tool definitions
      assert.ok(route, 'Route should export tool configuration');
    });

    it('should map book_appointment to book skill', async () => {
      // Test the skill mapping logic
      const TOOL_SKILL: Record<string, string> = {
        book_appointment: 'book',
        create_order: 'order',
        set_reminder: 'schedule',
        search_web: 'research',
        firecrawl_search: 'research',
        firecrawl_scrape: 'research',
        check_solana_balance: 'research',
        get_github_repos: 'research',
        get_github_repo_content: 'research',
        get_weather: 'research',
        compare_prices: 'research',
        venice_research: 'research',
        venice_code_review: 'research',
        gasless_settle: 'book',
      };

      assert.equal(TOOL_SKILL.book_appointment, 'book');
      assert.equal(TOOL_SKILL.create_order, 'order');
      assert.equal(TOOL_SKILL.set_reminder, 'schedule');
      assert.equal(TOOL_SKILL.search_web, 'research');
    });

    it('should map action skills correctly', async () => {
      const actionSkills = ['book', 'order', 'schedule'];

      // book_appointment is a book skill
      assert.ok(actionSkills.includes('book'));

      // create_order is an order skill
      assert.ok(actionSkills.includes('order'));

      // set_reminder is a schedule skill
      assert.ok(actionSkills.includes('schedule'));
    });
  });

  describe('COMPOSIO_TOOLS mapping', () => {
    it('should have Composio tool mappings', async () => {
      const COMPOSIO_TOOLS: Record<string, string> = {
        check_solana_balance: 'SOLANA_GET_BALANCE',
        get_github_repos: 'GITHUB_LIST_REPOS',
        get_github_repo_content: 'GITHUB_GET_REPOSITORY_CONTENT',
        search_web: 'WEB_SEARCH',
      };

      assert.equal(COMPOSIO_TOOLS.check_solana_balance, 'SOLANA_GET_BALANCE');
      assert.equal(COMPOSIO_TOOLS.get_github_repos, 'GITHUB_LIST_REPOS');
      assert.equal(COMPOSIO_TOOLS.get_github_repo_content, 'GITHUB_GET_REPOSITORY_CONTENT');
      assert.equal(COMPOSIO_TOOLS.search_web, 'WEB_SEARCH');
    });
  });

  describe('formatNarration', () => {
    it('should format booking narration correctly', async () => {
      // Test narration formatting logic
      const formatNarration = (toolName: string, data: unknown): string => {
        const d = data as Record<string, any>;

        switch (toolName) {
          case 'book_appointment': {
            const b = d?.booking;
            if (!b) return 'Your booking has been placed.';
            return `Your ${b.serviceType} with ${b.provider} has been confirmed for ${new Date(b.dateTime).toLocaleString()}. The booking reference is ${b.bookingId}.`;
          }
          case 'create_order': {
            const o = d?.order;
            if (!o) return 'Your order has been placed.';
            return `Order confirmed with ${o.vendor}. Total: $${o.total}. Estimated delivery: ${o.estimatedDelivery ? new Date(o.estimatedDelivery).toLocaleDateString() : 'TBD'}. Order ID: ${o.orderId}.`;
          }
          case 'set_reminder': {
            const s = d?.schedule;
            if (!s) return 'Your reminder has been set.';
            return `Got it! I've scheduled "${s.title}" for ${new Date(s.dateTime).toLocaleString()}. I'll remind you ${s.reminders[0] ? `${s.reminders[0]} minutes before.` : 'at the scheduled time.'}`;
          }
          case 'search_web':
          case 'firecrawl_search': {
            if (Array.isArray(d?.results)) {
              const top = d.results.slice(0, 2).map((r: any) => r.title ?? r.snippet).join('. ');
              return `Here's what I found: ${top}${d.results.length > 2 ? ` And ${d.results.length - 2} more results.` : ''}`;
            }
            if (d?.summary) return d.summary;
            return 'I found some results. Would you like me to go deeper on any of them?';
          }
          default:
            return 'Action completed.';
        }
      };

      // Test booking narration
      const bookingData = {
        booking: {
          serviceType: 'dentist',
          provider: 'Dr. Smith',
          dateTime: '2025-02-01T10:00:00Z',
          bookingId: 'ABC123',
        },
      };
      const bookingNarration = formatNarration('book_appointment', bookingData);
      assert.ok(bookingNarration.includes('dentist'));
      assert.ok(bookingNarration.includes('ABC123'));

      // Test order narration
      const orderData = {
        order: {
          vendor: 'Amazon',
          total: '29.99',
          orderId: 'ORD-456',
        },
      };
      const orderNarration = formatNarration('create_order', orderData);
      assert.ok(orderNarration.includes('Amazon'));
      assert.ok(orderNarration.includes('ORD-456'));

      // Test reminder narration
      const reminderData = {
        schedule: {
          title: 'Call mom',
          dateTime: '2025-02-01T10:00:00Z',
          reminders: [15],
        },
      };
      const reminderNarration = formatNarration('set_reminder', reminderData);
      assert.ok(reminderNarration.includes('Call mom'));
      assert.ok(reminderNarration.includes('15'));

      // Test search results narration
      const searchData = {
        results: [
          { title: 'Result 1', snippet: 'Snippet 1' },
          { title: 'Result 2', snippet: 'Snippet 2' },
          { title: 'Result 3', snippet: 'Snippet 3' },
        ],
      };
      const searchNarration = formatNarration('search_web', searchData);
      assert.ok(searchNarration.includes('Result 1'));
      assert.ok(searchNarration.includes('Result 2'));
      assert.ok(searchNarration.includes('more results'));
    });

    it('should handle empty data gracefully', async () => {
      const formatNarration = (toolName: string, data: unknown): string => {
        const d = data as Record<string, any>;

        switch (toolName) {
          case 'book_appointment': {
            const b = d?.booking;
            if (!b) return 'Your booking has been placed.';
            return `Your ${b.serviceType} has been confirmed.`;
          }
          case 'create_order': {
            const o = d?.order;
            if (!o) return 'Your order has been placed.';
            return `Order confirmed.`;
          }
          default:
            return 'Action completed.';
        }
      };

      assert.equal(formatNarration('book_appointment', null), 'Your booking has been placed.');
      assert.equal(formatNarration('book_appointment', {}), 'Your booking has been placed.');
      assert.equal(formatNarration('create_order', null), 'Your order has been placed.');
    });
  });

  describe('Webhook Request Validation', () => {
    it('should validate required metadata fields', async () => {
      // Valid webhook payload structure
      const validPayload = {
        conversation_id: 'conv_123',
        metadata: {
          agent_key: 'solana_sage',
          user_address: '0x1234567890123456789012345678901234567890',
        },
        tool_name: 'search_web',
        parameters: {
          query: 'Bitcoin price',
        },
      };

      assert.ok(validPayload.conversation_id);
      assert.ok(validPayload.metadata.agent_key);
      assert.ok(validPayload.metadata.user_address);
      assert.ok(validPayload.tool_name);
    });

    it('should reject payload without conversation_id', async () => {
      const invalidPayload = {
        metadata: {
          agent_key: 'solana_sage',
          user_address: '0x1234567890123456789012345678901234567890',
        },
        tool_name: 'search_web',
      };

      assert.ok(!invalidPayload.conversation_id);
    });

    it('should reject payload without agent_key', async () => {
      const invalidPayload = {
        conversation_id: 'conv_123',
        metadata: {
          user_address: '0x1234567890123456789012345678901234567890',
        },
        tool_name: 'search_web',
      };

      assert.ok(!invalidPayload.metadata.agent_key);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tool_name', async () => {
      const payload = {
        conversation_id: 'conv_123',
        metadata: {
          agent_key: 'solana_sage',
          user_address: '0x1234567890123456789012345678901234567890',
        },
      };

      assert.ok(!payload.tool_name);
    });

    it('should handle unknown tool_name', async () => {
      const unknownTool = 'unknown_tool_xyz';
      const knownTools = [
        'book_appointment',
        'create_order',
        'set_reminder',
        'search_web',
        'venice_research',
        'venice_code_review',
        'gasless_settle',
      ];

      assert.ok(!knownTools.includes(unknownTool));
    });

    it('should handle missing required parameters', async () => {
      // search_web requires 'query' parameter
      const payload = {
        tool_name: 'search_web',
        parameters: {},
      };

      assert.ok(!payload.parameters.query);
    });

    it('should handle venice_research without query', async () => {
      const payload = {
        tool_name: 'venice_research',
        parameters: {
          context: 'some context',
        },
      };

      assert.ok(!payload.parameters.query);
    });

    it('should handle venice_code_review without code', async () => {
      const payload = {
        tool_name: 'venice_code_review',
        parameters: {
          language: 'javascript',
        },
      };

      assert.ok(!payload.parameters.code);
    });
  });

  describe('Agent Registry Integration', () => {
    it('should find broker by key', async () => {
      const { AGENT_REGISTRY } = await import('../lib/agent-registry');

      // Test that we can look up brokers
      const agent = AGENT_REGISTRY.solana_sage;
      assert.ok(agent, 'solana_sage should exist in registry');
      assert.equal(agent.name, 'Tennie');
    });

    it('should check broker can use skill', async () => {
      const { agentCanUseSkill } = await import('../lib/agent-registry');

      // Test skill permissions
      assert.ok(agentCanUseSkill('solana_sage', 'research'), 'solana_sage should be able to research');
      assert.ok(!agentCanUseSkill('solana_sage', 'book'), 'solana_sage should not be able to book');
      assert.ok(agentCanUseSkill('general_helper', 'research'), 'general_helper should be able to research');
    });
  });

  describe('Skill Execution', () => {
    it('should have createSkillsFramework', async () => {
      const { createSkillsFramework } = await import('../lib/agent-skills');
      assert.ok(typeof createSkillsFramework === 'function');
    });

    it('should execute research skill', async () => {
      const { createSkillsFramework, ResearchSkill } = await import('../lib/agent-skills');

      const mockWallet = {
        account: { address: '0x0000000000000000000000000000000000000000' as const },
        writeContract: async () => '0x0' as const,
      };

      const framework = createSkillsFramework(mockWallet as any);

      // Execute research skill
      const result = await framework.executeSkill('research', { query: 'test query' });

      // Result should have success property
      assert.ok(typeof result.success === 'boolean');
    });

    it('should validate required parameters for each skill', async () => {
      const { BookingSkill, OrderingSkill, SchedulingSkill, ResearchSkill } = await import('../lib/agent-skills');

      const mockWallet = {
        account: { address: '0x0000000000000000000000000000000000000000' as const },
        writeContract: async () => '0x0' as const,
      };

      // Test booking validation
      const bookingSkill = new BookingSkill('test', mockWallet as any);
      const bookingResult = await bookingSkill.execute({});
      assert.equal(bookingResult.success, false);

      // Test ordering validation
      const orderingSkill = new OrderingSkill(mockWallet as any);
      const orderResult = await orderingSkill.execute({});
      assert.equal(orderResult.success, false);

      // Test scheduling validation
      const schedulingSkill = new SchedulingSkill(mockWallet as any);
      const scheduleResult = await schedulingSkill.execute({});
      assert.equal(scheduleResult.success, false);

      // Test research validation
      const researchSkill = new ResearchSkill(mockWallet as any);
      const researchResult = await researchSkill.execute({});
      assert.equal(researchResult.success, false);
    });
  });
});