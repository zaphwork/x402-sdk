# Instructions to Create x402-sdk GitHub Repo

## Step 1: Create GitHub Repository

1. Go to https://github.com/organizations/zaphwork/repositories/new
   (Or if personal: https://github.com/new)

2. Fill in:
   - **Repository name:** `x402-sdk`
   - **Description:** `TypeScript SDK for ZaphWork x402 protocol - AI-native payments for programmatic access`
   - **Visibility:** Public
   - **DO NOT** initialize with README, .gitignore, or license (we have them)

3. Click "Create repository"

## Step 2: Push SDK Code to New Repo

```bash
# Navigate to x402-sdk directory
cd x402-sdk

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: ZaphWork x402 SDK v0.1.0

- TypeScript client for ZaphWork API
- Wallet-based authentication
- Session auth and x402 payment support
- Complete task/gig flow implementation
- Comprehensive documentation"

# Add remote (replace with actual repo URL)
git remote add origin https://github.com/zaphwork/x402-sdk.git

# Push to main
git branch -M main
git push -u origin main
```

## Step 3: Configure Repository Settings

### Topics/Tags
Add these topics to the repo:
- `solana`
- `x402`
- `typescript`
- `sdk`
- `ai-agents`
- `payments`
- `web3`
- `zaphwork`

### About Section
- **Website:** `https://zaph.work`
- **Description:** `TypeScript SDK for ZaphWork x402 protocol - AI-native payments for programmatic access`

### Branch Protection (Optional but Recommended)
- Protect `main` branch
- Require pull request reviews
- Require status checks to pass

## Step 4: Set Up npm Publishing

### Create npm Account (if needed)
1. Go to https://www.npmjs.com/signup
2. Create account for `zaphwork` organization

### Generate npm Token
1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token"
3. Choose "Automation" type
4. Copy the token

### Add npm Token to GitHub Secrets
1. Go to repo Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click "Add secret"

## Step 5: Publish to npm

### Manual Publish (First Time)
```bash
cd x402-sdk

# Login to npm
npm login

# Publish
npm publish --access public
```

### Automatic Publish (Future Releases)
1. Update version in `package.json`
2. Commit changes
3. Create a GitHub release:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. Go to GitHub → Releases → "Create a new release"
5. Choose the tag, add release notes
6. Publish release
7. GitHub Actions will automatically publish to npm

## Step 6: Update Main ZaphWork Repo

In the main ZaphWork repo, update references:

### Remove x402-sdk folder
```bash
# In main repo root
git rm -r x402-sdk
git commit -m "Move x402-sdk to separate repository"
git push
```

### Update documentation
- Update any docs that reference local `x402-sdk/` path
- Point to `https://github.com/zaphwork/x402-sdk`
- Update installation instructions to use npm

## Step 7: Verify Everything Works

### Test npm Installation
```bash
# In a test directory
npm install @zaphwork/x402-sdk

# Test import
node -e "const { ZaphWorkClient } = require('@zaphwork/x402-sdk'); console.log('SDK loaded successfully');"
```

### Test GitHub Clone
```bash
git clone https://github.com/zaphwork/x402-sdk.git
cd x402-sdk
npm install
npm run build
```

## Step 8: Announce

1. Update ZaphWork website docs
2. Tweet about the SDK release
3. Post in Discord/community channels
4. Update README in main repo to link to SDK

## Checklist

- [ ] GitHub repo created
- [ ] Code pushed to repo
- [ ] Topics/tags added
- [ ] npm account ready
- [ ] npm token added to GitHub secrets
- [ ] Published to npm
- [ ] Removed from main repo
- [ ] Documentation updated
- [ ] Installation tested
- [ ] Announced to community

## Need Help?

- npm publishing: https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry
- GitHub Actions: https://docs.github.com/en/actions
- TypeScript packages: https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html
