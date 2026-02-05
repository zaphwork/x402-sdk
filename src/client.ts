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
  private useX402: boolean = false;
  private platformWallet?: string;

  constructor(config: ZaphWorkConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.network = config.network || 'devnet';
    this.useX402 = config.useX402 || false;
    this.platformWallet = config.platformWallet;
    
    try {
      const secretKey = bs58.decode(config.privateKey);
      this.keypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      throw new ValidationError('Invalid private key format. Expected base58-encoded string.');
    }
  }

  getAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  async authenticate(): Promise<void> {
    try {
      const walletAddress = this.getAddress();
      
      const connectResponse = await fetch(`${this.apiUrl}/api/auth/wallet/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          walletType: 'phantom',
        }),
      });

      if (!connectResponse.ok) {
        throw new AuthenticationError('Failed to connect wallet');
      }

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
        const error = await sessionResponse.json() as { error?: string };
        throw new AuthenticationError(error.error || 'Failed to create session');
      }

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

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const isX402Endpoint = endpoint.startsWith('/api/x402/');
    
    if (isX402Endpoint && this.useX402) {
      return this.requestWithX402Payment(endpoint, options);
    }

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
      this.authenticated = false;
      this.sessionCookie = undefined;
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new ZaphWorkError(error.error || `Request failed: ${response.statusText}`, response.status);
    }

    return response.json() as Promise<T>;
  }

  private async requestWithX402Payment<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    if (response.status === 402) {
      const paymentInfo = await response.json() as {
        payment: {
          recipient: string;
          amount: string;
          currency: string;
          network: string;
          endpoint: string;
        };
      };
      
      const paymentProof = await this.makeX402Payment(paymentInfo.payment);
      
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
        const error = await paidResponse.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new ZaphWorkError(error.error || `Request failed: ${paidResponse.statusText}`, paidResponse.status);
      }

      return paidResponse.json() as Promise<T>;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new ZaphWorkError(error.error || `Request failed: ${response.statusText}`, response.status);
    }

    return response.json() as Promise<T>;
  }

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
    throw new ZaphWorkError('x402 payment not yet implemented in SDK. Use regular session auth for now.');
  }

  async getBalance(): Promise<WalletBalance> {
    const response = await this.request<{ balance: WalletBalance }>('/api/wallet/balance');
    return response.balance;
  }

  async claimFaucet(): Promise<{ signature: string; amount: number }> {
    if (this.network !== 'devnet') {
      throw new ValidationError('Faucet is only available on devnet');
    }
    return this.request('/api/wallet/claim-usdc-dev', { method: 'POST' });
  }

  async listTasks(params?: ListTasksParams): Promise<{ tasks: Task[]; count: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const queryString = query.toString();
    return this.request(`/api/tasks${queryString ? `?${queryString}` : ''}`);
  }

  async getTask(taskId: string): Promise<Task> {
    const response = await this.request<{ task: Task }>(`/api/tasks/${taskId}`);
    return response.task;
  }

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

  async fundTask(taskId: string): Promise<{ signature: string; escrowAddress: string }> {
    return this.request(`/api/tasks/${taskId}/fund`, { method: 'POST' });
  }

  async applyToTask(taskId: string, message?: string): Promise<{ applicationId: string }> {
    return this.request('/api/tasks/apply', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, message }),
    });
  }

  async approveApplication(applicationId: string): Promise<void> {
    await this.request(`/api/tasks/applications/${applicationId}/approve`, {
      method: 'POST',
    });
  }

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

  async approveTask(taskId: string): Promise<{ signature: string }> {
    return this.request(`/api/tasks/${taskId}/approve`, { method: 'POST' });
  }

  async rejectTask(taskId: string, reason: string): Promise<void> {
    await this.request(`/api/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async cancelTask(taskId: string): Promise<{ signature?: string }> {
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  async listGigs(params?: { category?: string; limit?: number }): Promise<{ gigs: Gig[]; count: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.limit) query.append('limit', params.limit.toString());

    const queryString = query.toString();
    return this.request(`/api/gigs${queryString ? `?${queryString}` : ''}`);
  }

  async getGig(slug: string): Promise<Gig> {
    const response = await this.request<{ gig: Gig }>(`/api/gigs/by-slug/${slug}`);
    return response.gig;
  }

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

  async purchaseGig(gigId: string): Promise<GigOrder> {
    const response = await this.request<{ order: GigOrder }>('/api/gigs/purchase', {
      method: 'POST',
      body: JSON.stringify({ gig_id: gigId }),
    });
    return response.order;
  }

  async fundGigOrder(orderId: string): Promise<{ signature: string; escrowAddress: string }> {
    return this.request(`/api/gigs/orders/${orderId}/fund`, { method: 'POST' });
  }

  async deliverGigOrder(orderId: string, deliveryUrl: string, notes?: string): Promise<void> {
    await this.request(`/api/gigs/orders/${orderId}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ delivery_url: deliveryUrl, notes }),
    });
  }

  async approveGigOrder(orderId: string): Promise<{ signature: string }> {
    return this.request(`/api/gigs/orders/${orderId}/approve`, { method: 'POST' });
  }

  async requestGigRevision(orderId: string, feedback: string): Promise<void> {
    await this.request(`/api/gigs/orders/${orderId}/revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

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

  async createAndFundTask(params: CreateTaskParams): Promise<{ task: Task; escrowAddress: string }> {
    const task = await this.createTask(params);
    const { escrowAddress } = await this.fundTask(task.id);
    return { task: { ...task, escrow_address: escrowAddress }, escrowAddress };
  }
}
