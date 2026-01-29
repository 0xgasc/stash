# AETER - Eternal Space for Your Files

**Tagline:** *Eternal space for your files*

AETER is a decentralized storage platform built on Arweave and Irys, offering permanent file storage with simple, transparent pricing. Unlike traditional cloud storage (Google Drive, Dropbox), your files are stored eternally on the Arweave blockchain for 200+ years—no recurring monthly fees.

---

## 🚀 Features

- ✅ **Eternal Storage**: Files stored on Arweave for 200+ years
- ✅ **Decentralized**: No single point of failure, censorship-resistant
- ✅ **Transparent Pricing**: Starting at $5/month for 10GB permanent storage
- ✅ **Large Files**: Support for files up to 6GB
- ✅ **Privacy-First**: Optional encryption, you own your data
- ✅ **Generous Free Tier**: 500MB free storage for 6 months

---

## 📦 Tech Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Storage**: Arweave (via Irys on Base Sepolia)
- **Authentication**: Supabase (optional, not yet implemented)
- **Payments**: Stripe (optional, not yet implemented)

---

## 🏗️ Project Structure

```
aeter/
├── app/
│   ├── api/
│   │   └── upload/
│   │       └── irys/
│   │           └── route.ts          # Irys upload API endpoint
│   ├── components/
│   │   └── UploadInterface.tsx       # File upload component
│   ├── dashboard/
│   │   └── page.tsx                  # File management dashboard
│   ├── pricing/
│   │   └── page.tsx                  # Pricing page
│   ├── upload/
│   │   └── page.tsx                  # Upload page
│   ├── globals.css                   # Global styles
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Homepage
├── .env.local                        # Environment variables (DO NOT COMMIT)
├── .env.example                      # Example environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Install Dependencies

```bash
cd aeter
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Supabase (optional, for user auth & metadata)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Irys Upload (REQUIRED)
PRIVATE_KEY=your_ethereum_private_key_here
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/your_api_key_here

# Stripe (optional, for payments)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
```

**Getting Irys Credentials:**

1. **Private Key**: Any Ethereum wallet private key (NEVER SHARE THIS)
   - Create a new wallet on Base Sepolia testnet
   - Export the private key (without the `0x` prefix)

2. **Sepolia RPC**: Get a free Alchemy API key
   - Sign up at [alchemy.com](https://www.alchemy.com/)
   - Create a new app on "Base Sepolia" network
   - Copy the HTTPS URL

3. **Fund your wallet** with Base Sepolia ETH:
   - Get free testnet ETH from [Alchemy faucet](https://sepoliafaucet.com/)

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## 🎯 Usage

### Upload Files

1. Navigate to `/upload` or click "Upload Now" from homepage
2. Select a file (up to 6GB)
3. Click "Upload to Arweave"
4. Wait for upload to complete
5. Copy the permanent URL to access your file

### View Files

1. Navigate to `/dashboard`
2. View all your uploaded files
3. Download, copy URL, or remove files from dashboard

**Note:** Files remain eternally accessible on Arweave even if removed from your dashboard.

---

## 💰 Pricing Model

| Tier | Storage | Price | Features |
|------|---------|-------|----------|
| **Free** | 500MB | $0 | 6 months on testnet, 25MB/file limit |
| **Starter** | 10GB | $5/mo or $50/yr | Permanent, 100MB/file limit |
| **Pro** | 50GB | $15/mo or $150/yr | Priority uploads, custom domain, 500MB/file |
| **Creator** | 200GB | $30/mo or $300/yr | 3GB video files, NFT API, analytics |
| **Enterprise** | Unlimited | Custom | White-label, SLA, dedicated support |

---

## 🛣️ Roadmap

**MVP (Current)**
- [x] File upload interface
- [x] Irys integration for Arweave storage
- [x] Pricing page with AETER tiers
- [x] Basic dashboard
- [x] AETER branding

**V2 (Next 4 weeks)**
- [ ] Supabase authentication
- [ ] Persistent file storage in database
- [ ] Stripe payment integration
- [ ] File encryption option
- [ ] Tier-based file size limits

**V3 (Next 8 weeks)**
- [ ] NFT metadata API
- [ ] Analytics dashboard
- [ ] Custom domains for Pro tier
- [ ] API access for developers
- [ ] White-label solution for Enterprise

---

## 🤝 Contributing

This is currently a solo project, but contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- Built on [Arweave](https://arweave.org) - Permanent decentralized storage
- Powered by [Irys](https://irys.xyz) - Fast Arweave uploads
- Uses [Base Sepolia](https://base.org) testnet for free storage

---

## 📞 Support

- **Issues**: Open an issue on GitHub
- **Email**: hello@aeter.space (placeholder)
- **Website**: aeter.space (coming soon)

---

## 🚨 Important Notes

1. **Testnet vs Mainnet**: Currently using Base Sepolia (testnet). For production, migrate to Arweave mainnet.
2. **Private Key Security**: NEVER commit your `.env.local` file. Keep your private key secret.
3. **File Permanence**: Once uploaded to Arweave, files CANNOT be deleted. Use with caution.
4. **Free Storage Limitations**: Irys testnet offers 6 months free storage, after which users need to upgrade to paid tiers.

---

**Built with 🌌 for eternal digital permanence**
