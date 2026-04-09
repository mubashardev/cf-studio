# CF Studio

A blazing-fast, native desktop client for Cloudflare D1 and R2.

[Website](https://cfstudio.dev) • [Portfolio](https://mubashar.dev) • [YouTube](https://youtube.com/@mubashardev)

## Install / Update

For macOS/Linux (Bash Terminal):
```bash
curl -fsSL https://install.cfstudio.dev | bash
```

For Windows (PowerShell):
```powershell
irm https://install.cfstudio.dev | iex
```

<div align="center">
  <img src="screenshots/Terminal Look.png" width="800" alt="CF Studio installer in the terminal" />
</div>

Managing Cloudflare Edge databases and storage shouldn't require juggling CLI commands or waiting for web dashboards to load. CF Studio provides a sleek, native GUI to manage your D1 databases and R2 buckets directly from your desktop.

The best part? **Zero configuration.** CF Studio automatically detects your local `wrangler` session. Open the app, and your resources are instantly available.

---

## Features Overview

### R2 Storage Explorer
Complete management of your Cloudflare R2 buckets. Upload, download, and explore your objects with ease.

<div align="center">
  <img src="screenshots/1. R2 Buckets Dark.png" width="800" alt="R2 Buckets List" />
  <p><em>R2 Buckets Management interface</em></p>
</div>

#### Bucket Details & File Uploads
Drill down into any bucket to manage its contents via a native file-explorer experience.

<div align="center">
  <img src="screenshots/1.1. Bucket Details Dark.png" width="400" />
  <img src="screenshots/1.2. File Upload Dark.png" width="400" />
</div>

---

### D1 Database Management
Explore your D1 databases with an intuitive listing and detailed table inspector.

<div align="center">
  <img src="screenshots/2. D1 Databases List Dark.png" width="450" />
  <img src="screenshots/2.1. Database Details Dark.png" width="450" />
</div>

#### Interactive SQL Editor
Run complex queries with a context-aware SQL editor. It suggests table names and columns from your actual schema as you type.

<div align="center">
  <img src="screenshots/2.2. DB SQL Editor Dark.png" width="800" alt="SQL Editor" />
</div>

#### Visual Schema (ER Diagram)
Visualize your database architecture instantly. The interactive ER diagram maps out table relationships and foreign key constraints.

<div align="center">
  <img src="screenshots/2.3. DB Visual Schema Dark.png" width="800" alt="Visual Schema" />
</div>

#### Index Management
Manage your database performance with interactive index management. Create and delete indexes without writing a single line of SQL.

<div align="center">
  <img src="screenshots/2.4. DB Indexes Dark.png" width="450" />
  <img src="screenshots/2.5. New Index Rows Estimate Dark.png" width="450" />
</div>

*Features a **One-time rows read estimate** to prevent heavy performance hits on production databases.*

---

### Audit & Optimization
Comprehensive domain health analysis and one-click optimization reports.

<div align="center">
  <img src="screenshots/3. audit-overview.png" width="800" alt="Audit Overview Report" />
  <p><em>Holistic domain health dashboard with automated scoring</em></p>
</div>

#### Domain Health Posture
Deep-dive into your infrastructure with granular reports on security, performance, and email deliverability.

<div align="center">
  <img src="screenshots/3.1. audit-security-posture.png" width="260" />
  <img src="screenshots/3.2. audit-performance.png" width="260" />
  <img src="screenshots/3.3. audit-email-dns.png" width="260" />
</div>

- **Security Posture**: Automated check for SSL/TLS versions, WAF configurations, and HTTPS rewrites.
- **Performance Benchmarking**: Insights into Brotli compression, HTTP/3, Early Hints, and Tiered Cache.
- **DNS & Email Health**: Verification of SPF and DMARC records to prevent domain spoofing.

#### Professional PDF Export
Generate, view, and save professional audit reports locally. These vector-based PDFs are perfect for sharing with stakeholders or maintaining compliance logs.

<div align="center">
  <img src="screenshots/3.5. audit-pdf-report-sample.png" width="800" alt="PDF Audit Report Sample" />
</div>

---

## Core Capabilities

CF Studio includes high-tier features for comprehensive management:
- **Bulk Data Export**: Export table data instantly to multiple formats.
- **Professional Audit Reports**: Generate vector-based PDF reports for domain health.
- **R2 Bucket Creation & Deletion**: Create and manage R2 buckets natively.
- **Advanced Indexing**: Full interactive control over D1 indexes.

## Tech Stack

- **Frontend:** React, Vite, TypeScript
- **Backend:** Rust, Tauri v2
- **UI & Styling:** Tailwind CSS v4, shadcn/ui
- **Package Manager:** Bun
- **Local State:** SQLite

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- Cloudflare Wrangler CLI (`wrangler login`)

### Local Development

1. Clone the repository:
    ```bash
    git clone https://github.com/mubashardev/cf-studio.git
    cd cf-studio
    ```

2. Install dependencies:
    ```bash
    bun install
    ```

3. Start the development server:
    ```bash
    bun tauri dev
    ```

## Roadmap

<a href="https://cfstudio.dev">CF Studio</a> is evolving rapidly. Here's what has been built and what's on the horizon.

### Core Foundation
- [x] **Native UI Shell**: High-performance desktop experience using Tauri v2.
- [x] **Dynamic Theme System**: Full support for Dark/Light modes with OKLCH color spaces.
- [x] **Zero-Config Auth**: Automatic detection of local `wrangler` sessions for instant access.
- [x] **In-App Updater**: Native update delivery with real-time download progress.

### Database (D1)
- [x] **Interactive Data Grid**: Browse and edit table data with a spreadsheet-like experience.
- [x] **Smart SQL Editor**: Context-aware autocomplete for table and column names.
- [x] **Visual Schema**: Auto-generated ER Diagrams for complex database architectures.
- [x] **Index Architect**: GUI for creating and managing SQL indexes with cost estimation.
- [x] **Bulk Export**: Instant data extraction to multiple portable formats.

### Storage (R2)
- [x] **Object Explorer**: Seamlessly navigate through buckets and folders.
- [x] **Streaming Uploads**: High-speed, multi-part uploads with real-time progress.
- [x] **Bucket Orchestration**: Create, delete, and configure R2 buckets natively.

### Audit & Optimization (Pro)
- [x] **Security Posture Audit**: Automated check for SSL, WAF, and Firewall best practices.
- [x] **Performance Benchmarking**: Insights into Brotli, HTTP/3, and Caching configurations.
- [x] **DNS & Email Health**: Verification of SPF, DKIM, and DMARC records.
- [x] **Vector PDF Reports**: Programmatic generation of professional audit reports.

### _Future Horizons_
- [ ] **KV Namespace CRUD**: Full management for Key-Value storage.
- [ ] **Workers Metrics**: Real-time log streaming and CPU/Memory monitoring.
- [ ] **Vectorize Integration**: Manage vector databases for AI/ML workloads.
- [ ] **Local Simulation**: Integrated Miniflare support for local-first testing.

## Contributing

Contributions are welcome! Please open an issue first to discuss any major changes.

## License

[MIT](LICENSE)

-----

Built by [CF Studio](https://cfstudio.dev).
