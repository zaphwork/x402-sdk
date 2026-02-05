/**
 * Generate a new Solana wallet for testing
 * 
 * Usage: npx ts-node scripts/generate-wallet.ts
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('🔑 Generating new Solana wallet...\n');

const keypair = Keypair.generate();
const privateKey = bs58.encode(keypair.secretKey);
const publicKey = keypair.publicKey.toBase58();

console.log('✅ Wallet generated!\n');
console.log('Public Key (Wallet Address):');
console.log(publicKey);
console.log('');
console.log('Private Key (base58):');
console.log(privateKey);
console.log('');
console.log('⚠️  IMPORTANT: Save your private key securely!');
console.log('Add to your .env file:');
console.log('');
console.log(`SOLANA_PRIVATE_KEY=${privateKey}`);
console.log('');
console.log('Next steps:');
console.log('1. Fund your wallet with devnet SOL: https://faucet.solana.com');
console.log('2. Use the SDK to claim devnet USDC from ZaphWork faucet');
console.log('3. Start testing!');
