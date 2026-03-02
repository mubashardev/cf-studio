# CF Studio

A blazing-fast, native desktop client for Cloudflare D1 and KV.

[Website](https://cfstudio.dev) • [Portfolio](https://mubashar.dev) • [YouTube](https://youtube.com/@mubashardev)

Managing Cloudflare Edge databases shouldn't require juggling CLI commands or waiting for web dashboards to load. CF Studio provides a sleek, native GUI to manage your D1 databases and KV namespaces directly from your desktop.

The best part? **Zero configuration.** CF Studio automatically detects your local `wrangler` session. Open the app, and your databases are instantly available.

## Features

- **Zero-Touch Auth:** Automatically reads your local `wrangler` config. No manual API tokens or keys required.
- **D1 Explorer:** View schemas, run SQL queries, and manage records in a responsive data grid.
- **KV Manager:** Search, add, edit, and delete key-value pairs in real-time.
- **Native Performance:** Built with Rust and Tauri v2 for minimal memory footprint and instant startup.
- **Cross-Platform:** Native binaries for macOS, Windows, and Linux.

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
  - [x] Wrangler auto-authentication logic (Rust)
  - [ ] D1 database listing and table schema viewer
  - [ ] SQL query execution and result grid
  - [ ] KV namespace CRUD operations
  - [ ] Bulk data Export/Import (CSV/JSON)
  - [ ] R2 Storage explorer (Upcoming)

## Contributing

Contributions are always welcome. If you want to add a new feature or fix a bug, please open an issue first to discuss the proposed changes.

## License

[MIT](https://www.google.com/search?q=LICENSE)

-----

Built by [Mubashar Dev](https://mubashar.dev).
