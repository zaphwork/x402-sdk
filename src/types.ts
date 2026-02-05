/**
 * Type definitions for ZaphWork SDK
 */

export interface ZaphWorkConfig {
  /** Base URL of ZaphWork instance (e.g., 'https://zaph.work' or 'http://localhost:3000') */
  apiUrl: string;
  /** Solana private key (base58 encoded) for wallet authentication */
  privateKey: string;
  /** Network: 'devnet' or 'mainnet-beta' */
  network?: 'devnet' | 'mainnet-beta';
  /** Use x402 payment protocol for API calls (requires payment per request) */
  useX402?: boolean;
  /** Platform wallet address for x402 payments */
  platformWallet?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  payment_amount: number;
  currency: string;
  status: 'open' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
  client_id: string;
  worker_id?: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
  escrow_address?: string;
  slug?: string;
}

export interface Gig {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  delivery_time_days: number;
  worker_id: string;
  status: 'active' | 'paused' | 'deleted';
  created_at: string;
  slug: string;
}

export interface GigOrder {
  id: string;
  gig_id: string;
  client_id: string;
  worker_id: string;
  status: 'pending' | 'funded' | 'in_progress' | 'delivered' | 'revision_requested' | 'completed' | 'cancelled';
  amount: number;
  currency: string;
  escrow_address?: string;
  created_at: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  budget_min?: number;
  budget_max?: number;
  currency: string;
  client_id: string;
  status: 'open' | 'filled' | 'closed';
  created_at: string;
  slug: string;
}

export interface WalletBalance {
  sol: number;
  usdc: number;
  usdcDev?: number; // USDC-Dev balance on devnet
  solUsd?: number;
  totalUsd?: number;
  address?: string;
}

export interface CreateTaskParams {
  title: string;
  description: string;
  category: string;
  paymentAmount: number;
  currency?: string;
  deadline?: Date;
  workersNeeded?: number;
}

export interface CreateGigParams {
  title: string;
  description: string;
  category: string;
  price: number;
  deliveryTimeDays: number;
  currency?: string;
}

export interface SubmitWorkParams {
  taskId: string;
  submissionType: 'text' | 'url' | 'file';
  submissionText?: string;
  submissionUrl?: string;
}

export interface ListTasksParams {
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
