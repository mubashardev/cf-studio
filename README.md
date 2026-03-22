# CF Studio

A blazing-fast, native desktop client for Cloudflare D1 and KV.

[Website](https://cfstudio.dev) • [Portfolio](https://mubashar.dev) • [YouTube](https://youtube.com/@mubashardev)

Managing Cloudflare Edge databases shouldn't require juggling CLI commands or waiting for web dashboards to load. CF Studio provides a sleek, native GUI to manage your D1 databases and KV namespaces directly from your desktop.

The best part? **Zero configuration.** CF Studio automatically detects your local `wrangler` session. Open the app, and your databases are instantly available.

## Installation

Install the latest release of CF Studio with a single command:

**macOS:**
```bash
curl -fsSL https://install.cfstudio.dev | bash
```

**Windows:**
```powershell
irm https://install.cfstudio.dev | iex
```

![Terminal Installer](screenshots/Terminal%20Look.png)

## Features

### D1 Explorer
View schemas, run SQL queries, and manage records in a responsive data grid.

![D1 Database](screenshots/D1%20Database.png)

### R2 Storage Explorer
Manage your R2 buckets, upload files, and explore your objects.

![R2 Buckets](screenshots/R2%20Buckets.png)
![File Upload](screenshots/File%20Upload.png)

### Zero-Touch Auth
Automatically reads your local `wrangler` config. No manual API tokens or keys required.

### KV Manager
Search, add, edit, and delete key-value pairs in real-time.

### Native Performance & Cross-Platform
Built with Rust and Tauri v2 for minimal memory footprint and instant startup. Native binaries for macOS, Windows, and Linux.

## Tech Stack

- **Frontend:** React, Vite, TypeScript
- **Backend:** Rust, Tauri v2
- **UI & Styling:** Tailwind CSS, shadcn/ui
- **Package Manager:** Bun
- **Local State:** SQLite (via sqlx)

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- Cloudflare Wrangler CLI (Authenticated via `wrangler login`)

### Local Development

1. Clone the repository:
    ```bash
    git clone [https://github.com/mubashardev/cf-studio.git](https://github.com/mubashardev/cf-studio.git)
    cd cf-studio
    ```

2.  Install dependencies:

    ```bash
    bun install
    ```

3.  Start the development server:

    ```bash
    bun tauri dev
    ```

## Roadmap

- [x] Initial UI shell and OKLCH theme system
- [x] Wrangler auto-authentication & session logic
- [x] D1 database listing and data grid viewer
- [x] SQL query execution engine
- [x] Interactive Visual Schema (ER Diagram)
- [x] Bulk D1 data Export
- [x] R2 Storage Explorer
- [ ] KV namespace CRUD operations
- More features coming soon


## Contributing

Contributions are always welcome. If you want to add a new feature or fix a bug, please open an issue first to discuss the proposed changes.

## License

[MIT](https://www.google.com/search?q=LICENSE)

-----

Built by [CF Studio](https://cfstudio.dev).
