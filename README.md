# CF Studio

A blazing-fast, native desktop client for Cloudflare D1 and R2.

[Website](https://cfstudio.dev) • [Portfolio](https://mubashar.dev) • [YouTube](https://youtube.com/@mubashardev)

## Install

For macOS/Linux:
```bash
curl -fsSL https://install.cfstudio.dev | bash
```

For Windows:
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

## Core Capabilities

CF Studio includes high-tier features for comprehensive management:
- **Bulk Data Export**: Export table data instantly to multiple formats.
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

- [x] Initial UI shell and OKLCH theme system
- [x] Wrangler auto-authentication
- [x] D1 database listing & data grid
- [x] Interactive SQL query engine
- [x] Visual Schema (ER Diagram)
- [x] R2 Storage Explorer
- [x] Bulk D1 data Export
- [x] Interactive Index Management
- [ ] KV namespace CRUD operations

## Contributing

Contributions are welcome! Please open an issue first to discuss any major changes.

## License

[MIT](LICENSE)

-----

Built by [CF Studio](https://cfstudio.dev).
