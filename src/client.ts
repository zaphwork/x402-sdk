/**
 * ZaphWork Client
 * 
 * Main SDK client for interacting with ZaphWork platform.
 * Handles authentication, session management, and API calls.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  ZaphWorkConfig,
  Task,
  Gig,
  GigOrder,
  Job,
  WalletBalance,
  CreateTaskParams,
  CreateGigParams,
  SubmitWorkParams,
  ListTasksParams,
} from './types';
import {
  ZaphWorkError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from './errors';

export class ZaphWorkClient {
  private apiUrl: string;
  private keypair: Keypair;
  private network: 'devnet' | 'mainnet-beta';
  private sessionCookie?: string;
  private authenticated: boolean = false;
  private useX402: boolean = false; // Use x402 payment protocol
  private platformWallet?: string; // Platform wallet for x402 payments

  constructor(config: ZaphWorkConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.network = config.network || 'devnet';
    this.useX402 = config.useX402 || false;
    this.platformWallet = config.platformWallet;
    
    // Parse private key
    try {
      const secretKey = bs58.decode(config.privateKey);
      this.keypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      throw new ValidationError('Invalid private key format. Expected base58-encoded string.');
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Authenticate with ZaphWork using wallet signature
   */
  async authenticate(): Promise<void> {
    try {
      const walletAddress = this.getAddress();
      
      // Step 1: Connect wallet (creates user if doesn't exist)
      const connectResponse = await fetch(`${this.apiUrl}/api/auth/wallet/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          walletType: 'phantom', // SDK acts like Phantom wallet
        }),
      });

      if (!connectResponse.ok) {
        throw new AuthenticationError('Failed to connect wallet');
      }

      // Step 2: Create session
      const message = `Sign this message to authenticate with ZaphWork.\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const sessionResponse = await fetch(`${this.apiUrl}/api/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          signature: signatureBase58,
          message,
        }),
      });

      if (!sessionResponse.ok) {
        const error = await sessionResponse.json();
        throw new AuthenticationError(error.error || 'Failed to create session');
      }

      // Extract session cookie
      const setCookie = sessionResponse.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/session=([^;]+)/);
        if (match) {
          this.sessionCookie = match[1];
        }
      }

      this.authenticated = true;
    } catch (error) {
      if (error instanceof ZaphWorkError) {
        throw error;
      }
      throw new AuthenticationError(`Authentication failed: ${error}`);
    }
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Check if this is an x402 endpoint
    const isX402Endpoint = endpoint.startsWith('/api/x402/');
    
    if (isX402Endpoint && this.useX402) {
      return this.requestWithX402Payment(endpoint, options);
    }

    // Regular session-based auth
    if (!this.authenticated) {
      await this.authenticate();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.sessionCookie) {
      headers['Cookie'] = `session=${this.sessionCookie}`;
    }

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Session expired, re-authenticate
      this.authenticated = false;
      this.sessionCookie = undefined;
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ZaphWorkError(error.error || `Request failed: ${response.statusText}`, response.status);
    }

    return response.json();
  }

  /**
   * Make x402 payment and request
   */
  private async requestWithX402Payment<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // First, try without payment to get payment requirements
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    if (response.status === 402) {
      // Payment required
      const paymentInfo = await response.json();
      
      // Make payment
      const paymentProof = await this.makeX402Payment(paymentInfo.payment);
      
      // Retry request with payment proof
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-payment-proof': JSON.stringify(paymentProof),
        'x-payment-signature': paymentProof.signature,
        'x-payment-amount': paymentProof.amount.toString(),
        'x-payment-timestamp': paymentProof.timestamp.toString(),
        ...((options.headers as Record<string, string>) || {}),
      };

      const paidResponse = await fetch(`${this.apiUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (!paidResponse.ok) {
        const error = await paidResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new ZaphWorkError(error.error || `Request failed: ${paidResponse.statusText}`, paidResponse.status);
      }

      return paidResponse.json();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ZaphWorkError(error.error || `Request failed: ${response.statusText}`, response.status);
    }

    return response.json();
  }

  /**
   * Make x402 payment to platform wallet
   */
  private async makeX402Payment(paymentInfo: {
    recipient: string;
    amount: string;
    currency: string;
    network: string;
    endpoint: string;
  }): Promise<{
    signature: string;
    amount: number;
    timestamp: number;
    endpoint: string;
  }> {
    // TODO: Implement actual Solana payment transaction
    // For now, this is a placeholder that would need to:
    // 1. Create a USDC transfer transaction to recipient
    // 2. Sign and send the transaction
    // 3. Wait for confirmation
    // 4. Return the transaction signature
    
    throw new ZaphWorkError('x402 payment not yet implemented in SDK. Use regular session auth for now.');
  }

  // ============================================
  // WALLET OPERATIONS
  // ============================================

  /**
   * Get wallet balance (SOL and USDC)
   */
  async getBalance(): Promise<WalletBalance> {
    const response = await this.request<{ balance: WalletBalance }>('/api/wallet/balance');
    return response.balance;
  }

  /**
   * Claim devnet USDC from faucet (devnet only)
   */
  async claimFaucet(): Promise<{ signature: string; amount: number }> {
    if (this.network !== 'devnet') {
      throw new ValidationError('Faucet is only available on devnet');
    }
    return this.request('/api/wallet/claim-usdc-dev', { method: 'POST' });
  }

  // ============================================
  // TASK OPERATIONS
  // ============================================

  /**
   * List tasks
   */
  async listTasks(params?: ListTasksParams): Promise<{ tasks: Task[]; count: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const queryString = query.toString();
    return this.request(`/api/tasks${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task> {
    const response = await this.request<{ task: Task }>(`/api/tasks/${taskId}`);
    return response.task;
  }

  /**
   * Create a new task
   */
  async createTask(params: CreateTaskParams): Promise<Task> {
    const endpoint = this.useX402 ? '/api/x402/tasks' : '/api/tasks/create';
    
    const response = await this.request<{ task: Task }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        category: params.category,
        payment_amount: params.paymentAmount,
        currency: params.currency || 'USDC',
        deadline: params.deadline?.toISOString(),
        workers_needed: params.workersNeeded || 1,
      }),
    });
    return response.task;
  }

  /**
   * Create task via x402 protocol (requires payment per request)
   * This uses /api/x402/tasks endpoint and marks task as x402-created
   */
  async createTaskX402(params: CreateTaskParams): Promise<Task> {
    const response = await this.requestWithX402Payment<{ task: Task }>('/api/x402/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        category: params.category,
        payment_per_task: params.paymentAmount,
        currency: params.currency || 'USDC',
        deadline: params.deadline?.toISOString(),
        workers_needed: params.workersNeeded || 1,
      }),
    });
    return response.task;
  }

  /**
   * Fund a task (creates escrow on blockchain)
   */
  async fundTask(taskId: string): Promise<{ signature: string; escrowAddress: string }> {
    return this.request(`/api/tasks/${taskId}/fund`, { method: 'POST' });
  }

  /**
   * Apply to work on a task
   */
  async applyToTask(taskId: string, message?: string): Promise<{ applicationId: string }> {
    return this.request('/api/tasks/apply', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, message }),
    });
  }

  /**
   * Approve a task application (as client)
   */
  async approveApplication(applicationId: string): Promise<void> {
    await this.request(`/api/tasks/applications/${applicationId}/approve`, {
      method: 'POST',
    });
  }

  /**
   * Submit work for a task (as worker)
   */
  async submitWork(params: SubmitWorkParams): Promise<void> {
    await this.request(`/api/tasks/${params.taskId}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        submission_type: params.submissionType,
        submission_text: params.submissionText,
        submission_url: params.submissionUrl,
      }),
    });
  }

  /**
   * Submit work via x402 protocol (requires payment per submission)
   * This uses /api/x402/submissions endpoint
   */
  async submitWorkX402(params: SubmitWorkParams): Promise<void> {
    await this.requestWithX402Payment('/api/x402/submissions', {
      method: 'POST',
      body: JSON.stringify({
        task_id: params.taskId,
        submission_type: params.submissionType,
        submission_text: params.submissionText,
        submission_url: params.submissionUrl,
      }),
    });
  }

  /**
   * Approve submitted work (as client) - releases escrow payment
   */
  async approveTask(taskId: string): Promise<{ signature: string }> {
    return this.request(`/api/tasks/${taskId}/approve`, { method: 'POST' });
  }

  /**
   * Reject submitted work (as client)
   */
  async rejectTask(taskId: string, reason: string): Promise<void> {
    await this.request(`/api/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Cancel a task and refund escrow (as client)
   */
  async cancelTask(taskId: string): Promise<{ signature?: string }> {
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  // ============================================
  // GIG OPERATIONS
  // ============================================

  /**
   * List gigs
   */
  async listGigs(params?: { category?: string; limit?: number }): Promise<{ gigs: Gig[]; count: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.limit) query.append('limit', params.limit.toString());

    const queryString = query.toString();
    return this.request(`/api/gigs${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get gig by slug
   */
  async getGig(slug: string): Promise<Gig> {
    const response = await this.request<{ gig: Gig }>(`/api/gigs/by-slug/${slug}`);
    return response.gig;
  }

  /**
   * Create a new gig (as worker)
   */
  async createGig(params: CreateGigParams): Promise<Gig> {
    const response = await this.request<{ gig: Gig }>('/api/gigs/create', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        category: params.category,
        price: params.price,
        delivery_time_days: params.deliveryTimeDays,
        currency: params.currency || 'USDC',
      }),
    });
    return response.gig;
  }

  /**
   * Purchase a gig (as client) - creates order
   */
  async purchaseGig(gigId: string): Promise<GigOrder> {
    const response = await this.request<{ order: GigOrder }>('/api/gigs/purchase', {
      method: 'POST',
      body: JSON.stringify({ gig_id: gigId }),
    });
    return response.order;
  }

  /**
   * Fund a gig order (creates escrow)
   */
  async fundGigOrder(orderId: string): Promise<{ signature: string; escrowAddress: string }> {
    return this.request(`/api/gigs/orders/${orderId}/fund`, { method: 'POST' });
  }

  /**
   * Deliver work for gig order (as worker)
   */
  async deliverGigOrder(orderId: string, deliveryUrl: string, notes?: string): Promise<void> {
    await this.request(`/api/gigs/orders/${orderId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ delivery_url: deliveryUrl, notes }),
    });
  }

  /**
   * Approve gig delivery (as client) - releases payment
   */
  async approveGigOrder(orderId: string): Promise<{ signature: string }> {
    return this.request(`/api/gigs/orders/${orderId}/approve`, { method: 'POST' });
  }

  /**
   * Request revision for gig order (as client)
   */
  async requestGigRevision(orderId: string, feedback: string): Promise<void> {
    await this.request(`/api/gigs/orders/${orderId}/revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Wait for task to reach a specific status
   */
  async waitForTaskStatus(
    taskId: string,
    targetStatus: Task['status'],
    timeoutMs: number = 60000,
    pollIntervalMs: number = 2000
  ): Promise<Task> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const task = await this.getTask(taskId);
      if (task.status === targetStatus) {
        return task;
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    throw new ZaphWorkError(`Timeout waiting for task ${taskId} to reach status ${targetStatus}`);
  }

  /**
   * Complete full task flow (create, fund, apply, approve application)
   */
  async createAndFundTask(params: CreateTaskParams): Promise<{ task: Task; escrowAddress: string }> {
    const task = await this.createTask(params);
    const { escrowAddress } = await this.fundTask(task.id);
    return { task: { ...task, escrow_address: escrowAddress }, escrowAddress };
  }
}
